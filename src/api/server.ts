import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from '../shared/config.js';
import { eventBus } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';
import type { Competition, LeaderboardEntry, StreamEvent } from '../shared/types/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('APIServer');

export function createAPIServer() {
  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: '*',
      methods: ['GET', 'POST']
    }
  });

  // Middleware
  app.use(express.json());
  app.use(express.static(path.join(__dirname, '../../public')));

  // CORS
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type');
    next();
  });

  // ============================================================================
  // TASK PAGES (served to agents)
  // ============================================================================

  // Form Blitz task
  app.get('/tasks/form-blitz', (req, res) => {
    res.sendFile(path.join(__dirname, '../tasks/form-blitz/index.html'));
  });

  // Data Detective task
  app.get('/tasks/data-detective', (req, res) => {
    res.sendFile(path.join(__dirname, '../tasks/data-detective/index.html'));
  });

  // ============================================================================
  // API ENDPOINTS
  // ============================================================================

  // Health check
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      version: '0.1.0'
    });
  });

  // Get current competition state
  let currentCompetition: Competition | null = null;

  app.get('/api/competition', (req, res) => {
    if (!currentCompetition) {
      return res.status(404).json({ error: 'No active competition' });
    }
    res.json(currentCompetition);
  });

  // Get leaderboard
  app.get('/api/leaderboard', (req, res) => {
    if (!currentCompetition) {
      return res.status(404).json({ error: 'No active competition' });
    }
    res.json(currentCompetition.leaderboard);
  });

  // Get event history
  app.get('/api/events', (req, res) => {
    const { competitionId, eventId, since, type } = req.query;

    const history = eventBus.getHistory({
      competitionId: competitionId as string,
      eventId: eventId as string,
      since: since ? parseInt(since as string, 10) : undefined,
      type: type as any
    });

    res.json(history);
  });

  // ============================================================================
  // WEBSOCKET (real-time streaming)
  // ============================================================================

  io.on('connection', (socket) => {
    log.info(`Client connected: ${socket.id}`);

    // Send current state on connect
    if (currentCompetition) {
      socket.emit('competition:state', currentCompetition);
    }

    // Subscribe to competition updates
    const handleEvent = (event: StreamEvent) => {
      socket.emit(event.type, event);
    };

    eventBus.on('*', handleEvent);

    socket.on('disconnect', () => {
      log.info(`Client disconnected: ${socket.id}`);
      eventBus.off('*', handleEvent);
    });
  });

  // Forward events from internal bus to socket.io
  eventBus.on('*', (event) => {
    io.emit(event.type, event);

    // Update cached competition state
    if (event.type === 'competition:start' || event.type === 'competition:end') {
      currentCompetition = (event.data as any).competition;
    }
    if (event.type === 'leaderboard:update') {
      if (currentCompetition) {
        currentCompetition.leaderboard = (event.data as any).leaderboard;
      }
    }
  });

  // ============================================================================
  // SERVER LIFECYCLE
  // ============================================================================

  const start = (port: number = config.port): Promise<void> => {
    return new Promise((resolve) => {
      server.listen(port, () => {
        log.info(`API server running on http://localhost:${port}`);
        log.info(`WebSocket server ready`);
        resolve();
      });
    });
  };

  const stop = (): Promise<void> => {
    return new Promise((resolve) => {
      io.close();
      server.close(() => {
        log.info('API server stopped');
        resolve();
      });
    });
  };

  return {
    app,
    server,
    io,
    start,
    stop,
    setCompetition: (comp: Competition) => { currentCompetition = comp; }
  };
}

export default createAPIServer;
