/**
 * UX Audit - Screenshot every page for review
 * Run: npx playwright test e2e/ux-audit.spec.ts
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

async function screenshotPage(page: Page, name: string, options?: { fullPage?: boolean }) {
  await page.waitForTimeout(1500); // let animations settle
  await page.screenshot({
    path: `e2e/screenshots/${name}.png`,
    fullPage: options?.fullPage ?? true,
  });
}

// ====================================================================
// PUBLIC PAGES (unauthenticated)
// ====================================================================

test.describe('UX Audit - Public Pages', () => {
  test('01 - Landing Page', async ({ page }) => {
    await page.goto('/');
    await screenshotPage(page, '01-landing');
  });

  test('02 - Landing Page Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await screenshotPage(page, '02-landing-mobile');
  });

  test('03 - Login Page', async ({ page }) => {
    await page.goto('/auth/login');
    await screenshotPage(page, '03-login');
  });

  test('04 - Signup Page', async ({ page }) => {
    await page.goto('/auth/signup');
    await screenshotPage(page, '04-signup');
  });

  test('05 - Forgot Password Page', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await screenshotPage(page, '05-forgot-password');
  });

  test('06 - Competitions Browse', async ({ page }) => {
    await page.goto('/competitions');
    await screenshotPage(page, '06-competitions');
  });

  test('07 - Games Browse', async ({ page }) => {
    await page.goto('/games');
    await screenshotPage(page, '07-games');
  });

  test('08 - Agents Browse', async ({ page }) => {
    await page.goto('/agents');
    await screenshotPage(page, '08-agents');
  });

  test('09 - Leaderboards', async ({ page }) => {
    await page.goto('/leaderboards');
    await screenshotPage(page, '09-leaderboards');
  });

  test('10 - Predictions Browse', async ({ page }) => {
    await page.goto('/predictions');
    await screenshotPage(page, '10-predictions');
  });

  test('11 - Meta Markets (AI Betting)', async ({ page }) => {
    await page.goto('/predictions/ai-betting');
    await screenshotPage(page, '11-meta-markets');
  });

  test('12 - Games Leaderboard', async ({ page }) => {
    await page.goto('/games/leaderboard');
    await screenshotPage(page, '12-games-leaderboard');
  });

  test('13 - 404 Page', async ({ page }) => {
    await page.goto('/this-page-does-not-exist');
    await screenshotPage(page, '13-404');
  });

  test('14 - Footer visible on landing', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await screenshotPage(page, '14-footer', { fullPage: false });
  });
});

// ====================================================================
// AUTHENTICATED PAGES (dashboard)
// ====================================================================

test.describe('UX Audit - Dashboard Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('20 - Dashboard Overview', async ({ page }) => {
    await page.goto('/dashboard');
    await screenshotPage(page, '20-dashboard-overview');
  });

  test('21 - Dashboard Overview Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard');
    await screenshotPage(page, '21-dashboard-overview-mobile');
  });

  test('22 - Portfolio', async ({ page }) => {
    await page.goto('/dashboard/portfolio');
    await screenshotPage(page, '22-portfolio');
  });

  test('23 - Agents List', async ({ page }) => {
    await page.goto('/dashboard/agents');
    await screenshotPage(page, '23-agents-list');
  });

  test('24 - Create Agent', async ({ page }) => {
    await page.goto('/dashboard/agents/create');
    await screenshotPage(page, '24-agent-create');
  });

  test('25 - Wallet', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await screenshotPage(page, '25-wallet');
  });

  test('26 - Wallet Mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/dashboard/wallet');
    await screenshotPage(page, '26-wallet-mobile');
  });

  test('27 - My Competitions', async ({ page }) => {
    await page.goto('/dashboard/competitions');
    await screenshotPage(page, '27-my-competitions');
  });

  test('28 - Settings', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await screenshotPage(page, '28-settings');
  });
});

// ====================================================================
// INTERACTIVE FLOWS
// ====================================================================

test.describe('UX Audit - Interactive Flows', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('30 - Wallet Deposit Modal', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await page.getByRole('button', { name: /deposit/i }).click();
    await page.waitForTimeout(500);
    await screenshotPage(page, '30-deposit-modal', { fullPage: false });
  });

  test('31 - Wallet Withdraw Modal', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await page.getByRole('button', { name: /withdraw/i }).click();
    await page.waitForTimeout(500);
    await screenshotPage(page, '31-withdraw-modal', { fullPage: false });
  });

  test('32 - Withdraw Bank Tab', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await page.getByRole('button', { name: /withdraw/i }).click();
    await page.waitForTimeout(300);
    const modal = page.locator('.fixed.inset-0');
    await modal.locator('button').filter({ hasText: /^Bank$/ }).click();
    await page.waitForTimeout(300);
    await screenshotPage(page, '32-withdraw-bank-tab', { fullPage: false });
  });

  test('33 - Deposit Crypto Tab', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await page.getByRole('button', { name: /deposit/i }).click();
    await page.waitForTimeout(300);
    const modal = page.locator('.fixed.inset-0');
    await modal.locator('button').filter({ hasText: /Crypto/ }).click();
    await page.waitForTimeout(300);
    await screenshotPage(page, '33-deposit-crypto-tab', { fullPage: false });
  });

  test('34 - Header nav (authenticated)', async ({ page }) => {
    await page.goto('/');
    await screenshotPage(page, '34-header-authenticated', { fullPage: false });
  });

  test('35 - Header mobile menu open', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    // Click hamburger menu
    const menuButton = page.locator('button').filter({ has: page.locator('svg.lucide-menu') });
    if (await menuButton.isVisible()) {
      await menuButton.click();
      await page.waitForTimeout(300);
    }
    await screenshotPage(page, '35-mobile-menu-open', { fullPage: false });
  });
});
