import { useState, useEffect } from 'react';
import { GlassCard, NeonButton, Badge, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { XCircle } from 'lucide-react';

interface CompetitionRow {
  id: string;
  name: string;
  status: string;
  stake_mode: string;
  entry_fee: number;
  max_participants: number;
  scheduled_start: string | null;
  created_at: string;
  domain: { name: string; slug: string } | null;
  creator: { username: string; display_name: string | null } | null;
}

const statusFilters = ['all', 'lobby', 'starting', 'running', 'completed', 'cancelled'];

export function CompetitionManagement() {
  const { session } = useAuthStore();
  const [competitions, setCompetitions] = useState<CompetitionRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchCompetitions();
  }, [page, statusFilter]);

  const fetchCompetitions = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/competitions?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      const data = await res.json();
      setCompetitions(data.competitions || []);
      setTotal(data.total || 0);
    } catch {
      // ignore
    }
    setLoading(false);
  };

  const cancelCompetition = async (id: string) => {
    await fetch(`/api/admin/competitions/${id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session?.access_token}`,
      },
      body: JSON.stringify({ status: 'cancelled' }),
    });
    fetchCompetitions();
  };

  const statusBadge = (status: string) => {
    const variants: Record<string, 'default' | 'success' | 'warning' | 'error'> = {
      lobby: 'default',
      starting: 'warning',
      running: 'warning',
      completed: 'success',
      cancelled: 'error',
    };
    return <Badge variant={variants[status] || 'default'}>{status}</Badge>;
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">Competition Management</h2>
        <span className="text-sm text-white/40">{total} competitions</span>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 flex-wrap">
        {statusFilters.map((s) => (
          <button
            key={s}
            onClick={() => { setStatusFilter(s); setPage(1); }}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all capitalize ${
              statusFilter === s
                ? 'bg-neon-cyan/10 text-neon-cyan border border-neon-cyan/30'
                : 'bg-white/5 text-white/50 hover:text-white hover:bg-white/10'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <GlassCard className="overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/50">
              <th className="px-4 py-3">Competition</th>
              <th className="px-4 py-3">Domain</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Mode</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-4 py-3"><Skeleton className="h-5 w-40" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                </tr>
              ))
            ) : competitions.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-white/40">No competitions found</td>
              </tr>
            ) : (
              competitions.map((comp) => (
                <tr key={comp.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{comp.name}</span>
                      <p className="text-xs text-white/40">by @{comp.creator?.username || 'unknown'}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-white/60">
                    {comp.domain?.name || '-'}
                  </td>
                  <td className="px-4 py-3">
                    {statusBadge(comp.status)}
                  </td>
                  <td className="px-4 py-3 text-white/60 capitalize">
                    {comp.stake_mode}
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {new Date(comp.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    {['lobby', 'starting', 'running'].includes(comp.status) && (
                      <button
                        onClick={() => cancelCompetition(comp.id)}
                        title="Cancel competition"
                        className="p-1.5 rounded-lg bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-all"
                      >
                        <XCircle size={16} />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </GlassCard>

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
