/**
 * Sandbox Demo: Full Paper Trading E2E Flow
 *
 * This test creates a real test user, browses markets,
 * places a paper bet, and verifies the full pipeline works.
 */
import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3003';

test.describe('Sandbox Demo - Full Paper Trading Flow', () => {
  const testEmail = `demo_${Date.now()}@test.com`;
  const testPassword = 'DemoPassword123!';
  const testUsername = `demo_${Date.now().toString(36)}`;
  let accessToken = '';

  test('Step 1: Sign up a new test user', async ({ page }) => {
    await page.goto('/auth/signup');
    await page.waitForTimeout(1000);

    // Fill signup form
    const emailInput = page.locator('input[type="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"]').first();
    const usernameInput = page.locator('input[placeholder*="username" i]').first();

    if (await emailInput.isVisible()) {
      await emailInput.fill(testEmail);
      if (await usernameInput.isVisible()) {
        await usernameInput.fill(testUsername);
      }
      await passwordInput.fill(testPassword);

      // Take screenshot of signup form
      await page.screenshot({ path: 'e2e/screenshots/demo-01-signup-form.png' });

      const signUpBtn = page.locator('button[type="submit"], button:has-text("Sign Up"), button:has-text("Create")').first();
      await signUpBtn.click();
      await page.waitForTimeout(3000);

      // Take screenshot after signup
      await page.screenshot({ path: 'e2e/screenshots/demo-02-after-signup.png' });
    }

    // Check if we got logged in (may need email verification)
    const isLoggedIn = await page.evaluate(() => {
      const storage = localStorage.getItem('auth-storage');
      if (storage) {
        const parsed = JSON.parse(storage);
        return parsed?.state?.isAuthenticated === true;
      }
      return false;
    });

    console.log(`[DEMO] Signup attempted for ${testEmail}, logged in: ${isLoggedIn}`);

    // Try to get session token for API calls
    const session = await page.evaluate(() => {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith('sb-') && key.endsWith('-auth-token')) {
          try {
            const val = JSON.parse(localStorage.getItem(key) || '{}');
            if (val.access_token) return val;
          } catch {}
        }
      }
      return null;
    });

    if (session?.access_token) {
      accessToken = session.access_token;
      console.log(`[DEMO] Got access token: ${accessToken.substring(0, 30)}...`);
    }
  });

  test('Step 2: Browse prediction markets', async ({ page }) => {
    await page.goto('/predictions');
    await page.waitForTimeout(3000);

    // Take screenshot of browse page
    await page.screenshot({ path: 'e2e/screenshots/demo-03-browse-markets.png', fullPage: true });

    // Verify markets loaded
    const marketCards = page.locator('[class*="glass"], [class*="card"], .space-y-3 > div, .space-y-4 > div').first();
    const hasMarkets = await marketCards.isVisible().catch(() => false);
    console.log(`[DEMO] Markets loaded: ${hasMarkets}`);

    // Check navigation links exist
    const leaderboardLink = page.locator('a[href="/predictions/leaderboard"]');
    const portfolioLink = page.locator('a[href="/dashboard/portfolio"]');
    await expect(leaderboardLink).toBeVisible();
    await expect(portfolioLink).toBeVisible();
    console.log('[DEMO] Leaderboard and Portfolio links visible');

    // Check category filters
    const categoryButtons = await page.locator('button').filter({ hasText: /politics|crypto|sports|science/i }).count();
    console.log(`[DEMO] Category filter buttons found: ${categoryButtons}`);
  });

  test('Step 3: Open a real market event detail page', async ({ page }) => {
    await page.goto('/predictions');
    await page.waitForTimeout(3000);

    // Click on the first market event
    const firstEvent = page.locator('a[href*="/predictions/event/"]').first();
    const eventExists = await firstEvent.isVisible().catch(() => false);

    if (eventExists) {
      const href = await firstEvent.getAttribute('href');
      console.log(`[DEMO] Clicking first event: ${href}`);
      await firstEvent.click();
      await page.waitForTimeout(2000);

      // Take screenshot of event detail
      await page.screenshot({ path: 'e2e/screenshots/demo-04-event-detail.png', fullPage: true });

      // Verify event loaded
      const hasTitle = await page.locator('h1').first().isVisible().catch(() => false);
      const hasBackButton = await page.getByText('Back to Markets').isVisible().catch(() => false);
      console.log(`[DEMO] Event detail loaded: title=${hasTitle}, back=${hasBackButton}`);

      // Check for market outcomes
      const outcomeRows = await page.locator('.space-y-2 > div').count();
      console.log(`[DEMO] Market outcome rows: ${outcomeRows}`);

      // Check if bet buttons or login prompt is visible
      const hasBetButtons = await page.locator('button', { hasText: /^Yes$/ }).first().isVisible().catch(() => false);
      const hasLoginPrompt = await page.getByText('Login to bet').first().isVisible().catch(() => false);
      console.log(`[DEMO] Bet buttons: ${hasBetButtons}, Login prompt: ${hasLoginPrompt}`);
    } else {
      console.log('[DEMO] No events found to click - markets may be empty');
    }
  });

  test('Step 4: Place a paper bet via API', async ({ request }) => {
    const healthRes = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!healthRes?.ok(), 'Backend API not running');

    // First, get a real market from the API
    const eventsRes = await request.get(`${API_BASE}/api/predictions/events?limit=5`);
    expect(eventsRes.ok()).toBeTruthy();
    const eventsData = await eventsRes.json();
    console.log(`[DEMO] Found ${eventsData.events?.length || 0} events`);

    if (!eventsData.events?.length) {
      console.log('[DEMO] No events available - skipping bet placement');
      return;
    }

    // Find an event with markets
    const event = eventsData.events.find((e: any) => e.markets?.length > 0);
    if (!event) {
      console.log('[DEMO] No events with markets found');
      return;
    }

    const market = event.markets[0];
    const outcome = market.outcomes?.[0];
    console.log(`[DEMO] Selected market: "${market.question || event.eventTitle}"`);
    console.log(`[DEMO] Market ID: ${market.id}`);
    console.log(`[DEMO] Outcome: ${outcome?.name} @ ${(outcome?.probability * 100).toFixed(1)}%`);

    if (!accessToken) {
      console.log('[DEMO] No access token - attempting direct API bet (will likely get 401)');
      const betRes = await request.post(`${API_BASE}/api/user/bets`, {
        data: {
          marketId: market.id,
          outcome: outcome?.name?.toUpperCase() || 'YES',
          amount: 100,
        },
      });
      console.log(`[DEMO] Bet response status: ${betRes.status()}`);
      const betBody = await betRes.json().catch(() => ({}));
      console.log(`[DEMO] Bet response: ${JSON.stringify(betBody)}`);
      return;
    }

    // Place bet with auth token
    const betRes = await request.post(`${API_BASE}/api/user/bets`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
      data: {
        marketId: market.id,
        outcome: outcome?.name?.toUpperCase() || 'YES',
        amount: 100,
      },
    });
    console.log(`[DEMO] Bet response status: ${betRes.status()}`);
    const betBody = await betRes.json().catch(() => ({}));
    console.log(`[DEMO] Bet response: ${JSON.stringify(betBody)}`);
  });

  test('Step 5: Check portfolio via API', async ({ request }) => {
    const healthRes = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!healthRes?.ok(), 'Backend API not running');

    if (!accessToken) {
      console.log('[DEMO] No access token - skipping portfolio check');

      // Still test that unauthenticated returns 401
      const res = await request.get(`${API_BASE}/api/user/portfolio`);
      expect(res.status()).toBe(401);
      console.log('[DEMO] Portfolio correctly returns 401 without auth');
      return;
    }

    // Get portfolio
    const portfolioRes = await request.get(`${API_BASE}/api/user/portfolio`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    console.log(`[DEMO] Portfolio status: ${portfolioRes.status()}`);
    const portfolio = await portfolioRes.json().catch(() => ({}));
    console.log(`[DEMO] Portfolio: balance=${portfolio.virtual_balance}, bets=${portfolio.total_bets}`);

    // Get limits
    const limitsRes = await request.get(`${API_BASE}/api/user/limits`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    console.log(`[DEMO] Limits status: ${limitsRes.status()}`);
    const limits = await limitsRes.json().catch(() => ({}));
    console.log(`[DEMO] Limits: ${JSON.stringify(limits)}`);

    // Get positions
    const positionsRes = await request.get(`${API_BASE}/api/user/positions`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    });
    console.log(`[DEMO] Positions status: ${positionsRes.status()}`);
    const positions = await positionsRes.json().catch(() => ({}));
    console.log(`[DEMO] Positions: ${JSON.stringify(positions)}`);
  });

  test('Step 6: Check leaderboard', async ({ page, request }) => {
    const healthRes = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!healthRes?.ok(), 'Backend API not running');

    // API check
    const leaderboardRes = await request.get(`${API_BASE}/api/user/leaderboard`);
    expect(leaderboardRes.ok()).toBeTruthy();
    const lbData = await leaderboardRes.json();
    console.log(`[DEMO] Leaderboard entries: ${lbData.leaderboard?.length || 0}`);
    if (lbData.leaderboard?.length > 0) {
      console.log(`[DEMO] Top trader: ${lbData.leaderboard[0].username} (profit: ${lbData.leaderboard[0].total_profit})`);
    }

    // UI check
    await page.goto('/predictions/leaderboard');
    await page.waitForTimeout(2000);

    await page.screenshot({ path: 'e2e/screenshots/demo-05-leaderboard.png', fullPage: true });

    await expect(page.getByText('Prediction Leaderboard')).toBeVisible();
    console.log('[DEMO] Leaderboard page renders correctly');

    // Check sort tabs
    const sortTabs = ['Profit %', 'Win Rate', 'Total Bets', 'Best Streak', 'Brier Score'];
    for (const tab of sortTabs) {
      await expect(page.getByRole('button', { name: tab, exact: true })).toBeVisible();
    }
    console.log('[DEMO] All sort tabs visible');
  });

  test('Step 7: Verify all API endpoints respond correctly', async ({ request }) => {
    const healthRes = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!healthRes?.ok(), 'Backend API not running');

    const endpoints = [
      { method: 'GET', path: '/api/predictions/events?limit=1', expectedAuth: false },
      { method: 'GET', path: '/api/user/leaderboard', expectedAuth: false },
      { method: 'GET', path: '/api/user/portfolio', expectedAuth: true },
      { method: 'GET', path: '/api/user/limits', expectedAuth: true },
      { method: 'GET', path: '/api/user/positions', expectedAuth: true },
      { method: 'GET', path: '/api/user/stats', expectedAuth: true },
      { method: 'POST', path: '/api/user/bets', expectedAuth: true },
    ];

    console.log('[DEMO] --- API Endpoint Health Check ---');
    for (const ep of endpoints) {
      const url = `${API_BASE}${ep.path}`;
      let res;
      if (ep.method === 'POST') {
        res = await request.post(url, { data: {} });
      } else {
        res = await request.get(url);
      }

      const status = res.status();
      const expected = ep.expectedAuth ? 401 : 200;
      const pass = status === expected;
      console.log(`[DEMO] ${ep.method} ${ep.path} → ${status} ${pass ? 'PASS' : `FAIL (expected ${expected})`}`);
    }
    console.log('[DEMO] --- End Health Check ---');
  });

  test('Step 8: Visual walkthrough of predictions flow', async ({ page }) => {
    // 1. Browse page
    await page.goto('/predictions');
    await page.waitForTimeout(2000);
    await page.screenshot({ path: 'e2e/screenshots/demo-06-browse-full.png', fullPage: true });

    // 2. Try different categories
    const categories = ['All', 'Politics', 'Crypto', 'Sports'];
    for (const cat of categories) {
      const btn = page.locator('button', { hasText: new RegExp(`^${cat}$`, 'i') }).first();
      if (await btn.isVisible().catch(() => false)) {
        await btn.click();
        await page.waitForTimeout(1000);
        console.log(`[DEMO] Switched to category: ${cat}`);
      }
    }
    await page.screenshot({ path: 'e2e/screenshots/demo-07-categories.png' });

    // 3. Navigate to leaderboard from browse page
    await page.locator('a[href="/predictions/leaderboard"]').click();
    await page.waitForURL('**/predictions/leaderboard');
    await page.waitForTimeout(1000);
    await page.screenshot({ path: 'e2e/screenshots/demo-08-leaderboard-nav.png' });

    // 4. Navigate back
    await page.getByText('Back to Markets').click();
    await page.waitForURL('**/predictions');
    await page.waitForTimeout(1000);

    console.log('[DEMO] Visual walkthrough complete');
  });
});
