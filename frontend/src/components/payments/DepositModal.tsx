import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { GlassCard, NeonButton, Input } from '../ui';
import { X, CreditCard, Coins, Copy, Check } from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';
import { useAuthStore } from '../../store/authStore';

interface DepositModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function DepositModal({ isOpen, onClose }: DepositModalProps) {
  const [tab, setTab] = useState<'stripe' | 'crypto'>('stripe');
  const [amount, setAmount] = useState('');
  const [cryptoAddress, setCryptoAddress] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { session, user } = useAuthStore();
  const { depositStripe, depositCrypto, isLoading } = useWalletStore();

  const handleStripeDeposit = async () => {
    setError(null);
    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setError('Please enter a valid amount');
      return;
    }
    const token = session?.access_token;
    if (!token) {
      setError('Not authenticated');
      return;
    }
    const amountCents = Math.round(amountNum * 100);
    const email = user?.email || '';
    const checkoutUrl = await depositStripe(token, amountCents, email);
    if (checkoutUrl) {
      window.location.href = checkoutUrl;
    } else {
      setError('Failed to create checkout session. Please try again.');
    }
  };

  const handleCryptoDeposit = async () => {
    setError(null);
    const token = session?.access_token;
    if (!token) {
      setError('Not authenticated');
      return;
    }
    const result = await depositCrypto(token);
    if (result) {
      setCryptoAddress(result.address);
    } else {
      setError('Failed to get deposit address. Please try again.');
    }
  };

  const copyAddress = async () => {
    if (!cryptoAddress) return;
    await navigator.clipboard.writeText(cryptoAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          <GlassCard className="p-6 border-neon-cyan/30">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-display font-bold text-white">Deposit Funds</h2>
              <button
                onClick={onClose}
                className="p-1 text-white/40 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 mb-6">
              <button
                onClick={() => setTab('stripe')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === 'stripe'
                    ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                }`}
              >
                <CreditCard size={16} />
                Card (Stripe)
              </button>
              <button
                onClick={() => setTab('crypto')}
                className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  tab === 'crypto'
                    ? 'bg-neon-cyan/20 text-neon-cyan border border-neon-cyan/40'
                    : 'bg-white/5 text-white/50 border border-white/10 hover:bg-white/10'
                }`}
              >
                <Coins size={16} />
                Crypto (USDC)
              </button>
            </div>

            {/* Stripe Tab */}
            {tab === 'stripe' && (
              <div className="space-y-4">
                <Input
                  label="Amount (USD)"
                  type="number"
                  placeholder="10.00"
                  min="1"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  icon={<span className="text-sm font-medium">$</span>}
                />

                <div className="flex gap-2">
                  {[10, 25, 50, 100].map((preset) => (
                    <button
                      key={preset}
                      onClick={() => setAmount(String(preset))}
                      className="flex-1 py-1.5 text-sm bg-white/5 border border-white/10 rounded-lg text-white/60 hover:bg-white/10 hover:text-white transition-all"
                    >
                      ${preset}
                    </button>
                  ))}
                </div>

                <NeonButton
                  onClick={handleStripeDeposit}
                  loading={isLoading}
                  icon={<CreditCard size={16} />}
                  className="w-full"
                  size="lg"
                >
                  Deposit with Card
                </NeonButton>
              </div>
            )}

            {/* Crypto Tab */}
            {tab === 'crypto' && (
              <div className="space-y-4">
                {!cryptoAddress ? (
                  <>
                    <p className="text-sm text-white/60">
                      Generate a deposit address to send USDC on the Polygon network.
                    </p>
                    <NeonButton
                      onClick={handleCryptoDeposit}
                      loading={isLoading}
                      icon={<Coins size={16} />}
                      className="w-full"
                      size="lg"
                    >
                      Generate Deposit Address
                    </NeonButton>
                  </>
                ) : (
                  <>
                    <div className="p-4 bg-white/5 rounded-lg border border-white/10">
                      <p className="text-xs text-white/40 mb-2">Send USDC on Polygon network to:</p>
                      <div className="flex items-center gap-2">
                        <code className="flex-1 text-sm text-neon-cyan font-mono break-all">
                          {cryptoAddress}
                        </code>
                        <button
                          onClick={copyAddress}
                          className="p-2 text-white/40 hover:text-neon-cyan transition-colors shrink-0"
                        >
                          {copied ? <Check size={16} className="text-green-400" /> : <Copy size={16} />}
                        </button>
                      </div>
                    </div>
                    <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                      <p className="text-xs text-yellow-400">
                        Only send USDC on the Polygon network. Deposits typically confirm within 2-5 minutes.
                        Sending other tokens or using other networks may result in loss of funds.
                      </p>
                    </div>
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
