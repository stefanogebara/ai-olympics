-- Abuse Detection: Rate limiting on agent and competition creation
-- P5-A3 from PLAN.md

-- 1. Missing indexes for admin pages
CREATE INDEX IF NOT EXISTS idx_aio_agents_approval_status ON aio_agents(approval_status);
CREATE INDEX IF NOT EXISTS idx_aio_competitions_created_by ON aio_competitions(created_by);
CREATE INDEX IF NOT EXISTS idx_aio_agents_created_at ON aio_agents(created_at DESC);

-- 2. Rate limit: Max 10 agents per user
CREATE OR REPLACE FUNCTION check_agent_creation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  agent_count INTEGER;
BEGIN
  SELECT count(*) INTO agent_count
  FROM aio_agents
  WHERE owner_id = NEW.owner_id;

  IF agent_count >= 10 THEN
    RAISE EXCEPTION 'Agent limit reached. Maximum 10 agents per user.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_agent_limit ON aio_agents;
CREATE TRIGGER enforce_agent_limit
  BEFORE INSERT ON aio_agents
  FOR EACH ROW
  EXECUTE FUNCTION check_agent_creation_limit();

-- 3. Rate limit: Max 5 competitions per hour per user
CREATE OR REPLACE FUNCTION check_competition_creation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT count(*) INTO recent_count
  FROM aio_competitions
  WHERE created_by = NEW.created_by
    AND created_at > now() - interval '1 hour';

  IF recent_count >= 5 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 5 competitions per hour.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_competition_rate_limit ON aio_competitions;
CREATE TRIGGER enforce_competition_rate_limit
  BEFORE INSERT ON aio_competitions
  FOR EACH ROW
  EXECUTE FUNCTION check_competition_creation_limit();

-- 4. Rate limit: Max 3 tournaments per day per user
CREATE OR REPLACE FUNCTION check_tournament_creation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT count(*) INTO recent_count
  FROM aio_tournaments
  WHERE created_by = NEW.created_by
    AND created_at > now() - interval '24 hours';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 tournaments per day.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_tournament_rate_limit ON aio_tournaments;
CREATE TRIGGER enforce_tournament_rate_limit
  BEFORE INSERT ON aio_tournaments
  FOR EACH ROW
  EXECUTE FUNCTION check_tournament_creation_limit();

-- 5. Rate limit: Max 3 championships per day per user
CREATE OR REPLACE FUNCTION check_championship_creation_limit()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  recent_count INTEGER;
BEGIN
  SELECT count(*) INTO recent_count
  FROM aio_championships
  WHERE created_by = NEW.created_by
    AND created_at > now() - interval '24 hours';

  IF recent_count >= 3 THEN
    RAISE EXCEPTION 'Rate limit exceeded. Maximum 3 championships per day.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_championship_rate_limit ON aio_championships;
CREATE TRIGGER enforce_championship_rate_limit
  BEFORE INSERT ON aio_championships
  FOR EACH ROW
  EXECUTE FUNCTION check_championship_creation_limit();
