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

export function useSocket() {
  const {
    setCompetition,
    setStatus,
    setCurrentEvent,
    setElapsedTime,
    updateAgent,
    setLeaderboard,
    addAction,
    addCommentary,
    setConnected,
    reset,
  } = useStore();

  const connect = useCallback(() => {
    const socket = getSocket();

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    // Competition events
    socket.on(SOCKET_EVENTS.COMPETITION_START, (data: { competitionId: string; name: string }) => {
      reset();
      setCompetition(data.competitionId, data.name);
      setStatus('running');
    });

    socket.on(SOCKET_EVENTS.COMPETITION_END, () => {
      setStatus('completed');
    });

    // Event events
    socket.on(SOCKET_EVENTS.EVENT_START, (data: { eventName: string }) => {
      setCurrentEvent(data.eventName);
    });

    socket.on(SOCKET_EVENTS.EVENT_END, () => {
      // Event ended, wait for next or competition end
    });

    // Agent events
    socket.on(SOCKET_EVENTS.AGENT_STATE, (data: AgentStateUpdate) => {
      updateAgent(data.agentId, data);
    });

    socket.on(SOCKET_EVENTS.AGENT_ACTION, (data: ActionEvent) => {
      addAction(data);
      // Also update agent's current action
      updateAgent(data.agentId, {
        currentAction: `${data.type}${data.target ? `: ${data.target}` : ''}`,
        actionCount: (useStore.getState().agents[data.agentId]?.actionCount || 0) + 1,
      });
    });

    socket.on(SOCKET_EVENTS.AGENT_PROGRESS, (data: { agentId: string; progress: number }) => {
      updateAgent(data.agentId, { progress: data.progress });
    });

    socket.on(SOCKET_EVENTS.AGENT_COMPLETE, (data: { agentId: string; score: number }) => {
      updateAgent(data.agentId, {
        status: 'completed',
        score: data.score,
        progress: 100,
      });
    });

    socket.on(SOCKET_EVENTS.AGENT_ERROR, (data: { agentId: string; error: string }) => {
      updateAgent(data.agentId, {
        status: 'failed',
        currentAction: `Error: ${data.error}`,
      });
    });

    // Leaderboard
    socket.on(SOCKET_EVENTS.LEADERBOARD_UPDATE, (entries: LeaderboardEntry[]) => {
      setLeaderboard(entries);
    });

    // Commentary
    socket.on(SOCKET_EVENTS.COMMENTARY_UPDATE, (commentary: CommentaryEvent) => {
      addCommentary(commentary);
    });

    // Timer updates (custom event)
    socket.on('timer:update', (data: { elapsed: number }) => {
      setElapsedTime(data.elapsed);
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
    setConnected,
    reset,
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
