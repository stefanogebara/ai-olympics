-- Migration: 033_enable_rls_core_aio_tables
--
-- CRITICAL SECURITY FIX.
--
-- The core aio_ tables (aio_profiles, aio_agents, aio_domains, aio_competitions,
-- aio_competition_participants) had RLS POLICIES defined (migration 019) but
-- Row Level Security was NEVER enabled on them. Migration 001 enabled RLS only on
-- the legacy *unprefixed* tables (profiles/agents/domains/competitions/
-- competition_participants); the aio_-prefixed tables actually served over
-- PostgREST were left with relrowsecurity = false. Because the anon role holds
-- INSERT/UPDATE/DELETE/TRUNCATE grants, anyone with the public VITE_SUPABASE_ANON_KEY
-- could modify or delete every row in these tables directly. The policies from
-- migration 019 were inert (a policy has no effect until RLS is enabled).
--
-- This migration:
--   1. Backfills the MISSING public-read (SELECT) policies for the tables that had
--      none — aio_competitions, aio_competition_participants, aio_profiles,
--      aio_domains. Without these, enabling RLS would filter out all rows for the
--      anon client and break the public browse/leaderboard pages (the frontend
--      reads these tables directly with the anon key). aio_agents already has
--      SELECT policies from migration 019, so it needs none added here.
--   2. Enables RLS on all five core tables. ENABLE ROW LEVEL SECURITY is idempotent
--      (a no-op if already enabled), so this is safe regardless of live state.
--
-- After this runs, existing migration-019 write policies take effect: only a row's
-- creator/owner (or an admin) can INSERT/UPDATE it, and DELETE is blocked entirely
-- for anon/authenticated (no DELETE policy) — deletions must go through the backend
-- service-role client, which bypasses RLS. Trusted server-side writes in
-- src/api/server.ts (crash-recovery competition cancel, spectator-vote insert) were
-- switched from the anon client to the service client in the same change set so they
-- keep working after RLS is on.
--
-- Verification (run in the Supabase SQL editor / via advisors after applying):
--   -- (a) Confirm every aio_ table now has RLS on:
--   SELECT c.relname, c.relrowsecurity
--   FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
--   WHERE n.nspname = 'public' AND c.relname LIKE 'aio_%'
--   ORDER BY c.relrowsecurity, c.relname;   -- expect relrowsecurity = true for all
--   -- (b) Run the Supabase security advisor (get_advisors: security lint) and
--   --     confirm no "rls_disabled_in_public" / "policy_exists_rls_disabled" findings
--   --     remain for aio_ tables.

-- ============================================================================
-- 1. Backfill missing public SELECT policies (idempotent)
--    Preserves the legacy "viewable by everyone" read semantics that these tables
--    relied on while RLS was disabled.
-- ============================================================================

-- aio_competitions — publicly browseable
DROP POLICY IF EXISTS "Public competitions viewable" ON public.aio_competitions;
CREATE POLICY "Public competitions viewable" ON public.aio_competitions FOR SELECT TO public
  USING (true);

-- aio_competition_participants — publicly viewable (rosters shown on public pages)
DROP POLICY IF EXISTS "Public competition participants viewable" ON public.aio_competition_participants;
CREATE POLICY "Public competition participants viewable" ON public.aio_competition_participants FOR SELECT TO public
  USING (true);

-- aio_profiles — public profiles viewable by everyone (usernames/avatars on
-- leaderboards, agent detail pages, etc.). Matches legacy profiles semantics.
DROP POLICY IF EXISTS "Public profiles viewable" ON public.aio_profiles;
CREATE POLICY "Public profiles viewable" ON public.aio_profiles FOR SELECT TO public
  USING (true);

-- aio_domains — reference/category data, publicly readable
DROP POLICY IF EXISTS "Public domains viewable" ON public.aio_domains;
CREATE POLICY "Public domains viewable" ON public.aio_domains FOR SELECT TO public
  USING (true);

-- ============================================================================
-- 2. Enable Row Level Security on the five core tables (idempotent)
--    This is the actual fix — without it, all policies above and in migration 019
--    are inert and the anon role can write freely via its table grants.
-- ============================================================================

ALTER TABLE public.aio_profiles                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_agents                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_domains                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_competitions            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.aio_competition_participants ENABLE ROW LEVEL SECURITY;
