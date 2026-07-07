-- Migration 035: pin search_path on public functions
--
-- Clears the Supabase advisor's function_search_path_mutable class: 21 public
-- functions had no fixed search_path, so a SECURITY DEFINER function could
-- resolve an unqualified name against an attacker-controlled schema on the
-- caller's search_path. `public, extensions, pg_temp` preserves current
-- resolution of public tables and extension helpers (e.g. gen_random_uuid in the
-- extensions schema) while making the path non-mutable. Idempotent.
--
-- (The EXECUTE-grant hardening that stops the anon role from calling these
-- functions is migration 036 — a plain `REVOKE ... FROM anon` is NOT enough
-- because the default PUBLIC grant still applies.)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.prokind = 'f'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) c WHERE c LIKE 'search_path=%'
      ))
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public, extensions, pg_temp', r.sig);
  END LOOP;
END $$;
