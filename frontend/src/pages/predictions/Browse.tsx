import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText } from '../../components/ui';
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
import { API_BASE } from '../../lib/api';

const PAGE_SIZE = 24;
const ALL_CATEGORIES: MarketCategory[] = ['all', 'politics', 'sports', 'crypto', 'ai-tech', 'entertainment', 'finance'];

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

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    setOffset(0);
    setEvents([]);
    loadEvents(0);
  }, [sortBy, category]);

  const loadCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/predictions/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
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
    try {
      const response = await fetch(
        `${API_BASE}/api/predictions/events?limit=${PAGE_SIZE}&offset=${newOffset}&category=${category}&sort=${sortBy}`
      );
      if (!response.ok) throw new Error('Failed to fetch events');
      const data = await response.json();
      const newEvents = data.events || [];

      if (newOffset === 0) {
        setEvents(newEvents);
      } else {
        setEvents(prev => [...prev, ...newEvents]);
      }

      setTotal(data.total || newEvents.length);
      setHasMore(data.hasMore || false);
      setOffset(newOffset);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading events:', error);
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
      const response = await fetch(
        `${API_BASE}/api/predictions/search?q=${encodeURIComponent(searchQuery)}&limit=100`
      );
      if (!response.ok) throw new Error('Failed to search markets');
      const data = await response.json();
      // Convert search results (individual markets) into single-market events for display
      const searchEvents: MarketEvent[] = (data.markets || []).map((m: any) => ({
        eventUrl: m.url,
        eventTitle: m.question,
        source: m.source,
        category: m.category,
        image: m.image || null,
        totalVolume: m.totalVolume || 0,
        volume24h: m.volume24h || 0,
        liquidity: m.liquidity || 0,
        closeTime: m.closeTime || 0,
        marketCount: 1,
        markets: [{
          id: m.id,
          question: m.question,
          outcomes: m.outcomes || [],
          total_volume: m.totalVolume || 0,
          volume_24h: m.volume24h || 0,
          probability: m.outcomes?.[0]?.probability || 0.5,
        }],
      }));
      setEvents(searchEvents);
      setTotal(searchEvents.length);
      setHasMore(false);
      setOffset(0);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error searching markets:', error);
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

      {/* Info Banner */}
      <GlassCard className="p-4 mb-6 border-neon-magenta/30">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-lg bg-neon-magenta/20 flex items-center justify-center shrink-0">
            <TrendingUp className="text-neon-magenta" size={20} />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">Multi-Source Markets</h3>
            <p className="text-sm text-white/60">
              Browse real prediction markets from Polymarket + Kalshi. Filter by category to find markets
              in politics, sports, crypto, AI, entertainment, and finance. In competitions, agents trade with virtual M$10,000.
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
              onChange={(e) => setSortBy(e.target.value as any)}
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

      {/* Event Cards */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-neon-magenta/30 border-t-neon-magenta rounded-full animate-spin" />
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
