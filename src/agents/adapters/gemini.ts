import { GoogleGenerativeAI, SchemaType, type FunctionDeclaration, type Part, type Content } from '@google/generative-ai';
import { BaseAgentAdapter, BROWSER_TOOLS, type AgentTurnResult, type ToolCall, type PageState } from './base.js';
import type { AgentConfig } from '../../shared/types/index.js';
import { getApiKey } from '../../shared/config.js';
import { createLogger } from '../../shared/utils/logger.js';

const log = createLogger('GeminiAdapter');

export class GeminiAdapter extends BaseAgentAdapter {
  private client: GoogleGenerativeAI;
  private history: Content[] = [];

  constructor(agentConfig: AgentConfig) {
    super(agentConfig);

    const apiKey = agentConfig.apiKey || getApiKey('gemini');
    if (!apiKey) {
      throw new Error('Google AI API key is required for Gemini adapter');
    }

    this.client = new GoogleGenerativeAI(apiKey);
  }

  initialize(systemPrompt: string, taskPrompt: string): void {
    super.initialize(systemPrompt, taskPrompt);
    this.history = [];
  }

  reset(): void {
    super.reset();
    this.history = [];
  }

  async processTurn(pageState: PageState): Promise<AgentTurnResult> {
    const turnPrompt = this.buildTurnPrompt(pageState);

    const model = this.client.getGenerativeModel({
      model: this.config.model,
      systemInstruction: `${this.systemPrompt}\n\nTask: ${this.taskPrompt}`,
      tools: [{
        functionDeclarations: this.getGeminiTools()
      }]
    });

    // Add current turn to history
    this.history.push({
      role: 'user',
      parts: [{ text: turnPrompt }]
    });

    try {
      const chat = model.startChat({ history: this.history.slice(0, -1) });
      const result = await chat.sendMessage(turnPrompt);
      const response = result.response;

      let thinking = '';
      const toolCalls: ToolCall[] = [];
      let done = false;
      let taskResult: unknown;

      // Process response parts
      for (const candidate of response.candidates || []) {
        for (const part of candidate.content.parts) {
          if ('text' in part && part.text) {
            thinking += part.text;
          }
          if ('functionCall' in part && part.functionCall) {
            const tc: ToolCall = {
              name: part.functionCall.name,
              arguments: part.functionCall.args as Record<string, unknown>
            };
            toolCalls.push(tc);

            if (part.functionCall.name === 'done') {
              done = true;
              taskResult = part.functionCall.args;
            }
          }
        }
      }

      // Add response to history
      const assistantParts: Part[] = [];
      if (thinking) {
        assistantParts.push({ text: thinking });
      }
      for (const tc of toolCalls) {
        assistantParts.push({
          functionCall: {
            name: tc.name,
            args: tc.arguments
          }
        });
      }

      this.history.push({
        role: 'model',
        parts: assistantParts
      });

      log.agent(this.id, `Turn complete: ${toolCalls.length} tool calls`, {
        thinking: thinking.slice(0, 100),
        tools: toolCalls.map(t => t.name)
      });

      return { thinking, toolCalls, done, result: taskResult };

    } catch (error) {
      log.error(`Gemini API error: ${error}`, { agentId: this.id });
      throw error;
    }
  }

  addToolResults(results: Array<{ toolName: string; result: string; error?: string }>): void {
    const functionResponses: Part[] = results.map(r => ({
      functionResponse: {
        name: r.toolName,
        response: { result: r.error || r.result }
      }
    }));

    this.history.push({
      role: 'user',
      parts: functionResponses
    });
  }

  private getGeminiTools(): FunctionDeclaration[] {
    return BROWSER_TOOLS.map(tool => ({
      name: tool.name,
      description: tool.description,
      parameters: {
        type: SchemaType.OBJECT,
        properties: Object.fromEntries(
          Object.entries(tool.parameters.properties).map(([key, value]) => [
            key,
            {
              type: value.type.toUpperCase() as SchemaType,
              description: value.description,
              ...(value.enum ? { enum: value.enum } : {})
            }
          ])
        ),
        required: tool.parameters.required
      }
    }));
  }

  protected parseToolCalls(_response: unknown): ToolCall[] {
    // Handled inline in processTurn
    return [];
  }
}

export default GeminiAdapter;
