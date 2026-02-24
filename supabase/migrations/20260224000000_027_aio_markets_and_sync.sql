-- Migration 027: aio_markets and aio_sync_status tables
-- These tables were missing from previous migrations.
-- aio_markets stores markets synced from Polymarket + Kalshi.
-- aio_sync_status tracks sync state per platform.

CREATE TABLE IF NOT EXISTS public.aio_markets (
  id           text        NOT NULL,
  source       text        NOT NULL,  -- 'polymarket' | 'kalshi'
  question     text        NOT NULL,
  description  text,
  category     text        DEFAULT 'other',
  outcomes     jsonb,
  volume_24h   numeric     DEFAULT 0,
  total_volume numeric     DEFAULT 0,
  liquidity    numeric     DEFAULT 0,
  close_time   bigint,                -- unix ms
  status       text        DEFAULT 'open',
  url          text,
  image        text,
  synced_at    timestamptz DEFAULT now(),
  created_at   timestamptz DEFAULT now(),
  PRIMARY KEY (id, source)
);

CREATE INDEX IF NOT EXISTS idx_aio_markets_status   ON public.aio_markets (status);
CREATE INDEX IF NOT EXISTS idx_aio_markets_category ON public.aio_markets (category);
CREATE INDEX IF NOT EXISTS idx_aio_markets_source   ON public.aio_markets (source);
CREATE INDEX IF NOT EXISTS idx_aio_markets_volume   ON public.aio_markets (total_volume DESC);
CREATE INDEX IF NOT EXISTS idx_aio_markets_close    ON public.aio_markets (close_time ASC);

ALTER TABLE public.aio_markets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aio_markets_public_read"
  ON public.aio_markets FOR SELECT
  USING (status = 'open');
CREATE POLICY "aio_markets_service_write"
  ON public.aio_markets FOR ALL
  USING (auth.role() = 'service_role');

-- Sync status tracking
CREATE TABLE IF NOT EXISTS public.aio_sync_status (
  id                    text        PRIMARY KEY,
  last_full_sync        timestamptz,
  last_incremental_sync timestamptz,
  total_markets         int         DEFAULT 0,
  sync_duration_ms      int         DEFAULT 0,
  error                 text,
  updated_at            timestamptz DEFAULT now()
);

ALTER TABLE public.aio_sync_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "aio_sync_status_public_read"
  ON public.aio_sync_status FOR SELECT USING (true);
CREATE POLICY "aio_sync_status_service_write"
  ON public.aio_sync_status FOR ALL USING (auth.role() = 'service_role');

-- RPC: group markets by event URL for the event-based browse UI
CREATE OR REPLACE FUNCTION public.get_market_events(
  p_category text    DEFAULT 'all',
  p_sort     text    DEFAULT 'volume',
  p_limit    int     DEFAULT 24,
  p_offset   int     DEFAULT 0,
  p_source   text    DEFAULT NULL
)
RETURNS TABLE (
  event_url    text,
  source       text,
  category     text,
  image        text,
  total_volume text,
  volume_24h   text,
  liquidity    text,
  close_time   bigint,
  market_count bigint,
  markets      jsonb
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  WITH grouped AS (
    SELECT
      COALESCE(m.url, 'unknown-' || m.id) AS ev_url,
      m.source AS src,
      m.category AS cat,
      m.image AS img,
      SUM(m.total_volume)  AS total_vol,
      SUM(m.volume_24h)    AS vol_24h,
      SUM(m.liquidity)     AS liq,
      MAX(m.close_time)    AS close,
      COUNT(*)             AS cnt,
      jsonb_agg(
        jsonb_build_object(
          'id',           m.id,
          'question',     m.question,
          'outcomes',     m.outcomes,
          'total_volume', m.total_volume::text,
          'volume_24h',   m.volume_24h::text,
          'liquidity',    m.liquidity::text,
          'close_time',   m.close_time
        )
        ORDER BY m.total_volume DESC
      ) AS mkt_list
    FROM public.aio_markets m
    WHERE m.status = 'open'
      AND (p_category = 'all' OR m.category = p_category)
      AND (p_source IS NULL OR m.source = p_source)
    GROUP BY COALESCE(m.url, 'unknown-' || m.id), m.source, m.category, m.image
  )
  SELECT
    g.ev_url,
    g.src,
    g.cat,
    g.img,
    g.total_vol::text,
    g.vol_24h::text,
    g.liq::text,
    g.close,
    g.cnt,
    g.mkt_list
  FROM grouped g
  ORDER BY
    CASE WHEN p_sort = 'volume'       THEN g.total_vol END DESC NULLS LAST,
    CASE WHEN p_sort = 'newest'       THEN g.close     END DESC NULLS LAST,
    CASE WHEN p_sort = 'closing_soon' THEN g.close     END ASC  NULLS LAST
  LIMIT p_limit OFFSET p_offset;
END;
$$;

-- RPC: count distinct events (for pagination)
CREATE OR REPLACE FUNCTION public.get_market_events_count(
  p_category text DEFAULT 'all',
  p_source   text DEFAULT NULL
)
RETURNS bigint
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_count bigint;
BEGIN
  SELECT COUNT(DISTINCT COALESCE(url, 'unknown-' || id))
  INTO v_count
  FROM public.aio_markets
  WHERE status = 'open'
    AND (p_category = 'all' OR category = p_category)
    AND (p_source IS NULL OR source = p_source);
  RETURN v_count;
END;
$$;
