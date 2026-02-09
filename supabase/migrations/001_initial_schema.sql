-- AI Olympics Marketplace - Initial Schema
-- Run this migration in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- PROFILES TABLE
-- Extends Supabase auth.users with app-specific data
-- ============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  display_name TEXT,
  avatar_url TEXT,
  is_verified BOOLEAN DEFAULT false,
  wallet_balance DECIMAL(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for username lookups
CREATE INDEX IF NOT EXISTS idx_profiles_username ON public.profiles(username);

-- ============================================
-- AGENTS TABLE
-- User-submitted AI agents (webhook or API key)
-- ============================================
CREATE TABLE IF NOT EXISTS public.agents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  description TEXT,
  color TEXT DEFAULT '#6B7280',

  -- Agent type: 'webhook' or 'api_key'
  agent_type TEXT NOT NULL CHECK (agent_type IN ('webhook', 'api_key')),

  -- Webhook configuration
  webhook_url TEXT,
  webhook_secret TEXT,

  -- API key configuration
  provider TEXT,
  model TEXT,
  api_key_encrypted TEXT,
  system_prompt TEXT,

  -- Stats
  elo_rating INTEGER DEFAULT 1500,
  total_competitions INTEGER DEFAULT 0,
  total_wins INTEGER DEFAULT 0,

  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX IF NOT EXISTS idx_agents_owner ON public.agents(owner_id);
CREATE INDEX IF NOT EXISTS idx_agents_slug ON public.agents(slug);
CREATE INDEX IF NOT EXISTS idx_agents_elo ON public.agents(elo_rating DESC);
CREATE INDEX IF NOT EXISTS idx_agents_public ON public.agents(is_public, is_active);

-- ============================================
-- DOMAINS TABLE
-- Competition categories/domains
-- ============================================
CREATE TABLE IF NOT EXISTS public.domains (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  icon TEXT
);

-- Insert default domains
INSERT INTO public.domains (slug, name, description, icon) VALUES
  ('browser-tasks', 'Browser Tasks', 'Navigate websites, fill forms, extract data', 'globe'),
  ('prediction-markets', 'Prediction Markets', 'Trade on Polymarket, Manifold, Kalshi', 'chart'),
  ('trading', 'Trading & Finance', 'Execute trades, analyze markets', 'trending-up'),
  ('games', 'Games', 'Play chess, poker, strategy games', 'gamepad')
ON CONFLICT (slug) DO NOTHING;

-- ============================================
-- COMPETITIONS TABLE
-- Individual competition events
-- ============================================
CREATE TABLE IF NOT EXISTS public.competitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  domain_id UUID REFERENCES public.domains(id),

  -- Competition mode
  stake_mode TEXT DEFAULT 'sandbox' CHECK (stake_mode IN ('sandbox', 'real')),
  status TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'lobby', 'running', 'completed', 'cancelled')),

  -- Financials
  entry_fee DECIMAL(10,2) DEFAULT 0,
  prize_pool DECIMAL(12,2) DEFAULT 0,

  -- Configuration
  max_participants INTEGER DEFAULT 8,

  -- Ownership
  created_by UUID REFERENCES public.profiles(id),

  -- Timing
  scheduled_start TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  ended_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_competitions_status ON public.competitions(status);
CREATE INDEX IF NOT EXISTS idx_competitions_domain ON public.competitions(domain_id);
CREATE INDEX IF NOT EXISTS idx_competitions_created_by ON public.competitions(created_by);

-- ============================================
-- COMPETITION PARTICIPANTS TABLE
-- Agents entered in competitions
-- ============================================
CREATE TABLE IF NOT EXISTS public.competition_participants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  competition_id UUID NOT NULL REFERENCES public.competitions(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,

  -- Results
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  final_rank INTEGER,
  final_score INTEGER DEFAULT 0,

  -- Ensure unique agent per competition
  UNIQUE(competition_id, agent_id)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_participants_competition ON public.competition_participants(competition_id);
CREATE INDEX IF NOT EXISTS idx_participants_agent ON public.competition_participants(agent_id);
CREATE INDEX IF NOT EXISTS idx_participants_user ON public.competition_participants(user_id);

-- ============================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.competition_participants ENABLE ROW LEVEL SECURITY;

-- Profiles policies
CREATE POLICY "Public profiles are viewable by everyone"
  ON public.profiles FOR SELECT
  USING (true);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

-- Agents policies
CREATE POLICY "Public agents are viewable by everyone"
  ON public.agents FOR SELECT
  USING (is_public = true OR owner_id = auth.uid());

CREATE POLICY "Users can insert their own agents"
  ON public.agents FOR INSERT
  WITH CHECK (owner_id = auth.uid());

CREATE POLICY "Users can update their own agents"
  ON public.agents FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "Users can delete their own agents"
  ON public.agents FOR DELETE
  USING (owner_id = auth.uid());

-- Domains policies (read-only for everyone)
CREATE POLICY "Domains are viewable by everyone"
  ON public.domains FOR SELECT
  USING (true);

-- Competitions policies
CREATE POLICY "Competitions are viewable by everyone"
  ON public.competitions FOR SELECT
  USING (true);

CREATE POLICY "Authenticated users can create competitions"
  ON public.competitions FOR INSERT
  WITH CHECK (auth.uid() = created_by);

CREATE POLICY "Creators can update their competitions"
  ON public.competitions FOR UPDATE
  USING (created_by = auth.uid());

-- Competition participants policies
CREATE POLICY "Participants are viewable by everyone"
  ON public.competition_participants FOR SELECT
  USING (true);

CREATE POLICY "Users can join competitions with their agents"
  ON public.competition_participants FOR INSERT
  WITH CHECK (
    user_id = auth.uid() AND
    EXISTS (SELECT 1 FROM public.agents WHERE id = agent_id AND owner_id = auth.uid())
  );

CREATE POLICY "Users can leave competitions"
  ON public.competition_participants FOR DELETE
  USING (user_id = auth.uid());

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Function to create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, username, display_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'username', SPLIT_PART(NEW.email, '@', 1)),
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', SPLIT_PART(NEW.email, '@', 1)),
    NEW.raw_user_meta_data->>'avatar_url'
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to create profile on signup
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to update agent stats after competition
CREATE OR REPLACE FUNCTION public.update_agent_stats()
RETURNS TRIGGER AS $$
BEGIN
  -- Update total competitions for agent
  UPDATE public.agents
  SET total_competitions = total_competitions + 1
  WHERE id = NEW.agent_id;

  -- If agent won (rank = 1), increment wins
  IF NEW.final_rank = 1 THEN
    UPDATE public.agents
    SET total_wins = total_wins + 1
    WHERE id = NEW.agent_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to update agent stats when competition results are recorded
DROP TRIGGER IF EXISTS on_participant_result ON public.competition_participants;
CREATE TRIGGER on_participant_result
  AFTER UPDATE OF final_rank ON public.competition_participants
  FOR EACH ROW
  WHEN (OLD.final_rank IS NULL AND NEW.final_rank IS NOT NULL)
  EXECUTE FUNCTION public.update_agent_stats();

-- ============================================
-- SAMPLE DATA (Optional - for testing)
-- ============================================

-- Uncomment below to add sample data

/*
-- Sample competition
INSERT INTO public.competitions (name, domain_id, stake_mode, status, max_participants, prize_pool)
SELECT
  'Browser Speed Challenge #1',
  id,
  'sandbox',
  'lobby',
  8,
  0
FROM public.domains WHERE slug = 'browser-tasks';

INSERT INTO public.competitions (name, domain_id, stake_mode, status, max_participants, prize_pool)
SELECT
  'Prediction Market Showdown',
  id,
  'sandbox',
  'scheduled',
  4,
  100
FROM public.domains WHERE slug = 'prediction-markets';
*/
