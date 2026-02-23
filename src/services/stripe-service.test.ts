/**
 * Tests for stripe-service.ts
 *
 * Covers: getOrCreateCustomer, createCheckoutSession, handleWebhook, createPayout.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const {
  mockFrom,
  mockCustomersCreate,
  mockCheckoutCreate,
  mockConstructEvent,
  mockDeposit,
  MockStripe,
} = vi.hoisted(() => {
  const mockCustomersCreate = vi.fn();
  const mockCheckoutCreate = vi.fn();
  const mockConstructEvent = vi.fn();
  const mockDeposit = vi.fn();
  const MockStripe = vi.fn().mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  }));
  return {
    mockFrom: vi.fn(),
    mockCustomersCreate,
    mockCheckoutCreate,
    mockConstructEvent,
    mockDeposit,
    MockStripe,
  };
});

vi.mock('stripe', () => ({ default: MockStripe }));

vi.mock('../shared/config.js', () => ({
  config: {
    stripeSecretKey: 'sk_test_mock',
    stripeWebhookSecret: 'whsec_mock',
  },
}));

vi.mock('../shared/utils/supabase.js', () => ({
  serviceClient: { from: mockFrom },
}));

vi.mock('./wallet-service.js', () => ({
  walletService: { deposit: mockDeposit },
}));

vi.mock('../shared/utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

import { stripeService } from './stripe-service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function chain(result: { data: unknown; error: unknown } = { data: null, error: null }): any {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const q: any = {};
  for (const m of ['select', 'eq', 'insert', 'update']) {
    q[m] = vi.fn().mockReturnValue(q);
  }
  q.single = vi.fn().mockResolvedValue(result);
  q.then = (resolve: (v: unknown) => unknown, reject: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return q;
}

function makeCheckoutEvent(overrides: Record<string, unknown> = {}) {
  return {
    type: 'checkout.session.completed',
    id: 'evt_1',
    data: {
      object: {
        id: 'cs_test_1',
        amount_total: 5000,
        metadata: {
          userId: 'user-1',
          idempotencyKey: 'idem-key-1',
        },
        ...overrides,
      },
    },
  };
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(() => {
  vi.resetAllMocks();
  // Re-apply Stripe constructor mock after resetAllMocks clears it
  MockStripe.mockImplementation(() => ({
    customers: { create: mockCustomersCreate },
    checkout: { sessions: { create: mockCheckoutCreate } },
    webhooks: { constructEvent: mockConstructEvent },
  }));
  // Reset lazy stripe instance so getStripe() re-initialises each test
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (stripeService as any).stripe = null;
});

// ---------------------------------------------------------------------------
// getOrCreateCustomer
// ---------------------------------------------------------------------------

describe('getOrCreateCustomer', () => {
  it('returns existing customer when found in DB', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: { stripe_customer_id: 'cus_existing' }, error: null })
    );

    const result = await stripeService.getOrCreateCustomer('user-1', 'user@example.com');

    expect(result).toEqual({ customerId: 'cus_existing', isNew: false });
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it('creates new Stripe customer when not found (PGRST116)', async () => {
    // First from() — select returns not-found
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    );
    // Second from() — insert succeeds
    mockFrom.mockReturnValueOnce(chain({ data: null, error: null }));

    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' });

    const result = await stripeService.getOrCreateCustomer('user-1', 'user@example.com');

    expect(result).toEqual({ customerId: 'cus_new', isNew: true });
    expect(mockCustomersCreate).toHaveBeenCalledWith({
      email: 'user@example.com',
      metadata: { userId: 'user-1' },
    });
    // Insert chain should have been called
    const insertChain = mockFrom.mock.results[1].value;
    expect(insertChain.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      stripe_customer_id: 'cus_new',
      email: 'user@example.com',
    });
  });

  it('throws when DB returns a non-PGRST116 error', async () => {
    const dbError = { code: 'PGRST500', message: 'Internal DB error' };
    mockFrom.mockReturnValueOnce(chain({ data: null, error: dbError }));

    await expect(stripeService.getOrCreateCustomer('user-1', 'user@example.com')).rejects.toEqual(
      dbError
    );
    expect(mockCustomersCreate).not.toHaveBeenCalled();
  });

  it('throws when the insert fails after customer creation', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { code: 'PGRST116', message: 'not found' } })
    );
    const insertError = { code: 'PGRST400', message: 'insert failed' };
    mockFrom.mockReturnValueOnce(chain({ data: null, error: insertError }));
    mockCustomersCreate.mockResolvedValueOnce({ id: 'cus_new' });

    await expect(stripeService.getOrCreateCustomer('user-1', 'user@example.com')).rejects.toEqual(
      insertError
    );
  });
});

// ---------------------------------------------------------------------------
// createCheckoutSession
// ---------------------------------------------------------------------------

describe('createCheckoutSession', () => {
  function setupExistingCustomer(customerId = 'cus_1') {
    mockFrom.mockReturnValueOnce(
      chain({ data: { stripe_customer_id: customerId }, error: null })
    );
  }

  it('returns the checkout session URL', async () => {
    setupExistingCustomer();
    mockCheckoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/pay/test' });

    const result = await stripeService.createCheckoutSession('user-1', 'user@example.com', 5000);

    expect(result).toEqual({ url: 'https://checkout.stripe.com/pay/test' });
  });

  it('passes correct params to sessions.create', async () => {
    setupExistingCustomer('cus_abc');
    mockCheckoutCreate.mockResolvedValueOnce({ url: 'https://checkout.stripe.com/x' });

    await stripeService.createCheckoutSession('user-1', 'user@example.com', 2500);

    expect(mockCheckoutCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: 'cus_abc',
        mode: 'payment',
        payment_method_types: ['card'],
        line_items: expect.arrayContaining([
          expect.objectContaining({
            price_data: expect.objectContaining({ unit_amount: 2500, currency: 'usd' }),
            quantity: 1,
          }),
        ]),
        metadata: expect.objectContaining({ userId: 'user-1' }),
      })
    );
  });

  it('throws when Stripe does not return a checkout URL', async () => {
    setupExistingCustomer();
    mockCheckoutCreate.mockResolvedValueOnce({ url: null });

    await expect(
      stripeService.createCheckoutSession('user-1', 'user@example.com', 5000)
    ).rejects.toThrow('Stripe did not return a checkout URL');
  });

  it('propagates customer lookup errors', async () => {
    mockFrom.mockReturnValueOnce(
      chain({ data: null, error: { code: 'PGRST500', message: 'DB error' } })
    );

    await expect(
      stripeService.createCheckoutSession('user-1', 'user@example.com', 5000)
    ).rejects.toMatchObject({ code: 'PGRST500' });
  });
});

// ---------------------------------------------------------------------------
// handleWebhook
// ---------------------------------------------------------------------------

describe('handleWebhook', () => {
  const payload = Buffer.from('test-payload');
  const signature = 'sig_test';

  it('throws "Invalid webhook signature" when constructEvent fails', async () => {
    mockConstructEvent.mockImplementation(() => {
      throw new Error('signature mismatch');
    });

    await expect(stripeService.handleWebhook(payload, signature)).rejects.toThrow(
      'Invalid webhook signature'
    );
  });

  it('does nothing for non-checkout event types', async () => {
    mockConstructEvent.mockReturnValueOnce({ type: 'payment_intent.created', id: 'evt_2' });

    await stripeService.handleWebhook(payload, signature);

    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns early when userId is missing from metadata', async () => {
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutEvent({ metadata: { idempotencyKey: 'idem-1' } })
    );

    await stripeService.handleWebhook(payload, signature);

    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns early when idempotencyKey is missing from metadata', async () => {
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutEvent({ metadata: { userId: 'user-1' } })
    );

    await stripeService.handleWebhook(payload, signature);

    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('returns early when amount_total is missing', async () => {
    mockConstructEvent.mockReturnValueOnce(
      makeCheckoutEvent({ amount_total: null })
    );

    await stripeService.handleWebhook(payload, signature);

    expect(mockDeposit).not.toHaveBeenCalled();
  });

  it('calls walletService.deposit with correct args for checkout.session.completed', async () => {
    mockConstructEvent.mockReturnValueOnce(makeCheckoutEvent());
    mockDeposit.mockResolvedValueOnce(undefined);

    await stripeService.handleWebhook(payload, signature);

    expect(mockDeposit).toHaveBeenCalledWith(
      'user-1',
      5000,
      'stripe',
      'cs_test_1',
      'idem-key-1'
    );
  });
});

// ---------------------------------------------------------------------------
// createPayout
// ---------------------------------------------------------------------------

describe('createPayout', () => {
  it('always throws a not-implemented error', async () => {
    await expect(stripeService.createPayout('user-1', 10000)).rejects.toThrow(
      'Stripe Connect payouts are not yet available'
    );
  });
});
