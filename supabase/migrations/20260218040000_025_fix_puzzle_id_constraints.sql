-- Add UNIQUE constraint on puzzle_id for data integrity and FK-ready lookups
CREATE UNIQUE INDEX IF NOT EXISTS idx_puzzles_puzzle_id_unique
  ON public.aio_puzzles(puzzle_id);

-- Add index on aio_puzzle_attempts.puzzle_id for join performance
CREATE INDEX IF NOT EXISTS idx_puzzle_attempts_puzzle_id
  ON public.aio_puzzle_attempts(puzzle_id);

-- Drop the mismatched FK in the aio schema (UUID puzzle_id -> UUID aio_puzzles.id)
-- Our app uses public schema with TEXT puzzle_ids
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'aio_puzzle_attempts_puzzle_id_fkey'
    AND table_schema = 'aio'
  ) THEN
    ALTER TABLE aio.aio_puzzle_attempts DROP CONSTRAINT aio_puzzle_attempts_puzzle_id_fkey;
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not drop aio schema FK: %', SQLERRM;
END $$;
