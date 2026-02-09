-- AI Olympics - Games & Puzzles Schema
-- Migration: 004_games_puzzles.sql
-- Adds tables for logic puzzles and games playable by both humans and AI agents

-- ============================================
-- GAME TYPES
-- Registry of available game/puzzle types
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_game_types (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  instructions TEXT,
  category TEXT DEFAULT 'puzzle' CHECK (category IN ('puzzle', 'trivia', 'strategy', 'speed')),
  difficulty_levels TEXT[] DEFAULT ARRAY['easy', 'medium', 'hard'],
  time_limit_seconds INTEGER DEFAULT 300,
  max_score INTEGER DEFAULT 1000,
  supports_human BOOLEAN DEFAULT true,
  supports_ai BOOLEAN DEFAULT true,
  external_api TEXT,
  config JSONB DEFAULT '{}'::jsonb,
  icon TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- PUZZLES
-- Individual puzzle instances for each game type
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_puzzles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL REFERENCES public.aio_game_types(id) ON DELETE CASCADE,
  puzzle_id TEXT, -- External ID (e.g., from Lichess, Open Trivia DB)
  difficulty TEXT NOT NULL,
  question TEXT NOT NULL,
  options JSONB, -- For multiple choice: [{id, text}]
  correct_answer TEXT,
  answer_data JSONB, -- Additional data for verifying answers
  hint TEXT,
  explanation TEXT,
  time_limit_seconds INTEGER,
  points INTEGER DEFAULT 100,
  source TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for puzzle queries
CREATE INDEX IF NOT EXISTS idx_puzzles_game_type
  ON public.aio_puzzles(game_type);
CREATE INDEX IF NOT EXISTS idx_puzzles_difficulty
  ON public.aio_puzzles(difficulty);
CREATE INDEX IF NOT EXISTS idx_puzzles_external_id
  ON public.aio_puzzles(puzzle_id);

-- ============================================
-- PUZZLE ATTEMPTS
-- Record of all puzzle attempt (both human and AI)
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_puzzle_attempts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.aio_agents(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL REFERENCES public.aio_game_types(id),
  puzzle_id UUID REFERENCES public.aio_puzzles(id),
  difficulty TEXT NOT NULL,
  question TEXT,
  user_answer TEXT,
  correct_answer TEXT,
  is_correct BOOLEAN,
  score INTEGER DEFAULT 0,
  time_ms INTEGER,
  hints_used INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CHECK (user_id IS NOT NULL OR agent_id IS NOT NULL)
);

-- Create indexes for attempt queries
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user
  ON public.aio_puzzle_attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_agent
  ON public.aio_puzzle_attempts(agent_id);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_game_type
  ON public.aio_puzzle_attempts(game_type);
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_created
  ON public.aio_puzzle_attempts(created_at DESC);

-- ============================================
-- GAME SESSIONS
-- Track active game sessions for multi-puzzle games
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_game_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.aio_agents(id) ON DELETE CASCADE,
  game_type TEXT NOT NULL REFERENCES public.aio_game_types(id),
  difficulty TEXT NOT NULL,
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned')),
  total_puzzles INTEGER DEFAULT 0,
  puzzles_completed INTEGER DEFAULT 0,
  puzzles_correct INTEGER DEFAULT 0,
  total_score INTEGER DEFAULT 0,
  total_time_ms INTEGER DEFAULT 0,
  streak INTEGER DEFAULT 0,
  best_streak INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CHECK (user_id IS NOT NULL OR agent_id IS NOT NULL)
);

-- Create indexes for session queries
CREATE INDEX IF NOT EXISTS idx_game_sessions_user
  ON public.aio_game_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_agent
  ON public.aio_game_sessions(agent_id);
CREATE INDEX IF NOT EXISTS idx_game_sessions_status
  ON public.aio_game_sessions(status);

-- ============================================
-- GAME LEADERBOARDS
-- Aggregated stats per game type
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_game_leaderboards (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL REFERENCES public.aio_game_types(id),
  user_id UUID REFERENCES public.aio_profiles(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.aio_agents(id) ON DELETE CASCADE,
  total_score INTEGER DEFAULT 0,
  puzzles_attempted INTEGER DEFAULT 0,
  puzzles_solved INTEGER DEFAULT 0,
  accuracy DECIMAL(5,2) DEFAULT 0,
  average_time_ms INTEGER,
  best_streak INTEGER DEFAULT 0,
  sessions_completed INTEGER DEFAULT 0,
  last_played_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_type, user_id),
  UNIQUE(game_type, agent_id),
  CHECK (user_id IS NOT NULL OR agent_id IS NOT NULL)
);

-- Create indexes for leaderboard queries
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_game_type
  ON public.aio_game_leaderboards(game_type);
CREATE INDEX IF NOT EXISTS idx_game_leaderboards_score
  ON public.aio_game_leaderboards(total_score DESC);

-- ============================================
-- DAILY CHALLENGES
-- Featured daily puzzle challenges
-- ============================================
CREATE TABLE IF NOT EXISTS public.aio_daily_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  game_type TEXT NOT NULL REFERENCES public.aio_game_types(id),
  puzzle_id UUID REFERENCES public.aio_puzzles(id),
  challenge_date DATE NOT NULL DEFAULT CURRENT_DATE,
  bonus_multiplier DECIMAL(3,2) DEFAULT 1.5,
  participation_count INTEGER DEFAULT 0,
  average_score INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(game_type, challenge_date)
);

-- Create index for daily challenge queries
CREATE INDEX IF NOT EXISTS idx_daily_challenges_date
  ON public.aio_daily_challenges(challenge_date DESC);

-- ============================================
-- ENABLE ROW LEVEL SECURITY
-- ============================================
ALTER TABLE public.aio_game_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_puzzles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_puzzle_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_game_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_game_leaderboards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_daily_challenges ENABLE ROW LEVEL SECURITY;

-- ============================================
-- RLS POLICIES
-- ============================================

-- Game types: viewable by everyone
CREATE POLICY "Game types are viewable by everyone"
  ON public.aio_game_types FOR SELECT
  USING (true);

-- Puzzles: viewable by everyone (answers hidden by view)
CREATE POLICY "Puzzles are viewable by everyone"
  ON public.aio_puzzles FOR SELECT
  USING (true);

-- Puzzle attempts: viewable by everyone (for social features)
CREATE POLICY "Puzzle attempts are viewable by everyone"
  ON public.aio_puzzle_attempts FOR SELECT
  USING (true);

-- Users/agents can record their own attempts
CREATE POLICY "Users can record their puzzle attempts"
  ON public.aio_puzzle_attempts FOR INSERT
  WITH CHECK (auth.uid() = user_id OR agent_id IS NOT NULL);

-- Game sessions: viewable by everyone
CREATE POLICY "Game sessions are viewable by everyone"
  ON public.aio_game_sessions FOR SELECT
  USING (true);

-- Users can manage their own sessions
CREATE POLICY "Users can manage their game sessions"
  ON public.aio_game_sessions FOR ALL
  USING (auth.uid() = user_id OR agent_id IS NOT NULL);

-- Leaderboards: viewable by everyone
CREATE POLICY "Game leaderboards are viewable by everyone"
  ON public.aio_game_leaderboards FOR SELECT
  USING (true);

-- Users can update their own leaderboard entry
CREATE POLICY "Users can update their leaderboard entry"
  ON public.aio_game_leaderboards FOR ALL
  USING (auth.uid() = user_id OR agent_id IS NOT NULL);

-- Daily challenges: viewable by everyone
CREATE POLICY "Daily challenges are viewable by everyone"
  ON public.aio_daily_challenges FOR SELECT
  USING (true);

-- ============================================
-- FUNCTIONS
-- ============================================

-- Function to update leaderboard after puzzle attempt
CREATE OR REPLACE FUNCTION public.update_game_leaderboard_after_attempt()
RETURNS TRIGGER AS $$
BEGIN
  -- Update or insert leaderboard entry for users
  IF NEW.user_id IS NOT NULL THEN
    INSERT INTO public.aio_game_leaderboards (game_type, user_id, total_score, puzzles_attempted, puzzles_solved, accuracy)
    VALUES (
      NEW.game_type,
      NEW.user_id,
      CASE WHEN NEW.is_correct THEN NEW.score ELSE 0 END,
      1,
      CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      CASE WHEN NEW.is_correct THEN 100 ELSE 0 END
    )
    ON CONFLICT (game_type, user_id) DO UPDATE SET
      total_score = aio_game_leaderboards.total_score + CASE WHEN NEW.is_correct THEN NEW.score ELSE 0 END,
      puzzles_attempted = aio_game_leaderboards.puzzles_attempted + 1,
      puzzles_solved = aio_game_leaderboards.puzzles_solved + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      accuracy = ROUND(
        ((aio_game_leaderboards.puzzles_solved + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)::decimal /
        (aio_game_leaderboards.puzzles_attempted + 1) * 100)::numeric, 2
      ),
      average_time_ms = CASE
        WHEN NEW.time_ms IS NOT NULL THEN
          COALESCE(
            (COALESCE(aio_game_leaderboards.average_time_ms, 0) * aio_game_leaderboards.puzzles_attempted + NEW.time_ms) /
            (aio_game_leaderboards.puzzles_attempted + 1),
            NEW.time_ms
          )
        ELSE aio_game_leaderboards.average_time_ms
      END,
      last_played_at = NOW(),
      updated_at = NOW();
  END IF;

  -- Update or insert leaderboard entry for agents
  IF NEW.agent_id IS NOT NULL THEN
    INSERT INTO public.aio_game_leaderboards (game_type, agent_id, total_score, puzzles_attempted, puzzles_solved, accuracy)
    VALUES (
      NEW.game_type,
      NEW.agent_id,
      CASE WHEN NEW.is_correct THEN NEW.score ELSE 0 END,
      1,
      CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      CASE WHEN NEW.is_correct THEN 100 ELSE 0 END
    )
    ON CONFLICT (game_type, agent_id) DO UPDATE SET
      total_score = aio_game_leaderboards.total_score + CASE WHEN NEW.is_correct THEN NEW.score ELSE 0 END,
      puzzles_attempted = aio_game_leaderboards.puzzles_attempted + 1,
      puzzles_solved = aio_game_leaderboards.puzzles_solved + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END,
      accuracy = ROUND(
        ((aio_game_leaderboards.puzzles_solved + CASE WHEN NEW.is_correct THEN 1 ELSE 0 END)::decimal /
        (aio_game_leaderboards.puzzles_attempted + 1) * 100)::numeric, 2
      ),
      average_time_ms = CASE
        WHEN NEW.time_ms IS NOT NULL THEN
          COALESCE(
            (COALESCE(aio_game_leaderboards.average_time_ms, 0) * aio_game_leaderboards.puzzles_attempted + NEW.time_ms) /
            (aio_game_leaderboards.puzzles_attempted + 1),
            NEW.time_ms
          )
        ELSE aio_game_leaderboards.average_time_ms
      END,
      last_played_at = NOW(),
      updated_at = NOW();
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update leaderboard after puzzle attempt
DROP TRIGGER IF EXISTS on_puzzle_attempt ON public.aio_puzzle_attempts;
CREATE TRIGGER on_puzzle_attempt
  AFTER INSERT ON public.aio_puzzle_attempts
  FOR EACH ROW EXECUTE FUNCTION public.update_game_leaderboard_after_attempt();

-- ============================================
-- VIEWS
-- ============================================

-- View for puzzle (hides answer for active puzzles)
CREATE OR REPLACE VIEW public.aio_puzzles_safe AS
SELECT
  id,
  game_type,
  puzzle_id,
  difficulty,
  question,
  options,
  hint,
  time_limit_seconds,
  points,
  source,
  metadata,
  created_at
FROM public.aio_puzzles;

GRANT SELECT ON public.aio_puzzles_safe TO authenticated;
GRANT SELECT ON public.aio_puzzles_safe TO anon;

-- View for combined game leaderboard (humans + AI)
CREATE OR REPLACE VIEW public.aio_combined_game_leaderboard AS
SELECT
  l.id,
  l.game_type,
  gt.name AS game_name,
  'user' AS player_type,
  l.user_id AS player_id,
  p.username AS player_name,
  p.avatar_url,
  l.total_score,
  l.puzzles_attempted,
  l.puzzles_solved,
  l.accuracy,
  l.average_time_ms,
  l.best_streak,
  l.sessions_completed,
  l.last_played_at
FROM public.aio_game_leaderboards l
JOIN public.aio_game_types gt ON gt.id = l.game_type
JOIN public.aio_profiles p ON p.id = l.user_id
WHERE l.user_id IS NOT NULL

UNION ALL

SELECT
  l.id,
  l.game_type,
  gt.name AS game_name,
  'agent' AS player_type,
  l.agent_id AS player_id,
  a.name AS player_name,
  NULL AS avatar_url,
  l.total_score,
  l.puzzles_attempted,
  l.puzzles_solved,
  l.accuracy,
  l.average_time_ms,
  l.best_streak,
  l.sessions_completed,
  l.last_played_at
FROM public.aio_game_leaderboards l
JOIN public.aio_game_types gt ON gt.id = l.game_type
JOIN public.aio_agents a ON a.id = l.agent_id
WHERE l.agent_id IS NOT NULL

ORDER BY total_score DESC;

GRANT SELECT ON public.aio_combined_game_leaderboard TO authenticated;
GRANT SELECT ON public.aio_combined_game_leaderboard TO anon;

-- ============================================
-- SEED DATA: Initial Game Types
-- ============================================
INSERT INTO public.aio_game_types (id, name, description, instructions, category, difficulty_levels, time_limit_seconds, max_score, external_api, icon) VALUES
  ('trivia', 'Trivia Challenge', 'Test your knowledge with multiple choice questions across various topics.', 'Answer the question by selecting the correct option. You have limited time per question.', 'trivia', ARRAY['easy', 'medium', 'hard'], 30, 100, 'opentdb', '?'),
  ('math', 'Math Challenge', 'Solve mathematical problems ranging from basic arithmetic to complex calculations.', 'Enter the numerical answer. No calculators allowed!', 'puzzle', ARRAY['easy', 'medium', 'hard'], 60, 100, NULL, '+'),
  ('chess', 'Chess Puzzles', 'Find the best move in these chess positions.', 'Enter your move in algebraic notation (e.g., e4, Nxf6, O-O).', 'strategy', ARRAY['easy', 'medium', 'hard'], 120, 100, 'lichess', '#'),
  ('word', 'Word Logic', 'Anagrams, word puzzles, and vocabulary challenges.', 'Unscramble the letters or solve the word puzzle.', 'puzzle', ARRAY['easy', 'medium', 'hard'], 45, 100, NULL, 'A'),
  ('logic', 'Logic Puzzles', 'Solve logical reasoning challenges and pattern recognition problems.', 'Analyze the pattern and determine the answer.', 'puzzle', ARRAY['easy', 'medium', 'hard'], 90, 100, NULL, '!')
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  instructions = EXCLUDED.instructions,
  updated_at = NOW();
