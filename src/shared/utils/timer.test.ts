import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrecisionTimer, formatDuration, formatTimerDisplay } from './timer.js';

describe('formatDuration', () => {
  it('formats milliseconds under 1s', () => {
    expect(formatDuration(0)).toBe('0ms');
    expect(formatDuration(50)).toBe('50ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats seconds under 1 minute', () => {
    expect(formatDuration(1000)).toBe('1.00s');
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(59999)).toBe('60.00s');
  });

  it('formats minutes', () => {
    expect(formatDuration(60000)).toBe('1m 0.0s');
    expect(formatDuration(90000)).toBe('1m 30.0s');
    expect(formatDuration(150500)).toBe('2m 30.5s');
  });
});

describe('formatTimerDisplay', () => {
  it('formats zero', () => {
    expect(formatTimerDisplay(0)).toBe('00:00.00');
  });

  it('formats seconds and centiseconds', () => {
    expect(formatTimerDisplay(5230)).toBe('00:05.23');
  });

  it('formats minutes', () => {
    expect(formatTimerDisplay(65000)).toBe('01:05.00');
  });

  it('pads single digits', () => {
    expect(formatTimerDisplay(1010)).toBe('00:01.01');
  });

  it('handles large values', () => {
    expect(formatTimerDisplay(3661230)).toBe('61:01.23');
  });
});

describe('PrecisionTimer', () => {
  let timer: PrecisionTimer;

  beforeEach(() => {
    timer = new PrecisionTimer();
  });

  it('starts at 0 elapsed', () => {
    expect(timer.elapsed()).toBe(0);
  });

  it('returns 0 for elapsedSeconds before start', () => {
    expect(timer.elapsedSeconds()).toBe(0);
  });

  it('tracks elapsed time after start', async () => {
    timer.start();
    // Wait a small amount
    await new Promise(r => setTimeout(r, 50));
    const elapsed = timer.elapsed();
    expect(elapsed).toBeGreaterThan(0);
    expect(elapsed).toBeLessThan(200); // generous upper bound
  });

  it('ignores double start', async () => {
    timer.start();
    await new Promise(r => setTimeout(r, 20));
    const elapsed1 = timer.elapsed();
    timer.start(); // should be no-op
    const elapsed2 = timer.elapsed();
    // elapsed2 should be >= elapsed1 (didn't reset)
    expect(elapsed2).toBeGreaterThanOrEqual(elapsed1);
  });

  it('stops and preserves final elapsed', async () => {
    timer.start();
    await new Promise(r => setTimeout(r, 30));
    const stopped = timer.stop();
    expect(stopped).toBeGreaterThan(0);

    // After stop, elapsed should be frozen
    await new Promise(r => setTimeout(r, 30));
    expect(timer.elapsed()).toBe(stopped);
  });

  it('returns 0 when stopped without starting', () => {
    expect(timer.stop()).toBe(0);
  });

  it('resets all state', async () => {
    timer.start();
    await new Promise(r => setTimeout(r, 20));
    timer.stop();
    timer.reset();
    expect(timer.elapsed()).toBe(0);
  });

  it('pauses and resumes correctly', async () => {
    timer.start();
    await new Promise(r => setTimeout(r, 30));
    timer.pause();
    const pausedElapsed = timer.elapsed();

    // While paused, elapsed should not increase
    await new Promise(r => setTimeout(r, 50));
    expect(timer.elapsed()).toBe(pausedElapsed);

    // Resume and verify elapsed increases again
    timer.resume();
    await new Promise(r => setTimeout(r, 30));
    expect(timer.elapsed()).toBeGreaterThan(pausedElapsed);
  });

  it('pause is no-op when not running', () => {
    timer.pause(); // should not throw
    expect(timer.elapsed()).toBe(0);
  });

  it('resume is no-op when not paused', () => {
    timer.start();
    timer.resume(); // should not throw
  });

  it('stop while paused accounts for pause duration', async () => {
    timer.start();
    await new Promise(r => setTimeout(r, 20));
    timer.pause();
    await new Promise(r => setTimeout(r, 50));
    const stopped = timer.stop();
    // stopped should be ~20ms, NOT ~70ms (50ms pause excluded)
    expect(stopped).toBeLessThan(45);
    expect(stopped).toBeGreaterThan(5);
  });

  it('elapsedSeconds returns seconds', async () => {
    timer.start();
    await new Promise(r => setTimeout(r, 100));
    const seconds = timer.elapsedSeconds();
    expect(seconds).toBeGreaterThan(0.05);
    expect(seconds).toBeLessThan(1);
    timer.stop();
  });
});
