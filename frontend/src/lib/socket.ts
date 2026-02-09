import { io, Socket } from 'socket.io-client';

// Socket.io client singleton
let socket: Socket | null = null;

export function getSocket(): Socket {
  if (!socket) {
    socket = io(window.location.origin, {
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
