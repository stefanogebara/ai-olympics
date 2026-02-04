import EventEmitter from 'eventemitter3';
import type { StreamEvent, StreamEventType } from '../types/index.js';

// Typed event emitter for the competition system
type EventMap = {
  [K in StreamEventType]: (event: StreamEvent) => void;
} & {
  '*': (event: StreamEvent) => void;
};

class CompetitionEventBus extends EventEmitter<EventMap> {
  private history: StreamEvent[] = [];
  private maxHistorySize = 1000;

  emit<K extends keyof EventMap>(event: K, ...args: Parameters<EventMap[K]>): boolean {
    const streamEvent = args[0] as StreamEvent;

    // Store in history
    this.history.push(streamEvent);
    if (this.history.length > this.maxHistorySize) {
      this.history.shift();
    }

    // Emit to specific listeners
    super.emit(event, streamEvent);

    // Emit to wildcard listeners
    super.emit('*', streamEvent);

    return true;
  }

  getHistory(filter?: {
    type?: StreamEventType;
    competitionId?: string;
    eventId?: string;
    since?: number;
  }): StreamEvent[] {
    let events = this.history;

    if (filter?.type) {
      events = events.filter(e => e.type === filter.type);
    }
    if (filter?.competitionId) {
      events = events.filter(e => e.competitionId === filter.competitionId);
    }
    if (filter?.eventId) {
      events = events.filter(e => e.eventId === filter.eventId);
    }
    if (filter?.since) {
      events = events.filter(e => e.timestamp >= filter.since);
    }

    return events;
  }

  clearHistory(): void {
    this.history = [];
  }
}

// Singleton event bus
export const eventBus = new CompetitionEventBus();

// Helper to create typed events
export function createStreamEvent(
  type: StreamEventType,
  competitionId: string,
  data: unknown,
  eventId?: string
): StreamEvent {
  return {
    type,
    timestamp: Date.now(),
    competitionId,
    eventId,
    data
  };
}

export default eventBus;
