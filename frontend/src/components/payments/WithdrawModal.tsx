import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonButton, Input } from '../ui';
import { X, Building, Coins, CheckCircle } from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';
import { useAuthStore } from '../../store/authStore';

interface WithdrawModalProps {
  isOpen: boolean;
  onClose: () => void;
  availableBalance: number; // in cents
}

export function WithdrawModal({ isOpen, onClose, availableBalance }: WithdrawModalProps) {
  const [tab, setTab] = useState<'bank' | 'crypto'>('crypto');
  const [amount, setAmount] = useState('');
  const [walletAddress, setWalletAddress] = useState('');
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { session } = useAuthStore();
  const { withdrawCrypto, isLoading } = useWalletStore();

  const availableDollars = availableBalance / 100;

  const handleCryptoWithdraw = async () => {
    setError(null);
    setSuccess(false);

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    if (amountNum > availableDollars) {
      setError(`Insufficient balance. Maximum: $${availableDollars.toFixed(2)}`);
      return;
    }
    if (!walletAddress || !walletAddress.startsWith('0x') || walletAddress.length < 42) {
      setError('Please enter a valid wallet address (0x...)');
      return;
    }

    const token = session?.access_token;
    if (!token) {
      setError('Not authenticated');
      return;
    }

    const amountCents = Math.round(amountNum * 100);
    const ok = await withdrawCrypto(token, walletAddress, amountCents);
    if (ok) {
      setSuccess(true);
      setAmount('');
      setWalletAddress('');
    } else {
      setError('Failed to initiate withdrawal. Please try again.');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        {/* Overlay */}
        <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 20 }}
          className="relative z-10 w-full max-w-md"
        >
          <GlassCard className="p-6 border-neon-magenta/30">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-white">Withdraw Funds</h2>
              <button
                onClick={onClose}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Available Balance */}
            <div className="p-3 bg-white/5 rounded-lg border border-white/10 mb-6">
              <div className="text-xs text-white/40">Available Balance</div>
              <div className="text-xl font-bold text-white">${availableDollars.toFixed(2)}</div>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTab('bank')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === 'bank'
                    ? 'bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/40'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                }`}
              >
                <Building size={16} />
                Bank
              </button>
              <button
                onClick={() => setTab('crypto')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === 'crypto'
                    ? 'bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/40'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                }`}
              >
                <Coins size={16} />
                Crypto (USDC)
              </button>
            </div>

            {/* Bank Tab - Coming Soon */}
            {tab === 'bank' && (
              <div className="text-center py-8">
                <Building size={40} className="mx-auto mb-3 text-white/20" />
                <p className="text-white/60 font-medium mb-1">Coming Soon</p>
                <p className="text-sm text-white/40">
                  Stripe Connect payouts coming soon. Use crypto withdrawals in the meantime.
                </p>
              </div>
            )}

            {/* Crypto Tab */}
            {tab === 'crypto' && (
              <div className="space-y-4">
                {success ? (
                  <div className="text-center py-6">
                    <CheckCircle size={40} className="mx-auto mb-3 text-green-400" />
                    <p className="text-white font-medium mb-1">Withdrawal Initiated</p>
                    <p className="text-sm text-white/50">
                      Your USDC withdrawal is being processed. It may take 5-15 minutes.
                    </p>
                    <NeonButton
                      onClick={() => { setSuccess(false); onClose(); }}
                      variant="secondary"
                      className="mt-4"
                    >
                      Close
                    </NeonButton>
                  </div>
                ) : (
                  <>
                    <Input
                      label="Amount (USD)"
                      type="number"
                      placeholder="0.00"
                      min="1"
                      step="0.01"
                      max={availableDollars}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      icon={<span className="text-sm font-medium">$</span>}
                    />

                    <button
                      onClick={() => setAmount(availableDollars.toFixed(2))}
                      className="text-xs text-neon-cyan hover:text-neon-cyan/80 transition-colors"
                    >
                      Withdraw max: ${availableDollars.toFixed(2)}
                    </button>

                    <Input
                      label="Wallet Address"
                      type="text"
                      placeholder="0x..."
                      value={walletAddress}
                      onChange={(e) => setWalletAddress(e.target.value)}
                      icon={<Coins size={14} />}
                    />

                    <NeonButton
                      onClick={handleCryptoWithdraw}
                      loading={isLoading}
                      icon={<Coins size={16} />}
                      variant="secondary"
                      className="w-full"
                      size="lg"
                    >
                      Withdraw USDC
                    </NeonButton>
                  </>
                )}
              </div>
            )}

            {/* Error */}
            {error && (
              <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                <p className="text-sm text-red-400">{error}</p>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
