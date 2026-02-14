-- Optimize RLS policies: wrap auth.uid() in (select auth.uid()) for query plan caching
-- This prevents auth.uid() from being re-evaluated per row (initplan optimization)
-- Fixes 52 policies across all aio_ tables flagged by Supabase performance advisor

-- aio_agent_verification_history
DROP POLICY IF EXISTS "Users can manage their agent verification history" ON aio_agent_verification_history;
CREATE POLICY "Users can manage their agent verification history" ON aio_agent_verification_history FOR ALL TO public
  USING (agent_id IN (SELECT aio_agents.id FROM aio_agents WHERE aio_agents.owner_id = (select auth.uid())));

-- aio_agents
DROP POLICY IF EXISTS "Admins can update any agent" ON aio_agents;
CREATE POLICY "Admins can update any agent" ON aio_agents FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM aio_profiles WHERE aio_profiles.id = (select auth.uid()) AND aio_profiles.is_admin = true));

DROP POLICY IF EXISTS "Admins can view all agents" ON aio_agents;
CREATE POLICY "Admins can view all agents" ON aio_agents FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM aio_profiles WHERE aio_profiles.id = (select auth.uid()) AND aio_profiles.is_admin = true));

DROP POLICY IF EXISTS "Public agents viewable" ON aio_agents;
CREATE POLICY "Public agents viewable" ON aio_agents FOR SELECT TO public
  USING (is_public = true OR owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users delete own agents" ON aio_agents;
CREATE POLICY "Users delete own agents" ON aio_agents FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users insert own agents" ON aio_agents;
CREATE POLICY "Users insert own agents" ON aio_agents FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users update own agents" ON aio_agents;
CREATE POLICY "Users update own agents" ON aio_agents FOR UPDATE TO public
  USING (owner_id = (select auth.uid()));

-- aio_championship_participants
DROP POLICY IF EXISTS "Authenticated users can join championships" ON aio_championship_participants;
CREATE POLICY "Authenticated users can join championships" ON aio_championship_participants FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

-- aio_championships
DROP POLICY IF EXISTS "Authenticated users can create championships" ON aio_championships;
CREATE POLICY "Authenticated users can create championships" ON aio_championships FOR INSERT TO public
  WITH CHECK ((select auth.uid()) IS NOT NULL);

-- aio_competition_participants
DROP POLICY IF EXISTS "Users join competitions" ON aio_competition_participants;
CREATE POLICY "Users join competitions" ON aio_competition_participants FOR INSERT TO public
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users leave competitions" ON aio_competition_participants;
CREATE POLICY "Users leave competitions" ON aio_competition_participants FOR DELETE TO public
  USING (user_id = (select auth.uid()));

-- aio_competitions
DROP POLICY IF EXISTS "Admins can update any competition" ON aio_competitions;
CREATE POLICY "Admins can update any competition" ON aio_competitions FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM aio_profiles WHERE aio_profiles.id = (select auth.uid()) AND aio_profiles.is_admin = true));

DROP POLICY IF EXISTS "Auth users create competitions" ON aio_competitions;
CREATE POLICY "Auth users create competitions" ON aio_competitions FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Creators update competitions" ON aio_competitions;
CREATE POLICY "Creators update competitions" ON aio_competitions FOR UPDATE TO public
  USING (created_by = (select auth.uid()));

-- aio_crypto_wallets
DROP POLICY IF EXISTS "Users can insert their own crypto wallets" ON aio_crypto_wallets;
CREATE POLICY "Users can insert their own crypto wallets" ON aio_crypto_wallets FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own crypto wallets" ON aio_crypto_wallets;
CREATE POLICY "Users can view their own crypto wallets" ON aio_crypto_wallets FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- aio_exchange_credentials
DROP POLICY IF EXISTS "Users can view their own exchange credentials" ON aio_exchange_credentials;
CREATE POLICY "Users can view their own exchange credentials" ON aio_exchange_credentials FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- aio_followed_traders
DROP POLICY IF EXISTS "Users can manage their follows" ON aio_followed_traders;
CREATE POLICY "Users can manage their follows" ON aio_followed_traders FOR ALL TO public
  USING ((select auth.uid()) = follower_id);

-- aio_game_leaderboards
DROP POLICY IF EXISTS "Users can update their leaderboard entry" ON aio_game_leaderboards;
CREATE POLICY "Users can update their leaderboard entry" ON aio_game_leaderboards FOR ALL TO public
  USING ((select auth.uid()) = user_id OR agent_id IS NOT NULL);

-- aio_game_sessions
DROP POLICY IF EXISTS "Users can manage their game sessions" ON aio_game_sessions;
CREATE POLICY "Users can manage their game sessions" ON aio_game_sessions FOR ALL TO public
  USING ((select auth.uid()) = user_id OR agent_id IS NOT NULL);

-- aio_market_resolutions
DROP POLICY IF EXISTS "Authenticated users can view market resolutions" ON aio_market_resolutions;
CREATE POLICY "Authenticated users can view market resolutions" ON aio_market_resolutions FOR SELECT TO public
  USING ((select auth.uid()) IS NOT NULL);

-- aio_meta_market_bets
DROP POLICY IF EXISTS "Users can place bets" ON aio_meta_market_bets;
CREATE POLICY "Users can place bets" ON aio_meta_market_bets FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

-- aio_prediction_competitions
DROP POLICY IF EXISTS "Competition creators can manage prediction settings" ON aio_prediction_competitions;
CREATE POLICY "Competition creators can manage prediction settings" ON aio_prediction_competitions FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM aio_competitions c WHERE c.id = aio_prediction_competitions.competition_id AND c.created_by = (select auth.uid())));

-- aio_profiles
DROP POLICY IF EXISTS "Admins can update any profile" ON aio_profiles;
CREATE POLICY "Admins can update any profile" ON aio_profiles FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM aio_profiles aio_profiles_1 WHERE aio_profiles_1.id = (select auth.uid()) AND aio_profiles_1.is_admin = true));

DROP POLICY IF EXISTS "Users insert own profile" ON aio_profiles;
CREATE POLICY "Users insert own profile" ON aio_profiles FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users update own profile" ON aio_profiles;
CREATE POLICY "Users update own profile" ON aio_profiles FOR UPDATE TO public
  USING ((select auth.uid()) = id);

-- aio_puzzle_attempts
DROP POLICY IF EXISTS "Users can record their puzzle attempts" ON aio_puzzle_attempts;
CREATE POLICY "Users can record their puzzle attempts" ON aio_puzzle_attempts FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id OR agent_id IS NOT NULL);

-- aio_real_bets
DROP POLICY IF EXISTS "Users can view their own real bets" ON aio_real_bets;
CREATE POLICY "Users can view their own real bets" ON aio_real_bets FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- aio_real_positions
DROP POLICY IF EXISTS "Users can view their own positions" ON aio_real_positions;
CREATE POLICY "Users can view their own positions" ON aio_real_positions FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- aio_spectator_votes
DROP POLICY IF EXISTS "aio_spectator_votes_delete" ON aio_spectator_votes;
CREATE POLICY "aio_spectator_votes_delete" ON aio_spectator_votes FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "aio_spectator_votes_insert" ON aio_spectator_votes;
CREATE POLICY "aio_spectator_votes_insert" ON aio_spectator_votes FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

-- aio_stripe_customers
DROP POLICY IF EXISTS "Users can view their own Stripe mapping" ON aio_stripe_customers;
CREATE POLICY "Users can view their own Stripe mapping" ON aio_stripe_customers FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- aio_tournament_participants
DROP POLICY IF EXISTS "aio_tournament_participants_delete" ON aio_tournament_participants;
CREATE POLICY "aio_tournament_participants_delete" ON aio_tournament_participants FOR DELETE TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "aio_tournament_participants_insert" ON aio_tournament_participants;
CREATE POLICY "aio_tournament_participants_insert" ON aio_tournament_participants FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

-- aio_tournaments
DROP POLICY IF EXISTS "aio_tournaments_insert" ON aio_tournaments;
CREATE POLICY "aio_tournaments_insert" ON aio_tournaments FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "aio_tournaments_update" ON aio_tournaments;
CREATE POLICY "aio_tournaments_update" ON aio_tournaments FOR UPDATE TO public
  USING ((select auth.uid()) = created_by);

-- aio_trade_notifications
DROP POLICY IF EXISTS "Users can manage their own notifications" ON aio_trade_notifications;
CREATE POLICY "Users can manage their own notifications" ON aio_trade_notifications FOR ALL TO public
  USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own notifications" ON aio_trade_notifications;
CREATE POLICY "Users can view their own notifications" ON aio_trade_notifications FOR SELECT TO public
  USING ((select auth.uid()) = user_id);

-- aio_transactions
DROP POLICY IF EXISTS "Users can view their own transactions" ON aio_transactions;
CREATE POLICY "Users can view their own transactions" ON aio_transactions FOR SELECT TO public
  USING (wallet_id IN (SELECT aio_wallets.id FROM aio_wallets WHERE aio_wallets.user_id = (select auth.uid())));

-- aio_user_bets
DROP POLICY IF EXISTS "Users can manage their own bets" ON aio_user_bets;
CREATE POLICY "Users can manage their own bets" ON aio_user_bets FOR ALL TO public
  USING ((select auth.uid()) = user_id);

-- aio_user_portfolios
DROP POLICY IF EXISTS "Users can manage their own portfolio" ON aio_user_portfolios;
CREATE POLICY "Users can manage their own portfolio" ON aio_user_portfolios FOR ALL TO public
  USING ((select auth.uid()) = user_id);

-- aio_user_positions
DROP POLICY IF EXISTS "Users can manage their own positions" ON aio_user_positions;
CREATE POLICY "Users can manage their own positions" ON aio_user_positions FOR ALL TO public
  USING ((select auth.uid()) = user_id);

-- aio_verification_challenges
DROP POLICY IF EXISTS "Users can insert challenges for their sessions" ON aio_verification_challenges;
CREATE POLICY "Users can insert challenges for their sessions" ON aio_verification_challenges FOR INSERT TO public
  WITH CHECK (session_id IN (SELECT vs.id FROM aio_verification_sessions vs JOIN aio_agents a ON vs.agent_id = a.id WHERE a.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update challenges for their sessions" ON aio_verification_challenges;
CREATE POLICY "Users can update challenges for their sessions" ON aio_verification_challenges FOR UPDATE TO public
  USING (session_id IN (SELECT vs.id FROM aio_verification_sessions vs JOIN aio_agents a ON vs.agent_id = a.id WHERE a.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view challenges for their sessions" ON aio_verification_challenges;
CREATE POLICY "Users can view challenges for their sessions" ON aio_verification_challenges FOR SELECT TO public
  USING (session_id IN (SELECT vs.id FROM aio_verification_sessions vs JOIN aio_agents a ON vs.agent_id = a.id WHERE a.owner_id = (select auth.uid())));

-- aio_verification_sessions
DROP POLICY IF EXISTS "Users can create verification sessions for their agents" ON aio_verification_sessions;
CREATE POLICY "Users can create verification sessions for their agents" ON aio_verification_sessions FOR INSERT TO public
  WITH CHECK (agent_id IN (SELECT aio_agents.id FROM aio_agents WHERE aio_agents.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can update their own verification sessions" ON aio_verification_sessions;
CREATE POLICY "Users can update their own verification sessions" ON aio_verification_sessions FOR UPDATE TO public
  USING (agent_id IN (SELECT aio_agents.id FROM aio_agents WHERE aio_agents.owner_id = (select auth.uid())));

DROP POLICY IF EXISTS "Users can view their own verification sessions" ON aio_verification_sessions;
CREATE POLICY "Users can view their own verification sessions" ON aio_verification_sessions FOR SELECT TO public
  USING (agent_id IN (SELECT aio_agents.id FROM aio_agents WHERE aio_agents.owner_id = (select auth.uid())));

-- aio_virtual_bets
DROP POLICY IF EXISTS "Portfolio owners can manage bets" ON aio_virtual_bets;
CREATE POLICY "Portfolio owners can manage bets" ON aio_virtual_bets FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM aio_virtual_portfolios p JOIN aio_agents a ON a.id = p.agent_id WHERE p.id = aio_virtual_bets.portfolio_id AND a.owner_id = (select auth.uid())));

-- aio_virtual_portfolios
DROP POLICY IF EXISTS "Agent owners can manage portfolios" ON aio_virtual_portfolios;
CREATE POLICY "Agent owners can manage portfolios" ON aio_virtual_portfolios FOR ALL TO public
  USING (EXISTS (SELECT 1 FROM aio_agents a WHERE a.id = aio_virtual_portfolios.agent_id AND a.owner_id = (select auth.uid())));

-- aio_wallets
DROP POLICY IF EXISTS "Users can create their own wallet" ON aio_wallets;
CREATE POLICY "Users can create their own wallet" ON aio_wallets FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users can view their own wallet" ON aio_wallets;
CREATE POLICY "Users can view their own wallet" ON aio_wallets FOR SELECT TO public
  USING ((select auth.uid()) = user_id);
