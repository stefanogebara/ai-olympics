-- AI Olympics - Human Predictions Schema
-- Migration: 003_human_predictions.sql
-- Adds tables for human user prediction market participation

-- ============================================
-- USER PORTFOLIOS
-- Persistent portfolios for human users (unlike agent in-memory)
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_user_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  virtual_balance DECIMAL(12,2) DEFAULT 10000,
  starting_balance DECIMAL(12,2) DEFAULT 10000,
  total_profit DECIMAL(12,2) DEFAULT 0,
  brier_score DECIMAL(6,4),
  total_bets INTEGER DEFAULT 0,
  winning_bets INTEGER DEFAULT 0,
  total_volume DECIMAL(12,2) DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  current_streak INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for user portfolio queries
CREATE INDEX IF NOT EXISTS idx_user_portfolios_user
  ON public.aio_user_portfolios(user_id);
CREATE INDEX IF NOT EXISTS idx_user_portfolios_profit
  ON public.aio_user_portfolios(total_profit DESC);

-- ============================================
-- USER BETS
-- Persistent bets for human users
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_user_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES public.aio_user_portfolios(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  market_source TEXT NOT NULL CHECK (market_source IN ('polymarket', 'kalshi', 'mock')),
  market_question TEXT,
  market_category TEXT,
  outcome TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  shares DECIMAL(12,6) NOT NULL,
  probability_at_bet DECIMAL(5,4) NOT NULL,
  price_at_bet DECIMAL(5,2),
  resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT,
  payout DECIMAL(12,2),
  profit DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Create indexes for bet queries
CREATE INDEX IF NOT EXISTS idx_user_bets_user
  ON public.aio_user_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_user_bets_portfolio
  ON public.aio_user_bets(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_user_bets_market
  ON public.aio_user_bets(market_id);
CREATE INDEX IF NOT EXISTS idx_user_bets_resolved
  ON public.aio_user_bets(resolved);
CREATE INDEX IF NOT EXISTS idx_user_bets_created
  ON public.aio_user_bets(created_at DESC);

-- ============================================
-- USER POSITIONS
-- Aggregated position tracking per market
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_user_positions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  portfolio_id UUID REFERENCES public.aio_user_portfolios(id) ON DELETE CASCADE,
  market_id TEXT NOT NULL,
  market_source TEXT NOT NULL,
  market_question TEXT,
  market_category TEXT,
  outcome TEXT NOT NULL,
  shares DECIMAL(12,6) NOT NULL,
  average_cost DECIMAL(12,6) NOT NULL,
  total_cost DECIMAL(12,2) NOT NULL,
  current_value DECIMAL(12,2),
  unrealized_pnl DECIMAL(12,2) DEFAULT 0,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, market_id, outcome)
);

-- Create indexes for position queries
CREATE INDEX IF NOT EXISTS idx_user_positions_user
  ON public.aio_user_positions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_positions_market
  ON public.aio_user_positions(market_id);

-- ============================================
-- FOLLOWED TRADERS
-- Social feature to follow other traders
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_followed_traders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  followed_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, followed_id),
  CHECK (follower_id != followed_id)
);

-- Create indexes for follow queries
CREATE INDEX IF NOT EXISTS idx_followed_traders_follower
  ON public.aio_followed_traders(follower_id);
CREATE INDEX IF NOT EXISTS idx_followed_traders_followed
  ON public.aio_followed_traders(followed_id);

-- ============================================
-- TRADE NOTIFICATIONS
-- Notifications when followed traders make bets
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_trade_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  bet_id UUID NOT NULL REFERENCES public.aio_user_bets(id) ON DELETE CASCADE,
  trader_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  read BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for notification queries
CREATE INDEX IF NOT EXISTS idx_trade_notifications_user
  ON public.aio_trade_notifications(user_id, read);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.aio_user_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_user_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_user_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_followed_traders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_trade_notifications ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- User portfolios: viewable by everyone, editable by owner
CREATE POLICY "User portfolios are viewable by everyone"
  ON public.aio_user_portfolios FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their own portfolio"
  ON public.aio_user_portfolios FOR ALL
  USING (auth.uid() = user_id);

-- User bets: viewable by everyone, editable by owner
CREATE POLICY "User bets are viewable by everyone"
  ON public.aio_user_bets FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their own bets"
  ON public.aio_user_bets FOR ALL
  USING (auth.uid() = user_id);

-- User positions: viewable by everyone, editable by owner
CREATE POLICY "User positions are viewable by everyone"
  ON public.aio_user_positions FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their own positions"
  ON public.aio_user_positions FOR ALL
  USING (auth.uid() = user_id);

-- Followed traders: viewable by everyone, manageable by follower
CREATE POLICY "Follow relationships are viewable by everyone"
  ON public.aio_followed_traders FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their follows"
  ON public.aio_followed_traders FOR ALL
  USING (auth.uid() = follower_id);

-- Trade notifications: only viewable by recipient
CREATE POLICY "Users can view their own notifications"
  ON public.aio_trade_notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can manage their own notifications"
  ON public.aio_trade_notifications FOR ALL
  USING (auth.uid() = user_id);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to get or create user portfolio
CREATE OR REPLACE FUNCTION public.get_or_create_user_portfolio(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_portfolio_id UUID;
BEGIN
  -- Try to find existing portfolio
  SELECT id INTO v_portfolio_id
  FROM public.aio_user_portfolios
  WHERE user_id = p_user_id;

  -- Create if not exists
  IF v_portfolio_id IS NULL THEN
    INSERT INTO public.aio_user_portfolios (user_id)
    VALUES (p_user_id)
    RETURNING id INTO v_portfolio_id;
  END IF;

  RETURN v_portfolio_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to update portfolio after user bet
CREATE OR REPLACE FUNCTION public.update_user_portfolio_after_bet()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct bet amount from portfolio balance
  UPDATE public.aio_user_portfolios
  SET
    virtual_balance = virtual_balance - NEW.amount,
    total_profit = virtual_balance - NEW.amount - starting_balance,
    total_bets = total_bets + 1,
    total_volume = total_volume + NEW.amount,
    updated_at = NOW()
  WHERE id = NEW.portfolio_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update portfolio after bet insertion
DROP TRIGGER IF EXISTS on_user_bet_placed ON public.aio_user_bets;
CREATE TRIGGER on_user_bet_placed
  AFTER INSERT ON public.aio_user_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_user_portfolio_after_bet();

-- Function to update portfolio after bet resolution
CREATE OR REPLACE FUNCTION public.update_user_portfolio_after_resolution()
RETURNS TRIGGER AS $$
BEGIN
  -- Add payout to portfolio balance when bet is resolved
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE AND NEW.payout IS NOT NULL THEN
    UPDATE public.aio_user_portfolios
    SET
      virtual_balance = virtual_balance + NEW.payout,
      total_profit = virtual_balance + NEW.payout - starting_balance,
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

-- Trigger to update portfolio after bet resolution
DROP TRIGGER IF EXISTS on_user_bet_resolved ON public.aio_user_bets;
CREATE TRIGGER on_user_bet_resolved
  AFTER UPDATE OF resolved ON public.aio_user_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_user_portfolio_after_resolution();

-- Function to notify followers of a trade
CREATE OR REPLACE FUNCTION public.notify_followers_of_trade()
RETURNS TRIGGER AS $$
BEGIN
  -- Insert notifications for all followers
  INSERT INTO public.aio_trade_notifications (user_id, bet_id, trader_id)
  SELECT follower_id, NEW.id, NEW.user_id
  FROM public.aio_followed_traders
  WHERE followed_id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to notify followers
DROP TRIGGER IF EXISTS on_user_bet_notify_followers ON public.aio_user_bets;
CREATE TRIGGER on_user_bet_notify_followers
  AFTER INSERT ON public.aio_user_bets
  FOR EACH ROW EXECUTE FUNCTION public.notify_followers_of_trade();

-- Function to calculate user Brier score
CREATE OR REPLACE FUNCTION public.calculate_user_brier_score(p_user_id UUID)
RETURNS DECIMAL(6,4) AS $$
DECLARE
  v_brier_score DECIMAL(6,4);
BEGIN
  SELECT
    AVG(POWER(
      CASE
        WHEN outcome = resolution THEN probability_at_bet - 1
        ELSE probability_at_bet - 0
      END,
      2
    ))
  INTO v_brier_score
  FROM public.aio_user_bets
  WHERE user_id = p_user_id
    AND resolved = TRUE
    AND resolution IS NOT NULL;

  RETURN COALESCE(v_brier_score, 0.25);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- View for user prediction leaderboard
CREATE OR REPLACE VIEW public.aio_user_prediction_leaderboard AS
SELECT
  p.id AS portfolio_id,
  p.user_id,
  pr.username,
  pr.avatar_url,
  p.virtual_balance,
  p.starting_balance,
  p.total_profit,
  ROUND((p.total_profit / NULLIF(p.starting_balance, 0) * 100)::numeric, 2) AS profit_percent,
  p.total_bets,
  p.winning_bets,
  CASE WHEN p.total_bets > 0 THEN ROUND((p.winning_bets::decimal / p.total_bets * 100)::numeric, 1) ELSE 0 END AS win_rate,
  p.total_volume,
  p.brier_score,
  p.best_streak,
  p.current_streak,
  (SELECT COUNT(*) FROM public.aio_followed_traders WHERE followed_id = p.user_id) AS follower_count,
  p.created_at,
  p.updated_at
FROM public.aio_user_portfolios p
JOIN public.aio_profiles pr ON pr.id = p.user_id
ORDER BY p.total_profit DESC;

-- Grant access to the view
GRANT SELECT ON public.aio_user_prediction_leaderboard TO authenticated;
GRANT SELECT ON public.aio_user_prediction_leaderboard TO anon;

-- View for recent trades (for social feed)
CREATE OR REPLACE VIEW public.aio_recent_trades AS
SELECT
  b.id AS bet_id,
  b.user_id,
  pr.username,
  pr.avatar_url,
  b.market_id,
  b.market_source,
  b.market_question,
  b.market_category,
  b.outcome,
  b.amount,
  b.shares,
  b.probability_at_bet,
  b.resolved,
  b.resolution,
  b.payout,
  b.profit,
  b.created_at
FROM public.aio_user_bets b
JOIN public.aio_profiles pr ON pr.id = b.user_id
ORDER BY b.created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.aio_recent_trades TO authenticated;
GRANT SELECT ON public.aio_recent_trades TO anon;
