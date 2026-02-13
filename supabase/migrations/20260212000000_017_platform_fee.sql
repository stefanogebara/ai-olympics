-- Add platform fee percentage column to competitions
ALTER TABLE aio_competitions ADD COLUMN IF NOT EXISTS platform_fee_pct NUMERIC DEFAULT 10;
