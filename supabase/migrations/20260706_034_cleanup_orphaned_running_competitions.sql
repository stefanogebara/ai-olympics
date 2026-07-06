-- Migration 034: one-time cleanup of orphaned 'running' competitions
--
-- The live E2E audit found 98 of 100 competitions stuck in status='running' with
-- 0 participants (all "Lightning Round", started 2026-03-02) — leftovers from the
-- legacy no-op competition-start bug and from crash/restarts that had no Redis
-- snapshot for the snapshot-based crash recovery to act on (Redis is optional).
-- Each renders a permanent "waiting for agents" live view and pollutes the
-- browse / leaderboard / "happening now" surfaces as fake-live competitions.
--
-- This cancels rows still 'running' past a generous 2-hour staleness window (no
-- real competition runs anywhere near that long). Real-money competitions that
-- STILL have participants are deliberately left untouched here: the
-- application-level reaper (competitionManager.reapOrphanedCompetitions) refunds
-- every participant's entry fee before cancelling, so no funded competition is
-- ever cancelled without a refund. Idempotent — re-running only affects rows
-- still 'running'.

UPDATE public.aio_competitions
SET status   = 'cancelled',
    ended_at = COALESCE(ended_at, now())
WHERE status = 'running'
  AND (started_at IS NULL OR started_at < now() - interval '2 hours')
  AND (
    stake_mode IS DISTINCT FROM 'real'
    OR NOT EXISTS (
      SELECT 1 FROM public.aio_competition_participants p
      WHERE p.competition_id = aio_competitions.id
    )
  );

-- Verification (run after applying):
--   SELECT status, count(*) FROM public.aio_competitions GROUP BY status;
--   -- expect the large 'running' bucket to have collapsed to only genuinely
--   -- active (recently started) competitions, if any.
