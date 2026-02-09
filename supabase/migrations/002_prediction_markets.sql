-- AI Olympics - Prediction Markets Schema
-- Migration: 002_prediction_markets.sql
-- Adds tables for virtual prediction market competitions

-- ============================================
-- PREDICTION COMPETITION SETTINGS
-- Competition-specific prediction market configuration
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_prediction_competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES public.competitions(id) ON DELETE CASCADE,
  starting_balance DECIMAL(12,2) DEFAULT 10000,
  max_bet_size DECIMAL(12,2) DEFAULT 1000,
  resolution_mode TEXT DEFAULT 'fixed_time' CHECK (resolution_mode IN ('fixed_time', 'market_close', 'manual')),
  allowed_market_types TEXT[] DEFAULT ARRAY['BINARY', 'MULTIPLE_CHOICE'],
  market_ids TEXT[], -- Optional: specific market IDs to use
  market_query TEXT, -- Optional: search query to find markets
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(competition_id)
);

-- Create index for competition lookup
CREATE INDEX IF NOT EXISTS idx_prediction_competitions_competition
  ON public.aio_prediction_competitions(competition_id);

-- ============================================
-- VIRTUAL PORTFOLIOS
-- Agent portfolios for sandbox prediction competitions
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_virtual_portfolios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  starting_balance DECIMAL(12,2) NOT NULL DEFAULT 10000,
  current_balance DECIMAL(12,2) NOT NULL DEFAULT 10000,
  total_profit DECIMAL(12,2) DEFAULT 0,
  brier_score DECIMAL(6,4), -- Calculated at competition end
  final_score INTEGER, -- Final competition score
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(agent_id, competition_id)
);

-- Create indexes for portfolio queries
CREATE INDEX IF NOT EXISTS idx_virtual_portfolios_agent
  ON public.aio_virtual_portfolios(agent_id);
CREATE INDEX IF NOT EXISTS idx_virtual_portfolios_competition
  ON public.aio_virtual_portfolios(competition_id);

-- ============================================
-- VIRTUAL BETS
-- Individual bets placed in virtual portfolios
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_virtual_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  portfolio_id UUID NOT NULL REFERENCES public.aio_virtual_portfolios(id) ON DELETE CASCADE,
  manifold_market_id TEXT NOT NULL,
  market_question TEXT,
  market_url TEXT,
  outcome TEXT NOT NULL, -- 'YES', 'NO', or answer ID for multiple choice
  amount DECIMAL(12,2) NOT NULL,
  shares DECIMAL(12,6) NOT NULL,
  probability_at_bet DECIMAL(5,4) NOT NULL, -- Probability when bet was placed (for Brier score)
  pool_snapshot JSONB, -- Market pool state at time of bet
  resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT, -- Actual outcome when market resolves
  payout DECIMAL(12,2), -- Amount returned when resolved
  created_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ
);

-- Create indexes for bet queries
CREATE INDEX IF NOT EXISTS idx_virtual_bets_portfolio
  ON public.aio_virtual_bets(portfolio_id);
CREATE INDEX IF NOT EXISTS idx_virtual_bets_market
  ON public.aio_virtual_bets(manifold_market_id);
CREATE INDEX IF NOT EXISTS idx_virtual_bets_resolved
  ON public.aio_virtual_bets(resolved);

-- ============================================
-- MARKET SNAPSHOTS (Optional cache)
-- Cache market data to reduce API calls
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_market_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  manifold_market_id TEXT NOT NULL UNIQUE,
  question TEXT NOT NULL,
  probability DECIMAL(5,4),
  pool JSONB,
  volume DECIMAL(12,2),
  outcome_type TEXT,
  close_time TIMESTAMPTZ,
  is_resolved BOOLEAN DEFAULT FALSE,
  resolution TEXT,
  url TEXT,
  creator_username TEXT,
  fetched_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for market lookups
CREATE INDEX IF NOT EXISTS idx_market_snapshots_market_id
  ON public.aio_market_snapshots(manifold_market_id);
CREATE INDEX IF NOT EXISTS idx_market_snapshots_fetched
  ON public.aio_market_snapshots(fetched_at);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.aio_prediction_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_virtual_portfolios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_virtual_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_market_snapshots ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Prediction competition settings are viewable by everyone
CREATE POLICY "Prediction competition settings are viewable by everyone"
  ON public.aio_prediction_competitions FOR SELECT
  USING (true);

-- Only competition creators can insert/update settings
CREATE POLICY "Competition creators can manage prediction settings"
  ON public.aio_prediction_competitions FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.competitions c
      WHERE c.id = competition_id AND c.created_by = auth.uid()
    )
  );

-- Virtual portfolios are viewable by everyone
CREATE POLICY "Virtual portfolios are viewable by everyone"
  ON public.aio_virtual_portfolios FOR SELECT
  USING (true);

-- Agent owners can manage their portfolios
CREATE POLICY "Agent owners can manage portfolios"
  ON public.aio_virtual_portfolios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      WHERE a.id = agent_id AND a.owner_id = auth.uid()
    )
  );

-- Virtual bets are viewable by everyone
CREATE POLICY "Virtual bets are viewable by everyone"
  ON public.aio_virtual_bets FOR SELECT
  USING (true);

-- Portfolio owners can manage bets
CREATE POLICY "Portfolio owners can manage bets"
  ON public.aio_virtual_bets FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.aio_virtual_portfolios p
      JOIN public.agents a ON a.id = p.agent_id
      WHERE p.id = portfolio_id AND a.owner_id = auth.uid()
    )
  );

-- Market snapshots are viewable by everyone
CREATE POLICY "Market snapshots are viewable by everyone"
  ON public.aio_market_snapshots FOR SELECT
  USING (true);

-- Only service role can insert/update market snapshots
CREATE POLICY "Service role can manage market snapshots"
  ON public.aio_market_snapshots FOR ALL
  USING (auth.role() = 'service_role');

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update portfolio balance after bet
CREATE OR REPLACE FUNCTION public.update_portfolio_after_bet()
RETURNS TRIGGER AS $$
BEGIN
  -- Deduct bet amount from portfolio balance
  UPDATE public.aio_virtual_portfolios
  SET
    current_balance = current_balance - NEW.amount,
    total_profit = current_balance - starting_balance,
    updated_at = NOW()
  WHERE id = NEW.portfolio_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update portfolio after bet insertion
DROP TRIGGER IF EXISTS on_virtual_bet_placed ON public.aio_virtual_bets;
CREATE TRIGGER on_virtual_bet_placed
  AFTER INSERT ON public.aio_virtual_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_portfolio_after_bet();

-- Function to update portfolio after bet resolution
CREATE OR REPLACE FUNCTION public.update_portfolio_after_resolution()
RETURNS TRIGGER AS $$
BEGIN
  -- Add payout to portfolio balance when bet is resolved
  IF NEW.resolved = TRUE AND OLD.resolved = FALSE AND NEW.payout IS NOT NULL THEN
    UPDATE public.aio_virtual_portfolios
    SET
      current_balance = current_balance + NEW.payout,
      total_profit = current_balance + NEW.payout - starting_balance,
      updated_at = NOW()
    WHERE id = NEW.portfolio_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update portfolio after bet resolution
DROP TRIGGER IF EXISTS on_virtual_bet_resolved ON public.aio_virtual_bets;
CREATE TRIGGER on_virtual_bet_resolved
  AFTER UPDATE OF resolved ON public.aio_virtual_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_portfolio_after_resolution();

-- Function to calculate Brier score for a portfolio
CREATE OR REPLACE FUNCTION public.calculate_portfolio_brier_score(p_portfolio_id UUID)
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
  FROM public.aio_virtual_bets
  WHERE portfolio_id = p_portfolio_id
    AND resolved = TRUE
    AND resolution IS NOT NULL;

  RETURN COALESCE(v_brier_score, 0.25);
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- VIEWS
-- ============================================

-- View for portfolio leaderboard
CREATE OR REPLACE VIEW public.aio_prediction_leaderboard AS
SELECT
  p.id AS portfolio_id,
  p.agent_id,
  a.name AS agent_name,
  a.color AS agent_color,
  p.competition_id,
  p.starting_balance,
  p.current_balance,
  p.total_profit,
  ROUND((p.total_profit / p.starting_balance * 100)::numeric, 2) AS profit_percent,
  (SELECT COUNT(*) FROM public.aio_virtual_bets WHERE portfolio_id = p.id) AS total_bets,
  p.brier_score,
  p.final_score,
  p.created_at
FROM public.aio_virtual_portfolios p
JOIN public.agents a ON a.id = p.agent_id
ORDER BY p.final_score DESC NULLS LAST, p.total_profit DESC;

-- Grant access to the view
GRANT SELECT ON public.aio_prediction_leaderboard TO authenticated;
GRANT SELECT ON public.aio_prediction_leaderboard TO anon;
