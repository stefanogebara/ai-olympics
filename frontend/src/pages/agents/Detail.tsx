import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GlassCard, NeonButton, NeonText, Badge, PageSkeleton } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import { generateAgentAvatar } from '../../lib/utils';
import type { Agent } from '../../types/database';
import {
  ArrowLeft,
  Star,
  Trophy,
  Code2,
  Shield,
  Activity,
  Bot,
  Sparkles,
  Swords,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
  Heart
} from 'lucide-react';

interface AgentWithOwner extends Agent {
  owner: { username: string } | null;
}

interface EloHistoryEntry {
  id: string;
  rating_before: number;
  rating_after: number;
  rating_change: number;
  final_rank: number;
  participant_count: number;
  created_at: string;
  competition: { name: string } | null;
  domain: { name: string; slug: string } | null;
}

export function AgentDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<AgentWithOwner | null>(null);
  const [eloHistory, setEloHistory] = useState<EloHistoryEntry[]>([]);
  const [popularity, setPopularity] = useState<{ total_cheers: number; total_win_predictions: number; total_mvp_votes: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (slug) loadAgent();
  }, [slug]);

  const loadAgent = async () => {
    setLoading(true);
    setError(null);

    try {
      const { data, error: queryError } = await supabase
        .from('aio_agents')
        .select(`
          *,
          owner:aio_profiles!owner_id(username)
        `)
        .eq('slug', slug)
        .eq('is_public', true)
        .single();

      if (queryError || !data) {
        setError('Agent not found');
      } else {
        setAgent(data);
        // Load ELO history
        const { data: historyData } = await supabase
          .from('aio_elo_history')
          .select(`
            *,
            competition:aio_competitions(name),
            domain:aio_domains(name, slug)
          `)
          .eq('agent_id', data.id)
          .order('created_at', { ascending: false })
          .limit(10);
        if (historyData) setEloHistory(historyData);

        // Load popularity stats
        const { data: popData } = await supabase
          .from('aio_agent_popularity')
          .select('total_cheers, total_win_predictions, total_mvp_votes')
          .eq('agent_id', data.id)
          .single();
        if (popData) setPopularity(popData);
      }
    } catch {
      setError('Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <PageSkeleton />;
  }

  if (error || !agent) {
    return (
      <div className="container mx-auto px-4 py-16 text-center">
        <Bot size={48} className="mx-auto mb-4 text-white/20" />
        <h1 className="text-2xl font-display font-bold text-white mb-2">Agent Not Found</h1>
        <p className="text-white/60 mb-6">{error || 'This agent does not exist or is not public.'}</p>
        <Link to="/agents">
          <NeonButton icon={<ArrowLeft size={18} />}>Back to Agents</NeonButton>
        </Link>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-4xl">
      {/* Back */}
      <Link to="/agents" className="inline-flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors">
        <ArrowLeft size={18} />
        <span>Back to Agents</span>
      </Link>

      {/* Agent Header */}
      <GlassCard className="p-8 mb-6">
        <div className="flex flex-col md:flex-row items-start gap-6">
          <img
            src={generateAgentAvatar(agent.id, agent.name, 80)}
            alt={agent.name}
            className="w-20 h-20 rounded-2xl shrink-0"
          />
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-display font-bold text-white">{agent.name}</h1>
              <Badge variant={agent.agent_type === 'webhook' ? 'info' : 'default'}>
                {agent.agent_type === 'webhook' ? (
                  <><Code2 size={12} className="mr-1" /> Webhook</>
                ) : (
                  <><Shield size={12} className="mr-1" /> API</>
                )}
              </Badge>
            </div>
            <p className="text-white/50 mb-4">by @{agent.owner?.username || 'unknown'}</p>
            {agent.description && (
              <p className="text-white/70">{agent.description}</p>
            )}
          </div>
        </div>
      </GlassCard>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {[
          { icon: Star, label: 'Rating', value: `${agent.elo_rating} \u00B1${Math.round(agent.rating_deviation ?? 350)}`, color: '#FFD700' },
          { icon: Trophy, label: 'Total Wins', value: agent.total_wins, color: '#00FF88' },
          { icon: Activity, label: 'Competitions', value: agent.total_competitions, color: '#00F5FF' },
          { icon: Trophy, label: 'Win Rate', value: agent.total_competitions > 0 ? `${Math.round((agent.total_wins / agent.total_competitions) * 100)}%` : 'N/A', color: '#FF00FF' },
        ].map((stat) => (
          <GlassCard key={stat.label} className="p-4 text-center">
            <stat.icon size={20} className="mx-auto mb-2" style={{ color: stat.color }} />
            <p className="text-2xl font-mono font-bold" style={{ color: stat.color }}>{stat.value}</p>
            <p className="text-xs text-white/50">{stat.label}</p>
          </GlassCard>
        ))}
      </div>

      {/* Persona & Strategy */}
      {(agent.persona_name || agent.strategy) && (
        <GlassCard className="p-6 mb-6">
          <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
            <Sparkles size={18} className="text-yellow-400" />
            Persona & Strategy
          </h2>
          <div className="space-y-3">
            {agent.persona_name && (
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-white/60">Persona</span>
                <span className="text-white font-semibold">{agent.persona_name}</span>
              </div>
            )}
            {agent.persona_description && (
              <div className="py-2 border-b border-white/10">
                <span className="text-white/60 block mb-1">Description</span>
                <p className="text-white/80 text-sm">{agent.persona_description}</p>
              </div>
            )}
            {agent.persona_style && (
              <div className="flex justify-between py-2 border-b border-white/10">
                <span className="text-white/60">Style</span>
                <Badge variant="info">{agent.persona_style}</Badge>
              </div>
            )}
            {agent.strategy && (
              <div className="flex justify-between py-2">
                <span className="text-white/60 flex items-center gap-1"><Swords size={14} /> Strategy</span>
                <Badge variant="default">{agent.strategy}</Badge>
              </div>
            )}
          </div>
        </GlassCard>
      )}

      {/* ELO History */}
      <GlassCard className="p-6 mb-6">
        <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
          <History size={18} className="text-neon-cyan" />
          Rating History
        </h2>
        {eloHistory.length === 0 ? (
          <p className="text-white/40 text-sm">No competition history yet.</p>
        ) : (
          <div className="space-y-2">
            {eloHistory.map((entry) => (
              <div
                key={entry.id}
                className="flex items-center justify-between py-2 px-3 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className={`flex items-center gap-1 text-sm font-mono font-bold ${
                    entry.rating_change > 0 ? 'text-green-400' :
                    entry.rating_change < 0 ? 'text-red-400' : 'text-white/40'
                  }`}>
                    {entry.rating_change > 0 ? <TrendingUp size={14} /> :
                     entry.rating_change < 0 ? <TrendingDown size={14} /> :
                     <Minus size={14} />}
                    {entry.rating_change > 0 ? '+' : ''}{entry.rating_change}
                  </div>
                  <div>
                    <p className="text-white text-sm">{entry.competition?.name || 'Competition'}</p>
                    <p className="text-white/40 text-xs">
                      Rank #{entry.final_rank}/{entry.participant_count}
                      {entry.domain && ` - ${entry.domain.name}`}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-white/60 text-sm font-mono">
                    {entry.rating_before} → <span className="text-white font-bold">{entry.rating_after}</span>
                  </p>
                  <p className="text-white/30 text-xs">
                    {new Date(entry.created_at).toLocaleDateString()}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {/* Popularity */}
      {popularity && (popularity.total_cheers > 0 || popularity.total_win_predictions > 0 || popularity.total_mvp_votes > 0) && (
        <GlassCard className="p-6 mb-6">
          <h2 className="text-lg font-display font-bold text-white mb-4 flex items-center gap-2">
            <Heart size={18} className="text-red-400" />
            Popularity
          </h2>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center">
              <Heart size={20} className="mx-auto mb-2 text-red-400" />
              <p className="text-2xl font-mono font-bold text-red-400">{popularity.total_cheers}</p>
              <p className="text-xs text-white/50">Cheers</p>
            </div>
            <div className="text-center">
              <Trophy size={20} className="mx-auto mb-2 text-yellow-400" />
              <p className="text-2xl font-mono font-bold text-yellow-400">{popularity.total_win_predictions}</p>
              <p className="text-xs text-white/50">Win Predictions</p>
            </div>
            <div className="text-center">
              <Star size={20} className="mx-auto mb-2 text-purple-400" />
              <p className="text-2xl font-mono font-bold text-purple-400">{popularity.total_mvp_votes}</p>
              <p className="text-xs text-white/50">MVP Votes</p>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Agent Info */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-display font-bold text-white mb-4">Agent Details</h2>
        <div className="space-y-3">
          <div className="flex justify-between py-2 border-b border-white/10">
            <span className="text-white/60">Type</span>
            <span className="text-white">{agent.agent_type === 'webhook' ? 'Webhook' : 'API Key'}</span>
          </div>
          {agent.provider && (
            <div className="flex justify-between py-2 border-b border-white/10">
              <span className="text-white/60">Provider</span>
              <span className="text-white capitalize">{agent.provider}</span>
            </div>
          )}
          {agent.model && (
            <div className="flex justify-between py-2 border-b border-white/10">
              <span className="text-white/60">Model</span>
              <span className="text-white font-mono text-sm">{agent.model}</span>
            </div>
          )}
          <div className="flex justify-between py-2 border-b border-white/10">
            <span className="text-white/60">Status</span>
            <Badge variant={agent.is_active ? 'success' : 'default'}>
              {agent.is_active ? 'Active' : 'Inactive'}
            </Badge>
          </div>
          <div className="flex justify-between py-2">
            <span className="text-white/60">Joined</span>
            <span className="text-white">{new Date(agent.created_at).toLocaleDateString()}</span>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
