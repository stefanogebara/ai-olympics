/**
 * Games API Routes
 * Endpoints for puzzle games playable by both humans and AI agents
 */

import { Router, Request, Response } from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { puzzleService, type GameType, type Difficulty } from '../../services/puzzle-service.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('GamesAPI');

// Valid game types and difficulties
const VALID_GAME_TYPES: GameType[] = ['trivia', 'math', 'chess', 'word', 'logic'];
const VALID_DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

// ============================================================================
// OPTIONAL AUTH MIDDLEWARE
// For endpoints that can be used by both authenticated users and agents
// ============================================================================

interface AuthenticatedRequest extends Request {
  userId?: string;
  agentId?: string;
}

async function optionalAuthMiddleware(req: AuthenticatedRequest, res: Response, next: Function) {
  try {
    // Check for user auth
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.substring(7);
      const { data: { user } } = await supabase.auth.getUser(token);
      if (user) {
        req.userId = user.id;
      }
    }

    // Check for agent ID in body or query
    const agentId = req.body?.agentId || req.query?.agentId;
    if (agentId) {
      req.agentId = agentId as string;
    }

    next();
  } catch (error) {
    // Continue without auth
    next();
  }
}

// ============================================================================
// GAME TYPE ENDPOINTS
// ============================================================================

/**
 * GET /api/games
 * List available game types
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const gameTypes = await puzzleService.getGameTypes();

    res.json({
      games: gameTypes,
      count: gameTypes.length
    });
  } catch (error) {
    log.error('Error fetching game types', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch game types' });
  }
});

// ============================================================================
// LEADERBOARD ENDPOINTS (must come before /:type routes)
// ============================================================================

/**
 * GET /api/games/leaderboard
 * Get combined leaderboard with top scores per game type
 */
router.get('/leaderboard', async (req: Request, res: Response) => {
  try {
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 10, 50);

    // Get top scores for each game type
    const leaderboard: Array<{ gameType: string; userId?: string; agentId?: string; score: number; username?: string }> = [];

    for (const gameType of VALID_GAME_TYPES) {
      const gameLeaderboard = await puzzleService.getLeaderboard(gameType, limit);
      leaderboard.push(...gameLeaderboard.map(entry => ({
        ...entry,
        gameType
      })));
    }

    // Sort by score descending
    leaderboard.sort((a, b) => b.score - a.score);

    res.json({
      leaderboard: leaderboard.slice(0, limit * VALID_GAME_TYPES.length),
      count: leaderboard.length
    });
  } catch (error) {
    log.error('Error fetching combined leaderboard', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

/**
 * GET /api/games/leaderboard/global
 * Get global leaderboard across all games
 */
router.get('/leaderboard/global', async (req: Request, res: Response) => {
  try {
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    const leaderboard = await puzzleService.getGlobalLeaderboard(limit);

    res.json({
      leaderboard,
      count: leaderboard.length
    });
  } catch (error) {
    log.error('Error fetching global leaderboard', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch global leaderboard' });
  }
});

// ============================================================================
// USER STATS ENDPOINTS (must come before /:type routes)
// ============================================================================

/**
 * GET /api/games/stats/me
 * Get authenticated user's stats
 */
router.get('/stats/me', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const gameType = (Array.isArray(req.query.gameType) ? req.query.gameType[0] : req.query.gameType) as GameType | undefined;

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const stats = await puzzleService.getUserStats(userId, gameType);
    res.json(stats);
  } catch (error) {
    log.error('Error fetching user stats', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch user stats' });
  }
});

/**
 * GET /api/games/history/me
 * Get authenticated user's game history
 */
router.get('/history/me', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId;
    const gameType = (Array.isArray(req.query.gameType) ? req.query.gameType[0] : req.query.gameType) as GameType | undefined;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 20, 100);

    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const history = await puzzleService.getUserHistory(userId, gameType, limit);
    res.json({
      history,
      count: history.length
    });
  } catch (error) {
    log.error('Error fetching user history', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch user history' });
  }
});

// ============================================================================
// GAME TYPE ENDPOINTS (parameterized routes - must come after static routes)
// ============================================================================

/**
 * GET /api/games/:type
 * Get details for a specific game type
 */
router.get('/:type', async (req: Request, res: Response) => {
  try {
    const gameType = req.params.type as GameType;

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({ error: `Invalid game type. Valid types: ${VALID_GAME_TYPES.join(', ')}` });
    }

    const gameTypes = await puzzleService.getGameTypes();
    const game = gameTypes.find(g => g.id === gameType);

    if (!game) {
      return res.status(404).json({ error: 'Game type not found' });
    }

    res.json(game);
  } catch (error) {
    log.error('Error fetching game type', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch game type' });
  }
});

// ============================================================================
// PUZZLE ENDPOINTS
// ============================================================================

/**
 * GET /api/games/:type/puzzle
 * Get a puzzle for a game type
 */
router.get('/:type/puzzle', async (req: Request, res: Response) => {
  try {
    const gameType = req.params.type as GameType;
    const difficultyStr = (Array.isArray(req.query.difficulty) ? req.query.difficulty[0] : req.query.difficulty) as string | undefined;
    const difficulty: Difficulty = (difficultyStr && VALID_DIFFICULTIES.includes(difficultyStr as Difficulty))
      ? difficultyStr as Difficulty
      : 'medium';

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({ error: `Invalid game type. Valid types: ${VALID_GAME_TYPES.join(', ')}` });
    }

    const puzzle = await puzzleService.getPuzzle(gameType, difficulty);

    if (!puzzle) {
      return res.status(500).json({ error: 'Failed to generate puzzle' });
    }

    res.json(puzzle);
  } catch (error) {
    log.error('Error generating puzzle', { error: String(error) });
    res.status(500).json({ error: 'Failed to generate puzzle' });
  }
});

/**
 * POST /api/games/:type/submit
 * Submit answer for a puzzle
 */
router.post('/:type/submit', optionalAuthMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const gameType = req.params.type as GameType;
    const { puzzleId, answer, timeMs, agentId: bodyAgentId } = req.body;

    // Use auth middleware results or body params
    const userId = req.userId;
    const agentId = req.agentId || bodyAgentId;

    if (!userId && !agentId) {
      return res.status(400).json({
        success: false,
        error: 'Either user authentication or agentId is required'
      });
    }

    // Verify agent ownership if agentId provided with auth
    if (agentId && userId) {
      const { data: agent } = await supabase
        .from('aio_agents')
        .select('owner_id')
        .eq('id', agentId)
        .single();
      if (agent && agent.owner_id !== userId) {
        return res.status(403).json({
          success: false,
          error: 'Not authorized to submit as this agent'
        });
      }
    }

    if (!puzzleId || answer === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: puzzleId, answer'
      });
    }

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({
        success: false,
        error: `Invalid game type. Valid types: ${VALID_GAME_TYPES.join(', ')}`
      });
    }

    const result = await puzzleService.submitAnswer(
      puzzleId,
      String(answer),
      timeMs || 0,
      userId,
      agentId
    );

    res.json(result);
  } catch (error) {
    log.error('Error submitting answer', { error: String(error) });
    res.status(500).json({ success: false, error: 'Failed to submit answer' });
  }
});

/**
 * GET /api/games/:type/leaderboard
 * Get leaderboard for a game type
 */
router.get('/:type/leaderboard', async (req: Request, res: Response) => {
  try {
    const gameType = req.params.type as GameType;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    if (!VALID_GAME_TYPES.includes(gameType)) {
      return res.status(400).json({ error: `Invalid game type. Valid types: ${VALID_GAME_TYPES.join(', ')}` });
    }

    const leaderboard = await puzzleService.getLeaderboard(gameType, limit);

    res.json({
      gameType,
      leaderboard,
      count: leaderboard.length
    });
  } catch (error) {
    log.error('Error fetching leaderboard', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

export default router;
