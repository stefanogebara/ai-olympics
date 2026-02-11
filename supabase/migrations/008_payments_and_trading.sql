-- ============================================
-- 008: Payments & Real-Money Trading
-- ============================================
-- Adds wallet system, Stripe/crypto payments,
-- real-money bets, positions, and market resolutions.
-- All mutations go through the API (service role);
-- RLS allows users to SELECT their own rows only.
-- ============================================

-- ============================================
-- 1. TABLES
-- ============================================

-- 1a. Wallets - one per user, holds real-money balance
CREATE TABLE IF NOT EXISTS public.aio_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  balance_cents INTEGER NOT NULL DEFAULT 0 CHECK (balance_cents >= 0),
  pending_cents INTEGER NOT NULL DEFAULT 0 CHECK (pending_cents >= 0),
  total_deposited_cents INTEGER NOT NULL DEFAULT 0,
  total_withdrawn_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1b. Transactions - immutable ledger of all money movements
CREATE TABLE IF NOT EXISTS public.aio_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  wallet_id UUID NOT NULL REFERENCES public.aio_wallets(id),
  type TEXT NOT NULL CHECK (type IN ('deposit', 'withdrawal', 'bet_lock', 'bet_win', 'bet_loss', 'fee')),
  amount_cents INTEGER NOT NULL,
  balance_after_cents INTEGER,
  idempotency_key TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'reversed')),
  provider TEXT,          -- stripe / polygon_usdc / internal
  provider_ref TEXT,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1c. Stripe customers - maps users to Stripe customer IDs
CREATE TABLE IF NOT EXISTS public.aio_stripe_customers (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  stripe_customer_id TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1d. Crypto wallets - linked Polygon wallets per user
CREATE TABLE IF NOT EXISTS public.aio_crypto_wallets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  wallet_address TEXT NOT NULL,
  is_verified BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, wallet_address)
);

-- 1e. Real bets - individual real-money bets
CREATE TABLE IF NOT EXISTS public.aio_real_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  wallet_id UUID NOT NULL REFERENCES public.aio_wallets(id),
  market_id TEXT NOT NULL,
  market_source TEXT NOT NULL CHECK (market_source IN ('polymarket', 'kalshi')),
  outcome TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  shares DECIMAL(12,6),
  price_per_share DECIMAL(8,6),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'filled', 'partially_filled', 'cancelled', 'failed')),
  exchange_order_id TEXT,
  resolved BOOLEAN NOT NULL DEFAULT FALSE,
  resolution TEXT,
  payout_cents INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 1f. Real positions - aggregated per user/market/outcome
CREATE TABLE IF NOT EXISTS public.aio_real_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id),
  market_id TEXT NOT NULL,
  market_source TEXT NOT NULL,
  outcome TEXT NOT NULL,
  total_shares DECIMAL(12,6) NOT NULL DEFAULT 0,
  avg_price DECIMAL(8,6) NOT NULL DEFAULT 0,
  total_cost_cents INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, market_id, outcome)
);

-- 1g. Market resolutions - one record per resolved market
CREATE TABLE IF NOT EXISTS public.aio_market_resolutions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id TEXT NOT NULL,
  market_source TEXT NOT NULL,
  resolution TEXT NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolution_source TEXT NOT NULL DEFAULT 'auto_api' CHECK (resolution_source IN ('auto_api', 'manual')),
  affected_bets_count INTEGER NOT NULL DEFAULT 0,
  total_payout_cents INTEGER NOT NULL DEFAULT 0,
  UNIQUE (market_id, market_source)
);

-- 1h. Exchange credentials - per-user API keys for exchanges
CREATE TABLE IF NOT EXISTS public.aio_exchange_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exchange TEXT NOT NULL CHECK (exchange IN ('polymarket', 'kalshi')),
  encrypted_credentials JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, exchange)
);

-- ============================================
-- 2. INDEXES
-- ============================================

CREATE INDEX IF NOT EXISTS idx_aio_transactions_wallet_id
  ON public.aio_transactions(wallet_id);

CREATE INDEX IF NOT EXISTS idx_aio_transactions_idempotency_key
  ON public.aio_transactions(idempotency_key);

CREATE INDEX IF NOT EXISTS idx_aio_real_bets_user_id
  ON public.aio_real_bets(user_id);

CREATE INDEX IF NOT EXISTS idx_aio_real_bets_market
  ON public.aio_real_bets(market_id, market_source);

CREATE INDEX IF NOT EXISTS idx_aio_real_bets_resolution_status
  ON public.aio_real_bets(resolved, status);

CREATE INDEX IF NOT EXISTS idx_aio_real_positions_user_id
  ON public.aio_real_positions(user_id);

CREATE INDEX IF NOT EXISTS idx_aio_market_resolutions_market
  ON public.aio_market_resolutions(market_id, market_source);

-- ============================================
-- 3. UPDATED_AT TRIGGER FUNCTION
-- ============================================

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach to tables with updated_at
CREATE TRIGGER trg_aio_wallets_updated_at
  BEFORE UPDATE ON public.aio_wallets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_aio_real_bets_updated_at
  BEFORE UPDATE ON public.aio_real_bets
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TRIGGER trg_aio_exchange_credentials_updated_at
  BEFORE UPDATE ON public.aio_exchange_credentials
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ============================================
-- 4. ROW LEVEL SECURITY
-- ============================================

ALTER TABLE public.aio_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_stripe_customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_crypto_wallets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_real_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_real_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_market_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_exchange_credentials ENABLE ROW LEVEL SECURITY;

-- Wallets: users can read their own
CREATE POLICY "Users can view their own wallet"
  ON public.aio_wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Transactions: users can read their own (join through wallet)
CREATE POLICY "Users can view their own transactions"
  ON public.aio_transactions FOR SELECT
  USING (
    wallet_id IN (
      SELECT id FROM public.aio_wallets WHERE user_id = auth.uid()
    )
  );

-- Stripe customers: users can read their own
CREATE POLICY "Users can view their own Stripe mapping"
  ON public.aio_stripe_customers FOR SELECT
  USING (auth.uid() = user_id);

-- Crypto wallets: users can read their own
CREATE POLICY "Users can view their own crypto wallets"
  ON public.aio_crypto_wallets FOR SELECT
  USING (auth.uid() = user_id);

-- Real bets: users can read their own
CREATE POLICY "Users can view their own real bets"
  ON public.aio_real_bets FOR SELECT
  USING (auth.uid() = user_id);

-- Real positions: users can read their own
CREATE POLICY "Users can view their own positions"
  ON public.aio_real_positions FOR SELECT
  USING (auth.uid() = user_id);

-- Market resolutions: readable by all authenticated users
CREATE POLICY "Authenticated users can view market resolutions"
  ON public.aio_market_resolutions FOR SELECT
  USING (auth.uid() IS NOT NULL);

-- Exchange credentials: users can read their own
CREATE POLICY "Users can view their own exchange credentials"
  ON public.aio_exchange_credentials FOR SELECT
  USING (auth.uid() = user_id);

-- ============================================
-- 5. FUNCTIONS
-- ============================================

-- 5a. lock_funds_for_bet
-- Atomically moves funds from available balance to pending
CREATE OR REPLACE FUNCTION public.lock_funds_for_bet(
  p_wallet_id UUID,
  p_amount_cents INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Lock the wallet row
  SELECT balance_cents INTO v_balance
    FROM public.aio_wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
  END IF;

  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient funds: have % cents, need % cents', v_balance, p_amount_cents;
  END IF;

  v_new_balance := v_balance - p_amount_cents;

  UPDATE public.aio_wallets
    SET balance_cents  = v_new_balance,
        pending_cents  = pending_cents + p_amount_cents
    WHERE id = p_wallet_id;

  INSERT INTO public.aio_transactions (wallet_id, type, amount_cents, balance_after_cents, status)
    VALUES (p_wallet_id, 'bet_lock', p_amount_cents, v_new_balance, 'completed');
END;
$$;

-- 5b. settle_real_bet
-- Resolves a bet: credits payout (if any) and clears pending
CREATE OR REPLACE FUNCTION public.settle_real_bet(
  p_bet_id UUID,
  p_payout_cents INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_wallet_id UUID;
  v_amount_cents INTEGER;
  v_outcome TEXT;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Get bet info
  SELECT wallet_id, amount_cents, outcome
    INTO v_wallet_id, v_amount_cents, v_outcome
    FROM public.aio_real_bets
    WHERE id = p_bet_id AND resolved = FALSE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bet not found or already resolved: %', p_bet_id;
  END IF;

  -- Lock the wallet row
  SELECT balance_cents INTO v_balance
    FROM public.aio_wallets
    WHERE id = v_wallet_id
    FOR UPDATE;

  -- Release pending funds
  UPDATE public.aio_wallets
    SET pending_cents = pending_cents - v_amount_cents
    WHERE id = v_wallet_id;

  IF p_payout_cents > 0 THEN
    -- Winner: credit payout to balance
    v_new_balance := v_balance + p_payout_cents;

    UPDATE public.aio_wallets
      SET balance_cents = v_new_balance
      WHERE id = v_wallet_id;

    INSERT INTO public.aio_transactions (wallet_id, type, amount_cents, balance_after_cents, status)
      VALUES (v_wallet_id, 'bet_win', p_payout_cents, v_new_balance, 'completed');
  ELSE
    -- Loser: no balance change, just record the loss
    v_new_balance := v_balance;

    INSERT INTO public.aio_transactions (wallet_id, type, amount_cents, balance_after_cents, status)
      VALUES (v_wallet_id, 'bet_loss', v_amount_cents, v_new_balance, 'completed');
  END IF;

  -- Mark bet as resolved
  UPDATE public.aio_real_bets
    SET resolved    = TRUE,
        resolution  = v_outcome,
        payout_cents = p_payout_cents
    WHERE id = p_bet_id;
END;
$$;

-- 5c. credit_wallet
-- Idempotent deposit into a wallet (e.g. from Stripe or crypto)
CREATE OR REPLACE FUNCTION public.credit_wallet(
  p_wallet_id UUID,
  p_amount_cents INTEGER,
  p_provider TEXT,
  p_provider_ref TEXT,
  p_idempotency_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing UUID;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Idempotency check
  SELECT id INTO v_existing
    FROM public.aio_transactions
    WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN;  -- Already processed
  END IF;

  -- Lock the wallet row
  SELECT balance_cents INTO v_balance
    FROM public.aio_wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
  END IF;

  v_new_balance := v_balance + p_amount_cents;

  UPDATE public.aio_wallets
    SET balance_cents         = v_new_balance,
        total_deposited_cents = total_deposited_cents + p_amount_cents
    WHERE id = p_wallet_id;

  INSERT INTO public.aio_transactions
    (wallet_id, type, amount_cents, balance_after_cents, status, provider, provider_ref, idempotency_key)
    VALUES
    (p_wallet_id, 'deposit', p_amount_cents, v_new_balance, 'completed', p_provider, p_provider_ref, p_idempotency_key);
END;
$$;

-- 5d. debit_wallet_for_withdrawal
-- Idempotent withdrawal from a wallet
CREATE OR REPLACE FUNCTION public.debit_wallet_for_withdrawal(
  p_wallet_id UUID,
  p_amount_cents INTEGER,
  p_provider TEXT,
  p_provider_ref TEXT,
  p_idempotency_key TEXT
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing UUID;
  v_balance INTEGER;
  v_new_balance INTEGER;
BEGIN
  -- Idempotency check
  SELECT id INTO v_existing
    FROM public.aio_transactions
    WHERE idempotency_key = p_idempotency_key;

  IF FOUND THEN
    RETURN;  -- Already processed
  END IF;

  -- Lock the wallet row
  SELECT balance_cents INTO v_balance
    FROM public.aio_wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Wallet not found: %', p_wallet_id;
  END IF;

  IF v_balance < p_amount_cents THEN
    RAISE EXCEPTION 'Insufficient funds for withdrawal: have % cents, need % cents', v_balance, p_amount_cents;
  END IF;

  v_new_balance := v_balance - p_amount_cents;

  UPDATE public.aio_wallets
    SET balance_cents          = v_new_balance,
        total_withdrawn_cents  = total_withdrawn_cents + p_amount_cents
    WHERE id = p_wallet_id;

  INSERT INTO public.aio_transactions
    (wallet_id, type, amount_cents, balance_after_cents, status, provider, provider_ref, idempotency_key)
    VALUES
    (p_wallet_id, 'withdrawal', p_amount_cents, v_new_balance, 'completed', p_provider, p_provider_ref, p_idempotency_key);
END;
$$;
