import { io, Socket } from 'socket.io-client';
import { API_BASE } from './api';
import { supabase } from './supabase';

// Socket.io client singleton
let socket: Socket | null = null;
let cleanupRegistered = false;
let authListenerRegistered = false;

/**
 * Provide the current Supabase access token to the socket handshake. socket.io
 * invokes this on every (re)connect, so a refreshed token is picked up
 * automatically. Without it the server could never derive a userId and rejected
 * every authenticated action (vote:cast, chat, join:competition) — spectator
 * voting was 100% broken with a fake success animation on the client.
 */
function authProvider(cb: (data: Record<string, unknown>) => void): void {
  supabase.auth
    .getSession()
    .then(({ data }) => cb(data.session?.access_token ? { token: data.session.access_token } : {}))
    .catch(() => cb({}));
}

export function getSocket(): Socket {
  if (!socket) {
    // In production, connect to the API server directly via VITE_API_URL.
    // In development, the Vite proxy handles /socket.io so we use the page origin.
    const socketUrl = import.meta.env.DEV ? window.location.origin : API_BASE;
    socket = io(socketUrl, {
      transports: ['websocket', 'polling'],
      autoConnect: true,
      auth: authProvider,
    });

    // Re-authenticate the socket when the user logs in/out or the token
    // refreshes. The server reads the token once per connection (io.use), so we
    // reconnect to re-run its auth handshake with the new token.
    if (!authListenerRegistered) {
      authListenerRegistered = true;
      supabase.auth.onAuthStateChange(() => {
        if (socket) {
          socket.disconnect();
          socket.connect(); // triggers authProvider again with the fresh token
        }
      });
    }

    socket.on('connect', () => {
      if (import.meta.env.DEV) console.log('Socket connected:', socket?.id);
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) console.log('Socket disconnected');
    });

    socket.on('connect_error', (error) => {
      if (import.meta.env.DEV) console.error('Socket connection error:', error);
    });

    // Register page-level cleanup once to prevent leaked connections
    if (!cleanupRegistered) {
      cleanupRegistered = true;
      window.addEventListener('beforeunload', () => {
        disconnectSocket();
      });
    }
  }

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
