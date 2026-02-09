-- ============================================================================
-- 006: Reverse CAPTCHA - Agent Verification System
-- Proves competition participants are AI agents, not humans
-- ============================================================================

-- ============================================================================
-- 1. Verification Sessions
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.aio_verification_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL REFERENCES public.aio_agents(id) ON DELETE CASCADE,
  competition_id UUID REFERENCES public.aio_competitions(id) ON DELETE SET NULL,
  session_type TEXT NOT NULL DEFAULT 'gate' CHECK (session_type IN ('gate', 'periodic')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'passed', 'failed', 'expired')),
  verification_score NUMERIC(5,2) DEFAULT 0,
  speed_score NUMERIC(5,2) DEFAULT 0,
  structured_score NUMERIC(5,2) DEFAULT 0,
  behavioral_score NUMERIC(5,2) DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes'),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_sessions_agent ON public.aio_verification_sessions(agent_id);
CREATE INDEX idx_verification_sessions_status ON public.aio_verification_sessions(status);

-- ============================================================================
-- 2. Verification Challenges (individual results within a session)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.aio_verification_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.aio_verification_sessions(id) ON DELETE CASCADE,
  challenge_type TEXT NOT NULL CHECK (challenge_type IN (
    'speed_arithmetic', 'speed_json_parse', 'structured_output', 'behavioral_timing'
  )),
  challenge_payload JSONB NOT NULL DEFAULT '{}',
  expected_answer JSONB,
  actual_answer JSONB,
  passed BOOLEAN DEFAULT false,
  score NUMERIC(5,2) DEFAULT 0,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_verification_challenges_session ON public.aio_verification_challenges(session_id);

-- ============================================================================
-- 3. Agent Verification History (aggregate stats, one row per agent)
-- ============================================================================
CREATE TABLE IF NOT EXISTS public.aio_agent_verification_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL UNIQUE REFERENCES public.aio_agents(id) ON DELETE CASCADE,
  total_verifications INTEGER DEFAULT 0,
  total_passes INTEGER DEFAULT 0,
  average_score NUMERIC(5,2) DEFAULT 0,
  median_response_time_ms INTEGER DEFAULT 0,
  is_flagged BOOLEAN DEFAULT false,
  flag_reason TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_agent_verification_history_agent ON public.aio_agent_verification_history(agent_id);

-- ============================================================================
-- 4. Alter aio_agents - add verification columns
-- ============================================================================
ALTER TABLE public.aio_agents
  ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'flagged')),
  ADD COLUMN IF NOT EXISTS last_verification_score NUMERIC(5,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_verified_at TIMESTAMPTZ;

-- ============================================================================
-- 5. RLS Policies
-- ============================================================================

-- Verification Sessions
ALTER TABLE public.aio_verification_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own verification sessions"
  ON public.aio_verification_sessions FOR SELECT
  USING (
    agent_id IN (SELECT id FROM public.aio_agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can create verification sessions for their agents"
  ON public.aio_verification_sessions FOR INSERT
  WITH CHECK (
    agent_id IN (SELECT id FROM public.aio_agents WHERE owner_id = auth.uid())
  );

CREATE POLICY "Users can update their own verification sessions"
  ON public.aio_verification_sessions FOR UPDATE
  USING (
    agent_id IN (SELECT id FROM public.aio_agents WHERE owner_id = auth.uid())
  );

-- Verification Challenges
ALTER TABLE public.aio_verification_challenges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view challenges for their sessions"
  ON public.aio_verification_challenges FOR SELECT
  USING (
    session_id IN (
      SELECT vs.id FROM public.aio_verification_sessions vs
      JOIN public.aio_agents a ON vs.agent_id = a.id
      WHERE a.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can insert challenges for their sessions"
  ON public.aio_verification_challenges FOR INSERT
  WITH CHECK (
    session_id IN (
      SELECT vs.id FROM public.aio_verification_sessions vs
      JOIN public.aio_agents a ON vs.agent_id = a.id
      WHERE a.owner_id = auth.uid()
    )
  );

CREATE POLICY "Users can update challenges for their sessions"
  ON public.aio_verification_challenges FOR UPDATE
  USING (
    session_id IN (
      SELECT vs.id FROM public.aio_verification_sessions vs
      JOIN public.aio_agents a ON vs.agent_id = a.id
      WHERE a.owner_id = auth.uid()
    )
  );

-- Verification History
ALTER TABLE public.aio_agent_verification_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Verification history is viewable by everyone"
  ON public.aio_agent_verification_history FOR SELECT
  USING (true);

CREATE POLICY "Users can manage their agent verification history"
  ON public.aio_agent_verification_history FOR ALL
  USING (
    agent_id IN (SELECT id FROM public.aio_agents WHERE owner_id = auth.uid())
  );

-- ============================================================================
-- 6. Auto-expire sessions (function + trigger)
-- ============================================================================
CREATE OR REPLACE FUNCTION public.expire_verification_sessions()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE public.aio_verification_sessions
  SET status = 'expired'
  WHERE status IN ('pending', 'in_progress')
    AND expires_at < NOW();
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Run expiration check on new session inserts
DROP TRIGGER IF EXISTS trigger_expire_verification_sessions ON public.aio_verification_sessions;
CREATE TRIGGER trigger_expire_verification_sessions
  AFTER INSERT ON public.aio_verification_sessions
  FOR EACH STATEMENT
  EXECUTE FUNCTION public.expire_verification_sessions();
