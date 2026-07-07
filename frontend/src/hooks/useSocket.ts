import { useEffect, useCallback, useRef } from 'react';
import { getSocket, disconnectSocket } from '../lib/socket';
import { useStore } from '../store';
import { SOCKET_EVENTS } from '../lib/constants';

interface AgentStateUpdate {
  agentId: string;
  name?: string;
  status?: 'idle' | 'initializing' | 'running' | 'completed' | 'failed' | 'timeout';
  progress?: number;
  score?: number;
  actionCount?: number;
  currentAction?: string;
  color?: string;
}

interface LeaderboardEntry {
  agentId: string;
  agentName: string;
  totalScore: number;
  eventsWon: number;
  eventsCompleted: number;
  rank: number;
}

interface ActionEvent {
  timestamp: number;
  agentId: string;
  type: string;
  target?: string;
  success: boolean;
}

interface CommentaryEvent {
  timestamp: number;
  text: string;
  emotion: 'neutral' | 'excited' | 'tense' | 'celebratory' | 'disappointed';
  priority: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Loose record type for socket event payloads.
 * Socket events cross a network boundary with no compile-time guarantees,
 * so we use a permissive index signature and rely on runtime null-checks
 * (which the code already performs) rather than pretending the shape is known.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SocketPayload = Record<string, any>;

/**
 * Whether a StreamEvent belongs to the competition this hook is scoped to.
 *
 * The backend broadcasts every event to every connected socket (a single global
 * `io.emit`, so anonymous spectating works without joining an auth-gated room).
 * Without this filter a spectator of competition A also receives competition B's
 * agent/leaderboard/commentary events — and a `competition:start` for B would call
 * reset() and wipe A's view. Events with no competitionId (timer ticks, legacy
 * flat payloads) are always allowed through, and an unscoped hook sees everything.
 *
 * Exported for unit testing.
 */
export function eventMatchesCompetition(event: SocketPayload, competitionId?: string): boolean {
  if (!competitionId) return true;
  const eid = event?.competitionId;
  if (!eid) return true;
  return eid === competitionId;
}

export function useSocket(competitionId?: string) {
  const {
    setCompetition,
    setStatus,
    setCurrentEvent,
    setElapsedTime,
    updateAgent,
    setLeaderboard,
    addAction,
    addCommentary,
    setVoteCounts,
    setConnected,
    setReconnecting,
    reset,
  } = useStore();

  // Track the timestamp of the last event we processed so we can request
  // a catchup replay covering only what we missed. Only updated for events that
  // pass the competition filter, so it reflects THIS competition's stream.
  const lastEventTimestamp = useRef<number>(0);

  // Distinguishes the first connect from subsequent reconnects (used only to
  // avoid a "reconnecting" flash on the very first page load).
  const wasConnected = useRef<boolean>(false);

  const connect = useCallback(() => {
    const socket = getSocket();

    // Ask the server to (re)join the room and replay this competition's events.
    // On first connect lastEventTimestamp is 0, so the server replays the FULL
    // event history — hydrating a spectator who opens the page mid-competition.
    // Previously catchup fired only on RECONNECT, so a mid-run joiner sat on
    // "waiting for competition to start" until the next live event happened to
    // arrive.
    const joinAndHydrate = () => {
      if (!competitionId) return;
      socket.emit('join:competition', competitionId);
      socket.emit('competition:catchup', {
        competitionId,
        sinceTimestamp: lastEventTimestamp.current,
      });
    };

    const onConnect = () => {
      setConnected(true);
      joinAndHydrate();
      wasConnected.current = true;
      setReconnecting(false);
    };

    const onDisconnect = () => {
      setConnected(false);
      // Only show "reconnecting" if we had an established connection — avoids a
      // flash on initial page load before the first connect fires.
      if (wasConnected.current) {
        setReconnecting(true);
      }
    };

    const onCatchupComplete = (data: { competitionId: string; eventsReplayed: number }) => {
      setReconnecting(false);
      if (import.meta.env.DEV) {
        console.log(`[Socket] Catchup complete: ${data.eventsReplayed} events replayed`);
      }
    };

    const onCatchupError = () => {
      // Best-effort: clear reconnecting state even if catchup failed
      setReconnecting(false);
    };

    // Server pushes a full snapshot of its "current competition" on connect.
    // Only hydrate from it when it is actually THIS competition — the server
    // keeps a single current-competition slot, so the snapshot may be for a
    // different match; in that case we ignore it and rely on the catchup replay.
    const onCompetitionState = (state: SocketPayload) => {
      if (!state) return;
      if (competitionId && state.id && state.id !== competitionId) return;
      setCompetition(state.id || competitionId || '', state.name || 'Competition');
      // Map the server's competition status onto the store's narrower union.
      // A snapshot is only pushed for an active competition, so anything that
      // isn't explicitly finished/paused is treated as running.
      setStatus(state.status === 'completed' ? 'completed' : state.status === 'paused' ? 'paused' : 'running');
      if (Array.isArray(state.agents)) {
        for (const agent of state.agents) {
          updateAgent(agent.id, {
            name: agent.name,
            color: agent.color || '#6B7280',
            status: agent.status || 'initializing',
            progress: agent.progress ?? 0,
            score: agent.score ?? 0,
          });
        }
      }
      if (Array.isArray(state.leaderboard)) setLeaderboard(state.leaderboard);
    };

    // ---------------------------------------------------------------------------
    // Backend emits StreamEvent wrappers: { type, competitionId, eventId, timestamp, data }
    // The actual payload is nested inside `event.data`.
    // We handle both wrapped (StreamEvent) and flat (legacy) formats for safety.
    // ---------------------------------------------------------------------------

    // Competition-scoped StreamEvent handlers, keyed by socket event name. Each is
    // wrapped by streamHandler() below, which drops events for other competitions
    // and advances lastEventTimestamp only for events we actually processed.
    const streamHandlers: Record<string, (event: SocketPayload) => void> = {
      [SOCKET_EVENTS.COMPETITION_START]: (event) => {
        reset();
        const inner = event?.data ?? event;
        const competition = inner?.competition ?? inner;
        setCompetition(
          event?.competitionId || competition?.id || '',
          competition?.name || 'Competition',
        );
        setStatus('running');
        const agents = competition?.agents;
        if (Array.isArray(agents)) {
          for (const agent of agents) {
            updateAgent(agent.id, {
              name: agent.name,
              color: agent.color || '#6B7280',
              status: 'initializing',
              progress: 0,
              score: 0,
            });
          }
        }
      },

      [SOCKET_EVENTS.COMPETITION_END]: () => {
        setStatus('completed');
      },

      [SOCKET_EVENTS.EVENT_START]: (event) => {
        const inner = event?.data ?? event;
        setCurrentEvent(inner?.task?.name || inner?.eventName || '');
      },

      [SOCKET_EVENTS.EVENT_END]: () => {
        // Event ended, wait for next or competition end
      },

      [SOCKET_EVENTS.AGENT_STATE]: (event) => {
        const inner = event?.data ?? event;
        if (inner?.agentId) {
          updateAgent(inner.agentId, inner);
        }
      },

      [SOCKET_EVENTS.AGENT_ACTION]: (event) => {
        const inner = event?.data ?? event;
        if (inner?.agentId) {
          addAction(inner);
          updateAgent(inner.agentId, {
            currentAction: `${inner.type}${inner.target ? `: ${inner.target}` : ''}`,
            actionCount: (useStore.getState().agents[inner.agentId]?.actionCount || 0) + 1,
          });
        }
      },

      [SOCKET_EVENTS.AGENT_PROGRESS]: (event) => {
        const inner = event?.data ?? event;
        if (inner?.agentId) {
          updateAgent(inner.agentId, { progress: inner.progress });
        }
      },

      [SOCKET_EVENTS.AGENT_COMPLETE]: (event) => {
        const inner = event?.data ?? event;
        const agentId = inner?.agentId;
        if (agentId) {
          updateAgent(agentId, {
            status: 'completed',
            score: inner?.result?.score ?? inner?.score ?? 0,
            progress: 100,
          });
        }
      },

      [SOCKET_EVENTS.AGENT_ERROR]: (event) => {
        const inner = event?.data ?? event;
        if (inner?.agentId) {
          updateAgent(inner.agentId, {
            status: 'failed',
            currentAction: `Error: ${inner.error}`,
          });
        }
      },

      [SOCKET_EVENTS.LEADERBOARD_UPDATE]: (event) => {
        const entries = event?.data?.leaderboard ?? (Array.isArray(event) ? event : []);
        setLeaderboard(entries);
      },

      [SOCKET_EVENTS.COMMENTARY_UPDATE]: (event) => {
        const inner = event?.data ?? event;
        addCommentary(inner);
      },

      [SOCKET_EVENTS.VOTE_UPDATE]: (event) => {
        const voteCounts = event?.voteCounts ?? event?.data?.voteCounts;
        if (voteCounts) {
          setVoteCounts(voteCounts);
        }
      },
    };

    // Wrap a stream handler: drop events for other competitions, then advance the
    // catchup cursor and run the handler. Filtering before tracking keeps
    // lastEventTimestamp aligned to THIS competition's stream.
    const streamHandler = (fn: (event: SocketPayload) => void) => (event: SocketPayload) => {
      if (!eventMatchesCompetition(event, competitionId)) return;
      const ts = event?.timestamp;
      if (typeof ts === 'number' && ts > lastEventTimestamp.current) {
        lastEventTimestamp.current = ts;
      }
      fn(event);
    };

    // Timer ticks carry no competitionId; they track the single active match.
    const onTimerUpdate = (data: { elapsed: number }) => {
      setElapsedTime(data.elapsed);
    };

    // Register everything, keeping handler references for scoped teardown so we
    // never call socket.off(event) (which would strip OTHER hooks' listeners on
    // this shared page-lifetime singleton).
    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);
    socket.on('catchup:complete', onCatchupComplete);
    socket.on('catchup:error', onCatchupError);
    socket.on('competition:state', onCompetitionState);
    socket.on('timer:update', onTimerUpdate);

    const registered = Object.entries(streamHandlers).map(([event, fn]) => {
      const handler = streamHandler(fn);
      socket.on(event, handler);
      return { event, handler };
    });

    // If already connected when this hook mounts, join + hydrate immediately.
    if (socket.connected) {
      setConnected(true);
      joinAndHydrate();
      wasConnected.current = true;
    }

    // Teardown closure — removes exactly what we registered and leaves the room.
    return () => {
      if (competitionId) socket.emit('leave:competition', competitionId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      socket.off('catchup:complete', onCatchupComplete);
      socket.off('catchup:error', onCatchupError);
      socket.off('competition:state', onCompetitionState);
      socket.off('timer:update', onTimerUpdate);
      for (const { event, handler } of registered) {
        socket.off(event, handler);
      }
    };
  }, [
    setCompetition,
    setStatus,
    setCurrentEvent,
    setElapsedTime,
    updateAgent,
    setLeaderboard,
    addAction,
    addCommentary,
    setVoteCounts,
    setConnected,
    setReconnecting,
    reset,
    competitionId,
  ]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setConnected(false);
    setReconnecting(false);
  }, [setConnected, setReconnecting]);

  useEffect(() => {
    const teardown = connect();
    return teardown;
  }, [connect]);

  return { connect, disconnect };
}

export type { AgentStateUpdate, LeaderboardEntry, ActionEvent, CommentaryEvent };
