-- Migration 036: CRITICAL — restrict SECURITY DEFINER functions to service_role
--
-- Live-DB audit found all 24 public SECURITY DEFINER functions EXECUTE-able by the
-- `anon` role via the default PUBLIC grant. Because they run with the definer's
-- (postgres) privileges, anyone holding the public anon key (which ships in the
-- frontend bundle) could call them directly over PostgREST /rest/v1/rpc — most
-- critically `credit_wallet`, `debit_wallet_for_withdrawal`, `settle_real_bet`,
-- `credit_prize_winning`, `debit_entry_fee` — to mint or move money into any
-- wallet, entirely bypassing the app and its real-money feature flag. Game/rating
-- functions (aio_upsert_game_leaderboard, aio_update_agent_elo) were likewise
-- callable to forge scores/ratings.
--
-- A `REVOKE ... FROM anon` alone is a no-op while the PUBLIC grant stands, so this
-- revokes from PUBLIC/anon/authenticated and grants EXECUTE back to service_role
-- only. Verified safe:
--   * The frontend makes ZERO direct .rpc() calls.
--   * Every backend RPC uses the service-role client, EXCEPT aio_join_tournament,
--     which is called as the authenticated user — and it is SECURITY INVOKER, so
--     it is not in this set.
--   * No RLS policy references any of these functions (checked pg_policies), so
--     revoking authenticated does not break table access.
--   * Trigger / nested / policy-internal calls do not consult the caller's EXECUTE
--     grant, so triggers and definer-to-definer calls keep working.
--
-- Verified after applying: has_function_privilege('anon'|'authenticated', ...) = 0
-- for all 24; service_role = 24; an anon POST /rest/v1/rpc/credit_wallet now returns
-- 42501 "permission denied for function credit_wallet". Idempotent.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
