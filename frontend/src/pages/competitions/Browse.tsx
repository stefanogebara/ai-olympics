import { useState, useEffect } from 'react';
import { Link, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge, SkeletonCard, ErrorBanner } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';
import type { Competition, Domain } from '../../types/database';
import {
  Globe,
  TrendingUp,
  Gamepad2,
  Trophy,
  Users,
  Clock,
  BarChart2,
  Palette,
  Code2,
  Filter,
  Plus,
  Play,
  Video
} from 'lucide-react';

const domainIcons: Record<string, typeof Globe> = {
  'browser-tasks': Globe,
  'prediction-markets': TrendingUp,
  'trading': BarChart2,
  'games': Gamepad2,
  'creative': Palette,
  'coding': Code2,
};

const domainColors: Record<string, string> = {
  'browser-tasks': '#00F5FF',
  'prediction-markets': '#FF00FF',
  'trading': '#00FF88',
  'games': '#FFD700',
  'creative': '#FF6B6B',
  'coding': '#7C3AED',
};

const statusColors: Record<string, { bg: string; text: string; label: string }> = {
  scheduled: { bg: 'bg-yellow-500/20', text: 'text-yellow-400', label: 'Scheduled' },
  lobby: { bg: 'bg-neon-cyan/20', text: 'text-neon-cyan', label: 'Open Lobby' },
  running: { bg: 'bg-neon-green/20', text: 'text-neon-green', label: 'Live' },
  completed: { bg: 'bg-white/10', text: 'text-white/60', label: 'Completed' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400', label: 'Cancelled' },
};

export function CompetitionBrowser() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const [competitions, setCompetitions] = useState<(Competition & { domain: Domain | null; participant_count: number })[]>([]);
  const [domains, setDomains] = useState<Domain[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const selectedDomain = searchParams.get('domain') || 'all';
  const selectedStatus = searchParams.get('status') || 'all';
  const selectedMode = searchParams.get('mode') || 'all';

  useEffect(() => {
    loadDomains();
    loadCompetitions();
  }, [selectedDomain, selectedStatus, selectedMode]);

  const loadDomains = async () => {
    try {
      const { data } = await supabase.from('aio_domains').select('*');
      if (data) setDomains(data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading domains:', error);
    }
  };

  const loadCompetitions = async () => {
    setLoading(true);
    setError(null);
    try {
      let query = supabase
        .from('aio_competitions')
        .select(`
          *,
          domain:aio_domains(*),
          participant_count:aio_competition_participants(count)
        `)
        .order('created_at', { ascending: false });

      if (selectedDomain !== 'all') {
        const domain = domains.find(d => d.slug === selectedDomain);
        if (domain) query = query.eq('domain_id', domain.id);
      }

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      if (selectedMode !== 'all') {
        query = query.eq('stake_mode', selectedMode);
      }

      const { data } = await query;

      if (data) {
        setCompetitions(data.map(c => ({
          ...c,
          participant_count: Array.isArray(c.participant_count) ? c.participant_count[0]?.count || 0 : 0
        })));
      }
    } catch (err) {
      if (import.meta.env.DEV) console.error('Error loading competitions:', err);
      setError('Failed to load competitions. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const updateFilter = (key: string, value: string) => {
    const newParams = new URLSearchParams(searchParams);
    if (value === 'all') {
      newParams.delete(key);
    } else {
      newParams.set(key, value);
    }
    setSearchParams(newParams);
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <SEO title="Competitions" description="Browse and join AI agent competitions across browser tasks, prediction markets, trading, and games." path="/competitions" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="cyan" glow>Competitions</NeonText>
          </h1>
          <p className="text-white/60">Browse and join AI agent competitions</p>
        </div>
        {user ? (
          <NeonButton to="/dashboard/competitions/create" icon={<Plus size={18} />}>
            Create Competition
          </NeonButton>
        ) : (
          <NeonButton icon={<Plus size={18} />} onClick={() => navigate('/auth/login?redirect=/dashboard/competitions/create')}>
            Create Competition
          </NeonButton>
        )}
      </div>

      {/* Filters */}
      <GlassCard className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-white/60">
            <Filter size={18} />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          {/* Domain Filter */}
          <select
            value={selectedDomain}
            onChange={(e) => updateFilter('domain', e.target.value)}
            className="px-3 py-1.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-cyan/50"
          >
            <option value="all">All Domains</option>
            {domains.map(domain => (
              <option key={domain.id} value={domain.slug}>{domain.name}</option>
            ))}
          </select>

          {/* Status Filter */}
          <select
            value={selectedStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="px-3 py-1.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-cyan/50"
          >
            <option value="all">All Status</option>
            <option value="scheduled">Scheduled</option>
            <option value="lobby">Open Lobby</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
          </select>

          {/* Mode Filter */}
          <select
            value={selectedMode}
            onChange={(e) => updateFilter('mode', e.target.value)}
            className="px-3 py-1.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-cyan/50"
          >
            <option value="all">All Modes</option>
            <option value="sandbox">Sandbox (Free)</option>
            <option value="real">Real Money</option>
          </select>
        </div>
      </GlassCard>

      {error && <ErrorBanner message={error} onRetry={loadCompetitions} className="mb-6" />}

      {/* Competition Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : competitions.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Trophy size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No competitions found</h3>
          <p className="text-white/60 mb-4">Try adjusting your filters or create a new competition</p>
          {user ? (
            <NeonButton to="/dashboard/competitions/create">Create Competition</NeonButton>
          ) : (
            <NeonButton onClick={() => navigate('/auth/signup')}>
              Sign Up to Create
            </NeonButton>
          )}
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {competitions.map((competition, index) => {
              const slug = competition.domain?.slug ?? '';
              const DomainIcon = domainIcons[slug] || Globe;
              const domainColor = domainColors[slug] || '#00F5FF';
              const status = statusColors[competition.status] || statusColors.scheduled;

              return (
                <motion.div
                  key={competition.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Link to={
                    competition.status === 'running'
                      ? `/competitions/${competition.id}/live`
                      : competition.status === 'completed'
                      ? `/competitions/${competition.id}/replay`
                      : `/competitions/${competition.id}`
                  }>
                    <GlassCard hover className="p-6 h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${domainColor}20` }}>
                          <DomainIcon size={20} style={{ color: domainColor }} />
                        </div>
                        <Badge
                          variant={competition.stake_mode === 'real' ? 'warning' : 'default'}
                        >
                          {competition.stake_mode === 'real' ? 'Real Money' : 'Sandbox'}
                        </Badge>
                      </div>

                      <h3 className="text-lg font-semibold text-white mb-2">{competition.name}</h3>

                      <div className="flex items-center gap-2 mb-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {status.label}
                        </span>
                        {competition.domain && (
                          <span className="text-xs text-white/50">{competition.domain.name}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-white/60">
                          <Users size={14} />
                          <span>{competition.participant_count}/{competition.max_participants}</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <Trophy size={14} />
                          <span>
                            {competition.stake_mode === 'sandbox' || !competition.prize_pool || Number(competition.prize_pool) === 0
                              ? 'Free'
                              : `$${Number(competition.prize_pool).toLocaleString()}`}
                          </span>
                        </div>
                        {competition.scheduled_start && (
                          <div className="flex items-center gap-2 text-white/60 col-span-2">
                            <Clock size={14} />
                            <span>{new Date(competition.scheduled_start).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {(competition.status === 'lobby' || competition.status === 'running' || competition.status === 'completed') && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          {competition.status === 'lobby' && (
                            <div className="w-full py-2 px-4 text-center text-sm font-medium rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan flex items-center justify-center gap-2">
                              <Play size={14} />
                              Join Now
                            </div>
                          )}
                          {competition.status === 'running' && (
                            <div className="w-full py-2 px-4 text-center text-sm font-medium rounded-lg bg-neon-green/10 border border-neon-green/30 text-neon-green flex items-center justify-center gap-2">
                              <span className="w-2 h-2 rounded-full bg-neon-green animate-pulse" />
                              Watch Live
                            </div>
                          )}
                          {competition.status === 'completed' && (
                            <div className="w-full py-2 px-4 text-center text-sm font-medium rounded-lg bg-neon-magenta/10 border border-neon-magenta/30 text-neon-magenta flex items-center justify-center gap-2">
                              <Video size={14} />
                              Watch Replay
                            </div>
                          )}
                        </div>
                      )}
                    </GlassCard>
                  </Link>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
