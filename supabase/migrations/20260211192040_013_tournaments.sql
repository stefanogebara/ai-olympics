-- Migration: 013_tournaments
-- Creates tournament bracket system tables

-- ===========================================
-- Table: aio_tournaments
-- Tournament definitions with bracket configuration
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_tournaments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain_id uuid REFERENCES aio_domains(id),
  bracket_type text NOT NULL,
  status text DEFAULT 'lobby',
  max_participants integer DEFAULT 16,
  task_ids text[],
  best_of integer DEFAULT 1,
  current_round integer DEFAULT 0,
  total_rounds integer,
  bracket_data jsonb DEFAULT '{}'::jsonb,
  seeds jsonb DEFAULT '[]'::jsonb,
  created_by uuid REFERENCES aio_profiles(id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes for aio_tournaments
CREATE INDEX IF NOT EXISTS idx_aio_tournaments_domain_id ON aio_tournaments(domain_id);
CREATE INDEX IF NOT EXISTS idx_aio_tournaments_status ON aio_tournaments(status);
CREATE INDEX IF NOT EXISTS idx_aio_tournaments_created_by ON aio_tournaments(created_by);

-- ===========================================
-- Table: aio_tournament_participants
-- Agents registered in a tournament
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_tournament_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES aio_tournaments(id),
  agent_id uuid NOT NULL REFERENCES aio_agents(id),
  user_id uuid NOT NULL REFERENCES aio_profiles(id),
  seed_number integer,
  final_placement integer,
  matches_won integer DEFAULT 0,
  matches_lost integer DEFAULT 0,
  total_score integer DEFAULT 0,
  UNIQUE(tournament_id, agent_id)
);

-- Indexes for aio_tournament_participants
CREATE INDEX IF NOT EXISTS idx_aio_tournament_participants_tournament_id ON aio_tournament_participants(tournament_id);
CREATE INDEX IF NOT EXISTS idx_aio_tournament_participants_agent_id ON aio_tournament_participants(agent_id);
CREATE INDEX IF NOT EXISTS idx_aio_tournament_participants_user_id ON aio_tournament_participants(user_id);

-- ===========================================
-- Table: aio_tournament_matches
-- Individual matches within a tournament bracket
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_tournament_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tournament_id uuid NOT NULL REFERENCES aio_tournaments(id),
  round_number integer NOT NULL,
  match_number integer NOT NULL,
  agent_1_id uuid REFERENCES aio_agents(id),
  agent_2_id uuid REFERENCES aio_agents(id),
  competition_id uuid REFERENCES aio_competitions(id),
  winner_id uuid REFERENCES aio_agents(id),
  agent_1_score integer,
  agent_2_score integer,
  is_bye boolean DEFAULT false,
  status text DEFAULT 'pending'
);

-- Indexes for aio_tournament_matches
CREATE INDEX IF NOT EXISTS idx_aio_tournament_matches_tournament_id ON aio_tournament_matches(tournament_id);
CREATE INDEX IF NOT EXISTS idx_aio_tournament_matches_competition_id ON aio_tournament_matches(competition_id);
CREATE INDEX IF NOT EXISTS idx_aio_tournament_matches_agent_1_id ON aio_tournament_matches(agent_1_id);
CREATE INDEX IF NOT EXISTS idx_aio_tournament_matches_agent_2_id ON aio_tournament_matches(agent_2_id);

-- ===========================================
-- RLS Policies
-- ===========================================

-- Enable RLS
ALTER TABLE aio_tournaments ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_tournament_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_tournament_matches ENABLE ROW LEVEL SECURITY;

-- aio_tournaments: public read, creator insert/update
CREATE POLICY aio_tournaments_select ON aio_tournaments
  FOR SELECT USING (true);

CREATE POLICY aio_tournaments_insert ON aio_tournaments
  FOR INSERT WITH CHECK (auth.uid() = created_by);

CREATE POLICY aio_tournaments_update ON aio_tournaments
  FOR UPDATE USING (auth.uid() = created_by);

-- aio_tournament_participants: public read, own insert/delete
CREATE POLICY aio_tournament_participants_select ON aio_tournament_participants
  FOR SELECT USING (true);

CREATE POLICY aio_tournament_participants_insert ON aio_tournament_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY aio_tournament_participants_delete ON aio_tournament_participants
  FOR DELETE USING (auth.uid() = user_id);

-- aio_tournament_matches: public read, service insert/update
CREATE POLICY aio_tournament_matches_select ON aio_tournament_matches
  FOR SELECT USING (true);

CREATE POLICY aio_tournament_matches_public_read ON aio_tournament_matches
  FOR SELECT USING (true);

CREATE POLICY aio_tournament_matches_service_insert ON aio_tournament_matches
  FOR INSERT WITH CHECK (true);

CREATE POLICY aio_tournament_matches_service_update ON aio_tournament_matches
  FOR UPDATE USING (true);
