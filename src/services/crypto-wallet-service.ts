/**
 * Crypto Wallet Service
 * Polygon USDC integration for deposits and withdrawals.
 */

import { ethers } from 'ethers';
import { config } from '../shared/config.js';
import { serviceClient } from '../shared/utils/supabase.js';
import { walletService } from './wallet-service.js';
import { createLogger } from '../shared/utils/logger.js';

const log = createLogger('CryptoWalletService');

const USDC_ADDRESS = '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359';
const USDC_ABI = [
  'function transfer(address to, uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
];

interface LinkedWallet {
  id: string;
  user_id: string;
  wallet_address: string;
  is_verified: boolean;
  created_at: string;
}

class CryptoWalletService {
  private provider: ethers.JsonRpcProvider | null = null;
  private platformWallet: ethers.Wallet | null = null;

  private getProvider(): ethers.JsonRpcProvider {
    if (!this.provider) {
      this.provider = new ethers.JsonRpcProvider(config.polygonRpcUrl);
    }
    return this.provider;
  }

  private getPlatformWallet(): ethers.Wallet {
    if (!this.platformWallet) {
      if (!config.platformWalletPrivateKey) {
        throw new Error('Platform wallet private key not configured');
      }
      this.platformWallet = new ethers.Wallet(
        config.platformWalletPrivateKey,
        this.getProvider()
      );
    }
    return this.platformWallet;
  }

  async getDepositAddress(): Promise<string> {
    if (!config.platformWalletAddress) {
      throw new Error('Platform wallet address not configured');
    }
    return config.platformWalletAddress;
  }

  async linkWallet(userId: string, walletAddress: string): Promise<LinkedWallet> {
    try {
      log.info('Linking crypto wallet', { userId, walletAddress });

      const { data, error } = await serviceClient
        .from('aio_crypto_wallets')
        .insert({
          user_id: userId,
          wallet_address: walletAddress.toLowerCase(),
          is_verified: false,
        })
        .select()
        .single();

      if (error) {
        throw error;
      }

      return data as LinkedWallet;
    } catch (error) {
      log.error('Failed to link wallet', { userId, walletAddress, error: String(error) });
      throw error;
    }
  }

  async getLinkedWallets(userId: string): Promise<LinkedWallet[]> {
    try {
      const { data, error } = await serviceClient
        .from('aio_crypto_wallets')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error) {
        throw error;
      }

      return (data || []) as LinkedWallet[];
    } catch (error) {
      log.error('Failed to get linked wallets', { userId, error: String(error) });
      throw error;
    }
  }

  async verifyWalletOwnership(
    userId: string,
    walletAddress: string,
    signature: string,
    message: string
  ): Promise<boolean> {
    try {
      const recoveredAddress = ethers.verifyMessage(message, signature);

      if (recoveredAddress.toLowerCase() !== walletAddress.toLowerCase()) {
        log.warn('Wallet verification failed - signature mismatch', {
          userId,
          walletAddress,
          recoveredAddress,
        });
        return false;
      }

      const { error } = await serviceClient
        .from('aio_crypto_wallets')
        .update({ is_verified: true })
        .eq('user_id', userId)
        .eq('wallet_address', walletAddress.toLowerCase());

      if (error) {
        throw error;
      }

      log.info('Wallet verified', { userId, walletAddress });
      return true;
    } catch (error) {
      log.error('Wallet verification failed', { userId, walletAddress, error: String(error) });
      throw error;
    }
  }

  async executeWithdrawal(
    userId: string,
    toAddress: string,
    amountCents: number
  ): Promise<{ txHash: string }> {
    try {
      log.info('Executing USDC withdrawal', { userId, toAddress, amountCents });

      const wallet = this.getPlatformWallet();
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, wallet);

      // Convert cents to USDC (6 decimals). 1 USDC = 100 cents = 1_000_000 units
      const usdcAmount = BigInt(amountCents) * BigInt(10_000); // cents * 10000 = 6-decimal units

      const tx = await usdc.transfer(toAddress, usdcAmount);
      const receipt = await tx.wait();
      const txHash = receipt.hash as string;

      const idempotencyKey = `crypto_withdrawal_${txHash}`;

      await walletService.withdraw(
        userId,
        amountCents,
        'polygon_usdc',
        txHash,
        idempotencyKey
      );

      log.info('USDC withdrawal completed', { userId, toAddress, amountCents, txHash });
      return { txHash };
    } catch (error) {
      log.error('USDC withdrawal failed', { userId, toAddress, amountCents, error: String(error) });
      throw error;
    }
  }

  async scanForDeposits(userId: string, walletAddress: string): Promise<void> {
    // Placeholder - in production, use Alchemy/QuickNode webhooks or event listeners
    // to detect incoming USDC transfers to the platform wallet
    try {
      log.info('Scanning for deposits (placeholder)', { userId, walletAddress });

      const provider = this.getProvider();
      const usdc = new ethers.Contract(USDC_ADDRESS, USDC_ABI, provider);
      const balance = await usdc.balanceOf(config.platformWalletAddress);

      log.info('Platform USDC balance', { balance: balance.toString() });
    } catch (error) {
      log.error('Failed to scan for deposits', { userId, error: String(error) });
      throw error;
    }
  }
}

export const cryptoWalletService = new CryptoWalletService();
export default cryptoWalletService;
