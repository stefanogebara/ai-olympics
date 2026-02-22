import * as Sentry from '@sentry/node';
import express from 'express';
import { createServer } from 'http';
import { Server as SocketServer, type Socket } from 'socket.io';

interface AuthenticatedSocket extends Socket {
  userId?: string;
  authenticated?: boolean;
}
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import YAML from 'yamljs';
import { config, validateConfig, validateSecrets, featureFlags } from '../shared/config.js';

// Initialize Sentry for backend error tracking
if (process.env.SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    tracesSampleRate: process.env.NODE_ENV === 'production'
      ? parseFloat(process.env.SENTRY_SAMPLE_RATE || '0.1')
      : 1.0,
    integrations: [
      Sentry.httpIntegration(),
      Sentry.expressIntegration(),
    ],
  });
}
import { eventBus } from '../shared/utils/events.js';
import { createLogger } from '../shared/utils/logger.js';
import { serviceClient as supabase } from '../shared/utils/supabase.js';
import { initRedis, getInterruptedCompetitions, removeCompetitionSnapshot, closeRedis, getEventsFromLog } from '../shared/utils/redis.js';
import type { Competition, StreamEvent, Tournament } from '../shared/types/index.js';
import fs from 'fs';
import { createClient } from '@supabase/supabase-js';

// API Routes
import agentsRouter from './routes/agents.js';
import competitionsRouter from './routes/competitions.js';
import leaderboardsRouter from './routes/leaderboards.js';
import predictionMarketsRouter from './routes/prediction-markets/index.js';
import userPredictionsRouter from './routes/user-predictions.js';
import gamesRouter from './routes/games.js';
import metaMarketsRouter from './routes/meta-markets.js';
import verificationRouter from './routes/verification.js';
import paymentsRouter from './routes/payments.js';
import tradingRouter from './routes/trading.js';
import tournamentsRouter from './routes/tournaments.js';
import championshipsRouter from './routes/championships.js';
import adminRouter from './routes/admin.js';

// Competition orchestrator
import { competitionManager } from '../orchestrator/competition-manager.js';
import { tournamentManager } from '../orchestrator/tournament-manager.js';

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
  process.env.FRONTEND_URL,
].filter(Boolean) as string[];

// Check if origin matches allowed Vercel deployment patterns
function isAllowedOrigin(origin: string): boolean {
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  // Allow *.vercel.app deployments
  if (/^https:\/\/[\w-]+\.vercel\.app$/.test(origin)) return true;
  return false;
}

// Rate limiter factory with consistent Retry-After header
function createLimiter(max: number, windowMs: number, errorMsg: string) {
  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      const retryAfterSec = Math.ceil(windowMs / 1000);
      res.set('Retry-After', String(retryAfterSec));
      res.status(429).json({ error: errorMsg });
    },
  });
}

const MINUTE = 60 * 1000;
const generalLimiter = createLimiter(100, MINUTE, 'Too many requests, please try again later');
const authLimiter = createLimiter(10, MINUTE, 'Too many auth attempts, please try again later');
const mutationLimiter = createLimiter(30, MINUTE, 'Too many requests, please try again later');
const financialLimiter = createLimiter(10, MINUTE, 'Too many financial requests, please try again later');
const competitionLimiter = createLimiter(5, MINUTE, 'Too many requests, please try again later');
const puzzleSubmitLimiter = createLimiter(10, MINUTE, 'Too many puzzle submissions, please try again later');

// Supabase client for WebSocket auth
const wsSupabase = createClient(
  process.env.SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_KEY || ''
);

export function createAPIServer() {
  const app = express();

  // Trust first proxy (Fly.io / Vercel load balancer) for correct client IP in rate limiting and logs
  app.set('trust proxy', 1);

  const server = createServer(app);
  const io = new SocketServer(server, {
    cors: {
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) {
          callback(null, true);
        } else {
          callback(new Error('Not allowed by CORS'));
        }
      },
      methods: ['GET', 'POST']
    }
  });

  // L3: Security headers with basic CSP
  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://api.anthropic.com", "https://api.openai.com"],
        frameAncestors: ["'none'"],  // Prevent clickjacking (replaces X-Frame-Options: DENY)
        frameSrc: ["'self'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
      },
    },
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
  app.use('/api/payments', financialLimiter);
  app.use('/api/meta-markets', financialLimiter);
  app.use('/api/competitions/join', competitionLimiter);
  app.use('/api/competitions/start', competitionLimiter);
  app.use('/api/championships', mutationLimiter);
  app.use('/api/tournaments', mutationLimiter);
  app.use('/api/games/:type/submit', puzzleSubmitLimiter);
  app.use('/api/games', mutationLimiter);

  // CORS - restricted origins
  app.use((_req, res, next) => {
    const origin = _req.headers.origin;
    if (origin && isAllowedOrigin(origin)) {
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
  // Relax CSP for task pages — self-contained HTML with inline scripts
  // ============================================================================
  const tasksDir = path.join(__dirname, '../../src/tasks');

  app.use('/tasks', (_req, res, next) => {
    res.setHeader('Content-Security-Policy',
      "default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none'; base-uri 'self'");
    next();
  });

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

  // Code Debug Challenge
  app.get('/tasks/code', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'code/index.html'));
  });

  // Cipher Break Challenge
  app.get('/tasks/cipher', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'cipher/index.html'));
  });

  // Spatial Logic Challenge
  app.get('/tasks/spatial', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'spatial/index.html'));
  });

  // ============================================================================
  // CREATIVE TASKS
  // ============================================================================

  // Design Challenge
  app.get('/tasks/design-challenge', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'design-challenge/index.html'));
  });

  // Writing Challenge
  app.get('/tasks/writing-challenge', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'writing-challenge/index.html'));
  });

  // Pitch Deck Challenge
  app.get('/tasks/pitch-deck', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'pitch-deck/index.html'));
  });

  // ============================================================================
  // CODING TASKS
  // ============================================================================

  // Code Debug Challenge
  app.get('/tasks/code-debug', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'code-debug/index.html'));
  });

  // Code Golf Challenge
  app.get('/tasks/code-golf', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'code-golf/index.html'));
  });

  // API Integration Challenge
  app.get('/tasks/api-integration', (_req, res) => {
    res.sendFile(path.join(tasksDir, 'api-integration/index.html'));
  });

  // ============================================================================
  // API ENDPOINTS
  // ============================================================================

  // Health check — verifies critical dependencies
  app.get('/api/health', async (_req, res) => {
    const checks: Record<string, 'ok' | 'error'> = {};

    // Verify Supabase connectivity (3s timeout prevents hanging when Supabase is down)
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const { error } = await supabase
        .from('aio_domains')
        .select('id', { count: 'exact', head: true })
        .abortSignal(controller.signal);
      clearTimeout(timeout);
      checks.database = error ? 'error' : 'ok';
    } catch {
      checks.database = 'error';
    }

    const allOk = Object.values(checks).every(v => v === 'ok');
    res.status(allOk ? 200 : 503).json({
      status: allOk ? 'ok' : 'degraded',
      timestamp: Date.now(),
      version: '0.1.0',
      checks,
      services: {
        marketSync: featureFlags.marketSync ? 'enabled' : 'disabled',
        activeCompetitions: competitionManager.activeCount,
        activeTournaments: tournamentManager.activeCount,
        wsConnections: io.engine?.clientsCount ?? 0,
      },
    });
  });

  // OpenAPI / Swagger UI
  const openapiPath = path.join(__dirname, 'openapi.yaml');
  if (fs.existsSync(openapiPath)) {
    const swaggerDocument = YAML.load(openapiPath);
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'AI Olympics API Docs',
    }));
    app.get('/api/openapi.yaml', (_req, res) => {
      res.sendFile(openapiPath);
    });
  }

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

  // Tournaments
  app.use('/api/tournaments', tournamentsRouter);

  // Championships
  app.use('/api/championships', championshipsRouter);

  // Admin
  app.use('/api/admin', adminRouter);

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

  // Per-IP connection tracking for rate limiting and max connections
  const ipConnectionCounts = new Map<string, number>();
  const ipConnectionTimestamps = new Map<string, number[]>();
  const MAX_CONNECTIONS_PER_IP = 10;
  const CONNECTION_RATE_WINDOW = 60_000; // 1 minute
  const MAX_CONNECTIONS_PER_WINDOW = 20;

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

  // WebSocket connection rate limiting middleware (per IP)
  io.use((socket, next) => {
    const ip = socket.handshake.address || 'unknown';
    const now = Date.now();

    // Check max concurrent connections per IP
    const currentCount = ipConnectionCounts.get(ip) || 0;
    if (currentCount >= MAX_CONNECTIONS_PER_IP) {
      log.warn('WebSocket max connections per IP exceeded', { ip, count: currentCount });
      return next(new Error('Too many connections'));
    }

    // Check connection rate per IP
    const timestamps = ipConnectionTimestamps.get(ip) || [];
    const recentTimestamps = timestamps.filter(ts => now - ts < CONNECTION_RATE_WINDOW);
    if (recentTimestamps.length >= MAX_CONNECTIONS_PER_WINDOW) {
      log.warn('WebSocket connection rate limit exceeded', { ip, rate: recentTimestamps.length });
      return next(new Error('Connection rate limit exceeded'));
    }

    recentTimestamps.push(now);
    ipConnectionTimestamps.set(ip, recentTimestamps);
    ipConnectionCounts.set(ip, currentCount + 1);

    next();
  });

  // WebSocket authentication middleware
  // Connections are always allowed (for spectating), but userId is set only if token is valid.
  // Mutation actions (vote:cast, subscribe:market) require authentication.
  io.use(async (socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (token && typeof token === 'string') {
      try {
        const { data: { user } } = await wsSupabase.auth.getUser(token);
        if (user) {
          (socket as AuthenticatedSocket).userId = user.id;
          (socket as AuthenticatedSocket).authenticated = true;
        }
      } catch (error) {
        log.debug('WebSocket auth failed', { error: error instanceof Error ? error.message : String(error) });
        (socket as AuthenticatedSocket).authenticated = false;
      }
    } else {
      (socket as AuthenticatedSocket).authenticated = false;
    }
    next(); // Allow connection but track auth status
  });

  io.on('connection', (socket) => {
    const isAuthenticated = !!(socket as AuthenticatedSocket).authenticated;
    const userId = (socket as AuthenticatedSocket).userId;
    log.info(`Client connected: ${socket.id}`, { authenticated: isAuthenticated });

    // Notify client of their auth status so UI can react
    socket.emit('auth:status', {
      authenticated: isAuthenticated,
      userId: userId || null,
    });

    // Helper: reject unauthenticated mutation attempts
    function requireSocketAuth(eventName: string): boolean {
      if (!userId) {
        socket.emit(`${eventName}:error`, { error: 'Authentication required' });
        return false;
      }
      return true;
    }

    // Initialize subscription tracking for this socket
    socketMarketSubscriptions.set(socket.id, new Set());

    // Send current state on connect (public spectating - no auth required)
    if (currentCompetition) {
      socket.emit('competition:state', currentCompetition);
    }

    // Subscribe to competition updates (public - spectating is allowed without auth)
    const handleEvent = (event: StreamEvent) => {
      socket.emit(event.type, event);
    };

    eventBus.on('*', handleEvent);

    // Reconnect catchup: client sends lastEventTimestamp, server replays missed events
    // Allows seamless reconnection without missing events during brief disconnects
    socket.on('competition:catchup', async (data: { competitionId: string; sinceTimestamp: number }) => {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!data?.competitionId || !uuidRe.test(data.competitionId)) {
        socket.emit('catchup:error', { error: 'Invalid competition ID' });
        return;
      }
      const since = typeof data.sinceTimestamp === 'number' ? data.sinceTimestamp : 0;

      // Try Redis event log first, fall back to in-memory history
      let missedEvents = await getEventsFromLog(data.competitionId, since);
      if (missedEvents.length === 0) {
        missedEvents = eventBus.getHistory({ competitionId: data.competitionId, since });
      }

      for (const event of missedEvents) {
        const e = event as StreamEvent;
        socket.emit(e.type, e);
      }

      socket.emit('catchup:complete', {
        competitionId: data.competitionId,
        eventsReplayed: missedEvents.length,
      });
      log.debug(`Catchup for ${socket.id}: replayed ${missedEvents.length} events since ${since}`);
    });

    // Join a competition room (auth required for targeted interactions)
    socket.on('join:competition', (competitionId: string) => {
      if (!requireSocketAuth('join')) return;
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(competitionId)) {
        socket.emit('join:error', { error: 'Invalid competition ID' });
        return;
      }
      socket.join(`competition:${competitionId}`);
      log.debug(`Socket ${socket.id} joined competition room ${competitionId}`);
    });

    // Join a tournament room (public spectating - no auth required)
    socket.on('join:tournament', (tournamentId: string) => {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(tournamentId)) {
        socket.emit('join:error', { error: 'Invalid tournament ID' });
        return;
      }
      socket.join(`tournament:${tournamentId}`);
      log.debug(`Socket ${socket.id} joined tournament room ${tournamentId}`);
    });

    socket.on('leave:tournament', (tournamentId: string) => {
      socket.leave(`tournament:${tournamentId}`);
    });

    // Join a championship room (public spectating - no auth required)
    socket.on('join:championship', (championshipId: string) => {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(championshipId)) {
        socket.emit('join:error', { error: 'Invalid championship ID' });
        return;
      }
      socket.join(`championship:${championshipId}`);
      log.debug(`Socket ${socket.id} joined championship room ${championshipId}`);
    });

    socket.on('leave:championship', (championshipId: string) => {
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(championshipId)) return;
      socket.leave(`championship:${championshipId}`);
    });

    // Chat messages (auth required)
    socket.on('chat:message', (data: { competition_id: string; message: string }) => {
      if (!requireSocketAuth('chat')) return;
      const { competition_id, message } = data;
      if (!competition_id || !message || typeof message !== 'string') {
        socket.emit('chat:error', { error: 'Invalid chat data' });
        return;
      }
      // Sanitize and truncate message
      const sanitized = message.trim().slice(0, 500);
      if (!sanitized) return;
      io.to(`competition:${competition_id}`).emit('chat:message', {
        userId,
        message: sanitized,
        timestamp: Date.now(),
      });
    });

    // Handle market subscriptions for live price updates (requires auth)
    socket.on('subscribe:market', (marketId: unknown) => {
      if (!requireSocketAuth('subscribe:market')) return;
      if (!marketId || typeof marketId !== 'string' || marketId.length > 200) {
        socket.emit('subscribe:market:error', { error: 'Invalid market ID' });
        return;
      }
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

    socket.on('unsubscribe:market', (marketId: unknown) => {
      if (!marketId || typeof marketId !== 'string' || marketId.length > 200) return;
      socket.leave(`market:${marketId}`);

      const subs = socketMarketSubscriptions.get(socket.id);
      if (subs) {
        subs.delete(marketId);
      }

      log.debug(`Socket ${socket.id} unsubscribed from market ${marketId}`);
    });

    // Handle spectator vote casting via WebSocket
    // Rate limit: track per-socket vote timestamps
    const voteTimestamps: number[] = [];
    const VOTE_RATE_LIMIT = 5; // max votes per window
    const VOTE_RATE_WINDOW = 10_000; // 10 seconds

    socket.on('vote:cast', async (data: { competition_id: string; agent_id: string; vote_type: string }) => {
      if (!requireSocketAuth('vote')) return;

      // H5: Per-socket rate limiting
      const now = Date.now();
      while (voteTimestamps.length > 0 && voteTimestamps[0] < now - VOTE_RATE_WINDOW) {
        voteTimestamps.shift();
      }
      if (voteTimestamps.length >= VOTE_RATE_LIMIT) {
        socket.emit('vote:error', { error: 'Rate limit exceeded, try again shortly' });
        return;
      }
      voteTimestamps.push(now);

      const { competition_id, agent_id, vote_type } = data;
      if (!competition_id || !agent_id || !['cheer', 'predict_win', 'mvp'].includes(vote_type)) {
        socket.emit('vote:error', { error: 'Invalid vote data' });
        return;
      }

      // C3: Validate UUID format to prevent injection
      const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      if (!uuidRe.test(competition_id) || !uuidRe.test(agent_id)) {
        socket.emit('vote:error', { error: 'Invalid ID format' });
        return;
      }

      try {
        // C3: Verify competition exists and is running before allowing votes
        const { data: comp, error: compErr } = await wsSupabase
          .from('aio_competitions')
          .select('id, status')
          .eq('id', competition_id)
          .single();

        if (compErr || !comp) {
          socket.emit('vote:error', { error: 'Competition not found' });
          return;
        }
        if (comp.status !== 'running') {
          socket.emit('vote:error', { error: 'Voting is only allowed during running competitions' });
          return;
        }

        // C3: Verify agent is a participant in this competition
        const { data: participant } = await wsSupabase
          .from('aio_competition_participants')
          .select('id')
          .eq('competition_id', competition_id)
          .eq('agent_id', agent_id)
          .maybeSingle();

        if (!participant) {
          socket.emit('vote:error', { error: 'Agent is not a participant in this competition' });
          return;
        }

        const { error } = await wsSupabase
          .from('aio_spectator_votes')
          .insert({
            competition_id,
            agent_id,
            user_id: userId,
            vote_type,
          });

        if (error) {
          socket.emit('vote:error', { error: error.code === '23505' ? 'Already voted' : 'Vote failed' });
          return;
        }

        // H5: Use aggregation with limit instead of fetching all rows
        const { data: votes } = await wsSupabase
          .from('aio_spectator_votes')
          .select('agent_id, vote_type')
          .eq('competition_id', competition_id)
          .limit(1000);

        const voteCounts: Record<string, { cheers: number; predict_win: number; mvp: number }> = {};
        for (const vote of votes || []) {
          if (!voteCounts[vote.agent_id]) {
            voteCounts[vote.agent_id] = { cheers: 0, predict_win: 0, mvp: 0 };
          }
          if (vote.vote_type === 'cheer') voteCounts[vote.agent_id].cheers++;
          else if (vote.vote_type === 'predict_win') voteCounts[vote.agent_id].predict_win++;
          else if (vote.vote_type === 'mvp') voteCounts[vote.agent_id].mvp++;
        }

        // Broadcast updated counts to competition room only
        io.to(`competition:${competition_id}`).emit('vote:update', { competition_id, voteCounts });
      } catch (err) {
        log.error('WebSocket vote:cast failed', { error: err });
        socket.emit('vote:error', { error: 'Vote failed' });
      }
    });

    // Re-authenticate with a new token (e.g., after token refresh)
    socket.on('auth:refresh', async (token: unknown) => {
      if (!token || typeof token !== 'string') {
        socket.emit('auth:status', { authenticated: false, userId: null });
        return;
      }
      try {
        const { data: { user } } = await wsSupabase.auth.getUser(token);
        if (user) {
          (socket as AuthenticatedSocket).userId = user.id;
          (socket as AuthenticatedSocket).authenticated = true;
          socket.emit('auth:status', { authenticated: true, userId: user.id });
        } else {
          (socket as AuthenticatedSocket).userId = undefined;
          (socket as AuthenticatedSocket).authenticated = false;
          socket.emit('auth:status', { authenticated: false, userId: null });
        }
      } catch {
        (socket as AuthenticatedSocket).userId = undefined;
        (socket as AuthenticatedSocket).authenticated = false;
        socket.emit('auth:status', { authenticated: false, userId: null });
      }
    });

    socket.on('disconnect', () => {
      log.info(`Client disconnected: ${socket.id}`);
      eventBus.off('*', handleEvent);

      // Clean up subscriptions
      socketMarketSubscriptions.delete(socket.id);

      // Decrement IP connection count
      const ip = socket.handshake.address || 'unknown';
      const count = ipConnectionCounts.get(ip) || 0;
      if (count <= 1) {
        ipConnectionCounts.delete(ip);
      } else {
        ipConnectionCounts.set(ip, count - 1);
      }
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

  // Sentry error handler (must be after all routes and middleware)
  if (process.env.SENTRY_DSN) {
    Sentry.setupExpressErrorHandler(app);
  }

  // Catch-all Express error handler — prevents unhandled errors from crashing the server
  app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    log.error('Unhandled Express error', { error: err.message, stack: err.stack });
    if (!res.headersSent) {
      res.status(500).json({ error: 'Internal server error' });
    }
  });

  // ============================================================================
  // SERVER LIFECYCLE
  // ============================================================================

  const start = async (port: number = config.port): Promise<void> => {
    // Validate environment configuration
    log.info('Validating configuration...');
    const configCheck = validateConfig();
    if (!configCheck.valid) {
      log.error('Configuration validation failed - server cannot start', { errors: configCheck.errors });
      throw new Error(`Configuration errors: ${configCheck.errors.join('; ')}`);
    }

    // Validate secrets (stricter in production)
    log.info('Validating secrets...');
    const secretCheck = validateSecrets();
    if (!secretCheck.valid) {
      log.error('Secret validation failed - server cannot start', { errors: secretCheck.errors });
      throw new Error(`Secret validation errors: ${secretCheck.errors.join('; ')}`);
    }

    // Initialize Redis (optional - gracefully degrades)
    await initRedis();

    // Check for interrupted competitions from a previous server crash
    const interrupted = await getInterruptedCompetitions();
    if (interrupted.length > 0) {
      log.warn(`Found ${interrupted.length} interrupted competition(s) from previous session`, {
        competitions: interrupted.map(c => ({ id: c.competitionId, name: c.name, status: c.status })),
      });

      // Mark interrupted competitions as cancelled in DB and clean up Redis
      for (const snapshot of interrupted) {
        try {
          const { error } = await wsSupabase
            .from('aio_competitions')
            .update({ status: 'cancelled', updated_at: new Date().toISOString() })
            .eq('id', snapshot.competitionId);

          if (error) {
            log.error(`Failed to cancel interrupted competition ${snapshot.competitionId}`, { error: error.message });
          } else {
            log.info(`Marked interrupted competition as cancelled: ${snapshot.competitionId} (${snapshot.name})`);
          }

          await removeCompetitionSnapshot(snapshot.competitionId);
        } catch (err) {
          log.error(`Error cleaning up interrupted competition ${snapshot.competitionId}`, {
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    }

    return new Promise((resolve) => {
      server.listen(port, () => {
        // Set timeouts to prevent hung connections and proxy resets
        server.setTimeout(120_000);        // 120s max request duration (tournaments need time)
        server.keepAliveTimeout = 65_000;  // Must exceed proxy timeout (Fly.io default ~60s)
        server.headersTimeout = 66_000;    // Slightly above keepAliveTimeout per Node.js docs

        log.info(`API server running on http://localhost:${port}`);
        log.info(`WebSocket server ready`);
        resolve();

        // Start market resolution polling
        startResolver();
        log.info('Market resolver started');

        // Start market sync service (background ingestion from Polymarket + Kalshi)
        if (featureFlags.marketSync) {
          marketSyncService.start();
          log.info('Market sync service started');
        } else {
          log.info('Market sync service disabled (ENABLE_MARKET_SYNC=false)');
        }
      });
    });
  };

  const stop = async (): Promise<void> => {
    // Cancel all active competitions gracefully
    if (competitionManager.activeCount > 0) {
      log.info(`Cancelling ${competitionManager.activeCount} active competitions...`);
      await competitionManager.cancelAll();
    }

    // Cancel all active tournaments gracefully
    if (tournamentManager.activeCount > 0) {
      log.info(`Cancelling ${tournamentManager.activeCount} active tournaments...`);
      await tournamentManager.cancelAll();
    }

    marketSyncService.stop();

    // Close Redis connection
    await closeRedis();

    // Gracefully close WebSocket connections
    log.info('Notifying WebSocket clients of shutdown...');
    io.emit('server:shutting-down', { message: 'Server is restarting, please reconnect shortly' });
    io.disconnectSockets(true);

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
