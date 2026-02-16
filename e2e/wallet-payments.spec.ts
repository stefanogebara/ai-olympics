import { test, expect, type Page } from '@playwright/test';

const API_BASE = 'http://localhost:3003';

// ============================================================================
// TEST CREDENTIALS & HELPERS
// ============================================================================

const TEST_EMAIL = 'e2e-agent-test@gmail.com';
const TEST_PASSWORD = 'E2eTestPass1234';

async function loginViaUI(page: Page) {
  await page.goto('/auth/login');
  await page.locator('input[placeholder="you@example.com"]').fill(TEST_EMAIL);
  await page.locator('input[placeholder="••••••••"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

async function clearAuthState(page: Page) {
  await page.evaluate(() => {
    localStorage.clear();
    sessionStorage.clear();
  });
}

// ============================================================================
// A. PAYMENT API ENDPOINTS (no auth - should reject)
// ============================================================================

test.describe('Payment API Auth Protection', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('GET /api/payments/wallet without auth returns 401', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/payments/wallet`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`PAYMENTS WALLET GET (no auth): ${res.status()} - ${body.error}`);
  });

  test('POST /api/payments/wallet without auth returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/wallet`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`PAYMENTS WALLET POST (no auth): ${res.status()} - ${body.error}`);
  });

  test('POST /api/payments/deposit/stripe without auth returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/deposit/stripe`, {
      data: { amountCents: 1000, email: 'test@example.com' },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`DEPOSIT STRIPE (no auth): ${res.status()} - ${body.error}`);
  });

  test('POST /api/payments/deposit/crypto without auth returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/deposit/crypto`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`DEPOSIT CRYPTO (no auth): ${res.status()} - ${body.error}`);
  });

  test('POST /api/payments/withdraw/crypto without auth returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/withdraw/crypto`, {
      data: { toAddress: '0x1234', amountCents: 500 },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`WITHDRAW CRYPTO (no auth): ${res.status()} - ${body.error}`);
  });

  test('GET /api/payments/transactions without auth returns 401', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/payments/transactions`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`TRANSACTIONS (no auth): ${res.status()} - ${body.error}`);
  });

  test('POST /api/payments/exchange-credentials without auth returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/exchange-credentials`, {
      data: { exchange: 'polymarket', credentials: { private_key: 'fake' } },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`EXCHANGE CREDENTIALS (no auth): ${res.status()} - ${body.error}`);
  });
});

// ============================================================================
// B. TRADING API ENDPOINTS (no auth - should reject)
// ============================================================================

test.describe('Trading API Auth Protection', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('POST /api/trading/orders without auth returns 401', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/trading/orders`, {
      data: { marketId: 'fake', marketSource: 'polymarket', outcome: 'yes', amountCents: 100 },
    });
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`TRADING ORDERS POST (no auth): ${res.status()} - ${body.error}`);
  });

  test('GET /api/trading/orders without auth returns 401', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/trading/orders`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`TRADING ORDERS GET (no auth): ${res.status()} - ${body.error}`);
  });

  test('GET /api/trading/positions without auth returns 401', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/trading/positions`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`TRADING POSITIONS (no auth): ${res.status()} - ${body.error}`);
  });

  test('GET /api/trading/history without auth returns 401', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/trading/history`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`TRADING HISTORY (no auth): ${res.status()} - ${body.error}`);
  });

  test('DELETE /api/trading/orders/fake-id without auth returns 401', async ({ request }) => {
    const res = await request.delete(`${API_BASE}/api/trading/orders/fake-id`);
    expect(res.status()).toBe(401);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`TRADING ORDER DELETE (no auth): ${res.status()} - ${body.error}`);
  });
});

// ============================================================================
// C. STRIPE WEBHOOK ENDPOINT
// ============================================================================

test.describe('Stripe Webhook Endpoint', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('POST /api/payments/webhook/stripe without signature returns 400', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/webhook/stripe`, {
      data: JSON.stringify({ type: 'checkout.session.completed' }),
      headers: { 'Content-Type': 'application/json' },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`STRIPE WEBHOOK (no sig): ${res.status()} - ${body.error}`);
  });

  test('POST /api/payments/webhook/stripe with invalid signature returns 400', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/payments/webhook/stripe`, {
      data: JSON.stringify({ type: 'checkout.session.completed' }),
      headers: {
        'Content-Type': 'application/json',
        'stripe-signature': 't=1234567890,v1=invalid_signature_value',
      },
    });
    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body.error).toBeTruthy();
    console.log(`STRIPE WEBHOOK (bad sig): ${res.status()} - ${body.error}`);
  });
});

// ============================================================================
// D. WALLET DASHBOARD UI (authenticated)
// ============================================================================

test.describe('Wallet Dashboard UI', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('navigate to /dashboard/wallet, page loads without crash', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // Page should not show an error or blank screen
    await expect(page.locator('body')).toBeVisible();
    console.log('WALLET PAGE: loaded successfully');
  });

  test('wallet page shows heading containing "Wallet" (not "Coming soon...")', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // Should show "Wallet" in the h1 heading
    await expect(page.locator('h1').filter({ hasText: 'Wallet' })).toBeVisible({ timeout: 10000 });

    // Should NOT show "Coming soon..."
    await expect(page.getByText('Coming soon...')).not.toBeVisible({ timeout: 5000 });
    console.log('WALLET PAGE: shows real Wallet heading, no "Coming soon..."');
  });

  test('wallet page shows balance section with "$" amount', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // The balance section shows a dollar amount (e.g., "$0.00")
    await expect(page.getByText(/\$\d+\.\d{2}/).first()).toBeVisible({ timeout: 10000 });
    console.log('WALLET PAGE: balance with dollar amount visible');
  });

  test('wallet page shows "Deposit" button', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const depositButton = page.getByRole('button', { name: /deposit/i });
    await expect(depositButton).toBeVisible({ timeout: 10000 });
    console.log('WALLET PAGE: Deposit button visible');
  });

  test('wallet page shows "Withdraw" button', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    await expect(withdrawButton).toBeVisible({ timeout: 10000 });
    console.log('WALLET PAGE: Withdraw button visible');
  });

  test('clicking "Deposit" opens a modal with "Card" and "Crypto" tabs', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const depositButton = page.getByRole('button', { name: /deposit/i });
    await expect(depositButton).toBeVisible({ timeout: 10000 });
    test.skip(await depositButton.isDisabled(), 'Deposit button disabled (REAL_MONEY_ENABLED=false)');

    await depositButton.click();
    await expect(page.getByText('Deposit Funds')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Card (Stripe)')).toBeVisible();
    await expect(page.getByText('Crypto (USDC)').first()).toBeVisible();
    console.log('WALLET PAGE: Deposit modal opened with Card and Crypto tabs');
  });

  test('clicking deposit modal close button closes it', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const depositButton = page.getByRole('button', { name: /deposit/i });
    await expect(depositButton).toBeVisible({ timeout: 10000 });
    test.skip(await depositButton.isDisabled(), 'Deposit button disabled (REAL_MONEY_ENABLED=false)');

    await depositButton.click();
    await expect(page.getByText('Deposit Funds')).toBeVisible({ timeout: 5000 });

    const closeButton = page.locator('.fixed.inset-0 button').filter({ has: page.locator('svg.lucide-x') });
    await closeButton.click();
    await expect(page.getByText('Deposit Funds')).not.toBeVisible({ timeout: 5000 });
    console.log('WALLET PAGE: Deposit modal closed successfully');
  });

  test('clicking "Withdraw" opens a modal with "Bank" and "Crypto" tabs', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    await expect(withdrawButton).toBeVisible({ timeout: 10000 });
    test.skip(await withdrawButton.isDisabled(), 'Withdraw button disabled (REAL_MONEY_ENABLED=false)');

    await withdrawButton.click();
    await expect(page.getByText('Withdraw Funds')).toBeVisible({ timeout: 5000 });
    await expect(page.getByText('Bank')).toBeVisible();
    await expect(page.getByText('Crypto (USDC)').first()).toBeVisible();
    console.log('WALLET PAGE: Withdraw modal opened with Bank and Crypto tabs');
  });

  test('Bank tab in withdraw modal shows "coming soon" message', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    await expect(withdrawButton).toBeVisible({ timeout: 10000 });
    test.skip(await withdrawButton.isDisabled(), 'Withdraw button disabled (REAL_MONEY_ENABLED=false)');

    await withdrawButton.click();
    await expect(page.getByText('Withdraw Funds')).toBeVisible({ timeout: 5000 });

    const modal = page.locator('.fixed.inset-0');
    const bankTab = modal.locator('button').filter({ hasText: /^Bank$/ });
    await bankTab.click();
    await expect(modal.getByText('Coming Soon', { exact: true })).toBeVisible({ timeout: 5000 });
    console.log('WALLET PAGE: Bank tab shows Coming Soon message');
  });

  test('clicking withdraw modal close button closes it', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    const withdrawButton = page.getByRole('button', { name: /withdraw/i });
    await expect(withdrawButton).toBeVisible({ timeout: 10000 });
    test.skip(await withdrawButton.isDisabled(), 'Withdraw button disabled (REAL_MONEY_ENABLED=false)');

    await withdrawButton.click();
    await expect(page.getByText('Withdraw Funds')).toBeVisible({ timeout: 5000 });

    const closeButton = page.locator('.fixed.inset-0 button').filter({ has: page.locator('svg.lucide-x') });
    await closeButton.click();
    await expect(page.getByText('Withdraw Funds')).not.toBeVisible({ timeout: 5000 });
    console.log('WALLET PAGE: Withdraw modal closed successfully');
  });

  test('transaction history section is visible (may be empty)', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // Scroll down to reveal content below the fold
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    // Transaction history section should be visible (either with data or empty state)
    const hasTransactionHeading = await page.getByText(/Transaction/i).first().isVisible().catch(() => false);
    const hasNoTransactions = await page.getByText(/No transactions/i).first().isVisible().catch(() => false);
    const hasRecentActivity = await page.getByText(/Recent/i).first().isVisible().catch(() => false);

    expect(hasTransactionHeading || hasNoTransactions || hasRecentActivity).toBeTruthy();
    console.log(`WALLET PAGE: Transaction history section visible (heading=${hasTransactionHeading}, empty=${hasNoTransactions}, recent=${hasRecentActivity})`);
  });

  test('Exchange Credentials section is visible with Polymarket and Kalshi inputs', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // Wait for page to load then scroll to the Exchange Credentials section
    const exchangeHeading = page.getByText('Exchange Credentials');
    await exchangeHeading.scrollIntoViewIfNeeded({ timeout: 10000 });

    // Should show "Exchange Credentials" heading
    await expect(exchangeHeading).toBeVisible({ timeout: 10000 });

    // Should show Polymarket and Kalshi section headings (h3 elements)
    await expect(page.locator('h3').filter({ hasText: 'Polymarket' })).toBeVisible({ timeout: 5000 });
    await expect(page.locator('h3').filter({ hasText: 'Kalshi' })).toBeVisible({ timeout: 5000 });
    console.log('WALLET PAGE: Exchange Credentials section visible with Polymarket and Kalshi');
  });
});

// ============================================================================
// E. WALLET PAGE NAVIGATION
// ============================================================================

test.describe('Wallet Page Navigation', () => {
  test('sidebar wallet link navigates to /dashboard/wallet correctly', async ({ page }) => {
    await loginViaUI(page);

    // Click the Wallet link in the sidebar (use first match for the nav link)
    await page.locator('a[href="/dashboard/wallet"]').first().click();
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // Wallet page h1 heading should be visible
    await expect(page.locator('h1').filter({ hasText: 'Wallet' })).toBeVisible({ timeout: 10000 });
    console.log('WALLET NAV: Sidebar link navigates correctly');
  });

  test('/dashboard/wallet without login redirects to /auth/login', async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await clearAuthState(page);
    await page.reload();

    // Try to access wallet page directly without login
    await page.goto('/dashboard/wallet');

    // Should redirect to login page
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
    console.log('WALLET NAV: Unauthenticated access redirects to login');
  });
});
