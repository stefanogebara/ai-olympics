import { describe, it, expect, vi, beforeEach } from 'vitest';
import { eventBus, createStreamEvent } from './events.js';

describe('createStreamEvent', () => {
  it('creates a correctly typed event', () => {
    const event = createStreamEvent('competition:start', 'comp-1', { name: 'Test' }, 'evt-1');
    expect(event.type).toBe('competition:start');
    expect(event.competitionId).toBe('comp-1');
    expect(event.eventId).toBe('evt-1');
    expect(event.data).toEqual({ name: 'Test' });
    expect(event.timestamp).toBeGreaterThan(0);
  });

  it('creates event without eventId', () => {
    const event = createStreamEvent('competition:end', 'comp-2', {});
    expect(event.eventId).toBeUndefined();
  });

  it('includes a recent timestamp', () => {
    const before = Date.now();
    const event = createStreamEvent('agent:action', 'comp-1', {});
    const after = Date.now();
    expect(event.timestamp).toBeGreaterThanOrEqual(before);
    expect(event.timestamp).toBeLessThanOrEqual(after);
  });
});

describe('CompetitionEventBus', () => {
  beforeEach(() => {
    eventBus.clearHistory();
  });

  describe('emit and listen', () => {
    it('notifies specific event listeners', () => {
      const listener = vi.fn();
      eventBus.on('agent:action', listener);

      const event = createStreamEvent('agent:action', 'comp-1', { action: 'click' });
      eventBus.emit('agent:action', event);

      expect(listener).toHaveBeenCalledWith(event);
      eventBus.off('agent:action', listener);
    });

    it('notifies wildcard listeners for any event', () => {
      const listener = vi.fn();
      eventBus.on('*', listener);

      const event = createStreamEvent('leaderboard:update', 'comp-1', {});
      eventBus.emit('leaderboard:update', event);

      expect(listener).toHaveBeenCalledWith(event);
      eventBus.off('*', listener);
    });

    it('does not notify listeners for different event types', () => {
      const listener = vi.fn();
      eventBus.on('competition:start', listener);

      const event = createStreamEvent('competition:end', 'comp-1', {});
      eventBus.emit('competition:end', event);

      expect(listener).not.toHaveBeenCalled();
      eventBus.off('competition:start', listener);
    });
  });

  describe('history', () => {
    it('stores emitted events in history', () => {
      const event = createStreamEvent('agent:action', 'comp-1', {});
      eventBus.emit('agent:action', event);

      const history = eventBus.getHistory();
      expect(history).toContain(event);
    });

    it('filters by type', () => {
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}));
      eventBus.emit('agent:error', createStreamEvent('agent:error', 'comp-1', {}));
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}));

      const filtered = eventBus.getHistory({ type: 'agent:action' });
      expect(filtered).toHaveLength(2);
      expect(filtered.every(e => e.type === 'agent:action')).toBe(true);
    });

    it('filters by competitionId', () => {
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}));
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-2', {}));

      const filtered = eventBus.getHistory({ competitionId: 'comp-1' });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].competitionId).toBe('comp-1');
    });

    it('filters by eventId', () => {
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}, 'evt-1'));
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}, 'evt-2'));

      const filtered = eventBus.getHistory({ eventId: 'evt-2' });
      expect(filtered).toHaveLength(1);
    });

    it('filters by since timestamp', () => {
      const old = createStreamEvent('agent:action', 'comp-1', {});
      old.timestamp = 1000;
      eventBus.emit('agent:action', old);

      const recent = createStreamEvent('agent:action', 'comp-1', {});
      recent.timestamp = 5000;
      eventBus.emit('agent:action', recent);

      const filtered = eventBus.getHistory({ since: 3000 });
      expect(filtered).toHaveLength(1);
      expect(filtered[0].timestamp).toBe(5000);
    });

    it('combines multiple filters', () => {
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}, 'evt-1'));
      eventBus.emit('agent:error', createStreamEvent('agent:error', 'comp-1', {}, 'evt-1'));
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-2', {}, 'evt-1'));

      const filtered = eventBus.getHistory({ type: 'agent:action', competitionId: 'comp-1' });
      expect(filtered).toHaveLength(1);
    });

    it('clears history', () => {
      eventBus.emit('agent:action', createStreamEvent('agent:action', 'comp-1', {}));
      eventBus.clearHistory();
      expect(eventBus.getHistory()).toHaveLength(0);
    });

    it('returns empty array when no matches', () => {
      expect(eventBus.getHistory({ type: 'competition:start' })).toHaveLength(0);
    });
  });
});
