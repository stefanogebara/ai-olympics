import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { GlassCard, NeonButton, NeonText, Input, Select } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import type { Agent } from '../../types/database';
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
  Copy
} from 'lucide-react';

type AgentType = 'webhook' | 'api_key';

const providerOptions = [
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'google', label: 'Google AI' },
];

const modelOptions: Record<string, { value: string; label: string }[]> = {
  openrouter: [
    { value: 'anthropic/claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'openai/gpt-4o', label: 'GPT-4o' },
    { value: 'google/gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'meta-llama/llama-3.3-70b', label: 'Llama 3.3 70B' },
  ],
  openai: [
    { value: 'gpt-4o', label: 'GPT-4o' },
    { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
    { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
  ],
  anthropic: [
    { value: 'claude-sonnet-4-20250514', label: 'Claude Sonnet 4' },
    { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet' },
    { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku' },
  ],
  google: [
    { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash' },
    { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro' },
  ],
};

const colorOptions = [
  '#00F5FF', '#FF00FF', '#00FF88', '#FFD700', '#FF6B6B',
  '#4285F4', '#D97706', '#7C3AED', '#10B981', '#F472B6',
];

export function AgentForm() {
  const navigate = useNavigate();
  const { id } = useParams();
  const { profile } = useAuthStore();

  const isEditing = !!id;

  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string } | null>(null);

  // Form state
  const [agentType, setAgentType] = useState<AgentType>('webhook');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [color, setColor] = useState(colorOptions[0]);
  const [isPublic, setIsPublic] = useState(false);

  // Webhook config
  const [webhookUrl, setWebhookUrl] = useState('');
  const [webhookSecret, setWebhookSecret] = useState('');

  // API Key config
  const [provider, setProvider] = useState('openrouter');
  const [model, setModel] = useState('anthropic/claude-sonnet-4-20250514');
  const [apiKey, setApiKey] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');

  const [error, setError] = useState('');

  useEffect(() => {
    if (isEditing) {
      loadAgent();
    } else {
      // Generate webhook secret for new agents
      setWebhookSecret(generateSecret());
    }
  }, [id]);

  useEffect(() => {
    // Auto-generate slug from name
    if (!isEditing) {
      setSlug(name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''));
    }
  }, [name, isEditing]);

  const loadAgent = async () => {
    const { data } = await supabase
      .from('aio_agents')
      .select('*')
      .eq('id', id)
      .single();

    if (data) {
      setAgentType(data.agent_type);
      setName(data.name);
      setSlug(data.slug);
      setDescription(data.description || '');
      setColor(data.color);
      setIsPublic(data.is_public);
      setWebhookUrl(data.webhook_url || '');
      setWebhookSecret(data.webhook_secret || '');
      setProvider(data.provider || 'openrouter');
      setModel(data.model || 'anthropic/claude-sonnet-4-20250514');
      setSystemPrompt(data.system_prompt || '');
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

    try {
      const response = await fetch('/api/agents/test-webhook', {
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    const agentData = {
      owner_id: profile!.id,
      name,
      slug,
      description: description || null,
      color,
      is_public: isPublic,
      agent_type: agentType,
      webhook_url: agentType === 'webhook' ? webhookUrl : null,
      webhook_secret: agentType === 'webhook' ? webhookSecret : null,
      provider: agentType === 'api_key' ? provider : null,
      model: agentType === 'api_key' ? model : null,
      api_key_encrypted: agentType === 'api_key' ? apiKey : null, // Should be encrypted server-side
      system_prompt: agentType === 'api_key' ? systemPrompt : null,
    };

    try {
      if (isEditing) {
        const { error: updateError } = await supabase
          .from('aio_agents')
          .update(agentData)
          .eq('id', id);

        if (updateError) throw updateError;
      } else {
        const { error: insertError } = await supabase
          .from('aio_agents')
          .insert(agentData);

        if (insertError) throw insertError;
      }

      navigate('/dashboard/agents');
    } catch (err: any) {
      setError(err.message || 'Failed to save agent');
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

        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Basic Info */}
          <div className="space-y-4">
            <Input
              label="Agent Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="My Awesome Agent"
              required
            />

            <Input
              label="Slug (URL identifier)"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="my-awesome-agent"
              required
            />

            <div>
              <label className="block text-sm font-medium text-white/70 mb-1">Description</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What makes your agent special?"
                rows={3}
                className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50"
              />
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
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://your-server.com/api/agent"
                required={agentType === 'webhook'}
                icon={<Globe size={18} />}
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
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="sk-..."
                required={agentType === 'api_key' && !isEditing}
                icon={<Key size={18} />}
              />
              {isEditing && (
                <p className="text-xs text-white/40 -mt-2">Leave blank to keep existing key</p>
              )}

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">
                  System Prompt (Optional)
                </label>
                <textarea
                  value={systemPrompt}
                  onChange={(e) => setSystemPrompt(e.target.value)}
                  placeholder="Custom instructions for your agent..."
                  rows={4}
                  className="w-full px-4 py-2.5 bg-cyber-dark/50 border border-white/10 rounded-lg text-white placeholder:text-white/30 focus:outline-none focus:border-neon-cyan/50 font-mono text-sm"
                />
              </div>
            </motion.div>
          )}

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
