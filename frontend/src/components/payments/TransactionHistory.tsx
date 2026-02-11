import { motion } from 'framer-motion';
import { GlassCard, Badge } from '../ui';
import { History, ArrowDownLeft, ArrowUpRight, Lock, Trophy, XCircle, Percent } from 'lucide-react';
import type { Transaction } from '../../store/walletStore';

interface TransactionHistoryProps {
  transactions: Transaction[];
  isLoading: boolean;
  onLoadMore?: () => void;
}

const typeConfig: Record<string, { label: string; color: string; icon: typeof ArrowDownLeft }> = {
  deposit: { label: 'Deposit', color: 'bg-green-500/20 text-green-400', icon: ArrowDownLeft },
  withdrawal: { label: 'Withdrawal', color: 'bg-red-500/20 text-red-400', icon: ArrowUpRight },
  bet_lock: { label: 'Bet Locked', color: 'bg-yellow-500/20 text-yellow-400', icon: Lock },
  bet_win: { label: 'Bet Won', color: 'bg-green-500/20 text-green-400', icon: Trophy },
  bet_loss: { label: 'Bet Lost', color: 'bg-red-500/20 text-red-400', icon: XCircle },
  fee: { label: 'Fee', color: 'bg-white/10 text-white/60', icon: Percent },
};

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function TransactionHistory({ transactions, isLoading, onLoadMore }: TransactionHistoryProps) {
  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <History size={18} className="text-neon-magenta" />
          Transaction History
        </h2>
        <Badge variant="default">{transactions.length} transactions</Badge>
      </div>

      {isLoading && transactions.length === 0 ? (
        <div className="flex justify-center py-10">
          <div className="w-8 h-8 border-2 border-neon-magenta/30 border-t-neon-magenta rounded-full animate-spin" />
        </div>
      ) : transactions.length === 0 ? (
        <div className="text-center py-10 text-white/40">
          <History size={32} className="mx-auto mb-2 opacity-50" />
          <p>No transactions yet</p>
          <p className="text-sm">Deposits and bets will appear here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {transactions.map((tx, i) => {
            const config = typeConfig[tx.type] || typeConfig.fee;
            const Icon = config.icon;
            const isPositive = tx.type === 'deposit' || tx.type === 'bet_win';

            return (
              <motion.div
                key={tx.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.03 }}
                className="flex items-center justify-between p-3 bg-white/5 rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${config.color}`}>
                    <Icon size={14} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <Badge className={config.color}>{config.label}</Badge>
                      {tx.provider && (
                        <span className="text-xs text-white/30">{tx.provider}</span>
                      )}
                    </div>
                    <div className="text-xs text-white/40 mt-0.5">
                      {formatRelativeTime(tx.created_at)}
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className={`text-sm font-medium ${isPositive ? 'text-green-400' : 'text-red-400'}`}>
                    {isPositive ? '+' : '-'}{formatCents(Math.abs(tx.amount_cents))}
                  </div>
                  <div className="text-xs text-white/30">
                    Bal: {formatCents(tx.balance_after_cents)}
                  </div>
                </div>
              </motion.div>
            );
          })}

          {onLoadMore && (
            <button
              onClick={onLoadMore}
              className="w-full py-2 text-sm text-neon-cyan/70 hover:text-neon-cyan transition-colors"
            >
              Load more...
            </button>
          )}
        </div>
      )}
    </GlassCard>
  );
}
