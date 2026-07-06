-- Migration: 033_enable_rls_core_aio_tables
--
-- CRITICAL SECURITY FIX.
--
-- Live-DB audit (project sujsmwoaxurlyxjossid, "ai-olympics") found the five core
-- aio_ tables with Row Level Security DISABLED *and zero policies present*:
--   aio_profiles, aio_agents, aio_domains, aio_competitions,
--   aio_competition_participants
-- (relrowsecurity = false, policy_count = 0 for all five). The policies defined in
-- migration 019 were never actually applied to this database (schema drift), and
-- migration 001 only enabled RLS on the legacy *unprefixed* tables. Because the
-- anon/authenticated roles hold INSERT/UPDATE/DELETE grants and RLS was off, anyone
-- with the public anon key could modify or delete every row in these tables via
-- PostgREST.
--
-- This migration is SELF-CONTAINED: it does not assume migration 019 ran. It creates
-- the full policy set for all five tables (mirroring 019's intended design, plus the
-- public-read policies those tables never had), then enables RLS, then revokes the
-- non-RLS-gated TRUNCATE privilege from the client roles.
--
-- Ordering note: the backend (src/api/server.ts) was already updated to route its
-- crash-recovery and spectator-vote writes through the service-role client, which
-- bypasses RLS, so those trusted server-side writes keep working after RLS is on.
--
-- All policy statements are idempotent (DROP ... IF EXISTS then CREATE). auth.uid()
-- is wrapped in (select auth.uid()) for initplan caching, matching migration 019.
-- The admin-check subqueries read aio_profiles, whose SELECT policy is USING (true),
-- so they do not recurse.

-- ============================================================================
-- aio_profiles
-- ============================================================================
DROP POLICY IF EXISTS "Public profiles viewable" ON public.aio_profiles;
CREATE POLICY "Public profiles viewable" ON public.aio_profiles FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Users insert own profile" ON public.aio_profiles;
CREATE POLICY "Users insert own profile" ON public.aio_profiles FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Users update own profile" ON public.aio_profiles;
CREATE POLICY "Users update own profile" ON public.aio_profiles FOR UPDATE TO public
  USING ((select auth.uid()) = id);

DROP POLICY IF EXISTS "Admins can update any profile" ON public.aio_profiles;
CREATE POLICY "Admins can update any profile" ON public.aio_profiles FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.aio_profiles p WHERE p.id = (select auth.uid()) AND p.is_admin = true));

-- ============================================================================
-- aio_agents
-- ============================================================================
DROP POLICY IF EXISTS "Public agents viewable" ON public.aio_agents;
CREATE POLICY "Public agents viewable" ON public.aio_agents FOR SELECT TO public
  USING (is_public = true OR owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can view all agents" ON public.aio_agents;
CREATE POLICY "Admins can view all agents" ON public.aio_agents FOR SELECT TO public
  USING (EXISTS (SELECT 1 FROM public.aio_profiles WHERE aio_profiles.id = (select auth.uid()) AND aio_profiles.is_admin = true));

DROP POLICY IF EXISTS "Users insert own agents" ON public.aio_agents;
CREATE POLICY "Users insert own agents" ON public.aio_agents FOR INSERT TO public
  WITH CHECK (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users update own agents" ON public.aio_agents;
CREATE POLICY "Users update own agents" ON public.aio_agents FOR UPDATE TO public
  USING (owner_id = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can update any agent" ON public.aio_agents;
CREATE POLICY "Admins can update any agent" ON public.aio_agents FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.aio_profiles WHERE aio_profiles.id = (select auth.uid()) AND aio_profiles.is_admin = true));

DROP POLICY IF EXISTS "Users delete own agents" ON public.aio_agents;
CREATE POLICY "Users delete own agents" ON public.aio_agents FOR DELETE TO public
  USING (owner_id = (select auth.uid()));

-- ============================================================================
-- aio_domains — public reference/category data (read-only for clients)
-- ============================================================================
DROP POLICY IF EXISTS "Public domains viewable" ON public.aio_domains;
CREATE POLICY "Public domains viewable" ON public.aio_domains FOR SELECT TO public
  USING (true);

-- ============================================================================
-- aio_competitions
-- ============================================================================
DROP POLICY IF EXISTS "Public competitions viewable" ON public.aio_competitions;
CREATE POLICY "Public competitions viewable" ON public.aio_competitions FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Auth users create competitions" ON public.aio_competitions;
CREATE POLICY "Auth users create competitions" ON public.aio_competitions FOR INSERT TO public
  WITH CHECK ((select auth.uid()) = created_by);

DROP POLICY IF EXISTS "Creators update competitions" ON public.aio_competitions;
CREATE POLICY "Creators update competitions" ON public.aio_competitions FOR UPDATE TO public
  USING (created_by = (select auth.uid()));

DROP POLICY IF EXISTS "Admins can update any competition" ON public.aio_competitions;
CREATE POLICY "Admins can update any competition" ON public.aio_competitions FOR UPDATE TO public
  USING (EXISTS (SELECT 1 FROM public.aio_profiles WHERE aio_profiles.id = (select auth.uid()) AND aio_profiles.is_admin = true));

-- ============================================================================
-- aio_competition_participants
-- ============================================================================
DROP POLICY IF EXISTS "Public competition participants viewable" ON public.aio_competition_participants;
CREATE POLICY "Public competition participants viewable" ON public.aio_competition_participants FOR SELECT TO public
  USING (true);

DROP POLICY IF EXISTS "Users join competitions" ON public.aio_competition_participants;
CREATE POLICY "Users join competitions" ON public.aio_competition_participants FOR INSERT TO public
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS "Users leave competitions" ON public.aio_competition_participants;
CREATE POLICY "Users leave competitions" ON public.aio_competition_participants FOR DELETE TO public
  USING (user_id = (select auth.uid()));

-- ============================================================================
-- Enable Row Level Security (the actual fix — policies above are inert until this)
-- ============================================================================
ALTER TABLE public.aio_profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_agents                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_domains                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_competitions             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_competition_participants ENABLE ROW LEVEL SECURITY;

-- ============================================================================
-- Revoke TRUNCATE from client roles. RLS row policies do NOT gate TRUNCATE (it is a
-- table-level privilege), and these tables were created with a non-standard GRANT ALL
-- that handed anon/authenticated the TRUNCATE right. Not reachable via the PostgREST
-- anon key today, but it should never have been granted. service_role is unaffected.
-- (Broader grant hygiene across all public tables is tracked as a follow-up.)
-- ============================================================================
REVOKE TRUNCATE ON public.aio_profiles                 FROM anon, authenticated;
REVOKE TRUNCATE ON public.aio_agents                   FROM anon, authenticated;
REVOKE TRUNCATE ON public.aio_domains                  FROM anon, authenticated;
REVOKE TRUNCATE ON public.aio_competitions             FROM anon, authenticated;
REVOKE TRUNCATE ON public.aio_competition_participants FROM anon, authenticated;

-- ============================================================================
-- Verification (run after applying):
--   SELECT c.relname, c.relrowsecurity,
--     (SELECT count(*) FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
--   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
--   WHERE n.nspname='public' AND c.relname IN
--     ('aio_profiles','aio_agents','aio_domains','aio_competitions','aio_competition_participants');
--   -- expect relrowsecurity = true and policies > 0 for all five
--   -- then run the Supabase security advisor and confirm no rls_disabled_in_public
--   -- findings remain for these tables.
-- ============================================================================
