import { create } from 'zustand';
const API_BASE = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:3003' : '');

interface Wallet {
  id: string;
  user_id: string;
  balance_cents: number;
  pending_cents: number;
  total_deposited_cents: number;
  total_withdrawn_cents: number;
  currency: string;
}

interface Transaction {
  id: string;
  wallet_id: string;
  type: 'deposit' | 'withdrawal' | 'bet_lock' | 'bet_win' | 'bet_loss' | 'fee';
  amount_cents: number;
  balance_after_cents: number;
  status: string;
  provider: string;
  provider_ref: string;
  created_at: string;
}

interface CryptoWallet {
  id: string;
  wallet_address: string;
  is_verified: boolean;
  created_at: string;
}

interface WalletState {
  wallet: Wallet | null;
  transactions: Transaction[];
  cryptoWallets: CryptoWallet[];
  isLoading: boolean;
  error: string | null;

  fetchWallet: (token: string) => Promise<void>;
  createWallet: (token: string) => Promise<void>;
  depositStripe: (token: string, amountCents: number, email: string) => Promise<string | null>;
  depositCrypto: (token: string) => Promise<{ address: string } | null>;
  withdrawCrypto: (token: string, toAddress: string, amountCents: number) => Promise<boolean>;
  fetchTransactions: (token: string, page?: number) => Promise<void>;
  linkCryptoWallet: (token: string, walletAddress: string) => Promise<boolean>;
  fetchCryptoWallets: (token: string) => Promise<void>;
  storeExchangeCredentials: (token: string, exchange: string, credentials: Record<string, string>) => Promise<boolean>;
}

export type { Wallet, Transaction, CryptoWallet };

export const useWalletStore = create<WalletState>()((set, get) => ({
  wallet: null,
  transactions: [],
  cryptoWallets: [],
  isLoading: false,
  error: null,

  fetchWallet: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/wallet`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        if (res.status === 404) {
          // Wallet doesn't exist yet, create one
          await get().createWallet(token);
          return;
        }
        throw new Error('Failed to fetch wallet');
      }
      const data = await res.json();
      set({ wallet: data.wallet || data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createWallet: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/wallet`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to create wallet');
      const data = await res.json();
      set({ wallet: data.wallet || data, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  depositStripe: async (token: string, amountCents: number, email: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/deposit/stripe`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ amount_cents: amountCents, email }),
      });
      if (!res.ok) throw new Error('Failed to create checkout session');
      const data = await res.json();
      set({ isLoading: false });
      return data.checkout_url || data.url || null;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  depositCrypto: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/deposit/crypto`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) throw new Error('Failed to get deposit address');
      const data = await res.json();
      set({ isLoading: false });
      return { address: data.address };
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return null;
    }
  },

  withdrawCrypto: async (token: string, toAddress: string, amountCents: number) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/withdraw/crypto`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to_address: toAddress, amount_cents: amountCents }),
      });
      if (!res.ok) throw new Error('Failed to initiate withdrawal');
      set({ isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  fetchTransactions: async (token: string, page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/transactions?page=${page}&limit=20`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch transactions');
      const data = await res.json();
      const txns = data.transactions || data || [];
      if (page === 1) {
        set({ transactions: txns, isLoading: false });
      } else {
        set((state) => ({ transactions: [...state.transactions, ...txns], isLoading: false }));
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  linkCryptoWallet: async (token: string, walletAddress: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/crypto-wallets`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ wallet_address: walletAddress }),
      });
      if (!res.ok) throw new Error('Failed to link crypto wallet');
      set({ isLoading: false });
      await get().fetchCryptoWallets(token);
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  fetchCryptoWallets: async (token: string) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/crypto-wallets`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to fetch crypto wallets');
      const data = await res.json();
      set({ cryptoWallets: data.wallets || data || [], isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  storeExchangeCredentials: async (token: string, exchange: string, credentials: Record<string, string>) => {
    set({ isLoading: true, error: null });
    try {
      const res = await fetch(`${API_BASE}/api/payments/exchange-credentials`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ exchange, credentials }),
      });
      if (!res.ok) throw new Error('Failed to store exchange credentials');
      set({ isLoading: false });
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },
}));
