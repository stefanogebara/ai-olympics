import { useState, useEffect } from 'react';
import { GlassCard, NeonButton, Input, Badge, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { Search, Shield, ShieldOff, Check } from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3003' : '');

interface UserRow {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  is_verified: boolean;
  is_admin: boolean;
  wallet_balance: number;
  created_at: string;
}

export function UserManagement() {
  const { session } = useAuthStore();
  const [users, setUsers] = useState<UserRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchUsers();
  }, [page, search]);

  const fetchUsers = async () => {
    if (!API_BASE) {
      setError('Admin dashboard requires the backend API server.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), limit: '25' });
      if (search) params.set('search', search);

      const res = await fetch(`${API_BASE}/api/admin/users?${params}`, {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setUsers(data.users || []);
      setTotal(data.total || 0);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch users:', err);
      setError('Failed to load users. Check that the API is running.');
    }
    setLoading(false);
  };

  const updateUser = async (id: string, updates: Record<string, boolean>) => {
    if (!API_BASE) return;
    try {
      const res = await fetch(`${API_BASE}/api/admin/users/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(updates),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      fetchUsers();
    } catch (err) {
      console.error('Failed to update user:', err);
      setError('Failed to update user.');
    }
  };

  const totalPages = Math.ceil(total / 25);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-display font-bold">User Management</h2>
        <span className="text-sm text-white/40">{total} users</span>
      </div>

      {error && (
        <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
          {error}
        </div>
      )}

      <Input
        placeholder="Search by username or display name..."
        value={search}
        onChange={(e) => { setSearch(e.target.value); setPage(1); }}
        icon={<Search size={18} />}
      />

      <GlassCard className="overflow-hidden">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/10 text-left text-white/50">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Balance</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-white/5">
                  <td className="px-4 py-3"><Skeleton className="h-5 w-32" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-16" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-5 w-20" /></td>
                </tr>
              ))
            ) : users.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-white/40">No users found</td>
              </tr>
            ) : (
              users.map((user) => (
                <tr key={user.id} className="border-b border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3">
                    <div>
                      <span className="font-medium">{user.display_name || user.username}</span>
                      <p className="text-xs text-white/40">@{user.username}</p>
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-1.5">
                      {user.is_admin && <Badge variant="error">Admin</Badge>}
                      {user.is_verified && <Badge variant="success">Verified</Badge>}
                    </div>
                  </td>
                  <td className="px-4 py-3 font-mono text-white/70">
                    ${(user.wallet_balance / 100).toFixed(2)}
                  </td>
                  <td className="px-4 py-3 text-white/50">
                    {new Date(user.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button
                        onClick={() => updateUser(user.id, { is_admin: !user.is_admin })}
                        title={user.is_admin ? 'Remove admin' : 'Make admin'}
                        className={`p-1.5 rounded-lg transition-all ${
                          user.is_admin
                            ? 'bg-red-500/10 text-red-400 hover:bg-red-500/20'
                            : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        {user.is_admin ? <ShieldOff size={16} /> : <Shield size={16} />}
                      </button>
                      <button
                        onClick={() => updateUser(user.id, { is_verified: !user.is_verified })}
                        title={user.is_verified ? 'Unverify' : 'Verify'}
                        className={`p-1.5 rounded-lg transition-all ${
                          user.is_verified
                            ? 'bg-neon-green/10 text-neon-green hover:bg-neon-green/20'
                            : 'bg-white/5 text-white/40 hover:text-white hover:bg-white/10'
                        }`}
                      >
                        <Check size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
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
