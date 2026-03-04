-- Phase 1: Real-money entry fee + prize pool support

-- 1a. Add columns to aio_competitions (idempotent)
ALTER TABLE aio_competitions
  ADD COLUMN IF NOT EXISTS platform_fee_collected_cents INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS prize_structure JSONB DEFAULT '{"type":"top3","splits":[0.6,0.3,0.1]}';

-- 1b. Extend aio_transactions.type CHECK constraint to include entry_fee + prize_win
-- Drop existing constraint first (if it doesn't already include the new types), recreate with extended values
DO $$
BEGIN
  -- Only drop and recreate if the constraint exists and needs updating
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

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_name = 'aio_transactions'
      AND constraint_type = 'CHECK'
      AND constraint_name = 'aio_transactions_type_check'
  ) THEN
    ALTER TABLE aio_transactions
      ADD CONSTRAINT aio_transactions_type_check
      CHECK (type IN ('deposit', 'withdrawal', 'bet_lock', 'bet_unlock', 'bet_win', 'bet_refund', 'entry_fee', 'prize_win'));
  END IF;
END $$;

-- 1c. RPC: debit_entry_fee
-- Deducts entry fee from user wallet, credits competition prize pool
-- Idempotent: same idempotency_key (stored in provider_ref) = no-op
-- Drop old VOID version first so we can change return type to JSONB
DROP FUNCTION IF EXISTS debit_entry_fee(UUID, UUID, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION debit_entry_fee(
  p_user_id UUID,
  p_competition_id UUID,
  p_amount_cents INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_existing_tx_id UUID;
  v_tx_id UUID;
BEGIN
  -- Idempotency check (idempotency key stored in provider_ref)
  SELECT id INTO v_existing_tx_id
  FROM aio_transactions
  WHERE provider_ref = p_idempotency_key
  LIMIT 1;

  IF v_existing_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object('transaction_id', v_existing_tx_id, 'idempotent', true);
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
  VALUES (v_wallet_id, 'entry_fee', p_amount_cents, 'internal', p_idempotency_key, 'completed')
  RETURNING id INTO v_tx_id;

  -- Increment competition prize pool
  UPDATE aio_competitions
  SET prize_pool = COALESCE(prize_pool, 0) + p_amount_cents
  WHERE id = p_competition_id;

  RETURN jsonb_build_object('transaction_id', v_tx_id, 'idempotent', false);
END;
$$;

-- 1d. RPC: credit_prize_winning
-- Credits prize money to user wallet
-- Idempotent: same idempotency_key (stored in provider_ref) = no-op
-- Drop old VOID version first so we can change return type to JSONB
DROP FUNCTION IF EXISTS credit_prize_winning(UUID, UUID, INTEGER, INTEGER, TEXT);

CREATE OR REPLACE FUNCTION credit_prize_winning(
  p_user_id UUID,
  p_competition_id UUID,
  p_amount_cents INTEGER,
  p_rank INTEGER,
  p_idempotency_key TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_existing_tx_id UUID;
  v_tx_id UUID;
BEGIN
  -- Idempotency check (idempotency key stored in provider_ref)
  SELECT id INTO v_existing_tx_id
  FROM aio_transactions
  WHERE provider_ref = p_idempotency_key
  LIMIT 1;

  IF v_existing_tx_id IS NOT NULL THEN
    RETURN jsonb_build_object('transaction_id', v_existing_tx_id, 'idempotent', true);
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
  INSERT INTO aio_transactions (wallet_id, type, amount_cents, provider, provider_ref, status,
                                 metadata)
  VALUES (v_wallet_id, 'prize_win', p_amount_cents, 'internal', p_idempotency_key, 'completed',
          jsonb_build_object('rank', p_rank, 'competition_id', p_competition_id))
  RETURNING id INTO v_tx_id;

  RETURN jsonb_build_object('transaction_id', v_tx_id, 'idempotent', false);
END;
$$;
