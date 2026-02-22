/**
 * Tests that CompetitionEventBus.emit() fires appendEventToLog for every
 * emitted event that has a competitionId, without blocking the synchronous
 * emit path.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock redis BEFORE importing events.ts so the module resolves our spy
const appendEventToLogMock = vi.fn().mockResolvedValue(undefined);
vi.mock('./redis.js', () => ({ appendEventToLog: appendEventToLogMock }));

const { eventBus, createStreamEvent } = await import('./events.js');

describe('CompetitionEventBus — Redis persistence', () => {
  beforeEach(() => {
    eventBus.clearHistory();
    vi.clearAllMocks();
    appendEventToLogMock.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Allow fire-and-forget promises to settle
    return new Promise((r) => setTimeout(r, 0));
  });

  it('calls appendEventToLog with competitionId and the event', async () => {
    const event = createStreamEvent('agent:action', 'comp-123', { tool: 'click' });
    eventBus.emit('agent:action', event);

    // Fire-and-forget — yield to microtask queue
    await new Promise((r) => setTimeout(r, 0));

    expect(appendEventToLogMock).toHaveBeenCalledTimes(1);
    expect(appendEventToLogMock).toHaveBeenCalledWith('comp-123', event);
  });

  it('does NOT call appendEventToLog when event has no competitionId', async () => {
    const event = createStreamEvent('competition:start', '', {});
    // Manually blank out competitionId to simulate a non-competition event
    (event as unknown as Record<string, unknown>).competitionId = undefined;
    eventBus.emit('competition:start', event);

    await new Promise((r) => setTimeout(r, 0));
    expect(appendEventToLogMock).not.toHaveBeenCalled();
  });

  it('still delivers event to listeners even if appendEventToLog rejects', async () => {
    appendEventToLogMock.mockRejectedValue(new Error('Redis down'));
    const listener = vi.fn();
    eventBus.on('competition:end', listener);

    const event = createStreamEvent('competition:end', 'comp-xyz', {});
    eventBus.emit('competition:end', event);

    await new Promise((r) => setTimeout(r, 0));

    // Listener was called synchronously — Redis failure must not affect it
    expect(listener).toHaveBeenCalledWith(event);
    eventBus.off('competition:end', listener);
  });

  it('persists every event emitted, not just the first', async () => {
    for (let i = 0; i < 3; i++) {
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-multi', {}));
    }

    await new Promise((r) => setTimeout(r, 0));
    expect(appendEventToLogMock).toHaveBeenCalledTimes(3);
  });

  it('persists events for multiple different competitions independently', async () => {
    const e1 = createStreamEvent('agent:action', 'comp-A', {});
    const e2 = createStreamEvent('agent:action', 'comp-B', {});
    eventBus.emit('agent:action', e1);
    eventBus.emit('agent:action', e2);

    await new Promise((r) => setTimeout(r, 0));

    expect(appendEventToLogMock).toHaveBeenCalledWith('comp-A', e1);
    expect(appendEventToLogMock).toHaveBeenCalledWith('comp-B', e2);
  });

  it('emit() is synchronous — returns true before appendEventToLog resolves', () => {
    // appendEventToLog never resolves in this test
    appendEventToLogMock.mockReturnValue(new Promise(() => {}));

    const result = eventBus.emit(
      'agent:action',
      createStreamEvent('agent:action', 'comp-1', {})
    );
    expect(result).toBe(true);
  });
});
