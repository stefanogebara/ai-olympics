import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import {
  Bot,
  Trophy,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  Zap,
  Clock,
  Users,
  DollarSign,
  AlertCircle,
  Target
} from 'lucide-react';

interface AgentMatchup {
  id: string;
  title: string;
  description: string;
  taskType: string;
  agents: Array<{
    id: string;
    name: string;
    provider: 'claude' | 'gpt4' | 'gemini';
    odds: number;
    betsCount: number;
    totalBets: number;
  }>;
  status: 'upcoming' | 'live' | 'completed';
  startsAt?: string;
  endsAt?: string;
  winner?: string;
  totalPool: number;
}

interface BetModalProps {
  matchup: AgentMatchup;
  agentId: string;
  onClose: () => void;
  onSubmit: (amount: number) => void;
}

const PROVIDER_COLORS = {
  claude: { bg: 'bg-orange-500/20', text: 'text-orange-400', border: 'border-orange-500/30' },
  gpt4: { bg: 'bg-green-500/20', text: 'text-green-400', border: 'border-green-500/30' },
  gemini: { bg: 'bg-blue-500/20', text: 'text-blue-400', border: 'border-blue-500/30' }
};

import { API_BASE } from '../../lib/api';

function BetModal({ matchup, agentId, onClose, onSubmit }: BetModalProps) {
  const [amount, setAmount] = useState(100);
  const agent = matchup.agents.find(a => a.id === agentId);
  const modalRef = useRef<HTMLDivElement>(null);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Focus trap
  useEffect(() => {
    const modal = modalRef.current;
    if (!modal) return;
    const focusable = modal.querySelectorAll<HTMLElement>('button, input, [tabindex]:not([tabindex="-1"])');
    if (focusable.length > 0) focusable[0].focus();
  }, []);

  if (!agent) return null;

  const potentialPayout = amount / agent.odds;
  const providerStyle = PROVIDER_COLORS[agent.provider];

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4"
      role="dialog"
      aria-modal="true"
      aria-label="Place your bet"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        ref={modalRef}
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md"
      >
        <GlassCard className="p-6">
          <h3 className="text-xl font-bold text-white mb-4">Place Your Bet</h3>

          <div className={`p-4 rounded-lg ${providerStyle.bg} ${providerStyle.border} border mb-4`}>
            <div className="flex items-center gap-3">
              <Bot size={24} className={providerStyle.text} />
              <div>
                <div className={`font-semibold ${providerStyle.text}`}>{agent.name}</div>
                <div className="text-sm text-white/60">{matchup.title}</div>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <label className="block text-sm text-white/60 mb-2">Bet Amount (M$)</label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(Math.max(1, parseInt(e.target.value) || 0))}
              min={1}
              max={1000}
              className="w-full px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-neon-cyan"
            />
            <div className="flex gap-2 mt-2">
              {[50, 100, 250, 500].map((preset) => (
                <button
                  key={preset}
                  onClick={() => setAmount(preset)}
                  className="flex-1 py-1 px-2 text-xs bg-white/5 border border-white/10 rounded hover:bg-white/10 text-white/60"
                >
                  M${preset}
                </button>
              ))}
            </div>
            <p className="text-[10px] text-white/30 mt-1">Virtual currency only — no real money involved.</p>
          </div>

          <div className="bg-white/5 rounded-lg p-4 mb-6">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-white/60">Current Odds</span>
              <span className="text-white font-mono">{(agent.odds * 100).toFixed(0)}%</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-white/60">Potential Payout</span>
              <span className="text-neon-cyan font-bold">M${potentialPayout.toFixed(0)}</span>
            </div>
          </div>

          <div className="flex gap-3">
            <NeonButton variant="secondary" onClick={onClose} className="flex-1">
              Cancel
            </NeonButton>
            <NeonButton onClick={() => onSubmit(amount)} className="flex-1">
              Place Bet
            </NeonButton>
          </div>
        </GlassCard>
      </motion.div>
    </div>
  );
}

export function MetaMarkets() {
  const { user, isAuthenticated, session } = useAuthStore();
  const [matchups, setMatchups] = useState<AgentMatchup[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBet, setSelectedBet] = useState<{ matchup: AgentMatchup; agentId: string } | null>(null);
  const [filter, setFilter] = useState<'all' | 'upcoming' | 'live' | 'completed'>('all');

  useEffect(() => {
    loadMatchups();
  }, []);

  const loadMatchups = async () => {
    setLoading(true);
    try {
      const response = await fetch(`${API_BASE}/api/predictions/meta-markets`);
      if (response.ok) {
        const data = await response.json();
        setMatchups(data.matchups || data);
      } else {
        setMatchups([]);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading matchups:', error);
      setMatchups([]);
    } finally {
      setLoading(false);
    }
  };

  const placeBet = async (amount: number) => {
    if (!selectedBet || !isAuthenticated) return;

    try {
      const response = await fetch(`${API_BASE}/api/user/bets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`
        },
        body: JSON.stringify({
          marketId: `meta-${selectedBet.matchup.id}`,
          outcome: selectedBet.agentId,
          amount
        })
      });

      if (response.ok) {
        // Refresh matchups
        loadMatchups();
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error placing bet:', error);
    }

    setSelectedBet(null);
  };

  const filteredMatchups = matchups.filter(m =>
    filter === 'all' || m.status === filter
  );

  const formatTime = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = date.getTime() - now.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 0) return 'Started';
    if (diffMins < 60) return `Starts in ${diffMins}m`;
    if (diffMins < 1440) return `Starts in ${Math.floor(diffMins / 60)}h`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-16 lg:py-20 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-magenta/10 border border-neon-magenta/30 mb-6">
                <Zap className="w-4 h-4 text-neon-magenta" />
                <span className="text-sm text-neon-magenta font-medium">Meta-Predictions</span>
              </div>

              <h1 className="text-4xl md:text-5xl lg:text-6xl font-display font-bold mb-6">
                <NeonText variant="gradient" className="animate-gradient" glow>
                  AI Competition Betting
                </NeonText>
              </h1>

              <p className="text-lg md:text-xl text-white/60 mb-8 max-w-2xl mx-auto">
                Bet on which AI agent will perform best in upcoming competitions.
                Watch live matchups and win based on agent performance.
              </p>

              <NeonButton
                onClick={loadMatchups}
                icon={<RefreshCw size={18} className={loading ? 'animate-spin' : ''} />}
                disabled={loading}
                size="lg"
              >
                Refresh Markets
              </NeonButton>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-3 gap-4 sm:gap-8 max-w-2xl mx-auto mt-12"
            >
              {[
                { value: matchups.filter(m => m.status === 'live').length.toString(), label: 'Live Markets', icon: Zap, color: 'text-green-400' },
                { value: `M$${matchups.reduce((sum, m) => sum + m.totalPool, 0).toLocaleString()}`, label: 'Total Pool', icon: DollarSign, color: 'text-neon-cyan' },
                { value: '3', label: 'AI Agents', icon: Bot, color: 'text-neon-magenta' },
              ].map((stat) => (
                <div key={stat.label} className="text-center">
                  <div className="flex items-center justify-center gap-2 mb-1">
                    <stat.icon size={20} className={stat.color} />
                    <span className={`text-2xl md:text-3xl font-display font-bold ${stat.color}`}>{stat.value}</span>
                  </div>
                  <p className="text-sm text-white/50">{stat.label}</p>
                </div>
              ))}
            </motion.div>
          </div>
        </div>
      </section>

      {/* Markets Section */}
      <section className="py-12 bg-cyber-navy/30">
        <div className="container mx-auto px-4">

          {/* Section Header */}
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-display font-bold mb-4">
              Active <NeonText variant="magenta" glow>Matchups</NeonText>
            </h2>
            <p className="text-white/60 max-w-xl mx-auto">
              Choose your favorite AI agent and place your bets
            </p>
          </div>

          {/* Filters */}
          <div className="flex justify-center gap-2 mb-8">
            {(['all', 'live', 'upcoming', 'completed'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setFilter(status)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  filter === status
                    ? 'bg-neon-magenta/20 border border-neon-magenta/50 text-neon-magenta'
                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                }`}
              >
                {status === 'live' && <Zap size={14} className="inline mr-1" />}
                {status.charAt(0).toUpperCase() + status.slice(1)}
              </button>
            ))}
          </div>

          {/* Matchups Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="w-12 h-12 border-4 border-neon-magenta/30 border-t-neon-magenta rounded-full animate-spin" />
            </div>
          ) : filteredMatchups.length === 0 ? (
            <GlassCard className="p-12 text-center">
              <Bot size={48} className="mx-auto mb-4 text-white/20" />
              <h3 className="text-lg font-semibold text-white mb-2">No matchups found</h3>
              <p className="text-white/60">Check back later for upcoming AI competitions</p>
            </GlassCard>
          ) : (
            <div className="space-y-6">
              <AnimatePresence>
                {filteredMatchups.map((matchup, index) => (
                  <motion.div
                    key={matchup.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: index * 0.1 }}
                  >
                    <GlassCard className="p-6">
                      {/* Matchup Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-xl font-semibold text-white">{matchup.title}</h3>
                            <Badge className={
                              matchup.status === 'live' ? 'bg-green-500/20 text-green-400 animate-pulse' :
                              matchup.status === 'upcoming' ? 'bg-yellow-500/20 text-yellow-400' :
                              'bg-white/10 text-white/60'
                            }>
                              {matchup.status === 'live' && <Zap size={12} className="inline mr-1" />}
                              {matchup.status}
                            </Badge>
                          </div>
                          <p className="text-white/60 text-sm">{matchup.description}</p>
                        </div>
                        <div className="flex items-center gap-4 text-sm">
                          <div className="flex items-center gap-1 text-white/50">
                            <DollarSign size={14} />
                            <span>M${matchup.totalPool.toLocaleString()} pool</span>
                          </div>
                          {matchup.startsAt && matchup.status === 'upcoming' && (
                            <div className="flex items-center gap-1 text-neon-cyan">
                              <Clock size={14} />
                              <span>{formatTime(matchup.startsAt)}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Agents */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {matchup.agents.map((agent) => {
                          const providerStyle = PROVIDER_COLORS[agent.provider];
                          const isWinner = matchup.winner === agent.id;

                          return (
                            <div
                              key={agent.id}
                              className={`p-4 rounded-lg border transition-all ${
                                isWinner
                                  ? 'bg-green-500/10 border-green-500/50'
                                  : `${providerStyle.bg} ${providerStyle.border}`
                              }`}
                            >
                              <div className="flex items-center gap-3 mb-3">
                                <div className={`w-10 h-10 rounded-full ${providerStyle.bg} flex items-center justify-center`}>
                                  <Bot size={20} className={providerStyle.text} />
                                </div>
                                <div>
                                  <div className={`font-semibold ${providerStyle.text}`}>
                                    {agent.name}
                                    {isWinner && <Trophy size={14} className="inline ml-2 text-yellow-400" />}
                                  </div>
                                  <div className="text-xs text-white/50 capitalize">{agent.provider}</div>
                                </div>
                              </div>

                              <div className="flex justify-between items-center text-sm mb-3">
                                <span className="text-white/60">Odds</span>
                                <span className="text-white font-mono text-lg">{(agent.odds * 100).toFixed(0)}%</span>
                              </div>

                              {/* Odds bar */}
                              <div className="h-2 bg-white/10 rounded-full overflow-hidden mb-3">
                                <div
                                  className={`h-full ${providerStyle.bg.replace('/20', '/50')} rounded-full`}
                                  style={{ width: `${agent.odds * 100}%` }}
                                />
                              </div>

                              <div className="flex justify-between items-center text-xs text-white/40 mb-3">
                                <span>{agent.betsCount} bets</span>
                                <span>M${agent.totalBets.toLocaleString()}</span>
                              </div>

                              {matchup.status !== 'completed' && (
                                <NeonButton
                                  size="sm"
                                  variant="secondary"
                                  className="w-full"
                                  onClick={() => setSelectedBet({ matchup, agentId: agent.id })}
                                  disabled={!isAuthenticated}
                                >
                                  Bet on {agent.name.split(' ')[0]}
                                </NeonButton>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!isAuthenticated && matchup.status !== 'completed' && (
                        <div className="flex items-center justify-center gap-2 text-yellow-400 text-sm mt-4">
                          <AlertCircle size={16} />
                          <span>Sign in to place bets</span>
                        </div>
                      )}
                    </GlassCard>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </div>
      </section>

      {/* Bet Modal */}
      {selectedBet && (
        <BetModal
          matchup={selectedBet.matchup}
          agentId={selectedBet.agentId}
          onClose={() => setSelectedBet(null)}
          onSubmit={placeBet}
        />
      )}
    </div>
  );
}

export default MetaMarkets;
