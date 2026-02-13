/**
 * Lightweight circuit breaker for external API calls.
 *
 * States:
 * - CLOSED: normal operation, requests pass through
 * - OPEN: too many failures, requests fail immediately
 * - HALF_OPEN: after cooldown, one probe request is allowed
 */

import { createLogger } from './logger.js';

const log = createLogger('CircuitBreaker');

type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

interface CircuitBreakerOptions {
  /** Name for logging */
  name: string;
  /** Number of failures before opening the circuit */
  failureThreshold?: number;
  /** Milliseconds to wait before trying again (half-open) */
  cooldownMs?: number;
  /** Milliseconds before a request is considered timed out */
  timeoutMs?: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime = 0;
  private readonly name: string;
  private readonly failureThreshold: number;
  private readonly cooldownMs: number;
  private readonly timeoutMs: number;

  constructor(options: CircuitBreakerOptions) {
    this.name = options.name;
    this.failureThreshold = options.failureThreshold ?? 5;
    this.cooldownMs = options.cooldownMs ?? 30_000;
    this.timeoutMs = options.timeoutMs ?? 15_000;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.cooldownMs) {
        this.state = 'HALF_OPEN';
        log.info(`Circuit ${this.name}: HALF_OPEN (probe allowed)`);
      } else {
        throw new CircuitOpenError(
          `Circuit ${this.name} is OPEN. Retry after ${Math.ceil((this.cooldownMs - (Date.now() - this.lastFailureTime)) / 1000)}s`
        );
      }
    }

    try {
      const result = await Promise.race([
        fn(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`Circuit ${this.name}: timeout after ${this.timeoutMs}ms`)), this.timeoutMs)
        ),
      ]);

      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'HALF_OPEN') {
      log.info(`Circuit ${this.name}: CLOSED (probe succeeded)`);
    }
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      log.warn(`Circuit ${this.name}: OPEN after ${this.failureCount} failures`);
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  reset(): void {
    this.state = 'CLOSED';
    this.failureCount = 0;
    this.lastFailureTime = 0;
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}

// ============================================================================
// Pre-configured circuit breakers for external services
// ============================================================================

export const circuits = {
  polymarket: new CircuitBreaker({ name: 'Polymarket', failureThreshold: 5, cooldownMs: 60_000 }),
  kalshi: new CircuitBreaker({ name: 'Kalshi', failureThreshold: 5, cooldownMs: 60_000 }),
  openrouter: new CircuitBreaker({ name: 'OpenRouter', failureThreshold: 3, cooldownMs: 30_000 }),
  manifold: new CircuitBreaker({ name: 'Manifold', failureThreshold: 5, cooldownMs: 60_000 }),
  stripe: new CircuitBreaker({ name: 'Stripe', failureThreshold: 3, cooldownMs: 30_000 }),
  polyrouter: new CircuitBreaker({ name: 'PolyRouter', failureThreshold: 5, cooldownMs: 60_000 }),
};
