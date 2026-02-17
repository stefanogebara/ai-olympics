/**
 * Payments API Routes
 * Endpoints for wallet management, deposits, withdrawals, and crypto wallets
 */

import { Router, Request, Response } from 'express';
import express from 'express';
import { requireAuth as authMiddleware, type AuthenticatedRequest } from '../middleware/auth.js';
import { walletService } from '../../services/wallet-service.js';
import { stripeService } from '../../services/stripe-service.js';
import { cryptoWalletService } from '../../services/crypto-wallet-service.js';
import { createLogger } from '../../shared/utils/logger.js';
import { encrypt } from '../../shared/utils/crypto.js';
import { validateBody } from '../middleware/validate.js';
import { stripeDepositSchema, cryptoWithdrawSchema, cryptoWalletSchema, exchangeCredentialsSchema } from '../schemas.js';

const router = Router();
const log = createLogger('PaymentsAPI');

// Feature flag: real-money features disabled until legal review + security hardening
const REAL_MONEY_ENABLED = process.env.ENABLE_REAL_MONEY_TRADING === 'true';

function requireRealMoneyEnabled(_req: Request, res: Response, next: Function) {
  if (!REAL_MONEY_ENABLED) {
    return res.status(503).json({
      error: 'Real-money features are currently disabled',
      message: 'Deposits and withdrawals are disabled during the beta period.',
    });
  }
  next();
}

// ============================================================================
// WALLET ENDPOINTS
// ============================================================================

/**
 * GET /api/payments/wallet
 * Get wallet balance
 */
router.get('/wallet', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const wallet = await walletService.getBalance(user.id, userClient);

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
router.post('/wallet', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const wallet = await walletService.getOrCreateWallet(user.id, userClient);

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
router.post('/deposit/stripe', requireRealMoneyEnabled, authMiddleware, validateBody(stripeDepositSchema), async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const amountCents = req.body.amountCents || req.body.amount_cents;
    const email = req.body.email;

    if (!amountCents || !email) {
      return res.status(400).json({ error: 'Missing required fields: amountCents, email' });
    }

    const session = await stripeService.createCheckoutSession(user.id, email, amountCents);

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
router.post('/deposit/crypto', requireRealMoneyEnabled, authMiddleware, async (req: Request, res: Response) => {
  try {
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
router.post('/withdraw/stripe', requireRealMoneyEnabled, authMiddleware, async (req: Request, res: Response) => {
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
router.post('/withdraw/crypto', requireRealMoneyEnabled, authMiddleware, validateBody(cryptoWithdrawSchema), async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const toAddress = req.body.toAddress || req.body.to_address;
    const amountCents = req.body.amountCents || req.body.amount_cents;

    if (!toAddress || !amountCents) {
      return res.status(400).json({ error: 'Missing required fields: toAddress, amountCents' });
    }

    const result = await cryptoWalletService.executeWithdrawal(user.id, toAddress, amountCents);

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
router.get('/transactions', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user, userClient } = req as AuthenticatedRequest;
    const pageStr = Array.isArray(req.query.page) ? req.query.page[0] : req.query.page;
    const limitStr = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;

    const page = parseInt(pageStr as string) || 1;
    const limit = Math.min(parseInt(limitStr as string) || 50, 100);

    const result = await walletService.getTransactionHistory(user.id, page, limit, userClient);

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
router.post('/webhook/stripe', async (req: Request, res: Response) => {
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
router.post('/crypto-wallets', authMiddleware, validateBody(cryptoWalletSchema), async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const walletAddress = req.body.walletAddress || req.body.wallet_address;

    if (!walletAddress) {
      return res.status(400).json({ error: 'Missing required field: walletAddress' });
    }

    const wallet = await cryptoWalletService.linkWallet(user.id, walletAddress);

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
router.get('/crypto-wallets', authMiddleware, async (req: Request, res: Response) => {
  try {
    const { user } = req as AuthenticatedRequest;
    const wallets = await cryptoWalletService.getLinkedWallets(user.id);

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
router.post('/exchange-credentials', authMiddleware, validateBody(exchangeCredentialsSchema), async (req: Request, res: Response) => {
  try {
    const { user, userClient: userDb } = req as AuthenticatedRequest;
    const { exchange, credentials } = req.body;

    if (!exchange || !credentials) {
      return res.status(400).json({ error: 'Missing required fields: exchange, credentials' });
    }

    // Use user-scoped client for credential storage (respects RLS)
    const { error } = await userDb
      .from('aio_exchange_credentials')
      .upsert({
        user_id: user.id,
        exchange,
        encrypted_credentials: encrypt(JSON.stringify(credentials)),
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
