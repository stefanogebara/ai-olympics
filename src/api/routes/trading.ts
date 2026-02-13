/**
 * Trading API Routes
 * Endpoints for real-money order management, positions, and trade history
 */

import { Router, Request, Response } from 'express';
import { requireAuth as authMiddleware } from '../middleware/auth.js';
import { orderManager } from '../../services/order-manager.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('TradingAPI');

// Feature flag: real-money trading disabled until legal review + security hardening
const REAL_MONEY_TRADING_ENABLED = process.env.ENABLE_REAL_MONEY_TRADING === 'true';

// Middleware to gate real-money features
function requireRealMoneyEnabled(_req: Request, res: Response, next: Function) {
  if (!REAL_MONEY_TRADING_ENABLED) {
    return res.status(503).json({
      error: 'Real-money trading is currently disabled',
      message: 'This feature is disabled during the beta period. Use sandbox mode for testing.',
    });
  }
  next();
}

// ============================================================================
// AUTH: Uses shared requireAuth middleware (imported as authMiddleware)
// The middleware attaches (req as any).user and (req as any).userClient
// ============================================================================

interface AuthenticatedRequest extends Request {
  userId?: string;
}

// ============================================================================
// ORDER ENDPOINTS
// ============================================================================

/**
 * POST /api/trading/orders
 * Place an order
 */
router.post('/orders', requireRealMoneyEnabled, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const { marketId, marketSource, outcome, amountCents } = req.body;

    if (!marketId || !marketSource || !outcome || !amountCents) {
      return res.status(400).json({ error: 'Missing required fields: marketId, marketSource, outcome, amountCents' });
    }

    const order = await orderManager.placeOrder(userId, marketId, marketSource, outcome, amountCents);

    res.json({ order });
  } catch (error) {
    log.error('Error placing order', { error: String(error) });
    res.status(500).json({ error: 'Failed to place order' });
  }
});

/**
 * GET /api/trading/orders
 * Get open orders
 */
router.get('/orders', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const orders = await orderManager.getOpenOrders(userId);

    res.json({ orders });
  } catch (error) {
    log.error('Error fetching orders', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/trading/orders/:id
 * Get a specific order
 */
router.get('/orders/:id', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const userDb = (req as any).userClient;
    const orderId = req.params.id;

    // Use user-scoped client (RLS ensures user can only see their own orders)
    const { data: order, error } = await userDb
      .from('aio_real_bets')
      .select('*')
      .eq('id', orderId)
      .eq('user_id', userId)
      .single();

    if (error || !order) {
      return res.status(404).json({ error: 'Order not found' });
    }

    res.json({ order });
  } catch (error) {
    log.error('Error fetching order', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch order' });
  }
});

/**
 * DELETE /api/trading/orders/:id
 * Cancel an order
 */
router.delete('/orders/:id', requireRealMoneyEnabled, authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const orderId = String(req.params.id);

    await orderManager.cancelOrder(userId, orderId);

    res.json({ success: true });
  } catch (error) {
    log.error('Error cancelling order', { error: String(error) });
    res.status(500).json({ error: 'Failed to cancel order' });
  }
});

// ============================================================================
// POSITION ENDPOINTS
// ============================================================================

/**
 * GET /api/trading/positions
 * Get user's positions
 */
router.get('/positions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const positions = await orderManager.getUserPositions(userId);

    res.json({ positions });
  } catch (error) {
    log.error('Error fetching positions', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch positions' });
  }
});

// ============================================================================
// TRADE HISTORY
// ============================================================================

/**
 * GET /api/trading/history
 * Get trade history with pagination
 */
router.get('/history', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = (req as any).user.id;
    const pageStr = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

    const page = parseInt(pageStr as string) || 1;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);
    const offset = (page - 1) * limit;

    const userDb = (req as any).userClient;

    // Use user-scoped client for trade history (RLS enforced)
    const { data: trades, error } = await userDb
      .from('aio_real_bets')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit);

    if (error) {
      log.error('Error querying trade history', { error: String(error) });
      return res.status(500).json({ error: 'Failed to fetch trade history' });
    }

    res.json({
      trades: trades || [],
      page,
      limit,
      hasMore: (trades || []).length === limit + 1
    });
  } catch (error) {
    log.error('Error fetching trade history', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch trade history' });
  }
});

export default router;
