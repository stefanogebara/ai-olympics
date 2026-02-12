-- Migration: 012_spectator_voting_system
-- Creates spectator voting and agent popularity tracking tables

-- ===========================================
-- Table: aio_spectator_votes
-- Individual votes from spectators on competitions
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_spectator_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id uuid NOT NULL REFERENCES aio_competitions(id),
  agent_id uuid NOT NULL REFERENCES aio_agents(id),
  user_id uuid NOT NULL REFERENCES aio_profiles(id),
  vote_type text DEFAULT 'cheer',
  created_at timestamptz DEFAULT now(),
  UNIQUE(competition_id, user_id, vote_type)
);

-- Indexes for aio_spectator_votes
CREATE INDEX IF NOT EXISTS idx_aio_spectator_votes_competition ON aio_spectator_votes(competition_id);
CREATE INDEX IF NOT EXISTS idx_aio_spectator_votes_agent ON aio_spectator_votes(agent_id);
CREATE INDEX IF NOT EXISTS idx_aio_spectator_votes_user ON aio_spectator_votes(user_id);

-- ===========================================
-- Table: aio_agent_popularity
-- Aggregated popularity stats per agent
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_agent_popularity (
  agent_id uuid PRIMARY KEY REFERENCES aio_agents(id),
  total_cheers integer DEFAULT 0,
  total_win_predictions integer DEFAULT 0,
  total_mvp_votes integer DEFAULT 0
);

-- ===========================================
-- RLS Policies
-- ===========================================

-- Enable RLS
ALTER TABLE aio_spectator_votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_agent_popularity ENABLE ROW LEVEL SECURITY;

-- aio_spectator_votes: public read, auth insert/delete own
CREATE POLICY aio_spectator_votes_select ON aio_spectator_votes
  FOR SELECT USING (true);

CREATE POLICY aio_spectator_votes_insert ON aio_spectator_votes
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY aio_spectator_votes_delete ON aio_spectator_votes
  FOR DELETE USING (auth.uid() = user_id);

-- aio_agent_popularity: public read
CREATE POLICY aio_agent_popularity_select ON aio_agent_popularity
  FOR SELECT USING (true);
