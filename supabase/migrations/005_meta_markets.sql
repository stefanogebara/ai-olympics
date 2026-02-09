-- AI Olympics - Meta Markets Schema
-- Migration: 005_meta_markets.sql
-- Adds tables for betting on AI competition outcomes

-- ============================================
-- META MARKETS
-- Markets for betting on AI competition outcomes
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_meta_markets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID REFERENCES public.aio_competitions(id) ON DELETE CASCADE,
  question TEXT NOT NULL,
  description TEXT,
  market_type TEXT DEFAULT 'winner' CHECK (market_type IN ('winner', 'score_over_under', 'head_to_head', 'task_completion')),
  outcomes JSONB NOT NULL, -- [{id, name, initial_odds, agent_id?}]
  current_odds JSONB, -- Live odds: {outcome_id: odds}
  status TEXT DEFAULT 'open' CHECK (status IN ('draft', 'open', 'locked', 'resolved', 'cancelled')),
  resolved_outcome TEXT,
  resolution_data JSONB, -- Additional resolution details
  total_volume DECIMAL(12,2) DEFAULT 0,
  total_bets INTEGER DEFAULT 0,
  opens_at TIMESTAMPTZ DEFAULT NOW(),
  locks_at TIMESTAMPTZ, -- When betting closes (usually at competition start)
  resolves_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for meta market queries
CREATE INDEX IF NOT EXISTS idx_meta_markets_competition
  ON public.aio_meta_markets(competition_id);
CREATE INDEX IF NOT EXISTS idx_meta_markets_status
  ON public.aio_meta_markets(status);
CREATE INDEX IF NOT EXISTS idx_meta_markets_opens_at
  ON public.aio_meta_markets(opens_at);

-- ============================================
-- META MARKET BETS
-- Bets placed on meta markets
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_meta_market_bets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.aio_meta_markets(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL,
  outcome_name TEXT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  odds_at_bet DECIMAL(8,4) NOT NULL,
  potential_payout DECIMAL(12,2) NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'won', 'lost', 'cancelled', 'refunded')),
  actual_payout DECIMAL(12,2),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  settled_at TIMESTAMPTZ
);

-- Create indexes for bet queries
CREATE INDEX IF NOT EXISTS idx_meta_market_bets_market
  ON public.aio_meta_market_bets(market_id);
CREATE INDEX IF NOT EXISTS idx_meta_market_bets_user
  ON public.aio_meta_market_bets(user_id);
CREATE INDEX IF NOT EXISTS idx_meta_market_bets_status
  ON public.aio_meta_market_bets(status);

-- ============================================
-- AGENT BETTING STATS
-- Aggregated stats for agents in betting markets
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_agent_betting_stats (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.aio_agents(id) ON DELETE CASCADE UNIQUE,
  markets_featured INTEGER DEFAULT 0,
  times_bet_on INTEGER DEFAULT 0,
  total_volume_on_agent DECIMAL(12,2) DEFAULT 0,
  wins INTEGER DEFAULT 0,
  losses INTEGER DEFAULT 0,
  win_rate DECIMAL(5,2),
  average_odds DECIMAL(8,4),
  last_featured_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for agent stats queries
CREATE INDEX IF NOT EXISTS idx_agent_betting_stats_agent
  ON public.aio_agent_betting_stats(agent_id);

-- ============================================
-- META MARKET ODDS HISTORY
-- Track odds movements over time
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_meta_market_odds_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  market_id UUID NOT NULL REFERENCES public.aio_meta_markets(id) ON DELETE CASCADE,
  outcome_id TEXT NOT NULL,
  odds DECIMAL(8,4) NOT NULL,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for odds history queries
CREATE INDEX IF NOT EXISTS idx_meta_market_odds_history_market
  ON public.aio_meta_market_odds_history(market_id, recorded_at);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.aio_meta_markets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_meta_market_bets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_agent_betting_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_meta_market_odds_history ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Meta markets: viewable by everyone
CREATE POLICY "Meta markets are viewable by everyone"
  ON public.aio_meta_markets FOR SELECT
  USING (true);

-- Service role can manage meta markets
CREATE POLICY "Service role can manage meta markets"
  ON public.aio_meta_markets FOR ALL
  USING (auth.role() = 'service_role');

-- Meta market bets: users can view all bets
CREATE POLICY "Meta market bets are viewable by everyone"
  ON public.aio_meta_market_bets FOR SELECT
  USING (true);

-- Users can place their own bets
CREATE POLICY "Users can place bets"
  ON public.aio_meta_market_bets FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- Agent betting stats: viewable by everyone
CREATE POLICY "Agent betting stats are viewable by everyone"
  ON public.aio_agent_betting_stats FOR SELECT
  USING (true);

-- Odds history: viewable by everyone
CREATE POLICY "Odds history is viewable by everyone"
  ON public.aio_meta_market_odds_history FOR SELECT
  USING (true);

-- ============================================================================
-- FUNCTIONS
-- ============================================================================

-- Function to calculate implied probability from American odds
CREATE OR REPLACE FUNCTION public.odds_to_probability(odds DECIMAL)
RETURNS DECIMAL AS $$
BEGIN
  IF odds > 0 THEN
    RETURN ROUND((100.0 / (odds + 100) * 100)::numeric, 2);
  ELSE
    RETURN ROUND((ABS(odds) / (ABS(odds) + 100) * 100)::numeric, 2);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update market after bet
CREATE OR REPLACE FUNCTION public.update_meta_market_after_bet()
RETURNS TRIGGER AS $$
BEGIN
  -- Update market totals
  UPDATE public.aio_meta_markets
  SET
    total_volume = total_volume + NEW.amount,
    total_bets = total_bets + 1,
    updated_at = NOW()
  WHERE id = NEW.market_id;

  -- Update agent stats if betting on a specific agent
  IF EXISTS (
    SELECT 1 FROM public.aio_meta_markets m
    WHERE m.id = NEW.market_id
    AND m.outcomes::jsonb @> jsonb_build_array(jsonb_build_object('id', NEW.outcome_id, 'agent_id', true))
  ) THEN
    -- Get agent_id from outcome
    DECLARE
      v_agent_id UUID;
    BEGIN
      SELECT (outcome->>'agent_id')::uuid INTO v_agent_id
      FROM public.aio_meta_markets m,
           jsonb_array_elements(m.outcomes) AS outcome
      WHERE m.id = NEW.market_id
        AND outcome->>'id' = NEW.outcome_id
        AND outcome->>'agent_id' IS NOT NULL;

      IF v_agent_id IS NOT NULL THEN
        INSERT INTO public.aio_agent_betting_stats (agent_id, times_bet_on, total_volume_on_agent)
        VALUES (v_agent_id, 1, NEW.amount)
        ON CONFLICT (agent_id) DO UPDATE SET
          times_bet_on = aio_agent_betting_stats.times_bet_on + 1,
          total_volume_on_agent = aio_agent_betting_stats.total_volume_on_agent + NEW.amount,
          updated_at = NOW();
      END IF;
    END;
  END IF;

  -- Deduct from user's portfolio
  UPDATE public.aio_user_portfolios
  SET
    virtual_balance = virtual_balance - NEW.amount,
    updated_at = NOW()
  WHERE user_id = NEW.user_id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update market after bet
DROP TRIGGER IF EXISTS on_meta_market_bet ON public.aio_meta_market_bets;
CREATE TRIGGER on_meta_market_bet
  AFTER INSERT ON public.aio_meta_market_bets
  FOR EACH ROW EXECUTE FUNCTION public.update_meta_market_after_bet();

-- Function to settle bets when market resolves
CREATE OR REPLACE FUNCTION public.settle_meta_market_bets()
RETURNS TRIGGER AS $$
BEGIN
  -- Only process when market is resolved
  IF NEW.status = 'resolved' AND OLD.status != 'resolved' AND NEW.resolved_outcome IS NOT NULL THEN
    -- Settle winning bets
    UPDATE public.aio_meta_market_bets
    SET
      status = 'won',
      actual_payout = potential_payout,
      settled_at = NOW()
    WHERE market_id = NEW.id
      AND outcome_id = NEW.resolved_outcome
      AND status = 'active';

    -- Credit winners
    UPDATE public.aio_user_portfolios p
    SET
      virtual_balance = p.virtual_balance + b.potential_payout,
      updated_at = NOW()
    FROM public.aio_meta_market_bets b
    WHERE b.user_id = p.user_id
      AND b.market_id = NEW.id
      AND b.outcome_id = NEW.resolved_outcome
      AND b.status = 'won';

    -- Settle losing bets
    UPDATE public.aio_meta_market_bets
    SET
      status = 'lost',
      actual_payout = 0,
      settled_at = NOW()
    WHERE market_id = NEW.id
      AND outcome_id != NEW.resolved_outcome
      AND status = 'active';

    -- Update agent stats for winner
    UPDATE public.aio_agent_betting_stats
    SET
      wins = wins + 1,
      win_rate = ROUND(((wins + 1)::decimal / NULLIF(wins + losses + 1, 0) * 100)::numeric, 2),
      updated_at = NOW()
    WHERE agent_id = (
      SELECT (outcome->>'agent_id')::uuid
      FROM jsonb_array_elements(NEW.outcomes) AS outcome
      WHERE outcome->>'id' = NEW.resolved_outcome
        AND outcome->>'agent_id' IS NOT NULL
      LIMIT 1
    );

    -- Update agent stats for losers
    UPDATE public.aio_agent_betting_stats
    SET
      losses = losses + 1,
      win_rate = ROUND((wins::decimal / NULLIF(wins + losses + 1, 0) * 100)::numeric, 2),
      updated_at = NOW()
    WHERE agent_id IN (
      SELECT (outcome->>'agent_id')::uuid
      FROM jsonb_array_elements(NEW.outcomes) AS outcome
      WHERE outcome->>'id' != NEW.resolved_outcome
        AND outcome->>'agent_id' IS NOT NULL
    );
  END IF;

  -- Handle cancelled markets - refund all bets
  IF NEW.status = 'cancelled' AND OLD.status != 'cancelled' THEN
    UPDATE public.aio_meta_market_bets
    SET
      status = 'refunded',
      actual_payout = amount,
      settled_at = NOW()
    WHERE market_id = NEW.id AND status = 'active';

    -- Refund users
    UPDATE public.aio_user_portfolios p
    SET
      virtual_balance = p.virtual_balance + b.amount,
      updated_at = NOW()
    FROM public.aio_meta_market_bets b
    WHERE b.user_id = p.user_id
      AND b.market_id = NEW.id
      AND b.status = 'refunded';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to settle bets on market resolution
DROP TRIGGER IF EXISTS on_meta_market_resolve ON public.aio_meta_markets;
CREATE TRIGGER on_meta_market_resolve
  AFTER UPDATE OF status ON public.aio_meta_markets
  FOR EACH ROW EXECUTE FUNCTION public.settle_meta_market_bets();

-- ============================================================================
-- VIEWS
-- ============================================================================

-- View for active meta markets with bet counts
CREATE OR REPLACE VIEW public.aio_active_meta_markets AS
SELECT
  m.id,
  m.competition_id,
  c.name AS competition_name,
  m.question,
  m.description,
  m.market_type,
  m.outcomes,
  m.current_odds,
  m.status,
  m.total_volume,
  m.total_bets,
  m.opens_at,
  m.locks_at,
  m.created_at
FROM public.aio_meta_markets m
LEFT JOIN public.aio_competitions c ON c.id = m.competition_id
WHERE m.status IN ('open', 'locked')
ORDER BY m.opens_at DESC;

GRANT SELECT ON public.aio_active_meta_markets TO authenticated;
GRANT SELECT ON public.aio_active_meta_markets TO anon;

-- View for user's meta market bets
CREATE OR REPLACE VIEW public.aio_user_meta_bets AS
SELECT
  b.id,
  b.market_id,
  m.question AS market_question,
  m.competition_id,
  b.user_id,
  b.outcome_id,
  b.outcome_name,
  b.amount,
  b.odds_at_bet,
  b.potential_payout,
  b.status,
  b.actual_payout,
  b.created_at,
  b.settled_at,
  m.status AS market_status,
  m.resolved_outcome
FROM public.aio_meta_market_bets b
JOIN public.aio_meta_markets m ON m.id = b.market_id
ORDER BY b.created_at DESC;

GRANT SELECT ON public.aio_user_meta_bets TO authenticated;
