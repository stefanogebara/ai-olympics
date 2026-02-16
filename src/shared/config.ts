import 'dotenv/config';
import type { AgentConfig, AgentProvider } from './types/index.js';

// Environment configuration with defaults
export const config = {
  // Server
  port: parseInt(process.env.PORT || '3003', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // AI APIs
  openRouterApiKey: process.env.OPENROUTER_API_KEY || '',
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  googleAiApiKey: process.env.GOOGLE_AI_API_KEY || '',

  // Streaming
  obsWebsocketUrl: process.env.OBS_WEBSOCKET_URL || (process.env.NODE_ENV === 'development' ? 'ws://localhost:4455' : ''),
  obsWebsocketPassword: process.env.OBS_WEBSOCKET_PASSWORD || '',

  // Docker
  dockerSocket: process.env.DOCKER_SOCKET || '/var/run/docker.sock',

  // Markets
  manifoldApiKey: process.env.MANIFOLD_API_KEY || '',
  kalshiApiKey: process.env.KALSHI_API_KEY || '',

  // ElevenLabs
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY || '',

  // Payments - Stripe
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || '',
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',

  // Crypto - Polygon
  polygonRpcUrl: process.env.POLYGON_RPC_URL || 'https://polygon-rpc.com',
  platformWalletAddress: process.env.PLATFORM_WALLET_ADDRESS || '',
  platformWalletPrivateKey: process.env.PLATFORM_WALLET_PRIVATE_KEY || '',

  // Trading feature flags
  polymarketClobEnabled: process.env.POLYMARKET_CLOB_ENABLED === 'true',
  kalshiTradingEnabled: process.env.KALSHI_TRADING_ENABLED === 'true',

  // Redis (optional - enables event resilience and crash recovery)
  redisUrl: process.env.REDIS_URL || '',

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
    model: 'claude-opus-4-6',
    color: '#D97706',  // Anthropic orange
    avatar: '🧠'
  },
  'gpt-4': {
    id: 'gpt-4o',
    name: 'GPT-4',
    provider: 'openai',
    model: 'gpt-4.1',
    color: '#10B981',  // OpenAI green
    avatar: '🤖'
  },
  gemini: {
    id: 'gemini-pro',
    name: 'Gemini',
    provider: 'gemini',
    model: 'gemini-2.5-flash',
    color: '#4285F4',  // Google blue
    avatar: '💎'
  },
  llama: {
    id: 'llama-4',
    name: 'Llama 4',
    provider: 'llama',
    model: 'llama-4-maverick',
    color: '#7C3AED',  // Purple
    avatar: '🦙'
  }
};

// Get API key for a provider (OpenRouter takes priority if configured)
export function getApiKey(provider: AgentProvider): string {
  // If OpenRouter is configured, it handles all providers
  if (config.openRouterApiKey) {
    return config.openRouterApiKey;
  }

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

// Check if OpenRouter is configured
export function useOpenRouter(): boolean {
  return !!config.openRouterApiKey;
}

// Validate required configuration
export function validateConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  // ========== CRITICAL: Required for operation ==========

  // Supabase
  if (!process.env.SUPABASE_URL) {
    errors.push('SUPABASE_URL is required');
  }
  if (!process.env.SUPABASE_SERVICE_KEY) {
    errors.push('SUPABASE_SERVICE_KEY is required');
  }
  if (!process.env.SUPABASE_ANON_KEY) {
    errors.push('SUPABASE_ANON_KEY is required');
  }

  // At least one AI provider (check process.env directly so tests can override)
  if (process.env.OPENROUTER_API_KEY) {
    console.log('  OpenRouter API key configured - all models available');
  } else if (!process.env.ANTHROPIC_API_KEY) {
    errors.push('ANTHROPIC_API_KEY or OPENROUTER_API_KEY is required');
  }

  // ========== HIGH: Security secrets ==========
  const isProduction = process.env.NODE_ENV === 'production';

  // JWT secret validation - required in production
  const jwtSecret = process.env.JWT_SECRET || '';
  if (!jwtSecret) {
    if (isProduction) {
      errors.push('JWT_SECRET is required in production');
    } else {
      warnings.push('JWT_SECRET not set - using insecure default');
    }
  } else if (jwtSecret.length < 32) {
    if (isProduction) {
      errors.push('JWT_SECRET is too short (< 32 chars) - minimum 32 chars required in production');
    } else {
      warnings.push('JWT_SECRET is too short (< 32 chars) - increase for production security');
    }
  }

  // API key encryption - required in production (agents store encrypted API keys)
  const encKey = process.env.API_KEY_ENCRYPTION_KEY || '';
  if (!encKey && !process.env.SUPABASE_SERVICE_KEY) {
    if (isProduction) {
      errors.push('API_KEY_ENCRYPTION_KEY is required in production for agent API key storage');
    } else {
      warnings.push('API_KEY_ENCRYPTION_KEY not set - using SUPABASE_SERVICE_KEY fallback (not recommended for production)');
    }
  } else if (encKey && encKey.length < 32) {
    warnings.push('API_KEY_ENCRYPTION_KEY is too short (< 32 chars) - use at least 32 random characters');
  } else if (encKey) {
    // Entropy check: detect obviously weak keys (repeated chars, sequential patterns)
    const uniqueChars = new Set(encKey).size;
    if (uniqueChars < 8) {
      warnings.push('API_KEY_ENCRYPTION_KEY has very low entropy (< 8 unique characters) - use a cryptographically random value');
    }
  }

  // KMS recommendation in production
  if (isProduction && encKey) {
    warnings.push('API_KEY_ENCRYPTION_KEY is stored in a plain environment variable. Consider using a KMS (AWS KMS, GCP Cloud KMS, HashiCorp Vault) for production key management.');
  }

  // ========== MEDIUM: Optional but warn ==========

  if (!config.openaiApiKey && !config.openRouterApiKey) {
    warnings.push('OPENAI_API_KEY not set - GPT-4 agent will be unavailable');
  }
  if (!config.googleAiApiKey && !config.openRouterApiKey) {
    warnings.push('GOOGLE_AI_API_KEY not set - Gemini agent will be unavailable');
  }

  // Stripe (only warn if real money is enabled)
  if (process.env.ENABLE_REAL_MONEY_TRADING === 'true') {
    if (!config.stripeSecretKey) {
      errors.push('STRIPE_SECRET_KEY is required when real-money trading is enabled');
    }
    if (!config.stripeWebhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET is required when real-money trading is enabled');
    }
    if (!config.platformWalletAddress) {
      warnings.push('PLATFORM_WALLET_ADDRESS not set - crypto payments will be unavailable');
    }
    if (!config.platformWalletPrivateKey) {
      errors.push('PLATFORM_WALLET_PRIVATE_KEY is required when real-money trading is enabled');
    }
  }

  // Production-only: refuse to run without encryption keys
  if (isProduction && !process.env.API_KEY_ENCRYPTION_KEY) {
    errors.push('API_KEY_ENCRYPTION_KEY must be explicitly set in production (do not rely on SUPABASE_SERVICE_KEY fallback)');
  }

  // Print summary
  if (errors.length > 0) {
    console.error('\n  Configuration errors:');
    errors.forEach(e => console.error(`    ${e}`));
  }
  if (warnings.length > 0) {
    console.warn('\n  Configuration warnings:');
    warnings.forEach(w => console.warn(`    ${w}`));
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  All configuration checks passed');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

// ========================================================================
// CENTRALIZED FEATURE FLAGS
// All feature gates in one place. Backend routes (payments, trading,
// competitions) already check ENABLE_REAL_MONEY_TRADING; this object
// gives a single import for new code.
// ========================================================================
export const featureFlags = {
  /** Allow real-money deposits, withdrawals, and trading. */
  realMoneyTrading: process.env.ENABLE_REAL_MONEY_TRADING === 'true',

  /** Enable background market sync from PolyRouter (Polymarket + Kalshi). */
  marketSync: process.env.ENABLE_MARKET_SYNC !== 'false', // on by default

  /** Enable Polymarket CLOB direct trading. */
  polymarketClob: process.env.POLYMARKET_CLOB_ENABLED === 'true',

  /** Enable Kalshi direct trading. */
  kalshiTrading: process.env.KALSHI_TRADING_ENABLED === 'true',

  /** Enable crypto (Polygon) payments. */
  cryptoPayments: process.env.ENABLE_CRYPTO_PAYMENTS === 'true',
} as const;

// ========================================================================
// PRODUCTION SECRET VALIDATION
// Called on server startup. In production, refuses to start if critical
// secrets are missing or obviously weak. In development, logs warnings.
// ========================================================================
export function validateSecrets(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const isProduction = process.env.NODE_ENV === 'production';

  // JWT Secret - must be strong in production
  const jwtSecret = process.env.JWT_SECRET || '';
  if (isProduction) {
    if (!jwtSecret) {
      errors.push('JWT_SECRET is required in production');
    } else if (jwtSecret.length < 64) {
      errors.push('JWT_SECRET must be at least 64 characters in production');
    }
  } else if (!jwtSecret) {
    warnings.push('JWT_SECRET not set - using insecure default (set for production)');
  }

  // API Key Encryption Key
  const encKey = process.env.API_KEY_ENCRYPTION_KEY || '';
  if (isProduction) {
    if (!encKey) {
      errors.push('API_KEY_ENCRYPTION_KEY is required in production');
    } else if (encKey.length < 32) {
      errors.push('API_KEY_ENCRYPTION_KEY must be at least 32 characters in production');
    } else {
      const uniqueChars = new Set(encKey).size;
      if (uniqueChars < 10) {
        errors.push('API_KEY_ENCRYPTION_KEY has dangerously low entropy (< 10 unique chars)');
      }
    }
  } else if (!encKey) {
    warnings.push('API_KEY_ENCRYPTION_KEY not set - using fallback (not safe for production)');
  }

  // Platform wallet private key (only if crypto payments enabled)
  if (featureFlags.cryptoPayments || featureFlags.realMoneyTrading) {
    if (!config.platformWalletPrivateKey) {
      if (isProduction) {
        errors.push('PLATFORM_WALLET_PRIVATE_KEY is required when real-money or crypto features are enabled');
      } else {
        warnings.push('PLATFORM_WALLET_PRIVATE_KEY not set - crypto payouts disabled');
      }
    }
    if (isProduction && config.platformWalletPrivateKey) {
      warnings.push('PLATFORM_WALLET_PRIVATE_KEY is in an env var - migrate to KMS/Vault for production');
    }
  }

  // Stripe secrets (only if real money enabled)
  if (featureFlags.realMoneyTrading) {
    if (!config.stripeSecretKey) {
      errors.push('STRIPE_SECRET_KEY is required when ENABLE_REAL_MONEY_TRADING=true');
    }
    if (!config.stripeWebhookSecret) {
      errors.push('STRIPE_WEBHOOK_SECRET is required when ENABLE_REAL_MONEY_TRADING=true');
    }
  }

  // Print summary
  if (errors.length > 0) {
    console.error('\n  Secret validation errors:');
    errors.forEach(e => console.error(`    ${e}`));
  }
  if (warnings.length > 0) {
    console.warn('\n  Secret validation warnings:');
    warnings.forEach(w => console.warn(`    ${w}`));
  }
  if (errors.length === 0 && warnings.length === 0) {
    console.log('  All secret checks passed');
  }

  return { valid: errors.length === 0, errors, warnings };
}

export default config;
