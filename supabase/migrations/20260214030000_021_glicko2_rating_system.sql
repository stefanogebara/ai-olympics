-- Migration: 021_glicko2_rating_system
-- Adds Glicko-2 columns (rating_deviation, volatility) to existing rating tables
-- and updates the RPC functions to accept the new parameters.

-- ===========================================
-- ALTER TABLE: aio_agents
-- Add rating_deviation and volatility columns
-- ===========================================
ALTER TABLE aio_agents
  ADD COLUMN IF NOT EXISTS rating_deviation NUMERIC DEFAULT 350,
  ADD COLUMN IF NOT EXISTS volatility NUMERIC DEFAULT 0.06;

-- ===========================================
-- ALTER TABLE: aio_elo_history
-- Add rd/volatility before/after columns
-- ===========================================
ALTER TABLE aio_elo_history
  ADD COLUMN IF NOT EXISTS rd_before NUMERIC,
  ADD COLUMN IF NOT EXISTS rd_after NUMERIC,
  ADD COLUMN IF NOT EXISTS volatility_before NUMERIC,
  ADD COLUMN IF NOT EXISTS volatility_after NUMERIC;

-- ===========================================
-- ALTER TABLE: aio_agent_domain_ratings
-- Add rating_deviation and volatility columns
-- ===========================================
ALTER TABLE aio_agent_domain_ratings
  ADD COLUMN IF NOT EXISTS rating_deviation NUMERIC DEFAULT 350,
  ADD COLUMN IF NOT EXISTS volatility NUMERIC DEFAULT 0.06;

-- ===========================================
-- FUNCTION: aio_update_agent_elo
-- Atomic update of agent rating with optional Glicko-2 params
-- ===========================================
CREATE OR REPLACE FUNCTION aio_update_agent_elo(
  p_agent_id uuid,
  p_new_rating NUMERIC,
  p_new_rd NUMERIC DEFAULT NULL,
  p_new_volatility NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE aio_agents
  SET
    elo_rating = p_new_rating,
    rating_deviation = COALESCE(p_new_rd, rating_deviation),
    volatility = COALESCE(p_new_volatility, volatility),
    updated_at = now()
  WHERE id = p_agent_id;
END;
$$;

-- ===========================================
-- FUNCTION: aio_upsert_domain_rating
-- Atomic upsert of domain-specific rating with optional Glicko-2 params
-- ===========================================
CREATE OR REPLACE FUNCTION aio_upsert_domain_rating(
  p_agent_id uuid,
  p_domain_id uuid,
  p_elo_rating NUMERIC,
  p_is_win BOOLEAN,
  p_rd NUMERIC DEFAULT NULL,
  p_volatility NUMERIC DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO aio_agent_domain_ratings (agent_id, domain_id, elo_rating, competitions_in_domain, wins_in_domain, rating_deviation, volatility)
  VALUES (p_agent_id, p_domain_id, p_elo_rating, 1, CASE WHEN p_is_win THEN 1 ELSE 0 END, COALESCE(p_rd, 350), COALESCE(p_volatility, 0.06))
  ON CONFLICT (agent_id, domain_id)
  DO UPDATE SET
    elo_rating = p_elo_rating,
    competitions_in_domain = aio_agent_domain_ratings.competitions_in_domain + 1,
    wins_in_domain = aio_agent_domain_ratings.wins_in_domain + CASE WHEN p_is_win THEN 1 ELSE 0 END,
    rating_deviation = COALESCE(p_rd, aio_agent_domain_ratings.rating_deviation),
    volatility = COALESCE(p_volatility, aio_agent_domain_ratings.volatility),
    updated_at = now();
END;
$$;
