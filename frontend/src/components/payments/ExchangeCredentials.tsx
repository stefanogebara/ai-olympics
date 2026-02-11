import { useState } from 'react';
import { GlassCard, NeonButton, Input, Badge } from '../ui';
import { Key, Shield, CheckCircle, AlertTriangle } from 'lucide-react';
import { useWalletStore } from '../../store/walletStore';

interface ExchangeCredentialsProps {
  token: string;
}

export function ExchangeCredentials({ token }: ExchangeCredentialsProps) {
  const { storeExchangeCredentials, isLoading } = useWalletStore();

  // Polymarket
  const [polyKey, setPolyKey] = useState('');
  const [polySaved, setPolySaved] = useState(false);
  const [polyError, setPolyError] = useState<string | null>(null);

  // Kalshi
  const [kalshiApiKeyId, setKalshiApiKeyId] = useState('');
  const [kalshiPrivateKey, setKalshiPrivateKey] = useState('');
  const [kalshiSaved, setKalshiSaved] = useState(false);
  const [kalshiError, setKalshiError] = useState<string | null>(null);

  const handlePolymarketSave = async () => {
    setPolyError(null);
    setPolySaved(false);
    if (!polyKey.trim()) {
      setPolyError('Please enter your private key');
      return;
    }
    const ok = await storeExchangeCredentials(token, 'polymarket', { private_key: polyKey });
    if (ok) {
      setPolySaved(true);
      setPolyKey('');
      setTimeout(() => setPolySaved(false), 3000);
    } else {
      setPolyError('Failed to save credentials');
    }
  };

  const handleKalshiSave = async () => {
    setKalshiError(null);
    setKalshiSaved(false);
    if (!kalshiApiKeyId.trim() || !kalshiPrivateKey.trim()) {
      setKalshiError('Please enter both API Key ID and Private Key');
      return;
    }
    const ok = await storeExchangeCredentials(token, 'kalshi', {
      api_key_id: kalshiApiKeyId,
      private_key_pem: kalshiPrivateKey,
    });
    if (ok) {
      setKalshiSaved(true);
      setKalshiApiKeyId('');
      setKalshiPrivateKey('');
      setTimeout(() => setKalshiSaved(false), 3000);
    } else {
      setKalshiError('Failed to save credentials');
    }
  };

  return (
    <GlassCard className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-white flex items-center gap-2">
          <Key size={18} className="text-neon-green" />
          Exchange Credentials
        </h2>
      </div>

      {/* Security Warning */}
      <div className="p-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg mb-6">
        <div className="flex items-start gap-2">
          <Shield size={16} className="text-yellow-400 mt-0.5 shrink-0" />
          <p className="text-xs text-yellow-400">
            Credentials are encrypted server-side using AES-256. They are never stored in plain text
            and are only decrypted when executing trades on your behalf.
          </p>
        </div>
      </div>

      {/* Polymarket */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-white">Polymarket</h3>
          <Badge variant="default">CLOB API</Badge>
        </div>
        <div className="space-y-3">
          <Input
            label="Private Key"
            type="password"
            placeholder="Enter your Polymarket private key"
            value={polyKey}
            onChange={(e) => setPolyKey(e.target.value)}
            icon={<Key size={14} />}
          />
          <div className="flex items-center gap-3">
            <NeonButton
              onClick={handlePolymarketSave}
              loading={isLoading}
              size="sm"
              variant="secondary"
            >
              Save Polymarket Key
            </NeonButton>
            {polySaved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle size={14} /> Saved
              </span>
            )}
            {polyError && (
              <span className="flex items-center gap-1 text-sm text-red-400">
                <AlertTriangle size={14} /> {polyError}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Divider */}
      <div className="border-t border-white/10 my-6" />

      {/* Kalshi */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <h3 className="text-sm font-medium text-white">Kalshi</h3>
          <Badge variant="info">REST API</Badge>
        </div>
        <div className="space-y-3">
          <Input
            label="API Key ID"
            type="password"
            placeholder="Enter your Kalshi API Key ID"
            value={kalshiApiKeyId}
            onChange={(e) => setKalshiApiKeyId(e.target.value)}
            icon={<Key size={14} />}
          />
          <div>
            <label className="block text-sm font-medium text-white/70 mb-1">Private Key (PEM)</label>
            <textarea
              placeholder="-----BEGIN EC PRIVATE KEY-----&#10;..."
              value={kalshiPrivateKey}
              onChange={(e) => setKalshiPrivateKey(e.target.value)}
              rows={4}
              className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50 focus:ring-1 focus:ring-neon-cyan/30 transition-all duration-200 font-mono text-sm resize-none"
            />
          </div>
          <div className="flex items-center gap-3">
            <NeonButton
              onClick={handleKalshiSave}
              loading={isLoading}
              size="sm"
              variant="secondary"
            >
              Save Kalshi Credentials
            </NeonButton>
            {kalshiSaved && (
              <span className="flex items-center gap-1 text-sm text-green-400">
                <CheckCircle size={14} /> Saved
              </span>
            )}
            {kalshiError && (
              <span className="flex items-center gap-1 text-sm text-red-400">
                <AlertTriangle size={14} /> {kalshiError}
              </span>
            )}
          </div>
        </div>
      </div>
    </GlassCard>
  );
}
