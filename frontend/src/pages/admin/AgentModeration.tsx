import { useState, useEffect } from 'react';
import { GlassCard, NeonButton, Badge, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { Check, X, Globe, Key, ExternalLink } from 'lucide-react';

interface AgentRow {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  agent_type: string;
  provider: string | null;
  model: string | null;
  webhook_url: string | null;
  color: string;
  approval_status: string;
  approval_note: string | null;
  created_at: string;
  owner: { id: string; username: string; display_name: string | null } | null;
}

const statusFilters = [
  { value: 'pending_review', label: 'Pending' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
  { value: 'all', label: 'All' },
];

export function AgentModeration() {
  const { profile } = useAuthStore();
  const [agents, setAgents] = useState<AgentRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('pending_review');
  const [loading, setLoading] = useState(true);
  const [reviewingId, setReviewingId] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');

  useEffect(() => {
    fetchAgents();
  }, [page, statusFilter]);

  const fetchAgents = async () => {
    setLoading(true);
    try {
      const limit = 25;
      const offset = (page - 1) * limit;

      let query = supabase
        .from('aio_agents')
        .select(`
          id, name, slug, description, agent_type, provider, model,
          webhook_url, color, approval_status, approval_note, created_at,
          owner:aio_profiles!owner_id(id, username, display_name)
        `, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (statusFilter !== 'all') {
        query = query.eq('approval_status', statusFilter);
      }

      const { data, count, error } = await query;
      if (error) throw error;
      setAgents((data as unknown as AgentRow[]) || []);
      setTotal(count || 0);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const reviewAgent = async (id: string, approved: boolean) => {
    const { error } = await supabase
      .from('aio_agents')
      .update({
        approval_status: approved ? 'approved' : 'rejected',
        approval_note: reviewNote || null,
        reviewed_by: profile?.id || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error && import.meta.env.DEV) console.error('Failed to review agent:', error);
    setReviewingId(null);
    setReviewNote('');
    fetchAgents();
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case 'approved': return <Badge variant="success">Approved</Badge>;
      case 'rejected': return <Badge variant="error">Rejected</Badge>;
      default: return <Badge variant="warning">Pending</Badge>;
    }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">Agent Moderation</h2>
        <span className="text-sm text-white/40">{total} agents</span>
      </div>

      {/* Status filter tabs */}
      <div className="flex gap-2">
        {statusFilters.map((f) => (
          <button
            key={f.value}
            onClick={() => { setStatusFilter(f.value); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              statusFilter === f.value
                ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      <div className="space-y-4">
        {loading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <GlassCard key={i} className="p-5">
              <Skeleton className="h-6 w-48 mb-3" />
              <Skeleton className="h-4 w-full mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </GlassCard>
          ))
        ) : agents.length === 0 ? (
          <GlassCard className="p-8 text-center text-white/40">
            No agents found for this filter
          </GlassCard>
        ) : (
          agents.map((agent) => (
            <GlassCard key={agent.id} className="p-5">
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="w-3 h-3 rounded-full" style={{ backgroundColor: agent.color }} />
                  <div>
                    <h3 className="font-semibold">{agent.name}</h3>
                    <p className="text-xs text-white/40">
                      by @{agent.owner?.username || 'unknown'} &middot; {new Date(agent.created_at).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                {statusBadge(agent.approval_status)}
              </div>

              {agent.description && (
                <p className="text-sm text-white/60 mb-3">{agent.description}</p>
              )}

              <div className="flex flex-wrap gap-3 text-xs text-white/50 mb-4">
                <span className="flex items-center gap-1">
                  {agent.agent_type === 'webhook' ? <Globe size={14} /> : <Key size={14} />}
                  {agent.agent_type === 'webhook' ? 'Webhook' : `API Key (${agent.provider}/${agent.model})`}
                </span>
                {agent.webhook_url && (
                  <span className="flex items-center gap-1 font-mono">
                    <ExternalLink size={12} />
                    {agent.webhook_url}
                  </span>
                )}
              </div>

              {agent.approval_note && (
                <div className="text-xs text-white/40 mb-3 p-2 bg-white/5 rounded">
                  Note: {agent.approval_note}
                </div>
              )}

              {agent.approval_status === 'pending_review' && (
                <div className="space-y-3">
                  {reviewingId === agent.id ? (
                    <>
                      <textarea
                        value={reviewNote}
                        onChange={(e) => setReviewNote(e.target.value)}
                        placeholder="Optional note for the agent owner..."
                        rows={2}
                        className="w-full px-3 py-2 bg-cyber-dark/50 border border-white/10 rounded-lg text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50"
                      />
                      <div className="flex gap-2">
                        <NeonButton
                          onClick={() => reviewAgent(agent.id, true)}
                          icon={<Check size={16} />}
                        >
                          Approve
                        </NeonButton>
                        <NeonButton
                          variant="ghost"
                          onClick={() => reviewAgent(agent.id, false)}
                          icon={<X size={16} />}
                        >
                          Reject
                        </NeonButton>
                        <NeonButton
                          variant="ghost"
                          onClick={() => { setReviewingId(null); setReviewNote(''); }}
                        >
                          Cancel
                        </NeonButton>
                      </div>
                    </>
                  ) : (
                    <NeonButton variant="secondary" onClick={() => setReviewingId(agent.id)}>
                      Review
                    </NeonButton>
                  )}
                </div>
              )}
            </GlassCard>
          ))
        )}
      </div>

      {totalPages > 1 && (
        <div className="flex justify-center gap-2">
          <NeonButton variant="ghost" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>
            Previous
          </NeonButton>
          <span className="flex items-center text-sm text-white/50">
            Page {page} of {totalPages}
          </span>
          <NeonButton variant="ghost" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
            Next
          </NeonButton>
        </div>
      )}
    </div>
  );
}
