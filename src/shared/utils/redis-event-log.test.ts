/**
 * Redis event log tests — appendEventToLog, getEventsFromLog, deleteEventLog
 */
import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';

const { mockPipeline, mockRedis } = vi.hoisted(() => {
  const mockPipeline = {
    rpush: vi.fn().mockReturnThis(),
    expire: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    sadd: vi.fn().mockReturnThis(),
    del: vi.fn().mockReturnThis(),
    srem: vi.fn().mockReturnThis(),
    exec: vi.fn().mockResolvedValue([]),
  };
  const mockRedis = {
    connect: vi.fn().mockResolvedValue(undefined),
    quit: vi.fn().mockResolvedValue('OK'),
    multi: vi.fn().mockReturnValue(mockPipeline),
    llen: vi.fn().mockResolvedValue(0),
    ltrim: vi.fn().mockResolvedValue('OK'),
    lrange: vi.fn().mockResolvedValue([]),
    del: vi.fn().mockResolvedValue(1),
    smembers: vi.fn().mockResolvedValue([]),
    mget: vi.fn().mockResolvedValue([]),
    srem: vi.fn().mockResolvedValue(1),
  };
  return { mockPipeline, mockRedis };
});

// Class mock so `new IORedis()` works in Vitest 4.x ESM
vi.mock('ioredis', () => ({
  default: class {
    connect = mockRedis.connect;
    quit = mockRedis.quit;
    multi = mockRedis.multi;
    llen = mockRedis.llen;
    ltrim = mockRedis.ltrim;
    lrange = mockRedis.lrange;
    del = mockRedis.del;
    smembers = mockRedis.smembers;
    mget = mockRedis.mget;
    srem = mockRedis.srem;
  },
}));
vi.mock('../config.js', () => ({ config: { redisUrl: 'redis://localhost:6379' } }));

const { initRedis, appendEventToLog, getEventsFromLog, deleteEventLog, isRedisAvailable } =
  await import('./redis.js');

function makeEvent(competitionId: string, timestamp = Date.now()) {
  return { type: 'agent:action', competitionId, timestamp, data: {} };
}

describe('Redis event log', () => {
  beforeAll(async () => {
    await initRedis();
    expect(isRedisAvailable()).toBe(true);
  });

  beforeEach(() => {
    vi.clearAllMocks();
    mockPipeline.rpush.mockReturnThis();
    mockPipeline.expire.mockReturnThis();
    mockPipeline.exec.mockResolvedValue([]);
    mockRedis.multi.mockReturnValue(mockPipeline);
    mockRedis.llen.mockResolvedValue(0);
    mockRedis.lrange.mockResolvedValue([]);
    mockRedis.del.mockResolvedValue(1);
    mockRedis.ltrim.mockResolvedValue('OK');
  });

  describe('appendEventToLog', () => {
    it('calls rpush with the correct key and JSON-serialised event', async () => {
      const event = makeEvent('comp-abc');
      await appendEventToLog('comp-abc', event);
      expect(mockPipeline.rpush).toHaveBeenCalledWith(
        'aio:events:comp-abc',
        JSON.stringify(event)
      );
    });

    it('sets expire on every append', async () => {
      await appendEventToLog('comp-1', makeEvent('comp-1'));
      expect(mockPipeline.expire).toHaveBeenCalledWith('aio:events:comp-1', 7200);
    });

    it('calls multi().exec() to run rpush + expire atomically', async () => {
      await appendEventToLog('comp-1', makeEvent('comp-1'));
      expect(mockRedis.multi).toHaveBeenCalled();
      expect(mockPipeline.exec).toHaveBeenCalled();
    });

    it('does NOT trim when list is below the cap', async () => {
      mockRedis.llen.mockResolvedValue(100);
      await appendEventToLog('comp-1', makeEvent('comp-1'));
      expect(mockRedis.ltrim).not.toHaveBeenCalled();
    });

    it('trims the list when len exceeds MAX_EVENTS_PER_COMPETITION (10 000)', async () => {
      mockRedis.llen.mockResolvedValue(10_001);
      await appendEventToLog('comp-1', makeEvent('comp-1'));
      expect(mockRedis.ltrim).toHaveBeenCalledWith('aio:events:comp-1', 1, -1);
    });

    it('silently swallows Redis errors', async () => {
      mockPipeline.exec.mockRejectedValue(new Error('ECONNRESET'));
      await expect(appendEventToLog('comp-1', makeEvent('comp-1'))).resolves.toBeUndefined();
    });
  });

  describe('getEventsFromLog', () => {
    it('reads from the correct Redis key', async () => {
      await getEventsFromLog('comp-xyz');
      expect(mockRedis.lrange).toHaveBeenCalledWith('aio:events:comp-xyz', 0, -1);
    });

    it('returns JSON-parsed events in order', async () => {
      const e1 = makeEvent('comp-1', 1000);
      const e2 = makeEvent('comp-1', 2000);
      mockRedis.lrange.mockResolvedValue([JSON.stringify(e1), JSON.stringify(e2)]);
      const result = await getEventsFromLog('comp-1');
      expect(result).toHaveLength(2);
      expect((result[0] as typeof e1).timestamp).toBe(1000);
      expect((result[1] as typeof e1).timestamp).toBe(2000);
    });

    it('returns all events when sinceTimestamp is omitted', async () => {
      const events = [makeEvent('c', 100), makeEvent('c', 200), makeEvent('c', 300)];
      mockRedis.lrange.mockResolvedValue(events.map((e) => JSON.stringify(e)));
      const result = await getEventsFromLog('c');
      expect(result).toHaveLength(3);
    });

    it('filters out events at or before sinceTimestamp (uses strict >)', async () => {
      const events = [
        makeEvent('c', 100),
        makeEvent('c', 500),
        makeEvent('c', 501),
        makeEvent('c', 900),
      ];
      mockRedis.lrange.mockResolvedValue(events.map((e) => JSON.stringify(e)));
      const result = await getEventsFromLog('c', 500);
      expect(result).toHaveLength(2);
      expect((result[0] as typeof events[0]).timestamp).toBe(501);
      expect((result[1] as typeof events[0]).timestamp).toBe(900);
    });

    it('returns [] when the key is empty', async () => {
      const result = await getEventsFromLog('comp-empty');
      expect(result).toHaveLength(0);
    });

    it('returns [] and does not throw on a Redis error', async () => {
      mockRedis.lrange.mockRejectedValue(new Error('timeout'));
      await expect(getEventsFromLog('comp-err')).resolves.toEqual([]);
    });

    it('treats missing timestamp as 0 — filtered out when since > 0', async () => {
      const noTs = { type: 'agent:action', data: {} };
      mockRedis.lrange.mockResolvedValue([JSON.stringify(noTs)]);
      const result = await getEventsFromLog('c', 1);
      expect(result).toHaveLength(0);
    });
  });

  describe('deleteEventLog', () => {
    it('calls del with the correct key', async () => {
      await deleteEventLog('comp-finish');
      expect(mockRedis.del).toHaveBeenCalledWith('aio:events:comp-finish');
    });

    it('silently swallows Redis errors', async () => {
      mockRedis.del.mockRejectedValue(new Error('connection lost'));
      await expect(deleteEventLog('comp-err')).resolves.toBeUndefined();
    });
  });
});
