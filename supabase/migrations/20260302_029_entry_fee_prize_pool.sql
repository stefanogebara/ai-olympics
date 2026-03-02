-- Migration: Entry fee & prize pool system
-- Adds prize settlement columns, new transaction types, and idempotent RPCs

-- 1. Add columns to aio_competitions
ALTER TABLE aio_competitions
  ADD COLUMN IF NOT EXISTS platform_fee_collected_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_structure JSONB DEFAULT '{"type":"top3","splits":[0.6,0.3,0.1]}';

-- 2. Extend aio_transactions type CHECK constraint to include new types
-- Drop the old constraint first, then recreate it with the expanded list
DO $$
BEGIN
  -- Find and drop the existing type check constraint
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'aio_transactions'
      AND constraint_type = 'CHECK'
      AND constraint_name LIKE '%type%'
  ) THEN
    EXECUTE (
      SELECT 'ALTER TABLE aio_transactions DROP CONSTRAINT ' || constraint_name
      FROM information_schema.table_constraints
      WHERE table_name = 'aio_transactions'
        AND constraint_type = 'CHECK'
        AND constraint_name LIKE '%type%'
      LIMIT 1
    );
  END IF;
END $$;

ALTER TABLE aio_transactions
  ADD CONSTRAINT aio_transactions_type_check
  CHECK (type IN ('deposit','withdrawal','bet_lock','bet_unlock','bet_win','bet_refund','entry_fee','prize_win'));

-- 3. RPC: debit_entry_fee
-- Atomically deducts entry fee from wallet and increments competition prize_pool.
-- Idempotent: repeated calls with same key are no-ops.
CREATE OR REPLACE FUNCTION debit_entry_fee(
  p_user_id UUID,
  p_competition_id UUID,
  p_amount_cents INTEGER,
  p_idempotency_key TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_existing_tx_id UUID;
BEGIN
  -- Check idempotency: if transaction already recorded, return immediately
  SELECT id INTO v_existing_tx_id
  FROM aio_transactions
  WHERE provider_ref = p_idempotency_key
  LIMIT 1;

  IF v_existing_tx_id IS NOT NULL THEN
    RETURN; -- already processed
  END IF;

  -- Lock wallet row for this user
  SELECT id INTO v_wallet_id
  FROM aio_wallets
  WHERE user_id = p_user_id
  FOR UPDATE;

  IF v_wallet_id IS NULL THEN
    RAISE EXCEPTION 'Wallet not found for user %', p_user_id;
  END IF;

  -- Check sufficient balance
  IF (SELECT balance_cents FROM aio_wallets WHERE id = v_wallet_id) < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient balance';
  END IF;

  -- Deduct from wallet
  UPDATE aio_wallets
  SET balance_cents = balance_cents - p_amount_cents,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- Record the transaction
  INSERT INTO aio_transactions (wallet_id, type, amount_cents, provider, provider_ref, status)
  VALUES (v_wallet_id, 'entry_fee', p_amount_cents, 'internal', p_idempotency_key, 'completed');

  -- Increment competition prize pool
  UPDATE aio_competitions
  SET prize_pool = COALESCE(prize_pool, 0) + p_amount_cents
  WHERE id = p_competition_id;
END;
$$;

-- 4. RPC: credit_prize_winning
-- Credits winnings to a user's wallet after competition settlement.
-- Idempotent: repeated calls with same key are no-ops.
CREATE OR REPLACE FUNCTION credit_prize_winning(
  p_user_id UUID,
  p_competition_id UUID,
  p_amount_cents INTEGER,
  p_rank INTEGER,
  p_idempotency_key TEXT
) RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_existing_tx_id UUID;
BEGIN
  -- Check idempotency
  SELECT id INTO v_existing_tx_id
  FROM aio_transactions
  WHERE provider_ref = p_idempotency_key
  LIMIT 1;

  IF v_existing_tx_id IS NOT NULL THEN
    RETURN; -- already processed
  END IF;

  -- Get or create wallet
  SELECT id INTO v_wallet_id
  FROM aio_wallets
  WHERE user_id = p_user_id;

  IF v_wallet_id IS NULL THEN
    INSERT INTO aio_wallets (user_id, balance_cents, pending_cents)
    VALUES (p_user_id, 0, 0)
    RETURNING id INTO v_wallet_id;
  END IF;

  -- Credit wallet
  UPDATE aio_wallets
  SET balance_cents = balance_cents + p_amount_cents,
      updated_at = now()
  WHERE id = v_wallet_id;

  -- Record the transaction
  INSERT INTO aio_transactions (wallet_id, type, amount_cents, provider, provider_ref, status)
  VALUES (v_wallet_id, 'prize_win', p_amount_cents, 'internal', p_idempotency_key, 'completed');
END;
$$;
