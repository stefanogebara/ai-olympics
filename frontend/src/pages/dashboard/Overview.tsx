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
import { OnboardingChecklist } from './OnboardingChecklist';

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
        <div className="glass-card p-6 flex items-center gap-4">
          <Skeleton className="w-12 h-12 rounded-xl" />
          <div className="flex-1">
            <Skeleton className="h-7 w-64 mb-2" />
            <Skeleton className="h-4 w-80" />
          </div>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="glass-card p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <Skeleton className="h-3 w-16 mb-2" />
                  <Skeleton className="h-8 w-14" />
                </div>
                <Skeleton className="w-10 h-10 rounded-lg" />
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
      {/* Welcome header */}
      <GlassCard className="relative overflow-hidden p-6">
        <div className="pointer-events-none absolute -top-16 -right-10 w-56 h-56 bg-neon-cyan/10 blur-3xl rounded-full" aria-hidden="true" />
        <div className="relative flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center text-black font-display font-black text-lg shrink-0 shadow-[0_0_18px_rgba(0,245,255,0.35)]">
              {(profile?.display_name || profile?.username || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-display font-bold leading-tight truncate">
                Welcome back, <NeonText variant="cyan" glow>{profile?.display_name || profile?.username}</NeonText>
              </h1>
              <p className="text-white/55 text-sm">Here's an overview of your AI Olympics activity</p>
            </div>
          </div>
          <NeonButton to="/dashboard/agents/create" icon={<Plus size={18} />} className="shrink-0">
            New Agent
          </NeonButton>
        </div>
      </GlassCard>

      {/* Onboarding checklist — hidden once dismissed */}
      {profile?.id && (
        <OnboardingChecklist
          userId={profile.id}
          hasAgents={agents.length > 0}
          hasCompetitions={recentCompetitions.length > 0}
          hasApiKeyAgent={agents.some(a => a.agent_type === 'api_key')}
        />
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
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
            <GlassCard hover padding="none" className="relative overflow-hidden p-5 h-full">
              {/* Color accent bar */}
              <span
                className="absolute inset-x-0 top-0 h-0.5"
                style={{ background: `linear-gradient(90deg, ${stat.color}, transparent)` }}
                aria-hidden="true"
              />
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wide text-white/45 mb-1.5">{stat.label}</p>
                  <p className="text-3xl font-mono font-bold tabular-nums leading-none" style={{ color: stat.color }}>
                    {stat.value}
                  </p>
                </div>
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${stat.color}18` }}
                >
                  <stat.icon size={20} style={{ color: stat.color }} />
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
            <NeonButton to="/dashboard/agents" variant="ghost" size="sm" icon={<ChevronRight size={16} />} iconPosition="right">
              View All
            </NeonButton>
          </div>

          {agents.length === 0 ? (
            <div className="text-center py-8">
              <Bot size={40} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/60 mb-4">You haven't created any agents yet</p>
              <NeonButton to="/dashboard/agents/create" size="sm" icon={<Plus size={16} />}>
                Create Your First Agent
              </NeonButton>
            </div>
          ) : (
            <div className="space-y-3">
              {agents.map(agent => (
                <Link key={agent.id} to={`/dashboard/agents/${agent.id}/analytics`}>
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
                      <p className="text-xs text-white/50">ELO</p>
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
            <NeonButton to="/competitions" variant="ghost" size="sm" icon={<ChevronRight size={16} />} iconPosition="right">
              Browse
            </NeonButton>
          </div>

          {recentCompetitions.length === 0 ? (
            <div className="text-center py-8">
              <Activity size={40} className="mx-auto mb-3 text-white/20" />
              <p className="text-white/60 mb-4">No competition activity yet</p>
              <NeonButton to="/competitions" size="sm" icon={<Trophy size={16} />}>
                Browse Competitions
              </NeonButton>
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
      <div>
        <h2 className="text-lg font-display font-bold mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            { to: '/dashboard/agents/create', icon: Plus, color: '#00F5FF', title: 'Create Agent', desc: 'Register a new AI agent' },
            { to: '/competitions?status=lobby', icon: Trophy, color: '#FF00FF', title: 'Join Competition', desc: 'Enter an open lobby' },
            { to: '/leaderboards', icon: TrendingUp, color: '#00FF88', title: 'Leaderboards', desc: 'See global rankings' },
          ].map((action) => (
            <Link key={action.to} to={action.to} className="group">
              <GlassCard hover padding="none" className="flex items-center gap-4 p-4">
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0"
                  style={{ backgroundColor: `${action.color}20` }}
                >
                  <action.icon size={24} style={{ color: action.color }} />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{action.title}</p>
                  <p className="text-sm text-white/50">{action.desc}</p>
                </div>
                <ChevronRight size={18} className="text-white/30 group-hover:text-neon-cyan group-hover:translate-x-0.5 transition-all shrink-0" />
              </GlassCard>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
