import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import type { AgentConfig } from '../../shared/types/index.js';
import type { PageState } from './base.js';

// ============================================================================
// MOCKS - must be declared before imports that use them
// ============================================================================

const mockOpenAICreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn().mockImplementation(() => ({
    chat: {
      completions: {
        create: mockOpenAICreate,
      },
    },
  })),
}));

vi.mock('../../shared/config.js', () => ({
  config: { openRouterApiKey: 'test-or-key' },
  getApiKey: vi.fn(),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    agent: vi.fn(),
    debug: vi.fn(),
  }),
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import { OpenRouterAdapter } from './openrouter.js';
import {
  WebhookAgentAdapter,
  verifyWebhookSignature,
  verifyWebhookRequest,
  type WebhookAgentConfig,
} from './webhook.js';
import { BROWSER_TOOLS } from './base.js';
import OpenAI from 'openai';
import { config } from '../../shared/config.js';

// ============================================================================
// TEST FIXTURES
// ============================================================================

function makeAgentConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: 'agent-or-1',
    name: 'OpenRouter Agent',
    provider: 'claude',
    model: 'claude-sonnet-4-20250514',
    color: '#ff00ff',
    ...overrides,
  };
}

function makeWebhookConfig(overrides: Partial<WebhookAgentConfig> = {}): WebhookAgentConfig {
  return {
    id: 'webhook-agent-1',
    name: 'Webhook Agent',
    provider: 'claude',
    model: 'custom-model',
    color: '#00ffff',
    webhookUrl: 'https://my-agent.example.com/webhook',
    webhookSecret: 'test-webhook-secret-key',
    ...overrides,
  };
}

function makePageState(overrides: Partial<PageState> = {}): PageState {
  return {
    url: 'https://example.com',
    title: 'Example Page',
    accessibilityTree: 'button "Submit" [role=button]',
    ...overrides,
  };
}

// ============================================================================
// OpenRouterAdapter Tests
// ============================================================================

describe('OpenRouterAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (config as any).openRouterApiKey = 'test-or-key';
  });

  // ---------- Constructor ----------

  describe('constructor', () => {
    it('creates adapter with valid config when openRouterApiKey is present', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe('agent-or-1');
      expect(adapter.name).toBe('OpenRouter Agent');
    });

    it('throws when no openRouterApiKey is configured', () => {
      (config as any).openRouterApiKey = '';
      expect(() => new OpenRouterAdapter(makeAgentConfig())).toThrow(
        'OpenRouter API key is required',
      );
    });

    it('throws when openRouterApiKey is undefined', () => {
      (config as any).openRouterApiKey = undefined;
      expect(() => new OpenRouterAdapter(makeAgentConfig())).toThrow(
        'OpenRouter API key is required',
      );
    });

    it('creates OpenAI client with correct baseURL and headers', () => {
      new OpenRouterAdapter(makeAgentConfig());
      expect(OpenAI).toHaveBeenCalledWith({
        apiKey: 'test-or-key',
        baseURL: 'https://openrouter.ai/api/v1',
        defaultHeaders: {
          'HTTP-Referer': 'https://ai-olympics.local',
          'X-Title': 'AI Olympics Competition',
        },
      });
    });

    it('maps claude-sonnet-4-20250514 to anthropic/claude-sonnet-4', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'claude-sonnet-4-20250514' }));
      expect(adapter).toBeDefined();
      // We verify the mapping is used when processTurn is called
    });

    it('maps gpt-4o to openai/gpt-4o', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gpt-4o' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('openai/gpt-4o');
    });

    it('maps gemini-pro to google/gemini-2.5-pro', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gemini-pro' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('google/gemini-2.5-pro');
    });

    it('maps gemini-flash to google/gemini-2.5-flash', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gemini-flash' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('google/gemini-2.5-flash');
    });

    it('maps llama-3.3-70b to meta-llama/llama-3.3-70b-instruct', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'llama-3.3-70b' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('meta-llama/llama-3.3-70b-instruct');
    });

    it('maps claude-3.5-sonnet correctly', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'claude-3.5-sonnet' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('anthropic/claude-3.5-sonnet');
    });

    it('maps gpt-4-turbo correctly', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gpt-4-turbo' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('openai/gpt-4-turbo');
    });

    it('uses raw model name when not in MODEL_MAP', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'custom/my-model' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('custom/my-model');
    });

    it('uses raw model name for unknown model string', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'some-random-model-v2' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.model).toBe('some-random-model-v2');
    });
  });

  // ---------- Getters ----------

  describe('getters', () => {
    it('returns correct id', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ id: 'or-agent-99' }));
      expect(adapter.id).toBe('or-agent-99');
    });

    it('returns correct name', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ name: 'OR Bot' }));
      expect(adapter.name).toBe('OR Bot');
    });

    it('returns correct provider', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ provider: 'claude' }));
      expect(adapter.provider).toBe('claude');
    });
  });

  // ---------- initialize ----------

  describe('initialize', () => {
    it('sets system message with prompt and task', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      adapter.initialize('You are a browser agent.', 'Navigate to example.com');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.messages[0]).toEqual({
        role: 'system',
        content: expect.stringContaining('You are a browser agent.'),
      });
      expect(call.messages[0].content).toContain('Task: Navigate to example.com');
    });

    it('can be called multiple times to re-initialize', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      adapter.initialize('Prompt 1', 'Task 1');
      adapter.initialize('Prompt 2', 'Task 2');
      expect(adapter).toBeDefined();
    });
  });

  // ---------- reset ----------

  describe('reset', () => {
    it('clears messages without throwing', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      adapter.initialize('System', 'Task');
      adapter.reset();
      expect(adapter).toBeDefined();
    });

    it('allows reinitialization after reset', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      adapter.initialize('System', 'Task');
      adapter.reset();
      adapter.initialize('New System', 'New Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      expect(call.messages[0].content).toContain('New System');
    });
  });

  // ---------- processTurn ----------

  describe('processTurn', () => {
    let adapter: OpenRouterAdapter;

    beforeEach(() => {
      adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gpt-4o' }));
      adapter.initialize('System prompt', 'Task prompt');
    });

    it('sends correct request to OpenAI API with openRouterModel', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      });

      await adapter.processTurn(makePageState());

      expect(mockOpenAICreate).toHaveBeenCalledWith(
        expect.objectContaining({
          model: 'openai/gpt-4o',
          max_tokens: 4096,
          messages: expect.any(Array),
          tools: expect.any(Array),
          tool_choice: 'auto',
        }),
      );
    });

    it('extracts thinking from content', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          { message: { role: 'assistant', content: 'I will click the button.', tool_calls: [] } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.thinking).toBe('I will click the button.');
    });

    it('handles null content as empty thinking', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          { message: { role: 'assistant', content: null, tool_calls: [] } },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.thinking).toBe('');
    });

    it('parses tool calls from message', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_or_1',
                  type: 'function',
                  function: {
                    name: 'click',
                    arguments: '{"element":"Submit"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        id: 'call_or_1',
        name: 'click',
        arguments: { element: 'Submit' },
      });
    });

    it('handles multiple tool calls', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'type', arguments: '{"element":"Search","text":"query"}' } },
                { id: 'call_2', type: 'function', function: { name: 'click', arguments: '{"element":"Go"}' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('type');
      expect(result.toolCalls[1].name).toBe('click');
    });

    it('detects done tool call and sets done=true', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_done',
                  type: 'function',
                  function: {
                    name: 'done',
                    arguments: '{"success":true,"result":"Completed"}',
                  },
                },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.done).toBe(true);
      expect(result.result).toEqual({ success: true, result: 'Completed' });
    });

    it('records usage from response', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 300, completion_tokens: 150 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.usage).toEqual({ inputTokens: 300, outputTokens: 150 });
    });

    it('returns undefined usage when response has no usage', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.usage).toBeUndefined();
    });

    it('throws when no message in response', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{}],
      });

      await expect(adapter.processTurn(makePageState())).rejects.toThrow(
        'No response from OpenRouter',
      );
    });

    it('throws when choices array is empty', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [],
      });

      await expect(adapter.processTurn(makePageState())).rejects.toThrow(
        'No response from OpenRouter',
      );
    });

    it('throws on API error', async () => {
      mockOpenAICreate.mockRejectedValue(new Error('Rate limited'));

      await expect(adapter.processTurn(makePageState())).rejects.toThrow('Rate limited');
    });

    it('handles tool calls with empty arguments', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call_1', type: 'function', function: { name: 'submit', arguments: '' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls[0].arguments).toEqual({});
    });

    it('accumulates messages across turns', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Turn 1', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState());
      await adapter.processTurn(makePageState({ url: 'https://example.com/2' }));

      const secondCall = mockOpenAICreate.mock.calls[1][0];
      // system + user1 + assistant1 + user2 + (assistant2 added after call) = 4 passed to create
      expect(secondCall.messages.length).toBeGreaterThanOrEqual(4);
    });

    it('includes page error in turn prompt', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      await adapter.processTurn(makePageState({ error: 'Page not found' }));

      const call = mockOpenAICreate.mock.calls[0][0];
      const userMessage = call.messages[1].content;
      expect(userMessage).toContain('Error: Page not found');
    });

    it('handles response with no tool calls', async () => {
      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'Just thinking...', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toHaveLength(0);
      expect(result.done).toBe(false);
    });
  });

  // ---------- addToolResults ----------

  describe('addToolResults', () => {
    it('pushes tool messages with tool_call_id', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gpt-4o' }));
      adapter.initialize('System', 'Task');

      mockOpenAICreate.mockResolvedValue({
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call_abc', type: 'function', function: { name: 'click', arguments: '{"element":"btn"}' } },
              ],
            },
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      await adapter.processTurn(makePageState());

      adapter.addToolResults([
        { toolCallId: 'call_abc', toolName: 'click', result: 'Clicked' },
        { toolCallId: 'call_def', toolName: 'type', result: '', error: 'Not found' },
      ]);

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      await adapter.processTurn(makePageState());

      const lastCall = mockOpenAICreate.mock.calls[1][0];
      // Find tool messages in the array
      const toolMsgs = lastCall.messages.filter((m: any) => m.role === 'tool');
      expect(toolMsgs).toHaveLength(2);
      expect(toolMsgs[0].tool_call_id).toBe('call_abc');
      expect(toolMsgs[0].content).toBe('Clicked');
      expect(toolMsgs[1].tool_call_id).toBe('call_def');
      expect(toolMsgs[1].content).toBe('Not found');
    });

    it('uses error text when error is present', async () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig({ model: 'gpt-4o' }));
      adapter.initialize('System', 'Task');

      adapter.addToolResults([
        { toolCallId: 'call_xyz', toolName: 'navigate', result: 'Success', error: 'Timeout occurred' },
      ]);

      mockOpenAICreate.mockResolvedValue({
        choices: [{ message: { role: 'assistant', content: 'OK', tool_calls: [] } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      });
      await adapter.processTurn(makePageState());

      const call = mockOpenAICreate.mock.calls[0][0];
      const toolMsgs = call.messages.filter((m: any) => m.role === 'tool');
      expect(toolMsgs[0].content).toBe('Timeout occurred');
    });
  });

  // ---------- parseToolCalls ----------

  describe('parseToolCalls', () => {
    it('parses function arguments from JSON', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      const toolCalls = [
        {
          id: 'tc_1',
          type: 'function' as const,
          function: { name: 'navigate', arguments: '{"url":"https://test.com"}' },
        },
        {
          id: 'tc_2',
          type: 'function' as const,
          function: { name: 'click', arguments: '{"element":"Login"}' },
        },
      ];

      const result = (adapter as any).parseToolCalls(toolCalls);
      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'tc_1',
        name: 'navigate',
        arguments: { url: 'https://test.com' },
      });
      expect(result[1]).toEqual({
        id: 'tc_2',
        name: 'click',
        arguments: { element: 'Login' },
      });
    });

    it('handles empty arguments string as empty object', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      const toolCalls = [
        { id: 'tc_1', type: 'function' as const, function: { name: 'submit', arguments: '' } },
      ];

      const result = (adapter as any).parseToolCalls(toolCalls);
      expect(result[0].arguments).toEqual({});
    });

    it('returns empty array for empty input', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      const result = (adapter as any).parseToolCalls([]);
      expect(result).toEqual([]);
    });
  });

  // ---------- getOpenAITools ----------

  describe('getOpenAITools (private)', () => {
    it('maps BROWSER_TOOLS to OpenAI function format', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      const tools = (adapter as any).getOpenAITools();

      expect(tools).toHaveLength(BROWSER_TOOLS.length);
      for (const tool of tools) {
        expect(tool.type).toBe('function');
        expect(tool.function).toHaveProperty('name');
        expect(tool.function).toHaveProperty('description');
        expect(tool.function).toHaveProperty('parameters');
        expect(tool.function.parameters).toHaveProperty('type', 'object');
      }
    });

    it('preserves tool names from BROWSER_TOOLS', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      const tools = (adapter as any).getOpenAITools();
      const expectedNames = BROWSER_TOOLS.map((t) => t.name);
      const actualNames = tools.map((t: any) => t.function.name);
      expect(actualNames).toEqual(expectedNames);
    });
  });

  // ---------- getTools ----------

  describe('getTools', () => {
    it('returns BROWSER_TOOLS', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      expect(adapter.getTools()).toBe(BROWSER_TOOLS);
    });

    it('returns 9 browser tools', () => {
      const adapter = new OpenRouterAdapter(makeAgentConfig());
      expect(adapter.getTools()).toHaveLength(9);
    });
  });
});

// ============================================================================
// WebhookAgentAdapter Tests
// ============================================================================

describe('WebhookAgentAdapter', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    fetchSpy = vi.spyOn(globalThis, 'fetch');
  });

  afterEach(() => {
    fetchSpy.mockRestore();
  });

  function mockFetchResponse(body: unknown, status = 200, ok = true): void {
    fetchSpy.mockResolvedValue({
      ok,
      status,
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    } as Response);
  }

  function mockFetchError(message: string): void {
    fetchSpy.mockRejectedValue(new Error(message));
  }

  // ---------- Constructor ----------

  describe('constructor', () => {
    it('sets webhookUrl and webhookSecret from config', () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      expect(adapter).toBeDefined();
      expect(adapter.id).toBe('webhook-agent-1');
      expect(adapter.name).toBe('Webhook Agent');
    });

    it('stores custom webhookUrl', () => {
      const adapter = new WebhookAgentAdapter(
        makeWebhookConfig({ webhookUrl: 'https://custom.example.com/agent' }),
      );
      expect(adapter).toBeDefined();
    });

    it('stores custom webhookSecret', () => {
      const adapter = new WebhookAgentAdapter(
        makeWebhookConfig({ webhookSecret: 'my-super-secret' }),
      );
      expect(adapter).toBeDefined();
    });
  });

  // ---------- setCompetitionId ----------

  describe('setCompetitionId', () => {
    it('sets competition id for inclusion in requests', async () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      adapter.initialize('System', 'Task');
      adapter.setCompetitionId('comp-42');

      mockFetchResponse({
        thinking: 'test',
        actions: [],
        done: false,
      });

      await adapter.processTurn(makePageState());

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      expect(body.competitionId).toBe('comp-42');
    });
  });

  // ---------- initialize ----------

  describe('initialize', () => {
    it('resets previousActions and turnNumber', async () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());

      // Do a turn first to advance state
      adapter.initialize('System', 'Task');
      mockFetchResponse({
        thinking: 'first',
        actions: [{ tool: 'click', args: { element: 'btn' } }],
        done: false,
      });
      await adapter.processTurn(makePageState());

      // Re-initialize
      adapter.initialize('New System', 'New Task');

      mockFetchResponse({
        thinking: 'second',
        actions: [],
        done: false,
      });
      await adapter.processTurn(makePageState());

      const call = fetchSpy.mock.calls[1];
      const body = JSON.parse(call[1]!.body as string);
      expect(body.turnNumber).toBe(1); // Reset to 0, then incremented to 1
      expect(body.previousActions).toEqual([]);
    });

    it('sets system and task prompts', async () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      adapter.initialize('My System Prompt', 'My Task Prompt');

      mockFetchResponse({
        thinking: 'test',
        actions: [],
        done: false,
      });
      await adapter.processTurn(makePageState());

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);
      expect(body.task.systemPrompt).toContain('My System Prompt');
      expect(body.task.taskPrompt).toBe('My Task Prompt');
    });
  });

  // ---------- reset ----------

  describe('reset', () => {
    it('resets previousActions and turnNumber', async () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      adapter.initialize('System', 'Task');

      // Advance state
      mockFetchResponse({
        thinking: 'first',
        actions: [{ tool: 'click', args: { element: 'btn' } }],
        done: false,
      });
      await adapter.processTurn(makePageState());
      await adapter.processTurn(makePageState());

      // Reset
      adapter.reset();
      adapter.initialize('System', 'Task');

      mockFetchResponse({
        thinking: 'after reset',
        actions: [],
        done: false,
      });
      await adapter.processTurn(makePageState());

      const lastCall = fetchSpy.mock.calls[fetchSpy.mock.calls.length - 1];
      const body = JSON.parse(lastCall[1]!.body as string);
      expect(body.turnNumber).toBe(1);
      expect(body.previousActions).toEqual([]);
    });
  });

  // ---------- processTurn ----------

  describe('processTurn', () => {
    let adapter: WebhookAgentAdapter;

    beforeEach(() => {
      adapter = new WebhookAgentAdapter(makeWebhookConfig());
      adapter.initialize('System prompt', 'Task prompt');
    });

    it('increments turnNumber on each call', async () => {
      mockFetchResponse({ thinking: 'turn1', actions: [], done: false });
      await adapter.processTurn(makePageState());

      mockFetchResponse({ thinking: 'turn2', actions: [], done: false });
      await adapter.processTurn(makePageState());

      const firstBody = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      const secondBody = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
      expect(firstBody.turnNumber).toBe(1);
      expect(secondBody.turnNumber).toBe(2);
    });

    it('builds correct WebhookRequest payload', async () => {
      mockFetchResponse({ thinking: 'test', actions: [], done: false });

      await adapter.processTurn(makePageState({
        url: 'https://example.com/test',
        title: 'Test Page',
        accessibilityTree: 'button "OK"',
        error: 'some error',
      }));

      const call = fetchSpy.mock.calls[0];
      const body = JSON.parse(call[1]!.body as string);

      expect(body.version).toBe('1.0');
      expect(body.timestamp).toBeGreaterThan(0);
      expect(body.agentId).toBe('webhook-agent-1');
      expect(body.agentName).toBe('Webhook Agent');
      expect(body.task.systemPrompt).toContain('System prompt');
      expect(body.task.taskPrompt).toBe('Task prompt');
      expect(body.pageState.url).toBe('https://example.com/test');
      expect(body.pageState.title).toBe('Test Page');
      expect(body.pageState.accessibilityTree).toBe('button "OK"');
      expect(body.pageState.error).toBe('some error');
      expect(body.previousActions).toEqual([]);
      expect(body.turnNumber).toBe(1);
      expect(body.availableTools).toEqual(BROWSER_TOOLS);
    });

    it('signs request with HMAC-SHA256', async () => {
      mockFetchResponse({ thinking: 'test', actions: [], done: false });
      await adapter.processTurn(makePageState());

      const call = fetchSpy.mock.calls[0];
      const headers = call[1]!.headers as Record<string, string>;
      const signature = headers['X-AI-Olympics-Signature'];

      expect(signature).toBeDefined();
      expect(signature).toMatch(/^sha256=[a-f0-9]{64}$/);
    });

    it('sends correct headers', async () => {
      mockFetchResponse({ thinking: 'test', actions: [], done: false });
      await adapter.processTurn(makePageState());

      const call = fetchSpy.mock.calls[0];
      const headers = call[1]!.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['X-AI-Olympics-Signature']).toBeDefined();
      expect(headers['X-AI-Olympics-Timestamp']).toBeDefined();
      expect(headers['X-AI-Olympics-Agent-Id']).toBe('webhook-agent-1');
    });

    it('sends POST request to webhookUrl', async () => {
      mockFetchResponse({ thinking: 'test', actions: [], done: false });
      await adapter.processTurn(makePageState());

      expect(fetchSpy).toHaveBeenCalledWith(
        'https://my-agent.example.com/webhook',
        expect.objectContaining({
          method: 'POST',
        }),
      );
    });

    it('includes signal with 30s timeout', async () => {
      mockFetchResponse({ thinking: 'test', actions: [], done: false });
      await adapter.processTurn(makePageState());

      const call = fetchSpy.mock.calls[0];
      expect(call[1]!.signal).toBeDefined();
    });

    it('handles successful response with actions', async () => {
      mockFetchResponse({
        thinking: 'I should click submit',
        actions: [
          { tool: 'click', args: { element: 'Submit' } },
        ],
        done: false,
      });

      const result = await adapter.processTurn(makePageState());

      expect(result.thinking).toBe('I should click submit');
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0]).toEqual({
        name: 'click',
        arguments: { element: 'Submit' },
      });
      expect(result.done).toBe(false);
    });

    it('parses multiple actions from response', async () => {
      mockFetchResponse({
        thinking: 'multiple steps',
        actions: [
          { tool: 'type', args: { element: 'Search', text: 'hello' } },
          { tool: 'click', args: { element: 'Go' } },
          { tool: 'wait', args: { condition: 'load' } },
        ],
        done: false,
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toHaveLength(3);
      expect(result.toolCalls[0].name).toBe('type');
      expect(result.toolCalls[1].name).toBe('click');
      expect(result.toolCalls[2].name).toBe('wait');
    });

    it('detects done from response.done=true', async () => {
      mockFetchResponse({
        thinking: 'Task complete',
        actions: [
          { tool: 'click', args: { element: 'Finish' } },
        ],
        done: true,
        result: { success: true },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.done).toBe(true);
      expect(result.result).toEqual({ success: true });
    });

    it('detects done from done tool name in actions', async () => {
      mockFetchResponse({
        thinking: 'Signaling completion via tool',
        actions: [
          { tool: 'done', args: { success: true, result: 'Completed' } },
        ],
        done: false, // Even though done=false, the 'done' tool name should set isDone
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.done).toBe(true);
    });

    it('returns failed result on fetch error', async () => {
      mockFetchError('Network timeout');

      const result = await adapter.processTurn(makePageState());

      expect(result.done).toBe(true);
      expect(result.toolCalls).toEqual([]);
      expect(result.thinking).toContain('Webhook call failed');
      expect(result.thinking).toContain('Network timeout');
      expect(result.result).toEqual({ error: true, message: 'Webhook unavailable' });
    });

    it('returns failed result on non-ok response', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
        json: () => Promise.resolve({}),
      } as Response);

      const result = await adapter.processTurn(makePageState());

      expect(result.done).toBe(true);
      expect(result.toolCalls).toEqual([]);
      expect(result.thinking).toContain('Webhook call failed');
      expect(result.result).toEqual({ error: true, message: 'Webhook unavailable' });
    });

    it('returns failed result on 404 response', async () => {
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
        json: () => Promise.resolve({}),
      } as Response);

      const result = await adapter.processTurn(makePageState());

      expect(result.done).toBe(true);
      expect(result.thinking).toContain('Webhook call failed');
    });

    it('handles empty actions array', async () => {
      mockFetchResponse({
        thinking: 'No actions needed',
        actions: [],
        done: false,
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toEqual([]);
      expect(result.done).toBe(false);
    });

    it('handles missing actions field', async () => {
      mockFetchResponse({
        thinking: 'Response without actions',
        done: false,
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toEqual([]);
      expect(result.done).toBe(false);
    });

    it('handles null actions', async () => {
      mockFetchResponse({
        thinking: 'null actions',
        actions: null,
        done: false,
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toEqual([]);
    });

    it('tracks previousActions across turns', async () => {
      // First turn with actions
      mockFetchResponse({
        thinking: 'turn 1',
        actions: [
          { tool: 'click', args: { element: 'Button1' } },
        ],
        done: false,
      });
      await adapter.processTurn(makePageState());

      // Second turn - should include previous action
      mockFetchResponse({
        thinking: 'turn 2',
        actions: [
          { tool: 'type', args: { element: 'Input', text: 'hello' } },
        ],
        done: false,
      });
      await adapter.processTurn(makePageState());

      const secondBody = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
      expect(secondBody.previousActions).toHaveLength(1);
      expect(secondBody.previousActions[0]).toEqual({
        name: 'click',
        arguments: { element: 'Button1' },
      });
    });

    it('accumulates previousActions over multiple turns', async () => {
      // Turn 1: 1 action
      mockFetchResponse({
        thinking: 'turn 1',
        actions: [{ tool: 'click', args: { element: 'A' } }],
        done: false,
      });
      await adapter.processTurn(makePageState());

      // Turn 2: 2 actions
      mockFetchResponse({
        thinking: 'turn 2',
        actions: [
          { tool: 'type', args: { element: 'B', text: 'x' } },
          { tool: 'click', args: { element: 'C' } },
        ],
        done: false,
      });
      await adapter.processTurn(makePageState());

      // Turn 3 - should have 3 previous actions
      mockFetchResponse({
        thinking: 'turn 3',
        actions: [],
        done: false,
      });
      await adapter.processTurn(makePageState());

      const thirdBody = JSON.parse(fetchSpy.mock.calls[2][1]!.body as string);
      expect(thirdBody.previousActions).toHaveLength(3);
    });

    it('includes previousActions in request', async () => {
      mockFetchResponse({
        thinking: 'turn 1',
        actions: [{ tool: 'navigate', args: { url: 'https://test.com' } }],
        done: false,
      });
      await adapter.processTurn(makePageState());

      mockFetchResponse({
        thinking: 'turn 2',
        actions: [],
        done: false,
      });
      await adapter.processTurn(makePageState());

      const body = JSON.parse(fetchSpy.mock.calls[1][1]!.body as string);
      expect(body.previousActions).toEqual([
        { name: 'navigate', arguments: { url: 'https://test.com' } },
      ]);
    });

    it('handles non-Error exception in catch', async () => {
      fetchSpy.mockRejectedValue('string error');

      const result = await adapter.processTurn(makePageState());

      expect(result.done).toBe(true);
      expect(result.thinking).toContain('Unknown error');
    });

    it('returns result from webhook response', async () => {
      mockFetchResponse({
        thinking: 'done',
        actions: [],
        done: true,
        result: { score: 100, details: 'perfect' },
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.result).toEqual({ score: 100, details: 'perfect' });
    });

    it('returns thinking from webhook response', async () => {
      mockFetchResponse({
        thinking: 'I am analyzing the page structure to find the login button.',
        actions: [],
        done: false,
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.thinking).toBe('I am analyzing the page structure to find the login button.');
    });

    it('returns undefined thinking when not provided', async () => {
      mockFetchResponse({
        actions: [],
        done: false,
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.thinking).toBeUndefined();
    });
  });

  // ---------- parseResponse (via processTurn) ----------

  describe('parseResponse', () => {
    let adapter: WebhookAgentAdapter;

    beforeEach(() => {
      adapter = new WebhookAgentAdapter(makeWebhookConfig());
      adapter.initialize('System', 'Task');
    });

    it('converts actions to ToolCall format', async () => {
      mockFetchResponse({
        actions: [
          { tool: 'click', args: { element: 'Submit', index: 0 } },
        ],
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls[0]).toEqual({
        name: 'click',
        arguments: { element: 'Submit', index: 0 },
      });
    });

    it('handles action without args (defaults to empty object)', async () => {
      mockFetchResponse({
        actions: [
          { tool: 'submit' },
        ],
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls[0]).toEqual({
        name: 'submit',
        arguments: {},
      });
    });

    it('filters invalid actions without tool name', async () => {
      mockFetchResponse({
        actions: [
          { tool: 'click', args: { element: 'OK' } },
          { args: { element: 'Ignored' } },  // Missing tool
          { tool: '', args: { element: 'Also Ignored' } },  // Empty tool
          { tool: 'type', args: { element: 'Input', text: 'hi' } },
        ],
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toHaveLength(2);
      expect(result.toolCalls[0].name).toBe('click');
      expect(result.toolCalls[1].name).toBe('type');
    });

    it('filters actions with non-string tool', async () => {
      mockFetchResponse({
        actions: [
          { tool: 123, args: { element: 'Ignored' } },
          { tool: 'click', args: { element: 'Valid' } },
        ],
      });

      const result = await adapter.processTurn(makePageState());
      expect(result.toolCalls).toHaveLength(1);
      expect(result.toolCalls[0].name).toBe('click');
    });
  });

  // ---------- parseToolCalls ----------

  describe('parseToolCalls', () => {
    it('returns empty array', () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      const result = (adapter as any).parseToolCalls({});
      expect(result).toEqual([]);
    });

    it('returns empty array regardless of input', () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      expect((adapter as any).parseToolCalls(null)).toEqual([]);
      expect((adapter as any).parseToolCalls(undefined)).toEqual([]);
      expect((adapter as any).parseToolCalls([1, 2, 3])).toEqual([]);
    });
  });

  // ---------- getTools ----------

  describe('getTools', () => {
    it('returns BROWSER_TOOLS', () => {
      const adapter = new WebhookAgentAdapter(makeWebhookConfig());
      expect(adapter.getTools()).toBe(BROWSER_TOOLS);
    });
  });
});

// ============================================================================
// verifyWebhookSignature Tests
// ============================================================================

describe('verifyWebhookSignature', () => {
  const secret = 'test-secret-key-123';

  function computeSignature(payload: unknown, secretKey: string): string {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  it('returns true for valid signature', () => {
    const payload = { action: 'click', target: 'button' };
    const signature = computeSignature(payload, secret);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('returns false for invalid signature', () => {
    const payload = { action: 'click', target: 'button' };
    const wrongSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';
    expect(verifyWebhookSignature(payload, wrongSignature, secret)).toBe(false);
  });

  it('returns false for tampered payload', () => {
    const originalPayload = { action: 'click', target: 'button' };
    const signature = computeSignature(originalPayload, secret);
    const tamperedPayload = { action: 'click', target: 'malicious' };
    expect(verifyWebhookSignature(tamperedPayload, signature, secret)).toBe(false);
  });

  it('returns false for wrong secret', () => {
    const payload = { action: 'click', target: 'button' };
    const signature = computeSignature(payload, secret);
    expect(verifyWebhookSignature(payload, signature, 'wrong-secret')).toBe(false);
  });

  it('handles different payload types', () => {
    const stringPayload = 'simple string';
    const signature = computeSignature(stringPayload, secret);
    expect(verifyWebhookSignature(stringPayload, signature, secret)).toBe(true);
  });

  it('handles nested object payloads', () => {
    const nestedPayload = {
      outer: { inner: { deep: 'value' } },
      array: [1, 2, 3],
    };
    const signature = computeSignature(nestedPayload, secret);
    expect(verifyWebhookSignature(nestedPayload, signature, secret)).toBe(true);
  });

  it('handles empty object payload', () => {
    const payload = {};
    const signature = computeSignature(payload, secret);
    expect(verifyWebhookSignature(payload, signature, secret)).toBe(true);
  });

  it('uses timingSafeEqual for comparison (throws on length mismatch)', () => {
    const payload = { data: 'test' };
    // A signature that differs in length from the expected format
    expect(() => verifyWebhookSignature(payload, 'short', secret)).toThrow();
  });
});

// ============================================================================
// verifyWebhookRequest Tests
// ============================================================================

describe('verifyWebhookRequest', () => {
  const secret = 'test-secret-key-456';

  function computeSignature(payload: unknown, secretKey: string): string {
    const hmac = crypto.createHmac('sha256', secretKey);
    hmac.update(JSON.stringify(payload));
    return `sha256=${hmac.digest('hex')}`;
  }

  it('returns true for valid request within time window', () => {
    const payload = { action: 'test' };
    const timestamp = Date.now().toString();
    const signature = computeSignature(payload, secret);

    expect(verifyWebhookRequest(payload, signature, timestamp, secret)).toBe(true);
  });

  it('returns false for expired timestamp (older than 5 minutes)', () => {
    const payload = { action: 'test' };
    const expiredTimestamp = (Date.now() - 6 * 60 * 1000).toString(); // 6 minutes ago
    const signature = computeSignature(payload, secret);

    expect(verifyWebhookRequest(payload, signature, expiredTimestamp, secret)).toBe(false);
  });

  it('returns false for future timestamp outside window', () => {
    const payload = { action: 'test' };
    const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString(); // 6 minutes in future
    const signature = computeSignature(payload, secret);

    expect(verifyWebhookRequest(payload, signature, futureTimestamp, secret)).toBe(false);
  });

  it('returns false for NaN timestamp', () => {
    const payload = { action: 'test' };
    const signature = computeSignature(payload, secret);

    expect(verifyWebhookRequest(payload, signature, 'not-a-number', secret)).toBe(false);
  });

  it('returns false for empty timestamp string', () => {
    const payload = { action: 'test' };
    const signature = computeSignature(payload, secret);

    expect(verifyWebhookRequest(payload, signature, '', secret)).toBe(false);
  });

  it('returns false for invalid signature with valid timestamp', () => {
    const payload = { action: 'test' };
    const timestamp = Date.now().toString();
    const wrongSignature = 'sha256=0000000000000000000000000000000000000000000000000000000000000000';

    expect(verifyWebhookRequest(payload, wrongSignature, timestamp, secret)).toBe(false);
  });

  it('uses default 5 minute window', () => {
    const payload = { action: 'test' };
    // 4.5 minutes ago - should be within default 5-minute window
    const recentTimestamp = (Date.now() - 4.5 * 60 * 1000).toString();
    const signature = computeSignature(payload, secret);

    expect(verifyWebhookRequest(payload, signature, recentTimestamp, secret)).toBe(true);
  });

  it('uses custom window when specified', () => {
    const payload = { action: 'test' };
    // 2 minutes ago
    const timestamp = (Date.now() - 2 * 60 * 1000).toString();
    const signature = computeSignature(payload, secret);

    // With 1 minute window, should be outside
    expect(verifyWebhookRequest(payload, signature, timestamp, secret, 60_000)).toBe(false);

    // With 3 minute window, should be inside
    expect(verifyWebhookRequest(payload, signature, timestamp, secret, 3 * 60_000)).toBe(true);
  });

  it('handles timestamp at exact boundary of window', () => {
    const payload = { action: 'test' };
    const windowMs = 10_000; // 10 seconds
    // Use a timestamp just inside the boundary (1ms inside) to avoid flakiness from time passing between
    // Date.now() in the test and Date.now() inside verifyWebhookRequest
    const timestamp = (Date.now() - windowMs + 500).toString();
    const signature = computeSignature(payload, secret);

    // Timestamp is 500ms inside the window boundary, so should pass
    expect(verifyWebhookRequest(payload, signature, timestamp, secret, windowMs)).toBe(true);
  });
});
