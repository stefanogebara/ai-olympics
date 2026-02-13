import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import {
  TrendingUp,
  RefreshCw,
  ExternalLink,
  BarChart3,
  Clock,
  Search,
  Filter,
  Globe,
  Landmark,
  Trophy,
  Bitcoin,
  Cpu,
  Film,
  DollarSign,
  ChevronDown,
  ChevronUp,
  Wallet,
} from 'lucide-react';

// Market categories
type MarketCategory = 'all' | 'politics' | 'sports' | 'crypto' | 'ai-tech' | 'entertainment' | 'finance';

interface CategoryInfo {
  id: MarketCategory;
  name: string;
  count: number;
  icon: React.ReactNode;
}

const CATEGORY_CONFIG: Record<MarketCategory, { name: string; icon: React.ReactNode; color: string }> = {
  'all': { name: 'All Markets', icon: <Globe size={16} />, color: 'cyan' },
  'politics': { name: 'Politics', icon: <Landmark size={16} />, color: 'red' },
  'sports': { name: 'Sports', icon: <Trophy size={16} />, color: 'teal' },
  'crypto': { name: 'Crypto', icon: <Bitcoin size={16} />, color: 'yellow' },
  'ai-tech': { name: 'AI & Tech', icon: <Cpu size={16} />, color: 'green' },
  'entertainment': { name: 'Entertainment', icon: <Film size={16} />, color: 'pink' },
  'finance': { name: 'Finance', icon: <DollarSign size={16} />, color: 'emerald' },
};

interface EventMarket {
  id: string;
  question: string;
  outcomes: { id: string; name: string; probability: number; price: number }[];
  total_volume: number;
  volume_24h: number;
  probability: number;
}

interface MarketEvent {
  eventUrl: string;
  eventTitle: string;
  source: string;
  category: string;
  image: string | null;
  totalVolume: number;
  volume24h: number;
  liquidity: number;
  closeTime: number;
  marketCount: number;
  markets: EventMarket[];
}

import { API_BASE } from '../../lib/api';

/**
 * Extract short outcome names from a group of related questions.
 * e.g., ["Will Trump nominate Kevin Warsh as...?", "Will Trump nominate Judy Shelton as...?"]
 * → ["Kevin Warsh", "Judy Shelton"]
 */
function extractOutcomeNames(questions: string[]): string[] {
  if (questions.length <= 1) return questions;

  // Find longest common prefix
  let prefix = questions[0];
  for (const q of questions) {
    while (prefix && !q.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

  // Find longest common suffix
  let suffix = questions[0];
  for (const q of questions) {
    while (suffix && !q.endsWith(suffix)) {
      suffix = suffix.slice(1);
    }
  }

  const prefixLen = prefix.length;
  const suffixLen = suffix.length;

  return questions.map(q => {
    const name = q.slice(prefixLen, q.length - suffixLen).trim();
    // Clean up leftover punctuation
    return name.replace(/^['"]|['"]$/g, '').trim() || q;
  });
}

export function PredictionBrowse() {
  const navigate = useNavigate();
  const [events, setEvents] = useState<MarketEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'volume' | 'newest' | 'closing_soon'>('volume');
  const [filterType, setFilterType] = useState<'all' | 'BINARY' | 'MULTIPLE_CHOICE'>('all');
  const [category, setCategory] = useState<MarketCategory>('all');
  const [categories, setCategories] = useState<CategoryInfo[]>([]);
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [expandedEvents, setExpandedEvents] = useState<Set<string>>(new Set());
  const PAGE_SIZE = 24;

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

  const getEventSlug = (eventUrl: string): string => {
    // Extract slug from URL like "https://polymarket.com/event/democratic-presidential-nominee-2028"
    // or Kalshi URLs like "https://kalshi.com/markets/..."
    const match = eventUrl.match(/\/event\/([^/?#]+)/) || eventUrl.match(/\/markets\/([^/?#]+)/);
    if (match) return match[1];
    // Fallback: use last path segment
    const parts = eventUrl.replace(/[/?#].*$/, '').split('/');
    return parts[parts.length - 1] || eventUrl;
  };

  const handleCardClick = (event: MarketEvent) => {
    const slug = getEventSlug(event.eventUrl);
    navigate(`/predictions/event/${slug}`);
  };

  const formatVolume = (volume: number, source?: string): string => {
    const prefix = '$';
    if (volume >= 1000000) return `${prefix}${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `${prefix}${(volume / 1000).toFixed(1)}K`;
    return `${prefix}${volume.toFixed(0)}`;
  };

  const formatCloseDate = (closeTime?: number): string => {
    if (!closeTime) return 'No close date';
    const date = new Date(closeTime);
    const now = new Date();
    const diff = date.getTime() - now.getTime();
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    if (days < 0) return 'Closed';
    if (days === 0) return 'Closes today';
    if (days === 1) return 'Closes tomorrow';
    if (days < 7) return `Closes in ${days} days`;
    return date.toLocaleDateString();
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
          <NeonButton
            onClick={() => loadEvents(0)}
            icon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
            disabled={loading}
          >
            Refresh
          </NeonButton>
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
        {(['all', 'politics', 'sports', 'crypto', 'ai-tech', 'entertainment', 'finance'] as MarketCategory[]).map(cat => {
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
            {events.map((event, index) => {
              const catConfig = CATEGORY_CONFIG[event.category as MarketCategory] || CATEGORY_CONFIG['all'];
              const isMulti = event.marketCount > 1;
              const isExpanded = expandedEvents.has(event.eventUrl);
              const VISIBLE_COUNT = 4;
              const visibleMarkets = isExpanded ? event.markets : event.markets.slice(0, VISIBLE_COUNT);
              const hiddenCount = event.marketCount - VISIBLE_COUNT;

              // For multi-market events, extract short outcome names
              const questions = visibleMarkets.map(m => m.question);
              const outcomeNames = isMulti ? extractOutcomeNames(questions) : questions;

              return (
                <motion.div
                  key={event.eventUrl}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.02 }}
                >
                  <GlassCard hover className="h-full flex flex-col overflow-hidden cursor-pointer" onClick={() => handleCardClick(event)}>
                    {/* Card Header */}
                    <div className="p-4 pb-3">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex items-center gap-2">
                          <Badge variant={event.source === 'polymarket' ? 'default' : 'info'} className="text-[10px]">
                            {event.source.toUpperCase()}
                          </Badge>
                          <span className="text-xs text-white/40 flex items-center gap-1">
                            {catConfig.icon}
                            {catConfig.name}
                          </span>
                        </div>
                        <a
                          href={event.eventUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-white/40 hover:text-neon-magenta transition-colors"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <ExternalLink size={14} />
                        </a>
                      </div>

                      {/* Event Title + Image */}
                      <div className="flex gap-3 items-start">
                        {event.image && (
                          <img
                            src={event.image}
                            alt=""
                            className="w-10 h-10 rounded-lg object-cover shrink-0"
                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                          />
                        )}
                        <h3 className="text-sm font-semibold text-white leading-snug line-clamp-2">
                          {isMulti ? event.eventTitle : event.markets[0]?.question || event.eventTitle}
                        </h3>
                      </div>
                    </div>

                    {/* Outcome Rows */}
                    <div className="flex-1 px-4 pb-2">
                      {isMulti ? (
                        // Multi-market event: show outcome rows
                        <div className="space-y-1.5">
                          {visibleMarkets.map((market, i) => {
                            const yesProb = market.probability * 100;
                            return (
                              <div key={market.id} className="flex items-center gap-2">
                                <span className="text-xs text-white/80 truncate flex-1 min-w-0">
                                  {outcomeNames[i]}
                                </span>
                                <div className="w-20 h-1.5 bg-white/10 rounded-full overflow-hidden shrink-0">
                                  <div
                                    className="h-full rounded-full transition-all duration-500"
                                    style={{
                                      width: `${yesProb}%`,
                                      background: yesProb > 50
                                        ? 'linear-gradient(90deg, #06b6d4, #d946ef)'
                                        : 'rgba(255,255,255,0.25)',
                                    }}
                                  />
                                </div>
                                <span className={`text-xs font-bold w-10 text-right shrink-0 ${
                                  yesProb > 50 ? 'text-neon-cyan' : 'text-white/60'
                                }`}>
                                  {yesProb.toFixed(0)}%
                                </span>
                              </div>
                            );
                          })}
                          {hiddenCount > 0 && (
                            <button
                              onClick={(e) => { e.stopPropagation(); toggleExpand(event.eventUrl); }}
                              className="flex items-center gap-1 text-xs text-neon-magenta/70 hover:text-neon-magenta transition-colors pt-0.5"
                            >
                              {isExpanded ? (
                                <>Show less <ChevronUp size={12} /></>
                              ) : (
                                <>+{hiddenCount} more <ChevronDown size={12} /></>
                              )}
                            </button>
                          )}
                        </div>
                      ) : (
                        // Single market: show Yes/No probability display
                        (() => {
                          const market = event.markets[0];
                          if (!market) return null;
                          const yesOutcome = market.outcomes?.find((o: any) => o.name?.toLowerCase() === 'yes' || o.id === 'yes');
                          const firstOutcome = market.outcomes?.[0];
                          const prob = yesOutcome
                            ? yesOutcome.probability * 100
                            : firstOutcome
                              ? firstOutcome.probability * 100
                              : 50;

                          return (
                            <div>
                              {market.outcomes?.map((outcome: any) => (
                                <div key={outcome.id} className="flex items-center gap-2 mb-1.5">
                                  <span className="text-xs text-white/80 w-12 truncate">{outcome.name}</span>
                                  <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                    <div
                                      className="h-full rounded-full transition-all duration-500"
                                      style={{
                                        width: `${outcome.probability * 100}%`,
                                        background: outcome.probability > 0.5
                                          ? 'linear-gradient(90deg, #06b6d4, #d946ef)'
                                          : 'rgba(255,255,255,0.25)',
                                      }}
                                    />
                                  </div>
                                  <span className={`text-xs font-bold w-10 text-right ${
                                    outcome.probability > 0.5 ? 'text-neon-cyan' : 'text-white/60'
                                  }`}>
                                    {(outcome.probability * 100).toFixed(0)}%
                                  </span>
                                </div>
                              ))}
                            </div>
                          );
                        })()
                      )}
                    </div>

                    {/* Card Footer */}
                    <div className="px-4 py-3 mt-auto border-t border-white/5 flex items-center justify-between text-xs text-white/40">
                      <div className="flex items-center gap-3">
                        <span className="flex items-center gap-1">
                          <BarChart3 size={12} />
                          {formatVolume(event.totalVolume)}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock size={12} />
                          {formatCloseDate(event.closeTime)}
                        </span>
                      </div>
                      <span>
                        via {event.source === 'polymarket' ? 'Polymarket' : event.source === 'kalshi' ? 'Kalshi' : event.source}
                      </span>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
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
