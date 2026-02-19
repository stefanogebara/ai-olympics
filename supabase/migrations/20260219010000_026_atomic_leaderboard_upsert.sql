-- Atomic leaderboard upsert function
-- Fixes race condition where concurrent submitSession calls could
-- overwrite each other's accumulated stats.
-- Uses INSERT ... ON CONFLICT with GREATEST/addition to be atomic.

CREATE OR REPLACE FUNCTION aio_upsert_game_leaderboard(
  p_game_type text,
  p_user_id uuid,
  p_score int,
  p_puzzles_attempted int,
  p_puzzles_solved int,
  p_accuracy numeric,
  p_average_time_ms int,
  p_sessions_completed int DEFAULT 1
)
RETURNS TABLE(best_score int) AS $$
BEGIN
  INSERT INTO aio_game_leaderboards (
    game_type, user_id, total_score,
    puzzles_attempted, puzzles_solved,
    accuracy, average_time_ms,
    sessions_completed, last_played_at
  ) VALUES (
    p_game_type, p_user_id, p_score,
    p_puzzles_attempted, p_puzzles_solved,
    p_accuracy, p_average_time_ms,
    p_sessions_completed, now()
  )
  ON CONFLICT (game_type, user_id) DO UPDATE SET
    total_score = GREATEST(aio_game_leaderboards.total_score, EXCLUDED.total_score),
    puzzles_attempted = aio_game_leaderboards.puzzles_attempted + EXCLUDED.puzzles_attempted,
    puzzles_solved = aio_game_leaderboards.puzzles_solved + EXCLUDED.puzzles_solved,
    accuracy = EXCLUDED.accuracy,
    average_time_ms = EXCLUDED.average_time_ms,
    sessions_completed = aio_game_leaderboards.sessions_completed + EXCLUDED.sessions_completed,
    last_played_at = now();

  RETURN QUERY
    SELECT aio_game_leaderboards.total_score
    FROM aio_game_leaderboards
    WHERE aio_game_leaderboards.game_type = p_game_type
      AND aio_game_leaderboards.user_id = p_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
