import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useSocket } from '../../hooks/useSocket';
import { useCompetition } from '../../hooks/useCompetition';
import { formatDuration, formatScore, cn } from '../../lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonText, Badge } from '../../components/ui';
import { VotingPanel } from '../../components/competition/VotingPanel';
import { Zap, Trophy, MessageSquare, Activity, Timer, ArrowLeft } from 'lucide-react';

type MobileTab = 'agents' | 'leaderboard' | 'feed';

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
    isReconnecting,
    sortedAgents,
    leaderboard,
    commentary,
    recentActions,
    agents,
  } = useCompetition();

  // ── Pre-start waiting screen ──────────────────────────────────────────────
  if (status === 'idle' && !isConnected && !isReconnecting) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-6 px-4">
        <Link to={`/competitions/${id}`} className="flex items-center gap-2 text-white/40 hover:text-white/70 text-sm transition-colors self-start absolute top-6 left-6">
          <ArrowLeft size={16} /> Back to Lobby
        </Link>
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center">
          <Timer size={32} className="text-black" />
        </div>
        <div className="text-center">
          <h2 className="text-2xl font-display font-bold text-white mb-2">Waiting for competition to start</h2>
          <p className="text-white/50 text-sm">The competition will begin shortly. This page will update automatically.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-cyan opacity-60" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-cyan" />
          </span>
          <span className="text-sm text-white/40">Connecting to live stream...</span>
        </div>
      </div>
    );
  }

  // ── Panels ───────────────────────────────────────────────────────────────

  const agentsPanel = (
    <GlassCard className="p-5">
      <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
        <Zap size={13} className="text-neon-cyan" />
        Agents
      </h2>
      <div className="space-y-3">
        <AnimatePresence>
          {sortedAgents.map((agent, i) => (
            <AgentCard key={agent.id} agent={agent} rank={i + 1} />
          ))}
        </AnimatePresence>
        {sortedAgents.length === 0 && (
          <p className="text-center text-white/30 py-10 text-sm">Waiting for agents...</p>
        )}
      </div>
    </GlassCard>
  );

  const leaderboardPanel = (
    <GlassCard className="p-5">
      <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
        <Trophy size={13} className="text-neon-magenta" />
        Leaderboard
      </h2>
      <div className="space-y-2" aria-live="polite" aria-atomic="false">
        <AnimatePresence>
          {leaderboard.map((entry, index) => (
            <LeaderboardEntry key={entry.agentId} entry={entry} rank={index + 1} />
          ))}
        </AnimatePresence>
        {leaderboard.length === 0 && (
          <p className="text-center text-white/30 py-10 text-sm">No scores yet...</p>
        )}
      </div>
    </GlassCard>
  );

  const feedPanel = (
    <div className="space-y-4">
      {/* Commentary */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
          <MessageSquare size={13} className="text-neon-green" />
          Commentary
        </h2>
        <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1" aria-live="polite" aria-atomic="false">
          <AnimatePresence>
            {commentary.map((item) => {
              const emotionBorder: Record<string, string> = {
                neutral:      'border-white/15',
                excited:      'border-neon-cyan/60',
                tense:        'border-yellow-500/60',
                celebratory:  'border-neon-green/60',
                disappointed: 'border-red-500/60',
              };
              const emotionGlow: Record<string, string> = {
                neutral:      '',
                excited:      'shadow-[0_0_12px_rgba(0,245,255,0.08)]',
                tense:        'shadow-[0_0_12px_rgba(234,179,8,0.08)]',
                celebratory:  'shadow-[0_0_12px_rgba(0,255,136,0.08)]',
                disappointed: 'shadow-[0_0_12px_rgba(239,68,68,0.08)]',
              };
              return (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={cn(
                    'p-3 rounded-lg bg-white/4 border-l-2',
                    emotionBorder[item.emotion] || emotionBorder.neutral,
                    emotionGlow[item.emotion] || ''
                  )}
                >
                  <p className="text-sm text-white/80 leading-relaxed">
                    {item.text.replace(/^#+\s*/gm, '').replace(/\*\*/g, '').trim()}
                  </p>
                  <p className="text-xs text-white/30 mt-1.5">
                    {new Date(item.timestamp).toLocaleTimeString()}
                  </p>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {commentary.length === 0 && (
            <p className="text-center text-white/30 py-6 text-sm">Commentary will appear here...</p>
          )}
        </div>
      </GlassCard>

      {/* Action Feed */}
      <GlassCard className="p-5">
        <h2 className="text-sm font-display font-bold uppercase tracking-wider text-white/50 mb-4 flex items-center gap-2">
          <Activity size={13} className="text-neon-blue" />
          Action Feed
        </h2>
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          <AnimatePresence>
            {recentActions.map((action) => {
              const agent = agents[action.agentId];
              return (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-lg bg-white/4 text-sm"
                >
                  <div
                    className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{
                      backgroundColor: `${agent?.color || '#666'}20`,
                      color: agent?.color || '#666',
                      border: `1px solid ${agent?.color || '#666'}30`,
                    }}
                  >
                    {agent?.name?.charAt(0) || '?'}
                  </div>
                  <span className="text-white/70 font-mono text-xs flex-1 truncate">
                    <span className="text-white/90 font-semibold">{action.type}</span>
                    {action.target && <span className="text-white/35 ml-1">→ {action.target.slice(0, 30)}</span>}
                  </span>
                  <span
                    className={cn(
                      'text-xs px-1.5 py-0.5 rounded font-mono flex-shrink-0',
                      action.success ? 'bg-neon-green/15 text-neon-green' : 'bg-red-500/15 text-red-400'
                    )}
                  >
                    {action.success ? 'OK' : 'ERR'}
                  </span>
                </motion.div>
              );
            })}
          </AnimatePresence>
          {recentActions.length === 0 && (
            <p className="text-center text-white/30 py-6 text-sm">Actions will appear here...</p>
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

  const mobileTabs: { id: MobileTab; label: string; icon: typeof Zap }[] = [
    { id: 'agents',      label: 'Agents',      icon: Zap },
    { id: 'leaderboard', label: 'Standings',   icon: Trophy },
    { id: 'feed',        label: 'Feed',         icon: Activity },
  ];

  const tabPanels: Record<MobileTab, React.ReactNode> = { agents: agentsPanel, leaderboard: leaderboardPanel, feed: feedPanel };

  return (
    <div className="min-h-screen">
      {/* ── Competition Header ── */}
      <div className="relative overflow-hidden border-b border-white/5">
        <div className="absolute inset-0 bg-gradient-to-r from-neon-cyan/5 via-transparent to-neon-magenta/5 pointer-events-none" />
        <div className="container mx-auto px-4 py-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            {/* Title block */}
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center flex-shrink-0">
                <span className="text-xl font-display font-black text-black">AI</span>
              </div>
              <div>
                <h1 className="text-xl md:text-2xl font-display font-bold text-white leading-tight">
                  {competitionName || 'AI Olympics'}
                </h1>
                <p className="text-sm text-white/50">{currentEventName || 'Waiting for event...'}</p>
              </div>
            </div>

            {/* Right metrics */}
            <div className="flex items-center gap-5">
              {/* Timer */}
              <div className="text-right">
                <p className="text-xs text-white/40 uppercase tracking-wider mb-0.5">Elapsed</p>
                <p className="text-2xl font-mono font-bold text-neon-cyan tabular-nums">
                  {formatDuration(elapsedTime)}
                </p>
              </div>

              <div className="w-px h-10 bg-white/10" />

              {/* Status badge */}
              <div className="flex items-center gap-2" aria-live="polite">
                {status === 'running' && (
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-neon-green opacity-60" />
                    <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-neon-green" />
                  </span>
                )}
                <span
                  className={cn(
                    'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border',
                    status === 'running'   && 'bg-neon-green/10 text-neon-green border-neon-green/30',
                    status === 'completed' && 'bg-neon-magenta/10 text-neon-magenta border-neon-magenta/30',
                    status === 'idle'      && 'bg-white/5 text-white/40 border-white/10'
                  )}
                >
                  {status}
                </span>
              </div>

              <div className="w-px h-10 bg-white/10" />

              {/* Connection dot */}
              <div className="flex items-center gap-1.5" aria-label={isConnected ? 'Connected' : 'Disconnected'}>
                {isReconnecting ? (
                  <svg className="w-3 h-3 animate-spin text-yellow-400" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
                  </svg>
                ) : (
                  <div className={cn('w-2 h-2 rounded-full', isConnected ? 'bg-neon-green' : 'bg-red-500')} />
                )}
                <span className="text-xs text-white/40 hidden sm:inline">
                  {isReconnecting ? 'Reconnecting' : isConnected ? 'Live' : 'Offline'}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Reconnecting banner */}
      <AnimatePresence>
        {isReconnecting && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="flex items-center gap-3 px-4 py-2.5 bg-yellow-500/8 border-b border-yellow-500/20 text-yellow-400"
            role="status"
            aria-live="polite"
          >
            <svg className="w-3.5 h-3.5 animate-spin flex-shrink-0" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4l3-3-3-3v4a8 8 0 00-8 8h4z" />
            </svg>
            <span className="text-sm">Reconnecting — replaying missed events...</span>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="container mx-auto px-4 py-6">
        {/* ── Mobile Tab Bar ── */}
        <div className="md:hidden mb-4">
          <div className="flex border border-white/10 rounded-xl overflow-hidden bg-cyber-elevated/50">
            {mobileTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setMobileTab(tab.id)}
                  className={cn(
                    'flex-1 flex items-center justify-center gap-2 py-3 text-sm font-semibold transition-all',
                    mobileTab === tab.id
                      ? 'bg-neon-cyan/10 text-neon-cyan border-b-2 border-neon-cyan'
                      : 'text-white/40 hover:text-white/70'
                  )}
                  aria-selected={mobileTab === tab.id}
                >
                  <Icon size={14} />
                  {tab.label}
                </button>
              );
            })}
          </div>
          <AnimatePresence mode="wait">
            <motion.div
              key={mobileTab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.15 }}
              className="mt-4"
            >
              {tabPanels[mobileTab]}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Desktop 3-column ── */}
        <div className="hidden md:grid grid-cols-12 gap-5">
          <div className="col-span-4">{agentsPanel}</div>
          <div className="col-span-4">{leaderboardPanel}</div>
          <div className="col-span-4">{feedPanel}</div>
        </div>
      </div>
    </div>
  );
}

// ── Agent Card ────────────────────────────────────────────────────────────────

function AgentCard({
  agent,
  rank,
}: {
  agent: { id: string; name: string; status: string; progress: number; score: number; currentAction?: string; color: string };
  rank: number;
}) {
  const isRunning = agent.status === 'running';
  const isCompleted = agent.status === 'completed';

  const statusLabel: Record<string, string> = {
    idle: 'Idle', initializing: 'Starting', running: 'Racing',
    completed: 'Finished', failed: 'Failed', timeout: 'Timeout',
  };
  const statusColor: Record<string, string> = {
    idle: 'text-white/30', initializing: 'text-yellow-400',
    running: 'text-neon-green', completed: 'text-neon-cyan',
    failed: 'text-red-400', timeout: 'text-orange-400',
  };

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -16 }}
      className={cn(
        'p-4 rounded-xl border transition-all',
        isRunning
          ? 'bg-white/5 border-white/15 shadow-sm'
          : isCompleted
          ? 'bg-white/3 border-white/8'
          : 'bg-white/3 border-white/8'
      )}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          {/* Rank */}
          <div
            className={cn(
              'w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
              rank === 1 ? 'bg-yellow-500/20 text-yellow-400' :
              rank === 2 ? 'bg-gray-400/20 text-gray-300' :
              rank === 3 ? 'bg-amber-700/20 text-amber-500' :
              'bg-white/8 text-white/30'
            )}
          >
            {rank}
          </div>
          {/* Avatar */}
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold"
            style={{ backgroundColor: `${agent.color}18`, border: `1px solid ${agent.color}35`, color: agent.color }}
          >
            {(agent.name || '?').charAt(0)}
          </div>
          <div>
            <p className="font-semibold text-white text-sm leading-tight">{agent.name || 'Unknown'}</p>
            <span className={cn('text-xs font-medium', statusColor[agent.status] || statusColor.idle)}>
              {statusLabel[agent.status] || agent.status}
              {isRunning && <span className="ml-1 inline-block w-1 h-1 rounded-full bg-neon-green animate-pulse align-middle" />}
            </span>
          </div>
        </div>

        {/* Score */}
        <div className="text-right flex-shrink-0">
          <p className="text-xl font-mono font-bold leading-tight tabular-nums" style={{ color: agent.color }}>
            {formatScore(agent.score || 0)}
          </p>
          <p className="text-xs text-white/30">pts</p>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 bg-white/8 rounded-full overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{
            background: isRunning
              ? `linear-gradient(90deg, ${agent.color}, ${agent.color}aa)`
              : agent.color,
            boxShadow: isRunning ? `0 0 8px ${agent.color}60` : 'none',
          }}
          initial={{ width: 0 }}
          animate={{ width: `${agent.progress || 0}%` }}
          transition={{ duration: 0.4 }}
        />
      </div>

      {agent.currentAction && (
        <p className="mt-2 text-xs text-white/40 truncate font-mono">{agent.currentAction}</p>
      )}
    </motion.div>
  );
}

// ── Leaderboard Entry ─────────────────────────────────────────────────────────

function LeaderboardEntry({
  entry,
  rank,
}: {
  entry: { agentId: string; agentName: string; totalScore: number; eventsWon: number; eventsCompleted: number };
  rank: number;
}) {
  const medals = ['🥇', '🥈', '🥉'];

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -16 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 16 }}
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
        rank === 1 ? 'bg-yellow-500/8 border border-yellow-500/20' : 'bg-white/4'
      )}
    >
      <span className="text-lg flex-shrink-0 w-6 text-center">
        {rank <= 3 ? medals[rank - 1] : <span className="text-xs text-white/30 font-mono">#{rank}</span>}
      </span>
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white text-sm truncate">{entry.agentName}</p>
        <p className="text-xs text-white/35">
          {entry.eventsWon}W / {entry.eventsCompleted} events
        </p>
      </div>
      <p className="text-lg font-mono font-bold text-neon-cyan tabular-nums flex-shrink-0">
        {formatScore(entry.totalScore)}
      </p>
    </motion.div>
  );
}
