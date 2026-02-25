import Anthropic from '@anthropic-ai/sdk';
import { BaseAgentAdapter, BROWSER_TOOLS, type AgentTurnResult, type ToolCall, type PageState } from './base.js';
import type { AgentConfig } from '../../shared/types/index.js';
import { getApiKey, config } from '../../shared/config.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('ClaudeAdapter');

export class ClaudeAdapter extends BaseAgentAdapter {
  private client: Anthropic;
  private messages: Anthropic.MessageParam[] = [];

  constructor(agentConfig: AgentConfig) {
    super(agentConfig);

    // Always use Anthropic API key directly (not OpenRouter key) for ClaudeAdapter
    const apiKey = agentConfig.apiKey || config.anthropicApiKey || getApiKey('claude');
    if (!apiKey) {
      throw new Error('Anthropic API key is required for Claude adapter');
    }

    this.client = new Anthropic({ apiKey });
  }

  initialize(systemPrompt: string, taskPrompt: string): void {
    super.initialize(systemPrompt, taskPrompt);
    this.messages = [];
  }

  reset(): void {
    super.reset();
    this.messages = [];
  }

  async processTurn(pageState: PageState): Promise<AgentTurnResult> {
    const turnPrompt = this.buildTurnPrompt(pageState);

    // Add the current state as a user message
    this.messages.push({
      role: 'user',
      content: turnPrompt
    });

    try {
      const response = await this.client.messages.create({
        model: this.config.model,
        max_tokens: 4096,
        system: `${this.systemPrompt}\n\nTask: ${this.taskPrompt}`,
        tools: this.getAnthropicTools(),
        messages: this.messages
      });

      // Extract thinking and tool calls
      let thinking = '';
      const toolCalls: ToolCall[] = [];
      let done = false;
      let result: unknown;

      for (const block of response.content) {
        if (block.type === 'text') {
          thinking += block.text;
        } else if (block.type === 'tool_use') {
          const toolCall: ToolCall = {
            id: block.id,  // Capture tool_use_id for tool_result matching
            name: block.name,
            arguments: block.input as Record<string, unknown>
          };
          toolCalls.push(toolCall);

          // Check if agent is signaling completion
          if (block.name === 'done') {
            done = true;
            result = block.input;
          }
        }
      }

      // Add assistant response to history
      this.messages.push({
        role: 'assistant',
        content: response.content
      });

      log.agent(this.id, `Turn complete: ${toolCalls.length} tool calls`, {
        thinking: thinking.slice(0, 100),
        tools: toolCalls.map(t => t.name)
      });

      return {
        thinking, toolCalls, done, result,
        usage: response.usage ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        } : undefined,
      };

    } catch (error) {
      log.error(`Claude API error: ${error}`, { agentId: this.id });
      throw error;
    }
  }

  // Add tool results to the conversation
  addToolResults(results: Array<{ toolCallId: string; toolName: string; result: string; error?: string }>): void {
    const toolResultBlocks: Anthropic.ToolResultBlockParam[] = results.map((r) => ({
      type: 'tool_result' as const,
      tool_use_id: r.toolCallId,  // Use actual tool_use_id from the response
      content: r.error || r.result,
      is_error: !!r.error
    }));

    this.messages.push({
      role: 'user',
      content: toolResultBlocks
    });
  }

  // Convert our tools to Anthropic format
  private getAnthropicTools(): Anthropic.Tool[] {
    return BROWSER_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      input_schema: {
        type: 'object' as const,
        properties: tool.parameters.properties,
        required: tool.parameters.required
      }
    }));
  }

  protected parseToolCalls(_response: unknown): ToolCall[] {
    // This is handled inline in processTurn for Claude
    return [];
  }
}

export default ClaudeAdapter;
