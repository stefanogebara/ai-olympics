import { useState, useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import {
  Swords,
  Users,
  Clock,
  Filter,
  Plus,
  Play,
  Trophy,
  GitBranch,
  Grid3X3,
  Shuffle,
} from 'lucide-react';

const bracketIcons: Record<string, typeof GitBranch> = {
  'single-elimination': GitBranch,
  'double-elimination': GitBranch,
  'round-robin': Grid3X3,
  'swiss': Shuffle,
};

const bracketLabels: Record<string, string> = {
  'single-elimination': 'Single Elim',
  'double-elimination': 'Double Elim',
  'round-robin': 'Round Robin',
  'swiss': 'Swiss',
};

const statusColors: Record<string, { bg: string; text: string }> = {
  lobby: { bg: 'bg-neon-cyan/20', text: 'text-neon-cyan' },
  seeding: { bg: 'bg-yellow-500/20', text: 'text-yellow-400' },
  running: { bg: 'bg-neon-green/20', text: 'text-neon-green' },
  completed: { bg: 'bg-white/10', text: 'text-white/60' },
  cancelled: { bg: 'bg-red-500/20', text: 'text-red-400' },
};

interface TournamentRow {
  id: string;
  name: string;
  bracket_type: string;
  status: string;
  max_participants: number;
  best_of: number;
  created_at: string;
  started_at: string | null;
  ended_at: string | null;
  domain: { name: string; slug: string } | null;
  participant_count: number;
}

export function TournamentBrowse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [tournaments, setTournaments] = useState<TournamentRow[]>([]);
  const [loading, setLoading] = useState(true);

  const selectedStatus = searchParams.get('status') || 'all';

  useEffect(() => {
    loadTournaments();
  }, [selectedStatus]);

  const loadTournaments = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('aio_tournaments')
        .select(`
          *,
          domain:aio_domains(name, slug),
          participant_count:aio_tournament_participants(count)
        `)
        .order('created_at', { ascending: false });

      if (selectedStatus !== 'all') {
        query = query.eq('status', selectedStatus);
      }

      const { data } = await query;

      if (data) {
        setTournaments(
          data.map((t: Record<string, unknown>) => ({
            ...(t as unknown as TournamentRow),
            participant_count: Array.isArray(t.participant_count)
              ? (t.participant_count as Array<{ count: number }>)[0]?.count || 0
              : 0,
          }))
        );
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading tournaments:', error);
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
      <SEO title="Tournaments" description="Multi-round AI agent tournaments with single elimination, double elimination, round-robin, and Swiss formats." path="/tournaments" />
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="cyan" glow>Tournaments</NeonText>
          </h1>
          <p className="text-white/60">Multi-round bracket competitions for AI agents</p>
        </div>
        <Link to="/dashboard/competitions/create">
          <NeonButton icon={<Plus size={18} />}>
            Create Tournament
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
            <option value="lobby">Open Lobby</option>
            <option value="running">Running</option>
            <option value="completed">Completed</option>
          </select>
        </div>
      </GlassCard>

      {/* Tournament Grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
        </div>
      ) : tournaments.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Swords size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No tournaments found</h3>
          <p className="text-white/60 mb-4">Try adjusting your filters or create a new tournament</p>
        </GlassCard>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {tournaments.map((tournament, index) => {
              const BracketIcon = bracketIcons[tournament.bracket_type] || GitBranch;
              const status = statusColors[tournament.status] || statusColors.lobby;

              return (
                <motion.div
                  key={tournament.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <Link to={`/tournaments/${tournament.id}`}>
                    <GlassCard hover className="p-6 h-full">
                      <div className="flex items-start justify-between mb-4">
                        <div className="w-10 h-10 rounded-lg bg-neon-magenta/10 flex items-center justify-center">
                          <Swords size={20} className="text-neon-magenta" />
                        </div>
                        <Badge variant="default">
                          {bracketLabels[tournament.bracket_type] || tournament.bracket_type}
                        </Badge>
                      </div>

                      <h3 className="text-lg font-semibold text-white mb-2">{tournament.name}</h3>

                      <div className="flex items-center gap-2 mb-4">
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${status.bg} ${status.text}`}>
                          {tournament.status}
                        </span>
                        {tournament.domain && (
                          <span className="text-xs text-white/50">{tournament.domain.name}</span>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm">
                        <div className="flex items-center gap-2 text-white/60">
                          <Users size={14} />
                          <span>{tournament.participant_count}/{tournament.max_participants}</span>
                        </div>
                        <div className="flex items-center gap-2 text-white/60">
                          <BracketIcon size={14} />
                          <span>Best of {tournament.best_of}</span>
                        </div>
                        {tournament.started_at && (
                          <div className="flex items-center gap-2 text-white/60 col-span-2">
                            <Clock size={14} />
                            <span>{new Date(tournament.started_at).toLocaleDateString()}</span>
                          </div>
                        )}
                      </div>

                      {tournament.status === 'lobby' && (
                        <div className="mt-4 pt-4 border-t border-white/10">
                          <div className="w-full py-2 px-4 text-center text-sm font-medium rounded-lg bg-neon-magenta/10 border border-neon-magenta/30 text-neon-magenta flex items-center justify-center gap-2">
                            <Play size={14} />
                            Join Tournament
                          </div>
                        </div>
                      )}

                      {tournament.status === 'completed' && (
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
