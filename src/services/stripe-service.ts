/**
 * Stripe Service
 * Handles Stripe Checkout sessions, webhook processing, and customer management.
 */

import Stripe from 'stripe';
import { config } from '../shared/config.js';
import { serviceClient } from '../shared/utils/supabase.js';
import { walletService } from './wallet-service.js';
import { createLogger } from '../shared/utils/logger.js';
import crypto from 'crypto';

const log = createLogger('StripeService');

class StripeService {
  private stripe: Stripe | null = null;

  private getStripe(): Stripe {
    if (!this.stripe) {
      if (!config.stripeSecretKey) {
        throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY environment variable.');
      }
      this.stripe = new Stripe(config.stripeSecretKey);
    }
    return this.stripe;
  }

  async getOrCreateCustomer(
    userId: string,
    email: string
  ): Promise<{ customerId: string; isNew: boolean }> {
    try {
      const { data: existing, error: fetchError } = await serviceClient
        .from('aio_stripe_customers')
        .select('stripe_customer_id')
        .eq('user_id', userId)
        .single();

      if (existing) {
        return { customerId: existing.stripe_customer_id, isNew: false };
      }

      if (fetchError && fetchError.code !== 'PGRST116') {
        throw fetchError;
      }

      log.info('Creating Stripe customer', { userId, email });

      const customer = await this.getStripe().customers.create({
        email,
        metadata: { userId },
      });

      const { error: insertError } = await serviceClient
        .from('aio_stripe_customers')
        .insert({
          user_id: userId,
          stripe_customer_id: customer.id,
          email,
        });

      if (insertError) {
        throw insertError;
      }

      return { customerId: customer.id, isNew: true };
    } catch (error) {
      log.error('Failed to get or create Stripe customer', { userId, error: String(error) });
      throw error;
    }
  }

  async createCheckoutSession(
    userId: string,
    email: string,
    amountCents: number
  ): Promise<{ url: string }> {
    try {
      const { customerId } = await this.getOrCreateCustomer(userId, email);
      const idempotencyKey = crypto.randomUUID();

      log.info('Creating checkout session', { userId, amountCents });

      const session = await this.getStripe().checkout.sessions.create({
        customer: customerId,
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: [
          {
            price_data: {
              currency: 'usd',
              product_data: {
                name: 'AI Olympics Wallet Deposit',
              },
              unit_amount: amountCents,
            },
            quantity: 1,
          },
        ],
        metadata: {
          userId,
          idempotencyKey,
        },
        success_url: `${process.env.CLIENT_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '')}/dashboard/wallet?deposit=success`,
        cancel_url: `${process.env.CLIENT_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5173' : '')}/dashboard/wallet?deposit=cancelled`,
      });

      if (!session.url) {
        throw new Error('Stripe did not return a checkout URL');
      }

      return { url: session.url };
    } catch (error) {
      log.error('Failed to create checkout session', { userId, amountCents, error: String(error) });
      throw error;
    }
  }

  async handleWebhook(payload: Buffer, signature: string): Promise<void> {
    let event: Stripe.Event;

    try {
      event = this.getStripe().webhooks.constructEvent(
        payload,
        signature,
        config.stripeWebhookSecret
      );
    } catch (error) {
      log.error('Webhook signature verification failed', { error: String(error) });
      throw new Error('Invalid webhook signature');
    }

    log.info('Processing webhook event', { type: event.type, id: event.id });

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.metadata?.userId;
      const idempotencyKey = session.metadata?.idempotencyKey;

      if (!userId || !idempotencyKey) {
        log.error('Missing metadata in checkout session', { sessionId: session.id });
        return;
      }

      const amountCents = session.amount_total;
      if (!amountCents) {
        log.error('Missing amount in checkout session', { sessionId: session.id });
        return;
      }

      await walletService.deposit(
        userId,
        amountCents,
        'stripe',
        session.id,
        idempotencyKey
      );

      log.info('Deposit from Stripe checkout completed', { userId, amountCents, sessionId: session.id });
    }
  }

  async onboardUser(userId: string, email: string): Promise<{ url: string }> {
    try {
      log.info('Starting Stripe Connect onboarding', { userId, email });

      // Check for existing connect account
      const { data: existing } = await serviceClient
        .from('aio_stripe_connect_accounts')
        .select('stripe_account_id, payouts_enabled')
        .eq('user_id', userId)
        .single();

      let accountId: string;

      if (existing) {
        accountId = existing.stripe_account_id;
        log.info('Resuming existing connect account onboarding', { userId, accountId });
      } else {
        const account = await this.getStripe().accounts.create({
          type: 'express',
          email,
          metadata: { userId },
          capabilities: {
            transfers: { requested: true },
          },
        });
        accountId = account.id;

        const { error: insertError } = await serviceClient
          .from('aio_stripe_connect_accounts')
          .insert({
            user_id: userId,
            stripe_account_id: accountId,
            payouts_enabled: false,
          });

        if (insertError) {
          throw insertError;
        }
        log.info('Created Stripe Connect account', { userId, accountId });
      }

      const returnUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/wallet?connect=success`;
      const refreshUrl = `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/wallet?connect=refresh`;

      const accountLink = await this.getStripe().accountLinks.create({
        account: accountId,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: 'account_onboarding',
      });

      return { url: accountLink.url };
    } catch (error) {
      log.error('Failed to start Stripe Connect onboarding', { userId, error: String(error) });
      throw error;
    }
  }

  async getConnectStatus(userId: string): Promise<{ connected: boolean; payouts_enabled: boolean }> {
    try {
      const { data } = await serviceClient
        .from('aio_stripe_connect_accounts')
        .select('stripe_account_id, payouts_enabled')
        .eq('user_id', userId)
        .single();

      if (!data) {
        return { connected: false, payouts_enabled: false };
      }

      // Refresh payouts_enabled from Stripe in case it changed
      const account = await this.getStripe().accounts.retrieve(data.stripe_account_id);
      const payoutsEnabled = account.payouts_enabled ?? false;

      if (payoutsEnabled !== data.payouts_enabled) {
        await serviceClient
          .from('aio_stripe_connect_accounts')
          .update({
            payouts_enabled: payoutsEnabled,
            onboarded_at: payoutsEnabled ? new Date().toISOString() : null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_id', userId);
      }

      return { connected: true, payouts_enabled: payoutsEnabled };
    } catch (error) {
      log.error('Failed to get connect status', { userId, error: String(error) });
      throw error;
    }
  }

  async createPayout(userId: string, amountCents: number): Promise<{ status: string }> {
    try {
      log.info('Processing Stripe Connect payout', { userId, amountCents });

      const { data: connectAccount } = await serviceClient
        .from('aio_stripe_connect_accounts')
        .select('stripe_account_id, payouts_enabled')
        .eq('user_id', userId)
        .single();

      if (!connectAccount) {
        throw new Error('No Stripe Connect account found. Please complete bank account onboarding first.');
      }

      if (!connectAccount.payouts_enabled) {
        throw new Error('Your bank account is not yet verified. Please complete Stripe onboarding.');
      }

      // Transfer funds to connected account
      const transfer = await this.getStripe().transfers.create({
        amount: amountCents,
        currency: 'usd',
        destination: connectAccount.stripe_account_id,
        metadata: { userId },
      });

      // Debit the wallet
      const idempotencyKey = `stripe_payout_${transfer.id}`;
      await walletService.withdraw(userId, amountCents, 'stripe_connect', transfer.id, idempotencyKey);

      log.info('Stripe Connect payout successful', { userId, amountCents, transferId: transfer.id });
      return { status: 'success' };
    } catch (error) {
      log.error('Failed to process Stripe Connect payout', { userId, amountCents, error: String(error) });
      throw error;
    }
  }
}

export const stripeService = new StripeService();
export default stripeService;
