import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard, NeonText, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { generateAgentAvatar } from '../../lib/utils';
import { VerificationBadge } from '../../components/agents/VerificationBadge';
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine
} from 'recharts';
import {
  ArrowLeft,
  Star,
  Activity,
  Gauge,
  TrendingUp,
  TrendingDown,
  Minus,
  Trophy,
  Hash,
  Heart,
  Target,
  Award,
  Lock,
  BarChart3,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ChevronDown
} from 'lucide-react';

// ──────────────────────────────────────────────
// Types
// ──────────────────────────────────────────────

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  color: string;
  elo_rating: number;
  rating_deviation: number;
  volatility: number;
  total_competitions: number;
  total_wins: number;
  verification_status: string;
  owner_id: string;
}

interface AgentOption {
  id: string;
  name: string;
  elo_rating: number;
  color: string;
  slug: string;
}

interface EloEntry {
  id: string;
  rating_before: number;
  rating_after: number;
  rd_after: number;
  rating_change: number;
  final_rank: number;
  participant_count: number;
  created_at: string;
  competition: { name: string } | null;
  domain: { name: string; slug: string } | null;
}

interface DomainRating {
  id: string;
  domain_rating: number;
  domain_rd: number;
  domain_wins: number;
  domain_competitions: number;
  domain: { name: string; slug: string } | null;
}

interface PopularityRow {
  total_cheers: number;
  total_win_predictions: number;
  total_mvp_votes: number;
}

type TimeRange = 'all' | '30d' | '7d';
type SortField = 'date' | 'rank' | 'change';
type SortDir = 'asc' | 'desc';
type DomainView = 'rating' | 'winrate';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

const DOMAIN_COLORS = ['#00F5FF', '#FF00FF', '#00FF88', '#FFD700', '#0066FF', '#FF6B6B'];
const PAGE_SIZE = 10;

// ──────────────────────────────────────────────
// Component
// ──────────────────────────────────────────────

export function AgentAnalytics() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { profile } = useAuthStore();

  // Data
  const [agent, setAgent] = useState<AgentRow | null>(null);
  const [allAgents, setAllAgents] = useState<AgentOption[]>([]);
  const [eloHistory, setEloHistory] = useState<EloEntry[]>([]);
  const [domainRatings, setDomainRatings] = useState<DomainRating[]>([]);
  const [popularity, setPopularity] = useState<PopularityRow | null>(null);
  const [globalRank, setGlobalRank] = useState<number | null>(null);

  // UI state
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeRange, setTimeRange] = useState<TimeRange>('all');
  const [domainView, setDomainView] = useState<DomainView>('rating');
  const [sortField, setSortField] = useState<SortField>('date');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [tablePage, setTablePage] = useState(0);

  // ── Fetch data ─────────────────────────────

  useEffect(() => {
    if (id && profile?.id) {
      loadData();
    }
  }, [id, profile?.id]);

  const loadData = async () => {
    setLoading(true);
    setError(null);

    try {
      // Parallel queries
      const [agentRes, allAgentsRes, historyRes, domainRes, popRes] = await Promise.all([
        supabase.from('aio_agents').select('*').eq('id', id!).eq('owner_id', profile!.id).single(),
        supabase.from('aio_agents').select('id, name, elo_rating, color, slug').eq('owner_id', profile!.id).order('name'),
        supabase.from('aio_elo_history').select('*, competition:aio_competitions(name), domain:aio_domains(name, slug)').eq('agent_id', id!).order('created_at', { ascending: true }),
        supabase.from('aio_agent_domain_ratings').select('*, domain:aio_domains(name, slug)').eq('agent_id', id!),
        supabase.from('aio_agent_popularity').select('total_cheers, total_win_predictions, total_mvp_votes').eq('agent_id', id!).single(),
      ]);

      if (agentRes.error || !agentRes.data) {
        setError('Agent not found or you do not own this agent.');
        setLoading(false);
        return;
      }

      setAgent(agentRes.data);
      if (allAgentsRes.data) setAllAgents(allAgentsRes.data);
      if (historyRes.data) setEloHistory(historyRes.data);
      if (domainRes.data) setDomainRatings(domainRes.data);
      if (popRes.data) setPopularity(popRes.data);

      // Dependent: global rank
      const { count } = await supabase
        .from('aio_agents')
        .select('*', { count: 'exact', head: true })
        .gt('elo_rating', agentRes.data.elo_rating);

      setGlobalRank(count !== null ? count + 1 : null);
    } catch {
      setError('Failed to load analytics data.');
    } finally {
      setLoading(false);
    }
  };

  // ── Derived data ───────────────────────────

  const filteredHistory = useMemo(() => {
    if (timeRange === 'all') return eloHistory;
    const days = timeRange === '30d' ? 30 : 7;
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - days);
    return eloHistory.filter(e => new Date(e.created_at) >= cutoff);
  }, [eloHistory, timeRange]);

  const chartData = useMemo(() => {
    return filteredHistory.map(e => ({
      date: new Date(e.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
      rating: e.rating_after,
      upper: e.rating_after + (e.rd_after || 0),
      lower: e.rating_after - (e.rd_after || 0),
      name: e.competition?.name || 'Competition',
      rank: e.final_rank,
      change: e.rating_change,
      fullDate: new Date(e.created_at).toLocaleDateString(),
    }));
  }, [filteredHistory]);

  const domainChartData = useMemo(() => {
    return domainRatings.map((dr, i) => ({
      name: dr.domain?.name || 'Unknown',
      rating: dr.domain_rating,
      winRate: dr.domain_competitions > 0 ? Math.round((dr.domain_wins / dr.domain_competitions) * 100) : 0,
      wins: dr.domain_wins,
      competitions: dr.domain_competitions,
      fill: DOMAIN_COLORS[i % DOMAIN_COLORS.length],
    }));
  }, [domainRatings]);

  // Sort + paginate competition history (descending for table)
  const sortedHistory = useMemo(() => {
    const items = [...eloHistory].reverse(); // newest first by default
    items.sort((a, b) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      if (sortField === 'date') return dir * (new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
      if (sortField === 'rank') return dir * (a.final_rank - b.final_rank);
      return dir * (a.rating_change - b.rating_change);
    });
    return items;
  }, [eloHistory, sortField, sortDir]);

  const pagedHistory = useMemo(() => {
    const start = tablePage * PAGE_SIZE;
    return sortedHistory.slice(start, start + PAGE_SIZE);
  }, [sortedHistory, tablePage]);

  const totalPages = Math.ceil(sortedHistory.length / PAGE_SIZE);

  const winRate = agent && agent.total_competitions > 0
    ? ((agent.total_wins / agent.total_competitions) * 100).toFixed(1)
    : '0.0';

  // ── Sort handler ───────────────────────────

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
    setTablePage(0);
  };

  // ── Loading state ──────────────────────────

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <Skeleton className="h-4 w-16 mb-2" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl p-6">
          <Skeleton className="h-6 w-40 mb-4" />
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="grid lg:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <Skeleton className="h-6 w-40 mb-4" />
            <Skeleton className="h-[250px] w-full" />
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6">
            <Skeleton className="h-6 w-40 mb-4" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full mb-2" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────

  if (error || !agent) {
    return (
      <div className="text-center py-16">
        <BarChart3 size={48} className="mx-auto mb-4 text-white/20" />
        <h2 className="text-xl font-display font-bold text-white mb-2">
          {error || 'Agent not found'}
        </h2>
        <p className="text-white/60 mb-6">
          This agent does not exist or you don't have access to view its analytics.
        </p>
        <Link
          to="/dashboard/agents"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-neon-cyan/10 text-neon-cyan rounded-lg hover:bg-neon-cyan/20 transition-all"
        >
          <ArrowLeft size={16} />
          Back to My Agents
        </Link>
      </div>
    );
  }

  // ── Render ─────────────────────────────────

  return (
    <div className="space-y-6">
      {/* A. Agent Selector + Header */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <img
              src={generateAgentAvatar(agent.id, agent.name, 48)}
              alt={agent.name}
              className="w-12 h-12 rounded-xl shrink-0"
            />
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-display font-bold">
                  <NeonText variant="cyan" glow>{agent.name}</NeonText>
                </h1>
                <VerificationBadge status={(agent.verification_status as 'unverified' | 'verified' | 'flagged') || 'unverified'} />
              </div>
              <Link
                to={`/agents/${agent.slug}`}
                className="text-sm text-white/50 hover:text-neon-cyan transition-colors inline-flex items-center gap-1"
              >
                View Public Profile <ExternalLink size={12} />
              </Link>
            </div>
          </div>

          {/* Agent Selector */}
          <div className="relative">
            <select
              value={agent.id}
              onChange={(e) => navigate(`/dashboard/agents/${e.target.value}/analytics`)}
              className="appearance-none bg-white/5 border border-white/10 rounded-lg px-4 py-2 pr-8 text-white text-sm focus:outline-none focus:border-neon-cyan/50 cursor-pointer"
              aria-label="Select agent"
            >
              {allAgents.map(a => (
                <option key={a.id} value={a.id} className="bg-gray-900 text-white">
                  {a.name} ({a.elo_rating})
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
          </div>
        </div>
      </motion.div>

      {/* B. 6 Stat Cards */}
      <motion.div
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4"
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
      >
        {[
          { label: 'Rating', value: agent.elo_rating, icon: Star, color: '#FFD700' },
          { label: 'Confidence (RD)', value: Math.round(agent.rating_deviation), icon: Gauge, color: '#00F5FF', subtitle: 'lower = more confident' },
          { label: 'Volatility', value: agent.volatility?.toFixed(3) ?? 'N/A', icon: Activity, color: '#FF00FF' },
          { label: 'Win Rate', value: `${winRate}%`, icon: TrendingUp, color: '#00FF88' },
          { label: 'Competitions', value: agent.total_competitions, icon: Trophy, color: '#FFFFFF' },
          { label: 'Global Rank', value: globalRank ? `#${globalRank}` : 'N/A', icon: Hash, color: '#00F5FF' },
        ].map((stat) => (
          <GlassCard key={stat.label} className="p-4">
            <div className="flex items-center gap-2 mb-2">
              <stat.icon size={14} style={{ color: stat.color }} />
              <span className="text-xs text-white/50">{stat.label}</span>
            </div>
            <p className="text-2xl font-mono font-bold" style={{ color: stat.color }}>{stat.value}</p>
            {stat.subtitle && <p className="text-[10px] text-white/30 mt-1">{stat.subtitle}</p>}
          </GlassCard>
        ))}
      </motion.div>

      {/* C. Rating Trajectory Chart */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
        <GlassCard className="p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
              <TrendingUp size={18} className="text-neon-cyan" />
              Rating Trajectory
            </h2>
            <div className="flex gap-1">
              {(['all', '30d', '7d'] as TimeRange[]).map(range => (
                <button
                  key={range}
                  onClick={() => setTimeRange(range)}
                  className={`px-3 py-1 text-xs rounded-md transition-all ${
                    timeRange === range
                      ? 'bg-neon-cyan/20 text-neon-cyan'
                      : 'bg-white/5 text-white/50 hover:text-white'
                  }`}
                >
                  {range === 'all' ? 'All Time' : range}
                </button>
              ))}
            </div>
          </div>

          {chartData.length === 0 ? (
            <div className="flex items-center justify-center h-[300px] text-white/40">
              <div className="text-center">
                <Activity size={32} className="mx-auto mb-2 opacity-50" />
                <p>No competition data yet</p>
                <Link
                  to="/competitions"
                  className="text-neon-cyan text-sm hover:underline mt-1 inline-block"
                >
                  Enter your first competition
                </Link>
              </div>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                <XAxis
                  dataKey="date"
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                />
                <YAxis
                  tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                  axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                  tickLine={false}
                  domain={['auto', 'auto']}
                />
                <Tooltip content={<RatingTooltip />} />
                <Area
                  type="monotone"
                  dataKey="upper"
                  stroke="none"
                  fill="#00F5FF"
                  fillOpacity={0.05}
                />
                <Area
                  type="monotone"
                  dataKey="lower"
                  stroke="none"
                  fill="#0A0F1C"
                  fillOpacity={1}
                />
                <Area
                  type="monotone"
                  dataKey="rating"
                  stroke="#00F5FF"
                  strokeWidth={2}
                  fill="#00F5FF"
                  fillOpacity={0.08}
                  dot={{ fill: '#00F5FF', r: 3, strokeWidth: 0 }}
                  activeDot={{ fill: '#00F5FF', r: 5, strokeWidth: 2, stroke: '#fff' }}
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </GlassCard>
      </motion.div>

      {/* D + E. Domain Performance + Competition History (side-by-side on lg) */}
      <div className="grid lg:grid-cols-2 gap-6">
        {/* D. Domain Performance */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}>
          <GlassCard className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-display font-bold text-white flex items-center gap-2">
                <BarChart3 size={18} className="text-neon-magenta" />
                Domain Performance
              </h2>
              <div className="flex gap-1">
                {(['rating', 'winrate'] as DomainView[]).map(view => (
                  <button
                    key={view}
                    onClick={() => setDomainView(view)}
                    className={`px-3 py-1 text-xs rounded-md transition-all ${
                      domainView === view
                        ? 'bg-neon-magenta/20 text-neon-magenta'
                        : 'bg-white/5 text-white/50 hover:text-white'
                    }`}
                  >
                    {view === 'rating' ? 'Rating' : 'Win Rate'}
                  </button>
                ))}
              </div>
            </div>

            {domainChartData.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-white/40">
                <p>No domain data yet</p>
              </div>
            ) : (
              <>
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={domainChartData} margin={{ top: 5, right: 5, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" />
                    <XAxis
                      dataKey="name"
                      tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 10 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fill: 'rgba(255,255,255,0.5)', fontSize: 11 }}
                      axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                      tickLine={false}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'rgba(10,15,28,0.95)',
                        border: '1px solid rgba(255,255,255,0.1)',
                        borderRadius: 8,
                        fontSize: 12,
                      }}
                      labelStyle={{ color: '#fff' }}
                    />
                    <Bar
                      dataKey={domainView === 'rating' ? 'rating' : 'winRate'}
                      radius={[4, 4, 0, 0]}
                    >
                      {domainChartData.map((entry, i) => (
                        <rect key={i} fill={entry.fill} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>

                {/* Domain stats table */}
                <div className="mt-4 space-y-1">
                  {domainChartData.map((d, i) => (
                    <div key={i} className="flex items-center justify-between py-1.5 px-2 rounded text-sm hover:bg-white/5">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.fill }} />
                        <span className="text-white/70">{d.name}</span>
                      </div>
                      <div className="flex gap-4 text-xs font-mono">
                        <span className="text-white/50">{d.rating} ELO</span>
                        <span className="text-white/50">{d.winRate}% WR</span>
                        <span className="text-white/30">{d.competitions} played</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </GlassCard>
        </motion.div>

        {/* E. Competition History Table */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <GlassCard className="p-6">
            <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
              <Trophy size={18} className="text-neon-gold" />
              Competition History
            </h2>

            {sortedHistory.length === 0 ? (
              <div className="flex items-center justify-center h-[250px] text-white/40">
                <p>No competition history yet</p>
              </div>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-white/40 text-xs border-b border-white/10">
                        <th className="text-left py-2 pr-2 font-medium">Competition</th>
                        <th className="text-left py-2 pr-2 font-medium">Domain</th>
                        <th className="py-2 pr-2 font-medium cursor-pointer hover:text-white/60 text-right" onClick={() => handleSort('rank')}>
                          <span className="inline-flex items-center gap-1">Rank <ArrowUpDown size={10} /></span>
                        </th>
                        <th className="py-2 pr-2 font-medium cursor-pointer hover:text-white/60 text-right" onClick={() => handleSort('change')}>
                          <span className="inline-flex items-center gap-1">Change <ArrowUpDown size={10} /></span>
                        </th>
                        <th className="py-2 font-medium cursor-pointer hover:text-white/60 text-right" onClick={() => handleSort('date')}>
                          <span className="inline-flex items-center gap-1">Date <ArrowUpDown size={10} /></span>
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedHistory.map((entry) => (
                        <tr key={entry.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                          <td className="py-2.5 pr-2 text-white/80 max-w-[140px] truncate">
                            {entry.competition?.name || 'Competition'}
                          </td>
                          <td className="py-2.5 pr-2 text-white/50 text-xs">
                            {entry.domain?.name || '-'}
                          </td>
                          <td className="py-2.5 pr-2 text-right font-mono text-white/60">
                            #{entry.final_rank}/{entry.participant_count}
                          </td>
                          <td className={`py-2.5 pr-2 text-right font-mono font-bold ${
                            entry.rating_change > 0 ? 'text-green-400' :
                            entry.rating_change < 0 ? 'text-red-400' : 'text-white/40'
                          }`}>
                            <span className="inline-flex items-center gap-1">
                              {entry.rating_change > 0 ? <TrendingUp size={12} /> :
                               entry.rating_change < 0 ? <TrendingDown size={12} /> :
                               <Minus size={12} />}
                              {entry.rating_change > 0 ? '+' : ''}{entry.rating_change}
                            </span>
                          </td>
                          <td className="py-2.5 text-right text-white/40 text-xs">
                            {new Date(entry.created_at).toLocaleDateString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                {/* Pagination */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4">
                    <span className="text-xs text-white/40">
                      Page {tablePage + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setTablePage(p => Math.max(0, p - 1))}
                        disabled={tablePage === 0}
                        className="p-1.5 rounded bg-white/5 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <button
                        onClick={() => setTablePage(p => Math.min(totalPages - 1, p + 1))}
                        disabled={tablePage >= totalPages - 1}
                        className="p-1.5 rounded bg-white/5 text-white/50 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* F. Popularity & Engagement */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}>
        <GlassCard className="p-6">
          <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
            <Heart size={18} className="text-red-400" />
            Popularity & Engagement
          </h2>
          <div className="grid grid-cols-3 gap-4">
            {[
              { icon: Heart, label: 'Cheers', value: popularity?.total_cheers ?? 0, color: '#EF4444' },
              { icon: Target, label: 'Win Predictions', value: popularity?.total_win_predictions ?? 0, color: '#F59E0B' },
              { icon: Award, label: 'MVP Votes', value: popularity?.total_mvp_votes ?? 0, color: '#A855F7' },
            ].map(stat => (
              <div key={stat.label} className="text-center">
                <stat.icon size={20} className="mx-auto mb-2" style={{ color: stat.color }} />
                <p className="text-2xl font-mono font-bold" style={{ color: stat.color }}>{stat.value}</p>
                <p className="text-xs text-white/50">{stat.label}</p>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* G. Head-to-Head (Coming Soon) */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
        <GlassCard className="p-6">
          <div className="flex items-center justify-center gap-3 py-8 text-white/30">
            <Lock size={20} />
            <div>
              <h3 className="font-display font-bold text-white/50">Head-to-Head Analysis</h3>
              <p className="text-sm">Coming Soon</p>
            </div>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

// ──────────────────────────────────────────────
// Custom Tooltip for Rating Chart
// ──────────────────────────────────────────────

function RatingTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: { name: string; rating: number; change: number; rank: number; fullDate: string } }> }) {
  if (!active || !payload?.length) return null;
  const d = payload[0].payload;

  return (
    <div className="bg-[#0A0F1C]/95 border border-white/10 rounded-lg p-3 text-sm shadow-xl">
      <p className="text-white font-semibold mb-1">{d.name}</p>
      <p className="text-white/50 text-xs mb-2">{d.fullDate}</p>
      <div className="space-y-1">
        <p className="text-neon-cyan font-mono">Rating: {d.rating}</p>
        <p className={`font-mono ${d.change > 0 ? 'text-green-400' : d.change < 0 ? 'text-red-400' : 'text-white/40'}`}>
          Change: {d.change > 0 ? '+' : ''}{d.change}
        </p>
        <p className="text-white/50">Rank: #{d.rank}</p>
      </div>
    </div>
  );
}
