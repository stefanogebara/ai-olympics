import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Input, Select } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import {
  Bot,
  Code2,
  Shield,
  ArrowLeft,
  Save,
  TestTube,
  Check,
  X,
  Key,
  Globe,
  Copy,
  Sparkles,
  Swords,
  AlertTriangle
} from 'lucide-react';

const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3003' : '');
const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const EDGE_FN_URL = SUPABASE_URL ? `${SUPABASE_URL}/functions/v1/agent-manage` : '';

type AgentType = 'webhook' | 'api_key';

const providerOptions = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
];

const modelOptions: Record<string, { value: string; label: string }[]> = {
  openrouter: [
    { value: 'anthropic/claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'anthropic/claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'openai/gpt-4.1', label: 'GPT-4.1' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'google/gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'google/gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'meta-llama/llama-4-maverick', label: 'Llama 4 Maverick' },
    { value: 'deepseek/deepseek-r1', label: 'DeepSeek R1' },
  ],
  openai: [
    { value: 'gpt-4.1', label: 'GPT-4.1' },
    { value: 'gpt-4.1-mini', label: 'GPT-4.1 Mini' },
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'o3-mini', label: 'o3 Mini' },
  ],
  anthropic: [
    { value: 'claude-opus-4-6', label: 'Claude Opus 4.6' },
    { value: 'claude-sonnet-4-5-20250929', label: 'Claude Sonnet 4.5' },
    { value: 'claude-haiku-4-5-20251001', label: 'Claude Haiku 4.5' },
  ],
  google: [
    { value: 'gemini-2.5-pro', label: 'Gemini 2.5 Pro' },
    { value: 'gemini-2.5-flash', label: 'Gemini 2.5 Flash' },
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
  ],
};

const colorOptions = [
  '#00F5FF', '#FF00FF', '#00FF88', '#FFD700', '#FF6B6B',
  '#4285F4', '#D97706', '#7C3AED', '#10B981', '#F472B6',
];

const agentSchema = z.object({
  name: z.string().min(1, 'Agent name is required').max(100, 'Name must be under 100 characters'),
  slug: z.string().min(1, 'Slug is required').max(60, 'Slug must be under 60 characters')
    .regex(/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens'),
  description: z.string().max(500, 'Description must be under 500 characters').optional().or(z.literal('')),
  webhookUrl: z.string().optional().or(z.literal('')),
  apiKey: z.string().optional().or(z.literal('')),
  systemPrompt: z.string().max(4000, 'System prompt must be under 4000 characters').optional().or(z.literal('')),
  personaName: z.string().max(100, 'Persona name must be under 100 characters').optional().or(z.literal('')),
  personaDescription: z.string().max(300, 'Persona description must be under 300 characters').optional().or(z.literal('')),
});

type AgentFormData = z.infer<typeof agentSchema>;

export function AgentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile, session } = useAuthStore();

  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Fields not managed by react-hook-form (complex UI controls)
  const [agentType, setAgentType] = useState<AgentType>('webhook');
  const [color, setColor] = useState(colorOptions[0]);
  const [isPublic, setIsPublic] = useState(false);
  const [webhookSecret, setWebhookSecret] = useState('');
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('anthropic/claude-opus-4-6');
  const [personaStyle, setPersonaStyle] = useState('');
  const [strategy, setStrategy] = useState('balanced');
  const [submitError, setSubmitError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors },
  } = useForm<AgentFormData>({
    resolver: zodResolver(agentSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      webhookUrl: '',
      apiKey: '',
      systemPrompt: '',
      personaName: '',
      personaDescription: '',
    },
  });

  const nameValue = watch('name');

  useEffect(() => {
    if (isEditing) {
      loadAgent();
    } else {
      setWebhookSecret(generateSecret());
    }
  }, [id]);

  useEffect(() => {
    // Auto-generate slug from name
    if (!isEditing && nameValue) {
      setValue('slug', nameValue.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  }, [nameValue, isEditing, setValue]);

  const loadAgent = async () => {
    const { data } = await supabase
      .from('aio_agents')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      setAgentType(data.agent_type);
      setColor(data.color);
      setIsPublic(data.is_public);
      setWebhookSecret(data.webhook_secret || '');
      setProvider(data.provider || 'openrouter');
      setModel(data.model || 'anthropic/claude-opus-4-6');
      setPersonaStyle(data.persona_style || '');
      setStrategy(data.strategy || 'balanced');
      reset({
        name: data.name,
        slug: data.slug,
        description: data.description || '',
        webhookUrl: data.webhook_url || '',
        apiKey: '',
        systemPrompt: data.system_prompt || '',
        personaName: data.persona_name || '',
        personaDescription: data.persona_description || '',
      });
    }
  };

  const generateSecret = () => {
    return 'whs_' + Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');
  };

  const testWebhook = async () => {
    setTesting(true);
    setTestResult(null);

    if (!API_BASE) {
      setTestResult({ success: false, message: 'Webhook testing requires the backend server.' });
      setTesting(false);
      return;
    }

    try {
      const webhookUrl = watch('webhookUrl');
      const response = await fetch(`${API_BASE}/api/agents/test-webhook`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl, webhookSecret }),
      });

      const result = await response.json();
      setTestResult({
        success: response.ok,
        message: result.message || (response.ok ? 'Webhook responded successfully!' : 'Webhook test failed'),
      });
    } catch {
      setTestResult({
        success: false,
        message: 'Failed to test webhook. Check the URL and try again.',
      });
    }

    setTesting(false);
  };

  const onSubmit = async (data: AgentFormData) => {
    setSubmitError('');
    setLoading(true);

    // Validate conditional fields
    if (agentType === 'webhook' && !data.webhookUrl) {
      setSubmitError('Webhook URL is required');
      setLoading(false);
      return;
    }
    if (agentType === 'api_key' && !isEditing && !data.apiKey) {
      setSubmitError('API Key is required for new agents');
      setLoading(false);
      return;
    }

    const agentPayload = {
      name: data.name,
      slug: data.slug,
      description: data.description || null,
      color,
      is_public: isPublic,
      agent_type: agentType,
      webhook_url: agentType === 'webhook' ? data.webhookUrl : null,
      provider: agentType === 'api_key' ? provider : null,
      model: agentType === 'api_key' ? model : null,
      api_key: agentType === 'api_key' ? data.apiKey : null,
      system_prompt: agentType === 'api_key' ? data.systemPrompt : null,
      persona_name: data.personaName || null,
      persona_description: data.personaDescription || null,
      persona_style: personaStyle || null,
      strategy: strategy || null,
    };

    try {
      let url: string;
      let method: string;

      if (API_BASE) {
        // Use Express backend if available
        url = isEditing ? `${API_BASE}/api/agents/${id}` : `${API_BASE}/api/agents`;
        method = isEditing ? 'PUT' : 'POST';
      } else if (EDGE_FN_URL) {
        // Fallback to Supabase Edge Function
        url = isEditing ? `${EDGE_FN_URL}?id=${id}` : EDGE_FN_URL;
        method = isEditing ? 'PUT' : 'POST';
      } else {
        setSubmitError('Agent management is unavailable. No backend server or Edge Function configured.');
        setLoading(false);
        return;
      }

      const res = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify(agentPayload),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${res.status}`);
      }

      navigate('/dashboard/agents');
    } catch (err: unknown) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to save agent');
    }

    setLoading(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      <button
        onClick={() => navigate('/dashboard/agents')}
        className="flex items-center gap-2 text-white/60 hover:text-white mb-6 transition-colors"
      >
        <ArrowLeft size={18} />
        Back to Agents
      </button>

      <GlassCard neonBorder className="p-8">
        <h1 className="text-2xl font-display font-bold mb-6">
          {isEditing ? 'Edit' : 'Create'} <NeonText variant="cyan" glow>Agent</NeonText>
        </h1>

        {!API_BASE && !EDGE_FN_URL && (
          <div className="mb-6 p-4 rounded-lg bg-yellow-500/10 border border-yellow-500/30 flex items-start gap-3">
            <AlertTriangle size={20} className="text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-yellow-300 font-medium text-sm">Backend Server Required</p>
              <p className="text-white/60 text-sm mt-1">
                Agent creation requires the backend API server for secure API key encryption.
                The server is not currently connected.
              </p>
            </div>
          </div>
        )}

        {/* Agent Type Selection */}
        <div className="mb-8">
          <label className="block text-sm font-medium text-white/70 mb-3">Agent Type</label>
          <div className="grid grid-cols-2 gap-4">
            <button
              type="button"
              onClick={() => setAgentType('webhook')}
              className={`p-4 rounded-xl border transition-all ${
                agentType === 'webhook'
                  ? 'border-neon-cyan bg-neon-cyan/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <Code2 size={24} className={agentType === 'webhook' ? 'text-neon-cyan' : 'text-white/60'} />
              <p className={`font-semibold mt-2 ${agentType === 'webhook' ? 'text-neon-cyan' : 'text-white'}`}>
                Webhook
              </p>
              <p className="text-xs text-white/50 mt-1">Host your own endpoint</p>
            </button>

            <button
              type="button"
              onClick={() => setAgentType('api_key')}
              className={`p-4 rounded-xl border transition-all ${
                agentType === 'api_key'
                  ? 'border-neon-magenta bg-neon-magenta/10'
                  : 'border-white/10 bg-white/5 hover:border-white/20'
              }`}
            >
              <Shield size={24} className={agentType === 'api_key' ? 'text-neon-magenta' : 'text-white/60'} />
              <p className={`font-semibold mt-2 ${agentType === 'api_key' ? 'text-neon-magenta' : 'text-white'}`}>
                API Key
              </p>
              <p className="text-xs text-white/50 mt-1">We run it for you</p>
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          {submitError && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {submitError}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <Input
              label="Agent Name"
              placeholder="My Awesome Agent"
              error={errors.name?.message}
              {...register('name')}
            />

            <Input
              label="Slug (URL identifier)"
              placeholder="my-awesome-agent"
              error={errors.slug?.message}
              {...register('slug')}
            />

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
              <textarea
                placeholder="What makes your agent special?"
                rows={3}
                className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50"
                {...register('description')}
              />
              {errors.description && (
                <p className="text-sm text-red-400 mt-1">{errors.description.message}</p>
              )}
            </div>

            {/* Color Picker */}
            <div>
              <label className="block text-sm font-medium text-white/70 mb-2">Color</label>
              <div className="flex flex-wrap gap-2">
                {colorOptions.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-8 h-8 rounded-lg transition-all ${
                      color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-cyber-dark' : ''
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>

            {/* Public Toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={isPublic}
                onChange={(e) => setIsPublic(e.target.checked)}
                className="w-4 h-4 rounded border-white/20 bg-cyber-dark text-neon-cyan focus:ring-neon-cyan/30"
              />
              <span className="text-sm text-white/70">Make this agent public (visible on leaderboards)</span>
            </label>
          </div>

          {/* Webhook Config */}
          {agentType === 'webhook' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 pt-4 border-t border-white/10"
            >
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Globe size={18} className="text-neon-cyan" />
                Webhook Configuration
              </h3>

              <Input
                label="Webhook URL"
                placeholder="https://your-server.com/api/agent"
                icon={<Globe size={18} />}
                error={errors.webhookUrl?.message}
                {...register('webhookUrl')}
              />

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Webhook Secret</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={webhookSecret}
                    readOnly
                    className="flex-1 px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white/70 font-mono text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => navigator.clipboard.writeText(webhookSecret)}
                    className="px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white/60 hover:text-white transition-all"
                  >
                    <Copy size={18} />
                  </button>
                </div>
                <p className="text-xs text-white/40 mt-1">
                  Use this secret to verify requests from AI Olympics
                </p>
              </div>

              <div className="flex items-center gap-4">
                <NeonButton
                  type="button"
                  variant="secondary"
                  onClick={testWebhook}
                  loading={testing}
                  icon={<TestTube size={16} />}
                >
                  Test Webhook
                </NeonButton>

                {testResult && (
                  <div className={`flex items-center gap-2 text-sm ${
                    testResult.success ? 'text-neon-green' : 'text-red-400'
                  }`}>
                    {testResult.success ? <Check size={16} /> : <X size={16} />}
                    {testResult.message}
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {/* API Key Config */}
          {agentType === 'api_key' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              className="space-y-4 pt-4 border-t border-white/10"
            >
              <h3 className="font-semibold text-white flex items-center gap-2">
                <Key size={18} className="text-neon-magenta" />
                API Configuration
              </h3>

              <Select
                label="Provider"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value);
                  setModel(modelOptions[e.target.value]?.[0]?.value || '');
                }}
                options={providerOptions}
              />

              <Select
                label="Model"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                options={modelOptions[provider] || []}
              />

              <Input
                label="API Key"
                type="password"
                placeholder="sk-..."
                icon={<Key size={18} />}
                error={errors.apiKey?.message}
                {...register('apiKey')}
              />
              {isEditing && (
                <p className="text-xs text-white/40 -mt-2">Leave blank to keep existing key</p>
              )}

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  System Prompt (Optional)
                </label>
                <textarea
                  placeholder="Custom instructions for your agent..."
                  rows={4}
                  className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50 font-mono text-sm"
                  {...register('systemPrompt')}
                />
                {errors.systemPrompt && (
                  <p className="text-sm text-red-400 mt-1">{errors.systemPrompt.message}</p>
                )}
              </div>
            </motion.div>
          )}

          {/* Persona & Strategy */}
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="space-y-4 pt-4 border-t border-white/10"
          >
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Sparkles size={18} className="text-neon-gold" />
              Persona & Strategy
            </h3>

            <Input
              label="Persona Name"
              placeholder="e.g. The Strategist, Speed Demon"
              error={errors.personaName?.message}
              {...register('personaName')}
            />

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">
                Persona Description
              </label>
              <textarea
                placeholder="Describe your agent's personality and approach..."
                rows={3}
                className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50"
                {...register('personaDescription')}
              />
              {errors.personaDescription && (
                <p className="text-sm text-red-400 mt-1">{errors.personaDescription.message}</p>
              )}
            </div>

            <Select
              label="Persona Style"
              value={personaStyle}
              onChange={(e) => setPersonaStyle(e.target.value)}
              options={[
                { value: '', label: 'None (default)' },
                { value: 'formal', label: 'Formal' },
                { value: 'casual', label: 'Casual' },
                { value: 'technical', label: 'Technical' },
                { value: 'dramatic', label: 'Dramatic' },
                { value: 'minimal', label: 'Minimal' },
              ]}
            />

            <div>
              <label className="block text-sm font-medium text-white/70 mb-3">
                <span className="flex items-center gap-2"><Swords size={16} /> Strategy</span>
              </label>
              <div className="space-y-2">
                {[
                  { value: 'balanced', label: 'Balanced', desc: 'Default behavior, no special modifiers' },
                  { value: 'aggressive', label: 'Aggressive', desc: 'Prioritize speed, take risks' },
                  { value: 'cautious', label: 'Cautious', desc: 'Double-check everything, prefer accuracy' },
                  { value: 'creative', label: 'Creative', desc: 'Try unconventional approaches' },
                  { value: 'analytical', label: 'Analytical', desc: 'Break down problems systematically' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                      strategy === opt.value
                        ? 'border-neon-cyan bg-neon-cyan/10'
                        : 'border-white/10 bg-white/5 hover:border-white/20'
                    }`}
                  >
                    <input
                      type="radio"
                      name="strategy"
                      value={opt.value}
                      checked={strategy === opt.value}
                      onChange={(e) => setStrategy(e.target.value)}
                      className="mt-1 accent-neon-cyan"
                    />
                    <div>
                      <span className="text-sm font-medium text-white">{opt.label}</span>
                      <p className="text-xs text-white/50">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          </motion.div>

          {/* Submit */}
          <div className="flex gap-4 pt-4">
            <NeonButton type="submit" loading={loading} icon={<Save size={18} />}>
              {isEditing ? 'Save Changes' : 'Create Agent'}
            </NeonButton>
            <NeonButton type="button" variant="ghost" onClick={() => navigate('/dashboard/agents')}>
              Cancel
            </NeonButton>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}
