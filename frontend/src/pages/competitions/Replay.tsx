import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonText, NeonButton } from '../../components/ui';
import { SEO } from '../../components/SEO';
import { ArrowLeft, Play, Pause, SkipForward, SkipBack, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ReplayAction {
  type: string;
  target?: string;
  success: boolean;
  timestamp?: number;
  value?: string;
  duration?: number;
}

interface ReplayEntry {
  agent_id: string;
  event_id: string;
  action_log: ReplayAction[];
}

interface ReplayData {
  competition_id: string;
  agents: ReplayEntry[];
}

// Agent display colors (cycle through these for replay agents)
const AGENT_COLORS = ['#00F5FF', '#FF00FF', '#00FF88', '#FFD700', '#FF6B6B', '#7C3AED'];

async function fetchReplay(id: string): Promise<ReplayData> {
  const res = await fetch(`${API_URL}/api/competitions/${id}/replay`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || 'Failed to load replay');
  }
  return res.json() as Promise<ReplayData>;
}

// ── Main Component ────────────────────────────────────────────────────────────

export function ReplayViewer() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReplayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [speed, setSpeed] = useState(1); // 0.5x, 1x, 2x

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    fetchReplay(id).then(setData).catch(setError).finally(() => setIsLoading(false));
  }, [id]);

  const agentIds = data ? Array.from(new Set(data.agents.map(e => e.agent_id))) : [];

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (agentIds.length > 0 && selectedAgent === null) {
      setSelectedAgent(agentIds[0]);
      setStep(0);
    }
  }, [agentIds.length]);

  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [selectedAgent]);

  const allActions: (ReplayAction & { event_id: string })[] = selectedAgent && data
    ? data.agents
        .filter(e => e.agent_id === selectedAgent)
        .flatMap(e => e.action_log.map(a => ({ ...a, event_id: e.event_id })))
    : [];

  const totalSteps = allActions.length;
  const currentAction = allActions[step] ?? null;

  useEffect(() => {
    if (playing) {
      const intervalMs = 600 / speed;
      intervalRef.current = setInterval(() => {
        setStep(prev => {
          if (prev >= totalSteps - 1) { setPlaying(false); return prev; }
          return prev + 1;
        });
      }, intervalMs);
    } else {
      if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [playing, totalSteps, speed]);

  const shortId = (id: string) => id.slice(0, 8);
  const progress = totalSteps > 0 ? ((step + 1) / totalSteps) * 100 : 0;

  const successCount = allActions.slice(0, step + 1).filter(a => a.success).length;
  const failCount = (step + 1) - successCount;

  return (
    <div className="min-h-screen">
      <SEO
        title="Replay Viewer"
        description="Watch recorded AI agent competition replays"
        path={`/competitions/${id}/replay`}
      />

      {/* ── Header ── */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-r from-neon-magenta/5 via-transparent to-neon-cyan/5 pointer-events-none" />
        <div className="container mx-auto px-4 py-6">
          <Link
            to={`/competitions/${id}`}
            className="inline-flex items-center gap-1.5 text-white/40 hover:text-neon-cyan transition-colors text-sm mb-4"
          >
            <ArrowLeft size={14} />
            Back to Competition
          </Link>
          <h1 className="text-3xl font-display font-bold">
            <NeonText variant="magenta" glow>Competition Replay</NeonText>
          </h1>
          <p className="text-white/40 mt-1 text-sm">Step through recorded agent actions</p>
        </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        {/* Loading */}
        {isLoading && (
          <GlassCard className="p-16 text-center">
            <div className="w-10 h-10 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
            <p className="text-white/50 text-sm">Loading replay data...</p>
          </GlassCard>
        )}

        {/* Error */}
        {error && (
          <GlassCard className="p-16 text-center">
            <p className="text-red-400 font-semibold mb-2">No replay available</p>
            <p className="text-white/40 text-sm">
              {error instanceof Error ? error.message : 'Replay data not found.'}
            </p>
          </GlassCard>
        )}

        {data && !isLoading && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            {/* ── Left: Controls ── */}
            <div className="lg:col-span-2 space-y-5">

              {/* Agent Selector */}
              <GlassCard className="p-5">
                <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Select Agent</h2>
                <div className="flex flex-wrap gap-2">
                  {agentIds.map((agentId, idx) => {
                    const color = AGENT_COLORS[idx % AGENT_COLORS.length];
                    const isSelected = selectedAgent === agentId;
                    return (
                      <button
                        key={agentId}
                        onClick={() => setSelectedAgent(agentId)}
                        className={cn(
                          'flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-mono font-semibold transition-all border',
                          isSelected
                            ? 'border-current bg-opacity-10 shadow-sm'
                            : 'border-white/10 bg-white/4 text-white/50 hover:border-white/20 hover:text-white'
                        )}
                        style={isSelected ? { borderColor: color, color, backgroundColor: `${color}12` } : {}}
                      >
                        <div
                          className="w-5 h-5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: isSelected ? `${color}30` : 'rgba(255,255,255,0.1)', border: `1.5px solid ${isSelected ? color : 'rgba(255,255,255,0.2)'}` }}
                        />
                        {shortId(agentId)}
                      </button>
                    );
                  })}
                </div>
              </GlassCard>

              {/* Playback Controls */}
              <GlassCard className="p-5">
                {/* Global progress bar */}
                <div className="mb-5">
                  <div className="flex justify-between text-xs text-white/35 font-mono mb-2">
                    <span>Step {step + 1}</span>
                    <span>{totalSteps} total</span>
                  </div>
                  <div className="relative h-2 bg-white/8 rounded-full overflow-hidden">
                    <motion.div
                      className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-neon-cyan to-neon-magenta"
                      animate={{ width: `${progress}%` }}
                      transition={{ duration: 0.15 }}
                    />
                  </div>
                </div>

                {/* Scrubber */}
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalSteps - 1)}
                  value={step}
                  onChange={e => { setPlaying(false); setStep(Number(e.target.value)); }}
                  disabled={totalSteps === 0}
                  className="w-full h-1.5 accent-neon-cyan cursor-pointer disabled:cursor-not-allowed disabled:opacity-30 mb-5"
                />

                {/* Button row */}
                <div className="flex items-center gap-3">
                  <NeonButton
                    variant="ghost"
                    size="sm"
                    icon={<SkipBack size={15} />}
                    onClick={() => { setPlaying(false); setStep(prev => Math.max(0, prev - 1)); }}
                    disabled={step === 0 || totalSteps === 0}
                  >Prev</NeonButton>

                  <button
                    onClick={() => setPlaying(prev => !prev)}
                    disabled={totalSteps === 0}
                    className={cn(
                      'flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all flex-shrink-0',
                      'bg-neon-cyan text-black hover:bg-neon-cyan/90 disabled:opacity-30 disabled:cursor-not-allowed'
                    )}
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                    {playing ? 'Pause' : 'Play'}
                  </button>

                  <NeonButton
                    variant="ghost"
                    size="sm"
                    icon={<SkipForward size={15} />}
                    onClick={() => { setPlaying(false); setStep(prev => Math.min(totalSteps - 1, prev + 1)); }}
                    disabled={step >= totalSteps - 1 || totalSteps === 0}
                  >Next</NeonButton>

                  {/* Speed selector */}
                  <div className="flex items-center gap-1 ml-auto p-1 rounded-lg bg-white/5 border border-white/10">
                    {[0.5, 1, 2].map(s => (
                      <button
                        key={s}
                        onClick={() => setSpeed(s)}
                        className={cn(
                          'px-2.5 py-1 rounded-md text-xs font-bold transition-all',
                          speed === s ? 'bg-neon-cyan/20 text-neon-cyan' : 'text-white/30 hover:text-white/60'
                        )}
                      >
                        {s}x
                      </button>
                    ))}
                  </div>
                </div>
              </GlassCard>

              {/* Current Action */}
              <GlassCard className="p-5">
                <h2 className="text-sm font-display font-bold mb-4 flex items-center gap-2 text-white/70">
                  <ChevronRight size={16} className="text-neon-cyan" />
                  Current Action
                  <span className="text-xs text-white/30 font-normal ml-auto font-mono">
                    {step + 1} / {totalSteps}
                  </span>
                </h2>

                <AnimatePresence mode="wait">
                  {currentAction ? (
                    <motion.div
                      key={step}
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.12 }}
                    >
                      {/* Status banner */}
                      <div
                        className={cn(
                          'flex items-center gap-2 px-4 py-2.5 rounded-xl mb-4 border font-semibold text-sm',
                          currentAction.success
                            ? 'bg-neon-green/8 border-neon-green/25 text-neon-green'
                            : 'bg-red-500/8 border-red-500/25 text-red-400'
                        )}
                      >
                        <span className={cn('w-2 h-2 rounded-full flex-shrink-0', currentAction.success ? 'bg-neon-green' : 'bg-red-400')} />
                        {currentAction.success ? 'Success' : 'Failed'}
                        <span className="ml-auto font-mono text-xs opacity-60">{currentAction.type}</span>
                      </div>

                      <div className="grid grid-cols-2 gap-3">
                        {currentAction.target && (
                          <ActionField label="Target" value={currentAction.target} mono span2 />
                        )}
                        {currentAction.value && (
                          <ActionField label="Value" value={currentAction.value} mono span2 />
                        )}
                        {currentAction.timestamp != null && (
                          <ActionField label="Timestamp" value={`${(currentAction.timestamp / 1000).toFixed(2)}s`} />
                        )}
                        {currentAction.duration != null && (
                          <ActionField label="Duration" value={`${currentAction.duration}ms`} />
                        )}
                        {currentAction.event_id && (
                          <ActionField label="Event" value={currentAction.event_id} />
                        )}
                      </div>
                    </motion.div>
                  ) : (
                    <p className="text-white/30 text-sm text-center py-8">
                      {totalSteps === 0 ? 'No actions recorded for this agent' : 'Use playback controls to step through actions'}
                    </p>
                  )}
                </AnimatePresence>
              </GlassCard>
            </div>

            {/* ── Right: Action Log + Stats ── */}
            <div className="space-y-5">
              {/* Stats */}
              <GlassCard className="p-5">
                <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-4">Stats</h2>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <p className="text-xl font-display font-bold text-white">{totalSteps}</p>
                    <p className="text-xs text-white/35">Total</p>
                  </div>
                  <div>
                    <p className="text-xl font-display font-bold text-neon-green">{successCount}</p>
                    <p className="text-xs text-white/35">OK</p>
                  </div>
                  <div>
                    <p className="text-xl font-display font-bold text-red-400">{failCount}</p>
                    <p className="text-xs text-white/35">Errors</p>
                  </div>
                </div>
                {totalSteps > 0 && (
                  <div className="mt-3 h-1.5 bg-white/8 rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-neon-green rounded-l-full transition-all duration-300"
                      style={{ width: `${(successCount / totalSteps) * 100}%` }}
                    />
                    <div
                      className="h-full bg-red-500 rounded-r-full transition-all duration-300"
                      style={{ width: `${(failCount / totalSteps) * 100}%` }}
                    />
                  </div>
                )}
              </GlassCard>

              {/* Action Log Timeline */}
              <GlassCard className="p-5 flex-1">
                <h2 className="text-xs font-semibold text-white/40 uppercase tracking-wider mb-3">Action Log</h2>
                <div className="space-y-0.5 max-h-[420px] overflow-y-auto -mx-1 px-1">
                  {allActions.map((action, i) => (
                    <button
                      key={i}
                      onClick={() => { setPlaying(false); setStep(i); }}
                      className={cn(
                        'w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-lg text-xs text-left transition-all border',
                        i === step
                          ? 'bg-neon-cyan/8 border-neon-cyan/25'
                          : 'hover:bg-white/4 border-transparent'
                      )}
                    >
                      <span className={cn(
                        'font-mono w-5 text-right flex-shrink-0',
                        i === step ? 'text-neon-cyan' : 'text-white/20'
                      )}>
                        {i + 1}
                      </span>
                      <span className={cn(
                        'flex-1 truncate font-semibold',
                        i === step ? 'text-neon-cyan' : 'text-white/55'
                      )}>
                        {action.type}
                      </span>
                      {action.target && (
                        <span className="text-white/25 truncate max-w-[80px]">{action.target}</span>
                      )}
                      <span className={cn(
                        'flex-shrink-0 w-1.5 h-1.5 rounded-full',
                        action.success ? 'bg-neon-green/60' : 'bg-red-500/60'
                      )} />
                    </button>
                  ))}
                  {allActions.length === 0 && (
                    <p className="text-white/30 text-center py-8">No actions recorded</p>
                  )}
                </div>
              </GlassCard>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Helper ────────────────────────────────────────────────────────────────────

function ActionField({ label, value, mono, span2 }: { label: string; value: string; mono?: boolean; span2?: boolean }) {
  return (
    <div className={span2 ? 'col-span-2' : ''}>
      <span className="block text-xs text-white/35 uppercase tracking-wider mb-0.5">{label}</span>
      <span className={cn('text-sm font-medium text-white break-all', mono && 'font-mono')}>{value}</span>
    </div>
  );
}
