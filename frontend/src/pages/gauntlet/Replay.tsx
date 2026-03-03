import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonText, NeonButton } from '../../components/ui';
import { ArrowLeft, Play, Pause, SkipBack, SkipForward } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReplayFrame {
  frame_index: number;
  action: string;
  payload?: string;
  reasoning?: string;
  screenshot_b64?: string;
  accessibility_tree?: string;
}

interface TaskResult {
  task_id: string;
  title: string;
  score: number | null;
  max_score: number;
  status: 'completed' | 'in_progress' | 'pending' | 'failed';
}

interface RunSummary {
  run_id: string;
  agent_name: string;
  username: string;
  total_score: number;
  max_possible: number;
  status: 'completed' | 'running' | 'failed';
  track: 'drop-in' | 'webhook';
  duration_seconds: number;
  started_at: string;
}

interface ReplayData {
  run: RunSummary;
  tasks: TaskResult[];
  frames: ReplayFrame[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${seconds}s`;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s}s`;
}

const statusBadge: Record<string, string> = {
  completed: 'bg-neon-green/10 border-neon-green/30 text-neon-green',
  running:   'bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan',
  failed:    'bg-red-500/10 border-red-500/30 text-red-400',
};

const taskStatusLabel: Record<string, string> = {
  completed:  'text-neon-green',
  in_progress: 'text-neon-cyan',
  pending:    'text-white/40',
  failed:     'text-red-400',
};

// ── Main Component ────────────────────────────────────────────────────────────

export function GauntletReplay() {
  const { runId } = useParams<{ runId: string }>();
  const [data, setData] = useState<ReplayData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!runId) return;
    setLoading(true);
    setError(null);

    fetch(`${API_URL}/gauntlet/runs/${runId}/replay`)
      .then(r => r.ok ? r.json() : r.json().then((b: { error?: string }) => Promise.reject(b.error || 'Not found')))
      .then((d: ReplayData) => setData(d))
      .catch((e: unknown) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [runId]);

  const frames = data?.frames ?? [];
  const totalFrames = frames.length;
  const currentFrame = frames[frameIndex] ?? null;

  // Auto-play at ~10 fps
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setFrameIndex(prev => {
          if (prev >= totalFrames - 1) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }, 100);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, totalFrames]);

  return (
    <div className="min-h-screen">
      <SEO
        title="Gauntlet Replay"
        description="Step through a recorded gauntlet agent run frame by frame."
        path={`/gauntlet/replay/${runId}`}
      />

      {/* ── Header ── */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan/5 via-transparent to-neon-magenta/5 pointer-events-none" />
        <div className="container mx-auto px-4 py-6">
          <Link
            to="/gauntlet"
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-neon-cyan transition-colors text-sm mb-4"
          >
            <ArrowLeft size={14} />
            Back to Leaderboard
          </Link>
          <h1 className="text-3xl font-display font-bold">
            <NeonText variant="cyan" glow>Gauntlet Replay</NeonText>
          </h1>
          <p className="text-white/40 mt-1 text-sm">Step through recorded agent frames</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">

        {/* Loading */}
        {loading && (
          <GlassCard className="p-16 text-center">
            <div className="w-10 h-10 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/50 text-sm">Loading replay...</p>
          </GlassCard>
        )}

        {/* Error */}
        {error && !loading && (
          <GlassCard className="p-16 text-center">
            <p className="text-red-400 font-semibold mb-2">Replay not available</p>
            <p className="text-white/40 text-sm">{error}</p>
          </GlassCard>
        )}

        {data && !loading && (
          <div className="space-y-5">

            {/* ── Run Summary ── */}
            <GlassCard className="p-5">
              <div className="flex flex-wrap items-center gap-4">
                <div>
                  <p className="text-sm font-semibold text-white">{data.run.agent_name}</p>
                  <p className="text-xs text-white/40">{data.run.username}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-lg font-display font-bold text-neon-cyan">
                    {data.run.total_score}<span className="text-xs text-white/30">/{data.run.max_possible} pts</span>
                  </span>
                  <span className={cn(
                    'px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize',
                    statusBadge[data.run.status] ?? 'bg-white/5 text-white/40 border-white/10'
                  )}>
                    {data.run.status}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold border capitalize bg-neon-cyan/10 border-neon-cyan/30 text-neon-cyan">
                    {data.run.track}
                  </span>
                  <span className="text-xs text-white/40">{formatDuration(data.run.duration_seconds)}</span>
                </div>
              </div>
            </GlassCard>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

              {/* ── Left: Viewer + Controls ── */}
              <div className="lg:col-span-2 space-y-5">

                {/* Frame Display */}
                <GlassCard className="p-5">
                  <AnimatePresence mode="wait">
                    {currentFrame ? (
                      <motion.div
                        key={frameIndex}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.08 }}
                      >
                        {/* Screenshot */}
                        {currentFrame.screenshot_b64 ? (
                          <img
                            src={`data:image/png;base64,${currentFrame.screenshot_b64}`}
                            alt={`Frame ${frameIndex + 1}`}
                            className="w-full rounded-lg border border-white/10 mb-4 max-h-80 object-contain bg-black"
                          />
                        ) : currentFrame.accessibility_tree ? (
                          <pre className="w-full rounded-lg border border-white/10 mb-4 p-3 text-[11px] font-mono text-white/60 bg-black/40 overflow-auto max-h-80 whitespace-pre-wrap">
                            {currentFrame.accessibility_tree}
                          </pre>
                        ) : (
                          <div className="w-full h-40 rounded-lg border border-white/10 mb-4 flex items-center justify-center bg-black/20">
                            <p className="text-white/20 text-sm">No visual for this frame</p>
                          </div>
                        )}

                        {/* Action badge */}
                        <div className="flex items-start gap-3 mb-3">
                          <span className="px-2.5 py-1 rounded-lg bg-neon-cyan/10 border border-neon-cyan/30 text-neon-cyan text-xs font-mono font-semibold flex-shrink-0">
                            {currentFrame.action}
                          </span>
                          {currentFrame.payload && (
                            <span className="text-xs text-white/50 font-mono break-all">{currentFrame.payload}</span>
                          )}
                        </div>

                        {/* Reasoning */}
                        {currentFrame.reasoning && (
                          <div className="rounded-lg border border-white/8 bg-white/3 p-3">
                            <p className="text-xs text-white/40 uppercase tracking-wider mb-1">Reasoning</p>
                            <p className="text-sm text-white/70">{currentFrame.reasoning}</p>
                          </div>
                        )}
                      </motion.div>
                    ) : (
                      <p className="text-center text-white/30 py-12 text-sm">
                        {totalFrames === 0 ? 'No frames recorded for this run' : 'Press play or drag the scrubber'}
                      </p>
                    )}
                  </AnimatePresence>
                </GlassCard>

                {/* Playback Controls */}
                <GlassCard className="p-5">
                  {/* Progress bar */}
                  <div className="flex justify-between text-xs text-white/35 font-mono mb-2">
                    <span>Frame {frameIndex + 1}</span>
                    <span>{totalFrames} total</span>
                  </div>
                  <div className="relative h-1.5 bg-white/8 rounded-full overflow-hidden mb-3">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-neon-cyan to-neon-magenta"
                      animate={{ width: totalFrames > 0 ? `${((frameIndex + 1) / totalFrames) * 100}%` : '0%' }}
                      transition={{ duration: 0.1 }}
                    />
                  </div>

                  {/* Scrubber */}
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, totalFrames - 1)}
                    value={frameIndex}
                    onChange={e => { setPlaying(false); setFrameIndex(Number(e.target.value)); }}
                    disabled={totalFrames === 0}
                    className="w-full h-1.5 accent-neon-cyan cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 mb-4"
                  />

                  {/* Buttons */}
                  <div className="flex items-center gap-3">
                    <NeonButton
                      variant="ghost"
                      size="sm"
                      icon={<SkipBack size={15} />}
                      onClick={() => { setPlaying(false); setFrameIndex(p => Math.max(0, p - 1)); }}
                      disabled={frameIndex === 0 || totalFrames === 0}
                    >
                      Prev
                    </NeonButton>

                    <button
                      onClick={() => setPlaying(p => !p)}
                      disabled={totalFrames === 0}
                      className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm bg-neon-cyan text-black hover:bg-neon-cyan/90 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                    >
                      {playing ? <Pause size={16} /> : <Play size={16} />}
                      {playing ? 'Pause' : 'Play'}
                    </button>

                    <NeonButton
                      variant="ghost"
                      size="sm"
                      icon={<SkipForward size={15} />}
                      onClick={() => { setPlaying(false); setFrameIndex(p => Math.min(totalFrames - 1, p + 1)); }}
                      disabled={frameIndex >= totalFrames - 1 || totalFrames === 0}
                    >
                      Next
                    </NeonButton>
                  </div>
                </GlassCard>
              </div>

              {/* ── Right: Task Progress ── */}
              <div>
                <GlassCard className="p-5">
                  <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Task Progress</h2>
                  <div className="space-y-3">
                    {data.tasks.map((task, i) => (
                      <div key={task.task_id} className="p-3 rounded-lg border border-white/8 bg-white/3">
                        <div className="flex items-start justify-between gap-2 mb-1">
                          <span className="text-xs font-semibold text-white/70 flex-1">{task.title || `Task ${i + 1}`}</span>
                          <span className={cn('text-xs font-semibold capitalize flex-shrink-0', taskStatusLabel[task.status] ?? 'text-white/40')}>
                            {task.status === 'completed' ? `${task.score ?? 0}/${task.max_score}` : task.status.replace('_', ' ')}
                          </span>
                        </div>
                        {/* Score bar */}
                        <div className="h-1 bg-white/8 rounded-full overflow-hidden">
                          <div
                            className={cn(
                              'h-full rounded-full transition-all duration-300',
                              task.status === 'completed' ? 'bg-neon-green' :
                              task.status === 'in_progress' ? 'bg-neon-cyan animate-pulse' :
                              task.status === 'failed' ? 'bg-red-500' : 'bg-white/10'
                            )}
                            style={{ width: task.score != null && task.max_score > 0 ? `${(task.score / task.max_score) * 100}%` : task.status === 'in_progress' ? '50%' : '0%' }}
                          />
                        </div>
                      </div>
                    ))}
                    {data.tasks.length === 0 && (
                      <p className="text-white/30 text-xs text-center py-4">No task data available</p>
                    )}
                  </div>
                </GlassCard>
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default GauntletReplay;
