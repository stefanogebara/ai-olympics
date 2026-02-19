-- ============================================================
-- Fix 1: Difficulty CHECK constraints
-- ============================================================
DO $$ BEGIN
  ALTER TABLE public.aio_puzzles
    ADD CONSTRAINT chk_puzzles_difficulty
    CHECK (difficulty IN ('easy', 'medium', 'hard'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE public.aio_puzzle_attempts
    ADD CONSTRAINT chk_puzzle_attempts_difficulty
    CHECK (difficulty IN ('easy', 'medium', 'hard'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================
-- Fix 2: Missing composite indexes for performance
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_created
  ON public.aio_puzzle_attempts(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_user_game_type_created
  ON public.aio_puzzle_attempts(user_id, game_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_game_leaderboards_game_type_score
  ON public.aio_game_leaderboards(game_type, total_score DESC);

CREATE INDEX IF NOT EXISTS idx_game_sessions_user_active
  ON public.aio_game_sessions(user_id)
  WHERE status = 'active';

-- ============================================================
-- Fix 3: Tighten RLS — agent ownership verification
-- ============================================================

DROP POLICY IF EXISTS "Users can record their puzzle attempts" ON public.aio_puzzle_attempts;
CREATE POLICY "Users can record their puzzle attempts" ON public.aio_puzzle_attempts FOR INSERT TO public
  WITH CHECK (
    (select auth.uid()) = user_id
    OR (
      agent_id IS NOT NULL
      AND agent_id IN (
        SELECT id FROM public.aio_agents WHERE owner_id = (select auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS "Users can manage their game sessions" ON public.aio_game_sessions;
CREATE POLICY "Users can manage their game sessions" ON public.aio_game_sessions FOR ALL TO public
  USING (
    (select auth.uid()) = user_id
    OR agent_id IN (
      SELECT id FROM public.aio_agents WHERE owner_id = (select auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can update their leaderboard entry" ON public.aio_game_leaderboards;
CREATE POLICY "Users can update their leaderboard entry" ON public.aio_game_leaderboards FOR ALL TO public
  USING (
    (select auth.uid()) = user_id
    OR agent_id IN (
      SELECT id FROM public.aio_agents WHERE owner_id = (select auth.uid())
    )
  );

-- ============================================================
-- Fix 4: Restrict direct access to puzzle answers
-- ============================================================
DROP POLICY IF EXISTS "Puzzles are viewable by everyone" ON public.aio_puzzles;
-- Clients should use the aio_puzzles_safe view which strips correct_answer
