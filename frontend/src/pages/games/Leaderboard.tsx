import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import {
  Trophy,
  Medal,
  Crown,
  ArrowLeft,
  RefreshCw,
  Brain,
  Calculator,
  Type,
  Lightbulb,
  User,
  Clock
} from 'lucide-react';

interface LeaderboardEntry {
  rank: number;
  username: string;
  userId: string;
  score: number;
  gameType: string;
  accuracy?: number;
  timeSpent?: number;
  createdAt: string;
}

type GameTab = 'all' | 'trivia' | 'math' | 'word' | 'logic' | 'chess';

const GAME_TABS: { id: GameTab; name: string; icon: React.ReactNode }[] = [
  { id: 'all', name: 'All Games', icon: <Trophy size={16} /> },
  { id: 'trivia', name: 'Trivia', icon: <Brain size={16} /> },
  { id: 'math', name: 'Math', icon: <Calculator size={16} /> },
  { id: 'word', name: 'Word', icon: <Type size={16} /> },
  { id: 'logic', name: 'Logic', icon: <Lightbulb size={16} /> },
  { id: 'chess', name: 'Chess', icon: <Crown size={16} /> }
];

import { API_BASE } from '../../lib/api';

export function GamesLeaderboard() {
  const { user } = useAuthStore();
  const [activeTab, setActiveTab] = useState<GameTab>('all');
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userRank, setUserRank] = useState<number | null>(null);

  useEffect(() => {
    loadLeaderboard();
  }, [activeTab]);

  const loadLeaderboard = async () => {
    setLoading(true);
    try {
      const gameFilter = activeTab === 'all' ? '' : `?gameType=${activeTab}`;
      const response = await fetch(`${API_BASE}/api/games/leaderboard${gameFilter}`);

      if (response.ok) {
        const data = await response.json();
        const leaderboard = data.leaderboard || data || [];

        // Add ranks
        const rankedEntries = leaderboard.map((entry: LeaderboardEntry, index: number) => ({
          ...entry,
          rank: index + 1
        }));

        setEntries(rankedEntries);

        // Find current user's rank
        if (user) {
          const userEntry = rankedEntries.find((e: LeaderboardEntry) => e.userId === user.id);
          setUserRank(userEntry?.rank || null);
        }
      } else {
        setEntries([]);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading leaderboard:', error);
      setEntries([]);
    } finally {
      setLoading(false);
    }
  };

  const getRankIcon = (rank: number) => {
    switch (rank) {
      case 1:
        return <Crown className="text-yellow-400" size={20} />;
      case 2:
        return <Medal className="text-gray-300" size={20} />;
      case 3:
        return <Medal className="text-amber-600" size={20} />;
      default:
        return <span className="text-white/40 font-mono">{rank}</span>;
    }
  };

  const formatTime = (seconds: number): string => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffHours < 168) return `${Math.floor(diffHours / 24)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="container mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <Link to="/games">
          <NeonButton variant="ghost" size="sm" icon={<ArrowLeft size={18} />}>
            Back to Games
          </NeonButton>
        </Link>
      </div>

      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-display font-bold mb-2">
            <NeonText variant="cyan" glow>Games Leaderboard</NeonText>
          </h1>
          <p className="text-white/60">Top performers across all game challenges</p>
        </div>
        <NeonButton
          onClick={loadLeaderboard}
          icon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
          disabled={loading}
        >
          Refresh
        </NeonButton>
      </div>

      {/* Game Tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {GAME_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              activeTab === tab.id
                ? 'bg-neon-cyan/20 border border-neon-cyan/50 text-neon-cyan'
                : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10 hover:text-white'
            }`}
          >
            {tab.icon}
            <span>{tab.name}</span>
          </button>
        ))}
      </div>

      {/* User's Rank Card */}
      {user && userRank && (
        <GlassCard className="p-4 mb-6 border-neon-magenta/30">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-full bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center text-black font-bold">
              {userRank}
            </div>
            <div>
              <div className="font-semibold text-white">Your Rank</div>
              <div className="text-sm text-white/60">Keep playing to climb higher!</div>
            </div>
          </div>
        </GlassCard>
      )}

      {/* Leaderboard Table */}
      <GlassCard className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
          </div>
        ) : entries.length === 0 ? (
          <div className="text-center py-20">
            <Trophy size={48} className="mx-auto mb-4 text-white/20" />
            <h3 className="text-lg font-semibold text-white mb-2">No scores yet</h3>
            <p className="text-white/60 mb-4">Be the first to set a high score!</p>
            <Link to="/games">
              <NeonButton>Play Now</NeonButton>
            </Link>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-white/10">
                  <th className="text-left py-4 px-6 text-white/60 font-medium">Rank</th>
                  <th className="text-left py-4 px-6 text-white/60 font-medium">Player</th>
                  {activeTab === 'all' && (
                    <th className="text-left py-4 px-6 text-white/60 font-medium">Game</th>
                  )}
                  <th className="text-right py-4 px-6 text-white/60 font-medium">Score</th>
                  <th className="text-right py-4 px-6 text-white/60 font-medium hidden md:table-cell">Accuracy</th>
                  <th className="text-right py-4 px-6 text-white/60 font-medium hidden lg:table-cell">Time</th>
                  <th className="text-right py-4 px-6 text-white/60 font-medium hidden sm:table-cell">When</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {entries.map((entry, index) => {
                    const isCurrentUser = user && entry.userId === user.id;

                    return (
                      <motion.tr
                        key={`${entry.userId}-${entry.gameType}-${index}`}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.2, delay: index * 0.03 }}
                        className={`border-b border-white/5 ${
                          isCurrentUser ? 'bg-neon-cyan/10' : 'hover:bg-white/5'
                        } transition-colors`}
                      >
                        <td className="py-4 px-6">
                          <div className="w-8 h-8 flex items-center justify-center">
                            {getRankIcon(entry.rank)}
                          </div>
                        </td>
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-3">
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-cyan/50 to-neon-magenta/50 flex items-center justify-center">
                              <User size={14} className="text-white" />
                            </div>
                            <span className={`font-medium ${isCurrentUser ? 'text-neon-cyan' : 'text-white'}`}>
                              {entry.username}
                              {isCurrentUser && <span className="ml-2 text-xs text-white/40">(You)</span>}
                            </span>
                          </div>
                        </td>
                        {activeTab === 'all' && (
                          <td className="py-4 px-6">
                            <Badge variant="default" className="text-xs capitalize">
                              {entry.gameType}
                            </Badge>
                          </td>
                        )}
                        <td className="py-4 px-6 text-right">
                          <span className={`text-lg font-bold ${
                            entry.rank <= 3 ? 'text-neon-cyan' : 'text-white'
                          }`}>
                            {entry.score}
                          </span>
                        </td>
                        <td className="py-4 px-6 text-right hidden md:table-cell">
                          {entry.accuracy !== undefined && (
                            <span className="text-white/80">{entry.accuracy}%</span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right hidden lg:table-cell">
                          {entry.timeSpent !== undefined && (
                            <span className="text-white/60 flex items-center justify-end gap-1">
                              <Clock size={12} />
                              {formatTime(entry.timeSpent)}
                            </span>
                          )}
                        </td>
                        <td className="py-4 px-6 text-right hidden sm:table-cell">
                          <span className="text-white/40 text-sm">
                            {formatDate(entry.createdAt)}
                          </span>
                        </td>
                      </motion.tr>
                    );
                  })}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        )}
      </GlassCard>
    </div>
  );
}

export default GamesLeaderboard;
