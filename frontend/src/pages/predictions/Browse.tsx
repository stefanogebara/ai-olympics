import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, SkeletonCard, ErrorBanner } from '../../components/ui';
import {
  TrendingUp,
  RefreshCw,
  Search,
  Filter,
  Trophy,
  Wallet,
} from 'lucide-react';
import type { MarketCategory, MarketEvent, CategoryInfo } from './types';
import { CATEGORY_CONFIG } from './types';
import { getEventSlug } from './utils';
import { EventCard } from './EventCard';
import { supabase } from '../../lib/supabase';

const PAGE_SIZE = 24;
const ALL_CATEGORIES: MarketCategory[] = ['all', 'politics', 'sports', 'crypto', 'ai-tech', 'entertainment', 'finance'];

type MarketSource = 'all' | 'polymarket' | 'kalshi' | 'predix';
const SOURCE_CONFIG: Record<MarketSource, { label: string; color: string; activeClass: string }> = {
  all:        { label: 'All Sources', color: 'text-white/60',         activeClass: 'bg-white/10 text-white border-white/30' },
  polymarket: { label: 'Polymarket',  color: 'text-neon-cyan/70',     activeClass: 'bg-neon-cyan/15 text-neon-cyan border-neon-cyan/40' },
  kalshi:     { label: 'Kalshi',      color: 'text-neon-magenta/70',  activeClass: 'bg-neon-magenta/15 text-neon-magenta border-neon-magenta/40' },
  predix:     { label: 'Predix 🇧🇷',  color: 'text-neon-green/70',    activeClass: 'bg-neon-green/15 text-neon-green border-neon-green/40' },
};

/** Transform an aio_markets row into a MarketEvent */
function mapRowToEvent(m: Record<string, unknown>): MarketEvent {
  const url = (m.url as string) || '';
  const outcomes = (m.outcomes as { id: string; name: string; probability: number; price: number }[]) || [];
  const yesOutcome = outcomes.find((o) => o.id === 'yes' || o.name?.toLowerCase() === 'yes');
  const probability = yesOutcome ? yesOutcome.probability : outcomes[0]?.probability ?? 0.5;

  return {
    eventUrl: url,
    eventTitle: (m.question as string) || '',
    source: (m.source as string) || '',
    category: (m.category as string) || 'other',
    image: (m.image as string) || null,
    totalVolume: Number(m.total_volume) || 0,
    volume24h: Number(m.volume_24h) || 0,
    liquidity: Number(m.liquidity) || 0,
    closeTime: m.close_time ? Number(m.close_time) : 0,
    marketCount: 1,
    markets: [{
      id: m.id as string,
      question: (m.question as string) || '',
      outcomes,
      total_volume: Number(m.total_volume) || 0,
      volume_24h: Number(m.volume_24h) || 0,
      probability,
    }],
  };
}

export function PredictionBrowse() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'newest' | 'closing_soon'>('volume');
  const [category, setCategory] = useState<MarketCategory>('all');
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const [source, setSource] = useState<MarketSource>('all');
  const [sourceCounts, setSourceCounts] = useState<Record<string, number>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setOffset(0);
    setEvents([]);
    loadEvents(0);
  }, [sortBy, category, source]);

  const loadCategories = async () => {
    try {
      // Fetch source counts from backend stats API (Supabase count:exact is unreliable here)
      const statsUrl = import.meta.env.VITE_API_URL?.replace(/\/api$/, '') || 'https://ai-olympics-api.fly.dev';
      const [statsRes, catRes] = await Promise.all([
        fetch(`${statsUrl}/api/predictions/stats`).then(r => r.ok ? r.json() : null).catch(() => null),
        supabase.from('aio_markets').select('category').eq('status', 'open').limit(1000),
      ]);

      // Source counts from stats API
      const totals = statsRes?.totals ?? {};
      const allCount: number = totals.open ?? totals.all ?? 0;
      const srcCounts: Record<string, number> = {};
      if (totals.polymarket) srcCounts['polymarket'] = totals.polymarket;
      if (totals.kalshi) srcCounts['kalshi'] = totals.kalshi;
      if (totals.predix) srcCounts['predix'] = totals.predix;

      // Category distribution from row sample
      const counts: Record<string, number> = {};
      for (const row of catRes.data || []) {
        const cat = row.category || 'other';
        counts[cat] = (counts[cat] || 0) + 1;
      }

      const catInfos: CategoryInfo[] = [
        { id: 'all', name: 'All Markets', count: allCount, icon: CATEGORY_CONFIG.all.icon },
        ...Object.entries(counts)
          .filter(([id]) => ALL_CATEGORIES.includes(id as MarketCategory))
          .map(([id, count]) => ({
            id: id as MarketCategory,
            name: CATEGORY_CONFIG[id as MarketCategory]?.name || id,
            count,
            icon: CATEGORY_CONFIG[id as MarketCategory]?.icon,
          })),
      ];
      setCategories(catInfos);
      setSourceCounts({ all: allCount, ...srcCounts });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading categories:', error);
    }
  };

  const loadEvents = async (newOffset: number = 0) => {
    if (newOffset === 0) {
      setLoading(true);
    } else {
      setLoadingMore(true);
    }
    setError(null);
    try {
      // Select only needed columns (skip description to reduce payload)
      // Use estimated count to avoid slow exact count on 91K+ rows
      const columns = 'id,source,question,category,outcomes,total_volume,volume_24h,liquidity,close_time,status,url,image';
      let query = supabase
        .from('aio_markets')
        .select(columns, { count: 'estimated' })
        .eq('status', 'open');

      if (category !== 'all') {
        query = query.eq('category', category);
      }

      if (source !== 'all') {
        query = query.eq('source', source);
      }

      if (sortBy === 'volume') {
        query = query.order('total_volume', { ascending: false });
      } else if (sortBy === 'newest') {
        query = query.order('created_at', { ascending: false });
      } else if (sortBy === 'closing_soon') {
        query = query.order('close_time', { ascending: true });
      }

      query = query.range(newOffset, newOffset + PAGE_SIZE - 1);

      const { data, error, count } = await query;
      if (error) throw error;

      const newEvents = (data || []).map(mapRowToEvent);
      const totalCount = count || 0;

      if (newOffset === 0) {
        setEvents(newEvents);
      } else {
        setEvents(prev => [...prev, ...newEvents]);
      }

      setTotal(totalCount);
      setHasMore(newEvents.length === PAGE_SIZE);
      setOffset(newOffset);
    } catch (err) {
      console.error('Error loading events:', err);
      setError('Failed to load prediction markets. Please try again.');
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  const loadMore = () => {
    if (!loadingMore && hasMore) {
      loadEvents(offset + PAGE_SIZE);
    }
  };

  const searchMarkets = async () => {
    if (!searchQuery.trim()) {
      setOffset(0);
      loadEvents(0);
      return;
    }

    setLoading(true);
    try {
      const query = searchQuery.trim().toLowerCase();
      const columns = 'id,source,question,category,outcomes,total_volume,volume_24h,liquidity,close_time,status,url,image';
      const { data, error } = await supabase
        .from('aio_markets')
        .select(columns)
        .eq('status', 'open')
        .ilike('question', `%${query}%`)
        .order('total_volume', { ascending: false })
        .limit(100);

      if (error) throw error;

      const searchEvents: MarketEvent[] = (data || []).map(mapRowToEvent);
      setEvents(searchEvents);
      setTotal(searchEvents.length);
      setHasMore(false);
      setOffset(0);
    } catch (error) {
      console.error('Error searching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (eventUrl: string) => {
    setExpandedEvents(prev => {
      const next = new Set(prev);
      if (next.has(eventUrl)) next.delete(eventUrl);
      else next.add(eventUrl);
      return next;
    });
  };

  const handleCardClick = (event: MarketEvent) => {
    const slug = getEventSlug(event.eventUrl);
    navigate(`/predictions/event/${slug}`);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SEO title="Prediction Markets" description="Bet on AI agent competitions with virtual currency. View real-time odds from Polymarket and Kalshi." path="/predictions" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="magenta" glow>Prediction Markets</NeonText>
          </h1>
          <p className="text-white/60">
            Browse markets from Polymarket + Kalshi across all categories
            {total > 0 && <span className="ml-2 text-neon-magenta">({total.toLocaleString()} events)</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/predictions/leaderboard"
            className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white transition-colors"
          >
            <Trophy size={16} />
            Leaderboard
          </Link>
          <Link
            to="/dashboard/portfolio"
            className="flex items-center gap-1.5 px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-sm text-white/70 hover:text-white transition-colors"
          >
            <Wallet size={16} />
            Portfolio
          </Link>
          <button
            onClick={() => loadEvents(0)}
            disabled={loading}
            className="p-2.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 hover:text-white transition-colors disabled:opacity-50"
            aria-label="Refresh predictions"
          >
            <RefreshCw size={18} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Beta Virtual-Only Disclaimer */}
      <div className="mb-4 px-4 py-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-sm text-yellow-300 flex items-start gap-2">
        <span className="shrink-0 mt-0.5">&#9888;</span>
        <span>
          <strong>Beta - Virtual Currency Only.</strong> All bets use virtual M$ (play money). No real money is involved. Market data is sourced from Polymarket + Kalshi + Predix 🇧🇷 for educational purposes.
        </span>
      </div>

      {/* Info Banner */}
      <GlassCard className="p-4 mb-6 border-neon-magenta/30">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-neon-magenta/20 flex items-center justify-center shrink-0">
            <TrendingUp className="text-neon-magenta" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">Multi-Source Markets</h3>
            <p className="text-sm text-white/60">
              Browse real prediction markets from Polymarket + Kalshi. Filter by source and category across politics, sports, crypto, AI, entertainment, and finance. In competitions, agents trade with virtual M$10,000.
            </p>
          </div>
        </div>
      </GlassCard>

      {/* Category Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {ALL_CATEGORIES.map(cat => {
          const config = CATEGORY_CONFIG[cat];
          const catInfo = categories.find(c => c.id === cat);
          return (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                category === cat
                  ? 'bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/50'
                  : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
              }`}
            >
              {config.icon}
              <span>{config.name}</span>
              {catInfo && (
                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                  category === cat ? 'bg-neon-magenta/30' : 'bg-white/10'
                }`}>
                  {catInfo.count > 999 ? `${(catInfo.count / 1000).toFixed(0)}K` : catInfo.count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Source Filter */}
      <div className="flex items-center gap-2 mb-4 flex-wrap">
        <span className="text-xs text-white/40 font-medium uppercase tracking-wider mr-1">Source:</span>
        {(Object.keys(SOURCE_CONFIG) as MarketSource[]).map((src) => {
          const cfg = SOURCE_CONFIG[src];
          const count = sourceCounts[src] ?? (src === 'all' ? undefined : 0);
          const isActive = source === src;
          return (
            <button
              key={src}
              onClick={() => setSource(src)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold border transition-all ${
                isActive
                  ? cfg.activeClass
                  : 'bg-transparent border-white/10 text-white/40 hover:border-white/20 hover:text-white/60'
              }`}
            >
              {cfg.label}
              {count !== undefined && (
                <span className={`text-[10px] opacity-70 ${isActive ? '' : 'text-white/30'}`}>
                  {count.toLocaleString()}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search and Sort */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" />
          <input
            type="text"
            placeholder="Search markets..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && searchMarkets()}
            className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder:text-white/40 focus:border-neon-magenta/50 focus:outline-none"
          />
        </div>
        <div className="flex gap-2">
          <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3">
            <Filter size={16} className="text-white/40" />
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as 'volume' | 'newest' | 'closing_soon')}
              className="bg-transparent text-white py-3 pr-2 focus:outline-none text-sm"
            >
              <option value="volume">By Volume</option>
              <option value="newest">Newest</option>
              <option value="closing_soon">Closing Soon</option>
            </select>
          </div>
          <NeonButton onClick={searchMarkets} className="px-4">
            Search
          </NeonButton>
        </div>
      </div>

      {error && <ErrorBanner message={error} onRetry={() => loadEvents(0)} className="mb-6" />}

      {/* Event Cards */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : events.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <TrendingUp size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No markets found</h3>
          <p className="text-white/60 mb-4">Try a different search or check back later</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          <AnimatePresence>
            {events.map((event, index) => (
              <EventCard
                key={event.eventUrl}
                event={event}
                index={index}
                isExpanded={expandedEvents.has(event.eventUrl)}
                onToggleExpand={toggleExpand}
                onClick={handleCardClick}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Load More */}
      {hasMore && !loading && (
        <div className="mt-8 flex flex-col items-center gap-2">
          <p className="text-sm text-white/40">
            Showing {events.length.toLocaleString()} of {total.toLocaleString()} events
          </p>
          <NeonButton
            onClick={loadMore}
            disabled={loadingMore}
            icon={loadingMore ? <RefreshCw size={18} className="animate-spin" /> : undefined}
          >
            {loadingMore ? 'Loading...' : 'Load More Events'}
          </NeonButton>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center text-sm text-white/40">
        <p>
          Markets sourced from{' '}
          <a href="https://polymarket.com" target="_blank" rel="noopener noreferrer" className="text-neon-cyan hover:underline">
            Polymarket
          </a>
          {' + '}
          <a href="https://kalshi.com" target="_blank" rel="noopener noreferrer" className="text-neon-magenta hover:underline">
            Kalshi
          </a>
          . Prices and data update in real-time.
        </p>
      </div>
    </div>
  );
}

export default PredictionBrowse;
