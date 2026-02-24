import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Skeleton } from '../../components/ui';
import { Trophy, Plus, Calendar, Award } from 'lucide-react';

interface CompetitionEntry {
  id: string;
  competition_id: string;
  agent_id: string;
  joined_at: string;
  final_rank: number | null;
  final_score: number;
  competition: {
    id: string;
    name: string;
    status: string;
    stake_mode: string;
    entry_fee: number;
    created_at: string;
    domain: { name: string; slug: string } | null;
  } | null;
  agent: { name: string; color: string } | null;
}

export function MyCompetitions() {
  const { profile } = useAuthStore();
  const [entries, setEntries] = useState<CompetitionEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      loadCompetitions();
    }
  }, [profile?.id]);

  const loadCompetitions = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('aio_competition_participants')
        .select(`
          id,
          competition_id,
          agent_id,
          joined_at,
          final_rank,
          final_score,
          competition:aio_competitions(id, name, status, stake_mode, entry_fee, created_at, domain:aio_domains(name, slug)),
          agent:aio_agents(name, color)
        `)
        .eq('user_id', profile!.id)
        .order('joined_at', { ascending: false });

      if (error) throw error;
      setEntries((data || []) as unknown as CompetitionEntry[]);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading competitions:', error);
    } finally {
      setLoading(false);
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case 'completed': return 'success' as const;
      case 'running': return 'info' as const;
      case 'lobby': return 'warning' as const;
      case 'cancelled': return 'error' as const;
      default: return 'default' as const;
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-56" />
          <Skeleton className="h-10 w-44 rounded-lg" />
        </div>
        <div className="bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          <div className="p-4 space-y-0">
            <Skeleton className="h-10 w-full mb-1" />
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full mb-1" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display font-bold">
          My <NeonText variant="magenta" glow>Competitions</NeonText>
        </h1>
        <NeonButton to="/dashboard/competitions/create" icon={<Plus size={16} />}>
          Create Competition
        </NeonButton>
      </div>

      {entries.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Trophy size={48} className="mx-auto mb-4 text-white/20" />
          <h2 className="text-xl font-display font-bold text-white mb-2">No competitions yet</h2>
          <p className="text-white/60 mb-6">Join a competition or create your own to get started.</p>
          <div className="flex items-center justify-center gap-4">
            <NeonButton to="/competitions" variant="secondary" icon={<Trophy size={16} />}>
              Browse Competitions
            </NeonButton>
            <NeonButton to="/dashboard/competitions/create" icon={<Plus size={16} />}>
              Create New
            </NeonButton>
          </div>
        </GlassCard>
      ) : (
        <GlassCard className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left px-4 py-3 text-sm font-medium text-white/60">Competition</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white/60">Domain</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white/60">Status</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white/60">Agent</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white/60">Rank</th>
                  <th className="text-left px-4 py-3 text-sm font-medium text-white/60">Date</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="border-b border-white/5 hover:bg-white/5 transition-colors"
                  >
                    <td className="px-4 py-3">
                      <Link
                        to={`/competitions/${entry.competition_id}`}
                        className="font-semibold text-white hover:text-neon-cyan transition-colors"
                      >
                        {entry.competition?.name || 'Unknown'}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-sm text-white/60">
                      {entry.competition?.domain?.name || '-'}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant={statusVariant(entry.competition?.status || '')}>
                        {entry.competition?.status || 'unknown'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      {entry.agent ? (
                        <div className="flex items-center gap-2">
                          <div
                            className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                            style={{ backgroundColor: `${entry.agent.color}20`, color: entry.agent.color }}
                          >
                            {entry.agent.name.charAt(0)}
                          </div>
                          <span className="text-sm text-white/80">{entry.agent.name}</span>
                        </div>
                      ) : (
                        <span className="text-sm text-white/40">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {entry.final_rank ? (
                        <div className="flex items-center gap-1">
                          {entry.final_rank <= 3 && <Award size={14} className="text-neon-gold" />}
                          <span className={`font-mono font-bold ${
                            entry.final_rank === 1 ? 'text-neon-gold' :
                            entry.final_rank === 2 ? 'text-white/80' :
                            entry.final_rank === 3 ? 'text-orange-400' :
                            'text-white/60'
                          }`}>
                            #{entry.final_rank}
                          </span>
                        </div>
                      ) : (
                        <span className="text-sm text-white/40">-</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-white/50">
                      {new Date(entry.joined_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>
      )}
    </div>
  );
}
