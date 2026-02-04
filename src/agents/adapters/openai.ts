import OpenAI from 'openai';
import { BaseAgentAdapter, BROWSER_TOOLS, type AgentTurnResult, type ToolCall, type PageState } from './base.js';
import type { AgentConfig } from '../../shared/types/index.js';
import { getApiKey } from '../../shared/config.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('OpenAIAdapter');

export class OpenAIAdapter extends BaseAgentAdapter {
  private client: OpenAI;
  private messages: OpenAI.ChatCompletionMessageParam[] = [];

  constructor(agentConfig: AgentConfig) {
    super(agentConfig);

    const apiKey = agentConfig.apiKey || getApiKey('openai');
    if (!apiKey) {
      throw new Error('OpenAI API key is required for GPT-4 adapter');
    }

    this.client = new OpenAI({ apiKey });
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
        model: this.config.model,
        max_tokens: 4096,
        messages: this.messages,
        tools: this.getOpenAITools(),
        tool_choice: 'auto'
      });

      const message = response.choices[0]?.message;
      if (!message) {
        throw new Error('No response from OpenAI');
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

      return { thinking, toolCalls, done, result };

    } catch (error) {
      log.error(`OpenAI API error: ${error}`, { agentId: this.id });
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
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments || '{}')
    }));
  }
}

export default OpenAIAdapter;
