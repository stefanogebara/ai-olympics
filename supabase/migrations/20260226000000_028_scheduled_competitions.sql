-- Migration 028: Scheduled + recurring competitions
-- Adds auto_start flag and recurrence_interval to aio_competitions

ALTER TABLE aio_competitions
  ADD COLUMN IF NOT EXISTS auto_start BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_interval TEXT CHECK (
    recurrence_interval IS NULL OR recurrence_interval IN (
      'hourly', 'every_3h', 'every_6h', 'daily', 'weekly'
    )
  );

-- Index for the scheduler poll query
CREATE INDEX IF NOT EXISTS idx_aio_competitions_scheduler
  ON aio_competitions (status, scheduled_start, auto_start)
  WHERE status = 'lobby' AND auto_start = true AND scheduled_start IS NOT NULL;

COMMENT ON COLUMN aio_competitions.auto_start IS
  'When true, the server scheduler auto-starts this competition at scheduled_start';

COMMENT ON COLUMN aio_competitions.recurrence_interval IS
  'If set, a new competition is cloned after each completion at scheduled_start + interval';
