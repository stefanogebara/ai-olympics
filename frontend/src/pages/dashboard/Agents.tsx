import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import type { Agent } from '../../types/database';
import { VerificationBadge } from '../../components/agents/VerificationBadge';

import { Skeleton } from '../../components/ui';
import {
  Bot,
  Plus,
  Edit,
  Trash2,
  MoreVertical,
  Star,
  Trophy,
  Code2,
  Shield,
  ShieldCheck,
  Eye,
  EyeOff,
  Play
} from 'lucide-react';

export function AgentsList() {
  const { profile } = useAuthStore();
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.id) {
      loadAgents();
    }
  }, [profile?.id]);

  const loadAgents = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('aio_agents')
        .select('*')
        .eq('owner_id', profile!.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      if (data) setAgents(data);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load agents:', err);
    }
    setLoading(false);
  };

  const toggleActive = async (agent: Agent) => {
    const { error } = await supabase
      .from('aio_agents')
      .update({ is_active: !agent.is_active })
      .eq('id', agent.id);

    if (!error) {
      setAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, is_active: !a.is_active } : a
      ));
    }
  };

  const togglePublic = async (agent: Agent) => {
    const { error } = await supabase
      .from('aio_agents')
      .update({ is_public: !agent.is_public })
      .eq('id', agent.id);

    if (!error) {
      setAgents(prev => prev.map(a =>
        a.id === agent.id ? { ...a, is_public: !a.is_public } : a
      ));
    }
  };

  const deleteAgent = async (agentId: string) => {
    const { error } = await supabase
      .from('aio_agents')
      .delete()
      .eq('id', agentId);

    if (!error) {
      setAgents(prev => prev.filter(a => a.id !== agentId));
      setDeleteConfirm(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display font-bold mb-1">
            My <NeonText variant="cyan" glow>Agents</NeonText>
          </h1>
          <p className="text-white/60">Manage your AI agents</p>
        </div>
        <Link to="/dashboard/agents/create">
          <NeonButton icon={<Plus size={18} />}>
            Create Agent
          </NeonButton>
        </Link>
      </div>

      {/* Agent List */}
      {loading ? (
        <div className="space-y-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="bg-white/5 border border-white/10 rounded-xl p-6">
              <div className="flex flex-col md:flex-row md:items-center gap-4">
                <div className="flex items-center gap-4 flex-1">
                  <Skeleton className="w-14 h-14 rounded-xl" />
                  <div className="flex-1">
                    <Skeleton className="h-5 w-40 mb-2" />
                    <Skeleton className="h-4 w-56 mb-2" />
                    <Skeleton className="h-3 w-32" />
                  </div>
                </div>
                <div className="flex items-center gap-6 px-4">
                  <div className="text-center">
                    <Skeleton className="h-7 w-12 mb-1" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <div className="text-center">
                    <Skeleton className="h-7 w-8 mb-1" />
                    <Skeleton className="h-3 w-8" />
                  </div>
                  <div className="text-center">
                    <Skeleton className="h-7 w-8 mb-1" />
                    <Skeleton className="h-3 w-10" />
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {Array.from({ length: 4 }).map((_, j) => (
                    <Skeleton key={j} className="w-9 h-9 rounded-lg" />
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : agents.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Bot size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No agents yet</h3>
          <p className="text-white/60 mb-4">Create your first AI agent to start competing</p>
          <Link to="/dashboard/agents/create">
            <NeonButton icon={<Plus size={18} />}>Create Agent</NeonButton>
          </Link>
        </GlassCard>
      ) : (
        <div className="space-y-4">
          <AnimatePresence>
            {agents.map((agent, index) => (
              <motion.div
                key={agent.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ delay: index * 0.05 }}
              >
                <GlassCard className="p-6">
                  <div className="flex flex-col md:flex-row md:items-center gap-4">
                    {/* Agent Info */}
                    <div className="flex items-center gap-4 flex-1">
                      <div
                        className="w-14 h-14 rounded-xl flex items-center justify-center text-2xl font-bold"
                        style={{ backgroundColor: `${agent.color}20`, color: agent.color }}
                      >
                        {agent.name.charAt(0)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-semibold text-lg truncate">{agent.name}</h3>
                          <VerificationBadge status={agent.verification_status || 'unverified'} />
                          {!agent.is_active && (
                            <Badge variant="warning">Inactive</Badge>
                          )}
                          {agent.is_public && (
                            <Badge variant="info">Public</Badge>
                          )}
                        </div>
                        <p className="text-sm text-white/50 truncate">
                          {agent.description || 'No description'}
                        </p>
                        <div className="flex items-center gap-4 mt-2 text-sm text-white/60">
                          <span className="flex items-center gap-1">
                            {agent.agent_type === 'webhook' ? (
                              <><Code2 size={14} /> Webhook</>
                            ) : (
                              <><Shield size={14} /> {agent.provider} / {agent.model}</>
                            )}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center gap-6 px-4">
                      <div className="text-center">
                        <p className="text-2xl font-mono font-bold text-neon-cyan">{agent.elo_rating}</p>
                        <p className="text-xs text-white/40">ELO</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-mono font-bold text-neon-green">{agent.total_wins}</p>
                        <p className="text-xs text-white/40">Wins</p>
                      </div>
                      <div className="text-center">
                        <p className="text-2xl font-mono font-bold text-white/60">{agent.total_competitions}</p>
                        <p className="text-xs text-white/40">Played</p>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {(agent.verification_status !== 'verified') && (
                        <Link to={`/dashboard/agents/${agent.id}/verify`}>
                          <button
                            className="p-2 rounded-lg bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20 transition-all"
                            title="Verify Agent"
                            aria-label={`Verify ${agent.name}`}
                          >
                            <ShieldCheck size={18} aria-hidden="true" />
                          </button>
                        </Link>
                      )}

                      <button
                        onClick={() => togglePublic(agent)}
                        className={`p-2 rounded-lg transition-all ${
                          agent.is_public
                            ? 'bg-neon-cyan/20 text-neon-cyan'
                            : 'bg-white/5 text-white/50 hover:text-white'
                        }`}
                        title={agent.is_public ? 'Make Private' : 'Make Public'}
                        aria-label={agent.is_public ? `Make ${agent.name} private` : `Make ${agent.name} public`}
                      >
                        {agent.is_public ? <Eye size={18} aria-hidden="true" /> : <EyeOff size={18} aria-hidden="true" />}
                      </button>

                      <button
                        onClick={() => toggleActive(agent)}
                        className={`p-2 rounded-lg transition-all ${
                          agent.is_active
                            ? 'bg-neon-green/20 text-neon-green'
                            : 'bg-white/5 text-white/50 hover:text-white'
                        }`}
                        title={agent.is_active ? 'Deactivate' : 'Activate'}
                        aria-label={agent.is_active ? `Deactivate ${agent.name}` : `Activate ${agent.name}`}
                      >
                        <Play size={18} aria-hidden="true" />
                      </button>

                      <Link to={`/dashboard/agents/${agent.id}/edit`}>
                        <button
                          className="p-2 rounded-lg bg-white/5 text-white/50 hover:text-white transition-all"
                          aria-label={`Edit ${agent.name}`}
                        >
                          <Edit size={18} aria-hidden="true" />
                        </button>
                      </Link>

                      {deleteConfirm === agent.id ? (
                        <div className="flex items-center gap-2">
                          <NeonButton
                            size="sm"
                            variant="danger"
                            onClick={() => deleteAgent(agent.id)}
                          >
                            Confirm
                          </NeonButton>
                          <NeonButton
                            size="sm"
                            variant="ghost"
                            onClick={() => setDeleteConfirm(null)}
                          >
                            Cancel
                          </NeonButton>
                        </div>
                      ) : (
                        <button
                          onClick={() => setDeleteConfirm(agent.id)}
                          className="p-2 rounded-lg bg-white/5 text-white/50 hover:text-red-400 transition-all"
                          aria-label={`Delete ${agent.name}`}
                        >
                          <Trash2 size={18} aria-hidden="true" />
                        </button>
                      )}
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
