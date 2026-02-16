import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '../lib/constants';

interface UseTournamentSocketOptions {
  onUpdate?: () => void;
}

export function useTournamentSocket(
  tournamentId: string | undefined,
  options?: UseTournamentSocketOptions
) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<string | null>(null);
  const onUpdateRef = useRef(options?.onUpdate);
  onUpdateRef.current = options?.onUpdate;

  const handleTournamentEvent = useCallback((eventName: string) => {
    return () => {
      setLatestEvent(eventName);
      onUpdateRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!tournamentId) return;

    const socket = getSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      setIsConnected(true);
    }

    // Join tournament room
    socket.emit('join:tournament', tournamentId);

    // Listen for tournament events
    const events = [
      SOCKET_EVENTS.TOURNAMENT_START,
      SOCKET_EVENTS.TOURNAMENT_END,
      SOCKET_EVENTS.ROUND_START,
      SOCKET_EVENTS.ROUND_END,
      SOCKET_EVENTS.MATCH_END,
      SOCKET_EVENTS.BRACKET_UPDATE,
    ];

    const handlers = events.map((event) => {
      const handler = handleTournamentEvent(event);
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      socket.emit('leave:tournament', tournamentId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const { event, handler } of handlers) {
        socket.off(event, handler);
      }
    };
  }, [tournamentId, handleTournamentEvent]);

  return { isConnected, latestEvent };
}
