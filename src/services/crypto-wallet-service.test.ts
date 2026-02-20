import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock all external dependencies before importing
// ============================================================================

const mockTransfer = vi.fn();
const mockBalanceOf = vi.fn();
const mockWait = vi.fn();
mockTransfer.mockResolvedValue({ wait: mockWait });
mockWait.mockResolvedValue({ hash: '0xabc123' });

const mockVerifyMessage = vi.fn();

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: vi.fn().mockImplementation(() => ({})),
    Wallet: vi.fn().mockImplementation(() => ({ address: '0xplatform' })),
    Contract: vi.fn().mockImplementation(() => ({
      transfer: mockTransfer,
      balanceOf: mockBalanceOf,
    })),
    verifyMessage: (...args: unknown[]) => mockVerifyMessage(...args),
  },
}));

const mockConfig = {
  polygonRpcUrl: 'https://polygon-rpc.com',
  platformWalletAddress: '0xPlatformAddress',
  platformWalletPrivateKey: '0xprivatekey',
};

vi.mock('../shared/config.js', () => ({
  config: mockConfig,
}));

const mockFrom = vi.fn();
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: {
    from: (...args: unknown[]) => mockFrom(...args),
  },
}));

const mockWithdraw = vi.fn();
vi.mock('./wallet-service.js', () => ({
  walletService: {
    withdraw: (...args: unknown[]) => mockWithdraw(...args),
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
const { cryptoWalletService } = await import('./crypto-wallet-service.js');

// ============================================================================
// Helpers
// ============================================================================

function chainable(finalResult: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  const handler = () => chain;
  chain.select = vi.fn(handler);
  chain.insert = vi.fn(handler);
  chain.update = vi.fn(handler);
  chain.eq = vi.fn(handler);
  chain.order = vi.fn(handler);
  chain.single = vi.fn(() => Promise.resolve(finalResult));
  // Make the chain itself thenable for calls that don't end with .single()
  chain.then = (resolve: (v: unknown) => unknown) => resolve(finalResult);
  return chain;
}

const MOCK_USER_ID = 'user-abc-123';
const MOCK_WALLET_ADDRESS = '0xUserWallet123';

// ============================================================================
// Tests
// ============================================================================

describe('CryptoWalletService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset config to defaults
    mockConfig.platformWalletAddress = '0xPlatformAddress';
    mockConfig.platformWalletPrivateKey = '0xprivatekey';
    // Reset default mock behaviors
    mockTransfer.mockResolvedValue({ wait: mockWait });
    mockWait.mockResolvedValue({ hash: '0xabc123' });
  });

  // --------------------------------------------------------------------------
  // getDepositAddress
  // --------------------------------------------------------------------------
  describe('getDepositAddress()', () => {
    it('returns the platform wallet address', async () => {
      const result = await cryptoWalletService.getDepositAddress();
      expect(result).toBe('0xPlatformAddress');
    });

    it('throws if platform wallet address is not configured', async () => {
      mockConfig.platformWalletAddress = '';
      await expect(cryptoWalletService.getDepositAddress()).rejects.toThrow(
        'Platform wallet address not configured'
      );
    });
  });

  // --------------------------------------------------------------------------
  // linkWallet
  // --------------------------------------------------------------------------
  describe('linkWallet()', () => {
    it('inserts a wallet with lowercased address', async () => {
      const linkedWallet = {
        id: 'cw-1',
        user_id: MOCK_USER_ID,
        wallet_address: '0xuserwallet123',
        is_verified: false,
        created_at: '2026-01-01T00:00:00Z',
      };
      const chain = chainable({ data: linkedWallet, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.linkWallet(MOCK_USER_ID, '0xUserWallet123');

      expect(result).toEqual(linkedWallet);
      expect(mockFrom).toHaveBeenCalledWith('aio_crypto_wallets');
      expect(chain.insert).toHaveBeenCalledWith({
        user_id: MOCK_USER_ID,
        wallet_address: '0xuserwallet123',
        is_verified: false,
      });
    });

    it('returns the linked wallet data on success', async () => {
      const walletData = {
        id: 'cw-2',
        user_id: MOCK_USER_ID,
        wallet_address: '0xanother',
        is_verified: false,
        created_at: '2026-02-01T00:00:00Z',
      };
      const chain = chainable({ data: walletData, error: null });
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.linkWallet(MOCK_USER_ID, '0xAnother');

      expect(result.id).toBe('cw-2');
      expect(result.is_verified).toBe(false);
    });

    it('throws on database error', async () => {
      const dbError = { code: '23505', message: 'duplicate key' };
      const chain = chainable({ data: null, error: dbError });
      mockFrom.mockReturnValue(chain);

      await expect(
        cryptoWalletService.linkWallet(MOCK_USER_ID, MOCK_WALLET_ADDRESS)
      ).rejects.toEqual(dbError);
    });

    it('lowercases the wallet address before inserting', async () => {
      const chain = chainable({ data: { id: 'cw-3' }, error: null });
      mockFrom.mockReturnValue(chain);

      await cryptoWalletService.linkWallet(MOCK_USER_ID, '0xABCDEF');

      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ wallet_address: '0xabcdef' })
      );
    });
  });

  // --------------------------------------------------------------------------
  // getLinkedWallets
  // --------------------------------------------------------------------------
  describe('getLinkedWallets()', () => {
    it('returns an array of wallets', async () => {
      const wallets = [
        { id: 'cw-1', user_id: MOCK_USER_ID, wallet_address: '0xaaa', is_verified: true, created_at: '2026-01-01' },
        { id: 'cw-2', user_id: MOCK_USER_ID, wallet_address: '0xbbb', is_verified: false, created_at: '2026-01-02' },
      ];
      const chain = chainable({ data: wallets, error: null });
      // Override: getLinkedWallets ends at .order(), not .single()
      chain.order = vi.fn(() => Promise.resolve({ data: wallets, error: null }));
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.getLinkedWallets(MOCK_USER_ID);

      expect(result).toEqual(wallets);
      expect(result).toHaveLength(2);
      expect(mockFrom).toHaveBeenCalledWith('aio_crypto_wallets');
      expect(chain.select).toHaveBeenCalledWith('*');
      expect(chain.eq).toHaveBeenCalledWith('user_id', MOCK_USER_ID);
    });

    it('returns empty array when no wallets found', async () => {
      const chain = chainable({ data: null, error: null });
      chain.order = vi.fn(() => Promise.resolve({ data: null, error: null }));
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.getLinkedWallets(MOCK_USER_ID);

      expect(result).toEqual([]);
    });

    it('returns empty array when data is empty array', async () => {
      const chain = chainable({ data: [], error: null });
      chain.order = vi.fn(() => Promise.resolve({ data: [], error: null }));
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.getLinkedWallets(MOCK_USER_ID);

      expect(result).toEqual([]);
    });

    it('throws on database error', async () => {
      const dbError = { code: 'FATAL', message: 'connection refused' };
      const chain = chainable({ data: null, error: dbError });
      chain.order = vi.fn(() => Promise.resolve({ data: null, error: dbError }));
      mockFrom.mockReturnValue(chain);

      await expect(
        cryptoWalletService.getLinkedWallets(MOCK_USER_ID)
      ).rejects.toEqual(dbError);
    });
  });

  // --------------------------------------------------------------------------
  // verifyWalletOwnership
  // --------------------------------------------------------------------------
  describe('verifyWalletOwnership()', () => {
    const MESSAGE = 'Verify wallet ownership';
    const SIGNATURE = '0xsignature';

    it('returns true when signature matches and updates DB', async () => {
      mockVerifyMessage.mockReturnValue('0xUserWallet123');
      // The source code chain is: .from().update().eq('user_id',...).eq('wallet_address',...)
      // The second .eq() must be the terminal call that resolves to { error }
      const chain = chainable({ data: null, error: null });
      let eqCount = 0;
      chain.eq = vi.fn(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ data: null, error: null });
        return chain;
      });
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.verifyWalletOwnership(
        MOCK_USER_ID,
        '0xUserWallet123',
        SIGNATURE,
        MESSAGE
      );

      expect(result).toBe(true);
      expect(mockVerifyMessage).toHaveBeenCalledWith(MESSAGE, SIGNATURE);
      expect(mockFrom).toHaveBeenCalledWith('aio_crypto_wallets');
      expect(chain.update).toHaveBeenCalledWith({ is_verified: true });
    });

    it('returns false when signature does not match', async () => {
      mockVerifyMessage.mockReturnValue('0xDifferentAddress');

      const result = await cryptoWalletService.verifyWalletOwnership(
        MOCK_USER_ID,
        MOCK_WALLET_ADDRESS,
        SIGNATURE,
        MESSAGE
      );

      expect(result).toBe(false);
      // Should NOT update DB
      expect(mockFrom).not.toHaveBeenCalled();
    });

    it('performs case-insensitive address comparison', async () => {
      mockVerifyMessage.mockReturnValue('0xUSERWALLET123');
      const chain = chainable({ data: null, error: null });
      let eqCount = 0;
      chain.eq = vi.fn(() => {
        eqCount++;
        if (eqCount >= 2) return Promise.resolve({ data: null, error: null });
        return chain;
      });
      mockFrom.mockReturnValue(chain);

      const result = await cryptoWalletService.verifyWalletOwnership(
        MOCK_USER_ID,
        '0xuserwallet123',
        SIGNATURE,
        MESSAGE
      );

      expect(result).toBe(true);
    });

    it('throws when DB update fails', async () => {
      mockVerifyMessage.mockReturnValue('0xUserWallet123');
      const dbError = { code: 'P0001', message: 'update failed' };
      const chain = chainable({ data: null, error: dbError });
      // The chain goes .update().eq().eq() -- last .eq() returns result
      let eqCallCount = 0;
      chain.eq = vi.fn(() => {
        eqCallCount++;
        if (eqCallCount >= 2) {
          return Promise.resolve({ data: null, error: dbError });
        }
        return chain;
      });
      mockFrom.mockReturnValue(chain);

      await expect(
        cryptoWalletService.verifyWalletOwnership(
          MOCK_USER_ID,
          '0xUserWallet123',
          SIGNATURE,
          MESSAGE
        )
      ).rejects.toEqual(dbError);
    });
  });

  // --------------------------------------------------------------------------
  // executeWithdrawal
  // --------------------------------------------------------------------------
  describe('executeWithdrawal()', () => {
    it('transfers USDC and calls walletService.withdraw', async () => {
      mockWithdraw.mockResolvedValue(undefined);

      const result = await cryptoWalletService.executeWithdrawal(
        MOCK_USER_ID,
        '0xRecipient',
        5000
      );

      expect(result).toEqual({ txHash: '0xabc123' });
      expect(mockTransfer).toHaveBeenCalledWith('0xRecipient', BigInt(5000) * BigInt(10_000));
      expect(mockWait).toHaveBeenCalled();
      expect(mockWithdraw).toHaveBeenCalledWith(
        MOCK_USER_ID,
        5000,
        'polygon_usdc',
        '0xabc123',
        'crypto_withdrawal_0xabc123'
      );
    });

    it('returns the txHash from the receipt', async () => {
      mockWait.mockResolvedValue({ hash: '0xdef456' });
      mockWithdraw.mockResolvedValue(undefined);

      const result = await cryptoWalletService.executeWithdrawal(
        MOCK_USER_ID,
        '0xRecipient',
        1000
      );

      expect(result.txHash).toBe('0xdef456');
    });

    it('converts cents to USDC 6-decimal units correctly', async () => {
      mockWithdraw.mockResolvedValue(undefined);

      await cryptoWalletService.executeWithdrawal(MOCK_USER_ID, '0xRecipient', 100);

      // 100 cents * 10000 = 1_000_000 (= 1 USDC in 6-decimal format)
      expect(mockTransfer).toHaveBeenCalledWith('0xRecipient', BigInt(1_000_000));
    });

    it('throws when transfer fails', async () => {
      mockTransfer.mockRejectedValue(new Error('Transfer failed'));

      await expect(
        cryptoWalletService.executeWithdrawal(MOCK_USER_ID, '0xRecipient', 5000)
      ).rejects.toThrow('Transfer failed');

      expect(mockWithdraw).not.toHaveBeenCalled();
    });

    it('throws when wait() fails', async () => {
      mockTransfer.mockResolvedValue({ wait: mockWait });
      mockWait.mockRejectedValue(new Error('Transaction reverted'));

      await expect(
        cryptoWalletService.executeWithdrawal(MOCK_USER_ID, '0xRecipient', 5000)
      ).rejects.toThrow('Transaction reverted');

      expect(mockWithdraw).not.toHaveBeenCalled();
    });

    it('throws when walletService.withdraw fails', async () => {
      mockWithdraw.mockRejectedValue(new Error('Insufficient balance'));

      await expect(
        cryptoWalletService.executeWithdrawal(MOCK_USER_ID, '0xRecipient', 5000)
      ).rejects.toThrow('Insufficient balance');
    });

    it('uses correct idempotency key based on txHash', async () => {
      mockWait.mockResolvedValue({ hash: '0xunique999' });
      mockWithdraw.mockResolvedValue(undefined);

      await cryptoWalletService.executeWithdrawal(MOCK_USER_ID, '0xRecipient', 200);

      expect(mockWithdraw).toHaveBeenCalledWith(
        MOCK_USER_ID,
        200,
        'polygon_usdc',
        '0xunique999',
        'crypto_withdrawal_0xunique999'
      );
    });
  });

  // --------------------------------------------------------------------------
  // scanForDeposits
  // --------------------------------------------------------------------------
  describe('scanForDeposits()', () => {
    it('calls balanceOf with the platform wallet address', async () => {
      mockBalanceOf.mockResolvedValue(BigInt(1000000));

      await cryptoWalletService.scanForDeposits(MOCK_USER_ID, MOCK_WALLET_ADDRESS);

      expect(mockBalanceOf).toHaveBeenCalledWith('0xPlatformAddress');
    });

    it('completes without throwing on success', async () => {
      mockBalanceOf.mockResolvedValue(BigInt(0));

      await expect(
        cryptoWalletService.scanForDeposits(MOCK_USER_ID, MOCK_WALLET_ADDRESS)
      ).resolves.toBeUndefined();
    });

    it('throws on error', async () => {
      mockBalanceOf.mockRejectedValue(new Error('RPC error'));

      await expect(
        cryptoWalletService.scanForDeposits(MOCK_USER_ID, MOCK_WALLET_ADDRESS)
      ).rejects.toThrow('RPC error');
    });
  });
});
