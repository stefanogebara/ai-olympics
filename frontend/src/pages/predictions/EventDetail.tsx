import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonText, NeonButton, Badge, PageSkeleton } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import {
  ArrowLeft,
  ExternalLink,
  BarChart3,
  Clock,
  DollarSign,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  X,
  Zap,
  AlertTriangle,
  Check,
} from 'lucide-react';
import { supabase } from '../../lib/supabase';

interface EventMarketDetail {
  id: string;
  question: string;
  description: string;
  outcomes: { id: string; name: string; probability: number; price: number }[];
  total_volume: number;
  volume_24h: number;
  liquidity: number;
  close_time: number;
  probability: number;
}

interface EventData {
  eventUrl: string;
  eventTitle: string;
  slug: string;
  source: string;
  category: string;
  image: string | null;
  totalVolume: number;
  volume24h: number;
  liquidity: number;
  closeTime: number;
  marketCount: number;
  markets: EventMarketDetail[];
}

/**
 * Extract short outcome names from grouped questions.
 */
function extractOutcomeNames(questions: string[]): string[] {
  if (questions.length <= 1) return questions;

  let prefix = questions[0];
  for (const q of questions) {
    while (prefix && !q.startsWith(prefix)) {
      prefix = prefix.slice(0, -1);
    }
  }

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
    return name.replace(/^['"]|['"]$/g, '').trim() || q;
  });
}

function formatVolume(volume: number): string {
  if (volume >= 1_000_000) return `$${(volume / 1_000_000).toFixed(1)}M`;
  if (volume >= 1_000) return `$${(volume / 1_000).toFixed(1)}K`;
  return `$${volume.toFixed(0)}`;
}

function formatDate(timestamp: number): string {
  if (!timestamp) return 'No close date';
  return new Date(timestamp).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTimeLeft(timestamp: number): string {
  if (!timestamp) return '';
  const diff = timestamp - Date.now();
  if (diff < 0) return 'Closed';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days === 0) return 'Closes today';
  if (days === 1) return 'Closes tomorrow';
  if (days < 7) return `${days} days left`;
  if (days < 30) return `${Math.floor(days / 7)} weeks left`;
  return `${Math.floor(days / 30)} months left`;
}

// ============================================================================
// BET PANEL COMPONENT
// ============================================================================

interface BetPanelProps {
  marketId: string;
  marketQuestion: string;
  outcome: string;
  probability: number;
  onClose: () => void;
  onSuccess: () => void;
}

function BetPanel({ marketId, marketQuestion, outcome, probability, onClose, onSuccess }: BetPanelProps) {
  const { session } = useAuthStore();
  const [amount, setAmount] = useState<string>('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [limits, setLimits] = useState<{
    balance: number; maxBet: number; minBet: number;
    dailyBetsUsed: number; dailyBetsMax: number;
    openPositions: number; maxPositions: number;
  } | null>(null);

  useEffect(() => {
    if (session?.access_token) {
      // Load user portfolio limits directly from Supabase
      (async () => {
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          if (!authUser) return;
          const { data: portfolio } = await supabase
            .from('aio_user_portfolios')
            .select('virtual_balance, total_bets')
            .eq('user_id', authUser.id)
            .maybeSingle();
          const { count: openPositions } = await supabase
            .from('aio_user_positions')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', authUser.id);
          if (portfolio) {
            setLimits({
              balance: Number(portfolio.virtual_balance) || 10000,
              maxBet: 1000,
              minBet: 1,
              dailyBetsUsed: 0,
              dailyBetsMax: 100,
              openPositions: openPositions || 0,
              maxPositions: 50,
            });
          }
        } catch {}
      })();
    }
  }, [session]);

  const betAmount = parseFloat(amount) || 0;
  const shares = probability > 0 ? betAmount / probability : 0;
  const potentialPayout = shares;

  const quickAmounts = [10, 50, 100, 500];

  const placeBet = async () => {
    if (!session?.access_token || betAmount <= 0) return;
    setLoading(true);
    setError(null);
    try {
      const { data: { user: authUser } } = await supabase.auth.getUser();
      if (!authUser) throw new Error('Not authenticated');

      // Get or create portfolio
      let { data: portfolio } = await supabase
        .from('aio_user_portfolios')
        .select('id, virtual_balance')
        .eq('user_id', authUser.id)
        .maybeSingle();

      if (!portfolio) {
        const { data: newPortfolio, error: createErr } = await supabase
          .from('aio_user_portfolios')
          .insert({ user_id: authUser.id, virtual_balance: 10000, starting_balance: 10000 })
          .select('id, virtual_balance')
          .single();
        if (createErr) throw createErr;
        portfolio = newPortfolio;
      }

      const balance = Number(portfolio.virtual_balance) || 0;
      if (betAmount > balance) {
        setError(`Insufficient balance (M$${balance.toFixed(0)})`);
        setLoading(false);
        return;
      }

      // Insert bet
      const { error: betErr } = await supabase
        .from('aio_user_bets')
        .insert({
          user_id: authUser.id,
          portfolio_id: portfolio.id,
          market_id: marketId,
          market_source: 'polymarket',
          market_question: marketId,
          outcome,
          amount: betAmount,
          shares,
          probability_at_bet: probability,
          price_at_bet: probability,
        });

      if (betErr) throw betErr;

      // Deduct from portfolio
      await supabase
        .from('aio_user_portfolios')
        .update({
          virtual_balance: balance - betAmount,
          total_bets: (limits?.dailyBetsUsed || 0) + 1,
        })
        .eq('id', portfolio.id);

      setSuccess(true);
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to place bet');
    } finally {
      setLoading(false);
    }
  };

  const limitWarning = limits ? (
    limits.dailyBetsUsed >= limits.dailyBetsMax ? 'Daily bet limit reached' :
    limits.openPositions >= limits.maxPositions ? 'Max open positions reached' :
    betAmount > limits.maxBet ? `Max bet: M$${limits.maxBet}` :
    betAmount > limits.balance ? 'Insufficient balance' :
    null
  ) : null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 10 }}
      className="border-t border-white/10 px-4 py-4 bg-cyber-elevated/50"
      onClick={(e) => e.stopPropagation()}
    >
      {success ? (
        <div className="flex items-center justify-center gap-2 py-3 text-green-400">
          <Check size={18} />
          <span className="font-semibold">Bet placed successfully!</span>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-white/60">
              Bet <span className={outcome === 'YES' ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>{outcome}</span>
              {' '}@ {(probability * 100).toFixed(0)}%
            </span>
            <button onClick={onClose} className="text-white/40 hover:text-white">
              <X size={16} />
            </button>
          </div>

          {/* Amount Input */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-white/40 text-sm">M$</span>
              <input
                type="number"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0"
                min={1}
                className="w-full pl-10 pr-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm focus:border-neon-cyan/50 focus:outline-none"
                autoFocus
              />
            </div>
            {quickAmounts.map(qa => (
              <button
                key={qa}
                onClick={() => setAmount(String(qa))}
                className="px-2.5 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs text-white/70 hover:text-white transition-colors"
              >
                ${qa}
              </button>
            ))}
          </div>

          {/* Estimates */}
          {betAmount > 0 && (
            <div className="flex gap-4 text-xs text-white/50">
              <span>Shares: <span className="text-white/80">{shares.toFixed(2)}</span></span>
              <span>Potential payout: <span className="text-neon-cyan">M${potentialPayout.toFixed(2)}</span></span>
              <span>Profit if win: <span className="text-green-400">+M${(potentialPayout - betAmount).toFixed(2)}</span></span>
            </div>
          )}

          {/* Balance info */}
          {limits && (
            <div className="text-xs text-white/40">
              Balance: M${limits.balance.toLocaleString()} | Bets today: {limits.dailyBetsUsed}/{limits.dailyBetsMax} | Positions: {limits.openPositions}/{limits.maxPositions}
            </div>
          )}
          <div className="text-[10px] text-white/30">Virtual currency only — no real money involved.</div>

          {/* Warning */}
          {limitWarning && (
            <div className="flex items-center gap-1.5 text-xs text-yellow-400">
              <AlertTriangle size={12} />
              {limitWarning}
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="text-xs text-red-400">{error}</div>
          )}

          {/* Submit */}
          <NeonButton
            onClick={placeBet}
            disabled={loading || betAmount <= 0 || !!limitWarning}
            className="w-full"
            icon={loading ? <Zap size={14} className="animate-pulse" /> : <Zap size={14} />}
          >
            {loading ? 'Placing bet...' : `Bet M$${betAmount || 0} on ${outcome}`}
          </NeonButton>
        </div>
      )}
    </motion.div>
  );
}

// ============================================================================
// EVENT DETAIL COMPONENT
// ============================================================================

export function EventDetail() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuthStore();
  const [event, setEvent] = useState<EventData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedMarkets, setExpandedMarkets] = useState<Set<string>>(new Set());
  const [activeBet, setActiveBet] = useState<{ marketId: string; outcome: string } | null>(null);

  useEffect(() => {
    if (slug) loadEvent(slug);
  }, [slug]);

  const loadEvent = async (eventSlug: string) => {
    setLoading(true);
    setError(null);
    try {
      // Match markets by URL containing the slug
      const { data: markets, error: dbError } = await supabase
        .from('aio_markets')
        .select('*')
        .ilike('url', `%${eventSlug}%`)
        .eq('status', 'open')
        .order('total_volume', { ascending: false });

      if (dbError) throw dbError;
      if (!markets || markets.length === 0) throw new Error('Event not found');

      // Group into an event object matching the expected shape
      const first = markets[0];
      const eventTitle = eventSlug
        .split('-')
        .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const eventData = {
        eventUrl: first.url || '',
        eventTitle,
        slug: eventSlug,
        source: first.source,
        category: first.category || 'other',
        image: first.image || null,
        totalVolume: markets.reduce((sum: number, m: Record<string, unknown>) => sum + (Number(m.total_volume) || 0), 0),
        volume24h: markets.reduce((sum: number, m: Record<string, unknown>) => sum + (Number(m.volume_24h) || 0), 0),
        liquidity: Math.max(...markets.map((m: Record<string, unknown>) => Number(m.liquidity) || 0)),
        closeTime: first.close_time ? Number(first.close_time) : 0,
        marketCount: markets.length,
        markets: markets.map((m: Record<string, unknown>) => {
          const outcomes = (m.outcomes as { id: string; name: string; probability: number; price: number }[]) || [];
          const yesOutcome = outcomes.find((o) => o.id === 'yes' || o.name?.toLowerCase() === 'yes');
          return {
            id: m.id as string,
            question: m.question as string,
            description: (m.description as string) || '',
            outcomes,
            total_volume: Number(m.total_volume) || 0,
            volume_24h: Number(m.volume_24h) || 0,
            liquidity: Number(m.liquidity) || 0,
            close_time: m.close_time ? Number(m.close_time) : 0,
            probability: yesOutcome ? yesOutcome.probability : outcomes[0]?.probability ?? 0.5,
          };
        }),
      };

      setEvent(eventData);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load event');
    } finally {
      setLoading(false);
    }
  };

  const toggleMarket = (id: string) => {
    setExpandedMarkets(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (error || !event) {
    return (
      <div className="container mx-auto px-4 py-20 text-center">
        <h1 className="text-2xl font-bold text-white mb-4">{error || 'Event not found'}</h1>
        <NeonButton onClick={() => navigate('/predictions')} icon={<ArrowLeft size={18} />}>
          Back to Markets
        </NeonButton>
      </div>
    );
  }

  const isMulti = event.marketCount > 1;
  const questions = event.markets.map(m => m.question);
  const outcomeNames = isMulti ? extractOutcomeNames(questions) : questions;

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/predictions')}
        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Back to Markets</span>
      </button>

      {/* Event Header */}
      <GlassCard className="p-6 mb-6">
        <div className="flex items-start gap-4">
          {event.image && (
            <img
              src={event.image}
              alt=""
              loading="lazy"
              decoding="async"
              className="w-16 h-16 rounded-xl object-cover shrink-0"
              onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant={event.source === 'polymarket' ? 'default' : 'info'} className="text-xs">
                {event.source.toUpperCase()}
              </Badge>
              <Badge className="text-xs capitalize">{event.category}</Badge>
              {event.closeTime > 0 && (
                <span className="text-xs text-white/40">{formatTimeLeft(event.closeTime)}</span>
              )}
            </div>
            <h1 className="text-2xl font-display font-bold text-white mb-3">
              {event.eventTitle}
            </h1>

            {/* Stats row */}
            <div className="flex flex-wrap gap-4 text-sm text-white/50">
              <span className="flex items-center gap-1.5">
                <BarChart3 size={14} className="text-neon-cyan" />
                {formatVolume(event.totalVolume)} total volume
              </span>
              <span className="flex items-center gap-1.5">
                <TrendingUp size={14} className="text-neon-magenta" />
                {formatVolume(event.volume24h)} 24h volume
              </span>
              <span className="flex items-center gap-1.5">
                <DollarSign size={14} />
                {formatVolume(event.liquidity)} liquidity
              </span>
              {event.closeTime > 0 && (
                <span className="flex items-center gap-1.5">
                  <Clock size={14} />
                  Closes {formatDate(event.closeTime)}
                </span>
              )}
            </div>
          </div>

          <div className="flex flex-col gap-2 shrink-0">
            <a
              href={event.eventUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              <NeonButton className="text-xs px-3 py-1.5 w-full" icon={<ExternalLink size={14} />}>
                View on {event.source === 'polymarket' ? 'Polymarket' : 'Kalshi'}
              </NeonButton>
            </a>
            {!isAuthenticated && (
              <NeonButton
                onClick={() => navigate('/auth/login')}
                className="text-xs px-3 py-1.5"
                icon={<Zap size={14} />}
              >
                Login to bet
              </NeonButton>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Outcomes */}
      <h2 className="text-lg font-semibold text-white mb-4">
        {isMulti
          ? `${event.marketCount} Outcomes`
          : 'Market Outcomes'}
      </h2>

      <div className="space-y-2">
        {event.markets.map((market, i) => {
          const yesProb = market.probability * 100;
          const isExpanded = expandedMarkets.has(market.id);
          const name = isMulti ? outcomeNames[i] : market.question;

          return (
            <motion.div
              key={market.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <GlassCard
                className="overflow-hidden cursor-pointer hover:border-neon-magenta/30 transition-all"
                onClick={() => toggleMarket(market.id)}
              >
                {/* Main row */}
                <div className="p-4 flex items-center gap-3">
                  {/* Rank */}
                  <span className="text-xs text-white/30 w-6 text-right shrink-0">
                    {i + 1}
                  </span>

                  {/* Name */}
                  <span className="text-sm font-medium text-white flex-1 min-w-0 truncate">
                    {name}
                  </span>

                  {/* Progress bar */}
                  <div className="w-32 h-2 bg-white/10 rounded-full overflow-hidden shrink-0">
                    <div
                      className="h-full rounded-full transition-all duration-700"
                      style={{
                        width: `${yesProb}%`,
                        background: yesProb > 50
                          ? 'linear-gradient(90deg, #06b6d4, #d946ef)'
                          : yesProb > 20
                            ? 'linear-gradient(90deg, #06b6d4, #0891b2)'
                            : 'rgba(255,255,255,0.3)',
                      }}
                    />
                  </div>

                  {/* Percentage */}
                  <span className={`text-sm font-bold w-14 text-right shrink-0 ${
                    yesProb > 50 ? 'text-neon-cyan' : yesProb > 20 ? 'text-white/80' : 'text-white/50'
                  }`}>
                    {yesProb.toFixed(1)}%
                  </span>

                  {/* Volume */}
                  <span className="text-xs text-white/40 w-16 text-right shrink-0 hidden sm:block">
                    {formatVolume(market.total_volume)}
                  </span>

                  {/* Bet buttons */}
                  {isAuthenticated && (
                    <div className="flex gap-1 shrink-0">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveBet(
                            activeBet?.marketId === market.id && activeBet?.outcome === 'YES'
                              ? null
                              : { marketId: market.id, outcome: 'YES' }
                          );
                        }}
                        className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                          activeBet?.marketId === market.id && activeBet?.outcome === 'YES'
                            ? 'bg-green-500/40 text-green-300'
                            : 'bg-green-500/15 text-green-400 hover:bg-green-500/25'
                        }`}
                      >
                        Yes
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setActiveBet(
                            activeBet?.marketId === market.id && activeBet?.outcome === 'NO'
                              ? null
                              : { marketId: market.id, outcome: 'NO' }
                          );
                        }}
                        className={`px-2 py-1 text-[10px] font-bold rounded transition-colors ${
                          activeBet?.marketId === market.id && activeBet?.outcome === 'NO'
                            ? 'bg-red-500/40 text-red-300'
                            : 'bg-red-500/15 text-red-400 hover:bg-red-500/25'
                        }`}
                      >
                        No
                      </button>
                    </div>
                  )}

                  {/* Expand icon */}
                  <span className="text-white/30 shrink-0">
                    {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </span>
                </div>

                {/* Bet Panel */}
                <AnimatePresence>
                  {activeBet?.marketId === market.id && (
                    <BetPanel
                      marketId={market.id}
                      marketQuestion={market.question}
                      outcome={activeBet.outcome}
                      probability={
                        market.outcomes?.find(o => o.name.toUpperCase() === activeBet.outcome)?.probability || 0.5
                      }
                      onClose={() => setActiveBet(null)}
                      onSuccess={() => {
                        // Refresh event data after bet
                        if (slug) loadEvent(slug);
                      }}
                    />
                  )}
                </AnimatePresence>

                {/* Expanded detail */}
                {isExpanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="border-t border-white/5 px-4 py-3 bg-white/[0.02]"
                  >
                    <div className="pl-9 space-y-3">
                      {/* Full question */}
                      {isMulti && (
                        <p className="text-xs text-white/50">{market.question}</p>
                      )}

                      {/* Description (first 200 chars) */}
                      {market.description && (
                        <p className="text-xs text-white/40 leading-relaxed">
                          {market.description.length > 300
                            ? market.description.slice(0, 300) + '...'
                            : market.description}
                        </p>
                      )}

                      {/* Individual outcomes with bet buttons */}
                      <div className="flex flex-wrap gap-2">
                        {market.outcomes?.map((outcome) => (
                          <div
                            key={outcome.id}
                            className="flex items-center gap-2 px-3 py-1.5 bg-white/5 rounded-lg"
                          >
                            <span className="text-xs text-white/70">{outcome.name}</span>
                            <span className={`text-xs font-bold ${
                              outcome.probability > 0.5 ? 'text-neon-cyan' : 'text-white/50'
                            }`}>
                              {(outcome.probability * 100).toFixed(1)}%
                            </span>
                            {isAuthenticated && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveBet({ marketId: market.id, outcome: outcome.name.toUpperCase() });
                                }}
                                className={`ml-1 px-2 py-0.5 text-[10px] font-bold rounded transition-colors ${
                                  outcome.name.toUpperCase() === 'YES'
                                    ? 'bg-green-500/20 text-green-400 hover:bg-green-500/30'
                                    : 'bg-red-500/20 text-red-400 hover:bg-red-500/30'
                                }`}
                              >
                                Buy
                              </button>
                            )}
                          </div>
                        ))}
                        {!isAuthenticated && (
                          <button
                            onClick={(e) => { e.stopPropagation(); navigate('/auth/login'); }}
                            className="px-3 py-1.5 bg-neon-cyan/10 border border-neon-cyan/30 rounded-lg text-xs text-neon-cyan hover:bg-neon-cyan/20 transition-colors"
                          >
                            Login to bet
                          </button>
                        )}
                      </div>

                      {/* Stats */}
                      <div className="flex gap-4 text-xs text-white/40">
                        <span>Vol: {formatVolume(market.total_volume)}</span>
                        <span>24h: {formatVolume(market.volume_24h)}</span>
                        <span>Liq: {formatVolume(market.liquidity)}</span>
                        {market.close_time > 0 && (
                          <span>Closes: {formatDate(market.close_time)}</span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )}
              </GlassCard>
            </motion.div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="mt-8 text-center text-sm text-white/40">
        <p>
          Data from{' '}
          <a href={event.eventUrl} target="_blank" rel="noopener noreferrer" className="text-neon-cyan hover:underline">
            {event.source === 'polymarket' ? 'Polymarket' : 'Kalshi'}
          </a>
        </p>
      </div>
    </div>
  );
}

export default EventDetail;
