import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import {
  Wallet,
  TrendingUp,
  TrendingDown,
  RefreshCw,
  ArrowUpRight,
  ArrowDownRight,
  PieChart,
  History,
  Target,
  Zap
} from 'lucide-react';

interface Position {
  id: string;
  marketId: string;
  marketQuestion: string;
  outcome: 'YES' | 'NO';
  shares: number;
  avgPrice: number;
  currentPrice: number;
  value: number;
  pnl: number;
  pnlPercent: number;
}

interface Bet {
  id: string;
  marketQuestion: string;
  outcome: 'YES' | 'NO';
  amount: number;
  odds: number;
  status: 'pending' | 'won' | 'lost';
  createdAt: string;
  payout?: number;
}

interface PortfolioStats {
  totalValue: number;
  cashBalance: number;
  positionsValue: number;
  totalPnl: number;
  totalPnlPercent: number;
  winRate: number;
  totalBets: number;
  brierScore?: number;
}

import { API_BASE } from '../../lib/api';

export function PortfolioDashboard() {
  const { user, session } = useAuthStore();
  const [stats, setStats] = useState<PortfolioStats>({
    totalValue: 10000,
    cashBalance: 8500,
    positionsValue: 1500,
    totalPnl: 250,
    totalPnlPercent: 2.5,
    winRate: 62,
    totalBets: 15,
    brierScore: 0.18
  });
  const [positions, setPositions] = useState<Position[]>([]);
  const [recentBets, setRecentBets] = useState<Bet[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPortfolio();
  }, []);

  const loadPortfolio = async () => {
    setLoading(true);
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      };

      if (session?.access_token) {
        headers['Authorization'] = `Bearer ${session.access_token}`;
      }

      // Load portfolio data
      const [portfolioRes, statsRes, betsRes] = await Promise.all([
        fetch(`${API_BASE}/api/user/portfolio`, { headers }),
        fetch(`${API_BASE}/api/user/stats`, { headers }),
        fetch(`${API_BASE}/api/user/bets?limit=10`, { headers })
      ]);

      if (portfolioRes.ok) {
        const portfolio = await portfolioRes.json();
        if (portfolio.positions) {
          setPositions(portfolio.positions);
        }
        if (portfolio.balance !== undefined) {
          setStats(prev => ({
            ...prev,
            cashBalance: portfolio.balance,
            positionsValue: portfolio.positionsValue || prev.positionsValue,
            totalValue: (portfolio.balance || 0) + (portfolio.positionsValue || 0)
          }));
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(prev => ({
          ...prev,
          ...statsData,
          totalPnl: statsData.totalPnl || prev.totalPnl,
          winRate: statsData.winRate || prev.winRate,
          brierScore: statsData.brierScore || prev.brierScore
        }));
      }

      if (betsRes.ok) {
        const betsData = await betsRes.json();
        setRecentBets(betsData.bets || betsData || []);
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Error loading portfolio:', error);
      // Use mock data
      if (import.meta.env.DEV) {
        setPositions(generateMockPositions());
        setRecentBets(generateMockBets());
      }
    } finally {
      setLoading(false);
    }
  };

  const generateMockPositions = (): Position[] => [
    {
      id: '1',
      marketId: 'btc-100k',
      marketQuestion: 'Will Bitcoin reach $100k by end of 2026?',
      outcome: 'YES',
      shares: 150,
      avgPrice: 0.45,
      currentPrice: 0.52,
      value: 78,
      pnl: 10.5,
      pnlPercent: 15.6
    },
    {
      id: '2',
      marketId: 'gpt5-release',
      marketQuestion: 'Will GPT-5 be released before July 2026?',
      outcome: 'NO',
      shares: 200,
      avgPrice: 0.35,
      currentPrice: 0.28,
      value: 56,
      pnl: 14,
      pnlPercent: 20
    }
  ];

  const generateMockBets = (): Bet[] => [
    { id: '1', marketQuestion: 'Will Tesla stock exceed $400 in Q1?', outcome: 'YES', amount: 100, odds: 0.65, status: 'won', createdAt: new Date(Date.now() - 86400000).toISOString(), payout: 154 },
    { id: '2', marketQuestion: 'Will it rain in NYC tomorrow?', outcome: 'NO', amount: 50, odds: 0.4, status: 'lost', createdAt: new Date(Date.now() - 172800000).toISOString() },
    { id: '3', marketQuestion: 'Will Apple announce new product this week?', outcome: 'YES', amount: 75, odds: 0.55, status: 'pending', createdAt: new Date(Date.now() - 3600000).toISOString() }
  ];

  const formatCurrency = (value: number): string => {
    return `M$${value.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;
  };

  const formatPercent = (value: number): string => {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(1)}%`;
  };

  const formatDate = (dateStr: string): string => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffHours = Math.floor(diffMs / 3600000);

    if (diffHours < 1) return 'Just now';
    if (diffHours < 24) return `${diffHours}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="min-h-screen">
      {/* Hero Section */}
      <section className="relative py-12 lg:py-16 overflow-hidden">
        <div className="container mx-auto px-4">
          <div className="max-w-4xl mx-auto text-center">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
            >
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-neon-cyan/10 border border-neon-cyan/30 mb-6">
                <Wallet className="w-4 h-4 text-neon-cyan" />
                <span className="text-sm text-neon-cyan font-medium">Your Portfolio</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">
                <NeonText variant="gradient" className="animate-gradient" glow>
                  Portfolio Dashboard
                </NeonText>
              </h1>

              <p className="text-lg text-white/60 mb-6 max-w-2xl mx-auto">
                Track your prediction market performance and manage your positions
              </p>

              <NeonButton
                onClick={loadPortfolio}
                icon={<RefreshCw size={16} className={loading ? 'animate-spin' : ''} />}
                disabled={loading}
                size="lg"
              >
                Refresh Data
              </NeonButton>
            </motion.div>

            {/* Hero Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="grid grid-cols-3 gap-8 max-w-2xl mx-auto mt-10"
            >
              {[
                { value: formatCurrency(stats.totalValue), label: 'Total Value', icon: Wallet, color: 'text-neon-cyan' },
                { value: `${stats.winRate}%`, label: 'Win Rate', icon: Target, color: 'text-neon-magenta' },
                { value: stats.brierScore?.toFixed(2) || '0.00', label: 'Brier Score', icon: TrendingUp, color: 'text-neon-green' },
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

      {/* Main Content Section */}
      <section className="py-12 bg-cyber-navy/30">
        <div className="container mx-auto px-4">
          {/* Main Balance Card */}
          <GlassCard className="p-6 mb-6 border-neon-cyan/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <Wallet size={20} />
                  <span>Total Portfolio Value</span>
                </div>
                <div className="text-4xl font-bold text-white mb-2">
                  {formatCurrency(stats.totalValue)}
                </div>
                <div className={`flex items-center gap-1 text-sm ${
                  stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'
                }`}>
                  {stats.totalPnl >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  <span>{formatCurrency(Math.abs(stats.totalPnl))}</span>
                  <span>({formatPercent(stats.totalPnlPercent)})</span>
                </div>
              </div>

              {/* Quick Stats */}
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center">
                  <div className="text-2xl font-bold text-neon-cyan">{formatCurrency(stats.cashBalance)}</div>
                  <div className="text-xs text-white/50">Cash Balance</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-neon-magenta">{stats.winRate}%</div>
                  <div className="text-xs text-white/50">Win Rate</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-neon-green">{stats.brierScore?.toFixed(2)}</div>
                  <div className="text-xs text-white/50">Brier Score</div>
                </div>
              </div>
            </div>
          </GlassCard>

          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Open Positions */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <PieChart size={18} className="text-neon-cyan" />
                  Open Positions
                </h2>
                <Badge variant="default">{positions.length} active</Badge>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-2 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
                </div>
              ) : positions.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <Target size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No open positions</p>
                  <p className="text-sm">Place bets to see them here</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {positions.map((position) => (
                    <motion.div
                      key={position.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-white/5 rounded-lg"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex-1 pr-4">
                          <p className="text-sm text-white line-clamp-2">{position.marketQuestion}</p>
                        </div>
                        <Badge className={position.outcome === 'YES' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}>
                          {position.outcome}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <div className="text-white/50">
                          {position.shares} shares @ {(position.avgPrice * 100).toFixed(0)}c
                        </div>
                        <div className={`flex items-center gap-1 ${position.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {position.pnl >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                          <span>{formatPercent(position.pnlPercent)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </GlassCard>

            {/* Recent Bets */}
            <GlassCard className="p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                  <History size={18} className="text-neon-magenta" />
                  Recent Activity
                </h2>
                <Badge variant="info">{stats.totalBets} total bets</Badge>
              </div>

              {loading ? (
                <div className="flex justify-center py-10">
                  <div className="w-8 h-8 border-2 border-neon-magenta/30 border-t-neon-magenta rounded-full animate-spin" />
                </div>
              ) : recentBets.length === 0 ? (
                <div className="text-center py-10 text-white/40">
                  <History size={32} className="mx-auto mb-2 opacity-50" />
                  <p>No betting history</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {recentBets.map((bet) => (
                    <motion.div
                      key={bet.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="p-4 bg-white/5 rounded-lg"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <p className="text-sm text-white flex-1 pr-4 line-clamp-1">{bet.marketQuestion}</p>
                        <Badge className={
                          bet.status === 'won' ? 'bg-green-500/20 text-green-400' :
                          bet.status === 'lost' ? 'bg-red-500/20 text-red-400' :
                          'bg-yellow-500/20 text-yellow-400'
                        }>
                          {bet.status}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-center text-sm">
                        <div className="text-white/50">
                          <span className={bet.outcome === 'YES' ? 'text-green-400' : 'text-red-400'}>{bet.outcome}</span>
                          <span className="mx-2">•</span>
                          <span>{formatCurrency(bet.amount)}</span>
                        </div>
                        <div className="text-white/40 text-xs">
                          {formatDate(bet.createdAt)}
                        </div>
                      </div>
                      {bet.payout && (
                        <div className="text-right text-green-400 text-sm mt-1">
                          +{formatCurrency(bet.payout - bet.amount)} profit
                        </div>
                      )}
                    </motion.div>
                  ))}
                </div>
              )}
            </GlassCard>
          </div>

          {/* Performance Stats */}
          <GlassCard className="p-6 mt-6">
            <h2 className="text-lg font-semibold text-white mb-4 flex items-center gap-2">
              <TrendingUp size={18} className="text-neon-green" />
              Performance Metrics
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-white">{stats.totalBets}</div>
                <div className="text-xs text-white/50">Total Bets</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-green-400">{stats.winRate}%</div>
                <div className="text-xs text-white/50">Win Rate</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className={`text-2xl font-bold ${stats.totalPnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                  {formatCurrency(stats.totalPnl)}
                </div>
                <div className="text-xs text-white/50">Total P&L</div>
              </div>
              <div className="bg-white/5 rounded-lg p-4 text-center">
                <div className="text-2xl font-bold text-neon-cyan">{stats.brierScore?.toFixed(3)}</div>
                <div className="text-xs text-white/50">Brier Score</div>
              </div>
            </div>
          </GlassCard>
        </div>
      </section>
    </div>
  );
}

export default PortfolioDashboard;
