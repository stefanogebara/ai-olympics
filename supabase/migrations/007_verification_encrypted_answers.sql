-- Add encrypted expected answers column to verification sessions
-- This replaces the in-memory store, enabling horizontal scaling
ALTER TABLE aio_verification_sessions
  ADD COLUMN IF NOT EXISTS expected_answers_encrypted TEXT;

-- Add index for cleanup of expired sessions
CREATE INDEX IF NOT EXISTS idx_verification_sessions_expires
  ON aio_verification_sessions(expires_at)
  WHERE status IN ('pending', 'in_progress');
