// High-precision timer utilities for competition timing

export class PrecisionTimer {
  private startTime: number = 0;
  private pauseTime: number = 0;
  private pausedDuration: number = 0;
  private isRunning: boolean = false;
  private isPaused: boolean = false;
  private finalElapsed: number = 0;  // Store final time when stopped

  start(): void {
    if (this.isRunning) return;
    this.startTime = performance.now();
    this.isRunning = true;
    this.isPaused = false;
    this.pausedDuration = 0;
    this.finalElapsed = 0;
  }

  pause(): void {
    if (!this.isRunning || this.isPaused) return;
    this.pauseTime = performance.now();
    this.isPaused = true;
  }

  resume(): void {
    if (!this.isPaused) return;
    this.pausedDuration += performance.now() - this.pauseTime;
    this.isPaused = false;
  }

  stop(): number {
    if (!this.isRunning) return this.finalElapsed;

    // If paused, use pauseTime as the end time (don't count time after pause).
    // pausedDuration already accumulated from prior pause/resume cycles.
    const now = this.isPaused ? this.pauseTime : performance.now();
    this.finalElapsed = now - this.startTime - this.pausedDuration;

    this.isRunning = false;
    return this.finalElapsed;
  }

  elapsed(): number {
    // If stopped, return the final elapsed time
    if (!this.isRunning) return this.finalElapsed;
    const now = this.isPaused ? this.pauseTime : performance.now();
    return now - this.startTime - this.pausedDuration;
  }

  elapsedSeconds(): number {
    return this.elapsed() / 1000;
  }

  reset(): void {
    this.startTime = 0;
    this.pauseTime = 0;
    this.pausedDuration = 0;
    this.isRunning = false;
    this.isPaused = false;
    this.finalElapsed = 0;
  }
}

// Format milliseconds to human-readable string
export function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms.toFixed(0)}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(2)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = ((ms % 60000) / 1000).toFixed(1);
  return `${minutes}m ${seconds}s`;
}

// Format for display overlay
export function formatTimerDisplay(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  const millis = Math.floor((ms % 1000) / 10);
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(2, '0')}`;
}

// Create a countdown timer
export function createCountdown(durationMs: number, onTick: (remaining: number) => void, onComplete: () => void): {
  start: () => void;
  stop: () => void;
  pause: () => void;
  resume: () => void;
} {
  let remaining = durationMs;
  let interval: NodeJS.Timeout | null = null;
  let lastTick = 0;
  let isPaused = false;

  return {
    start() {
      lastTick = performance.now();
      interval = setInterval(() => {
        if (isPaused) return;
        const now = performance.now();
        remaining -= (now - lastTick);
        lastTick = now;

        if (remaining <= 0) {
          remaining = 0;
          onTick(0);
          this.stop();
          onComplete();
        } else {
          onTick(remaining);
        }
      }, 100);
    },

    stop() {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    },

    pause() {
      isPaused = true;
    },

    resume() {
      if (isPaused) {
        lastTick = performance.now();
        isPaused = false;
      }
    }
  };
}
