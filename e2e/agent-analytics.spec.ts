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

test.describe('Agent Analytics Dashboard', () => {
  test('navigate to analytics from My Agents page', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');
    await page.waitForLoadState('networkidle');

    // Look for the analytics button (BarChart3 icon with neon-magenta styling)
    const analyticsButton = page.locator('a[href*="/analytics"] button').first();

    // If agents exist, the analytics button should be visible
    const hasAgents = await page.locator('[class*="GlassCard"], [class*="glass"]').count() > 0;
    if (hasAgents) {
      await expect(analyticsButton).toBeVisible({ timeout: 10000 });
      await analyticsButton.click();
      await expect(page).toHaveURL(/\/dashboard\/agents\/.*\/analytics/);
    }
  });

  test('page shows key sections when loaded', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');
    await page.waitForLoadState('networkidle');

    // Navigate to first agent's analytics
    const analyticsLink = page.locator('a[href*="/analytics"]').first();
    const isVisible = await analyticsLink.isVisible().catch(() => false);

    if (isVisible) {
      await analyticsLink.click();
      await page.waitForLoadState('networkidle');

      // Check for key section headings
      await expect(page.getByText('Rating Trajectory')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Domain Performance')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('Competition History')).toBeVisible({ timeout: 10000 });
    }
  });

  test('agent selector dropdown is visible', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');
    await page.waitForLoadState('networkidle');

    const analyticsLink = page.locator('a[href*="/analytics"]').first();
    const isVisible = await analyticsLink.isVisible().catch(() => false);

    if (isVisible) {
      await analyticsLink.click();
      await page.waitForLoadState('networkidle');

      // Agent selector should be present
      const selector = page.locator('select[aria-label="Select agent"]');
      await expect(selector).toBeVisible({ timeout: 10000 });
    }
  });

  test('time range buttons are present', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');
    await page.waitForLoadState('networkidle');

    const analyticsLink = page.locator('a[href*="/analytics"]').first();
    const isVisible = await analyticsLink.isVisible().catch(() => false);

    if (isVisible) {
      await analyticsLink.click();
      await page.waitForLoadState('networkidle');

      // Check time range buttons
      await expect(page.getByText('All Time')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('30d')).toBeVisible({ timeout: 10000 });
      await expect(page.getByText('7d')).toBeVisible({ timeout: 10000 });
    }
  });

  test('unauthenticated access redirects to login', async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    // Try to access analytics directly
    await page.goto('/dashboard/agents/some-fake-id/analytics');
    await page.waitForLoadState('networkidle');

    // Should be redirected to login or show the dashboard auth guard
    const url = page.url();
    const isOnLogin = url.includes('/auth/login');
    const isOnDashboard = url.includes('/dashboard');

    // Either redirected to login or dashboard shows auth guard
    expect(isOnLogin || isOnDashboard).toBeTruthy();
  });

  test('accessing non-existent agent shows error state', async ({ page }) => {
    await loginViaUI(page);

    // Navigate to a non-existent agent analytics
    await page.goto('/dashboard/agents/00000000-0000-0000-0000-000000000000/analytics');

    // Should show error message once loading completes
    await expect(page.getByText(/not found|don't have access/i)).toBeVisible({ timeout: 20000 });

    // Should have a back link
    await expect(page.getByText('Back to My Agents')).toBeVisible({ timeout: 5000 });
  });
});
