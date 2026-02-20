import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock all external dependencies before importing
// ============================================================================

const mockFrom = vi.fn();
const mockRpc = vi.fn();

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Import AFTER mocks are registered
const { walletService } = await import('./wallet-service.js');

// ============================================================================
// Test data factories
// ============================================================================

const MOCK_USER_ID = 'user-abc-123';
const MOCK_WALLET_ID = 'wallet-xyz-789';

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: MOCK_WALLET_ID,
    user_id: MOCK_USER_ID,
    balance_cents: 5000,
    pending_cents: 1000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-15T00:00:00Z',
    ...overrides,
  };
}

function makeTransaction(overrides: Record<string, unknown> = {}) {
  return {
    id: 'txn-001',
    wallet_id: MOCK_WALLET_ID,
    type: 'deposit',
    amount_cents: 2000,
    provider: 'stripe',
    provider_ref: 'pi_test_123',
    status: 'completed',
    created_at: '2026-01-10T00:00:00Z',
    ...overrides,
  };
}

// ============================================================================
// Helper to build chainable Supabase query mocks
// ============================================================================

function chainable(finalResult: { data: unknown; error: unknown; count?: number | null }) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = vi.fn(handler);
  chain.insert = vi.fn(handler);
  chain.eq = vi.fn(handler);
  chain.order = vi.fn(handler);
  chain.range = vi.fn(handler);
  chain.single = vi.fn(() => Promise.resolve(finalResult));
  // For getTransactionHistory, the final call is .range(), not .single()
  // We override .range to resolve directly when needed
  chain._overrideRange = (result: { data: unknown; error: unknown; count?: number | null }) => {
    (chain.range as ReturnType<typeof vi.fn>).mockImplementation(() => Promise.resolve(result));
  };
  return chain;
}

// ============================================================================
// Tests
// ============================================================================

describe('WalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // getOrCreateWallet
  // --------------------------------------------------------------------------
  describe('getOrCreateWallet()', () => {
    it('returns an existing wallet when found', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await walletService.getOrCreateWallet(MOCK_USER_ID);

      expect(result).toEqual(wallet);
      expect(mockFrom).toHaveBeenCalledWith('aio_wallets');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
      expect(chain.single).toHaveBeenCalled();
    });

    it('creates a new wallet when not found (PGRST116 error code)', async () => {
      const newWallet = makeWallet({ balance_cents: 0, pending_cents: 0 });

      // First call: .from('aio_wallets').select('*').eq(...).single() -> PGRST116
      const fetchChain = chainable({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });

      // Second call: .from('aio_wallets').insert(...).select().single() -> new wallet
      const insertChain = chainable({ data: newWallet, error: null });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return fetchChain;
        return insertChain;
      });

      const result = await walletService.getOrCreateWallet(MOCK_USER_ID);

      expect(result).toEqual(newWallet);
      // First call fetches, second call inserts
      expect(mockFrom).toHaveBeenCalledTimes(2);
      expect(insertChain.insert).toHaveBeenCalledWith({
        user_id: MOCK_USER_ID,
        balance_cents: 0,
        pending_cents: 0,
      });
    });

    it('throws on non-PGRST116 fetch errors', async () => {
      const dbError = { code: '42P01', message: 'relation does not exist' };
      const chain = chainable({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(walletService.getOrCreateWallet(MOCK_USER_ID)).rejects.toEqual(dbError);
    });

    it('throws when insert fails after PGRST116', async () => {
      const insertError = { code: '23505', message: 'duplicate key' };

      const fetchChain = chainable({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      const insertChain = chainable({ data: null, error: insertError });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return fetchChain;
        return insertChain;
      });

      await expect(walletService.getOrCreateWallet(MOCK_USER_ID)).rejects.toEqual(insertError);
    });

    it('uses the provided client for fetching instead of serviceClient', async () => {
      const wallet = makeWallet();
      const customChain = chainable({ data: wallet, error: null });
      const customClient = { from: vi.fn(() => customChain), rpc: vi.fn() };

      const result = await walletService.getOrCreateWallet(
        MOCK_USER_ID,
        customClient as any
      );

      expect(result).toEqual(wallet);
      expect(customClient.from).toHaveBeenCalledWith('aio_wallets');
      // serviceClient.from should NOT have been called for the fetch
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('always uses serviceClient for insert even when custom client is provided', async () => {
      const newWallet = makeWallet({ balance_cents: 0, pending_cents: 0 });

      // Custom client returns PGRST116
      const customFetchChain = chainable({
        data: null,
        error: { code: 'PGRST116', message: 'No rows found' },
      });
      const customClient = { from: vi.fn(() => customFetchChain), rpc: vi.fn() };

      // serviceClient handles the insert
      const insertChain = chainable({ data: newWallet, error: null });
      mockFrom.mockReturnValue(insertChain);

      const result = await walletService.getOrCreateWallet(
        MOCK_USER_ID,
        customClient as any
      );

      expect(result).toEqual(newWallet);
      // The fetch used the custom client
      expect(customClient.from).toHaveBeenCalledWith('aio_wallets');
      // The insert used serviceClient
      expect(mockFrom).toHaveBeenCalledWith('aio_wallets');
    });
  });

  // --------------------------------------------------------------------------
  // getBalance
  // --------------------------------------------------------------------------
  describe('getBalance()', () => {
    it('returns correct balance, pending, and available computation', async () => {
      const wallet = makeWallet({ balance_cents: 10000, pending_cents: 3000 });
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);

      const balance = await walletService.getBalance(MOCK_USER_ID);

      expect(balance).toEqual({
        balance_cents: 10000,
        pending_cents: 3000,
        available_cents: 7000, // 10000 - 3000
      });
    });

    it('returns zero available when pending equals balance', async () => {
      const wallet = makeWallet({ balance_cents: 5000, pending_cents: 5000 });
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);

      const balance = await walletService.getBalance(MOCK_USER_ID);

      expect(balance.available_cents).toBe(0);
    });

    it('returns full balance as available when no pending', async () => {
      const wallet = makeWallet({ balance_cents: 8000, pending_cents: 0 });
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);

      const balance = await walletService.getBalance(MOCK_USER_ID);

      expect(balance.available_cents).toBe(8000);
    });

    it('throws when getOrCreateWallet fails', async () => {
      const dbError = { code: 'FATAL', message: 'connection refused' };
      const chain = chainable({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(walletService.getBalance(MOCK_USER_ID)).rejects.toEqual(dbError);
    });
  });

  // --------------------------------------------------------------------------
  // deposit
  // --------------------------------------------------------------------------
  describe('deposit()', () => {
    it('calls credit_wallet RPC with correct parameters', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);
      mockRpc.mockResolvedValue({ data: null, error: null });

      await walletService.deposit(MOCK_USER_ID, 5000, 'stripe', 'pi_abc', 'idem-001');

      expect(mockRpc).toHaveBeenCalledWith('credit_wallet', {
        p_wallet_id: MOCK_WALLET_ID,
        p_amount_cents: 5000,
        p_provider: 'stripe',
        p_provider_ref: 'pi_abc',
        p_idempotency_key: 'idem-001',
      });
    });

    it('succeeds without throwing on success', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);
      mockRpc.mockResolvedValue({ data: null, error: null });

      await expect(
        walletService.deposit(MOCK_USER_ID, 2000, 'stripe', 'pi_def', 'idem-002')
      ).resolves.toBeUndefined();
    });

    it('throws when RPC returns an error', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);

      const rpcError = { code: 'P0001', message: 'idempotency violation' };
      mockRpc.mockResolvedValue({ data: null, error: rpcError });

      await expect(
        walletService.deposit(MOCK_USER_ID, 5000, 'stripe', 'pi_dup', 'idem-dup')
      ).rejects.toEqual(rpcError);
    });

    it('throws when wallet lookup fails', async () => {
      const dbError = { code: '42P01', message: 'relation does not exist' };
      const chain = chainable({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(
        walletService.deposit(MOCK_USER_ID, 1000, 'stripe', 'pi_fail', 'idem-fail')
      ).rejects.toEqual(dbError);
      // RPC should never be called if wallet lookup fails
      expect(mockRpc).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // withdraw
  // --------------------------------------------------------------------------
  describe('withdraw()', () => {
    it('calls debit_wallet_for_withdrawal RPC with correct parameters', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);
      mockRpc.mockResolvedValue({ data: null, error: null });

      await walletService.withdraw(MOCK_USER_ID, 3000, 'stripe', 'po_abc', 'idem-w01');

      expect(mockRpc).toHaveBeenCalledWith('debit_wallet_for_withdrawal', {
        p_wallet_id: MOCK_WALLET_ID,
        p_amount_cents: 3000,
        p_provider: 'stripe',
        p_provider_ref: 'po_abc',
        p_idempotency_key: 'idem-w01',
      });
    });

    it('throws when RPC returns an error (insufficient funds)', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);

      const rpcError = { code: 'P0001', message: 'insufficient available balance' };
      mockRpc.mockResolvedValue({ data: null, error: rpcError });

      await expect(
        walletService.withdraw(MOCK_USER_ID, 99999, 'stripe', 'po_fail', 'idem-w02')
      ).rejects.toEqual(rpcError);
    });

    it('succeeds without throwing on success', async () => {
      const wallet = makeWallet();
      const chain = chainable({ data: wallet, error: null });
      mockFrom.mockReturnValue(chain);
      mockRpc.mockResolvedValue({ data: null, error: null });

      await expect(
        walletService.withdraw(MOCK_USER_ID, 1000, 'stripe', 'po_ok', 'idem-w03')
      ).resolves.toBeUndefined();
    });
  });

  // --------------------------------------------------------------------------
  // lockForBet
  // --------------------------------------------------------------------------
  describe('lockForBet()', () => {
    it('calls lock_funds_for_bet RPC with correct parameters', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await walletService.lockForBet(MOCK_WALLET_ID, 2500);

      expect(mockRpc).toHaveBeenCalledWith('lock_funds_for_bet', {
        p_wallet_id: MOCK_WALLET_ID,
        p_amount_cents: 2500,
      });
    });

    it('succeeds without throwing on success', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await expect(
        walletService.lockForBet(MOCK_WALLET_ID, 500)
      ).resolves.toBeUndefined();
    });

    it('throws when RPC returns an error', async () => {
      const rpcError = { code: 'P0001', message: 'insufficient available balance for lock' };
      mockRpc.mockResolvedValue({ data: null, error: rpcError });

      await expect(
        walletService.lockForBet(MOCK_WALLET_ID, 99999)
      ).rejects.toEqual(rpcError);
    });
  });

  // --------------------------------------------------------------------------
  // unlockForBet
  // --------------------------------------------------------------------------
  describe('unlockForBet()', () => {
    it('calls unlock_funds_for_bet RPC with correct parameters', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await walletService.unlockForBet(MOCK_WALLET_ID, 2500);

      expect(mockRpc).toHaveBeenCalledWith('unlock_funds_for_bet', {
        p_wallet_id: MOCK_WALLET_ID,
        p_amount_cents: 2500,
      });
    });

    it('succeeds without throwing on success', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await expect(
        walletService.unlockForBet(MOCK_WALLET_ID, 1000)
      ).resolves.toBeUndefined();
    });

    it('throws when RPC returns an error', async () => {
      const rpcError = { code: 'P0001', message: 'unlock amount exceeds pending' };
      mockRpc.mockResolvedValue({ data: null, error: rpcError });

      await expect(
        walletService.unlockForBet(MOCK_WALLET_ID, 50000)
      ).rejects.toEqual(rpcError);
    });
  });

  // --------------------------------------------------------------------------
  // settleBet
  // --------------------------------------------------------------------------
  describe('settleBet()', () => {
    it('calls settle_real_bet RPC with correct parameters', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await walletService.settleBet('bet-001', 7500);

      expect(mockRpc).toHaveBeenCalledWith('settle_real_bet', {
        p_bet_id: 'bet-001',
        p_payout_cents: 7500,
      });
    });

    it('succeeds without throwing on success', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await expect(
        walletService.settleBet('bet-002', 0)
      ).resolves.toBeUndefined();
    });

    it('throws when RPC returns an error', async () => {
      const rpcError = { code: 'P0001', message: 'bet already settled' };
      mockRpc.mockResolvedValue({ data: null, error: rpcError });

      await expect(
        walletService.settleBet('bet-003', 5000)
      ).rejects.toEqual(rpcError);
    });

    it('handles zero payout (losing bet)', async () => {
      mockRpc.mockResolvedValue({ data: null, error: null });

      await walletService.settleBet('bet-loss', 0);

      expect(mockRpc).toHaveBeenCalledWith('settle_real_bet', {
        p_bet_id: 'bet-loss',
        p_payout_cents: 0,
      });
    });
  });

  // --------------------------------------------------------------------------
  // getTransactionHistory
  // --------------------------------------------------------------------------
  describe('getTransactionHistory()', () => {
    it('returns transactions with pagination', async () => {
      const wallet = makeWallet();
      const transactions = [
        makeTransaction({ id: 'txn-001' }),
        makeTransaction({ id: 'txn-002', amount_cents: 3000 }),
      ];

      // First call: getOrCreateWallet fetch
      const walletChain = chainable({ data: wallet, error: null });

      // Second call: transaction query
      const txnChain = chainable({ data: null, error: null });
      // Override range to resolve with transaction data
      (txnChain as any)._overrideRange({
        data: transactions,
        error: null,
        count: 15,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletChain;
        return txnChain;
      });

      const result = await walletService.getTransactionHistory(MOCK_USER_ID, 1, 20);

      expect(result.transactions).toEqual(transactions);
      expect(result.total).toBe(15);
    });

    it('computes correct offset for page 2', async () => {
      const wallet = makeWallet();
      const walletChain = chainable({ data: wallet, error: null });

      const txnChain = chainable({ data: null, error: null });
      (txnChain as any)._overrideRange({
        data: [],
        error: null,
        count: 0,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletChain;
        return txnChain;
      });

      await walletService.getTransactionHistory(MOCK_USER_ID, 2, 10);

      // page 2, limit 10 => offset = (2-1)*10 = 10, range(10, 19)
      expect(txnChain.range).toHaveBeenCalledWith(10, 19);
    });

    it('computes correct offset for page 1 with default limit', async () => {
      const wallet = makeWallet();
      const walletChain = chainable({ data: wallet, error: null });

      const txnChain = chainable({ data: null, error: null });
      (txnChain as any)._overrideRange({
        data: [],
        error: null,
        count: 0,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletChain;
        return txnChain;
      });

      await walletService.getTransactionHistory(MOCK_USER_ID);

      // page 1, limit 20 (defaults) => offset = 0, range(0, 19)
      expect(txnChain.range).toHaveBeenCalledWith(0, 19);
    });

    it('returns empty array and zero total when no transactions exist', async () => {
      const wallet = makeWallet();
      const walletChain = chainable({ data: wallet, error: null });

      const txnChain = chainable({ data: null, error: null });
      (txnChain as any)._overrideRange({
        data: null,
        error: null,
        count: null,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletChain;
        return txnChain;
      });

      const result = await walletService.getTransactionHistory(MOCK_USER_ID);

      expect(result.transactions).toEqual([]);
      expect(result.total).toBe(0);
    });

    it('throws when transaction query fails', async () => {
      const wallet = makeWallet();
      const walletChain = chainable({ data: wallet, error: null });

      const txnChain = chainable({ data: null, error: null });
      const queryError = { code: '42P01', message: 'relation does not exist' };
      (txnChain as any)._overrideRange({
        data: null,
        error: queryError,
        count: null,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletChain;
        return txnChain;
      });

      await expect(
        walletService.getTransactionHistory(MOCK_USER_ID)
      ).rejects.toEqual(queryError);
    });

    it('uses user-scoped client when provided', async () => {
      const wallet = makeWallet();
      const walletChain = chainable({ data: wallet, error: null });

      const txnChain = chainable({ data: null, error: null });
      (txnChain as any)._overrideRange({
        data: [],
        error: null,
        count: 0,
      });

      const customClient = {
        from: vi.fn().mockImplementation(() => {
          const count = customClient.from.mock.calls.length;
          if (count === 1) return walletChain;
          return txnChain;
        }),
        rpc: vi.fn(),
      };

      await walletService.getTransactionHistory(MOCK_USER_ID, 1, 20, customClient as any);

      // Both the wallet fetch and transaction query should use the custom client
      expect(customClient.from).toHaveBeenCalledWith('aio_wallets');
      expect(customClient.from).toHaveBeenCalledWith('aio_transactions');
      // serviceClient.from should NOT have been called
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('queries aio_transactions with correct select and ordering', async () => {
      const wallet = makeWallet();
      const walletChain = chainable({ data: wallet, error: null });

      const txnChain = chainable({ data: null, error: null });
      (txnChain as any)._overrideRange({
        data: [],
        error: null,
        count: 0,
      });

      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 1) return walletChain;
        return txnChain;
      });

      await walletService.getTransactionHistory(MOCK_USER_ID);

      // Verify the second from() call is for 'aio_transactions'
      expect(mockFrom).toHaveBeenCalledWith('aio_transactions');
      expect(txnChain.select).toHaveBeenCalledWith('*', { count: 'exact' });
      expect(txnChain.eq).toHaveBeenCalledWith('wallet_id', MOCK_WALLET_ID);
      expect(txnChain.order).toHaveBeenCalledWith('created_at', { ascending: false });
    });
  });
});
