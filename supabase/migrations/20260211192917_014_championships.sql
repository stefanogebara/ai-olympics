-- Migration: 014_championships
-- Creates championship (multi-round, points-based) system tables

-- ===========================================
-- Table: aio_championships
-- Championship definitions with points configuration
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_championships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  domain_id uuid REFERENCES aio_domains(id),
  status text DEFAULT 'registration',
  total_rounds integer NOT NULL DEFAULT 3,
  current_round integer DEFAULT 0,
  format text DEFAULT 'points',
  round_schedule jsonb DEFAULT '[]'::jsonb,
  points_config jsonb DEFAULT '{"1st": 25, "2nd": 18, "3rd": 15, "4th": 12, "5th": 10, "6th": 8, "7th": 6, "8th": 4}'::jsonb,
  elimination_after_round integer,
  max_participants integer DEFAULT 32,
  entry_requirements jsonb DEFAULT '{}'::jsonb,
  created_by uuid REFERENCES aio_profiles(id),
  registration_deadline timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- Indexes for aio_championships
CREATE INDEX IF NOT EXISTS idx_championships_domain ON aio_championships(domain_id);
CREATE INDEX IF NOT EXISTS idx_championships_status ON aio_championships(status);
CREATE INDEX IF NOT EXISTS idx_championships_created_by ON aio_championships(created_by);

-- ===========================================
-- Table: aio_championship_participants
-- Agents registered in a championship
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_championship_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES aio_championships(id),
  agent_id uuid NOT NULL REFERENCES aio_agents(id),
  user_id uuid NOT NULL REFERENCES aio_profiles(id),
  total_points integer DEFAULT 0,
  rounds_completed integer DEFAULT 0,
  current_rank integer,
  is_eliminated boolean DEFAULT false,
  UNIQUE(championship_id, agent_id)
);

-- Indexes for aio_championship_participants
CREATE INDEX IF NOT EXISTS idx_champ_participants_championship ON aio_championship_participants(championship_id);
CREATE INDEX IF NOT EXISTS idx_champ_participants_agent ON aio_championship_participants(agent_id);
CREATE INDEX IF NOT EXISTS idx_champ_participants_user ON aio_championship_participants(user_id);

-- ===========================================
-- Table: aio_championship_rounds
-- Individual rounds within a championship
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_championship_rounds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  championship_id uuid NOT NULL REFERENCES aio_championships(id),
  round_number integer NOT NULL,
  competition_id uuid REFERENCES aio_competitions(id),
  task_ids text[],
  status text DEFAULT 'scheduled',
  scheduled_at timestamptz,
  UNIQUE(championship_id, round_number)
);

-- Indexes for aio_championship_rounds
CREATE INDEX IF NOT EXISTS idx_champ_rounds_championship ON aio_championship_rounds(championship_id);
CREATE INDEX IF NOT EXISTS idx_champ_rounds_competition ON aio_championship_rounds(competition_id);

-- ===========================================
-- Table: aio_championship_round_results
-- Results per participant per round
-- ===========================================
CREATE TABLE IF NOT EXISTS aio_championship_round_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id uuid NOT NULL REFERENCES aio_championship_rounds(id),
  participant_id uuid NOT NULL REFERENCES aio_championship_participants(id),
  round_rank integer,
  points_awarded integer DEFAULT 0,
  UNIQUE(round_id, participant_id)
);

-- Indexes for aio_championship_round_results
CREATE INDEX IF NOT EXISTS idx_champ_round_results_round ON aio_championship_round_results(round_id);
CREATE INDEX IF NOT EXISTS idx_champ_round_results_participant ON aio_championship_round_results(participant_id);

-- ===========================================
-- RLS Policies
-- ===========================================

-- Enable RLS
ALTER TABLE aio_championships ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_championship_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_championship_rounds ENABLE ROW LEVEL SECURITY;
ALTER TABLE aio_championship_round_results ENABLE ROW LEVEL SECURITY;

-- aio_championships: public read, auth create, service manage
CREATE POLICY "Anyone can view championships" ON aio_championships
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can create championships" ON aio_championships
  FOR INSERT WITH CHECK (auth.uid() IS NOT NULL);

CREATE POLICY "Service role manages championships" ON aio_championships
  FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- aio_championship_participants: public read, auth join, service manage
CREATE POLICY "Anyone can view championship participants" ON aio_championship_participants
  FOR SELECT USING (true);

CREATE POLICY "Authenticated users can join championships" ON aio_championship_participants
  FOR INSERT WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role manages championship participants" ON aio_championship_participants
  FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- aio_championship_rounds: public read, service manage
CREATE POLICY "Anyone can view championship rounds" ON aio_championship_rounds
  FOR SELECT USING (true);

CREATE POLICY "Service role manages championship rounds" ON aio_championship_rounds
  FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');

-- aio_championship_round_results: public read, service manage
CREATE POLICY "Anyone can view championship round results" ON aio_championship_round_results
  FOR SELECT USING (true);

CREATE POLICY "Service role manages championship round results" ON aio_championship_round_results
  FOR ALL USING ((auth.jwt() ->> 'role') = 'service_role');
