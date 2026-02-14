import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CircuitBreaker, CircuitOpenError } from './circuit-breaker.js';

describe('CircuitBreaker', () => {
  let cb: CircuitBreaker;

  beforeEach(() => {
    cb = new CircuitBreaker({
      name: 'Test',
      failureThreshold: 3,
      cooldownMs: 1000,
      timeoutMs: 500,
    });
  });

  describe('CLOSED state', () => {
    it('passes through successful calls', async () => {
      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('propagates errors but stays closed under threshold', async () => {
      await expect(cb.execute(() => Promise.reject(new Error('fail')))).rejects.toThrow('fail');
      expect(cb.getState()).toBe('CLOSED');

      await expect(cb.execute(() => Promise.reject(new Error('fail2')))).rejects.toThrow('fail2');
      expect(cb.getState()).toBe('CLOSED');
    });

    it('resets failure count on success', async () => {
      // 2 failures
      await cb.execute(() => Promise.reject(new Error('f1'))).catch(() => {});
      await cb.execute(() => Promise.reject(new Error('f2'))).catch(() => {});

      // 1 success resets count
      await cb.execute(() => Promise.resolve('ok'));

      // 2 more failures should not open (count reset)
      await cb.execute(() => Promise.reject(new Error('f3'))).catch(() => {});
      await cb.execute(() => Promise.reject(new Error('f4'))).catch(() => {});
      expect(cb.getState()).toBe('CLOSED');
    });
  });

  describe('OPEN state', () => {
    it('opens after reaching failure threshold', async () => {
      for (let i = 0; i < 3; i++) {
        await cb.execute(() => Promise.reject(new Error(`fail${i}`))).catch(() => {});
      }
      expect(cb.getState()).toBe('OPEN');
    });

    it('rejects immediately when open', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      }

      await expect(cb.execute(() => Promise.resolve('ok'))).rejects.toThrow(CircuitOpenError);
    });

    it('CircuitOpenError has correct name', async () => {
      for (let i = 0; i < 3; i++) {
        await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      }

      try {
        await cb.execute(() => Promise.resolve('ok'));
      } catch (e) {
        expect(e).toBeInstanceOf(CircuitOpenError);
        expect((e as Error).name).toBe('CircuitOpenError');
      }
    });
  });

  describe('HALF_OPEN state', () => {
    it('transitions to HALF_OPEN after cooldown expires', async () => {
      // Use a very short cooldown
      const fastCb = new CircuitBreaker({
        name: 'FastTest',
        failureThreshold: 2,
        cooldownMs: 50,
        timeoutMs: 500,
      });

      // Open the circuit
      await fastCb.execute(() => Promise.reject(new Error('f1'))).catch(() => {});
      await fastCb.execute(() => Promise.reject(new Error('f2'))).catch(() => {});
      expect(fastCb.getState()).toBe('OPEN');

      // Wait for cooldown
      await new Promise(resolve => setTimeout(resolve, 60));

      // Next call should be allowed (probe)
      const result = await fastCb.execute(() => Promise.resolve('recovered'));
      expect(result).toBe('recovered');
      expect(fastCb.getState()).toBe('CLOSED');
    });

    it('returns to OPEN if probe fails', async () => {
      const fastCb = new CircuitBreaker({
        name: 'FastTest',
        failureThreshold: 2,
        cooldownMs: 50,
        timeoutMs: 500,
      });

      await fastCb.execute(() => Promise.reject(new Error('f1'))).catch(() => {});
      await fastCb.execute(() => Promise.reject(new Error('f2'))).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 60));

      // Probe fails
      await fastCb.execute(() => Promise.reject(new Error('probe fail'))).catch(() => {});
      expect(fastCb.getState()).toBe('OPEN');
    });
  });

  describe('timeout', () => {
    it('rejects slow calls that exceed timeout', async () => {
      const slowFn = () => new Promise<string>(resolve => setTimeout(() => resolve('slow'), 1000));

      await expect(cb.execute(slowFn)).rejects.toThrow('timeout');
    });
  });

  describe('reset', () => {
    it('manually resets the circuit to CLOSED', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        await cb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      }
      expect(cb.getState()).toBe('OPEN');

      cb.reset();
      expect(cb.getState()).toBe('CLOSED');

      // Should work again
      const result = await cb.execute(() => Promise.resolve('ok'));
      expect(result).toBe('ok');
    });
  });

  describe('default options', () => {
    it('uses default threshold of 5 when not specified', async () => {
      const defaultCb = new CircuitBreaker({ name: 'Default' });

      // 4 failures should not open
      for (let i = 0; i < 4; i++) {
        await defaultCb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      }
      expect(defaultCb.getState()).toBe('CLOSED');

      // 5th failure opens
      await defaultCb.execute(() => Promise.reject(new Error('fail'))).catch(() => {});
      expect(defaultCb.getState()).toBe('OPEN');
    });
  });
});
