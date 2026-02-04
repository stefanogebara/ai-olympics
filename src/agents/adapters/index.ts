import type { AgentConfig, AgentProvider } from '../../shared/types/index.js';
import { BaseAgentAdapter } from './base.js';
import { ClaudeAdapter } from './claude.js';
import { OpenAIAdapter } from './openai.js';
import { GeminiAdapter } from './gemini.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('AgentFactory');

export { BaseAgentAdapter, BROWSER_TOOLS } from './base.js';
export type { AgentTurnResult, ToolCall, PageState, BrowserTool } from './base.js';
export { ClaudeAdapter } from './claude.js';
export { OpenAIAdapter } from './openai.js';
export { GeminiAdapter } from './gemini.js';

// Factory function to create agent adapters
export function createAgentAdapter(config: AgentConfig): BaseAgentAdapter {
  log.info(`Creating adapter for ${config.provider}`, { agentId: config.id, model: config.model });

  switch (config.provider) {
    case 'claude':
      return new ClaudeAdapter(config);
    case 'openai':
      return new OpenAIAdapter(config);
    case 'gemini':
      return new GeminiAdapter(config);
    case 'llama':
    case 'mistral':
      // For now, these would use OpenAI-compatible endpoints
      log.warn(`${config.provider} adapter not yet implemented, falling back to OpenAI-compatible`);
      return new OpenAIAdapter({
        ...config,
        // Would need to configure different base URL for these
      });
    default:
      throw new Error(`Unknown agent provider: ${config.provider}`);
  }
}

// Check if a provider is available (has API key configured)
export function isProviderAvailable(provider: AgentProvider): boolean {
  switch (provider) {
    case 'claude':
      return !!process.env.ANTHROPIC_API_KEY;
    case 'openai':
      return !!process.env.OPENAI_API_KEY;
    case 'gemini':
      return !!process.env.GOOGLE_AI_API_KEY;
    default:
      return false;
  }
}

// Get all available providers
export function getAvailableProviders(): AgentProvider[] {
  const providers: AgentProvider[] = ['claude', 'openai', 'gemini', 'llama', 'mistral'];
  return providers.filter(isProviderAvailable);
}
