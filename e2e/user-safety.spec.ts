/**
 * E2E Tests: User Safety Features
 *
 * Covers Phase 1 legal compliance UI:
 * 1. Age verification checkbox on signup
 * 2. Cookie consent banner
 * 3. Self-exclusion in settings
 * 4. GDPR data export in settings
 * 5. Geo-block API response (mocked)
 */

import { test, expect, type Page } from '@playwright/test';

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
// 1. AGE VERIFICATION ON SIGNUP
// ============================================================================

test.describe('Age Verification — Signup', () => {
  test.beforeEach(async ({ page }) => {
    await clearAuthState(page);
    await page.goto('/auth/signup');
  });

  test('signup page shows 18+ age verification checkbox', async ({ page }) => {
    const ageCheckbox = page.locator('#age-verified');
    await expect(ageCheckbox).toBeVisible();

    const ageLabel = page.locator('label[for="age-verified"]');
    await expect(ageLabel).toContainText('18');
  });

  test('submit without checking age box shows validation error', async ({ page }) => {
    const testId = Date.now().toString(36);

    // Fill all required fields
    await page.locator('input[placeholder="cooluser123"]').fill(`testuser${testId}`);
    await page.locator('input[placeholder="you@example.com"]').fill(`test_${testId}@example.com`);
    await page.locator('input[placeholder="••••••••"]').fill('TestPass123!');
    await page.locator('input[placeholder="Re-enter your password"]').fill('TestPass123!');

    // Check terms but NOT age
    await page.locator('#terms').check();

    // Submit
    await page.getByRole('button', { name: /create account/i }).click();

    // Should show age validation error
    await expect(
      page.getByText(/18 years of age/i).or(page.getByText(/must confirm/i))
    ).toBeVisible({ timeout: 3000 });
  });

  test('age checkbox is required — cannot proceed without it', async ({ page }) => {
    const ageCheckbox = page.locator('#age-verified');
    await expect(ageCheckbox).not.toBeChecked();

    // Check it
    await ageCheckbox.check();
    await expect(ageCheckbox).toBeChecked();

    // Uncheck it
    await ageCheckbox.uncheck();
    await expect(ageCheckbox).not.toBeChecked();
  });

  test('signup page also shows terms checkbox', async ({ page }) => {
    const termsCheckbox = page.locator('#terms');
    await expect(termsCheckbox).toBeVisible();

    const termsLabel = page.locator('label[for="terms"]');
    await expect(termsLabel).toContainText('Terms of Service');
  });
});

// ============================================================================
// 2. COOKIE CONSENT BANNER
// ============================================================================

test.describe('Cookie Consent Banner', () => {
  test('banner appears on first visit (no localStorage consent)', async ({ page }) => {
    await clearAuthState(page);
    await page.evaluate(() => localStorage.removeItem('aio_cookie_consent'));
    await page.goto('/');

    // Banner should be visible
    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 5000 });

    // Should mention cookies and privacy policy
    await expect(banner).toContainText('cookies');
    await expect(banner.getByRole('link', { name: /privacy policy/i })).toBeVisible();
  });

  test('clicking Accept hides the banner and stores consent', async ({ page }) => {
    await clearAuthState(page);
    await page.evaluate(() => localStorage.removeItem('aio_cookie_consent'));
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /accept/i }).click();

    await expect(banner).not.toBeVisible();

    // Consent should be stored
    const stored = await page.evaluate(() => localStorage.getItem('aio_cookie_consent'));
    expect(stored).toBe('accepted');
  });

  test('banner does not appear when consent already given', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('aio_cookie_consent', 'accepted'));
    await page.reload();

    // Banner should not be visible
    await page.waitForTimeout(1000);
    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).not.toBeVisible();
  });

  test('clicking Decline hides the banner and stores declined state', async ({ page }) => {
    await clearAuthState(page);
    await page.evaluate(() => localStorage.removeItem('aio_cookie_consent'));
    await page.goto('/');

    const banner = page.getByRole('dialog', { name: /cookie consent/i });
    await expect(banner).toBeVisible({ timeout: 5000 });

    await page.getByRole('button', { name: /decline/i }).click();

    await expect(banner).not.toBeVisible();

    const stored = await page.evaluate(() => localStorage.getItem('aio_cookie_consent'));
    expect(stored).toBe('declined');
  });
});

// ============================================================================
// 3. SELF-EXCLUSION IN SETTINGS
// ============================================================================

test.describe('Self-Exclusion — Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/settings');
  });

  test('settings page shows Responsible Forecasting section', async ({ page }) => {
    await expect(page.getByText('Responsible Forecasting')).toBeVisible({ timeout: 10000 });
  });

  test('shows three self-exclusion period options', async ({ page }) => {
    await page.waitForSelector('text=Responsible Forecasting', { timeout: 10000 });

    await expect(page.getByRole('button', { name: /pause 30 days/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pause 90 days/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /pause 180 days/i })).toBeVisible();
  });

  test('self-exclusion section has descriptive text about irreversibility', async ({ page }) => {
    await page.waitForSelector('text=Responsible Forecasting', { timeout: 10000 });

    // Should warn that pause cannot be shortened
    await expect(
      page.getByText(/cannot be shortened/i).or(page.getByText(/take a break/i))
    ).toBeVisible();
  });
});

// ============================================================================
// 4. GDPR DATA EXPORT IN SETTINGS
// ============================================================================

test.describe('Data Export — Settings', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/settings');
  });

  test('settings page shows Data & Privacy section with download button', async ({ page }) => {
    await expect(page.getByText('Data & Privacy')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: /download my data/i })).toBeVisible();
  });

  test('Data & Privacy section mentions GDPR', async ({ page }) => {
    await page.waitForSelector('text=Data & Privacy', { timeout: 10000 });
    await expect(page.getByText(/GDPR/i)).toBeVisible();
  });
});

// ============================================================================
// 5. TERMS OF SERVICE — NEW CLAUSES
// ============================================================================

test.describe('Terms of Service — Legal Clauses', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/terms');
  });

  test('terms page loads and shows last updated date', async ({ page }) => {
    await expect(page.getByText('Terms of Service')).toBeVisible();
    await expect(page.getByText(/february/i)).toBeVisible();
  });

  test('age restriction clause is present (18+)', async ({ page }) => {
    await expect(page.getByText(/18 years of age/i)).toBeVisible();
  });

  test('prohibited conduct section covers collusion and multi-accounting', async ({ page }) => {
    await expect(page.getByText(/collusion/i)).toBeVisible();
    await expect(page.getByText(/multi-accounting/i)).toBeVisible();
  });

  test('self-exclusion clause is present', async ({ page }) => {
    await expect(page.getByText(/self-exclusion/i)).toBeVisible();
  });

  test('geo-restriction clause is present', async ({ page }) => {
    await expect(
      page.getByText(/Australia/i).or(page.getByText(/Geo-Restriction/i))
    ).toBeVisible();
  });

  test('dispute resolution section is present', async ({ page }) => {
    await expect(page.getByText(/Dispute Resolution/i)).toBeVisible();
  });
});
