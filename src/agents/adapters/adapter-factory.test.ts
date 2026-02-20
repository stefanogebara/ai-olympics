import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ============================================================================
// MOCKS - use vi.hoisted() so variables are available in hoisted vi.mock calls
// ============================================================================

const {
  mockUseOpenRouter,
  mockGetApiKey,
  MockClaudeAdapter,
  MockOpenAIAdapter,
  MockGeminiAdapter,
  MockOpenRouterAdapter,
  MockWebhookAgentAdapter,
} = vi.hoisted(() => ({
  mockUseOpenRouter: vi.fn(() => false),
  mockGetApiKey: vi.fn(() => 'test-key'),
  MockClaudeAdapter: vi.fn().mockImplementation(() => ({ type: 'claude' })),
  MockOpenAIAdapter: vi.fn().mockImplementation(() => ({ type: 'openai' })),
  MockGeminiAdapter: vi.fn().mockImplementation(() => ({ type: 'gemini' })),
  MockOpenRouterAdapter: vi.fn().mockImplementation(() => ({ type: 'openrouter' })),
  MockWebhookAgentAdapter: vi.fn().mockImplementation(() => ({ type: 'webhook' })),
}));

vi.mock('../../shared/config.js', () => ({
  useOpenRouter: (...args: unknown[]) => mockUseOpenRouter(...args),
  config: { port: 3003 },
  getApiKey: (...args: unknown[]) => mockGetApiKey(...args),
}));

vi.mock('../../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('./claude.js', () => ({
  ClaudeAdapter: MockClaudeAdapter,
}));

vi.mock('./openai.js', () => ({
  OpenAIAdapter: MockOpenAIAdapter,
}));

vi.mock('./gemini.js', () => ({
  GeminiAdapter: MockGeminiAdapter,
}));

vi.mock('./openrouter.js', () => ({
  OpenRouterAdapter: MockOpenRouterAdapter,
}));

vi.mock('./webhook.js', () => ({
  WebhookAgentAdapter: MockWebhookAgentAdapter,
  verifyWebhookSignature: vi.fn(),
}));

vi.mock('./base.js', () => ({
  BaseAgentAdapter: class {},
  BROWSER_TOOLS: [],
}));

// ============================================================================
// IMPORTS (after mocks)
// ============================================================================

import {
  createAgentAdapter,
  isProviderAvailable,
  getAvailableProviders,
} from './index.js';
import type { ExtendedAgentConfig } from './index.js';
import type { AgentProvider } from '../../shared/types/index.js';

// ============================================================================
// Test Helpers
// ============================================================================

function makeConfig(overrides: Partial<ExtendedAgentConfig> = {}): ExtendedAgentConfig {
  return {
    id: 'test-agent',
    name: 'Test Agent',
    provider: 'claude' as AgentProvider,
    model: 'claude-sonnet-4-5',
    color: '#00ff00',
    ...overrides,
  };
}

// ============================================================================
// createAgentAdapter - Factory Function
// ============================================================================

describe('createAgentAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseOpenRouter.mockReturnValue(false);
  });

  // ---------- Webhook agents ----------

  describe('webhook agents', () => {
    it('returns WebhookAgentAdapter when agentType=webhook with webhookUrl and webhookSecret', () => {
      const config = makeConfig({
        agentType: 'webhook',
        webhookUrl: 'https://my-agent.example.com/webhook',
        webhookSecret: 'secret-123',
      });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'webhook' });
      expect(MockWebhookAgentAdapter).toHaveBeenCalledTimes(1);
      expect(MockWebhookAgentAdapter).toHaveBeenCalledWith(
        expect.objectContaining({
          webhookUrl: 'https://my-agent.example.com/webhook',
          webhookSecret: 'secret-123',
        }),
      );
    });

    it('does not create webhook adapter when webhookUrl is missing', () => {
      const config = makeConfig({
        agentType: 'webhook',
        webhookSecret: 'secret-123',
      });
      // Falls through to normal adapter creation
      createAgentAdapter(config);
      expect(MockWebhookAgentAdapter).not.toHaveBeenCalled();
    });

    it('does not create webhook adapter when webhookSecret is missing', () => {
      const config = makeConfig({
        agentType: 'webhook',
        webhookUrl: 'https://my-agent.example.com/webhook',
      });
      createAgentAdapter(config);
      expect(MockWebhookAgentAdapter).not.toHaveBeenCalled();
    });

    it('does not create webhook adapter when agentType is not webhook', () => {
      const config = makeConfig({
        agentType: 'api_key',
        webhookUrl: 'https://my-agent.example.com/webhook',
        webhookSecret: 'secret-123',
      });
      createAgentAdapter(config);
      expect(MockWebhookAgentAdapter).not.toHaveBeenCalled();
    });
  });

  // ---------- OpenRouter routing ----------

  describe('OpenRouter routing', () => {
    it('returns OpenRouterAdapter when useOpenRouter() is true, regardless of provider', () => {
      const providers: AgentProvider[] = ['claude', 'openai', 'gemini', 'llama', 'mistral'];
      for (const provider of providers) {
        vi.clearAllMocks();
        mockUseOpenRouter.mockReturnValue(true);

        const config = makeConfig({ provider });
        const adapter = createAgentAdapter(config);
        expect(adapter).toEqual({ type: 'openrouter' });
        expect(MockOpenRouterAdapter).toHaveBeenCalledTimes(1);
      }
    });

    it('prioritizes webhook over OpenRouter', () => {
      mockUseOpenRouter.mockReturnValue(true);
      const config = makeConfig({
        agentType: 'webhook',
        webhookUrl: 'https://agent.example.com',
        webhookSecret: 'secret',
      });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'webhook' });
      expect(MockWebhookAgentAdapter).toHaveBeenCalledTimes(1);
      expect(MockOpenRouterAdapter).not.toHaveBeenCalled();
    });
  });

  // ---------- Direct provider routing ----------

  describe('direct provider routing (no OpenRouter)', () => {
    it('returns ClaudeAdapter for provider=claude', () => {
      const config = makeConfig({ provider: 'claude' });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'claude' });
      expect(MockClaudeAdapter).toHaveBeenCalledTimes(1);
    });

    it('returns OpenAIAdapter for provider=openai', () => {
      const config = makeConfig({ provider: 'openai' });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'openai' });
      expect(MockOpenAIAdapter).toHaveBeenCalledTimes(1);
    });

    it('returns GeminiAdapter for provider=gemini', () => {
      const config = makeConfig({ provider: 'gemini' });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'gemini' });
      expect(MockGeminiAdapter).toHaveBeenCalledTimes(1);
    });

    it('falls back to OpenAIAdapter for provider=llama', () => {
      const config = makeConfig({ provider: 'llama' });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'openai' });
      expect(MockOpenAIAdapter).toHaveBeenCalledTimes(1);
    });

    it('falls back to OpenAIAdapter for provider=mistral', () => {
      const config = makeConfig({ provider: 'mistral' });
      const adapter = createAgentAdapter(config);
      expect(adapter).toEqual({ type: 'openai' });
      expect(MockOpenAIAdapter).toHaveBeenCalledTimes(1);
    });

    it('throws for unknown provider', () => {
      const config = makeConfig({ provider: 'unknown-provider' as any });
      expect(() => createAgentAdapter(config)).toThrow('Unknown agent provider');
      expect(() => createAgentAdapter(config)).toThrow('unknown-provider');
    });
  });

  // ---------- Config passthrough ----------

  describe('config passthrough', () => {
    it('passes full config to ClaudeAdapter', () => {
      const config = makeConfig({ id: 'my-claude', model: 'claude-opus-4-6' });
      createAgentAdapter(config);
      expect(MockClaudeAdapter).toHaveBeenCalledWith(config);
    });

    it('passes full config to OpenAIAdapter', () => {
      const config = makeConfig({ provider: 'openai', model: 'gpt-4.1' });
      createAgentAdapter(config);
      expect(MockOpenAIAdapter).toHaveBeenCalledWith(config);
    });

    it('passes full config to GeminiAdapter', () => {
      const config = makeConfig({ provider: 'gemini', model: 'gemini-2.5-pro' });
      createAgentAdapter(config);
      expect(MockGeminiAdapter).toHaveBeenCalledWith(config);
    });

    it('passes full config to OpenRouterAdapter', () => {
      mockUseOpenRouter.mockReturnValue(true);
      const config = makeConfig({ provider: 'claude', model: 'claude-sonnet-4-5' });
      createAgentAdapter(config);
      expect(MockOpenRouterAdapter).toHaveBeenCalledWith(config);
    });
  });
});

// ============================================================================
// isProviderAvailable - Provider Availability Check
// ============================================================================

describe('isProviderAvailable', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ---------- OpenRouter key set ----------

  describe('with OPENROUTER_API_KEY set', () => {
    beforeEach(() => {
      process.env.OPENROUTER_API_KEY = 'or-test-key';
    });

    it('claude is available', () => {
      expect(isProviderAvailable('claude')).toBe(true);
    });

    it('openai is available', () => {
      expect(isProviderAvailable('openai')).toBe(true);
    });

    it('gemini is available', () => {
      expect(isProviderAvailable('gemini')).toBe(true);
    });

    it('llama is available', () => {
      expect(isProviderAvailable('llama')).toBe(true);
    });

    it('mistral is available', () => {
      expect(isProviderAvailable('mistral')).toBe(true);
    });
  });

  // ---------- Individual provider keys ----------

  describe('without OpenRouter key', () => {
    it('claude available when ANTHROPIC_API_KEY set', () => {
      process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
      expect(isProviderAvailable('claude')).toBe(true);
    });

    it('claude unavailable without ANTHROPIC_API_KEY', () => {
      expect(isProviderAvailable('claude')).toBe(false);
    });

    it('openai available when OPENAI_API_KEY set', () => {
      process.env.OPENAI_API_KEY = 'sk-test';
      expect(isProviderAvailable('openai')).toBe(true);
    });

    it('openai unavailable without OPENAI_API_KEY', () => {
      expect(isProviderAvailable('openai')).toBe(false);
    });

    it('gemini available when GOOGLE_AI_API_KEY set', () => {
      process.env.GOOGLE_AI_API_KEY = 'ai-test';
      expect(isProviderAvailable('gemini')).toBe(true);
    });

    it('gemini unavailable without GOOGLE_AI_API_KEY', () => {
      expect(isProviderAvailable('gemini')).toBe(false);
    });

    it('unknown provider returns false', () => {
      expect(isProviderAvailable('unknown-provider' as any)).toBe(false);
    });

    it('llama returns false without OpenRouter', () => {
      expect(isProviderAvailable('llama')).toBe(false);
    });

    it('mistral returns false without OpenRouter', () => {
      expect(isProviderAvailable('mistral')).toBe(false);
    });
  });

  // ---------- No env vars at all ----------

  describe('no environment variables set', () => {
    it('all standard providers are unavailable', () => {
      expect(isProviderAvailable('claude')).toBe(false);
      expect(isProviderAvailable('openai')).toBe(false);
      expect(isProviderAvailable('gemini')).toBe(false);
      expect(isProviderAvailable('llama')).toBe(false);
      expect(isProviderAvailable('mistral')).toBe(false);
    });
  });
});

// ============================================================================
// getAvailableProviders - List Available Providers
// ============================================================================

describe('getAvailableProviders', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.GOOGLE_AI_API_KEY;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns empty array when no keys are set', () => {
    expect(getAvailableProviders()).toEqual([]);
  });

  it('returns all 5 providers when OpenRouter key is set', () => {
    process.env.OPENROUTER_API_KEY = 'or-test-key';
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(5);
    expect(providers).toContain('claude');
    expect(providers).toContain('openai');
    expect(providers).toContain('gemini');
    expect(providers).toContain('llama');
    expect(providers).toContain('mistral');
  });

  it('returns only claude when only ANTHROPIC_API_KEY is set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    expect(getAvailableProviders()).toEqual(['claude']);
  });

  it('returns only openai when only OPENAI_API_KEY is set', () => {
    process.env.OPENAI_API_KEY = 'sk-test';
    expect(getAvailableProviders()).toEqual(['openai']);
  });

  it('returns only gemini when only GOOGLE_AI_API_KEY is set', () => {
    process.env.GOOGLE_AI_API_KEY = 'ai-test';
    expect(getAvailableProviders()).toEqual(['gemini']);
  });

  it('returns correct subset with multiple keys', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.GOOGLE_AI_API_KEY = 'ai-test';
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(2);
    expect(providers).toContain('claude');
    expect(providers).toContain('gemini');
    expect(providers).not.toContain('openai');
    expect(providers).not.toContain('llama');
    expect(providers).not.toContain('mistral');
  });

  it('returns all three direct providers when all individual keys set', () => {
    process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
    process.env.OPENAI_API_KEY = 'sk-test';
    process.env.GOOGLE_AI_API_KEY = 'ai-test';
    const providers = getAvailableProviders();
    expect(providers).toHaveLength(3);
    expect(providers).toContain('claude');
    expect(providers).toContain('openai');
    expect(providers).toContain('gemini');
    expect(providers).not.toContain('llama');
    expect(providers).not.toContain('mistral');
  });
});
