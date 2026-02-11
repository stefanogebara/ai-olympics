import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard, NeonText, NeonButton, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import {
  Trophy,
  TrendingUp,
  Target,
  Flame,
  Users,
  RefreshCw,
  UserPlus,
  UserMinus,
  ArrowLeft,
  ChevronUp,
  ChevronDown,
} from 'lucide-react';
import { API_BASE } from '../../lib/api';

interface LeaderboardEntry {
  portfolio_id: string;
  user_id: string;
  username: string;
  avatar_url?: string;
  virtual_balance: number;
  total_profit: number;
  profit_percent: number;
  total_bets: number;
  winning_bets: number;
  win_rate: number;
  brier_score?: number;
  best_streak: number;
  current_streak: number;
  follower_count: number;
}

type SortField = 'profit_percent' | 'win_rate' | 'total_bets' | 'best_streak' | 'brier_score';

export function PredictionLeaderboard() {
  const navigate = useNavigate();
  const { user, session, isAuthenticated } = useAuthStore();
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState<SortField>('profit_percent');
  const [followingSet, setFollowingSet] = useState<Set<string>>(new Set());
  const [followLoading, setFollowLoading] = useState<string | null>(null);

  useEffect(() => {
    loadLeaderboard();
    if (isAuthenticated) loadFollowing();
  }, [isAuthenticated]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/leaderboard?limit=50`);
      if (res.ok) {
        const data = await res.json();
        setEntries(data.leaderboard || []);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading leaderboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadFollowing = async () => {
    if (!session?.access_token) return;
    try {
      const res = await fetch(`${API_BASE}/api/user/following`, {
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFollowingSet(new Set(data.following || []));
      }
    } catch {}
  };

  const toggleFollow = async (userId: string) => {
    if (!session?.access_token) return;
    setFollowLoading(userId);
    const isFollowing = followingSet.has(userId);
    try {
      const res = await fetch(`${API_BASE}/api/user/follow/${userId}`, {
        method: isFollowing ? 'DELETE' : 'POST',
        headers: { 'Authorization': `Bearer ${session.access_token}` },
      });
      if (res.ok) {
        setFollowingSet(prev => {
          const next = new Set(prev);
          if (isFollowing) next.delete(userId);
          else next.add(userId);
          return next;
        });
      }
    } catch {} finally {
      setFollowLoading(null);
    }
  };

  const sorted = [...entries].sort((a, b) => {
    if (sortBy === 'brier_score') {
      // Lower Brier score is better
      return (a.brier_score ?? 999) - (b.brier_score ?? 999);
    }
    return (b[sortBy] ?? 0) - (a[sortBy] ?? 0);
  });

  const sortOptions: { id: SortField; label: string }[] = [
    { id: 'profit_percent', label: 'Profit %' },
    { id: 'win_rate', label: 'Win Rate' },
    { id: 'total_bets', label: 'Total Bets' },
    { id: 'best_streak', label: 'Best Streak' },
    { id: 'brier_score', label: 'Brier Score' },
  ];

  const formatProfit = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      {/* Back button */}
      <button
        onClick={() => navigate('/predictions')}
        className="flex items-center gap-2 text-white/60 hover:text-white transition-colors mb-6"
      >
        <ArrowLeft size={18} />
        <span className="text-sm">Back to Markets</span>
      </button>

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="cyan" glow>Prediction Leaderboard</NeonText>
          </h1>
          <p className="text-white/60">
            Top paper traders ranked by performance
          </p>
        </div>
        <NeonButton
          onClick={loadLeaderboard}
          icon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
          disabled={loading}
        >
          Refresh
        </NeonButton>
      </div>

      {/* Sort Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {sortOptions.map(opt => (
          <button
            key={opt.id}
            onClick={() => setSortBy(opt.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              sortBy === opt.id
                ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/50'
                : 'bg-white/5 text-white/60 hover:bg-white/10 border border-transparent'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Leaderboard Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
        </div>
      ) : sorted.length === 0 ? (
        <GlassCard className="p-12 text-center">
          <Trophy size={48} className="mx-auto mb-4 text-white/20" />
          <h3 className="text-lg font-semibold text-white mb-2">No traders yet</h3>
          <p className="text-white/60">Be the first to place a bet and appear on the leaderboard!</p>
        </GlassCard>
      ) : (
        <div className="space-y-2">
          {sorted.map((entry, index) => {
            const rank = index + 1;
            const isMe = user?.id === entry.user_id;
            const isFollowing = followingSet.has(entry.user_id);

            return (
              <motion.div
                key={entry.portfolio_id}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.03 }}
              >
                <GlassCard className={`overflow-hidden ${isMe ? 'border-neon-cyan/40' : ''}`}>
                  <div className="p-4 flex items-center gap-4">
                    {/* Rank */}
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 font-bold ${
                      rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
                      rank === 2 ? 'bg-gray-400/20 text-gray-300' :
                      rank === 3 ? 'bg-orange-500/20 text-orange-400' :
                      'bg-white/5 text-white/40'
                    }`}>
                      {rank <= 3 ? <Trophy size={18} /> : rank}
                    </div>

                    {/* Avatar + Name */}
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center text-xs font-bold text-black shrink-0">
                        {entry.avatar_url ? (
                          <img src={entry.avatar_url} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          entry.username?.charAt(0)?.toUpperCase() || '?'
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-semibold text-white truncate">
                            {entry.username || 'Anonymous'}
                          </span>
                          {isMe && <Badge className="text-[10px] bg-neon-cyan/20 text-neon-cyan">You</Badge>}
                        </div>
                        <div className="text-xs text-white/40 flex items-center gap-2">
                          <span className="flex items-center gap-1"><Users size={10} />{entry.follower_count}</span>
                          {entry.current_streak > 0 && (
                            <span className="flex items-center gap-1 text-orange-400">
                              <Flame size={10} />{entry.current_streak}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="hidden md:flex items-center gap-6 text-sm">
                      <div className="text-center w-16">
                        <div className={`font-bold ${entry.profit_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {formatProfit(entry.profit_percent)}
                        </div>
                        <div className="text-[10px] text-white/40">Profit</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="font-bold text-white">{entry.win_rate.toFixed(0)}%</div>
                        <div className="text-[10px] text-white/40">Win Rate</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="font-bold text-white">{entry.total_bets}</div>
                        <div className="text-[10px] text-white/40">Bets</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="font-bold text-orange-400">{entry.best_streak}</div>
                        <div className="text-[10px] text-white/40">Streak</div>
                      </div>
                      <div className="text-center w-14">
                        <div className="font-bold text-neon-cyan">
                          {entry.brier_score != null ? entry.brier_score.toFixed(3) : '-'}
                        </div>
                        <div className="text-[10px] text-white/40">Brier</div>
                      </div>
                    </div>

                    {/* Mobile stats */}
                    <div className="md:hidden text-right">
                      <div className={`text-sm font-bold ${entry.profit_percent >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                        {formatProfit(entry.profit_percent)}
                      </div>
                      <div className="text-xs text-white/40">{entry.win_rate.toFixed(0)}% WR</div>
                    </div>

                    {/* Follow button */}
                    {isAuthenticated && !isMe && (
                      <button
                        onClick={() => toggleFollow(entry.user_id)}
                        disabled={followLoading === entry.user_id}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors shrink-0 ${
                          isFollowing
                            ? 'bg-white/10 text-white/60 hover:bg-red-500/20 hover:text-red-400'
                            : 'bg-neon-cyan/10 text-neon-cyan hover:bg-neon-cyan/20'
                        }`}
                      >
                        {followLoading === entry.user_id ? (
                          <RefreshCw size={12} className="animate-spin" />
                        ) : isFollowing ? (
                          <span className="flex items-center gap-1"><UserMinus size={12} />Unfollow</span>
                        ) : (
                          <span className="flex items-center gap-1"><UserPlus size={12} />Follow</span>
                        )}
                      </button>
                    )}
                  </div>
                </GlassCard>
              </motion.div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PredictionLeaderboard;
