import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { API_BASE } from '../lib/api';

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

  fetchWallet: async (_token: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('aio_wallets')
        .select('*')
        .eq('user_id', user.id)
        .single();

      if (error && error.code === 'PGRST116') {
        // No wallet found, create one
        await get().createWallet(_token);
        return;
      }
      if (error) throw error;
      set({ wallet: data as Wallet, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  createWallet: async (_token: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('aio_wallets')
        .insert({ user_id: user.id })
        .select()
        .single();

      if (error) throw error;
      set({ wallet: data as Wallet, isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  depositStripe: async (token: string, amountCents: number, email: string) => {
    if (!API_BASE) {
      set({ error: 'Stripe deposits require the backend server.', isLoading: false });
      return null;
    }
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
    if (!API_BASE) {
      set({ error: 'Crypto deposits require the backend server.', isLoading: false });
      return null;
    }
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
    if (!API_BASE) {
      set({ error: 'Crypto withdrawals require the backend server.', isLoading: false });
      return false;
    }
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

  fetchTransactions: async (_token: string, page = 1) => {
    set({ isLoading: true, error: null });
    try {
      const wallet = get().wallet;
      if (!wallet) {
        set({ transactions: [], isLoading: false });
        return;
      }

      const limit = 20;
      const offset = (page - 1) * limit;
      const { data, error } = await supabase
        .from('aio_transactions')
        .select('*')
        .eq('wallet_id', wallet.id)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;
      const txns = (data || []) as Transaction[];
      if (page === 1) {
        set({ transactions: txns, isLoading: false });
      } else {
        set((state) => ({ transactions: [...state.transactions, ...txns], isLoading: false }));
      }
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  linkCryptoWallet: async (_token: string, walletAddress: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { error } = await supabase
        .from('aio_crypto_wallets')
        .insert({ user_id: user.id, wallet_address: walletAddress });

      if (error) throw error;
      set({ isLoading: false });
      await get().fetchCryptoWallets(_token);
      return true;
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
      return false;
    }
  },

  fetchCryptoWallets: async (_token: string) => {
    set({ isLoading: true, error: null });
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('aio_crypto_wallets')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      set({ cryptoWallets: (data || []) as CryptoWallet[], isLoading: false });
    } catch (err) {
      set({ error: (err as Error).message, isLoading: false });
    }
  },

  storeExchangeCredentials: async (token: string, exchange: string, credentials: Record<string, string>) => {
    if (!API_BASE) {
      set({ error: 'Exchange credential storage requires the backend server.', isLoading: false });
      return false;
    }
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
