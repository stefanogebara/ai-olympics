/**
 * Tests for crypto-wallet-service.ts
 *
 * Covers: getDepositAddress, linkWallet, getLinkedWallets,
 * verifyWalletOwnership, executeWithdrawal, scanForDeposits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockFrom,
  mockWithdraw,
  MockProvider,
  MockWallet,
  MockContract,
  mockVerifyMessage,
  mockTransfer,
  mockBalanceOf,
  mockConfig,
} = vi.hoisted(() => {
  const mockTransfer = vi.fn();
  const mockBalanceOf = vi.fn();
  const MockProvider = vi.fn();
  const MockWallet = vi.fn();
  // Class mock so `new Contract()` works in Vitest 4.x ESM
  class MockContract {
    transfer = mockTransfer;
    balanceOf = mockBalanceOf;
  }
  const mockVerifyMessage = vi.fn();
  // Mutable config — tests can override individual fields
  const mockConfig: Record<string, string | undefined> = {
    polygonRpcUrl: 'https://polygon-rpc.example.com',
    platformWalletPrivateKey: '0x' + 'a'.repeat(64),
    platformWalletAddress: '0xPLATFORM',
  };
  return {
    mockFrom: vi.fn(),
    mockWithdraw: vi.fn(),
    MockProvider,
    MockWallet,
    MockContract,
    mockVerifyMessage,
    mockTransfer,
    mockBalanceOf,
    mockConfig,
  };
});

vi.mock('ethers', () => ({
  ethers: {
    JsonRpcProvider: MockProvider,
    Wallet: MockWallet,
    Contract: MockContract,
    verifyMessage: mockVerifyMessage,
  },
}));

vi.mock('../shared/config.js', () => ({ config: mockConfig }));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

vi.mock('./wallet-service.js', () => ({
  walletService: { withdraw: mockWithdraw },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { cryptoWalletService } from './crypto-wallet-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'insert', 'update', 'order']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function makeWallet(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cw-1',
    user_id: 'user-1',
    wallet_address: '0xabc',
    is_verified: false,
    created_at: '2024-01-01T00:00:00Z',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Restore config defaults
  mockConfig.polygonRpcUrl = 'https://polygon-rpc.example.com';
  mockConfig.platformWalletPrivateKey = '0x' + 'a'.repeat(64);
  mockConfig.platformWalletAddress = '0xPLATFORM';
  // Re-apply method defaults after resetAllMocks
  // Reset lazy-initialized singletons
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cryptoWalletService as any).provider = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (cryptoWalletService as any).platformWallet = null;
});

// ---------------------------------------------------------------------------
// getDepositAddress
// ---------------------------------------------------------------------------

describe('getDepositAddress', () => {
  it('returns the platform wallet address', async () => {
    const result = await cryptoWalletService.getDepositAddress();
    expect(result).toBe('0xPLATFORM');
  });

  it('throws when platformWalletAddress is not configured', async () => {
    mockConfig.platformWalletAddress = '';
    await expect(cryptoWalletService.getDepositAddress()).rejects.toThrow(
      'Platform wallet address not configured'
    );
  });
});

// ---------------------------------------------------------------------------
// linkWallet
// ---------------------------------------------------------------------------

describe('linkWallet', () => {
  it('inserts with lowercased address and returns linked wallet', async () => {
    const wallet = makeWallet({ wallet_address: '0xabc' });
    mockFrom.mockReturnValueOnce(chain({ data: wallet, error: null }));

    const result = await cryptoWalletService.linkWallet('user-1', '0xABC');

    expect(result).toEqual(wallet);
    const q = mockFrom.mock.results[0].value;
    expect(mockFrom).toHaveBeenCalledWith('aio_crypto_wallets');
    expect(q.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      wallet_address: '0xabc', // lowercased
      is_verified: false,
    });
    expect(q.select).toHaveBeenCalled();
    expect(q.single).toHaveBeenCalled();
  });

  it('throws when DB insert fails', async () => {
    const dbError = { code: 'PGRST400', message: 'duplicate key' };
    mockFrom.mockReturnValueOnce(chain({ data: null, error: dbError }));

    await expect(cryptoWalletService.linkWallet('user-1', '0xABC')).rejects.toEqual(dbError);
  });
});

// ---------------------------------------------------------------------------
// getLinkedWallets
// ---------------------------------------------------------------------------

describe('getLinkedWallets', () => {
  it('returns all wallets for the user', async () => {
    const wallets = [makeWallet({ id: 'cw-1' }), makeWallet({ id: 'cw-2' })];
    mockFrom.mockReturnValueOnce(chain({ data: wallets, error: null }));

    const result = await cryptoWalletService.getLinkedWallets('user-1');

    expect(result).toEqual(wallets);
    const q = mockFrom.mock.results[0].value;
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(q.order).toHaveBeenCalledWith('created_at', { ascending: false });
  });

  it('returns empty array when data is null', async () => {
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await cryptoWalletService.getLinkedWallets('user-1');

    expect(result).toEqual([]);
  });

  it('throws when DB query fails', async () => {
    const dbError = { code: 'PGRST500', message: 'DB error' };
    mockFrom.mockReturnValueOnce(chain({ data: null, error: dbError }));

    await expect(cryptoWalletService.getLinkedWallets('user-1')).rejects.toEqual(dbError);
  });
});

// ---------------------------------------------------------------------------
// verifyWalletOwnership
// ---------------------------------------------------------------------------

describe('verifyWalletOwnership', () => {
  it('returns true and updates DB when signature matches', async () => {
    mockVerifyMessage.mockReturnValueOnce('0xABC');
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    const result = await cryptoWalletService.verifyWalletOwnership(
      'user-1', '0xabc', 'sig', 'msg'
    );

    expect(result).toBe(true);
    const q = mockFrom.mock.results[0].value;
    expect(q.update).toHaveBeenCalledWith({ is_verified: true });
    expect(q.eq).toHaveBeenCalledWith('user_id', 'user-1');
    expect(q.eq).toHaveBeenCalledWith('wallet_address', '0xabc');
  });

  it('returns false when recovered address does not match (case-insensitive)', async () => {
    mockVerifyMessage.mockReturnValueOnce('0xDEAD');

    const result = await cryptoWalletService.verifyWalletOwnership(
      'user-1', '0xabc', 'sig', 'msg'
    );

    expect(result).toBe(false);
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it('throws when DB update fails after successful signature check', async () => {
    mockVerifyMessage.mockReturnValueOnce('0xABC');
    const dbError = { code: 'PGRST500', message: 'update failed' };
    mockFrom.mockReturnValueOnce(chain({ data: null, error: dbError }));

    await expect(
      cryptoWalletService.verifyWalletOwnership('user-1', '0xabc', 'sig', 'msg')
    ).rejects.toEqual(dbError);
  });
});

// ---------------------------------------------------------------------------
// executeWithdrawal
// ---------------------------------------------------------------------------

describe('executeWithdrawal', () => {
  it('transfers correct USDC amount and returns txHash', async () => {
    const mockTx = { wait: vi.fn().mockResolvedValueOnce({ hash: '0xtxhash' }) };
    mockTransfer.mockResolvedValueOnce(mockTx);
    mockWithdraw.mockResolvedValueOnce(undefined);

    const result = await cryptoWalletService.executeWithdrawal('user-1', '0xTO', 500);

    expect(result).toEqual({ txHash: '0xtxhash' });
    // 500 cents * 10_000 = 5_000_000 USDC units (6 decimals)
    expect(mockTransfer).toHaveBeenCalledWith('0xTO', BigInt(5_000_000));
  });

  it('calls walletService.withdraw with correct args', async () => {
    const mockTx = { wait: vi.fn().mockResolvedValueOnce({ hash: '0xtxhash' }) };
    mockTransfer.mockResolvedValueOnce(mockTx);
    mockWithdraw.mockResolvedValueOnce(undefined);

    await cryptoWalletService.executeWithdrawal('user-1', '0xTO', 500);

    expect(mockWithdraw).toHaveBeenCalledWith(
      'user-1',
      500,
      'polygon_usdc',
      '0xtxhash',
      'crypto_withdrawal_0xtxhash'
    );
  });

  it('throws when the on-chain transfer fails', async () => {
    mockTransfer.mockRejectedValueOnce(new Error('insufficient funds'));

    await expect(
      cryptoWalletService.executeWithdrawal('user-1', '0xTO', 500)
    ).rejects.toThrow('insufficient funds');
    expect(mockWithdraw).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// scanForDeposits
// ---------------------------------------------------------------------------

describe('scanForDeposits', () => {
  it('calls balanceOf on the platform wallet address', async () => {
    mockBalanceOf.mockResolvedValueOnce(BigInt('1000000'));

    await cryptoWalletService.scanForDeposits('user-1', '0xUSER');

    expect(mockBalanceOf).toHaveBeenCalledWith('0xPLATFORM');
  });

  it('throws when the contract call fails', async () => {
    mockBalanceOf.mockRejectedValueOnce(new Error('RPC error'));

    await expect(
      cryptoWalletService.scanForDeposits('user-1', '0xUSER')
    ).rejects.toThrow('RPC error');
  });
});
