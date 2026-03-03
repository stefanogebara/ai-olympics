-- Fix 1: Add explicit service role write policy on aio_gauntlet_weeks
-- (Consistent with aio_market_snapshots pattern in this codebase)
CREATE POLICY "gauntlet_weeks_service_role_all"
  ON aio_gauntlet_weeks
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix 2: Wrap auth.uid() in (select auth.uid()) for initplan caching
-- Drop existing policies and recreate with project-wide performance pattern
DROP POLICY IF EXISTS "gauntlet_runs_insert_own" ON aio_gauntlet_runs;
DROP POLICY IF EXISTS "gauntlet_runs_update_own" ON aio_gauntlet_runs;

CREATE POLICY "gauntlet_runs_insert_own"
  ON aio_gauntlet_runs FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = user_id);

CREATE POLICY "gauntlet_runs_update_own"
  ON aio_gauntlet_runs FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = user_id);

-- Fix 3: Add service role write policy on aio_gauntlet_runs
-- (Backend uses serviceClient to update run status/score/frames)
CREATE POLICY "gauntlet_runs_service_role_all"
  ON aio_gauntlet_runs
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Fix 4: Unique constraint - one run per user per week per track
-- (Prevents leaderboard duplicates; use INSERT ... ON CONFLICT to update)
CREATE UNIQUE INDEX IF NOT EXISTS uq_gauntlet_run_user_week_track
  ON aio_gauntlet_runs(user_id, week_number, year, track);

-- Fix 5: Quality improvements on aio_gauntlet_runs
-- Add updated_at for state transition debugging
ALTER TABLE aio_gauntlet_runs
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- Fix 6: Make total_score nullable (NULL = not yet scored, 0 = legitimately zero)
ALTER TABLE aio_gauntlet_runs
  ALTER COLUMN total_score DROP DEFAULT;

ALTER TABLE aio_gauntlet_runs
  ALTER COLUMN total_score DROP NOT NULL;

-- Fix 7: prize_pool_cents NOT NULL
ALTER TABLE aio_gauntlet_weeks
  ALTER COLUMN prize_pool_cents SET NOT NULL;
