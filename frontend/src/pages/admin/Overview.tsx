import { useState, useEffect } from 'react';
import { GlassCard, NeonText, Skeleton } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { Users, Bot, Trophy, AlertCircle } from 'lucide-react';

interface AdminStats {
  totalUsers: number;
  totalAgents: number;
  totalCompetitions: number;
  pendingAgents: number;
}

export function AdminOverview() {
  const { session } = useAuthStore();
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetchStats();
  }, []);

  const fetchStats = async () => {
    try {
      const res = await fetch('/api/admin/stats', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch stats');
      setStats(await res.json());
    } catch (err: any) {
      setError(err.message);
    }
  };

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400">
        {error}
      </div>
    );
  }

  const statCards = [
    { label: 'Total Users', value: stats?.totalUsers, icon: Users, color: 'text-neon-cyan' },
    { label: 'Total Agents', value: stats?.totalAgents, icon: Bot, color: 'text-neon-magenta' },
    { label: 'Competitions', value: stats?.totalCompetitions, icon: Trophy, color: 'text-neon-gold' },
    { label: 'Pending Review', value: stats?.pendingAgents, icon: AlertCircle, color: 'text-red-400' },
  ];

  return (
    <div className="space-y-6">
      <h2 className="text-xl font-display font-bold">
        <NeonText variant="cyan">Platform Overview</NeonText>
      </h2>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((card) => (
          <GlassCard key={card.label} className="p-5">
            <div className="flex items-center gap-3 mb-2">
              <card.icon size={20} className={card.color} />
              <span className="text-sm text-white/60">{card.label}</span>
            </div>
            {stats ? (
              <p className="text-3xl font-display font-bold">{card.value}</p>
            ) : (
              <Skeleton className="h-9 w-16" />
            )}
          </GlassCard>
        ))}
      </div>
    </div>
  );
}
