import { useEffect, useRef, useState, useCallback } from 'react';
import { getSocket } from '../lib/socket';
import { SOCKET_EVENTS } from '../lib/constants';

interface UseChampionshipSocketOptions {
  onUpdate?: () => void;
}

export function useChampionshipSocket(
  championshipId: string | undefined,
  options?: UseChampionshipSocketOptions
) {
  const [isConnected, setIsConnected] = useState(false);
  const [latestEvent, setLatestEvent] = useState<string | null>(null);
  const onUpdateRef = useRef(options?.onUpdate);
  onUpdateRef.current = options?.onUpdate;

  const handleChampionshipEvent = useCallback((eventName: string) => {
    return () => {
      setLatestEvent(eventName);
      onUpdateRef.current?.();
    };
  }, []);

  useEffect(() => {
    if (!championshipId) return;

    const socket = getSocket();

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    if (socket.connected) {
      setIsConnected(true);
    }

    // Join championship room
    socket.emit('join:championship', championshipId);

    // Listen for championship events
    const events = [
      SOCKET_EVENTS.CHAMPIONSHIP_ROUND_START,
      SOCKET_EVENTS.CHAMPIONSHIP_ROUND_END,
      SOCKET_EVENTS.CHAMPIONSHIP_UPDATE,
      SOCKET_EVENTS.CHAMPIONSHIP_END,
    ];

    const handlers = events.map((event) => {
      const handler = handleChampionshipEvent(event);
      socket.on(event, handler);
      return { event, handler };
    });

    return () => {
      socket.emit('leave:championship', championshipId);
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
      for (const { event, handler } of handlers) {
        socket.off(event, handler);
      }
    };
  }, [championshipId, handleChampionshipEvent]);

  return { isConnected, latestEvent };
}
