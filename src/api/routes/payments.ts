/**
 * Payments API Routes
 * Endpoints for wallet management, deposits, withdrawals, and crypto wallets
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { serviceClient as supabase } from '../../shared/utils/supabase.js';
import { walletService } from '../../services/wallet-service.js';
import { stripeService } from '../../services/stripe-service.js';
import { cryptoWalletService } from '../../services/crypto-wallet-service.js';
import { createLogger } from '../../shared/utils/logger.js';

const router = Router();
const log = createLogger('PaymentsAPI');

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

interface AuthenticatedRequest extends Request {
  userId?: string;
}

async function authMiddleware(req: AuthenticatedRequest, res: Response, next: Function) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Authorization required' });
    }

    const token = authHeader.substring(7);
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    req.userId = user.id;
    next();
  } catch (error) {
    log.error('Auth middleware error', { error: String(error) });
    res.status(401).json({ error: 'Authentication failed' });
  }
}

// ============================================================================
// WALLET ENDPOINTS
// ============================================================================

/**
 * GET /api/payments/wallet
 * Get wallet balance
 */
router.get('/wallet', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const wallet = await walletService.getBalance(userId);

    res.json({ wallet });
  } catch (error) {
    log.error('Error fetching wallet', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch wallet' });
  }
});

/**
 * POST /api/payments/wallet
 * Create wallet
 */
router.post('/wallet', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const wallet = await walletService.getOrCreateWallet(userId);

    res.json({ wallet });
  } catch (error) {
    log.error('Error creating wallet', { error: String(error) });
    res.status(500).json({ error: 'Failed to create wallet' });
  }
});

// ============================================================================
// DEPOSIT ENDPOINTS
// ============================================================================

/**
 * POST /api/payments/deposit/stripe
 * Create Stripe checkout session for deposit
 */
router.post('/deposit/stripe', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const amountCents = req.body.amountCents || req.body.amount_cents;
    const email = req.body.email;

    if (!amountCents || !email) {
      return res.status(400).json({ error: 'Missing required fields: amountCents, email' });
    }

    const session = await stripeService.createCheckoutSession(userId, email, amountCents);

    res.json({ url: session.url });
  } catch (error) {
    log.error('Error creating Stripe checkout session', { error: String(error) });
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

/**
 * POST /api/payments/deposit/crypto
 * Get crypto deposit address
 */
router.post('/deposit/crypto', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const address = await cryptoWalletService.getDepositAddress();

    res.json({ address, network: 'polygon', token: 'USDC' });
  } catch (error) {
    log.error('Error getting deposit address', { error: String(error) });
    res.status(500).json({ error: 'Failed to get deposit address' });
  }
});

// ============================================================================
// WITHDRAWAL ENDPOINTS
// ============================================================================

/**
 * POST /api/payments/withdraw/stripe
 * Stripe Connect withdrawal (placeholder)
 */
router.post('/withdraw/stripe', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    res.json({ message: 'Stripe Connect withdrawal coming soon' });
  } catch (error) {
    log.error('Error processing Stripe withdrawal', { error: String(error) });
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

/**
 * POST /api/payments/withdraw/crypto
 * Execute crypto withdrawal
 */
router.post('/withdraw/crypto', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const toAddress = req.body.toAddress || req.body.to_address;
    const amountCents = req.body.amountCents || req.body.amount_cents;

    if (!toAddress || !amountCents) {
      return res.status(400).json({ error: 'Missing required fields: toAddress, amountCents' });
    }

    const result = await cryptoWalletService.executeWithdrawal(userId, toAddress, amountCents);

    res.json({ txHash: result.txHash });
  } catch (error) {
    log.error('Error processing crypto withdrawal', { error: String(error) });
    res.status(500).json({ error: 'Failed to process withdrawal' });
  }
});

// ============================================================================
// TRANSACTION HISTORY
// ============================================================================

/**
 * GET /api/payments/transactions
 * Get transaction history
 */
router.get('/transactions', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const pageStr = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

    const page = parseInt(pageStr as string) || 1;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    const result = await walletService.getTransactionHistory(userId, page, limit);

    res.json({
      transactions: result.transactions,
      page,
      limit,
      hasMore: result.transactions.length === limit
    });
  } catch (error) {
    log.error('Error fetching transactions', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch transactions' });
  }
});

// ============================================================================
// STRIPE WEBHOOK
// ============================================================================

/**
 * POST /api/payments/webhook/stripe
 * Stripe webhook handler (no auth - uses Stripe signature verification)
 */
router.post('/webhook/stripe', express.raw({ type: 'application/json' }), async (req: Request, res: Response) => {
  try {
    const signature = req.headers['stripe-signature'] as string;

    if (!signature) {
      return res.status(400).json({ error: 'Missing stripe-signature header' });
    }

    await stripeService.handleWebhook(req.body, signature);

    res.json({ received: true });
  } catch (error) {
    log.error('Error handling Stripe webhook', { error: String(error) });
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================================
// CRYPTO WALLET ENDPOINTS
// ============================================================================

/**
 * POST /api/payments/crypto-wallets
 * Link a crypto wallet
 */
router.post('/crypto-wallets', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const walletAddress = req.body.walletAddress || req.body.wallet_address;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Missing required field: walletAddress' });
    }

    const wallet = await cryptoWalletService.linkWallet(userId, walletAddress);

    res.json({ wallet });
  } catch (error) {
    log.error('Error linking crypto wallet', { error: String(error) });
    res.status(500).json({ error: 'Failed to link crypto wallet' });
  }
});

/**
 * GET /api/payments/crypto-wallets
 * Get linked crypto wallets
 */
router.get('/crypto-wallets', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const wallets = await cryptoWalletService.getLinkedWallets(userId);

    res.json({ wallets });
  } catch (error) {
    log.error('Error fetching crypto wallets', { error: String(error) });
    res.status(500).json({ error: 'Failed to fetch crypto wallets' });
  }
});

// ============================================================================
// EXCHANGE CREDENTIALS
// ============================================================================

/**
 * POST /api/payments/exchange-credentials
 * Store exchange API credentials
 */
router.post('/exchange-credentials', authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.userId!;
    const { exchange, credentials } = req.body;

    if (!exchange || !credentials) {
      return res.status(400).json({ error: 'Missing required fields: exchange, credentials' });
    }

    const { error } = await supabase
      .from('aio_exchange_credentials')
      .upsert({
        user_id: userId,
        exchange,
        encrypted_credentials: credentials,
        updated_at: new Date().toISOString()
      }, { onConflict: 'user_id,exchange' });

    if (error) {
      log.error('Error storing exchange credentials', { error: String(error) });
      return res.status(500).json({ error: 'Failed to store credentials' });
    }

    res.json({ success: true });
  } catch (error) {
    log.error('Error storing exchange credentials', { error: String(error) });
    res.status(500).json({ error: 'Failed to store credentials' });
  }
});

export default router;
