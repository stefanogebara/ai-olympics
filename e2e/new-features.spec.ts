import { test, expect } from '@playwright/test';

// ============================================================================
// 1. PREDICTIONS / AI BETTING PAGE (/predictions/ai-betting)
// ============================================================================

test.describe('AI Betting Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/predictions/ai-betting');
  });

  test('page loads with AI Competition Betting heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 }).getByText('AI Competition Betting')).toBeVisible({ timeout: 10000 });
  });

  test('shows Meta-Predictions badge', async ({ page }) => {
    await expect(page.getByText('Meta-Predictions')).toBeVisible({ timeout: 10000 });
  });

  test('shows market stats (Live Markets, Total Pool, AI Agents)', async ({ page }) => {
    // Stats render after matchups load - wait longer for initial render
    await page.waitForTimeout(2000);
    await expect(page.getByText('Live Markets')).toBeVisible({ timeout: 20000 });
    await expect(page.getByText('Total Pool')).toBeVisible({ timeout: 10000 });
    // Use the stat section's "AI Agents" specifically (not the footer text)
    const statsSection = page.locator('main');
    await expect(statsSection.getByText('AI Agents', { exact: true })).toBeVisible({ timeout: 10000 });
  });

  test('shows Active Matchups section with filter tabs', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 2 }).getByText('Active Matchups')).toBeVisible({ timeout: 10000 });

    await expect(page.getByRole('button', { name: 'All' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Live' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Upcoming' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Completed' })).toBeVisible();
  });

  test('shows matchup cards or empty state', async ({ page }) => {
    // Loading state uses PageSkeleton (animate-pulse), not animate-spin
    // Wait for either matchups or empty state to render
    await Promise.race([
      page.getByText('No matchups found').waitFor({ timeout: 20000 }),
      page.getByText('Odds').first().waitFor({ timeout: 20000 }),
    ]).catch(() => {});

    const hasMatchups = await page.getByText('Odds').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No matchups found').isVisible().catch(() => false);

    expect(hasMatchups || hasEmptyState).toBe(true);
  });

  test('matchup cards show agent names with odds', async ({ page }) => {
    // Wait for matchups to load (may be empty if no competitions exist)
    const hasOdds = await page.getByText('Odds').first().isVisible({ timeout: 20000 }).catch(() => false);
    const hasEmptyState = await page.getByText('No matchups found').isVisible().catch(() => false);

    // Skip if no matchups available
    test.skip(!hasOdds && hasEmptyState, 'No matchups available to test');

    if (hasOdds) {
      await expect(page.getByText('%').first()).toBeVisible();
    }
  });

  test('bet buttons are disabled when not logged in', async ({ page }) => {
    const betButton = page.locator('button').filter({ hasText: /Bet on/ }).first();
    const isVisible = await betButton.isVisible({ timeout: 15000 }).catch(() => false);

    if (isVisible) {
      await expect(betButton).toBeDisabled();
    }
  });

  test('shows sign-in prompt when not authenticated', async ({ page }) => {
    // "Sign in to place bets" only shows when matchups exist
    const hasMatchups = await page.getByText('Odds').first().isVisible({ timeout: 20000 }).catch(() => false);
    test.skip(!hasMatchups, 'No matchups available - sign-in prompt only shows with matchups');
    await expect(page.getByText('Sign in to place bets').first()).toBeVisible({ timeout: 10000 });
  });

  test('Refresh Markets button is visible', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Refresh Markets' })).toBeVisible({ timeout: 10000 });
  });
});

// ============================================================================
// 2. PREDICTIONS BROWSE PAGE (/predictions)
// ============================================================================

test.describe('Predictions Browse Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/predictions');
  });

  test('page loads with Prediction Markets heading', async ({ page }) => {
    await expect(page.getByRole('heading', { level: 1 }).getByText('Prediction Markets')).toBeVisible({ timeout: 10000 });
  });

  test('shows category filter buttons', async ({ page }) => {
    // Wait for the page to finish loading (uses animate-pulse skeletons)
    await page.getByRole('button', { name: 'All Markets' }).waitFor({ timeout: 15000 }).catch(() => {});

    const categories = ['All Markets', 'Politics', 'Sports', 'Crypto', 'AI & Tech', 'Entertainment', 'Finance'];
    for (const category of categories) {
      await expect(page.getByRole('button', { name: category })).toBeVisible({ timeout: 10000 });
    }
  });

  test('search input is visible', async ({ page }) => {
    await expect(page.locator('input[placeholder="Search markets..."]')).toBeVisible({ timeout: 10000 });
  });

  test('sort dropdown has correct options', async ({ page }) => {
    const sortSelect = page.locator('select').first();
    await expect(sortSelect).toBeVisible({ timeout: 10000 });

    await expect(sortSelect.locator('option')).toHaveCount(3);
  });

  test('shows Polymarket and Kalshi source links', async ({ page }) => {
    await expect(page.locator('a[href="https://polymarket.com"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href="https://kalshi.com"]')).toBeVisible();
  });

  test('Leaderboard and Portfolio links are visible', async ({ page }) => {
    await expect(page.locator('a[href="/predictions/leaderboard"]')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('a[href="/dashboard/portfolio"]')).toBeVisible();
  });
});

// ============================================================================
// 3. CREATIVE & CODING TASK PAGES (API port 3003)
// ============================================================================

test.describe('Creative Task Pages', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get('http://localhost:3003/api/health', { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running (task pages served by backend)');
  });

  test('code-debug task page loads with code editor', async ({ page }) => {
    await page.goto('http://localhost:3003/tasks/code-debug');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Code Debug Challenge')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('textarea, [contenteditable]').first()).toBeVisible();
    await expect(page.getByRole('button', { name: 'Run Tests' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Solution' })).toBeVisible();
  });

  test('code-golf task page loads with character counter', async ({ page }) => {
    await page.goto('http://localhost:3003/tasks/code-golf');
    await expect(page.locator('h1:has-text("Code Golf Challenge")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('.stat-label:has-text("Character Count")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.stat-label:has-text("Tests Passed")')).toBeVisible();
    await expect(page.locator('.stat-label:has-text("Golf Rating")')).toBeVisible();
  });

  test('design-challenge task page loads with live preview', async ({ page }) => {
    await page.goto('http://localhost:3003/tasks/design-challenge');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Design Challenge')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Live Preview')).toBeVisible();
    await expect(page.getByText('Judging Criteria')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Design' })).toBeVisible();
  });

  test('writing-challenge task page loads with word counter', async ({ page }) => {
    await page.goto('http://localhost:3003/tasks/writing-challenge');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Writing Challenge')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('0 words')).toBeVisible();
    await expect(page.getByText('Writing Prompt')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Submit Writing' })).toBeVisible();
  });

  test('pitch-deck task page loads with slide navigation', async ({ page }) => {
    await page.goto('http://localhost:3003/tasks/pitch-deck');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Pitch Deck Challenge')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Slide 1 / 6')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Next' })).toBeVisible();
  });

  test('api-integration task page loads with API documentation', async ({ page }) => {
    await page.goto('http://localhost:3003/tasks/api-integration');
    await expect(page.locator('h1:has-text("API Integration Challenge")')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('h3:has-text("API Documentation")')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('.path:has-text("/api/mock/users")')).toBeVisible();
    await expect(page.locator('button:has-text("Submit Answers")')).toBeVisible();
  });
});

// ============================================================================
// 4. LEADERBOARD DOMAIN TABS (F1: ELO + F2: New Domains)
// ============================================================================

test.describe('Leaderboard Domain Tabs', () => {
  // Helper: navigate to leaderboard and wait for domain tabs to load, with retry
  async function gotoLeaderboardWithDomains(page: import('@playwright/test').Page) {
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.goto('/leaderboards');
      // Wait for the async Supabase domains query to complete
      try {
        await page.waitForSelector('button:has-text("Creative")', { timeout: 10000 });
        return; // Success
      } catch {
        // Domain tabs didn't load - Supabase query may have failed. Retry.
        if (attempt < 2) continue;
      }
    }
  }

  test('leaderboard shows Creative and Coding domain tabs', async ({ page }) => {
    await gotoLeaderboardWithDomains(page);

    const creativeTab = page.locator('button').filter({ hasText: 'Creative' });
    const codingTab = page.locator('button').filter({ hasText: 'Coding' });

    await expect(creativeTab).toBeVisible({ timeout: 5000 });
    await expect(codingTab).toBeVisible({ timeout: 5000 });
  });

  test('clicking Creative tab filters leaderboard', async ({ page }) => {
    await gotoLeaderboardWithDomains(page);

    const creativeTab = page.locator('button').filter({ hasText: 'Creative' });
    await expect(creativeTab).toBeVisible({ timeout: 5000 });
    await creativeTab.click();

    // Should have active styling
    await expect(creativeTab).toHaveClass(/bg-neon-cyan/);

    // Wait for data to reload
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('clicking Coding tab filters leaderboard', async ({ page }) => {
    await gotoLeaderboardWithDomains(page);

    const codingTab = page.locator('button').filter({ hasText: 'Coding' });
    await expect(codingTab).toBeVisible({ timeout: 5000 });
    await codingTab.click();

    await expect(codingTab).toHaveClass(/bg-neon-cyan/);

    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });
});

// ============================================================================
// 5. AGENTS PAGE - ELO SORT (F1)
// ============================================================================

test.describe('Agents ELO Sort', () => {
  test('agents page has ELO Rating as default sort', async ({ page }) => {
    await page.goto('/agents');

    const sortSelect = page.locator('select');
    await expect(sortSelect).toBeVisible({ timeout: 10000 });
    await expect(sortSelect).toHaveValue('elo_rating');
  });

  test('agents sort dropdown includes all 4 options', async ({ page }) => {
    await page.goto('/agents');

    const sortSelect = page.locator('select');
    await expect(sortSelect).toBeVisible({ timeout: 10000 });

    await expect(sortSelect.locator('option[value="elo_rating"]')).toHaveText('ELO Rating');
    await expect(sortSelect.locator('option[value="total_wins"]')).toHaveText('Total Wins');
    await expect(sortSelect.locator('option[value="total_competitions"]')).toHaveText('Competitions');
    await expect(sortSelect.locator('option[value="created_at"]')).toHaveText('Newest');
  });
});

// ============================================================================
// 6. MARKETS NAVIGATION (Header -> /predictions)
// ============================================================================

test.describe('Markets Navigation', () => {
  test('Markets nav link goes to /predictions', async ({ page }) => {
    await page.goto('/');
    const marketsLink = page.locator('a[href="/predictions"]').first();
    await expect(marketsLink).toBeVisible({ timeout: 10000 });
    await marketsLink.click();
    await expect(page).toHaveURL(/\/predictions/);
  });
});

// ============================================================================
// 7. AUTH GUARD - DASHBOARD REDIRECT
// ============================================================================

test.describe('Auth Guard', () => {
  test('dashboard redirects to login when not authenticated', async ({ page }) => {
    // Navigate to any page first to establish a page context
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });
});

// ============================================================================
// 8. FORGOT PASSWORD PAGE
// ============================================================================

test.describe('Forgot Password Page', () => {
  test('page loads with Reset Password heading', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Reset Password')).toBeVisible({ timeout: 10000 });
  });

  test('shows email input and Send Reset Link button', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.locator('input[placeholder="you@example.com"]')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Send Reset Link' })).toBeVisible();
  });

  test('has Back to sign in link', async ({ page }) => {
    await page.goto('/auth/forgot-password');
    await expect(page.locator('a[href="/auth/login"]').getByText('Back to sign in')).toBeVisible({ timeout: 10000 });
  });
});
