import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Badge, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { useWalletStore } from '../../store/walletStore';
import { DepositModal } from '../../components/payments/DepositModal';
import { WithdrawModal } from '../../components/payments/WithdrawModal';
import { TransactionHistory } from '../../components/payments/TransactionHistory';
import { ExchangeCredentials } from '../../components/payments/ExchangeCredentials';
import {
  Wallet,
  ArrowDownLeft,
  ArrowUpRight,
  RefreshCw,
  Link2,
  Plus,
  CheckCircle,
  XCircle,
  DollarSign,
  Clock,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';

function formatCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export function WalletDashboard() {
  const { session } = useAuthStore();
  const {
    wallet,
    transactions,
    cryptoWallets,
    isLoading,
    error,
    fetchWallet,
    fetchTransactions,
    fetchCryptoWallets,
    linkCryptoWallet,
  } = useWalletStore();

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [linkAddress, setLinkAddress] = useState('');
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkSuccess, setLinkSuccess] = useState(false);
  const [txPage, setTxPage] = useState(1);

  const token = session?.access_token || '';

  useEffect(() => {
    if (token) {
      fetchWallet(token);
      fetchTransactions(token);
      fetchCryptoWallets(token);
    }
  }, [token, fetchWallet, fetchTransactions, fetchCryptoWallets]);

  const handleRefresh = () => {
    if (!token) return;
    fetchWallet(token);
    fetchTransactions(token);
    fetchCryptoWallets(token);
  };

  const handleLoadMoreTx = () => {
    const nextPage = txPage + 1;
    setTxPage(nextPage);
    fetchTransactions(token, nextPage);
  };

  const handleLinkWallet = async () => {
    setLinkError(null);
    setLinkSuccess(false);
    if (!linkAddress.trim() || !linkAddress.startsWith('0x') || linkAddress.length < 42) {
      setLinkError('Please enter a valid wallet address (0x...)');
      return;
    }
    const ok = await linkCryptoWallet(token, linkAddress);
    if (ok) {
      setLinkSuccess(true);
      setLinkAddress('');
      setTimeout(() => setLinkSuccess(false), 3000);
    } else {
      setLinkError('Failed to link wallet');
    }
  };

  const balance = wallet?.balance_cents ?? 0;
  const pending = wallet?.pending_cents ?? 0;
  const deposited = wallet?.total_deposited_cents ?? 0;
  const withdrawn = wallet?.total_withdrawn_cents ?? 0;

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
                <span className="text-sm text-neon-cyan font-medium">Your Wallet</span>
              </div>

              <h1 className="text-4xl md:text-5xl font-display font-bold mb-4">
                <NeonText variant="gradient" className="animate-gradient" glow>
                  Wallet
                </NeonText>
              </h1>

              <p className="text-lg text-white/60 mb-6 max-w-2xl mx-auto">
                Manage your funds, deposits, and withdrawals
              </p>

              <NeonButton
                onClick={handleRefresh}
                icon={<RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />}
                disabled={isLoading}
                size="lg"
              >
                Refresh
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
                { value: formatCents(balance), label: 'Balance', icon: DollarSign, color: 'text-neon-cyan' },
                { value: formatCents(deposited), label: 'Total Deposited', icon: TrendingUp, color: 'text-neon-green' },
                { value: formatCents(withdrawn), label: 'Total Withdrawn', icon: TrendingDown, color: 'text-neon-magenta' },
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

      {/* Main Content */}
      <section className="py-12 bg-cyber-navy/30">
        <div className="container mx-auto px-4">
          {/* Error Banner */}
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-6 p-4 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2"
            >
              <XCircle size={18} className="text-red-400 shrink-0" />
              <p className="text-sm text-red-400">{error}</p>
            </motion.div>
          )}

          {/* Balance Card */}
          <GlassCard className="p-6 mb-6 border-neon-cyan/30">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 text-white/60 mb-2">
                  <Wallet size={20} />
                  <span>Available Balance</span>
                </div>
                <div className="text-4xl font-bold text-white mb-2">
                  {formatCents(balance)}
                </div>
                {pending > 0 && (
                  <div className="flex items-center gap-1 text-sm text-yellow-400">
                    <Clock size={14} />
                    <span>{formatCents(pending)} pending</span>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <NeonButton
                  onClick={() => setDepositOpen(true)}
                  icon={<ArrowDownLeft size={16} />}
                  size="lg"
                >
                  Deposit
                </NeonButton>
                <NeonButton
                  onClick={() => setWithdrawOpen(true)}
                  icon={<ArrowUpRight size={16} />}
                  variant="secondary"
                  size="lg"
                >
                  Withdraw
                </NeonButton>
              </div>
            </div>
          </GlassCard>

          {/* Two Column Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Transaction History */}
            <TransactionHistory
              transactions={transactions}
              isLoading={isLoading}
              onLoadMore={handleLoadMoreTx}
            />

            {/* Right: Linked Wallets + Exchange Credentials */}
            <div className="space-y-6">
              {/* Linked Crypto Wallets */}
              <GlassCard className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-lg font-semibold text-white flex items-center gap-2">
                    <Link2 size={18} className="text-neon-cyan" />
                    Linked Wallets
                  </h2>
                  <Badge variant="default">{cryptoWallets.length} linked</Badge>
                </div>

                {cryptoWallets.length === 0 ? (
                  <div className="text-center py-6 text-white/40">
                    <Link2 size={28} className="mx-auto mb-2 opacity-50" />
                    <p className="text-sm">No wallets linked yet</p>
                  </div>
                ) : (
                  <div className="space-y-2 mb-4">
                    {cryptoWallets.map((cw) => (
                      <div key={cw.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                        <code className="text-sm text-white/80 font-mono truncate max-w-[200px]">
                          {cw.wallet_address}
                        </code>
                        <Badge className={cw.is_verified ? 'bg-green-500/20 text-green-400' : 'bg-yellow-500/20 text-yellow-400'}>
                          {cw.is_verified ? (
                            <span className="flex items-center gap-1"><CheckCircle size={12} /> Verified</span>
                          ) : (
                            'Pending'
                          )}
                        </Badge>
                      </div>
                    ))}
                  </div>
                )}

                {/* Link New Wallet */}
                <div className="pt-4 border-t border-white/10">
                  <p className="text-xs text-white/40 mb-2">Link a new wallet address</p>
                  <div className="flex gap-2">
                    <Input
                      placeholder="0x..."
                      value={linkAddress}
                      onChange={(e) => setLinkAddress(e.target.value)}
                      className="flex-1"
                    />
                    <NeonButton
                      onClick={handleLinkWallet}
                      loading={isLoading}
                      icon={<Plus size={14} />}
                      size="sm"
                      variant="secondary"
                    >
                      Link
                    </NeonButton>
                  </div>
                  {linkError && <p className="text-xs text-red-400 mt-1">{linkError}</p>}
                  {linkSuccess && <p className="text-xs text-green-400 mt-1">Wallet linked successfully</p>}
                </div>
              </GlassCard>

              {/* Exchange Credentials */}
              <ExchangeCredentials token={token} />
            </div>
          </div>
        </div>
      </section>

      {/* Modals */}
      <DepositModal isOpen={depositOpen} onClose={() => setDepositOpen(false)} />
      <WithdrawModal
        isOpen={withdrawOpen}
        onClose={() => setWithdrawOpen(false)}
        availableBalance={balance}
      />
    </div>
  );
}

export default WalletDashboard;
