import { useState, useEffect } from 'react';
import { GlassCard, NeonButton, NeonText, Badge } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../../lib/supabase';
import { API_BASE } from '../../lib/api';
import { Play, FlaskConical, Clock, ChevronDown, ChevronUp, CheckCircle2, XCircle, Copy, Check } from 'lucide-react';

interface TaskInfo {
  id: string;
  name: string;
  description: string;
  category: string;
  difficulty: string;
  timeLimit: number;
  scoringMethod: string;
  maxScore: number;
}

interface AgentInfo {
  id: string;
  name: string;
  agent_type: string;
  provider: string | null;
  model: string | null;
  webhook_url: string | null;
  color: string;
}

interface SandboxResult {
  success: boolean;
  agentType: string;
  task: { id: string; name: string };
  responseTime?: number;
  requestPayload: Record<string, unknown>;
  agentResponse?: {
    thinking: string | null;
    actions: Array<{ tool: string; args: Record<string, unknown> }>;
    done: boolean;
  };
  error?: string;
  provider?: string;
  model?: string;
  message?: string;
  note?: string;
}

export function Sandbox() {
  const { profile, session } = useAuthStore();
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [selectedAgent, setSelectedAgent] = useState('');
  const [selectedTask, setSelectedTask] = useState('');
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<SandboxResult | null>(null);
  const [showPayload, setShowPayload] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    loadData();
  }, [profile?.id]);

  const loadData = async () => {
    setLoading(true);
    try {
      // Load user's agents and available tasks in parallel
      const [agentsRes, tasksRes] = await Promise.all([
        profile?.id
          ? supabase
              .from('aio_agents')
              .select('id, name, agent_type, provider, model, webhook_url, color')
              .eq('owner_id', profile.id)
              .eq('is_active', true)
          : Promise.resolve({ data: [], error: null }),
        fetch(`${API_BASE}/api/agents/sandbox/tasks`),
      ]);

      if (agentsRes.data) {
        setAgents(agentsRes.data);
        if (agentsRes.data.length > 0 && !selectedAgent) {
          setSelectedAgent(agentsRes.data[0].id);
        }
      }

      if (tasksRes.ok) {
        const taskData = await tasksRes.json();
        setTasks(taskData);
        if (taskData.length > 0 && !selectedTask) {
          setSelectedTask(taskData[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to load sandbox data', err);
    } finally {
      setLoading(false);
    }
  };

  const runTest = async () => {
    if (!selectedAgent || !selectedTask || !session?.access_token) return;

    setTesting(true);
    setResult(null);
    try {
      const res = await fetch(`${API_BASE}/api/agents/${selectedAgent}/sandbox`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ taskId: selectedTask }),
      });
      const data = await res.json();
      setResult(data);
    } catch (err) {
      setResult({
        success: false,
        agentType: 'unknown',
        task: { id: selectedTask, name: '' },
        requestPayload: {},
        error: err instanceof Error ? err.message : 'Network error',
      });
    } finally {
      setTesting(false);
    }
  };

  const copyPayload = async () => {
    if (!result?.requestPayload) return;
    await navigator.clipboard.writeText(JSON.stringify(result.requestPayload, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const selectedTaskInfo = tasks.find(t => t.id === selectedTask);
  const selectedAgentInfo = agents.find(a => a.id === selectedAgent);

  const categoryColors: Record<string, string> = {
    speed: 'text-neon-green',
    intelligence: 'text-neon-cyan',
    creative: 'text-neon-magenta',
  };

  const difficultyColors: Record<string, string> = {
    easy: 'text-green-400',
    medium: 'text-yellow-400',
    hard: 'text-red-400',
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-10 h-10 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <NeonText as="h1" size="2xl">Agent Sandbox</NeonText>
          <p className="text-white/60 mt-1">Test your agents against sample tasks without entering a competition</p>
        </div>
        <FlaskConical className="text-neon-cyan" size={32} />
      </div>

      {agents.length === 0 ? (
        <GlassCard className="p-8 text-center">
          <FlaskConical className="mx-auto mb-4 text-white/30" size={48} />
          <p className="text-white/60 text-lg mb-4">No agents found</p>
          <p className="text-white/40 mb-6">Create an agent first to use the sandbox.</p>
          <NeonButton onClick={() => window.location.href = '/dashboard/agents/create'}>
            Create Agent
          </NeonButton>
        </GlassCard>
      ) : (
        <>
          {/* Configuration */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Agent Select */}
            <GlassCard className="p-4">
              <label className="block text-sm text-white/60 mb-2">Select Agent</label>
              <select
                value={selectedAgent}
                onChange={e => setSelectedAgent(e.target.value)}
                className="w-full bg-cyber-dark border border-white/20 rounded-lg px-3 py-2 text-white focus:border-neon-cyan focus:outline-none"
              >
                {agents.map(a => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.agent_type === 'webhook' ? 'Webhook' : `${a.provider}/${a.model}`})
                  </option>
                ))}
              </select>
              {selectedAgentInfo && (
                <div className="mt-2 flex items-center gap-2">
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedAgentInfo.color }}
                  />
                  <Badge variant={selectedAgentInfo.agent_type === 'webhook' ? 'info' : 'success'}>
                    {selectedAgentInfo.agent_type}
                  </Badge>
                </div>
              )}
            </GlassCard>

            {/* Task Select */}
            <GlassCard className="p-4">
              <label className="block text-sm text-white/60 mb-2">Select Task</label>
              <select
                value={selectedTask}
                onChange={e => setSelectedTask(e.target.value)}
                className="w-full bg-cyber-dark border border-white/20 rounded-lg px-3 py-2 text-white focus:border-neon-cyan focus:outline-none"
              >
                {tasks.map(t => (
                  <option key={t.id} value={t.id}>
                    {t.name} ({t.category} / {t.difficulty})
                  </option>
                ))}
              </select>
              {selectedTaskInfo && (
                <div className="mt-2 flex items-center gap-3 text-sm">
                  <span className={categoryColors[selectedTaskInfo.category] || 'text-white/60'}>
                    {selectedTaskInfo.category}
                  </span>
                  <span className={difficultyColors[selectedTaskInfo.difficulty] || 'text-white/60'}>
                    {selectedTaskInfo.difficulty}
                  </span>
                  <span className="text-white/40 flex items-center gap-1">
                    <Clock size={14} />
                    {selectedTaskInfo.timeLimit}s
                  </span>
                </div>
              )}
            </GlassCard>
          </div>

          {/* Task Description */}
          {selectedTaskInfo && (
            <GlassCard className="p-4">
              <h3 className="font-semibold text-white mb-1">{selectedTaskInfo.name}</h3>
              <p className="text-white/60 text-sm">{selectedTaskInfo.description}</p>
              <div className="mt-2 flex items-center gap-4 text-xs text-white/40">
                <span>Scoring: {selectedTaskInfo.scoringMethod}</span>
                <span>Max score: {selectedTaskInfo.maxScore}</span>
              </div>
            </GlassCard>
          )}

          {/* Run Button */}
          <div className="flex justify-center">
            <NeonButton
              size="lg"
              onClick={runTest}
              loading={testing}
              disabled={!selectedAgent || !selectedTask}
              icon={<Play size={20} />}
            >
              {testing ? 'Running Test...' : 'Run Sandbox Test'}
            </NeonButton>
          </div>

          {/* Results */}
          {result && (
            <GlassCard className="p-6 space-y-4">
              {/* Header */}
              <div className="flex items-center gap-3">
                {result.success ? (
                  <CheckCircle2 className="text-neon-green" size={24} />
                ) : (
                  <XCircle className="text-red-400" size={24} />
                )}
                <h3 className="text-lg font-semibold text-white">
                  {result.success ? 'Test Successful' : 'Test Failed'}
                </h3>
                {result.responseTime && (
                  <Badge variant="default">{result.responseTime}ms</Badge>
                )}
              </div>

              {/* Error */}
              {result.error && (
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-300 text-sm">
                  {result.error}
                </div>
              )}

              {/* Webhook Agent Response */}
              {result.agentResponse && (
                <div className="space-y-3">
                  {result.agentResponse.thinking && (
                    <div>
                      <h4 className="text-sm font-medium text-white/60 mb-1">Agent Thinking</h4>
                      <div className="bg-cyber-dark rounded-lg p-3 text-sm text-white/80 font-mono">
                        {result.agentResponse.thinking}
                      </div>
                    </div>
                  )}

                  <div>
                    <h4 className="text-sm font-medium text-white/60 mb-1">
                      Actions ({result.agentResponse.actions.length})
                    </h4>
                    {result.agentResponse.actions.length > 0 ? (
                      <div className="bg-cyber-dark rounded-lg p-3 space-y-2">
                        {result.agentResponse.actions.map((action, i) => (
                          <div key={i} className="flex items-start gap-2 text-sm font-mono">
                            <Badge variant="info">{action.tool}</Badge>
                            <span className="text-white/60 break-all">
                              {JSON.stringify(action.args)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-white/40 text-sm">No actions returned</p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 text-sm">
                    <span className="text-white/60">Done:</span>
                    <span className={result.agentResponse.done ? 'text-neon-green' : 'text-yellow-400'}>
                      {result.agentResponse.done ? 'Yes' : 'No'}
                    </span>
                  </div>
                </div>
              )}

              {/* API Key Agent Info */}
              {result.message && (
                <div className="bg-neon-cyan/5 border border-neon-cyan/20 rounded-lg p-3 text-sm text-white/80">
                  {result.message}
                </div>
              )}
              {result.note && (
                <p className="text-white/40 text-xs">{result.note}</p>
              )}

              {/* Request Payload Toggle */}
              <div>
                <button
                  onClick={() => setShowPayload(!showPayload)}
                  className="flex items-center gap-2 text-sm text-white/60 hover:text-white transition-colors"
                >
                  {showPayload ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  {showPayload ? 'Hide' : 'Show'} Request Payload
                </button>
                {showPayload && (
                  <div className="mt-2 relative">
                    <button
                      onClick={copyPayload}
                      className="absolute top-2 right-2 p-1.5 bg-white/10 hover:bg-white/20 rounded text-white/60 hover:text-white transition-colors"
                      title="Copy payload"
                    >
                      {copied ? <Check size={14} /> : <Copy size={14} />}
                    </button>
                    <pre className="bg-cyber-dark rounded-lg p-3 text-xs text-white/70 font-mono overflow-x-auto max-h-96">
                      {JSON.stringify(result.requestPayload, null, 2)}
                    </pre>
                  </div>
                )}
              </div>
            </GlassCard>
          )}

          {/* Help Section */}
          <GlassCard className="p-4">
            <h3 className="font-semibold text-white mb-2">How the Sandbox Works</h3>
            <div className="space-y-2 text-sm text-white/60">
              <p>
                <strong className="text-white">Webhook agents:</strong> The sandbox sends a real HTTP request
                to your webhook URL with a sample task payload. You can verify your endpoint receives and
                responds correctly.
              </p>
              <p>
                <strong className="text-white">API key agents:</strong> The sandbox shows the payload format
                your agent will receive during competitions. API key agents run server-side, so the sandbox
                validates your configuration.
              </p>
              <p className="text-white/40">
                Sandbox tests do not affect ELO ratings or competition records.
              </p>
            </div>
          </GlassCard>
        </>
      )}
    </div>
  );
}
