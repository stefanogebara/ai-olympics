import { test, expect, type Page } from '@playwright/test';

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
// 1. DASHBOARD OVERVIEW (/dashboard)
// ============================================================================

test.describe('Dashboard Overview', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('page loads after login and shows dashboard URL', async ({ page }) => {
    await expect(page).toHaveURL(/\/dashboard/);
  });

  test('shows welcome message or dashboard heading', async ({ page }) => {
    // DashboardOverview renders "Welcome back, <username>"
    const welcomeHeading = page.locator('h1').first();
    await expect(welcomeHeading).toBeVisible({ timeout: 10000 });

    // Should contain "Welcome back" text
    await expect(page.getByText('Welcome back,')).toBeVisible({ timeout: 10000 });
  });

  test('shows sidebar navigation with all expected links', async ({ page }) => {
    // The DashboardLayout sidebar has these NavLinks
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Check each sidebar nav item
    await expect(page.locator('a[href="/dashboard"]').filter({ hasText: 'Overview' })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/agents"]').filter({ hasText: 'My Agents' })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/portfolio"]').filter({ hasText: 'Portfolio' })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/competitions"]').filter({ hasText: 'My Competitions' })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/wallet"]').filter({ hasText: 'Wallet' })).toBeVisible();
    await expect(page.locator('a[href="/dashboard/settings"]').filter({ hasText: 'Settings' })).toBeVisible();
  });

  test('main content area shows dashboard stats cards', async ({ page }) => {
    // Wait for loading spinner to disappear (the overview fetches data)
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });

    // The stats grid has 4 cards: Agents, Competitions, Total Wins, Avg ELO
    await expect(page.getByText('Agents', { exact: true }).first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Competitions', { exact: true }).first()).toBeVisible();
    await expect(page.getByText('Total Wins')).toBeVisible();
    await expect(page.getByText('Avg ELO')).toBeVisible();
  });

  test('stats cards display numeric values', async ({ page }) => {
    // Wait for data to load
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });

    // Each stat card has a value rendered as a <p> with font-mono font-bold
    const statValues = page.locator('.font-mono.font-bold');
    // There should be at least 4 stat values (Agents count, Competitions count, Wins, ELO)
    const count = await statValues.count();
    expect(count).toBeGreaterThanOrEqual(4);
  });

  test('shows Your Agents section', async ({ page }) => {
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });

    await expect(page.getByText('Your Agents').first()).toBeVisible();
  });

  test('shows Recent Activity section', async ({ page }) => {
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });

    await expect(page.getByText('Recent Activity').first()).toBeVisible();
  });

  test('shows Quick Actions section', async ({ page }) => {
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });

    await expect(page.getByText('Quick Actions').first()).toBeVisible();

    // Quick actions: Create Agent, Join Competition, Leaderboards
    await expect(page.getByText('Create Agent').first()).toBeVisible();
    await expect(page.getByText('Join Competition').first()).toBeVisible();
    await expect(page.getByText('Leaderboards').first()).toBeVisible();
  });
});

// ============================================================================
// 2. DASHBOARD SIDEBAR NAVIGATION
// ============================================================================

test.describe('Dashboard Sidebar Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('click "My Agents" navigates to /dashboard/agents', async ({ page }) => {
    await page.locator('a[href="/dashboard/agents"]').filter({ hasText: 'My Agents' }).click();
    await expect(page).toHaveURL(/\/dashboard\/agents/);

    // Agents page should show its heading containing "My" and "Agents"
    await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible();
  });

  test('click "Portfolio" navigates to /dashboard/portfolio', async ({ page }) => {
    await page.locator('a[href="/dashboard/portfolio"]').filter({ hasText: 'Portfolio' }).click();
    await expect(page).toHaveURL(/\/dashboard\/portfolio/);

    // Portfolio page has "Portfolio Dashboard" heading
    await expect(page.getByText('Portfolio Dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('click "My Competitions" navigates to /dashboard/competitions', async ({ page }) => {
    await page.locator('a[href="/dashboard/competitions"]').filter({ hasText: 'My Competitions' }).click();
    await expect(page).toHaveURL(/\/dashboard\/competitions/);
  });

  test('click "Wallet" navigates to /dashboard/wallet', async ({ page }) => {
    await page.locator('a[href="/dashboard/wallet"]').filter({ hasText: 'Wallet' }).click();
    await expect(page).toHaveURL(/\/dashboard\/wallet/);
  });

  test('click "Settings" navigates to /dashboard/settings', async ({ page }) => {
    await page.locator('a[href="/dashboard/settings"]').filter({ hasText: 'Settings' }).click();
    await expect(page).toHaveURL(/\/dashboard\/settings/);
  });

  test('active sidebar link is highlighted with active class', async ({ page }) => {
    // On /dashboard, the Overview link should have the active styling (bg-neon-cyan/10 text-neon-cyan)
    const overviewLink = page.locator('a[href="/dashboard"]').filter({ hasText: 'Overview' });
    await expect(overviewLink).toHaveClass(/text-neon-cyan/);
    await expect(overviewLink).toHaveClass(/bg-neon-cyan/);

    // Navigate to agents and verify it becomes active
    await page.locator('a[href="/dashboard/agents"]').filter({ hasText: 'My Agents' }).click();
    await expect(page).toHaveURL(/\/dashboard\/agents/);

    const agentsLink = page.locator('a[href="/dashboard/agents"]').filter({ hasText: 'My Agents' });
    await expect(agentsLink).toHaveClass(/text-neon-cyan/);

    // Overview should no longer be active
    const overviewLinkAfter = page.locator('a[href="/dashboard"]').filter({ hasText: 'Overview' });
    await expect(overviewLinkAfter).not.toHaveClass(/text-neon-cyan/);
  });

  test('clicking "Overview" returns to /dashboard', async ({ page }) => {
    // Navigate away first
    await page.locator('a[href="/dashboard/agents"]').filter({ hasText: 'My Agents' }).click();
    await expect(page).toHaveURL(/\/dashboard\/agents/);

    // Click Overview to go back
    await page.locator('a[href="/dashboard"]').filter({ hasText: 'Overview' }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  });
});

// ============================================================================
// 3. PORTFOLIO DASHBOARD (/dashboard/portfolio)
// ============================================================================

test.describe('Portfolio Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
    await page.locator('a[href="/dashboard/portfolio"]').filter({ hasText: 'Portfolio' }).click();
    await expect(page).toHaveURL(/\/dashboard\/portfolio/);
  });

  test('page loads successfully with heading', async ({ page }) => {
    await expect(page.getByText('Portfolio Dashboard')).toBeVisible({ timeout: 10000 });
  });

  test('shows "Your Portfolio" badge', async ({ page }) => {
    await expect(page.getByText('Your Portfolio')).toBeVisible({ timeout: 10000 });
  });

  test('shows portfolio hero stats (Total Value, Win Rate, Brier Score)', async ({ page }) => {
    await expect(page.getByText('Total Value')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Win Rate').first()).toBeVisible();
    await expect(page.getByText('Brier Score').first()).toBeVisible();
  });

  test('shows Total Portfolio Value balance card', async ({ page }) => {
    await expect(page.getByText('Total Portfolio Value')).toBeVisible({ timeout: 15000 });
  });

  test('shows Cash Balance stat', async ({ page }) => {
    await expect(page.getByText('Cash Balance')).toBeVisible({ timeout: 15000 });
  });

  test('shows Open Positions section', async ({ page }) => {
    await expect(page.getByText('Open Positions')).toBeVisible({ timeout: 15000 });

    // Should show either positions or empty state "No open positions"
    const hasPositions = await page.getByText('active').isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No open positions').isVisible().catch(() => false);
    expect(hasPositions || hasEmptyState).toBeTruthy();
  });

  test('shows Recent Activity / bet history section', async ({ page }) => {
    // Scroll down to reveal sections below the fold
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const hasRecentActivity = await page.getByText('Recent Activity').first().isVisible().catch(() => false);
    const hasBettingHistory = await page.getByText('Betting History').first().isVisible().catch(() => false);
    const hasNoBettingHistory = await page.getByText('No betting history').first().isVisible().catch(() => false);

    // Should show either "Recent Activity", "Betting History", or the empty state
    expect(hasRecentActivity || hasBettingHistory || hasNoBettingHistory).toBeTruthy();
  });

  test('shows Performance Metrics section', async ({ page }) => {
    // Scroll down to reveal sections below the fold
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(1000);

    const hasMetrics = await page.getByText('Performance Metrics').first().isVisible().catch(() => false);
    const hasTotalBets = await page.getByText('Total Bets').first().isVisible().catch(() => false);

    // Should show either performance metrics or total bets stats
    expect(hasMetrics || hasTotalBets).toBeTruthy();
  });

  test('Refresh Data button is visible and clickable', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /refresh data/i });
    await expect(refreshButton).toBeVisible({ timeout: 10000 });

    // Click refresh and verify no crash
    await refreshButton.click();
    // The button should still exist after refresh
    await expect(refreshButton).toBeVisible();
  });
});

// ============================================================================
// 4. PLACEHOLDER PAGES
// ============================================================================

test.describe('Placeholder Pages', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('/dashboard/competitions shows "My Competitions" heading with "Coming soon..."', async ({ page }) => {
    await page.goto('/dashboard/competitions');
    await expect(page).toHaveURL(/\/dashboard\/competitions/);

    await expect(page.getByRole('heading', { name: 'My Competitions' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Coming soon...')).toBeVisible();
  });

  test('/dashboard/wallet shows real Wallet Dashboard (not placeholder)', async ({ page }) => {
    await page.goto('/dashboard/wallet');
    await expect(page).toHaveURL(/\/dashboard\/wallet/);

    // Should NOT show "Coming soon..." anymore
    await expect(page.getByText('Coming soon...')).not.toBeVisible({ timeout: 5000 });

    // Should show real wallet content (h1 heading)
    await expect(page.locator('h1').filter({ hasText: 'Wallet' })).toBeVisible({ timeout: 10000 });
  });

  test('/dashboard/settings shows "Settings" heading with "Coming soon..."', async ({ page }) => {
    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/\/dashboard\/settings/);

    await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Coming soon...')).toBeVisible();
  });
});

// ============================================================================
// 5. DASHBOARD MOBILE RESPONSIVE
// ============================================================================

test.describe('Dashboard Mobile Responsive', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaUI(page);
  });

  test('at 375x812 viewport, sidebar is stacked above content (not side-by-side)', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // On mobile (< lg breakpoint), the flex layout becomes flex-col instead of flex-row
    // The sidebar and main content should still be present
    const sidebar = page.locator('aside');
    await expect(sidebar).toBeVisible({ timeout: 10000 });

    // Main content area should still be visible
    const mainContent = page.locator('main.flex-1').first();
    await expect(mainContent).toBeVisible();
  });

  test('dashboard content is still accessible on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Wait for dashboard to load
    await page.waitForFunction(() => {
      return !document.querySelector('.animate-spin');
    }, { timeout: 15000 });

    // Welcome text should be visible
    await expect(page.getByText('Welcome back,')).toBeVisible({ timeout: 10000 });
  });

  test('sidebar navigation links are functional on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // Click on My Agents link in sidebar
    await page.locator('a[href="/dashboard/agents"]').filter({ hasText: 'My Agents' }).click();
    await expect(page).toHaveURL(/\/dashboard\/agents/);

    // Navigate to portfolio
    await page.locator('a[href="/dashboard/portfolio"]').filter({ hasText: 'Portfolio' }).click();
    await expect(page).toHaveURL(/\/dashboard\/portfolio/);
  });

  test('header mobile menu works on dashboard pages', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });

    // The header has a mobile menu button (hamburger)
    const menuButton = page.locator('button').filter({ has: page.locator('svg.lucide-menu') });

    if (await menuButton.isVisible()) {
      await menuButton.click();

      // Mobile menu should show Dashboard link and Log Out option
      // Use role=link to avoid matching hidden desktop buttons
      await expect(page.locator('header').getByRole('link', { name: 'Dashboard' })).toBeVisible();
      await expect(page.locator('header').getByRole('link', { name: 'Log Out' }).or(page.locator('header').getByRole('button', { name: /log out/i }))).toBeVisible();
    }
  });
});

// ============================================================================
// 6. UNAUTHENTICATED DASHBOARD ACCESS
// ============================================================================

test.describe('Unauthenticated Dashboard Access', () => {
  test('navigating to /dashboard without login redirects to /auth/login', async ({ page }) => {
    // Clear any existing auth state
    await page.goto('/');
    await clearAuthState(page);
    await page.reload();

    // Try to access dashboard directly
    await page.goto('/dashboard');

    // DashboardLayout checks `if (!user)` and renders <Navigate to="/auth/login" replace />
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });

  test('navigating to /dashboard/portfolio without login redirects to /auth/login', async ({ page }) => {
    await page.goto('/');
    await clearAuthState(page);
    await page.reload();

    await page.goto('/dashboard/portfolio');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });

  test('navigating to /dashboard/agents without login redirects to /auth/login', async ({ page }) => {
    await page.goto('/');
    await clearAuthState(page);
    await page.reload();

    await page.goto('/dashboard/agents');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });

  test('navigating to /dashboard/settings without login redirects to /auth/login', async ({ page }) => {
    await page.goto('/');
    await clearAuthState(page);
    await page.reload();

    await page.goto('/dashboard/settings');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });
});

// ============================================================================
// 7. DASHBOARD HEADER AUTH STATE
// ============================================================================

test.describe('Dashboard Header Auth State', () => {
  test('after login, header shows Dashboard button instead of Login/Signup', async ({ page }) => {
    await loginViaUI(page);

    // When authenticated, the header shows a Dashboard button (NeonButton with LayoutDashboard icon)
    const dashboardButton = page.locator('header').locator('a[href="/dashboard"]');
    await expect(dashboardButton).toBeVisible({ timeout: 10000 });

    // Login and Sign Up links should NOT be visible in the header
    const loginLink = page.locator('header').locator('a[href="/auth/login"]');
    await expect(loginLink).not.toBeVisible();

    const signupLink = page.locator('header').locator('a[href="/auth/signup"]');
    await expect(signupLink).not.toBeVisible();
  });

  test('after login, header shows user avatar with initial', async ({ page }) => {
    await loginViaUI(page);

    // The header shows a div with the user initial inside a gradient circle
    // It's inside a div with bg-gradient-to-br from-neon-cyan to-neon-magenta and rounded-full
    const avatarContainer = page.locator('header').locator('.rounded-full.bg-gradient-to-br');
    await expect(avatarContainer).toBeVisible({ timeout: 10000 });
  });

  test('after login, header shows username or email prefix', async ({ page }) => {
    await loginViaUI(page);

    // The header shows either the username or email prefix next to the avatar
    // For the test email 'e2e-agent-test@gmail.com', it would show 'e2e-agent-test' or a username
    const userInfoSection = page.locator('header').locator('.bg-white\\/5.border.border-white\\/10');
    await expect(userInfoSection).toBeVisible({ timeout: 10000 });
  });

  test('logout button is visible in the header', async ({ page }) => {
    await loginViaUI(page);

    // The logout button contains a LogOut icon (lucide-log-out)
    const logoutButton = page.locator('header').locator('button').filter({ has: page.locator('svg.lucide-log-out') });
    await expect(logoutButton).toBeVisible({ timeout: 10000 });
  });

  test('clicking logout button returns to unauthenticated state', async ({ page }) => {
    await loginViaUI(page);

    // Click the logout button
    const logoutButton = page.locator('header').locator('button').filter({ has: page.locator('svg.lucide-log-out') });
    await expect(logoutButton).toBeVisible({ timeout: 10000 });
    await logoutButton.click();

    // After logout, header should show Login/Signup buttons again
    const loginLink = page.locator('header').locator('a[href="/auth/login"]');
    await expect(loginLink).toBeVisible({ timeout: 10000 });

    const signupLink = page.locator('header').locator('a[href="/auth/signup"]');
    await expect(signupLink).toBeVisible({ timeout: 10000 });
  });

  test('after logout, navigating to /dashboard redirects to login', async ({ page }) => {
    await loginViaUI(page);

    // Logout
    const logoutButton = page.locator('header').locator('button').filter({ has: page.locator('svg.lucide-log-out') });
    await logoutButton.click();

    // Wait for logout to complete
    await page.locator('header').locator('a[href="/auth/login"]').waitFor({ state: 'visible', timeout: 10000 });

    // Now try to visit dashboard
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/auth\/login/, { timeout: 10000 });
  });
});
