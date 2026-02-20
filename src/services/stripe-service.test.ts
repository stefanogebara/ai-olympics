import { describe, it, expect, vi, beforeEach } from 'vitest';

// ============================================================================
// Mock all external dependencies before importing
// ============================================================================

const mockStripe = {
  customers: { create: vi.fn() },
  checkout: { sessions: { create: vi.fn() } },
  webhooks: { constructEvent: vi.fn() },
};

vi.mock('stripe', () => ({
  default: vi.fn().mockImplementation(() => mockStripe),
}));

vi.mock('../shared/config.js', () => ({
  config: {
    stripeSecretKey: 'sk_test_fake',
    stripeWebhookSecret: 'whsec_fake',
  },
}));

const mockFrom = vi.fn();
vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: (...args: unknown[]) => mockFrom(...args) },
}));

const mockDeposit = vi.fn();
vi.mock('./wallet-service.js', () => ({
  walletService: { deposit: (...args: unknown[]) => mockDeposit(...args) },
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
const { stripeService } = await import('./stripe-service.js');

// ============================================================================
// Helpers
// ============================================================================

function chainable(data: unknown = null, error: unknown = null) {
  const chain: Record<string, ReturnType<typeof vi.fn>> = {};
  const methods = ['select', 'insert', 'update', 'upsert', 'delete', 'eq', 'single', 'maybeSingle'];
  for (const m of methods) {
    chain[m] = vi.fn().mockReturnValue(chain);
  }
  // Make chain thenable so that `await` resolves to { data, error }
  (chain as Record<string, unknown>).then = (resolve: (v: unknown) => unknown) =>
    resolve({ data, error });
  return chain;
}

// ============================================================================
// Tests
// ============================================================================

describe('StripeService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // --------------------------------------------------------------------------
  // getOrCreateCustomer
  // --------------------------------------------------------------------------
  describe('getOrCreateCustomer()', () => {
    it('returns existing customer when found in DB', async () => {
      const chain = chainable({ stripe_customer_id: 'cus_existing123' });
      mockFrom.mockReturnValue(chain);

      const result = await stripeService.getOrCreateCustomer('user-1', 'test@example.com');

      expect(result).toEqual({ customerId: 'cus_existing123', isNew: false });
      expect(mockFrom).toHaveBeenCalledWith('aio_stripe_customers');
      expect(chain.select).toHaveBeenCalledWith('stripe_customer_id');
      expect(chain.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(chain.single).toHaveBeenCalled();
      expect(mockStripe.customers.create).not.toHaveBeenCalled();
    });

    it('creates a new Stripe customer when none exists in DB', async () => {
      // First call: select returns nothing (PGRST116 = not found)
      const selectChain = chainable(null, { code: 'PGRST116', message: 'not found' });
      // Second call: insert succeeds
      const insertChain = chainable(null, null);

      mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(insertChain);
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_new456' });

      const result = await stripeService.getOrCreateCustomer('user-2', 'new@example.com');

      expect(result).toEqual({ customerId: 'cus_new456', isNew: true });
      expect(mockStripe.customers.create).toHaveBeenCalledWith({
        email: 'new@example.com',
        metadata: { userId: 'user-2' },
      });
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('throws on unexpected DB error during lookup', async () => {
      const dbError = { code: 'INTERNAL', message: 'connection refused' };
      const chain = chainable(null, dbError);
      mockFrom.mockReturnValue(chain);

      await expect(
        stripeService.getOrCreateCustomer('user-3', 'fail@example.com')
      ).rejects.toEqual(dbError);
    });

    it('throws when insert fails after creating Stripe customer', async () => {
      const selectChain = chainable(null, { code: 'PGRST116', message: 'not found' });
      const insertError = { code: 'UNIQUE', message: 'duplicate key' };
      const insertChain = chainable(null, insertError);

      mockFrom.mockReturnValueOnce(selectChain).mockReturnValueOnce(insertChain);
      mockStripe.customers.create.mockResolvedValue({ id: 'cus_dup' });

      await expect(
        stripeService.getOrCreateCustomer('user-4', 'dup@example.com')
      ).rejects.toEqual(insertError);
    });
  });

  // --------------------------------------------------------------------------
  // createCheckoutSession
  // --------------------------------------------------------------------------
  describe('createCheckoutSession()', () => {
    it('creates a checkout session and returns the URL', async () => {
      // Mock getOrCreateCustomer to return existing customer
      const selectChain = chainable({ stripe_customer_id: 'cus_checkout1' });
      mockFrom.mockReturnValue(selectChain);

      mockStripe.checkout.sessions.create.mockResolvedValue({
        url: 'https://checkout.stripe.com/session123',
        id: 'cs_test_123',
      });

      const result = await stripeService.createCheckoutSession('user-5', 'buyer@test.com', 5000);

      expect(result).toEqual({ url: 'https://checkout.stripe.com/session123' });
      expect(mockStripe.checkout.sessions.create).toHaveBeenCalledWith(
        expect.objectContaining({
          customer: 'cus_checkout1',
          mode: 'payment',
          payment_method_types: ['card'],
          line_items: [
            {
              price_data: {
                currency: 'usd',
                product_data: { name: 'AI Olympics Wallet Deposit' },
                unit_amount: 5000,
              },
              quantity: 1,
            },
          ],
          metadata: expect.objectContaining({
            userId: 'user-5',
          }),
        })
      );
    });

    it('throws if Stripe does not return a checkout URL', async () => {
      const selectChain = chainable({ stripe_customer_id: 'cus_nourl' });
      mockFrom.mockReturnValue(selectChain);

      mockStripe.checkout.sessions.create.mockResolvedValue({ url: null, id: 'cs_nourl' });

      await expect(
        stripeService.createCheckoutSession('user-6', 'nourl@test.com', 1000)
      ).rejects.toThrow('Stripe did not return a checkout URL');
    });
  });

  // --------------------------------------------------------------------------
  // handleWebhook
  // --------------------------------------------------------------------------
  describe('handleWebhook()', () => {
    const validPayload = Buffer.from('raw-body');
    const validSignature = 'sig_valid';

    function makeCheckoutEvent(overrides: Record<string, unknown> = {}) {
      return {
        type: 'checkout.session.completed',
        id: 'evt_test_123',
        data: {
          object: {
            id: 'cs_completed_1',
            metadata: {
              userId: 'user-7',
              idempotencyKey: 'idem-key-1',
            },
            amount_total: 10000,
            ...overrides,
          },
        },
      };
    }

    it('processes checkout.session.completed and deposits to wallet', async () => {
      const event = makeCheckoutEvent();
      mockStripe.webhooks.constructEvent.mockReturnValue(event);
      mockDeposit.mockResolvedValue(undefined);

      await stripeService.handleWebhook(validPayload, validSignature);

      expect(mockStripe.webhooks.constructEvent).toHaveBeenCalledWith(
        validPayload,
        validSignature,
        'whsec_fake'
      );
      expect(mockDeposit).toHaveBeenCalledWith(
        'user-7',
        10000,
        'stripe',
        'cs_completed_1',
        'idem-key-1'
      );
    });

    it('rejects invalid webhook signature', async () => {
      mockStripe.webhooks.constructEvent.mockImplementation(() => {
        throw new Error('Signature mismatch');
      });

      await expect(
        stripeService.handleWebhook(validPayload, 'sig_bad')
      ).rejects.toThrow('Invalid webhook signature');
    });

    it('returns early when metadata is missing userId', async () => {
      const event = makeCheckoutEvent({ metadata: { idempotencyKey: 'idem-1' } });
      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      await stripeService.handleWebhook(validPayload, validSignature);

      expect(mockDeposit).not.toHaveBeenCalled();
    });

    it('returns early when metadata is missing idempotencyKey', async () => {
      const event = makeCheckoutEvent({ metadata: { userId: 'user-8' } });
      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      await stripeService.handleWebhook(validPayload, validSignature);

      expect(mockDeposit).not.toHaveBeenCalled();
    });

    it('returns early when amount_total is missing', async () => {
      const event = makeCheckoutEvent({ amount_total: null });
      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      await stripeService.handleWebhook(validPayload, validSignature);

      expect(mockDeposit).not.toHaveBeenCalled();
    });

    it('returns early when amount_total is zero', async () => {
      const event = makeCheckoutEvent({ amount_total: 0 });
      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      await stripeService.handleWebhook(validPayload, validSignature);

      expect(mockDeposit).not.toHaveBeenCalled();
    });

    it('ignores non-checkout events', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        id: 'evt_other',
        data: { object: {} },
      };
      mockStripe.webhooks.constructEvent.mockReturnValue(event);

      await stripeService.handleWebhook(validPayload, validSignature);

      expect(mockDeposit).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // createPayout
  // --------------------------------------------------------------------------
  describe('createPayout()', () => {
    it('throws "not yet available" error', async () => {
      await expect(
        stripeService.createPayout('user-9', 5000)
      ).rejects.toThrow('Stripe Connect payouts are not yet available. Use crypto withdrawal instead.');
    });
  });
});
