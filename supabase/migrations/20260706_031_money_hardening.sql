-- Migration: money-path hardening (2026-07-06 audit remediation)
--
-- Forward-only and additive. Fixes two real-money-path defects found in the
-- audit. Real-money features are gated OFF (ENABLE_REAL_MONEY_TRADING), so there
-- should be no existing 'internal' transactions and these apply cleanly; verify
-- against a staging database before enabling real money.
--
-- 1. Entry-fee refunds credited the wallet but NEVER decremented
--    aio_competitions.prize_pool, so settlement distributed money that had
--    already been refunded (the ledger went insolvent on every join->leave).
-- 2. The entry-fee / prize RPCs used aio_transactions.provider_ref for their
--    idempotency check, which has no unique constraint, so two concurrent calls
--    could both pass the check and double-charge / double-credit. They also let
--    a user re-join for free after a refund (the original entry_fee row still
--    matched the idempotency key).

-- ---------------------------------------------------------------------------
-- 1. Partial unique index on provider_ref for internal (entry_fee/prize/refund)
--    transactions. This is the DB-level backstop that makes the pre-lock
--    idempotency SELECT in debit_entry_fee / credit_prize_winning safe: a second
--    concurrent insert with the same key now fails the unique constraint and its
--    whole transaction rolls back, instead of double-charging.
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS idx_aio_transactions_internal_provider_ref
  ON public.aio_transactions (provider_ref)
  WHERE provider = 'internal' AND provider_ref IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2. refund_entry_fee: atomically credit the wallet, decrement the competition
--    prize_pool, and neutralize the original entry_fee ledger row so a re-join
--    is charged again (closing the free-rejoin exploit). Idempotent via the
--    UNIQUE idempotency_key column (reliable, unlike provider_ref alone).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.refund_entry_fee(
  p_user_id UUID,
  p_competition_id UUID,
  p_amount_cents INTEGER,
  p_refund_key TEXT,       -- unique idempotency key for THIS refund
  p_entry_fee_key TEXT     -- provider_ref of the original entry_fee row to neutralize
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Idempotency: if this exact refund was already recorded, do nothing.
  IF EXISTS (SELECT 1 FROM public.aio_transactions WHERE idempotency_key = p_refund_key) THEN
    RETURN;
  END IF;

  -- Lock the wallet row (create if missing).
  SELECT id, balance_cents INTO v_wallet_id, v_balance
    FROM public.aio_wallets
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    INSERT INTO public.aio_wallets (user_id, balance_cents, pending_cents)
      VALUES (p_user_id, 0, 0)
      RETURNING id, balance_cents INTO v_wallet_id, v_balance;
  END IF;

  v_new_balance := v_balance + p_amount_cents;

  UPDATE public.aio_wallets
    SET balance_cents = v_new_balance,
        updated_at = now()
    WHERE id = v_wallet_id;

  -- Record the refund (idempotency_key UNIQUE guarantees single execution even
  -- under concurrency).
  INSERT INTO public.aio_transactions
    (wallet_id, type, amount_cents, balance_after_cents, status, provider, provider_ref, idempotency_key)
    VALUES
    (v_wallet_id, 'bet_refund', p_amount_cents, v_new_balance, 'completed', 'internal', p_refund_key, p_refund_key);

  -- Decrement the prize pool by the refunded amount (never below zero). This is
  -- the core insolvency fix: refunded money leaves the pool it was added to.
  UPDATE public.aio_competitions
    SET prize_pool = GREATEST(COALESCE(prize_pool, 0) - p_amount_cents, 0)
    WHERE id = p_competition_id;

  -- Neutralize the original entry_fee row so a subsequent debit_entry_fee with
  -- the same key does NOT short-circuit as "already processed" (which let the
  -- user re-join for free). Rename its provider_ref and mark it reversed.
  UPDATE public.aio_transactions
    SET provider_ref = p_entry_fee_key || '_refunded',
        status = 'reversed'
    WHERE provider_ref = p_entry_fee_key
      AND type = 'entry_fee';
END;
$$;

-- Follow-ups that require verifying live DB state before applying (documented in
-- SECURITY_CHECKLIST.md), NOT done here to avoid a blind migration:
--   * add FOR UPDATE to settle_real_bet's bet-row SELECT (double-settlement race)
--   * record shares/price on real bets and pay shares*$1 instead of a flat 2x
