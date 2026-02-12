-- Migration: 009_elo_rating_system
-- Creates ELO rating system tables for tracking agent performance across domains

-- ===========================================
-- Table: aio_elo_history
-- Tracks rating changes per competition
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_elo_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES aio_agents(id),
  competition_id uuid NOT NULL REFERENCES aio_competitions(id),
  rating_before integer NOT NULL,
  rating_after integer NOT NULL,
  rating_change integer NOT NULL,
  domain_id uuid REFERENCES aio_domains(id),
  final_rank integer NOT NULL,
  participant_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for aio_elo_history
CREATE INDEX IF NOT EXISTS idx_aio_elo_history_agent_id ON aio_elo_history(agent_id);
CREATE INDEX IF NOT EXISTS idx_aio_elo_history_competition_id ON aio_elo_history(competition_id);
CREATE INDEX IF NOT EXISTS idx_aio_elo_history_created_at ON aio_elo_history(created_at DESC);

-- ===========================================
-- Table: aio_agent_domain_ratings
-- Current ELO rating per agent per domain
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_agent_domain_ratings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES aio_agents(id),
  domain_id uuid NOT NULL REFERENCES aio_domains(id),
  elo_rating integer NOT NULL DEFAULT 1500,
  competitions_in_domain integer NOT NULL DEFAULT 0,
  wins_in_domain integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(agent_id, domain_id)
);

-- Indexes for aio_agent_domain_ratings
CREATE INDEX IF NOT EXISTS idx_aio_agent_domain_ratings_agent_id ON aio_agent_domain_ratings(agent_id);
CREATE INDEX IF NOT EXISTS idx_aio_agent_domain_ratings_domain_id ON aio_agent_domain_ratings(domain_id);

-- ===========================================
-- RLS Policies
-- ===========================================

-- Enable RLS
ALTER TABLE aio_elo_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_agent_domain_ratings ENABLE ROW LEVEL SECURITY;

-- aio_elo_history: public read, service insert
CREATE POLICY aio_elo_history_public_read ON aio_elo_history
  FOR SELECT USING (true);

CREATE POLICY aio_elo_history_service_insert ON aio_elo_history
  FOR INSERT WITH CHECK (true);

-- aio_agent_domain_ratings: public read, service upsert/update
CREATE POLICY aio_agent_domain_ratings_public_read ON aio_agent_domain_ratings
  FOR SELECT USING (true);

CREATE POLICY aio_agent_domain_ratings_service_upsert ON aio_agent_domain_ratings
  FOR INSERT WITH CHECK (true);

CREATE POLICY aio_agent_domain_ratings_service_update ON aio_agent_domain_ratings
  FOR UPDATE USING (true) WITH CHECK (true);
