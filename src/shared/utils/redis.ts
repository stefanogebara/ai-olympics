import Redis from 'ioredis';
import { config } from '../config.js';
import { createLogger } from './logger.js';

const log = createLogger('Redis');

// Competition state snapshot persisted to Redis
export interface CompetitionSnapshot {
  competitionId: string;
  name: string;
  status: string;
  leaderboard: Array<{
    agentId: string;
    agentName: string;
    totalScore: number;
    eventsWon: number;
    eventsCompleted: number;
    rank: number;
  }>;
  currentEventIndex: number;
  totalEvents: number;
  startedAt: string;
  updatedAt: string;
}

const COMPETITION_KEY_PREFIX = 'aio:competition:';
const ACTIVE_SET_KEY = 'aio:active-competitions';
const SNAPSHOT_TTL = 3600; // 1 hour

const EVENT_LOG_PREFIX = 'aio:events:';
const EVENT_LOG_TTL = 7200; // 2 hours
const MAX_EVENTS_PER_COMPETITION = 10_000;

let redisClient: Redis | null = null;
let available = false;

/**
 * Initialize Redis connection. Gracefully degrades if Redis is unavailable.
 * Returns true if connection succeeded.
 */
export async function initRedis(): Promise<boolean> {
  if (!config.redisUrl) {
    log.info('REDIS_URL not configured - event resilience disabled (in-memory only)');
    return false;
  }

  try {
    redisClient = new Redis(config.redisUrl, {
      maxRetriesPerRequest: 3,
      retryStrategy(times) {
        if (times > 5) return null; // stop retrying after 5 attempts
        return Math.min(times * 200, 2000);
      },
      lazyConnect: true,
    });

    await redisClient.connect();
    available = true;
    log.info('Redis connected - event resilience enabled');
    return true;
  } catch (err) {
    log.warn('Redis connection failed - falling back to in-memory only', {
      error: err instanceof Error ? err.message : String(err),
    });
    redisClient = null;
    available = false;
    return false;
  }
}

/** Check if Redis is available */
export function isRedisAvailable(): boolean {
  return available && redisClient !== null;
}

/**
 * Save a competition state snapshot to Redis.
 * No-op if Redis is unavailable.
 */
export async function saveCompetitionSnapshot(snapshot: CompetitionSnapshot): Promise<void> {
  if (!redisClient || !available) return;

  try {
    const key = COMPETITION_KEY_PREFIX + snapshot.competitionId;
    const value = JSON.stringify(snapshot);

    await redisClient
      .multi()
      .set(key, value, 'EX', SNAPSHOT_TTL)
      .sadd(ACTIVE_SET_KEY, snapshot.competitionId)
      .exec();
  } catch (err) {
    log.warn('Failed to save competition snapshot', {
      competitionId: snapshot.competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Remove a competition from active set (on completion or cancellation).
 */
export async function removeCompetitionSnapshot(competitionId: string): Promise<void> {
  if (!redisClient || !available) return;

  try {
    await redisClient
      .multi()
      .del(COMPETITION_KEY_PREFIX + competitionId)
      .srem(ACTIVE_SET_KEY, competitionId)
      .exec();
  } catch (err) {
    log.warn('Failed to remove competition snapshot', {
      competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get all interrupted (still active) competitions from Redis.
 * Called on server startup to detect crash recovery candidates.
 */
export async function getInterruptedCompetitions(): Promise<CompetitionSnapshot[]> {
  if (!redisClient || !available) return [];

  try {
    const ids = await redisClient.smembers(ACTIVE_SET_KEY);
    if (ids.length === 0) return [];

    const keys = ids.map(id => COMPETITION_KEY_PREFIX + id);
    const values = await redisClient.mget(...keys);

    const snapshots: CompetitionSnapshot[] = [];
    for (let i = 0; i < values.length; i++) {
      const raw = values[i];
      if (raw) {
        try {
          snapshots.push(JSON.parse(raw));
        } catch {
          // Corrupt entry - remove it
          await redisClient.srem(ACTIVE_SET_KEY, ids[i]);
          await redisClient.del(keys[i]);
        }
      } else {
        // Key expired but ID still in set - clean up
        await redisClient.srem(ACTIVE_SET_KEY, ids[i]);
      }
    }

    return snapshots;
  } catch (err) {
    log.warn('Failed to get interrupted competitions', {
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Append a single StreamEvent to the competition's event log.
 * Fire-and-forget safe — silently no-ops if Redis is unavailable.
 */
export async function appendEventToLog(competitionId: string, event: unknown): Promise<void> {
  if (!redisClient || !available) return;

  try {
    const key = EVENT_LOG_PREFIX + competitionId;
    await redisClient
      .multi()
      .rpush(key, JSON.stringify(event))
      .expire(key, EVENT_LOG_TTL)
      .exec();

    // Trim to max size to prevent unbounded growth (only when near limit)
    const len = await redisClient.llen(key);
    if (len > MAX_EVENTS_PER_COMPETITION) {
      await redisClient.ltrim(key, len - MAX_EVENTS_PER_COMPETITION, -1);
    }
  } catch (err) {
    log.warn('Failed to append event to log', {
      competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Get all events for a competition, optionally filtered to those after sinceTimestamp.
 * Returns events in chronological order (oldest first).
 */
export async function getEventsFromLog(
  competitionId: string,
  sinceTimestamp?: number
): Promise<unknown[]> {
  if (!redisClient || !available) return [];

  try {
    const key = EVENT_LOG_PREFIX + competitionId;
    const raw = await redisClient.lrange(key, 0, -1);
    const events = raw.map(r => JSON.parse(r) as { timestamp?: number });

    if (sinceTimestamp !== undefined) {
      return events.filter(e => (e.timestamp ?? 0) > sinceTimestamp);
    }
    return events;
  } catch (err) {
    log.warn('Failed to get events from log', {
      competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/**
 * Delete the event log for a competition (call on completion/cancellation cleanup).
 */
export async function deleteEventLog(competitionId: string): Promise<void> {
  if (!redisClient || !available) return;

  try {
    await redisClient.del(EVENT_LOG_PREFIX + competitionId);
  } catch (err) {
    log.warn('Failed to delete event log', {
      competitionId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Gracefully close the Redis connection.
 */
export async function closeRedis(): Promise<void> {
  if (redisClient) {
    try {
      await redisClient.quit();
    } catch {
      redisClient.disconnect();
    }
    redisClient = null;
    available = false;
    log.info('Redis disconnected');
  }
}
