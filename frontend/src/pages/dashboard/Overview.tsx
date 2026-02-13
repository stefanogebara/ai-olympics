import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import type { Agent, Competition } from '../../types/database';
import { Skeleton } from '../../components/ui';
import {
  Bot,
  Trophy,
  Plus,
  TrendingUp,
  Star,
  ChevronRight,
  Calendar,
  Activity
} from 'lucide-react';

export function DashboardOverview() {
  const { profile } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [recentCompetitions, setRecentCompetitions] = useState<Competition[]>([]);
  const [stats, setStats] = useState({
    totalAgents: 0,
    totalCompetitions: 0,
    totalWins: 0,
    avgElo: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.id) {
      loadDashboardData();
    }
  }, [profile?.id]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Load user's agents
      const { data: agentsData } = await supabase
        .from('aio_agents')
        .select('*')
        .eq('owner_id', profile!.id)
        .order('elo_rating', { ascending: false })
        .limit(5);

      if (agentsData) {
        setAgents(agentsData);
        setStats(prev => ({
          ...prev,
          totalAgents: agentsData.length,
          totalWins: agentsData.reduce((sum, a) => sum + a.total_wins, 0),
          totalCompetitions: agentsData.reduce((sum, a) => sum + a.total_competitions, 0),
          avgElo: agentsData.length > 0
            ? Math.round(agentsData.reduce((sum, a) => sum + a.elo_rating, 0) / agentsData.length)
            : 1500,
        }));
      }

      // Load recent competitions
      const { data: competitionsData } = await supabase
        .from('aio_competition_participants')
        .select(`
          competition:aio_competitions(*)
        `)
        .eq('user_id', profile!.id)
        .order('joined_at', { ascending: false })
        .limit(5);

      if (competitionsData) {
        const competitions = competitionsData
          .map((cp) => {
            // Supabase may return joined relations as arrays or objects
            const comp = Array.isArray(cp.competition) ? cp.competition[0] : cp.competition;
            return comp as Competition | null;
          })
          .filter((c): c is Competition => c !== null);
        setRecentCompetitions(competitions);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-72 mb-2" />
          <Skeleton className="h-5 w-96" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-4">
              <div className="flex items-center gap-3">
                <Skeleton className="w-10 h-10 rounded-lg" />
                <div className="flex-1">
                  <Skeleton className="h-4 w-16 mb-1" />
                  <Skeleton className="h-7 w-12" />
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
            <Skeleton className="h-6 w-32 mb-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-6 space-y-3">
            <Skeleton className="h-6 w-32 mb-4" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold mb-1">
            Welcome back, <NeonText variant="cyan" glow>{profile?.display_name || profile?.username}</NeonText>
          </h1>
          <p className="text-white/60">Here's an overview of your AI Olympics activity</p>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Bot, label: 'Agents', value: stats.totalAgents, color: '#00F5FF' },
          { icon: Trophy, label: 'Competitions', value: stats.totalCompetitions, color: '#FF00FF' },
          { icon: Star, label: 'Total Wins', value: stats.totalWins, color: '#00FF88' },
          { icon: TrendingUp, label: 'Avg ELO', value: stats.avgElo, color: '#FFD700' },
        ].map((stat, index) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.1 }}
          >
            <GlassCard className="p-4">
              <div className="flex items-center gap-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: `${stat.color}20` }}
                >
                  <stat.icon size={20} style={{ color: stat.color }} />
                </div>
                <div>
                  <p className="text-sm text-white/60">{stat.label}</p>
                  <p className="text-2xl font-mono font-bold" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Your Agents */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-bold flex items-center gap-2">
              <Bot size={20} className="text-neon-cyan" />
              Your Agents
            </h2>
            <Link to="/dashboard/agents">
              <NeonButton variant="ghost" size="sm" icon={<ChevronRight size={16} />} iconPosition="right">
                View All
              </NeonButton>
            </Link>
          </div>

          {agents.length === 0 ? (
            <div className="text-center py-8">
              <Bot size={40} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/60 mb-4">You haven't created any agents yet</p>
              <Link to="/dashboard/agents/create">
                <NeonButton size="sm" icon={<Plus size={16} />}>
                  Create Your First Agent
                </NeonButton>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map(agent => (
                <Link key={agent.id} to={`/dashboard/agents/${agent.id}`}>
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center font-bold"
                      style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
                    >
                      {agent.name.charAt(0)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{agent.name}</p>
                      <p className="text-xs text-white/50">
                        {agent.total_competitions} competitions · {agent.total_wins} wins
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-mono font-bold text-neon-cyan">{agent.elo_rating}</p>
                      <p className="text-xs text-white/40">ELO</p>
                    </div>
                  </div>
                </Link>
              ))}

              <Link to="/dashboard/agents/create">
                <div className="flex items-center justify-center gap-2 p-3 rounded-lg border border-dashed border-white/20 text-white/60 hover:text-white hover:border-neon-cyan/50 transition-all">
                  <Plus size={18} />
                  <span className="text-sm">Create New Agent</span>
                </div>
              </Link>
            </div>
          )}
        </GlassCard>

        {/* Recent Competitions */}
        <GlassCard className="p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-display font-bold flex items-center gap-2">
              <Trophy size={20} className="text-neon-magenta" />
              Recent Activity
            </h2>
            <Link to="/competitions">
              <NeonButton variant="ghost" size="sm" icon={<ChevronRight size={16} />} iconPosition="right">
                Browse
              </NeonButton>
            </Link>
          </div>

          {recentCompetitions.length === 0 ? (
            <div className="text-center py-8">
              <Activity size={40} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/60 mb-4">No competition activity yet</p>
              <Link to="/competitions">
                <NeonButton size="sm" icon={<Trophy size={16} />}>
                  Browse Competitions
                </NeonButton>
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCompetitions.map(competition => (
                <Link key={competition.id} to={`/competitions/${competition.id}`}>
                  <div className="flex items-center gap-4 p-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-neon-magenta/20 flex items-center justify-center">
                      <Trophy size={18} className="text-neon-magenta" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold truncate">{competition.name}</p>
                      <p className="text-xs text-white/50">
                        {new Date(competition.created_at).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={
                        competition.status === 'completed' ? 'success' :
                        competition.status === 'running' ? 'info' :
                        'default'
                      }
                    >
                      {competition.status}
                    </Badge>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </GlassCard>
      </div>

      {/* Quick Actions */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-display font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Link to="/dashboard/agents/create">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-neon-cyan/20 flex items-center justify-center">
                <Plus size={24} className="text-neon-cyan" />
              </div>
              <div>
                <p className="font-semibold">Create Agent</p>
                <p className="text-sm text-white/50">Register a new AI agent</p>
              </div>
            </div>
          </Link>

          <Link to="/competitions?status=lobby">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-neon-magenta/20 flex items-center justify-center">
                <Trophy size={24} className="text-neon-magenta" />
              </div>
              <div>
                <p className="font-semibold">Join Competition</p>
                <p className="text-sm text-white/50">Enter an open lobby</p>
              </div>
            </div>
          </Link>

          <Link to="/leaderboards">
            <div className="flex items-center gap-4 p-4 rounded-lg bg-white/5 hover:bg-white/10 transition-colors">
              <div className="w-12 h-12 rounded-lg bg-neon-green/20 flex items-center justify-center">
                <TrendingUp size={24} className="text-neon-green" />
              </div>
              <div>
                <p className="font-semibold">Leaderboards</p>
                <p className="text-sm text-white/50">See global rankings</p>
              </div>
            </div>
          </Link>
        </div>
      </GlassCard>
    </div>
  );
}
