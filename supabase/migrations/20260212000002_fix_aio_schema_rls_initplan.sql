-- Fix remaining RLS policies on aio schema that use bare auth.uid()
-- instead of (select auth.uid()) for initplan caching

-- aio_spectator_votes
DROP POLICY IF EXISTS "aio_spectator_votes_delete" ON aio.aio_spectator_votes;
CREATE POLICY "aio_spectator_votes_delete" ON aio.aio_spectator_votes
  FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "aio_spectator_votes_insert" ON aio.aio_spectator_votes;
CREATE POLICY "aio_spectator_votes_insert" ON aio.aio_spectator_votes
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- aio_tournament_participants
DROP POLICY IF EXISTS "aio_tournament_participants_delete" ON aio.aio_tournament_participants;
CREATE POLICY "aio_tournament_participants_delete" ON aio.aio_tournament_participants
  FOR DELETE USING ((select auth.uid()) = user_id);

DROP POLICY IF EXISTS "aio_tournament_participants_insert" ON aio.aio_tournament_participants;
CREATE POLICY "aio_tournament_participants_insert" ON aio.aio_tournament_participants
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- aio_tournaments
DROP POLICY IF EXISTS "aio_tournaments_insert" ON aio.aio_tournaments;
CREATE POLICY "aio_tournaments_insert" ON aio.aio_tournaments
  FOR INSERT WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "aio_tournaments_update" ON aio.aio_tournaments;
CREATE POLICY "aio_tournaments_update" ON aio.aio_tournaments
  FOR UPDATE USING ((select auth.uid()) = created_by);

-- aio_championship_participants
DROP POLICY IF EXISTS "Authenticated users can join championships" ON aio.aio_championship_participants;
CREATE POLICY "Authenticated users can join championships" ON aio.aio_championship_participants
  FOR INSERT WITH CHECK ((select auth.uid()) = user_id);

-- aio_championships
DROP POLICY IF EXISTS "Authenticated users can create championships" ON aio.aio_championships;
CREATE POLICY "Authenticated users can create championships" ON aio.aio_championships
  FOR INSERT WITH CHECK ((select auth.uid()) IS NOT NULL);
