import OpenAI from 'openai';
import { BaseAgentAdapter, BROWSER_TOOLS, type AgentTurnResult, type ToolCall, type PageState } from './base.js';
import type { AgentConfig } from '../../shared/types/index.js';
import { config } from '../../shared/config.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('OpenRouterAdapter');

// OpenRouter model mapping
const MODEL_MAP: Record<string, string> = {
  // Claude models
  'claude-sonnet-4-20250514': 'anthropic/claude-sonnet-4',
  'claude-3.5-sonnet': 'anthropic/claude-3.5-sonnet',
  'claude-3-opus': 'anthropic/claude-3-opus',
  // OpenAI models
  'gpt-4o': 'openai/gpt-4o',
  'gpt-4-turbo': 'openai/gpt-4-turbo',
  'gpt-4': 'openai/gpt-4',
  // Google models (updated to current OpenRouter model IDs)
  'gemini-2.0-flash': 'google/gemini-2.5-flash',
  'gemini-flash': 'google/gemini-2.5-flash',
  'gemini-pro': 'google/gemini-2.5-pro',
  'gemini-2.5-pro': 'google/gemini-2.5-pro',
  'gemini-2.5-flash': 'google/gemini-2.5-flash',
  // Meta models
  'llama-3.3-70b': 'meta-llama/llama-3.3-70b-instruct',
  'llama-3.1-70b': 'meta-llama/llama-3.1-70b-instruct',
};

export class OpenRouterAdapter extends BaseAgentAdapter {
  private client: OpenAI;
  private messages: OpenAI.ChatCompletionMessageParam[] = [];
  private openRouterModel: string;

  constructor(agentConfig: AgentConfig) {
    super(agentConfig);

    const apiKey = config.openRouterApiKey;
    if (!apiKey) {
      throw new Error('OpenRouter API key is required');
    }

    this.client = new OpenAI({
      apiKey,
      baseURL: 'https://openrouter.ai/api/v1',
      defaultHeaders: {
        'HTTP-Referer': 'https://ai-olympics.local',
        'X-Title': 'AI Olympics Competition'
      }
    });

    // Map model name to OpenRouter format
    this.openRouterModel = MODEL_MAP[agentConfig.model] || agentConfig.model;
    log.info(`OpenRouter adapter initialized for ${agentConfig.name}`, {
      originalModel: agentConfig.model,
      openRouterModel: this.openRouterModel
    });
  }

  initialize(systemPrompt: string, taskPrompt: string): void {
    super.initialize(systemPrompt, taskPrompt);
    this.messages = [
      {
        role: 'system',
        content: `${systemPrompt}\n\nTask: ${taskPrompt}`
      }
    ];
  }

  reset(): void {
    super.reset();
    this.messages = [];
  }

  async processTurn(pageState: PageState): Promise<AgentTurnResult> {
    const turnPrompt = this.buildTurnPrompt(pageState);

    this.messages.push({
      role: 'user',
      content: turnPrompt
    });

    try {
      const response = await this.client.chat.completions.create({
        model: this.openRouterModel,
        max_tokens: 4096,
        messages: this.messages,
        tools: this.getOpenAITools(),
        tool_choice: 'auto'
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenRouter');
      }

      const thinking = message.content || '';
      const toolCalls = this.parseToolCalls(message.tool_calls || []);
      let done = false;
      let result: unknown;

      // Check for completion
      for (const tc of toolCalls) {
        if (tc.name === 'done') {
          done = true;
          result = tc.arguments;
        }
      }

      // Add to history
      this.messages.push(message);

      log.agent(this.id, `Turn complete: ${toolCalls.length} tool calls`, {
        thinking: thinking.slice(0, 100),
        tools: toolCalls.map(t => t.name)
      });

      return {
        thinking, toolCalls, done, result,
        usage: response.usage ? {
          inputTokens: response.usage.prompt_tokens,
          outputTokens: response.usage.completion_tokens,
        } : undefined,
      };

    } catch (error) {
      log.error(`OpenRouter API error: ${error}`, { agentId: this.id, model: this.openRouterModel });
      throw error;
    }
  }

  addToolResults(results: Array<{ toolCallId: string; toolName: string; result: string; error?: string }>): void {
    for (const r of results) {
      this.messages.push({
        role: 'tool',
        tool_call_id: r.toolCallId,
        content: r.error || r.result
      });
    }
  }

  private getOpenAITools(): OpenAI.ChatCompletionTool[] {
    return BROWSER_TOOLS.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters
      }
    }));
  }

  protected parseToolCalls(toolCalls: OpenAI.ChatCompletionMessageToolCall[]): ToolCall[] {
    return toolCalls.map(tc => ({
      id: tc.id,  // Capture the tool call ID for results
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}')
    }));
  }
}

export default OpenRouterAdapter;
