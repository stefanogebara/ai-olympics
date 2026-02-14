-- Add indexes for unindexed foreign keys on frequently queried tables
-- These improve JOIN performance and cascading delete operations

-- Competition-related
CREATE INDEX IF NOT EXISTS idx_aio_competitions_created_by ON public.aio_competitions (created_by);
CREATE INDEX IF NOT EXISTS idx_aio_competitions_domain_id ON public.aio_competitions (domain_id);
CREATE INDEX IF NOT EXISTS idx_aio_competition_participants_user_id ON public.aio_competition_participants (user_id);

-- ELO history
CREATE INDEX IF NOT EXISTS idx_aio_elo_history_domain_id ON public.aio_elo_history (domain_id);

-- Game tables
CREATE INDEX IF NOT EXISTS idx_aio_game_sessions_user_id ON public.aio_game_sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_aio_game_sessions_game_type ON public.aio_game_sessions (game_type);
CREATE INDEX IF NOT EXISTS idx_aio_game_leaderboards_agent_id ON public.aio_game_leaderboards (agent_id);
CREATE INDEX IF NOT EXISTS idx_aio_game_leaderboards_user_id ON public.aio_game_leaderboards (user_id);
CREATE INDEX IF NOT EXISTS idx_aio_puzzle_attempts_puzzle_id ON public.aio_puzzle_attempts (puzzle_id);
CREATE INDEX IF NOT EXISTS idx_aio_puzzle_attempts_user_id ON public.aio_puzzle_attempts (user_id);

-- Market/trading tables
CREATE INDEX IF NOT EXISTS idx_aio_meta_market_bets_market_id ON public.aio_meta_market_bets (market_id);
CREATE INDEX IF NOT EXISTS idx_aio_meta_market_bets_user_id ON public.aio_meta_market_bets (user_id);
CREATE INDEX IF NOT EXISTS idx_aio_user_bets_portfolio_id ON public.aio_user_bets (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_aio_user_positions_portfolio_id ON public.aio_user_positions (portfolio_id);
CREATE INDEX IF NOT EXISTS idx_aio_real_bets_user_id ON public.aio_real_bets (user_id);
CREATE INDEX IF NOT EXISTS idx_aio_real_bets_wallet_id ON public.aio_real_bets (wallet_id);

-- Trade notifications
CREATE INDEX IF NOT EXISTS idx_aio_trade_notifications_user_id ON public.aio_trade_notifications (user_id);
CREATE INDEX IF NOT EXISTS idx_aio_trade_notifications_bet_id ON public.aio_trade_notifications (bet_id);
CREATE INDEX IF NOT EXISTS idx_aio_trade_notifications_trader_id ON public.aio_trade_notifications (trader_id);

-- Tournament tables
CREATE INDEX IF NOT EXISTS idx_aio_tournament_matches_winner_id ON public.aio_tournament_matches (winner_id);

-- Verification
CREATE INDEX IF NOT EXISTS idx_aio_verification_sessions_competition_id ON public.aio_verification_sessions (competition_id);

-- Agents
CREATE INDEX IF NOT EXISTS idx_aio_agents_reviewed_by ON public.aio_agents (reviewed_by);

-- Daily challenges
CREATE INDEX IF NOT EXISTS idx_aio_daily_challenges_puzzle_id ON public.aio_daily_challenges (puzzle_id);
