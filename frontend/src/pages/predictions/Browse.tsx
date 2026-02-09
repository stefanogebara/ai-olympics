import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import {
  TrendingUp,
  RefreshCw,
  ExternalLink,
  BarChart3,
  Clock,
  Users,
  Search,
  Filter,
  Globe,
  Landmark,
  Trophy,
  Bitcoin,
  Cpu,
  Film,
  DollarSign,
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

interface UnifiedMarket {
  id: string;
  source: 'polymarket' | 'kalshi';
  question: string;
  description?: string;
  category: string;
  outcomes: { id: string; name: string; probability: number; price: number }[];
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  closeTime?: number;
  status: string;
  url: string;
}

// Keep legacy interface for backwards compatibility
interface ManifoldMarket {
  id: string;
  question: string;
  probability?: number;
  volume: number;
  closeTime?: number;
  url: string;
  creatorUsername: string;
  isResolved: boolean;
  resolution?: string;
  outcomeType: string;
  uniqueBettorCount?: number;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3003';

export function PredictionBrowse() {
  const [markets, setMarkets] = useState<UnifiedMarket[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<'liquidity' | 'newest' | 'close-date'>('liquidity');
  const [filterType, setFilterType] = useState<'all' | 'BINARY' | 'MULTIPLE_CHOICE'>('all');
  const [category, setCategory] = useState<MarketCategory>('all');
  const [categories, setCategories] = useState<CategoryInfo[]>([]);

  useEffect(() => {
    loadCategories();
  }, []);

  useEffect(() => {
    loadMarkets();
  }, [sortBy, category]);

  const loadCategories = async () => {
    try {
      const response = await fetch(`${API_BASE}/api/predictions/categories`);
      if (response.ok) {
        const data = await response.json();
        setCategories(data.categories || []);
      }
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  const loadMarkets = async () => {
    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/predictions/markets?limit=24&category=${category}`
      );
      if (!response.ok) throw new Error('Failed to fetch markets');
      const data = await response.json();
      setMarkets(data.markets || data);
    } catch (error) {
      console.error('Error loading markets:', error);
    } finally {
      setLoading(false);
    }
  };

  const searchMarkets = async () => {
    if (!searchQuery.trim()) {
      loadMarkets();
      return;
    }

    setLoading(true);
    try {
      const response = await fetch(
        `${API_BASE}/api/predictions/search?q=${encodeURIComponent(searchQuery)}&limit=24`
      );
      if (!response.ok) throw new Error('Failed to search markets');
      const data = await response.json();
      setMarkets(data);
    } catch (error) {
      console.error('Error searching markets:', error);
    } finally {
      setLoading(false);
    }
  };

  const filteredMarkets = markets.filter(market => {
    if (filterType === 'all') return true;
    return market.outcomeType === filterType;
  });

  const formatVolume = (volume: number): string => {
    if (volume >= 1000000) return `M$${(volume / 1000000).toFixed(1)}M`;
    if (volume >= 1000) return `M$${(volume / 1000).toFixed(1)}K`;
    return `M$${volume.toFixed(0)}`;
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
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="magenta" glow>Prediction Markets</NeonText>
          </h1>
          <p className="text-white/60">Browse markets from Polymarket + Kalshi across all categories</p>
        </div>
        <NeonButton
          onClick={loadMarkets}
          icon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
          disabled={loading}
        >
          Refresh
        </NeonButton>
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
        {Object.entries(CATEGORY_CONFIG).map(([id, config]) => {
          const catId = id as MarketCategory;
          const catInfo = categories.find(c => c.id === catId);
          const count = catInfo?.count ?? 0;
          const isActive = category === catId;

          return (
            <button
              key={catId}
              onClick={() => setCategory(catId)}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                isActive
                  ? 'bg-neon-magenta/20 border border-neon-magenta/50 text-neon-magenta'
                  : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
              }`}
            >
              {config.icon}
              <span>{config.name}</span>
              {count > 0 && (
                <span className={`text-xs px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-neon-magenta/30' : 'bg-white/10'
                }`}>
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Search and Filters */}
      <GlassCard className="p-4 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40" size={18} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && searchMarkets()}
              placeholder="Search markets..."
              className="w-full pl-10 pr-4 py-2 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder-white/40 focus:outline-none focus:border-neon-magenta/50"
            />
          </div>

          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-white/60">
              <Filter size={16} />
            </div>

            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className="px-3 py-2 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-magenta/50"
            >
              <option value="liquidity">By Liquidity</option>
              <option value="newest">Newest</option>
              <option value="close-date">Closing Soon</option>
            </select>

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="px-3 py-2 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-magenta/50"
            >
              <option value="all">All Types</option>
              <option value="BINARY">Binary (Yes/No)</option>
              <option value="MULTIPLE_CHOICE">Multiple Choice</option>
            </select>

            <NeonButton onClick={searchMarkets} size="sm" variant="secondary">
              Search
            </NeonButton>
          </div>
        </div>
      </GlassCard>

      {/* Markets Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-neon-magenta/30 border-t-neon-magenta rounded-full animate-spin" />
        </div>
      ) : filteredMarkets.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <TrendingUp size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No markets found</h3>
          <p className="text-white/60 mb-4">Try a different search or check back later</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredMarkets.map((market, index) => {
              // Handle both UnifiedMarket and legacy ManifoldMarket formats
              const yesOutcome = (market as UnifiedMarket).outcomes?.find(o => o.name === 'YES');
              const prob = yesOutcome ? yesOutcome.probability * 100 : ((market as any).probability ?? 0.5) * 100;
              const volume = (market as UnifiedMarket).volume24h || (market as UnifiedMarket).totalVolume || (market as any).volume || 0;
              const source = (market as UnifiedMarket).source || 'polymarket';
              const marketCategory = (market as UnifiedMarket).category || 'other';
              const catConfig = CATEGORY_CONFIG[marketCategory as MarketCategory] || CATEGORY_CONFIG['all'];

              return (
                <motion.div
                  key={market.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.03 }}
                >
                  <GlassCard hover className="p-6 h-full flex flex-col">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <Badge variant={source === 'polymarket' ? 'default' : 'info'}>
                          {source.toUpperCase()}
                        </Badge>
                        <span className="text-xs text-white/40 flex items-center gap-1">
                          {catConfig.icon}
                          {catConfig.name}
                        </span>
                      </div>
                      <a
                        href={market.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-white/40 hover:text-neon-magenta transition-colors"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <ExternalLink size={16} />
                      </a>
                    </div>

                    {/* Question */}
                    <h3 className="text-base font-medium text-white mb-4 line-clamp-3 flex-1">
                      {market.question}
                    </h3>

                    {/* Probability Bar */}
                    <div className="mb-4">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-2xl font-bold text-neon-magenta">
                          {prob.toFixed(0)}%
                        </span>
                        <span className="text-sm text-white/60">
                          {prob > 50 ? 'YES' : 'NO'} favored
                        </span>
                      </div>
                      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-neon-cyan to-neon-magenta rounded-full transition-all duration-500"
                          style={{ width: `${prob}%` }}
                        />
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div className="flex items-center gap-2 text-white/60">
                        <BarChart3 size={14} />
                        <span>{formatVolume(volume)}</span>
                      </div>
                      {(market as UnifiedMarket).liquidity !== undefined && (
                        <div className="flex items-center gap-2 text-white/60">
                          <DollarSign size={14} />
                          <span>{formatVolume((market as UnifiedMarket).liquidity)} liq</span>
                        </div>
                      )}
                      <div className="flex items-center gap-2 text-white/60 col-span-2">
                        <Clock size={14} />
                        <span>{formatCloseDate((market as UnifiedMarket).closeTime)}</span>
                      </div>
                    </div>

                    {/* Source info */}
                    <div className="mt-4 pt-4 border-t border-white/10">
                      <span className="text-xs text-white/40">
                        via {source === 'polymarket' ? 'Polymarket' : 'Kalshi'}
                      </span>
                    </div>
                  </GlassCard>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Footer Info */}
      <div className="mt-8 text-center text-sm text-white/40">
        <p>
          Markets sourced from{' '}
          <a
            href="https://polymarket.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neon-cyan hover:underline"
          >
            Polymarket
          </a>
          {' + '}
          <a
            href="https://kalshi.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-neon-magenta hover:underline"
          >
            Kalshi
          </a>
          . Prices and data update in real-time.
        </p>
      </div>
    </div>
  );
}

export default PredictionBrowse;
