import { useState, useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonText, NeonButton } from '../../components/ui';
import { SEO } from '../../components/SEO';
import { ArrowLeft, Play, Pause, SkipForward, SkipBack, ChevronRight } from 'lucide-react';
import { cn } from '../../lib/utils';

const API_URL = import.meta.env.VITE_API_URL || '';

// ============================================================================
// Types
// ============================================================================

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

// ============================================================================
// Data fetching
// ============================================================================

async function fetchReplay(id: string): Promise<ReplayData> {
  const res = await fetch(`${API_URL}/api/competitions/${id}/replay`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || 'Failed to load replay');
  }
  return res.json() as Promise<ReplayData>;
}

// ============================================================================
// Main Component
// ============================================================================

export function ReplayViewer() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<ReplayData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!id) return;
    setIsLoading(true);
    setError(null);
    fetchReplay(id)
      .then(setData)
      .catch(setError)
      .finally(() => setIsLoading(false));
  }, [id]);

  // Unique agent IDs across all entries
  const agentIds = data
    ? Array.from(new Set(data.agents.map(e => e.agent_id)))
    : [];

  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [playing, setPlaying] = useState(false);
  const [step, setStep] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Set first agent when data loads
  useEffect(() => {
    if (agentIds.length > 0 && selectedAgent === null) {
      setSelectedAgent(agentIds[0]);
      setStep(0);
    }
  }, [agentIds.length]);

  // Reset step when agent changes
  useEffect(() => {
    setStep(0);
    setPlaying(false);
  }, [selectedAgent]);

  // Collect all actions for the selected agent (across all events)
  const allActions: (ReplayAction & { event_id: string })[] = selectedAgent && data
    ? data.agents
        .filter(e => e.agent_id === selectedAgent)
        .flatMap(e => e.action_log.map(a => ({ ...a, event_id: e.event_id })))
    : [];

  const totalSteps = allActions.length;
  const currentAction = allActions[step] ?? null;

  // Auto-play interval
  useEffect(() => {
    if (playing) {
      intervalRef.current = setInterval(() => {
        setStep(prev => {
          if (prev >= totalSteps - 1) {
            setPlaying(false);
            return prev;
          }
          return prev + 1;
        });
      }, 600);
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [playing, totalSteps]);

  // Short agent label (first 8 chars)
  const shortId = (id: string) => id.slice(0, 8);

  return (
    <div className="container mx-auto px-4 py-8">
      <SEO
        title="Replay Viewer"
        description="Watch recorded AI agent competition replays"
        path={`/competitions/${id}/replay`}
      />

      {/* Back link */}
      <div className="mb-6">
        <Link
          to={`/competitions/${id}`}
          className="inline-flex items-center gap-2 text-white/60 hover:text-neon-cyan transition-colors text-sm"
        >
          <ArrowLeft size={16} />
          Back to Competition
        </Link>
      </div>

      {/* Title */}
      <div className="mb-8">
        <h1 className="text-3xl font-display font-bold mb-2">
          <NeonText variant="cyan" glow>Competition Replay</NeonText>
        </h1>
        <p className="text-white/60">Watch recorded agent actions from this competition</p>
      </div>

      {/* Loading */}
      {isLoading && (
        <GlassCard className="p-12 text-center">
          <div className="w-12 h-12 border-2 border-neon-cyan border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60">Loading replay data...</p>
        </GlassCard>
      )}

      {/* Error */}
      {error && (
        <GlassCard className="p-12 text-center">
          <p className="text-red-400 font-semibold mb-2">No replay available</p>
          <p className="text-white/50 text-sm">
            {error instanceof Error ? error.message : 'Replay data not found for this competition.'}
          </p>
        </GlassCard>
      )}

      {/* Replay UI */}
      {data && !isLoading && (
        <div className="space-y-6">
          {/* Agent Selector */}
          <GlassCard className="p-4">
            <h2 className="text-sm font-semibold text-white/60 uppercase tracking-wider mb-3">Select Agent</h2>
            <div className="flex flex-wrap gap-2">
              {agentIds.map(agentId => (
                <button
                  key={agentId}
                  onClick={() => setSelectedAgent(agentId)}
                  className={cn(
                    'px-4 py-2 rounded-lg text-sm font-mono font-semibold transition-all border',
                    selectedAgent === agentId
                      ? 'border-neon-cyan bg-neon-cyan/10 text-neon-cyan'
                      : 'border-white/10 bg-white/5 text-white/60 hover:border-neon-cyan/40 hover:text-white'
                  )}
                >
                  {shortId(agentId)}
                </button>
              ))}
            </div>
          </GlassCard>

          {/* Playback Controls */}
          <GlassCard className="p-6">
            <div className="flex flex-col gap-4">
              {/* Scrubber */}
              <div className="flex items-center gap-3">
                <span className="text-xs font-mono text-white/40 w-8 text-right">{step + 1}</span>
                <input
                  type="range"
                  min={0}
                  max={Math.max(0, totalSteps - 1)}
                  value={step}
                  onChange={e => {
                    setPlaying(false);
                    setStep(Number(e.target.value));
                  }}
                  disabled={totalSteps === 0}
                  className="flex-1 h-2 accent-neon-cyan cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                />
                <span className="text-xs font-mono text-white/40 w-8">{totalSteps}</span>
              </div>

              {/* Buttons */}
              <div className="flex items-center justify-center gap-3">
                <NeonButton
                  variant="ghost"
                  size="sm"
                  icon={<SkipBack size={16} />}
                  onClick={() => { setPlaying(false); setStep(prev => Math.max(0, prev - 1)); }}
                  disabled={step === 0 || totalSteps === 0}
                >
                  Back
                </NeonButton>

                <button
                  onClick={() => setPlaying(prev => !prev)}
                  disabled={totalSteps === 0}
                  className={cn(
                    'flex items-center gap-2 px-6 py-2.5 rounded-lg font-semibold text-sm transition-all',
                    'bg-neon-cyan text-black hover:bg-neon-cyan/90 disabled:opacity-40 disabled:cursor-not-allowed'
                  )}
                >
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                  {playing ? 'Pause' : 'Play'}
                </button>

                <NeonButton
                  variant="ghost"
                  size="sm"
                  icon={<SkipForward size={16} />}
                  onClick={() => { setPlaying(false); setStep(prev => Math.min(totalSteps - 1, prev + 1)); }}
                  disabled={step >= totalSteps - 1 || totalSteps === 0}
                >
                  Forward
                </NeonButton>
              </div>
            </div>
          </GlassCard>

          {/* Current Action Display */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
              <ChevronRight size={18} className="text-neon-cyan" />
              Current Action
              <span className="text-sm text-white/40 font-normal ml-1">
                ({step + 1} / {totalSteps})
              </span>
            </h2>

            <AnimatePresence mode="wait">
              {currentAction ? (
                <motion.div
                  key={step}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.15 }}
                  className="space-y-3"
                >
                  <div className="flex flex-wrap gap-3">
                    <ActionField label="Type" value={currentAction.type} highlight="cyan" />
                    <ActionField
                      label="Status"
                      value={currentAction.success ? 'SUCCESS' : 'FAILED'}
                      highlight={currentAction.success ? 'green' : 'red'}
                    />
                    {currentAction.event_id && (
                      <ActionField label="Event" value={currentAction.event_id} />
                    )}
                  </div>

                  {currentAction.target && (
                    <ActionField label="Target" value={currentAction.target} mono />
                  )}

                  {currentAction.value && (
                    <ActionField label="Value" value={currentAction.value} mono />
                  )}

                  {currentAction.timestamp != null && (
                    <ActionField
                      label="Timestamp"
                      value={`${(currentAction.timestamp / 1000).toFixed(2)}s`}
                    />
                  )}

                  {currentAction.duration != null && (
                    <ActionField
                      label="Duration"
                      value={`${currentAction.duration}ms`}
                    />
                  )}
                </motion.div>
              ) : (
                <p className="text-white/40 text-center py-6">
                  {totalSteps === 0 ? 'No actions recorded for this agent' : 'Select a step to view'}
                </p>
              )}
            </AnimatePresence>
          </GlassCard>

          {/* Action Log Timeline */}
          <GlassCard className="p-6">
            <h2 className="text-lg font-display font-bold mb-4">Action Log</h2>
            <div className="space-y-1 max-h-72 overflow-y-auto pr-1">
              {allActions.map((action, i) => (
                <button
                  key={i}
                  onClick={() => { setPlaying(false); setStep(i); }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-left transition-all',
                    i === step
                      ? 'bg-neon-cyan/10 border border-neon-cyan/30'
                      : 'hover:bg-white/5 border border-transparent'
                  )}
                >
                  <span className="text-white/30 font-mono text-xs w-6 text-right shrink-0">{i + 1}</span>
                  <span className={cn(
                    'font-semibold',
                    i === step ? 'text-neon-cyan' : 'text-white/70'
                  )}>
                    {action.type}
                  </span>
                  {action.target && (
                    <span className="text-white/40 truncate flex-1">{action.target}</span>
                  )}
                  <span className={cn(
                    'text-xs px-1.5 py-0.5 rounded shrink-0',
                    action.success ? 'bg-neon-green/20 text-neon-green' : 'bg-red-500/20 text-red-400'
                  )}>
                    {action.success ? 'OK' : 'ERR'}
                  </span>
                </button>
              ))}
              {allActions.length === 0 && (
                <p className="text-white/40 text-center py-8">No actions recorded</p>
              )}
            </div>
          </GlassCard>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Helper Components
// ============================================================================

function ActionField({
  label,
  value,
  highlight,
  mono,
}: {
  label: string;
  value: string;
  highlight?: 'cyan' | 'green' | 'red';
  mono?: boolean;
}) {
  const colorMap: Record<string, string> = {
    cyan: 'text-neon-cyan',
    green: 'text-neon-green',
    red: 'text-red-400',
  };

  return (
    <div className="flex flex-col gap-0.5">
      <span className="text-xs text-white/40 uppercase tracking-wider">{label}</span>
      <span className={cn(
        'text-sm font-medium break-all',
        highlight ? colorMap[highlight] : 'text-white',
        mono && 'font-mono'
      )}>
        {value}
      </span>
    </div>
  );
}
