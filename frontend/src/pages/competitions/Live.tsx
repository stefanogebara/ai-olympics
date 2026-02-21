import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';
import { useCompetition } from '../../hooks/useCompetition';
import { formatDuration, formatScore, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonText, Badge } from '../../components/ui';
import { VotingPanel } from '../../components/competition/VotingPanel';

type MobileTab = 'agents' | 'leaderboard' | 'feed';

// This is essentially the original App.tsx content, now as a page component
export function LiveView() {
  const { id } = useParams();
  useSocket(id);
  const [mobileTab, setMobileTab] = useState<MobileTab>('agents');

  const {
    competitionName,
    currentEventName,
    elapsedTime,
    status,
    isConnected,
    sortedAgents,
    leaderboard,
    commentary,
    recentActions,
    agents,
  } = useCompetition();

  // ── Shared panel content ──────────────────────────────────────────────────

  const agentsPanel = (
    <GlassCard className="p-4">
      <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-neon-cyan rounded-full" />
        Agents
      </h2>
      <div className="space-y-3">
        <AnimatePresence>
          {sortedAgents.map((agent) => (
            <AgentCard key={agent.id} agent={agent} />
          ))}
        </AnimatePresence>
        {sortedAgents.length === 0 && (
          <p className="text-center text-white/40 py-8">Waiting for agents...</p>
        )}
      </div>
    </GlassCard>
  );

  const leaderboardPanel = (
    <GlassCard className="p-4 neon-border">
      <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
        <span className="w-2 h-2 bg-neon-magenta rounded-full" />
        Leaderboard
      </h2>
      <div className="space-y-2" aria-live="polite" aria-atomic="false">
        <AnimatePresence>
          {leaderboard.map((entry, index) => (
            <LeaderboardEntry key={entry.agentId} entry={entry} rank={index + 1} />
          ))}
        </AnimatePresence>
        {leaderboard.length === 0 && (
          <p className="text-center text-white/40 py-8">No scores yet...</p>
        )}
      </div>
    </GlassCard>
  );

  const feedPanel = (
    <div className="space-y-6">
      {/* Commentary */}
      <GlassCard className="p-4">
        <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-neon-green rounded-full" />
          Commentary
        </h2>
        <div className="space-y-3 max-h-64 overflow-y-auto" aria-live="polite" aria-atomic="false">
          <AnimatePresence>
            {commentary.map((item) => {
              const emotionStyles: Record<string, string> = {
                neutral: 'border-white/20',
                excited: 'border-neon-cyan',
                tense: 'border-yellow-500',
                celebratory: 'border-neon-green',
                disappointed: 'border-red-500',
              };
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'p-3 rounded-lg bg-white/5 border-l-2',
                    emotionStyles[item.emotion] || emotionStyles.neutral
                  )}
                >
                  <p className="text-sm">{item.text}</p>
                  <p className="text-xs text-white/40 mt-1">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {commentary.length === 0 && (
            <p className="text-center text-white/40 py-4">Waiting for commentary...</p>
          )}
        </div>
      </GlassCard>

      {/* Action Feed */}
      <GlassCard className="p-4">
        <h2 className="text-lg font-display font-bold mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-neon-blue rounded-full" />
          Action Feed
        </h2>
        <div className="space-y-2 max-h-64 overflow-y-auto">
          <AnimatePresence>
            {recentActions.map((action) => {
              const agent = agents[action.agentId];
              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-3 p-2 rounded-lg bg-white/5 text-sm"
                >
                  <div
                    className="w-6 h-6 rounded flex items-center justify-center text-xs font-bold"
                    style={{
                      backgroundColor: `${agent?.color || '#666'}20`,
                      color: agent?.color || '#666',
                    }}
                  >
                    {agent?.name?.charAt(0) || '?'}
                  </div>
                  <div className="flex-1">
                    <span className="text-white/80">{action.type}</span>
                    {action.target && (
                      <span className="text-white/40 ml-1">: {action.target}</span>
                    )}
                  </div>
                  <span
                    className={cn(
                      'text-xs px-2 py-0.5 rounded',
                      action.success ? 'bg-neon-green/20 text-neon-green' : 'bg-red-500/20 text-red-500'
                    )}
                  >
                    {action.success ? 'OK' : 'FAIL'}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {recentActions.length === 0 && (
            <p className="text-center text-white/40 py-4">Waiting for actions...</p>
          )}
        </div>
      </GlassCard>

      {/* Spectator Voting */}
      {id && (
        <VotingPanel
          competitionId={id}
          agents={sortedAgents.map((a) => ({ id: a.id, name: a.name, color: a.color }))}
        />
      )}
    </div>
  );

  // ── Mobile tab panels map ─────────────────────────────────────────────────

  const tabPanels: Record<MobileTab, React.ReactNode> = {
    agents: agentsPanel,
    leaderboard: leaderboardPanel,
    feed: feedPanel,
  };

  const mobileTabs: { id: MobileTab; label: string; dotColor: string }[] = [
    { id: 'agents', label: 'Agents', dotColor: 'bg-neon-cyan' },
    { id: 'leaderboard', label: 'Leaderboard', dotColor: 'bg-neon-magenta' },
    { id: 'feed', label: 'Feed', dotColor: 'bg-neon-green' },
  ];

  return (
    <div className="container mx-auto px-4 py-6">
      {/* Competition Header */}
      <GlassCard className="p-6 mb-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Title & Event */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center">
              <span className="text-2xl font-display font-bold text-black">AI</span>
            </div>
            <div>
              <h1 className="text-2xl font-display font-bold neon-text">
                {competitionName || 'AI Olympics'}
              </h1>
              <p className="text-white/60">{currentEventName || 'Waiting for event...'}</p>
            </div>
          </div>

          {/* Timer & Status */}
          <div className="flex items-center gap-6">
            {/* Timer */}
            <div className="text-right">
              <p className="text-sm text-white/60">Elapsed Time</p>
              <p className="text-3xl font-mono font-bold text-neon-cyan">
                {formatDuration(elapsedTime)}
              </p>
            </div>

            {/* Status */}
            <div className="flex items-center gap-2" aria-live="polite">
              {status === 'running' && (
                <span className="relative flex h-3 w-3">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-75" />
                  <span className="relative inline-flex rounded-full h-3 w-3 bg-neon-green" />
                </span>
              )}
              <span
                className={cn(
                  'px-3 py-1 rounded-full text-sm font-semibold uppercase',
                  status === 'running' && 'bg-neon-green/20 text-neon-green',
                  status === 'completed' && 'bg-neon-magenta/20 text-neon-magenta',
                  status === 'idle' && 'bg-white/10 text-white/60'
                )}
              >
                {status}
              </span>
            </div>

            {/* Connection Status */}
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  'w-2 h-2 rounded-full',
                  isConnected ? 'bg-neon-green' : 'bg-red-500'
                )}
              />
              <span className="text-sm text-white/60">
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
          </div>
        </div>
      </GlassCard>

      {/* ── Mobile Layout (< md) ── */}
      <div className="md:hidden">
        {/* Tab Bar */}
        <div className="flex border border-white/10 rounded-xl overflow-hidden mb-4">
          {mobileTabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setMobileTab(tab.id)}
              className={cn(
                'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all',
                mobileTab === tab.id
                  ? 'bg-neon-cyan/10 text-neon-cyan border-b-2 border-neon-cyan'
                  : 'text-white/50 hover:text-white/80'
              )}
              aria-selected={mobileTab === tab.id}
            >
              <span className={cn('w-2 h-2 rounded-full', tab.dotColor)} />
              {tab.label}
            </button>
          ))}
        </div>

        {/* Active Panel */}
        <AnimatePresence mode="wait">
          <motion.div
            key={mobileTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.15 }}
          >
            {tabPanels[mobileTab]}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* ── Desktop Layout (≥ md): original 3-column grid unchanged ── */}
      <div className="hidden md:grid grid-cols-12 gap-4 md:gap-6">
        {/* Left Column - Agents */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4">
          {agentsPanel}
        </div>

        {/* Center Column - Leaderboard */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4">
          {leaderboardPanel}
        </div>

        {/* Right Column - Feed & Commentary */}
        <div className="col-span-12 md:col-span-6 lg:col-span-4">
          {feedPanel}
        </div>
      </div>
    </div>
  );
}

// Agent Card Component
function AgentCard({
  agent,
}: {
  agent: {
    id: string;
    name: string;
    status: string;
    progress: number;
    score: number;
    currentAction?: string;
    color: string;
  };
}) {
  const statusColors: Record<string, string> = {
    idle: 'bg-white/20',
    initializing: 'bg-yellow-500/20 text-yellow-500',
    running: 'bg-neon-green/20 text-neon-green',
    completed: 'bg-neon-cyan/20 text-neon-cyan',
    failed: 'bg-red-500/20 text-red-500',
    timeout: 'bg-orange-500/20 text-orange-500',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="p-4 rounded-lg bg-white/5 border border-white/10"
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center text-lg font-bold"
            style={{ backgroundColor: `${agent.color || '#6B7280'}20`, color: agent.color || '#6B7280' }}
          >
            {(agent.name || '?').charAt(0)}
          </div>
          <div>
            <p className="font-semibold">{agent.name || 'Unknown Agent'}</p>
            <span
              className={cn(
                'text-xs px-2 py-0.5 rounded-full',
                statusColors[agent.status] || statusColors.idle
              )}
            >
              {agent.status}
            </span>
          </div>
        </div>
        <div className="text-right">
          <p className="text-2xl font-mono font-bold" style={{ color: agent.color }}>
            {formatScore(agent.score || 0)}
          </p>
          <p className="text-xs text-white/40">points</p>
        </div>
      </div>

      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: agent.color || '#6B7280' }}
          initial={{ width: 0 }}
          animate={{ width: `${agent.progress || 0}%` }}
          transition={{ duration: 0.5 }}
        />
      </div>

      {agent.currentAction && (
        <p className="mt-2 text-sm text-white/60 truncate">{agent.currentAction}</p>
      )}
    </motion.div>
  );
}

// Leaderboard Entry Component
function LeaderboardEntry({
  entry,
  rank,
}: {
  entry: {
    agentId: string;
    agentName: string;
    totalScore: number;
    eventsWon: number;
    eventsCompleted: number;
  };
  rank: number;
}) {
  const rankColors: Record<number, string> = {
    1: 'from-yellow-500 to-amber-600',
    2: 'from-gray-300 to-gray-400',
    3: 'from-amber-600 to-amber-700',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex items-center gap-4 p-3 rounded-lg bg-white/5"
    >
      <div
        className={cn(
          'w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm',
          rank <= 3
            ? `bg-gradient-to-br ${rankColors[rank]} text-black`
            : 'bg-white/10 text-white/60'
        )}
      >
        {rank}
      </div>

      <div className="flex-1">
        <p className="font-semibold">{entry.agentName}</p>
        <p className="text-xs text-white/40">
          {entry.eventsWon} wins / {entry.eventsCompleted} events
        </p>
      </div>

      <div className="text-right">
        <p className="text-xl font-mono font-bold text-neon-cyan">
          {formatScore(entry.totalScore)}
        </p>
      </div>
    </motion.div>
  );
}
