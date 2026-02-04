import 'dotenv/config';
import type { AgentConfig, AgentProvider } from './types/index.js';

// Environment configuration with defaults
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3002', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // AI APIs
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',

  // Streaming
  obsWebsocketUrl: process.env.OBS_WEBSOCKET_URL || 'ws://localhost:4455',
  obsWebsocketPassword: process.env.OBS_WEBSOCKET_PASSWORD || '',

  // Docker
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',

  // Markets
  manifoldApiKey: process.env.MANIFOLD_API_KEY || '',
  kalshiApiKey: process.env.KALSHI_API_KEY || '',

  // ElevenLabs
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  // Competition defaults
  defaults: {
    timeLimit: 300,  // 5 minutes
    maxAgents: 4,
    sandboxCpuLimit: 2,
    sandboxMemoryLimit: 4096,  // MB
    viewport: { width: 1920, height: 1080 }
  }
} as const;

// Pre-defined agent configurations
export const AGENT_PRESETS: Record<string, AgentConfig> = {
  claude: {
    id: 'claude-opus',
    name: 'Claude',
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    color: '#D97706',  // Anthropic orange
    avatar: '🧠'
  },
  'gpt-4': {
    id: 'gpt-4o',
    name: 'GPT-4',
    provider: 'openai',
    model: 'gpt-4o',
    color: '#10B981',  // OpenAI green
    avatar: '🤖'
  },
  gemini: {
    id: 'gemini-pro',
    name: 'Gemini',
    provider: 'gemini',
    model: 'gemini-2.0-flash',
    color: '#4285F4',  // Google blue
    avatar: '💎'
  },
  llama: {
    id: 'llama-3',
    name: 'Llama 3',
    provider: 'llama',
    model: 'llama-3.3-70b',
    color: '#7C3AED',  // Purple
    avatar: '🦙'
  }
};

// Get API key for a provider
export function getApiKey(provider: AgentProvider): string {
  switch (provider) {
    case 'claude':
      return config.anthropicApiKey;
    case 'openai':
      return config.openaiApiKey;
    case 'gemini':
      return config.googleAiApiKey;
    default:
      return '';
  }
}

// Validate required configuration
export function validateConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!config.anthropicApiKey) {
    errors.push('ANTHROPIC_API_KEY is required');
  }

  // OpenAI and Google are optional but warn
  if (!config.openaiApiKey) {
    console.warn('Warning: OPENAI_API_KEY not set - GPT-4 agent will be unavailable');
  }
  if (!config.googleAiApiKey) {
    console.warn('Warning: GOOGLE_AI_API_KEY not set - Gemini agent will be unavailable');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export default config;
