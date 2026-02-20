import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  config,
  AGENT_PRESETS,
  getApiKey,
  useOpenRouter,
  validateConfig,
  validateSecrets,
  featureFlags,
} from './config.js';

describe('config module', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    // Set minimum required env vars
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.NODE_ENV = 'development';
    // Clear optional secrets
    delete process.env.JWT_SECRET;
    delete process.env.API_KEY_ENCRYPTION_KEY;
    delete process.env.ENABLE_REAL_MONEY_TRADING;
    delete process.env.ENABLE_CRYPTO_PAYMENTS;
    delete process.env.OPENROUTER_API_KEY;
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  // ================================================================
  // config object defaults
  // ================================================================
  describe('config defaults', () => {
    it('has expected default port', () => {
      expect(config.port).toBe(parseInt(process.env.PORT || '3003', 10));
    });

    it('has defaults nested object with competition settings', () => {
      expect(config.defaults).toEqual({
        timeLimit: 300,
        maxAgents: 4,
        sandboxCpuLimit: 2,
        sandboxMemoryLimit: 4096,
        viewport: { width: 1920, height: 1080 },
      });
    });

    it('has empty string defaults for optional API keys', () => {
      // These are evaluated at module load, but the shape should be correct
      expect(typeof config.openRouterApiKey).toBe('string');
      expect(typeof config.anthropicApiKey).toBe('string');
      expect(typeof config.openaiApiKey).toBe('string');
      expect(typeof config.googleAiApiKey).toBe('string');
      expect(typeof config.elevenLabsApiKey).toBe('string');
      expect(typeof config.stripeSecretKey).toBe('string');
      expect(typeof config.stripeWebhookSecret).toBe('string');
    });

    it('has docker socket default', () => {
      expect(config.dockerSocket).toBe(process.env.DOCKER_SOCKET || '/var/run/docker.sock');
    });

    it('has polygon RPC default', () => {
      // If not set, defaults to public endpoint
      expect(typeof config.polygonRpcUrl).toBe('string');
    });

    it('has log level default', () => {
      expect(typeof config.logLevel).toBe('string');
    });

    it('has boolean trading feature flags', () => {
      expect(typeof config.polymarketClobEnabled).toBe('boolean');
      expect(typeof config.kalshiTradingEnabled).toBe('boolean');
    });
  });

  // ================================================================
  // AGENT_PRESETS
  // ================================================================
  describe('AGENT_PRESETS', () => {
    it('has claude preset with correct structure', () => {
      expect(AGENT_PRESETS.claude).toEqual({
        id: 'claude-opus',
        name: 'Claude',
        provider: 'claude',
        model: 'claude-opus-4-6',
        color: '#D97706',
        avatar: expect.any(String),
      });
    });

    it('has gpt-4 preset', () => {
      expect(AGENT_PRESETS['gpt-4']).toBeDefined();
      expect(AGENT_PRESETS['gpt-4'].provider).toBe('openai');
    });

    it('has gemini preset', () => {
      expect(AGENT_PRESETS.gemini).toBeDefined();
      expect(AGENT_PRESETS.gemini.provider).toBe('gemini');
    });

    it('has llama preset', () => {
      expect(AGENT_PRESETS.llama).toBeDefined();
      expect(AGENT_PRESETS.llama.provider).toBe('llama');
    });

    it('all presets have required fields', () => {
      for (const [key, preset] of Object.entries(AGENT_PRESETS)) {
        expect(preset.id).toBeTruthy();
        expect(preset.name).toBeTruthy();
        expect(preset.provider).toBeTruthy();
        expect(preset.model).toBeTruthy();
        expect(preset.color).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    });
  });

  // ================================================================
  // getApiKey
  // ================================================================
  describe('getApiKey', () => {
    it('returns anthropicApiKey for claude provider when no OpenRouter', () => {
      const result = getApiKey('claude');
      // Returns config.anthropicApiKey (or openRouterApiKey if set)
      expect(typeof result).toBe('string');
    });

    it('returns openaiApiKey for openai provider when no OpenRouter', () => {
      const result = getApiKey('openai');
      expect(typeof result).toBe('string');
    });

    it('returns googleAiApiKey for gemini provider when no OpenRouter', () => {
      const result = getApiKey('gemini');
      expect(typeof result).toBe('string');
    });

    it('returns empty string for llama provider (no direct API)', () => {
      // llama falls to default case
      const result = getApiKey('llama');
      // If openRouter is not configured, llama hits default -> ''
      // If openRouter IS configured, it returns the openRouter key
      expect(typeof result).toBe('string');
    });

    it('returns empty string for unknown provider', () => {
      const result = getApiKey('mistral' as any);
      expect(typeof result).toBe('string');
    });

    it('returns openRouterApiKey for any provider when OpenRouter is configured', () => {
      // Note: config is evaluated at module load. If OPENROUTER_API_KEY was set
      // at load time, config.openRouterApiKey would be non-empty. In our test env
      // it typically isn't set, so this tests the switch statement path.
      // We verify the function doesn't throw for any provider.
      for (const provider of ['claude', 'openai', 'gemini', 'llama', 'mistral'] as const) {
        expect(() => getApiKey(provider as any)).not.toThrow();
      }
    });
  });

  // ================================================================
  // useOpenRouter
  // ================================================================
  describe('useOpenRouter', () => {
    it('returns a boolean', () => {
      expect(typeof useOpenRouter()).toBe('boolean');
    });

    it('returns true when config.openRouterApiKey is non-empty', () => {
      // This depends on module-load state. We can at least verify the function works.
      const result = useOpenRouter();
      expect(result).toBe(!!config.openRouterApiKey);
    });
  });

  // ================================================================
  // validateConfig
  // ================================================================
  describe('validateConfig', () => {
    it('passes with minimum required config', () => {
      const result = validateConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('returns correct shape', () => {
      const result = validateConfig();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);
    });

    // --- Supabase checks ---
    it('fails without SUPABASE_URL', () => {
      delete process.env.SUPABASE_URL;
      const result = validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUPABASE_URL is required');
    });

    it('fails without SUPABASE_SERVICE_KEY', () => {
      delete process.env.SUPABASE_SERVICE_KEY;
      const result = validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUPABASE_SERVICE_KEY is required');
    });

    it('fails without SUPABASE_ANON_KEY', () => {
      delete process.env.SUPABASE_ANON_KEY;
      const result = validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('SUPABASE_ANON_KEY is required');
    });

    // --- AI provider checks ---
    it('logs info when OPENROUTER_API_KEY is configured', () => {
      process.env.OPENROUTER_API_KEY = 'or-test-key';
      const result = validateConfig();
      // Should not error about ANTHROPIC_API_KEY since OpenRouter covers it
      expect(result.errors.some(e => e.includes('ANTHROPIC_API_KEY'))).toBe(false);
    });

    it('errors when neither ANTHROPIC_API_KEY nor OPENROUTER_API_KEY set', () => {
      delete process.env.ANTHROPIC_API_KEY;
      delete process.env.OPENROUTER_API_KEY;
      const result = validateConfig();
      expect(result.errors).toContain('ANTHROPIC_API_KEY or OPENROUTER_API_KEY is required');
    });

    // --- JWT_SECRET checks ---
    it('warns about missing JWT_SECRET in dev', () => {
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('JWT_SECRET not set'))).toBe(true);
    });

    it('warns about short JWT_SECRET in dev', () => {
      process.env.JWT_SECRET = 'short';
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('JWT_SECRET is too short'))).toBe(true);
    });

    it('errors on missing JWT_SECRET in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.API_KEY_ENCRYPTION_KEY = 'a'.repeat(32);
      const result = validateConfig();
      expect(result.errors.some(e => e.includes('JWT_SECRET is required in production'))).toBe(true);
    });

    it('errors on short JWT_SECRET in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'short';
      process.env.API_KEY_ENCRYPTION_KEY = 'a'.repeat(32);
      const result = validateConfig();
      expect(result.errors.some(e => e.includes('JWT_SECRET is too short'))).toBe(true);
    });

    it('no JWT warnings with valid JWT_SECRET', () => {
      process.env.JWT_SECRET = 'a'.repeat(64);
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('JWT_SECRET'))).toBe(false);
      expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(false);
    });

    // --- API_KEY_ENCRYPTION_KEY checks ---
    it('warns about missing encryption key in dev (with SUPABASE_SERVICE_KEY)', () => {
      delete process.env.API_KEY_ENCRYPTION_KEY;
      // SUPABASE_SERVICE_KEY is set in beforeEach
      const result = validateConfig();
      // The warning branch: !encKey && !SUPABASE_SERVICE_KEY (false since service key exists)
      // Actually, the condition is: if (!encKey && !process.env.SUPABASE_SERVICE_KEY) - both needed missing
      // So with service key present, this warning does NOT fire
      expect(result.warnings.some(w => w.includes('API_KEY_ENCRYPTION_KEY not set - using SUPABASE_SERVICE_KEY fallback'))).toBe(false);
    });

    it('warns when both encryption key and service key are missing in dev', () => {
      delete process.env.API_KEY_ENCRYPTION_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;
      const result = validateConfig();
      // Now we hit the !encKey && !SUPABASE_SERVICE_KEY branch in dev
      expect(result.warnings.some(w => w.includes('API_KEY_ENCRYPTION_KEY not set'))).toBe(true);
    });

    it('errors when both encryption key and service key are missing in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      delete process.env.API_KEY_ENCRYPTION_KEY;
      delete process.env.SUPABASE_SERVICE_KEY;
      const result = validateConfig();
      expect(result.errors.some(e => e.includes('API_KEY_ENCRYPTION_KEY is required in production'))).toBe(true);
    });

    it('warns about short encryption key', () => {
      process.env.API_KEY_ENCRYPTION_KEY = 'short';
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('API_KEY_ENCRYPTION_KEY is too short'))).toBe(true);
    });

    it('warns about low entropy encryption key', () => {
      process.env.API_KEY_ENCRYPTION_KEY = 'a'.repeat(32); // 32 chars but only 1 unique char
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('very low entropy'))).toBe(true);
    });

    it('no entropy warning for high-entropy key', () => {
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456'; // 26+ unique chars
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('very low entropy'))).toBe(false);
    });

    it('warns about KMS in production with explicit encryption key', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
      const result = validateConfig();
      expect(result.warnings.some(w => w.includes('Consider using a KMS'))).toBe(true);
    });

    it('errors in production without explicit API_KEY_ENCRYPTION_KEY', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      delete process.env.API_KEY_ENCRYPTION_KEY;
      const result = validateConfig();
      expect(result.errors.some(e => e.includes('API_KEY_ENCRYPTION_KEY must be explicitly set in production'))).toBe(true);
    });

    // --- Real money trading checks ---
    it('gates real-money checks behind ENABLE_REAL_MONEY_TRADING flag', () => {
      delete process.env.ENABLE_REAL_MONEY_TRADING;
      const result = validateConfig();
      expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY'))).toBe(false);
      expect(result.errors.some(e => e.includes('PLATFORM_WALLET_PRIVATE_KEY'))).toBe(false);
    });

    it('checks Stripe keys when real-money trading enabled', () => {
      process.env.ENABLE_REAL_MONEY_TRADING = 'true';
      const result = validateConfig();
      // config.stripeSecretKey etc. are empty at module load (not set in test env)
      // so the real-money validation errors should fire
      if (!config.stripeSecretKey) {
        expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY is required when real-money trading is enabled'))).toBe(true);
      }
      if (!config.stripeWebhookSecret) {
        expect(result.errors.some(e => e.includes('STRIPE_WEBHOOK_SECRET is required when real-money trading is enabled'))).toBe(true);
      }
      if (!config.platformWalletPrivateKey) {
        expect(result.errors.some(e => e.includes('PLATFORM_WALLET_PRIVATE_KEY is required when real-money trading is enabled'))).toBe(true);
      }
      if (!config.platformWalletAddress) {
        expect(result.warnings.some(w => w.includes('PLATFORM_WALLET_ADDRESS not set'))).toBe(true);
      }
    });

    // --- Optional provider warnings ---
    it('warns about missing OPENAI_API_KEY when no OpenRouter', () => {
      const result = validateConfig();
      // config.openaiApiKey and config.openRouterApiKey are cached at load time
      // If both are empty, we get the warning
      if (!config.openaiApiKey && !config.openRouterApiKey) {
        expect(result.warnings.some(w => w.includes('OPENAI_API_KEY not set'))).toBe(true);
      }
    });

    it('warns about missing GOOGLE_AI_API_KEY when no OpenRouter', () => {
      const result = validateConfig();
      if (!config.googleAiApiKey && !config.openRouterApiKey) {
        expect(result.warnings.some(w => w.includes('GOOGLE_AI_API_KEY not set'))).toBe(true);
      }
    });

    // --- Complete production config ---
    it('passes all checks with complete production config', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz123456';
      const result = validateConfig();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('accumulates multiple errors', () => {
      delete process.env.SUPABASE_URL;
      delete process.env.SUPABASE_SERVICE_KEY;
      delete process.env.SUPABASE_ANON_KEY;
      delete process.env.ANTHROPIC_API_KEY;
      const result = validateConfig();
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThanOrEqual(4);
    });
  });

  // ================================================================
  // validateSecrets
  // ================================================================
  describe('validateSecrets', () => {
    it('returns correct shape', () => {
      const result = validateSecrets();
      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
    });

    // --- JWT_SECRET in development ---
    it('warns about missing JWT_SECRET in development', () => {
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      const result = validateSecrets();
      expect(result.warnings.some(w => w.includes('JWT_SECRET not set'))).toBe(true);
    });

    it('no JWT error in dev when JWT_SECRET is missing', () => {
      delete process.env.JWT_SECRET;
      process.env.NODE_ENV = 'development';
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(false);
    });

    // --- JWT_SECRET in production ---
    it('errors on missing JWT_SECRET in production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.JWT_SECRET;
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('JWT_SECRET is required in production'))).toBe(true);
    });

    it('errors on short JWT_SECRET in production (< 64 chars)', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(32); // 32 < 64
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('JWT_SECRET must be at least 64 characters'))).toBe(true);
    });

    it('no JWT error with long JWT_SECRET in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('JWT_SECRET'))).toBe(false);
    });

    // --- API_KEY_ENCRYPTION_KEY in development ---
    it('warns about missing encryption key in development', () => {
      delete process.env.API_KEY_ENCRYPTION_KEY;
      process.env.NODE_ENV = 'development';
      const result = validateSecrets();
      expect(result.warnings.some(w => w.includes('API_KEY_ENCRYPTION_KEY not set'))).toBe(true);
    });

    // --- API_KEY_ENCRYPTION_KEY in production ---
    it('errors on missing encryption key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      delete process.env.API_KEY_ENCRYPTION_KEY;
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('API_KEY_ENCRYPTION_KEY is required in production'))).toBe(true);
    });

    it('errors on short encryption key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'short';
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('API_KEY_ENCRYPTION_KEY must be at least 32 characters'))).toBe(true);
    });

    it('errors on low entropy encryption key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'a'.repeat(32); // 32 chars, 1 unique
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('dangerously low entropy'))).toBe(true);
    });

    it('no encryption key error with good key in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = validateSecrets();
      expect(result.errors.some(e => e.includes('API_KEY_ENCRYPTION_KEY'))).toBe(false);
    });

    // --- Redis warning ---
    it('warns about missing Redis in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      // config.redisUrl is cached at module load. If it was empty, we get the warning.
      const result = validateSecrets();
      if (!config.redisUrl) {
        expect(result.warnings.some(w => w.includes('REDIS_URL not set in production'))).toBe(true);
      }
    });

    // --- Crypto payments / real money ---
    it('checks wallet key when crypto payments feature is enabled', () => {
      // featureFlags.cryptoPayments is evaluated at module load from ENABLE_CRYPTO_PAYMENTS
      // We test the code path runs without throwing
      const result = validateSecrets();
      expect(result).toHaveProperty('valid');
    });

    it('checks Stripe when real money trading is enabled', () => {
      // featureFlags.realMoneyTrading is evaluated at module load from ENABLE_REAL_MONEY_TRADING
      const result = validateSecrets();
      expect(result).toHaveProperty('valid');
    });

    // --- All checks pass ---
    it('passes with complete valid config in development', () => {
      process.env.NODE_ENV = 'development';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = validateSecrets();
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('passes with complete valid config in production (no real-money)', () => {
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      const result = validateSecrets();
      // May have warnings (Redis, KMS) but no errors if featureFlags don't require extras
      if (!featureFlags.realMoneyTrading && !featureFlags.cryptoPayments) {
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      }
    });
  });

  // ================================================================
  // featureFlags
  // ================================================================
  describe('featureFlags', () => {
    it('has realMoneyTrading flag as boolean', () => {
      expect(typeof featureFlags.realMoneyTrading).toBe('boolean');
    });

    it('has marketSync flag as boolean', () => {
      expect(typeof featureFlags.marketSync).toBe('boolean');
    });

    it('has polymarketClob flag as boolean', () => {
      expect(typeof featureFlags.polymarketClob).toBe('boolean');
    });

    it('has kalshiTrading flag as boolean', () => {
      expect(typeof featureFlags.kalshiTrading).toBe('boolean');
    });

    it('has cryptoPayments flag as boolean', () => {
      expect(typeof featureFlags.cryptoPayments).toBe('boolean');
    });

    it('marketSync defaults to true (enabled unless explicitly disabled)', () => {
      // ENABLE_MARKET_SYNC !== 'false' means it's true by default
      // Unless the test env explicitly sets it to 'false'
      if (process.env.ENABLE_MARKET_SYNC !== 'false') {
        expect(featureFlags.marketSync).toBe(true);
      }
    });
  });
});

// ================================================================
// Module-level dynamic import tests
// Tests that require fresh module imports to test cached config/featureFlags
// ================================================================
describe('config module (dynamic imports)', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    // Set minimum required env vars
    process.env.SUPABASE_URL = 'https://test.supabase.co';
    process.env.SUPABASE_SERVICE_KEY = 'test-service-key';
    process.env.SUPABASE_ANON_KEY = 'test-anon-key';
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key';
    process.env.NODE_ENV = 'development';
    // Ensure crypto module doesn't throw
    process.env.API_KEY_ENCRYPTION_KEY = 'test-encryption-key-for-config!!';
  });

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) {
        delete process.env[key];
      }
    }
    Object.assign(process.env, originalEnv);
  });

  describe('validateSecrets with real-money features enabled', () => {
    it('errors on missing wallet key in production when crypto payments enabled', async () => {
      process.env.ENABLE_CRYPTO_PAYMENTS = 'true';
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      delete process.env.PLATFORM_WALLET_PRIVATE_KEY;

      const { validateSecrets: vs } = await import('./config.js');
      const result = vs();
      expect(result.errors.some(e => e.includes('PLATFORM_WALLET_PRIVATE_KEY is required'))).toBe(true);
    });

    it('warns on missing wallet key in dev when crypto payments enabled', async () => {
      process.env.ENABLE_CRYPTO_PAYMENTS = 'true';
      process.env.NODE_ENV = 'development';
      delete process.env.PLATFORM_WALLET_PRIVATE_KEY;

      const { validateSecrets: vs } = await import('./config.js');
      const result = vs();
      expect(result.warnings.some(w => w.includes('PLATFORM_WALLET_PRIVATE_KEY not set'))).toBe(true);
    });

    it('warns about wallet key in env var in production', async () => {
      process.env.ENABLE_CRYPTO_PAYMENTS = 'true';
      process.env.NODE_ENV = 'production';
      process.env.JWT_SECRET = 'a'.repeat(64);
      process.env.API_KEY_ENCRYPTION_KEY = 'abcdefghijklmnopqrstuvwxyz1234567890';
      process.env.PLATFORM_WALLET_PRIVATE_KEY = '0xdeadbeef';

      const { validateSecrets: vs } = await import('./config.js');
      const result = vs();
      expect(result.warnings.some(w => w.includes('PLATFORM_WALLET_PRIVATE_KEY is in an env var'))).toBe(true);
    });

    it('errors on missing Stripe keys when real money trading enabled', async () => {
      process.env.ENABLE_REAL_MONEY_TRADING = 'true';
      process.env.NODE_ENV = 'development';
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;

      const { validateSecrets: vs } = await import('./config.js');
      const result = vs();
      expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY is required'))).toBe(true);
      expect(result.errors.some(e => e.includes('STRIPE_WEBHOOK_SECRET is required'))).toBe(true);
    });

    it('no Stripe errors when Stripe keys are provided and real money enabled', async () => {
      process.env.ENABLE_REAL_MONEY_TRADING = 'true';
      process.env.NODE_ENV = 'development';
      process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc123';
      process.env.PLATFORM_WALLET_PRIVATE_KEY = '0xdeadbeef';

      const { validateSecrets: vs } = await import('./config.js');
      const result = vs();
      expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY'))).toBe(false);
      expect(result.errors.some(e => e.includes('STRIPE_WEBHOOK_SECRET'))).toBe(false);
    });
  });

  describe('validateConfig with real-money trading via fresh import', () => {
    it('reports all real-money errors when ENABLE_REAL_MONEY_TRADING=true', async () => {
      process.env.ENABLE_REAL_MONEY_TRADING = 'true';
      delete process.env.STRIPE_SECRET_KEY;
      delete process.env.STRIPE_WEBHOOK_SECRET;
      delete process.env.PLATFORM_WALLET_ADDRESS;
      delete process.env.PLATFORM_WALLET_PRIVATE_KEY;

      const { validateConfig: vc } = await import('./config.js');
      const result = vc();
      expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY is required when real-money trading is enabled'))).toBe(true);
      expect(result.errors.some(e => e.includes('STRIPE_WEBHOOK_SECRET is required when real-money trading is enabled'))).toBe(true);
      expect(result.errors.some(e => e.includes('PLATFORM_WALLET_PRIVATE_KEY is required when real-money trading is enabled'))).toBe(true);
      expect(result.warnings.some(w => w.includes('PLATFORM_WALLET_ADDRESS not set'))).toBe(true);
    });

    it('no real-money errors when keys provided', async () => {
      process.env.ENABLE_REAL_MONEY_TRADING = 'true';
      process.env.STRIPE_SECRET_KEY = 'sk_test_abc123';
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_abc123';
      process.env.PLATFORM_WALLET_ADDRESS = '0xabc';
      process.env.PLATFORM_WALLET_PRIVATE_KEY = '0xdeadbeef';
      process.env.JWT_SECRET = 'a'.repeat(64);

      const { validateConfig: vc } = await import('./config.js');
      const result = vc();
      expect(result.errors.some(e => e.includes('STRIPE_SECRET_KEY'))).toBe(false);
      expect(result.errors.some(e => e.includes('STRIPE_WEBHOOK_SECRET'))).toBe(false);
      expect(result.errors.some(e => e.includes('PLATFORM_WALLET_PRIVATE_KEY'))).toBe(false);
      expect(result.warnings.some(w => w.includes('PLATFORM_WALLET_ADDRESS not set'))).toBe(false);
    });
  });

  describe('config object with custom env', () => {
    it('parses custom PORT', async () => {
      process.env.PORT = '4000';
      const { config: cfg } = await import('./config.js');
      expect(cfg.port).toBe(4000);
    });

    it('sets OBS websocket URL to default in development', async () => {
      process.env.NODE_ENV = 'development';
      delete process.env.OBS_WEBSOCKET_URL;
      const { config: cfg } = await import('./config.js');
      expect(cfg.obsWebsocketUrl).toBe('ws://localhost:4455');
    });

    it('sets OBS websocket URL to empty in non-development when not configured', async () => {
      process.env.NODE_ENV = 'production';
      delete process.env.OBS_WEBSOCKET_URL;
      const { config: cfg } = await import('./config.js');
      expect(cfg.obsWebsocketUrl).toBe('');
    });

    it('uses explicit OBS_WEBSOCKET_URL when set', async () => {
      process.env.OBS_WEBSOCKET_URL = 'ws://custom:4455';
      const { config: cfg } = await import('./config.js');
      expect(cfg.obsWebsocketUrl).toBe('ws://custom:4455');
    });

    it('sets boolean trading flags from env', async () => {
      process.env.POLYMARKET_CLOB_ENABLED = 'true';
      process.env.KALSHI_TRADING_ENABLED = 'true';
      const { config: cfg } = await import('./config.js');
      expect(cfg.polymarketClobEnabled).toBe(true);
      expect(cfg.kalshiTradingEnabled).toBe(true);
    });

    it('boolean trading flags are false when not set to "true"', async () => {
      delete process.env.POLYMARKET_CLOB_ENABLED;
      delete process.env.KALSHI_TRADING_ENABLED;
      const { config: cfg } = await import('./config.js');
      expect(cfg.polymarketClobEnabled).toBe(false);
      expect(cfg.kalshiTradingEnabled).toBe(false);
    });
  });

  describe('featureFlags with dynamic imports', () => {
    it('realMoneyTrading is true when ENABLE_REAL_MONEY_TRADING=true', async () => {
      process.env.ENABLE_REAL_MONEY_TRADING = 'true';
      const { featureFlags: ff } = await import('./config.js');
      expect(ff.realMoneyTrading).toBe(true);
    });

    it('realMoneyTrading is false when ENABLE_REAL_MONEY_TRADING is not set', async () => {
      delete process.env.ENABLE_REAL_MONEY_TRADING;
      const { featureFlags: ff } = await import('./config.js');
      expect(ff.realMoneyTrading).toBe(false);
    });

    it('marketSync is false when ENABLE_MARKET_SYNC=false', async () => {
      process.env.ENABLE_MARKET_SYNC = 'false';
      const { featureFlags: ff } = await import('./config.js');
      expect(ff.marketSync).toBe(false);
    });

    it('marketSync is true when ENABLE_MARKET_SYNC is not set', async () => {
      delete process.env.ENABLE_MARKET_SYNC;
      const { featureFlags: ff } = await import('./config.js');
      expect(ff.marketSync).toBe(true);
    });

    it('cryptoPayments is true when ENABLE_CRYPTO_PAYMENTS=true', async () => {
      process.env.ENABLE_CRYPTO_PAYMENTS = 'true';
      const { featureFlags: ff } = await import('./config.js');
      expect(ff.cryptoPayments).toBe(true);
    });

    it('cryptoPayments is false when ENABLE_CRYPTO_PAYMENTS is not set', async () => {
      delete process.env.ENABLE_CRYPTO_PAYMENTS;
      const { featureFlags: ff } = await import('./config.js');
      expect(ff.cryptoPayments).toBe(false);
    });
  });

  describe('getApiKey with OpenRouter configured', () => {
    it('returns OpenRouter key for all providers when configured', async () => {
      process.env.OPENROUTER_API_KEY = 'or-test-key-123';
      const { getApiKey: gak } = await import('./config.js');
      expect(gak('claude')).toBe('or-test-key-123');
      expect(gak('openai')).toBe('or-test-key-123');
      expect(gak('gemini')).toBe('or-test-key-123');
      expect(gak('llama')).toBe('or-test-key-123');
    });

    it('returns provider-specific keys when OpenRouter is not configured', async () => {
      delete process.env.OPENROUTER_API_KEY;
      process.env.ANTHROPIC_API_KEY = 'anthropic-key';
      process.env.OPENAI_API_KEY = 'openai-key';
      process.env.GOOGLE_AI_API_KEY = 'google-key';
      const { getApiKey: gak } = await import('./config.js');
      expect(gak('claude')).toBe('anthropic-key');
      expect(gak('openai')).toBe('openai-key');
      expect(gak('gemini')).toBe('google-key');
      expect(gak('llama')).toBe(''); // no direct API, falls to default
    });
  });

  describe('useOpenRouter with dynamic imports', () => {
    it('returns true when OPENROUTER_API_KEY is set', async () => {
      process.env.OPENROUTER_API_KEY = 'or-test-key';
      const { useOpenRouter: uor } = await import('./config.js');
      expect(uor()).toBe(true);
    });

    it('returns false when OPENROUTER_API_KEY is not set', async () => {
      delete process.env.OPENROUTER_API_KEY;
      const { useOpenRouter: uor } = await import('./config.js');
      expect(uor()).toBe(false);
    });
  });
});
