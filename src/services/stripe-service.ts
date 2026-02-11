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
        success_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/wallet?deposit=success`,
        cancel_url: `${process.env.CLIENT_URL || 'http://localhost:5173'}/dashboard/wallet?deposit=cancelled`,
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

  async createPayout(userId: string, amountCents: number): Promise<{ status: string }> {
    // Placeholder for Stripe Connect payouts - future implementation
    log.warn('Stripe Connect payouts not yet implemented', { userId, amountCents });
    throw new Error('Stripe Connect payouts are not yet available. Use crypto withdrawal instead.');
  }
}

export const stripeService = new StripeService();
export default stripeService;
