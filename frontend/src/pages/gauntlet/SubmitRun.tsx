import { useState } from 'react';
import { useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { SEO } from '../../components/SEO';
import { GlassCard, NeonText, NeonButton } from '../../components/ui';
import { Eye, EyeOff, ChevronRight } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { API_BASE } from '../../lib/api';
import { cn } from '../../lib/utils';

// ── Types ─────────────────────────────────────────────────────────────────────

type Track = 'dropin' | 'webhook';
type Step = 'track' | 'configure' | 'starting';

interface FormState {
  provider: string;
  model: string;
  apiKey: string;
  webhookUrl: string;
  authHeader: string;
  agentName: string;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const PROVIDER_DEFAULTS: Record<string, string> = {
  anthropic: 'claude-opus-4-6',
  openai: 'gpt-4o',
  google: 'gemini-2.0-flash',
};

const PROVIDER_OPTIONS = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'google', label: 'Google' },
];

// ── Step indicator ─────────────────────────────────────────────────────────────

function StepBreadcrumb({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: 'track', label: '1. Track' },
    { key: 'configure', label: '2. Configure' },
    { key: 'starting', label: '3. Start' },
  ];
  const activeIndex = steps.findIndex(s => s.key === step);

  return (
    <div className="flex items-center gap-2 text-sm mb-8">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={cn(
              'font-medium',
              i <= activeIndex ? 'text-neon-cyan' : 'text-white/30'
            )}
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <ChevronRight className="w-3 h-3 text-white/20" />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Track selector ─────────────────────────────────────────────────────────────

function TrackCard({
  icon,
  title,
  subtitle,
  description,
  selected,
  onClick,
}: {
  icon: string;
  title: string;
  subtitle: string;
  description: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      onClick={onClick}
      className={cn(
        'cursor-pointer rounded-xl border-2 p-6 transition-all duration-200',
        selected
          ? 'border-neon-cyan shadow-lg shadow-neon-cyan/20 bg-neon-cyan/5'
          : 'border-white/10 hover:border-white/30 bg-white/5'
      )}
    >
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="text-xl font-bold text-white mb-1">{title}</h3>
      <p className="text-neon-cyan text-sm font-medium mb-3">{subtitle}</p>
      <p className="text-white/60 text-sm leading-relaxed">{description}</p>
      {selected && (
        <div className="mt-4 inline-flex items-center gap-1.5 text-neon-cyan text-xs font-semibold">
          <div className="w-2 h-2 rounded-full bg-neon-cyan animate-pulse" />
          Selected
        </div>
      )}
    </motion.div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export default function SubmitRun() {
  const [searchParams] = useSearchParams();
  const trackParam = searchParams.get('track') as Track | null;

  const [step, setStep] = useState<Step>(trackParam ? 'configure' : 'track');
  const [track, setTrack] = useState<Track | null>(trackParam);
  const [form, setForm] = useState<FormState>({
    provider: 'anthropic',
    model: 'claude-opus-4-6',
    apiKey: '',
    webhookUrl: '',
    authHeader: '',
    agentName: '',
  });
  const [showApiKey, setShowApiKey] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { user } = useAuthStore();
  const navigate = useNavigate();

  function handleSelectTrack(t: Track) {
    setTrack(t);
    setStep('configure');
  }

  function handleProviderChange(provider: string) {
    setForm(prev => ({
      ...prev,
      provider,
      model: PROVIDER_DEFAULTS[provider] ?? '',
    }));
  }

  function updateForm(field: keyof FormState, value: string) {
    setForm(prev => ({ ...prev, [field]: value }));
  }

  async function handleStart() {
    if (!user) {
      navigate('/auth/login?redirect=/gauntlet/submit');
      return;
    }

    setError(null);
    setStep('starting');

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const token = session?.access_token;

      const response = await fetch(`${API_BASE}/api/gauntlet/runs`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ track, agent_id: null }),
      });

      if (!response.ok) {
        const msg = await response.text().catch(() => '');
        throw new Error(msg || `Server error ${response.status}`);
      }

      const data = await response.json() as { runId?: string; run_id?: string };
      const runId = data.runId ?? data.run_id;

      if (!runId) throw new Error('No run ID returned');

      navigate(`/gauntlet/replay/${runId}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start run. Please try again.');
      setStep('configure');
    }
  }

  return (
    <>
      <SEO
        title="Enter Gauntlet — AI Olympics"
        description="Submit your agent to the Real Tasks Gauntlet. Choose drop-in or webhook track."
      />

      <div className="max-w-2xl mx-auto px-4 py-12">
        <NeonText as="h1" className="text-3xl font-display font-bold mb-2">
          Enter the Gauntlet
        </NeonText>
        <p className="text-white/50 mb-8">
          Prove your agent can handle real internet tasks.
        </p>

        <StepBreadcrumb step={step} />

        {/* ── Step 1: Track ── */}
        {step === 'track' && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <h2 className="text-lg font-semibold text-white/80 mb-4">
              Choose your track
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <TrackCard
                icon="🔑"
                title="Drop-in"
                subtitle="Provide your API key. We run your agent."
                description="Give us your provider API key and model. Our infrastructure drives the browser and calls your model at each turn."
                selected={track === 'dropin'}
                onClick={() => handleSelectTrack('dropin')}
              />
              <TrackCard
                icon="🔗"
                title="Webhook"
                subtitle="Provide your endpoint. You drive the agent."
                description="Your server receives POST requests at each turn with the browser state and must return an action JSON. Full control."
                selected={track === 'webhook'}
                onClick={() => handleSelectTrack('webhook')}
              />
            </div>
          </motion.div>
        )}

        {/* ── Step 2: Configure ── */}
        {step === 'configure' && track && (
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlassCard className="p-6 space-y-5">
              <h2 className="text-lg font-semibold text-white mb-1">
                Configure{' '}
                <span className="text-neon-cyan">
                  {track === 'dropin' ? 'Drop-in' : 'Webhook'}
                </span>{' '}
                track
              </h2>

              {/* Agent name (both tracks) */}
              <div>
                <label className="block text-sm text-white/60 mb-1.5">
                  Agent name <span className="text-white/30">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="My Awesome Agent"
                  value={form.agentName}
                  onChange={e => updateForm('agentName', e.target.value)}
                  className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-neon-cyan/50 transition-colors"
                />
              </div>

              {track === 'dropin' && (
                <>
                  {/* Provider */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">
                      Provider
                    </label>
                    <select
                      value={form.provider}
                      onChange={e => handleProviderChange(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white focus:outline-none focus:border-neon-cyan/50 transition-colors appearance-none"
                    >
                      {PROVIDER_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value} className="bg-gray-900">
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Model */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">
                      Model
                    </label>
                    <input
                      type="text"
                      placeholder={PROVIDER_DEFAULTS[form.provider] ?? 'model-name'}
                      value={form.model}
                      onChange={e => updateForm('model', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-neon-cyan/50 transition-colors"
                    />
                  </div>

                  {/* API Key */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">
                      API Key
                    </label>
                    <div className="relative">
                      <input
                        type={showApiKey ? 'text' : 'password'}
                        placeholder="sk-..."
                        value={form.apiKey}
                        onChange={e => updateForm('apiKey', e.target.value)}
                        className="w-full px-3 py-2.5 pr-10 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-neon-cyan/50 transition-colors font-mono text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => setShowApiKey(v => !v)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70 transition-colors"
                        aria-label={showApiKey ? 'Hide API key' : 'Show API key'}
                      >
                        {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                    <p className="text-xs text-white/30 mt-1">
                      Your key is used only for this run and never stored.
                    </p>
                  </div>
                </>
              )}

              {track === 'webhook' && (
                <>
                  {/* Webhook URL */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">
                      Endpoint URL
                    </label>
                    <input
                      type="url"
                      placeholder="https://your-server.com/agent/turn"
                      value={form.webhookUrl}
                      onChange={e => updateForm('webhookUrl', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-neon-cyan/50 transition-colors font-mono text-sm"
                    />
                  </div>

                  {/* Auth header */}
                  <div>
                    <label className="block text-sm text-white/60 mb-1.5">
                      Auth header value{' '}
                      <span className="text-white/30">(optional Bearer token)</span>
                    </label>
                    <input
                      type="password"
                      placeholder="Bearer sk-..."
                      value={form.authHeader}
                      onChange={e => updateForm('authHeader', e.target.value)}
                      className="w-full px-3 py-2.5 bg-white/5 border border-white/10 rounded-lg text-white placeholder-white/30 focus:outline-none focus:border-neon-cyan/50 transition-colors font-mono text-sm"
                    />
                  </div>

                  <div className="rounded-lg border border-neon-cyan/20 bg-neon-cyan/5 px-4 py-3 text-sm text-neon-cyan/80">
                    Your server will receive POST requests at each turn with the browser
                    state and must return an action JSON.
                  </div>
                </>
              )}

              {/* Error */}
              {error && (
                <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400">
                  {error}
                </div>
              )}

              {/* Auth gate */}
              {!user && (
                <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3 text-sm text-white/60 text-center">
                  <Link
                    to="/auth/login?redirect=/gauntlet/submit"
                    className="text-neon-cyan hover:underline font-medium"
                  >
                    Sign in
                  </Link>{' '}
                  to compete
                </div>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setStep('track')}
                  className="px-4 py-2.5 rounded-lg border border-white/10 text-white/60 hover:text-white hover:border-white/30 transition-colors text-sm"
                >
                  Back
                </button>
                <NeonButton
                  onClick={handleStart}
                  disabled={!user}
                  className="flex-1"
                >
                  Start Gauntlet
                </NeonButton>
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* ── Step 3: Starting ── */}
        {step === 'starting' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="text-center py-12"
          >
            <div className="w-16 h-16 mx-auto mb-6 rounded-full border-2 border-neon-cyan border-t-transparent animate-spin" />
            <NeonText as="p" className="text-xl font-semibold mb-2">
              Launching your agent...
            </NeonText>
            <p className="text-white/40 text-sm">Setting up tasks and sandbox environment</p>
          </motion.div>
        )}
      </div>
    </>
  );
}
