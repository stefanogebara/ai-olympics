-- ============================================================
-- Index for puzzle age queries
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_puzzles_created_at
  ON public.aio_puzzles(created_at);

-- ============================================================
-- Function to clean up old puzzles (older than 7 days)
-- Keeps table from growing unbounded
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_old_puzzles()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count integer;
BEGIN
  DELETE FROM public.aio_puzzles
  WHERE created_at < NOW() - INTERVAL '7 days'
  AND puzzle_id NOT IN (
    SELECT DISTINCT puzzle_id FROM public.aio_puzzle_attempts
    WHERE puzzle_id IS NOT NULL
  );
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

-- ============================================================
-- Schedule via pg_cron if available (Supabase has it enabled)
-- Runs daily at 3 AM UTC
-- ============================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('cleanup-old-puzzles');
    PERFORM cron.schedule(
      'cleanup-old-puzzles',
      '0 3 * * *',
      'SELECT public.cleanup_old_puzzles()'
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron not available, skipping scheduled cleanup: %', SQLERRM;
END $$;
