import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PrecisionTimer, formatDuration, formatTimerDisplay, createCountdown } from './timer.js';

// ---------------------------------------------------------------------------
// PrecisionTimer
// ---------------------------------------------------------------------------
describe('PrecisionTimer', () => {
  let timer: PrecisionTimer;
  let currentTime: number;
  let mockNow: ReturnType<typeof vi.spyOn>;

  const advanceTime = (ms: number) => {
    currentTime += ms;
  };

  beforeEach(() => {
    timer = new PrecisionTimer();
    currentTime = 1000; // start at 1000 to avoid 0-edge issues
    mockNow = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    mockNow.mockRestore();
  });

  // -- Initial state --
  it('returns 0 elapsed before start', () => {
    expect(timer.elapsed()).toBe(0);
  });

  it('returns 0 elapsedSeconds before start', () => {
    expect(timer.elapsedSeconds()).toBe(0);
  });

  // -- start() --
  it('tracks elapsed time after start', () => {
    timer.start();
    advanceTime(250);
    expect(timer.elapsed()).toBe(250);
  });

  it('ignores double start (no-op)', () => {
    timer.start(); // startTime = 1000
    advanceTime(100);
    timer.start(); // should be ignored
    advanceTime(50);
    // elapsed should be 150 (from original start), not 50
    expect(timer.elapsed()).toBe(150);
  });

  // -- pause() --
  it('pauses the timer and freezes elapsed', () => {
    timer.start();
    advanceTime(200);
    timer.pause();
    const pausedElapsed = timer.elapsed();
    advanceTime(500); // time passes while paused
    expect(timer.elapsed()).toBe(pausedElapsed);
  });

  it('pause is no-op when not running', () => {
    timer.pause(); // should not throw
    expect(timer.elapsed()).toBe(0);
  });

  it('pause is no-op when already paused', () => {
    timer.start();
    advanceTime(100);
    timer.pause(); // pauseTime = 1100
    advanceTime(50);
    timer.pause(); // should be no-op, pauseTime stays 1100
    advanceTime(50);
    timer.resume();
    // pausedDuration should be 100 (from 1100 to 1200), not 50
    advanceTime(100);
    // elapsed = (now=1300) - (start=1000) - (pausedDuration=100) = 200
    expect(timer.elapsed()).toBe(200);
  });

  // -- resume() --
  it('resumes from paused state and excludes paused time', () => {
    timer.start(); // t=1000
    advanceTime(100); // t=1100
    timer.pause(); // pauseTime=1100
    advanceTime(300); // t=1400 (paused)
    timer.resume(); // pausedDuration += 300
    advanceTime(100); // t=1500
    // elapsed = 1500 - 1000 - 300 = 200
    expect(timer.elapsed()).toBe(200);
  });

  it('resume is no-op when not paused', () => {
    timer.start();
    advanceTime(100);
    timer.resume(); // not paused, no-op
    expect(timer.elapsed()).toBe(100);
  });

  it('resume is no-op before start', () => {
    timer.resume(); // should not throw
    expect(timer.elapsed()).toBe(0);
  });

  // -- stop() --
  it('stops and returns final elapsed', () => {
    timer.start();
    advanceTime(500);
    const stopped = timer.stop();
    expect(stopped).toBe(500);
  });

  it('freezes elapsed after stop', () => {
    timer.start();
    advanceTime(300);
    const stopped = timer.stop();
    advanceTime(1000); // time passes after stop
    expect(timer.elapsed()).toBe(stopped);
  });

  it('returns 0 when stopped without starting', () => {
    expect(timer.stop()).toBe(0);
  });

  it('returns same value on repeated stop calls', () => {
    timer.start();
    advanceTime(200);
    const first = timer.stop();
    advanceTime(500);
    const second = timer.stop();
    expect(second).toBe(first);
  });

  it('stop while paused uses pauseTime as end (excludes time after pause)', () => {
    timer.start(); // t=1000
    advanceTime(100); // t=1100
    timer.pause(); // pauseTime=1100
    advanceTime(500); // t=1600 (paused, should be ignored)
    const stopped = timer.stop();
    // elapsed = pauseTime(1100) - startTime(1000) - pausedDuration(0) = 100
    expect(stopped).toBe(100);
  });

  it('stop while paused with prior pause/resume cycles', () => {
    timer.start(); // t=1000
    advanceTime(100); // t=1100, running for 100
    timer.pause(); // pauseTime=1100
    advanceTime(200); // t=1300, paused for 200
    timer.resume(); // pausedDuration=200
    advanceTime(150); // t=1450, running for 150
    timer.pause(); // pauseTime=1450
    advanceTime(800); // t=2250, paused
    const stopped = timer.stop();
    // elapsed = pauseTime(1450) - startTime(1000) - pausedDuration(200) = 250
    expect(stopped).toBe(250);
  });

  // -- elapsed() --
  it('elapsed returns current time while running', () => {
    timer.start();
    advanceTime(123);
    expect(timer.elapsed()).toBe(123);
    advanceTime(77);
    expect(timer.elapsed()).toBe(200);
  });

  // -- elapsedSeconds() --
  it('elapsedSeconds divides by 1000', () => {
    timer.start();
    advanceTime(2500);
    expect(timer.elapsedSeconds()).toBe(2.5);
  });

  it('elapsedSeconds returns 0 after stop without start', () => {
    timer.stop();
    expect(timer.elapsedSeconds()).toBe(0);
  });

  // -- reset() --
  it('resets all state back to initial', () => {
    timer.start();
    advanceTime(500);
    timer.pause();
    advanceTime(100);
    timer.stop();
    timer.reset();
    expect(timer.elapsed()).toBe(0);
    expect(timer.elapsedSeconds()).toBe(0);
  });

  it('can be restarted after reset', () => {
    timer.start();
    advanceTime(100);
    timer.stop();
    timer.reset();
    advanceTime(50);
    timer.start();
    advanceTime(200);
    expect(timer.elapsed()).toBe(200);
  });

  // -- Full lifecycle --
  it('full lifecycle: start -> pause -> resume -> pause -> resume -> stop', () => {
    timer.start();       // t=1000
    advanceTime(100);    // running 100
    timer.pause();       // t=1100
    advanceTime(50);     // paused 50
    timer.resume();      // pausedDuration=50
    advanceTime(200);    // running 200
    timer.pause();       // t=1350
    advanceTime(75);     // paused 75
    timer.resume();      // pausedDuration=125
    advanceTime(150);    // running 150
    const stopped = timer.stop();
    // total running = 100 + 200 + 150 = 450
    // total paused = 50 + 75 = 125
    // elapsed = (now=1575) - (start=1000) - (paused=125) = 450
    expect(stopped).toBe(450);
  });

  it('elapsed matches stop value after stopping', () => {
    timer.start();
    advanceTime(333);
    timer.pause();
    advanceTime(111);
    timer.resume();
    advanceTime(222);
    const stopped = timer.stop();
    expect(timer.elapsed()).toBe(stopped);
    expect(timer.elapsed()).toBe(555);
  });
});

// ---------------------------------------------------------------------------
// formatDuration
// ---------------------------------------------------------------------------
describe('formatDuration', () => {
  it('formats 0ms', () => {
    expect(formatDuration(0)).toBe('0ms');
  });

  it('formats values under 1s as milliseconds', () => {
    expect(formatDuration(1)).toBe('1ms');
    expect(formatDuration(50)).toBe('50ms');
    expect(formatDuration(500)).toBe('500ms');
    expect(formatDuration(999)).toBe('999ms');
  });

  it('formats exactly 1s', () => {
    expect(formatDuration(1000)).toBe('1.00s');
  });

  it('formats seconds with two decimals', () => {
    expect(formatDuration(1500)).toBe('1.50s');
    expect(formatDuration(5500)).toBe('5.50s');
    expect(formatDuration(12345)).toBe('12.35s');
  });

  it('formats just under 1 minute as seconds', () => {
    expect(formatDuration(59999)).toBe('60.00s');
  });

  it('formats exactly 1 minute', () => {
    expect(formatDuration(60000)).toBe('1m 0.0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatDuration(90000)).toBe('1m 30.0s');
    expect(formatDuration(125000)).toBe('2m 5.0s');
    expect(formatDuration(150500)).toBe('2m 30.5s');
  });

  it('handles fractional milliseconds', () => {
    expect(formatDuration(0.4)).toBe('0ms');
    expect(formatDuration(0.5)).toBe('1ms');
    expect(formatDuration(999.4)).toBe('999ms');
  });

  it('handles large durations', () => {
    // 10 minutes
    expect(formatDuration(600000)).toBe('10m 0.0s');
    // 1 hour
    expect(formatDuration(3600000)).toBe('60m 0.0s');
  });
});

// ---------------------------------------------------------------------------
// formatTimerDisplay
// ---------------------------------------------------------------------------
describe('formatTimerDisplay', () => {
  it('formats zero', () => {
    expect(formatTimerDisplay(0)).toBe('00:00.00');
  });

  it('formats milliseconds only (sub-second)', () => {
    expect(formatTimerDisplay(500)).toBe('00:00.50');
    expect(formatTimerDisplay(10)).toBe('00:00.01');
    expect(formatTimerDisplay(990)).toBe('00:00.99');
  });

  it('formats whole seconds', () => {
    expect(formatTimerDisplay(1000)).toBe('00:01.00');
    expect(formatTimerDisplay(5000)).toBe('00:05.00');
    expect(formatTimerDisplay(59000)).toBe('00:59.00');
  });

  it('formats seconds and centiseconds', () => {
    expect(formatTimerDisplay(5230)).toBe('00:05.23');
    expect(formatTimerDisplay(1010)).toBe('00:01.01');
  });

  it('formats minutes', () => {
    expect(formatTimerDisplay(60000)).toBe('01:00.00');
    expect(formatTimerDisplay(65000)).toBe('01:05.00');
    expect(formatTimerDisplay(65500)).toBe('01:05.50');
  });

  it('pads single-digit values', () => {
    expect(formatTimerDisplay(1010)).toBe('00:01.01');
    expect(formatTimerDisplay(61010)).toBe('01:01.01');
  });

  it('handles large values (>59 minutes)', () => {
    expect(formatTimerDisplay(3661230)).toBe('61:01.23');
  });

  it('truncates sub-centisecond precision', () => {
    // 1999ms = 1s + 999ms => centis = floor(999/10) = 99
    expect(formatTimerDisplay(1999)).toBe('00:01.99');
    // 1001ms = 1s + 1ms => centis = floor(1/10) = 0
    expect(formatTimerDisplay(1001)).toBe('00:01.00');
  });
});

// ---------------------------------------------------------------------------
// createCountdown
// ---------------------------------------------------------------------------
describe('createCountdown', () => {
  let onTick: ReturnType<typeof vi.fn>;
  let onComplete: ReturnType<typeof vi.fn>;
  let currentTime: number;
  let mockNow: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.useFakeTimers();
    onTick = vi.fn();
    onComplete = vi.fn();
    currentTime = 1000;
    mockNow = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    vi.useRealTimers();
    mockNow.mockRestore();
  });

  const advanceTime = (ms: number) => {
    currentTime += ms;
    vi.advanceTimersByTime(ms);
  };

  it('calls onTick with decreasing remaining time', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start(); // lastTick=1000
    advanceTime(100); // remaining = 5000 - 100 = 4900
    expect(onTick).toHaveBeenCalledWith(4900);
  });

  it('calls onTick on each interval', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start();
    advanceTime(100);
    advanceTime(100);
    advanceTime(100);
    expect(onTick).toHaveBeenCalledTimes(3);
    // remaining decreases: 4900, 4800, 4700
    expect(onTick).toHaveBeenNthCalledWith(1, 4900);
    expect(onTick).toHaveBeenNthCalledWith(2, 4800);
    expect(onTick).toHaveBeenNthCalledWith(3, 4700);
  });

  it('calls onComplete and onTick(0) when countdown reaches 0', () => {
    const countdown = createCountdown(500, onTick, onComplete);
    countdown.start();
    // Advance enough to exhaust the countdown
    advanceTime(100); // remaining=400
    advanceTime(100); // remaining=300
    advanceTime(100); // remaining=200
    advanceTime(100); // remaining=100
    advanceTime(100); // remaining=0
    expect(onTick).toHaveBeenCalledWith(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('does not call onTick after completion', () => {
    const countdown = createCountdown(200, onTick, onComplete);
    countdown.start();
    advanceTime(100); // remaining=100
    advanceTime(100); // remaining=0, complete
    const tickCountAtComplete = onTick.mock.calls.length;
    advanceTime(100); // interval cleared, no more ticks
    advanceTime(100);
    expect(onTick).toHaveBeenCalledTimes(tickCountAtComplete);
  });

  it('stop clears the interval', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start();
    advanceTime(100);
    expect(onTick).toHaveBeenCalledTimes(1);
    countdown.stop();
    advanceTime(100);
    advanceTime(100);
    // No additional ticks after stop
    expect(onTick).toHaveBeenCalledTimes(1);
  });

  it('stop is safe to call without start', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    expect(() => countdown.stop()).not.toThrow();
  });

  it('stop is safe to call twice', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start();
    countdown.stop();
    expect(() => countdown.stop()).not.toThrow();
  });

  it('pause freezes the countdown', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start();
    advanceTime(100); // remaining=4900
    countdown.pause();
    advanceTime(100); // interval fires but isPaused, skipped
    advanceTime(100); // still paused
    // Only the first tick before pause should count
    expect(onTick).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(4900);
  });

  it('resume continues countdown after pause', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start(); // t=1000
    advanceTime(100); // t=1100, remaining=4900, tick
    countdown.pause();
    advanceTime(300); // t=1400, paused (interval fires 3 times but skipped)
    countdown.resume(); // lastTick reset to 1400
    advanceTime(100); // t=1500, remaining = 4900 - 100 = 4800
    expect(onTick).toHaveBeenLastCalledWith(4800);
  });

  it('pause/resume does not double-count elapsed time', () => {
    const countdown = createCountdown(1000, onTick, onComplete);
    countdown.start(); // t=1000
    advanceTime(100); // remaining=900
    countdown.pause();
    advanceTime(500); // paused
    countdown.resume(); // lastTick updated
    advanceTime(100); // remaining=800
    advanceTime(100); // remaining=700
    // Should not have completed (total elapsed = 300 of 1000)
    expect(onComplete).not.toHaveBeenCalled();
  });

  it('countdown completes after pause/resume cycle', () => {
    const countdown = createCountdown(300, onTick, onComplete);
    countdown.start();
    advanceTime(100); // remaining=200
    countdown.pause();
    advanceTime(500); // paused
    countdown.resume();
    advanceTime(100); // remaining=100
    advanceTime(100); // remaining=0
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onTick).toHaveBeenCalledWith(0);
  });

  it('resume is no-op when not paused', () => {
    const countdown = createCountdown(5000, onTick, onComplete);
    countdown.start();
    countdown.resume(); // not paused, no-op
    advanceTime(100);
    expect(onTick).toHaveBeenCalledWith(4900);
  });
});
