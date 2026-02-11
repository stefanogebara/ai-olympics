import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from '../shared/config.js';
import { eventBus } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';
import type { Competition, StreamEvent, Tournament } from '../shared/types/index.js';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// API Routes
import agentsRouter from './routes/agents.js';
import competitionsRouter from './routes/competitions.js';
import leaderboardsRouter from './routes/leaderboards.js';
import predictionMarketsRouter from './routes/prediction-markets.js';
import userPredictionsRouter from './routes/user-predictions.js';
import gamesRouter from './routes/games.js';
import metaMarketsRouter from './routes/meta-markets.js';
import verificationRouter from './routes/verification.js';
import paymentsRouter from './routes/payments.js';
import tradingRouter from './routes/trading.js';

// Competition orchestrator
import { competitionManager } from '../orchestrator/competition-manager.js';

// Market services for price streaming
import { polymarketClient, type PriceUpdate } from '../services/polymarket-client.js';
import { marketService } from '../services/market-service.js';
import { metaMarketService } from '../services/meta-market-service.js';
import { startResolver } from '../services/market-resolver.js';
import { marketSyncService } from '../services/market-sync.js';

// Register meta-market event listeners for auto market creation/resolution
metaMarketService.registerEventListeners();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('APIServer');

// Allowed origins for CORS
const isDevelopment = config.nodeEnv === 'development';
const ALLOWED_ORIGINS = [
  ...(isDevelopment ? [
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://localhost:5176',
    `http://localhost:${config.port}`,
  ] : []),
  process.env.CLIENT_URL,
].filter(Boolean) as string[];

// Rate limiters
const generalLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

const authLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' },
});

const mutationLimiter = rateLimit({
  windowMs: 1 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Supabase client for WebSocket auth
const wsSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export function createAPIServer() {
  const app = express();
  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: ALLOWED_ORIGINS,
      methods: ['GET', 'POST']
    }
  });

  // Security headers
  app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for SPA compatibility
    crossOriginEmbedderPolicy: false,
  }));

  // Raw body for Stripe webhook (must come before express.json)
  app.use('/api/payments/webhook/stripe', express.raw({ type: 'application/json' }));

  // Middleware
  app.use(express.json({ limit: '1mb' }));
  app.use(express.static(path.join(__dirname, '../../public')));

  // Rate limiting
  app.use('/api/', generalLimiter);
  app.use('/api/verification/start', authLimiter);
  app.use('/api/agents', mutationLimiter);

  // CORS - restricted origins
  app.use((_req, res, next) => {
    const origin = _req.headers.origin;
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
    }
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', 'true');
    if (_req.method === 'OPTIONS') {
      return res.sendStatus(204);
    }
    next();
  });

  // ============================================================================
  // TASK PAGES (served to agents)
  // Task HTML files are in src/tasks/, not dist/tasks/
  // ============================================================================
  const tasksDir = path.join(__dirname, '../../src/tasks');

  // Form Blitz task
  app.get('/tasks/form-blitz', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'form-blitz/index.html'));
  });

  // Data Detective task
  app.get('/tasks/data-detective', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'data-detective/index.html'));
  });

  // Shopping Cart task
  app.get('/tasks/shopping-cart', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'shopping-cart/index.html'));
  });

  // Data Extraction task
  app.get('/tasks/data-extraction', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'data-extraction/index.html'));
  });

  // Navigation Maze task
  app.get('/tasks/navigation-maze', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'navigation-maze/index.html'));
  });

  // Navigation Maze sub-pages (with path traversal protection)
  app.get('/tasks/navigation-maze/pages/:page', (req, res) => {
    const page = path.basename(req.params.page); // Strip directory traversal
    const filePath = path.join(tasksDir, 'navigation-maze/pages', page);
    const resolvedPath = path.resolve(filePath);
    const allowedDir = path.resolve(path.join(tasksDir, 'navigation-maze/pages'));
    if (!resolvedPath.startsWith(allowedDir)) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.sendFile(resolvedPath);
  });

  // Captcha Gauntlet task
  app.get('/tasks/captcha-gauntlet', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'captcha-gauntlet/index.html'));
  });

  // Prediction Market task
  app.get('/tasks/prediction-market', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'prediction-market/index.html'));
  });

  // Verification (Reverse CAPTCHA) task
  app.get('/tasks/verification', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'verification/index.html'));
  });

  // ============================================================================
  // GAME TASKS
  // ============================================================================

  // Trivia Challenge
  app.get('/tasks/trivia', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'trivia/index.html'));
  });

  // Math Challenge
  app.get('/tasks/math', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'math/index.html'));
  });

  // Word Logic
  app.get('/tasks/word', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'word/index.html'));
  });

  // Logic Puzzles
  app.get('/tasks/logic', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'logic/index.html'));
  });

  // Chess Puzzles
  app.get('/tasks/chess', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'chess/index.html'));
  });

  // ============================================================================
  // API ENDPOINTS
  // ============================================================================

  // Health check
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      timestamp: Date.now(),
      version: '0.1.0'
    });
  });

  // ============================================================================
  // MARKETPLACE API ROUTES
  // ============================================================================

  // Agent management
  app.use('/api/agents', agentsRouter);

  // Competition management
  app.use('/api/competitions', competitionsRouter);

  // Leaderboards
  app.use('/api/leaderboards', leaderboardsRouter);

  // Prediction Markets
  app.use('/api/predictions', predictionMarketsRouter);

  // User Predictions (human users)
  app.use('/api/user', userPredictionsRouter);

  // Games/Puzzles (humans + AI agents)
  app.use('/api/games', gamesRouter);

  // Meta Markets (betting on AI competitions)
  app.use('/api/meta-markets', metaMarketsRouter);

  // Agent Verification (reverse CAPTCHA)
  app.use('/api/verification', verificationRouter);

  // Payments (real money)
  app.use('/api/payments', paymentsRouter);

  // Trading (real money orders)
  app.use('/api/trading', tradingRouter);

  // State
  let currentCompetition: Competition | null = null;
  let currentTournament: Tournament | null = null;

  app.get('/api/competition', (_req, res) => {
    if (!currentCompetition) {
      return res.status(404).json({ error: 'No active competition' });
    }
    res.json(currentCompetition);
  });

  // Get leaderboard
  app.get('/api/leaderboard', (_req, res) => {
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

  // Tournament API endpoints
  app.get('/api/tournament', (_req, res) => {
    if (!currentTournament) {
      return res.status(404).json({ error: 'No active tournament' });
    }
    res.json(currentTournament);
  });

  app.get('/api/tournament/bracket', (_req, res) => {
    if (!currentTournament) {
      return res.status(404).json({ error: 'No active tournament' });
    }
    res.json(currentTournament.bracket);
  });

  app.get('/api/tournament/standings', (_req, res) => {
    if (!currentTournament) {
      return res.status(404).json({ error: 'No active tournament' });
    }
    res.json(currentTournament.finalStandings);
  });

  // Serve frontend build (SPA fallback)
  const frontendDistPath = path.join(__dirname, '../../frontend/dist');
  if (fs.existsSync(frontendDistPath)) {
    app.use(express.static(frontendDistPath));

    // SPA fallback - serve index.html for any unmatched routes
    app.get('*', (req, res, next) => {
      // Skip API routes and task routes
      if (req.path.startsWith('/api/') || req.path.startsWith('/tasks/')) {
        return next();
      }
      res.sendFile(path.join(frontendDistPath, 'index.html'));
    });
  }

  // ============================================================================
  // WEBSOCKET (real-time streaming)
  // ============================================================================

  // Track market subscriptions per socket
  const socketMarketSubscriptions = new Map<string, Set<string>>();

  // Connect to Polymarket WebSocket for live prices
  let priceStreamConnected = false;
  const connectPriceStream = () => {
    if (priceStreamConnected) return;

    marketService.connectToLiveUpdates((update: PriceUpdate) => {
      // Broadcast price update to all subscribed clients
      io.to(`market:${update.marketId}`).emit('price:update', {
        marketId: update.marketId,
        outcomes: [{
          id: update.tokenId,
          name: update.outcome,
          price: Math.round(update.price * 100),
          probability: update.price
        }],
        timestamp: update.timestamp
      });
    });

    priceStreamConnected = true;
    log.info('Connected to market price stream');
  };

  // WebSocket authentication middleware
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && typeof token === 'string') {
      try {
        const { data: { user } } = await wsSupabase.auth.getUser(token);
        if (user) {
          (socket as any).userId = user.id;
        }
      } catch (error) {
        log.debug('WebSocket auth failed', { error: error instanceof Error ? error.message : String(error) });
      }
    }
    next(); // Allow connection but track auth status
  });

  io.on('connection', (socket) => {
    log.info(`Client connected: ${socket.id}`, { authenticated: !!(socket as any).userId });

    // Initialize subscription tracking for this socket
    socketMarketSubscriptions.set(socket.id, new Set());

    // Send current state on connect
    if (currentCompetition) {
      socket.emit('competition:state', currentCompetition);
    }

    // Subscribe to competition updates
    const handleEvent = (event: StreamEvent) => {
      socket.emit(event.type, event);
    };

    eventBus.on('*', handleEvent);

    // Handle market subscriptions for live price updates
    socket.on('subscribe:market', (marketId: string) => {
      socket.join(`market:${marketId}`);

      const subs = socketMarketSubscriptions.get(socket.id);
      if (subs) {
        subs.add(marketId);
      }

      // Subscribe to the market in the price stream
      marketService.subscribeToMarket(marketId);
      log.debug(`Socket ${socket.id} subscribed to market ${marketId}`);

      // Ensure price stream is connected
      connectPriceStream();
    });

    socket.on('unsubscribe:market', (marketId: string) => {
      socket.leave(`market:${marketId}`);

      const subs = socketMarketSubscriptions.get(socket.id);
      if (subs) {
        subs.delete(marketId);
      }

      log.debug(`Socket ${socket.id} unsubscribed from market ${marketId}`);
    });

    socket.on('disconnect', () => {
      log.info(`Client disconnected: ${socket.id}`);
      eventBus.off('*', handleEvent);

      // Clean up subscriptions
      socketMarketSubscriptions.delete(socket.id);
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

    // Update cached tournament state
    if (event.type === 'tournament:start' || event.type === 'tournament:end') {
      currentTournament = (event.data as any).tournament;
    }
    if (event.type === 'bracket:update') {
      if (currentTournament) {
        currentTournament.bracket = (event.data as any).bracket;
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

        // Start market resolution polling
        startResolver();
        log.info('Market resolver started');

        // Start market sync service (background ingestion from Polymarket + Kalshi)
        marketSyncService.start();
        log.info('Market sync service started');
      });
    });
  };

  const stop = async (): Promise<void> => {
    // Cancel all active competitions gracefully
    if (competitionManager.activeCount > 0) {
      log.info(`Cancelling ${competitionManager.activeCount} active competitions...`);
      await competitionManager.cancelAll();
    }

    marketSyncService.stop();

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
    setCompetition: (comp: Competition) => { currentCompetition = comp; },
    setTournament: (tournament: Tournament) => { currentTournament = tournament; }
  };
}

/**
 * Quick start helper for CLI tools
 * Returns a cleanup function
 */
export function startApiServer(port: number = config.port): () => void {
  const api = createAPIServer();
  api.start(port);
  return () => api.stop();
}

export default createAPIServer;
