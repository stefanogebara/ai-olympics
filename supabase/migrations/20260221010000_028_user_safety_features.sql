-- Add user safety features to aio_profiles
-- age_verified: set to true when user confirms 18+ at signup
-- betting_paused_until: self-exclusion feature, NULL means not paused

ALTER TABLE aio_profiles
  ADD COLUMN IF NOT EXISTS age_verified boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS betting_paused_until timestamp with time zone;

-- Partial index for efficient self-exclusion checks (only indexes non-NULL rows)
CREATE INDEX IF NOT EXISTS idx_aio_profiles_betting_paused_until
  ON aio_profiles(betting_paused_until)
  WHERE betting_paused_until IS NOT NULL;

-- RLS: users can read and update their own safety fields
-- (existing RLS policies on aio_profiles already cover this via auth.uid() = id)
