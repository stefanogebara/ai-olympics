import { useEffect, useCallback } from 'react';
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
    reset,
  } = useStore();

  const connect = useCallback(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      setConnected(true);
      // Join competition-specific room if an ID is provided
      if (competitionId) {
        socket.emit('join:competition', competitionId);
      }
    });

    // If already connected and competitionId is set, join immediately
    if (socket.connected && competitionId) {
      socket.emit('join:competition', competitionId);
    }

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // ---------------------------------------------------------------------------
    // Backend emits StreamEvent wrappers: { type, competitionId, eventId, timestamp, data }
    // The actual payload is nested inside `event.data`.
    // We handle both wrapped (StreamEvent) and flat (legacy) formats for safety.
    // ---------------------------------------------------------------------------

    // Competition events
    socket.on(SOCKET_EVENTS.COMPETITION_START, (event: SocketPayload) => {
      reset();
      const inner = event?.data ?? event;
      const competition = inner?.competition ?? inner;
      setCompetition(
        event?.competitionId || competition?.id || '',
        competition?.name || 'Competition'
      );
      setStatus('running');

      // Initialize agents from the competition's agent list
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
    });

    socket.on(SOCKET_EVENTS.COMPETITION_END, () => {
      setStatus('completed');
    });

    // Event events
    socket.on(SOCKET_EVENTS.EVENT_START, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      setCurrentEvent(inner?.task?.name || inner?.eventName || '');
    });

    socket.on(SOCKET_EVENTS.EVENT_END, () => {
      // Event ended, wait for next or competition end
    });

    // Agent events
    socket.on(SOCKET_EVENTS.AGENT_STATE, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      if (inner?.agentId) {
        updateAgent(inner.agentId, inner);
      }
    });

    socket.on(SOCKET_EVENTS.AGENT_ACTION, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      if (inner?.agentId) {
        addAction(inner);
        updateAgent(inner.agentId, {
          currentAction: `${inner.type}${inner.target ? `: ${inner.target}` : ''}`,
          actionCount: (useStore.getState().agents[inner.agentId]?.actionCount || 0) + 1,
        });
      }
    });

    socket.on(SOCKET_EVENTS.AGENT_PROGRESS, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      if (inner?.agentId) {
        updateAgent(inner.agentId, { progress: inner.progress });
      }
    });

    socket.on(SOCKET_EVENTS.AGENT_COMPLETE, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      const agentId = inner?.agentId;
      if (agentId) {
        updateAgent(agentId, {
          status: 'completed',
          score: inner?.result?.score ?? inner?.score ?? 0,
          progress: 100,
        });
      }
    });

    socket.on(SOCKET_EVENTS.AGENT_ERROR, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      if (inner?.agentId) {
        updateAgent(inner.agentId, {
          status: 'failed',
          currentAction: `Error: ${inner.error}`,
        });
      }
    });

    // Leaderboard
    socket.on(SOCKET_EVENTS.LEADERBOARD_UPDATE, (event: SocketPayload) => {
      const entries = event?.data?.leaderboard ?? (Array.isArray(event) ? event : []);
      setLeaderboard(entries);
    });

    // Commentary
    socket.on(SOCKET_EVENTS.COMMENTARY_UPDATE, (event: SocketPayload) => {
      const inner = event?.data ?? event;
      addCommentary(inner);
    });

    // Timer updates (custom event)
    socket.on('timer:update', (data: { elapsed: number }) => {
      setElapsedTime(data.elapsed);
    });

    // Spectator vote updates
    socket.on(SOCKET_EVENTS.VOTE_UPDATE, (event: SocketPayload) => {
      const voteCounts = event?.voteCounts ?? event?.data?.voteCounts;
      if (voteCounts) {
        setVoteCounts(voteCounts);
      }
    });

    return socket;
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
    reset,
    competitionId,
  ]);

  const disconnect = useCallback(() => {
    disconnectSocket();
    setConnected(false);
  }, [setConnected]);

  useEffect(() => {
    const socket = connect();

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      Object.values(SOCKET_EVENTS).forEach((event) => {
        socket.off(event);
      });
      socket.off('timer:update');
    };
  }, [connect]);

  return { connect, disconnect };
}
