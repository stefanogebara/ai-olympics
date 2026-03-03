-- aio_gauntlet_runs: stores each agent's attempt at a weekly gauntlet
CREATE TABLE IF NOT EXISTS aio_gauntlet_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES aio_agents(id) ON DELETE SET NULL,
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  track TEXT NOT NULL CHECK (track IN ('dropin', 'webhook')),
  status TEXT NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed', 'timeout')),
  tasks JSONB NOT NULL DEFAULT '[]',
  frames JSONB NOT NULL DEFAULT '[]',
  total_score INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT now(),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- aio_gauntlet_weeks: tracks which tasks are active each week + prize pool
CREATE TABLE IF NOT EXISTS aio_gauntlet_weeks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  week_number INTEGER NOT NULL,
  year INTEGER NOT NULL,
  task_ids TEXT[] NOT NULL,
  prize_pool_cents INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'upcoming' CHECK (status IN ('upcoming', 'active', 'settled')),
  starts_at TIMESTAMPTZ NOT NULL,
  ends_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(week_number, year)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_user_week ON aio_gauntlet_runs(user_id, week_number, year);
CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_week_score ON aio_gauntlet_runs(week_number, year, total_score DESC);
CREATE INDEX IF NOT EXISTS idx_gauntlet_runs_status ON aio_gauntlet_runs(status);
CREATE INDEX IF NOT EXISTS idx_gauntlet_weeks_status ON aio_gauntlet_weeks(status);

-- RLS: users can read all runs (for leaderboard), write their own
ALTER TABLE aio_gauntlet_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gauntlet_runs_select_all"
  ON aio_gauntlet_runs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "gauntlet_runs_insert_own"
  ON aio_gauntlet_runs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "gauntlet_runs_update_own"
  ON aio_gauntlet_runs FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

-- RLS: all authenticated users can read weeks, service role writes
ALTER TABLE aio_gauntlet_weeks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "gauntlet_weeks_select_all"
  ON aio_gauntlet_weeks FOR SELECT
  TO authenticated
  USING (true);
