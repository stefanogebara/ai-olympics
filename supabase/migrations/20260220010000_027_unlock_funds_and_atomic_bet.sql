-- ============================================
-- 027: Financial Safety Hardening
-- ============================================
-- 1. unlock_funds_for_bet: reverses a bet lock when exchange order fails
-- 2. place_meta_market_bet_atomic: atomic balance check + bet insert (prevents race condition)
-- 3. batch_update_championship_ranks: replaces N+1 rank updates
-- 4. batch_eliminate_championship_bottom: replaces N+1 elimination updates
-- 5. Fix total_profit triggers to use correct post-update values
-- ============================================

-- ============================================
-- 1. UNLOCK FUNDS FOR BET (reverse a lock on exchange failure)
-- ============================================

CREATE OR REPLACE FUNCTION public.unlock_funds_for_bet(
  p_wallet_id UUID,
  p_amount_cents INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_pending INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the wallet row
  SELECT pending_cents, balance_cents INTO v_pending, v_new_balance
    FROM public.aio_wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
  END IF;

  IF v_pending < p_amount_cents THEN
    RAISE EXCEPTION 'Cannot unlock more than pending: pending=% requested=%', v_pending, p_amount_cents;
  END IF;

  v_new_balance := v_new_balance + p_amount_cents;

  UPDATE public.aio_wallets
    SET balance_cents  = v_new_balance,
        pending_cents  = pending_cents - p_amount_cents
    WHERE id = p_wallet_id;

  INSERT INTO public.aio_transactions (wallet_id, type, amount_cents, balance_after_cents, status)
    VALUES (p_wallet_id, 'bet_unlock', p_amount_cents, v_new_balance, 'completed');
END;
$$;

-- ============================================
-- 2. ATOMIC META-MARKET BET PLACEMENT
-- ============================================
-- Prevents race condition: atomically checks balance, deducts, and inserts bet.

CREATE OR REPLACE FUNCTION public.place_meta_market_bet_atomic(
  p_user_id UUID,
  p_market_id UUID,
  p_outcome_id TEXT,
  p_outcome_name TEXT,
  p_amount INTEGER,
  p_odds NUMERIC,
  p_potential_payout NUMERIC
)
RETURNS TABLE(success BOOLEAN, bet_id UUID, new_balance INTEGER, error_msg TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_portfolio_id UUID;
  v_balance INTEGER;
  v_bet_id UUID;
  v_new_balance INTEGER;
BEGIN
  -- Lock and check balance atomically
  SELECT id, virtual_balance INTO v_portfolio_id, v_balance
    FROM public.aio_user_portfolios
    WHERE user_id = p_user_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, NULL::UUID, NULL::INTEGER, 'Portfolio not found'::TEXT;
    RETURN;
  END IF;

  IF v_balance < p_amount THEN
    RETURN QUERY SELECT false, NULL::UUID, v_balance, format('Insufficient balance. Available: M$%s', v_balance)::TEXT;
    RETURN;
  END IF;

  -- Insert bet
  INSERT INTO public.aio_meta_market_bets (
    market_id, user_id, outcome_id, outcome_name,
    amount, odds_at_bet, potential_payout
  ) VALUES (
    p_market_id, p_user_id, p_outcome_id, p_outcome_name,
    p_amount, p_odds, p_potential_payout
  ) RETURNING id INTO v_bet_id;

  -- Deduct balance atomically
  v_new_balance := v_balance - p_amount;

  UPDATE public.aio_user_portfolios
    SET virtual_balance = v_new_balance,
        total_bets = total_bets + 1,
        total_volume = total_volume + p_amount,
        total_profit = v_new_balance - starting_balance,
        updated_at = NOW()
    WHERE id = v_portfolio_id;

  -- Update market volume
  UPDATE public.aio_meta_markets
    SET total_volume = total_volume + p_amount,
        total_bets = total_bets + 1,
        updated_at = NOW()
    WHERE id = p_market_id;

  RETURN QUERY SELECT true, v_bet_id, v_new_balance, NULL::TEXT;
END;
$$;

-- ============================================
-- 3. BATCH UPDATE CHAMPIONSHIP RANKS
-- ============================================
-- Replaces N+1 individual UPDATE queries with a single batch operation.

CREATE OR REPLACE FUNCTION public.batch_update_championship_ranks(
  p_championship_id UUID
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  WITH ranked AS (
    SELECT
      id,
      ROW_NUMBER() OVER (ORDER BY total_points DESC) AS new_rank
    FROM public.aio_championship_participants
    WHERE championship_id = p_championship_id
      AND is_eliminated = FALSE
  )
  UPDATE public.aio_championship_participants p
    SET current_rank = ranked.new_rank
    FROM ranked
    WHERE p.id = ranked.id;
END;
$$;

-- ============================================
-- 4. BATCH ELIMINATE CHAMPIONSHIP BOTTOM HALF
-- ============================================

CREATE OR REPLACE FUNCTION public.batch_eliminate_championship_bottom(
  p_championship_id UUID
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_total INTEGER;
  v_keep INTEGER;
  v_eliminated INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total
    FROM public.aio_championship_participants
    WHERE championship_id = p_championship_id
      AND is_eliminated = FALSE;

  IF v_total <= 2 THEN
    RETURN 0;
  END IF;

  v_keep := GREATEST(2, CEIL(v_total::NUMERIC / 2));

  WITH ranked AS (
    SELECT id,
           ROW_NUMBER() OVER (ORDER BY total_points DESC) AS rank
    FROM public.aio_championship_participants
    WHERE championship_id = p_championship_id
      AND is_eliminated = FALSE
  )
  UPDATE public.aio_championship_participants p
    SET is_eliminated = TRUE
    FROM ranked
    WHERE p.id = ranked.id
      AND ranked.rank > v_keep;

  GET DIAGNOSTICS v_eliminated = ROW_COUNT;
  RETURN v_eliminated;
END;
$$;

-- ============================================
-- 5. FIX TOTAL_PROFIT TRIGGERS
-- ============================================
-- The old triggers computed total_profit from pre-update virtual_balance.
-- PostgreSQL evaluates RHS before UPDATE, so virtual_balance in the SET clause
-- still holds the OLD value. Fix: compute the new balance explicitly.

-- 5a. Fix bet placement trigger
CREATE OR REPLACE FUNCTION public.update_user_portfolio_after_bet()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.aio_user_portfolios
  SET
    virtual_balance = virtual_balance - NEW.amount,
    total_profit = (virtual_balance - NEW.amount) - starting_balance,
    total_bets = total_bets + 1,
    total_volume = total_volume + NEW.amount,
    updated_at = NOW()
  WHERE id = NEW.portfolio_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5b. Fix bet resolution trigger
CREATE OR REPLACE FUNCTION public.update_user_portfolio_after_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE AND NEW.payout IS NOT NULL THEN
    UPDATE public.aio_user_portfolios
    SET
      virtual_balance = virtual_balance + NEW.payout,
      total_profit = (virtual_balance + NEW.payout) - starting_balance,
      winning_bets = CASE WHEN NEW.payout > NEW.amount THEN winning_bets + 1 ELSE winning_bets END,
      current_streak = CASE
        WHEN NEW.payout > NEW.amount THEN current_streak + 1
        ELSE 0
      END,
      best_streak = CASE
        WHEN NEW.payout > NEW.amount AND current_streak + 1 > best_streak THEN current_streak + 1
        ELSE best_streak
      END,
      updated_at = NOW()
    WHERE id = NEW.portfolio_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Allow 'bet_unlock' as a valid transaction type
ALTER TABLE public.aio_transactions
  DROP CONSTRAINT IF EXISTS aio_transactions_type_check;

ALTER TABLE public.aio_transactions
  ADD CONSTRAINT aio_transactions_type_check
  CHECK (type IN ('deposit', 'withdrawal', 'bet_lock', 'bet_unlock', 'bet_win', 'bet_loss', 'fee', 'prize'));
