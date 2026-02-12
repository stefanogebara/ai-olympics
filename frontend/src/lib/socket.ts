import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';

// Socket.io client singleton
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    // In production, connect to the API server directly via VITE_API_URL.
    // In development, the Vite proxy handles /socket.io so we use the page origin.
    const socketUrl = import.meta.env.DEV ? window.location.origin : API_BASE;
    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
    });

    socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('Socket connected:', socket?.id);
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      if (import.meta.env.DEV) console.error('Socket connection error:', error);
    });
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
