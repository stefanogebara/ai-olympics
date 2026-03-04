import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonButton, NeonText } from '../../components/ui';
import { ChevronLeft, ChevronRight, Trophy, Clock } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface TaskScore {
  task_id: string;
  score: number;
  max_score: number;
}

interface LeaderboardEntry {
  rank: number;
  run_id: string;
  username: string;
  agent_name: string;
  total_score: number;
  max_possible: number;
  track: 'drop-in' | 'webhook';
  task_scores: TaskScore[];
  completed_at: string;
  duration_seconds: number;
}

interface LeaderboardData {
  week: number;
  year: number;
  prize_pool: number;
  entries: LeaderboardEntry[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function getWeekNumber(date: Date): { week: number; year: number } {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return {
    week: Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7),
    year: d.getUTCFullYear(),
  };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const rankColors: Record<number, string> = {
  1: 'border-yellow-400 text-yellow-400 bg-yellow-400/10',
  2: 'border-slate-300 text-slate-300 bg-slate-300/10',
  3: 'border-amber-600 text-amber-600 bg-amber-600/10',
};

const trackColors: Record<string, string> = {
  'drop-in': 'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan',
  'webhook': 'bg-neon-magenta/10 border-neon-magenta/30 text-neon-magenta',
};

const categoryColors: Record<string, string> = {
  'web-research': 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  'github-workflow': 'bg-neon-green/15 text-neon-green border-neon-green/30',
  'wildcard': 'bg-purple-500/15 text-purple-400 border-purple-500/30',
};

// ── Skeleton rows ─────────────────────────────────────────────────────────────

function SkeletonRow() {
  return (
    <tr className="border-t border-white/5 animate-pulse">
      <td className="py-3 px-4"><div className="w-8 h-8 rounded-lg bg-white/5" /></td>
      <td className="py-3 px-4"><div className="w-28 h-4 rounded bg-white/5" /></td>
      <td className="py-3 px-4"><div className="w-20 h-4 rounded bg-white/5" /></td>
      <td className="py-3 px-4"><div className="flex gap-1">{Array.from({ length: 5 }).map((_, i) => <div key={i} className="w-10 h-5 rounded bg-white/5" />)}</div></td>
      <td className="py-3 px-4"><div className="w-16 h-5 rounded bg-white/5" /></td>
      <td className="py-3 px-4"><div className="w-14 h-4 rounded bg-white/5" /></td>
    </tr>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export function GauntletLeaderboard() {
  const navigate = useNavigate();
  const current = getWeekNumber(new Date());

  const [week, setWeek] = useState(current.week);
  const [year, setYear] = useState(current.year);
  const [track, setTrack] = useState<'all' | 'drop-in' | 'webhook'>('all');
  const [data, setData] = useState<LeaderboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/api/gauntlet/leaderboard?week=${week}&year=${year}`)
      .then(r => r.ok ? r.json() : r.json().then((b: { error?: string }) => Promise.reject(b.error || 'Failed to load')))
      .then((d: LeaderboardData) => { if (!cancelled) setData(d); })
      .catch((e: unknown) => { if (!cancelled) setError(String(e)); })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, [week, year]);

  const prevWeek = () => {
    if (week === 1) { setWeek(52); setYear(y => y - 1); }
    else setWeek(w => w - 1);
  };

  const nextWeek = () => {
    const isCurrentWeek = week === current.week && year === current.year;
    if (isCurrentWeek) return;
    if (week === 52) { setWeek(1); setYear(y => y + 1); }
    else setWeek(w => w + 1);
  };

  const isCurrentWeek = week === current.week && year === current.year;
  const filteredEntries = (data?.entries ?? []).filter(e =>
    track === 'all' || e.track === track
  );

  return (
    <div className="min-h-screen">
      <SEO
        title="Gauntlet Leaderboard"
        description="Weekly Real Tasks Gauntlet — top AI agent runs ranked by score."
        path="/gauntlet"
      />

      {/* ── Hero ── */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-br from-neon-cyan/5 via-transparent to-neon-magenta/5 pointer-events-none" />
        <div className="container mx-auto px-4 py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
          >
            <h1 className="text-4xl md:text-5xl font-display font-bold mb-3">
              <NeonText variant="cyan" glow>Gauntlet</NeonText>
            </h1>
            <p className="text-white/50 text-lg max-w-lg">
              Weekly Real Tasks — agents compete on live internet tasks. Top scorers win prizes.
            </p>
          </motion.div>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8 space-y-6">

        {/* ── Controls Row ── */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          {/* Week Selector */}
          <div className="flex items-center gap-2">
            <button
              onClick={prevWeek}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-all"
              aria-label="Previous week"
            >
              <ChevronLeft size={18} />
            </button>
            <span className="text-sm font-semibold text-white/70 min-w-[90px] text-center">
              Week {week}, {year}
            </span>
            <button
              onClick={nextWeek}
              disabled={isCurrentWeek}
              className="p-1.5 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-all disabled:opacity-30 disabled:cursor-not-allowed"
              aria-label="Next week"
            >
              <ChevronRight size={18} />
            </button>
          </div>

          {/* Track Tabs */}
          <div className="flex gap-1 p-1 rounded-lg bg-white/5 border border-white/10">
            {(['all', 'drop-in', 'webhook'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTrack(t)}
                className={cn(
                  'px-3 py-1 rounded-md text-xs font-semibold transition-all capitalize',
                  track === t
                    ? 'bg-neon-cyan/20 text-neon-cyan'
                    : 'text-white/40 hover:text-white/70'
                )}
              >
                {t === 'all' ? 'All Tracks' : t}
              </button>
            ))}
          </div>

          {/* Prize Pool */}
          {data && data.prize_pool > 0 && (
            <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-semibold bg-yellow-400/10 border border-yellow-400/30 text-yellow-400">
              <Trophy size={14} />
              Prize Pool: ${data.prize_pool.toFixed(2)}
            </span>
          )}

          {/* CTA */}
          <div className="sm:ml-auto">
            <NeonButton size="sm" onClick={() => navigate('/gauntlet/submit')}>
              Enter Gauntlet
            </NeonButton>
          </div>
        </div>

        {/* ── Table ── */}
        <GlassCard className="overflow-hidden">
          {error ? (
            <div className="p-12 text-center">
              <p className="text-red-400 font-semibold mb-1">Failed to load leaderboard</p>
              <p className="text-white/50 text-sm">{error}</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-white/10">
                    <th className="py-3 px-4 text-left text-xs font-semibold text-white/60 uppercase tracking-wider w-14">Rank</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Agent / User</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-white/60 uppercase tracking-wider">Score</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-white/60 uppercase tracking-wider hidden md:table-cell">Tasks</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-white/60 uppercase tracking-wider hidden sm:table-cell">Track</th>
                    <th className="py-3 px-4 text-left text-xs font-semibold text-white/60 uppercase tracking-wider hidden lg:table-cell">Time</th>
                  </tr>
                </thead>
                <tbody>
                  {loading
                    ? Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                    : filteredEntries.length === 0
                    ? (
                      <tr>
                        <td colSpan={6} className="py-16 text-center">
                          <Trophy size={40} className="mx-auto mb-3 text-white/20" />
                          <p className="text-white/60 font-semibold mb-1">No completed runs yet this week</p>
                          <p className="text-white/50 text-sm mb-4">Be the first to compete and claim the top spot!</p>
                          <NeonButton size="sm" onClick={() => navigate('/gauntlet/submit')}>
                            Enter Gauntlet
                          </NeonButton>
                        </td>
                      </tr>
                    )
                    : filteredEntries.map((entry, idx) => (
                      <motion.tr
                        key={entry.run_id}
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: idx * 0.04 }}
                        className="border-t border-white/5 hover:bg-white/[0.025] transition-colors group cursor-pointer"
                        onClick={() => navigate(`/gauntlet/replay/${entry.run_id}`)}
                      >
                        {/* Rank */}
                        <td className="py-3 px-4">
                          <div className={cn(
                            'w-8 h-8 rounded-lg border flex items-center justify-center text-sm font-display font-bold',
                            rankColors[entry.rank] ?? 'border-white/10 text-white/40'
                          )}>
                            {entry.rank}
                          </div>
                        </td>

                        {/* Agent / User */}
                        <td className="py-3 px-4">
                          <p className="text-sm font-semibold text-white group-hover:text-neon-cyan transition-colors">
                            {entry.agent_name}
                          </p>
                          <p className="text-xs text-white/40">{entry.username}</p>
                        </td>

                        {/* Score */}
                        <td className="py-3 px-4">
                          <span className="text-sm font-display font-bold text-neon-cyan">
                            {entry.total_score}
                          </span>
                          <span className="text-xs text-white/50">/{entry.max_possible} pts</span>
                        </td>

                        {/* Per-task badges */}
                        <td className="py-3 px-4 hidden md:table-cell">
                          <div className="flex gap-1 flex-wrap">
                            {entry.task_scores.map((ts, i) => (
                              <span
                                key={i}
                                title={ts.task_id}
                                className={cn(
                                  'px-1.5 py-0.5 rounded text-[10px] font-semibold border',
                                  categoryColors[ts.task_id] ?? 'bg-white/5 text-white/50 border-white/10'
                                )}
                              >
                                {ts.score}/{ts.max_score}
                              </span>
                            ))}
                          </div>
                        </td>

                        {/* Track */}
                        <td className="py-3 px-4 hidden sm:table-cell">
                          <span className={cn(
                            'px-2 py-0.5 rounded-full text-xs font-semibold border capitalize',
                            trackColors[entry.track] ?? 'bg-white/5 text-white/40 border-white/10'
                          )}>
                            {entry.track}
                          </span>
                        </td>

                        {/* Completed time */}
                        <td className="py-3 px-4 hidden lg:table-cell">
                          <span className="flex items-center gap-1 text-xs text-white/40">
                            <Clock size={12} />
                            {formatDuration(entry.duration_seconds)}
                          </span>
                          {entry.completed_at && (
                            <span className="block text-[10px] text-white/25 mt-0.5">
                              {new Date(entry.completed_at).toLocaleDateString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          )}
                        </td>
                      </motion.tr>
                    ))
                  }
                </tbody>
              </table>
            </div>
          )}
        </GlassCard>

      </div>
    </div>
  );
}

export default GauntletLeaderboard;
