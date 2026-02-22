/**
 * Tests for wallet-service.ts
 *
 * Covers: getOrCreateWallet, getBalance, deposit, withdraw,
 * lockForBet, unlockForBet, settleBet, getTransactionHistory.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const { mockFrom, mockRpc } = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockRpc: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom, rpc: mockRpc },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { walletService } from './wallet-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Chainable Supabase query mock.
 * All builder methods return the same object; the object is thenable.
 * .single() resolves directly to `result` (mirrors Supabase behaviour).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown; count?: number | null } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'order', 'range']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (
    resolve: (v: unknown) => unknown,
    _reject: (e: unknown) => unknown
  ) => Promise.resolve(result).then(resolve, _reject);
  return q;
}

const makeWallet = (overrides: Record<string, unknown> = {}) => ({
  id: 'wallet-1',
  user_id: 'user-1',
  balance_cents: 10000,
  pending_cents: 2000,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

/** Sets up mockFrom to return a chain that resolves to an existing wallet. */
function setupExistingWallet(overrides: Record<string, unknown> = {}) {
  const wallet = makeWallet(overrides);
  mockFrom.mockReturnValue(chain({ data: wallet, error: null }));
  return wallet;
}

// ---------------------------------------------------------------------------
// Tests: getOrCreateWallet
// ---------------------------------------------------------------------------

describe('getOrCreateWallet', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns existing wallet without creating a new one', async () => {
    const wallet = makeWallet();
    const walletChain = chain({ data: wallet, error: null });
    mockFrom.mockReturnValue(walletChain);

    const result = await walletService.getOrCreateWallet('user-1');

    expect(result).toEqual(wallet);
    expect(walletChain.single).toHaveBeenCalled();
    // insert should not be called
    expect(walletChain.insert).not.toHaveBeenCalled();
  });

  it('creates and returns a new wallet when none exists (PGRST116)', async () => {
    const newWallet = makeWallet({ balance_cents: 0, pending_cents: 0 });
    const fetchChain = chain({ data: null, error: { code: 'PGRST116' } });
    const insertChain = chain({ data: newWallet, error: null });
    mockFrom
      .mockReturnValueOnce(fetchChain)  // first call: select
      .mockReturnValueOnce(insertChain); // second call: insert

    const result = await walletService.getOrCreateWallet('user-1');

    expect(result).toEqual(newWallet);
    expect(insertChain.insert).toHaveBeenCalledWith(
      expect.objectContaining({ user_id: 'user-1', balance_cents: 0, pending_cents: 0 })
    );
  });

  it('throws when fetch fails with a non-404 error', async () => {
    const dbError = { code: 'CONNECTION_ERROR', message: 'DB unreachable' };
    mockFrom.mockReturnValue(chain({ data: null, error: dbError }));

    await expect(walletService.getOrCreateWallet('user-1')).rejects.toMatchObject({
      code: 'CONNECTION_ERROR',
    });
  });

  it('throws when the insert fails', async () => {
    const fetchChain = chain({ data: null, error: { code: 'PGRST116' } });
    const insertChain = chain({ data: null, error: { message: 'unique violation' } });
    mockFrom
      .mockReturnValueOnce(fetchChain)
      .mockReturnValueOnce(insertChain);

    await expect(walletService.getOrCreateWallet('user-1')).rejects.toMatchObject({
      message: 'unique violation',
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: getBalance
// ---------------------------------------------------------------------------

describe('getBalance', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns balance, pending, and available_cents', async () => {
    setupExistingWallet({ balance_cents: 10000, pending_cents: 3000 });

    const balance = await walletService.getBalance('user-1');

    expect(balance.balance_cents).toBe(10000);
    expect(balance.pending_cents).toBe(3000);
    expect(balance.available_cents).toBe(7000); // 10000 - 3000
  });

  it('returns zero available when all balance is pending', async () => {
    setupExistingWallet({ balance_cents: 5000, pending_cents: 5000 });

    const balance = await walletService.getBalance('user-1');

    expect(balance.available_cents).toBe(0);
  });

  it('throws when wallet cannot be fetched', async () => {
    mockFrom.mockReturnValue(chain({ data: null, error: { code: 'DB_ERR' } }));

    await expect(walletService.getBalance('user-1')).rejects.toMatchObject({ code: 'DB_ERR' });
  });
});

// ---------------------------------------------------------------------------
// Tests: deposit
// ---------------------------------------------------------------------------

describe('deposit', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls credit_wallet RPC with correct arguments', async () => {
    setupExistingWallet();
    mockRpc.mockResolvedValue({ error: null });

    await walletService.deposit('user-1', 5000, 'stripe', 'pi_abc123', 'idem-key-1');

    expect(mockRpc).toHaveBeenCalledWith('credit_wallet', {
      p_wallet_id: 'wallet-1',
      p_amount_cents: 5000,
      p_provider: 'stripe',
      p_provider_ref: 'pi_abc123',
      p_idempotency_key: 'idem-key-1',
    });
  });

  it('throws when the RPC returns an error', async () => {
    setupExistingWallet();
    mockRpc.mockResolvedValue({ error: { message: 'RPC failed' } });

    await expect(
      walletService.deposit('user-1', 1000, 'stripe', 'pi_x', 'key')
    ).rejects.toMatchObject({ message: 'RPC failed' });
  });
});

// ---------------------------------------------------------------------------
// Tests: withdraw
// ---------------------------------------------------------------------------

describe('withdraw', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls debit_wallet_for_withdrawal RPC with correct arguments', async () => {
    setupExistingWallet();
    mockRpc.mockResolvedValue({ error: null });

    await walletService.withdraw('user-1', 2000, 'stripe', 'po_xyz', 'idem-key-2');

    expect(mockRpc).toHaveBeenCalledWith('debit_wallet_for_withdrawal', {
      p_wallet_id: 'wallet-1',
      p_amount_cents: 2000,
      p_provider: 'stripe',
      p_provider_ref: 'po_xyz',
      p_idempotency_key: 'idem-key-2',
    });
  });

  it('throws when the RPC returns an error', async () => {
    setupExistingWallet();
    mockRpc.mockResolvedValue({ error: { message: 'insufficient funds' } });

    await expect(
      walletService.withdraw('user-1', 99999, 'stripe', 'po_x', 'key')
    ).rejects.toMatchObject({ message: 'insufficient funds' });
  });
});

// ---------------------------------------------------------------------------
// Tests: lockForBet
// ---------------------------------------------------------------------------

describe('lockForBet', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls lock_funds_for_bet RPC with wallet ID and amount', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await walletService.lockForBet('wallet-1', 500);

    expect(mockRpc).toHaveBeenCalledWith('lock_funds_for_bet', {
      p_wallet_id: 'wallet-1',
      p_amount_cents: 500,
    });
  });

  it('throws when locking fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'balance too low' } });

    await expect(walletService.lockForBet('wallet-1', 500)).rejects.toMatchObject({
      message: 'balance too low',
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: unlockForBet
// ---------------------------------------------------------------------------

describe('unlockForBet', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls unlock_funds_for_bet RPC with wallet ID and amount', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await walletService.unlockForBet('wallet-1', 300);

    expect(mockRpc).toHaveBeenCalledWith('unlock_funds_for_bet', {
      p_wallet_id: 'wallet-1',
      p_amount_cents: 300,
    });
  });

  it('throws when unlocking fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'wallet not found' } });

    await expect(walletService.unlockForBet('wallet-1', 300)).rejects.toMatchObject({
      message: 'wallet not found',
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: settleBet
// ---------------------------------------------------------------------------

describe('settleBet', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('calls settle_real_bet RPC with bet ID and payout', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await walletService.settleBet('bet-abc', 2000);

    expect(mockRpc).toHaveBeenCalledWith('settle_real_bet', {
      p_bet_id: 'bet-abc',
      p_payout_cents: 2000,
    });
  });

  it('settles with 0 payout for a losing bet', async () => {
    mockRpc.mockResolvedValue({ error: null });

    await walletService.settleBet('bet-abc', 0);

    expect(mockRpc).toHaveBeenCalledWith('settle_real_bet', {
      p_bet_id: 'bet-abc',
      p_payout_cents: 0,
    });
  });

  it('throws when settlement RPC fails', async () => {
    mockRpc.mockResolvedValue({ error: { message: 'bet already settled' } });

    await expect(walletService.settleBet('bet-abc', 1000)).rejects.toMatchObject({
      message: 'bet already settled',
    });
  });
});

// ---------------------------------------------------------------------------
// Tests: getTransactionHistory
// ---------------------------------------------------------------------------

describe('getTransactionHistory', () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it('returns transactions and total count for page 1', async () => {
    const txns = [
      { id: 'tx1', wallet_id: 'wallet-1', type: 'deposit', amount_cents: 5000 },
      { id: 'tx2', wallet_id: 'wallet-1', type: 'bet_lock', amount_cents: 500 },
    ];
    const walletChain = chain({ data: makeWallet(), error: null });
    const txnChain = chain({ data: txns, error: null, count: 42 });
    mockFrom
      .mockReturnValueOnce(walletChain)  // getOrCreateWallet
      .mockReturnValueOnce(txnChain);    // aio_transactions

    const result = await walletService.getTransactionHistory('user-1');

    expect(result.transactions).toEqual(txns);
    expect(result.total).toBe(42);
  });

  it('applies correct offset for page 2 with limit 10', async () => {
    const walletChain = chain({ data: makeWallet(), error: null });
    const txnChain = chain({ data: [], error: null, count: 0 });
    mockFrom
      .mockReturnValueOnce(walletChain)
      .mockReturnValueOnce(txnChain);

    await walletService.getTransactionHistory('user-1', 2, 10);

    // page 2, limit 10 → offset = 10, range(10, 19)
    expect(txnChain.range).toHaveBeenCalledWith(10, 19);
  });

  it('defaults to page 1 and limit 20', async () => {
    const walletChain = chain({ data: makeWallet(), error: null });
    const txnChain = chain({ data: [], error: null, count: 0 });
    mockFrom
      .mockReturnValueOnce(walletChain)
      .mockReturnValueOnce(txnChain);

    await walletService.getTransactionHistory('user-1');

    expect(txnChain.range).toHaveBeenCalledWith(0, 19);
  });

  it('returns empty array and zero total when no transactions exist', async () => {
    const walletChain = chain({ data: makeWallet(), error: null });
    const txnChain = chain({ data: null, error: null, count: null });
    mockFrom
      .mockReturnValueOnce(walletChain)
      .mockReturnValueOnce(txnChain);

    const result = await walletService.getTransactionHistory('user-1');

    expect(result.transactions).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('throws when the transaction query fails', async () => {
    const walletChain = chain({ data: makeWallet(), error: null });
    const txnChain = chain({ data: null, error: { message: 'query error' }, count: null });
    mockFrom
      .mockReturnValueOnce(walletChain)
      .mockReturnValueOnce(txnChain);

    await expect(walletService.getTransactionHistory('user-1')).rejects.toMatchObject({
      message: 'query error',
    });
  });
});
