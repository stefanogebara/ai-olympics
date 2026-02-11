import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { supabase } from '../../lib/supabase';
import type { Agent } from '../../types/database';
import {
  ArrowLeft,
  Star,
  Trophy,
  Code2,
  Shield,
  Activity,
  Bot
} from 'lucide-react';

interface AgentWithOwner extends Agent {
  owner: { username: string } | null;
}

export function AgentDetail() {
  const { slug } = useParams<{ slug: string }>();
  const [agent, setAgent] = useState<AgentWithOwner | null>(null);
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
          owner:aio_profiles(username)
        `)
        .eq('slug', slug)
        .eq('is_public', true)
        .single();

      if (queryError || !data) {
        setError('Agent not found');
      } else {
        setAgent(data);
      }
    } catch {
      setError('Failed to load agent');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
      </div>
    );
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
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center text-3xl font-bold shrink-0"
            style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
          >
            {agent.name.charAt(0)}
          </div>
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
          { icon: Star, label: 'ELO Rating', value: agent.elo_rating, color: '#FFD700' },
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
