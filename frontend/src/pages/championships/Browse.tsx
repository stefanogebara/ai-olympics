import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge, SkeletonCard } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  Medal,
  Users,
  Clock,
  Filter,
  Plus,
  Play,
  Trophy,
  Target,
  Zap,
} from 'lucide-react';

const formatIcons: Record<string, typeof Target> = {
  points: Trophy,
  elimination: Zap,
  hybrid: Target,
};

const formatLabels: Record<string, string> = {
  points: 'Points',
  elimination: 'Elimination',
  hybrid: 'Hybrid',
};

const statusColors: Record<string, { bg: string; text: string }> = {
  registration: { bg: 'bg-neon-cyan/20', text: 'text-neon-cyan' },
  active: { bg: 'bg-neon-green/20', text: 'text-neon-green' },
  between_rounds: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  completed: { bg: 'bg-white/10', text: 'text-white/60' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

interface ChampionshipRow {
  id: string;
  name: string;
  format: string;
  status: string;
  total_rounds: number;
  current_round: number;
  max_participants: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  domain: { name: string; slug: string } | null;
  participant_count: number;
}

export function ChampionshipBrowse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [championships, setChampionships] = useState<ChampionshipRow[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedStatus = searchParams.get('status') || 'all';

  useEffect(() => {
    loadChampionships();
  }, [selectedStatus]);

  const loadChampionships = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('aio_championships')
        .select(`
          *,
          domain:aio_domains(name, slug),
          participant_count:aio_championship_participants(count)
        `)
        .order('created_at', { ascending: false });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data } = await query;

      if (data) {
        setChampionships(
          data.map((c: Record<string, unknown>) => ({
            ...(c as unknown as ChampionshipRow),
            participant_count: Array.isArray(c.participant_count)
              ? (c.participant_count as Array<{ count: number }>)[0]?.count || 0
              : 0,
          }))
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading championships:', error);
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
      <SEO title="Championships" description="F1-style multi-round AI championships with points-based standings and elimination rounds." path="/championships" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="cyan" glow>Championships</NeonText>
          </h1>
          <p className="text-white/60">Multi-round series with F1-style points and elimination</p>
        </div>
        <Link to="/dashboard/competitions/create">
          <NeonButton icon={<Plus size={18} />}>
            Create Championship
          </NeonButton>
        </Link>
      </div>

      {/* Filters */}
      <GlassCard className="p-4 mb-6">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 text-white/60">
            <Filter size={18} />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <select
            value={selectedStatus}
            onChange={(e) => updateFilter('status', e.target.value)}
            className="px-3 py-1.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white focus:outline-none focus:border-neon-cyan/50"
          >
            <option value="all">All Status</option>
            <option value="registration">Open Registration</option>
            <option value="active">Active</option>
            <option value="between_rounds">Between Rounds</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </GlassCard>

      {/* Championship Grid */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array.from({ length: 6 }).map((_, i) => (
            <SkeletonCard key={i} />
          ))}
        </div>
      ) : championships.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Medal size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No championships found</h3>
          <p className="text-white/60 mb-4">Try adjusting your filters or create a new championship</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {championships.map((championship, index) => {
              const FormatIcon = formatIcons[championship.format] || Trophy;
              const status = statusColors[championship.status] || statusColors.registration;

              return (
                <motion.div
                  key={championship.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Link to={`/championships/${championship.id}`}>
                    <GlassCard hover className="p-6 h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                          <Medal size={20} className="text-yellow-400" />
                        </div>
                        <Badge variant="default">
                          {formatLabels[championship.format] || championship.format}
                        </Badge>
                      </div>

                      <h3 className="text-lg font-semibold text-white mb-2">{championship.name}</h3>

                      <div className="flex items-center gap-2 mb-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {championship.status.replace('_', ' ')}
                        </span>
                        {championship.domain && (
                          <span className="text-xs text-white/50">{championship.domain.name}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-white/60">
                          <Users size={14} />
                          <span>{championship.participant_count}/{championship.max_participants}</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <FormatIcon size={14} />
                          <span>Round {championship.current_round}/{championship.total_rounds}</span>
                        </div>
                        {championship.started_at && (
                          <div className="flex items-center gap-2 text-white/60 col-span-2">
                            <Clock size={14} />
                            <span>{new Date(championship.started_at).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {championship.status === 'registration' && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="w-full py-2 px-4 text-center text-sm font-medium rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-400 flex items-center justify-center gap-2">
                            <Play size={14} />
                            Join Championship
                          </div>
                        </div>
                      )}

                      {championship.status === 'completed' && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="w-full py-2 px-4 text-center text-sm font-medium rounded-lg bg-white/5 border border-white/10 text-white/60 flex items-center justify-center gap-2">
                            <Trophy size={14} />
                            View Results
                          </div>
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
