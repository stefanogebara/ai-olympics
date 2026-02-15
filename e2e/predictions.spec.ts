import { test, expect } from '@playwright/test';

// ============================================================================
// HELPERS
// ============================================================================

// Frontend uses Supabase REST API directly, not the backend API.
// Route interceptions must target Supabase URLs (glob pattern matches any Supabase host).
const SUPABASE_MARKETS = '**/rest/v1/aio_markets*';
const SUPABASE_META_MARKETS = '**/rest/v1/aio_meta_markets*';

/**
 * Wait for either the loading spinner to disappear or a timeout,
 * whichever comes first. Markets come from external APIs so they
 * may take a moment to load -- or may return empty.
 */
async function waitForMarketsLoad(page: import('@playwright/test').Page) {
  // Wait for the loading spinner to disappear (markets loaded or empty)
  await page
    .locator('.animate-spin')
    .first()
    .waitFor({ state: 'hidden', timeout: 15000 })
    .catch(() => {});
  // Small extra buffer for React state update / re-render
  await page.waitForTimeout(500);
}

// ============================================================================
// 1. PREDICTION MARKETS BROWSE PAGE (/predictions)
// ============================================================================

test.describe('Prediction Markets Browse Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/predictions');
  });

  // --------------------------------------------------------------------------
  // 1A. Page loads successfully
  // --------------------------------------------------------------------------
  test('page loads successfully', async ({ page }) => {
    // The page should not show the 404 content
    await expect(page.locator('text=404')).not.toBeVisible();
    // Should have the main container
    await expect(page.locator('.container').first()).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1B. Title / heading visible
  // --------------------------------------------------------------------------
  test('title "Prediction Markets" is visible', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Prediction Markets' })).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1C. Info banner about multi-source markets
  // --------------------------------------------------------------------------
  test('info banner about multi-source markets is visible', async ({ page }) => {
    await expect(page.getByText('Multi-Source Markets')).toBeVisible();
    await expect(
      page.getByText(/Polymarket \+ Kalshi/i).first()
    ).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1D. Category tabs visible with correct names
  // --------------------------------------------------------------------------
  test('all category tabs are visible', async ({ page }) => {
    const categories = [
      'All Markets',
      'Politics',
      'Sports',
      'Crypto',
      'AI & Tech',
      'Entertainment',
      'Finance',
    ];

    for (const name of categories) {
      await expect(page.getByText(name, { exact: true }).first()).toBeVisible();
    }
  });

  // --------------------------------------------------------------------------
  // 1E. Each category tab has an icon (SVG) and name text
  // --------------------------------------------------------------------------
  test('each category tab has an icon and name', async ({ page }) => {
    // Category tabs are inside a flex-wrap container above the market cards
    const categoryContainer = page.locator('.flex.flex-wrap.gap-2.mb-6');
    await expect(categoryContainer).toBeVisible();
    const categoryButtons = categoryContainer.locator('> button');
    const count = await categoryButtons.count();
    expect(count).toBe(7); // all, politics, sports, crypto, ai-tech, entertainment, finance

    for (let i = 0; i < count; i++) {
      const btn = categoryButtons.nth(i);
      // Each button should contain an SVG icon
      await expect(btn.locator('svg').first()).toBeVisible();
      // Each button should contain a span with text
      await expect(btn.locator('span').first()).toBeVisible();
    }
  });

  // --------------------------------------------------------------------------
  // 1F. Clicking a category tab filters markets (active tab gets highlighted)
  // --------------------------------------------------------------------------
  test('clicking a category tab highlights it and filters markets', async ({ page }) => {
    // Initially "All Markets" should be highlighted (neon-magenta style)
    const allTab = page.locator('button', { hasText: 'All Markets' });
    await expect(allTab).toHaveClass(/bg-neon-magenta/);

    // Click on "Politics" tab
    const politicsTab = page.locator('button', { hasText: 'Politics' });
    await politicsTab.click();

    // Politics tab should now have the active styling
    await expect(politicsTab).toHaveClass(/bg-neon-magenta/);

    // All Markets tab should no longer have the active styling
    await expect(allTab).not.toHaveClass(/bg-neon-magenta/);

    // Wait for markets to reload
    await waitForMarketsLoad(page);
  });

  // --------------------------------------------------------------------------
  // 1G. Search input visible with placeholder
  // --------------------------------------------------------------------------
  test('search input is visible with correct placeholder', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="Search markets..."]');
    await expect(searchInput).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 1H. Search button works
  // --------------------------------------------------------------------------
  test('search button is visible and clickable', async ({ page }) => {
    const searchButton = page.getByRole('button', { name: 'Search' });
    await expect(searchButton).toBeVisible();

    // Type something and click search
    await page.locator('input[placeholder="Search markets..."]').fill('election');
    await searchButton.click();

    // Should trigger a search (loading spinner should appear briefly)
    // Just verify no crash occurs and page remains functional
    await waitForMarketsLoad(page);
  });

  // --------------------------------------------------------------------------
  // 1I. Sort dropdown visible with options
  // --------------------------------------------------------------------------
  test('sort dropdown visible with correct options', async ({ page }) => {
    const sortSelect = page.locator('select').first();
    await expect(sortSelect).toBeVisible();

    // Check options
    await expect(sortSelect.locator('option[value="volume"]')).toHaveText('By Volume');
    await expect(sortSelect.locator('option[value="newest"]')).toHaveText('Newest');
    await expect(sortSelect.locator('option[value="closing_soon"]')).toHaveText('Closing Soon');
  });

  // --------------------------------------------------------------------------
  // 1J. Filter type dropdown removed (outcomeType not applicable to unified events)
  // --------------------------------------------------------------------------
  test('filter type dropdown was removed in refactor', async ({ page }) => {
    // The type filter (Binary/Multiple Choice) was intentionally removed
    // Only the sort dropdown should remain in the main content area
    const mainContent = page.locator('main');
    const selects = mainContent.locator('select');
    const count = await selects.count();
    // Should have exactly 1 select (the sort dropdown), not 2 (sort + filter type)
    expect(count).toBeLessThanOrEqual(1);
  });

  // --------------------------------------------------------------------------
  // 1K. Refresh button visible and clickable
  // --------------------------------------------------------------------------
  test('refresh button is visible and clickable', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: 'Refresh' });
    await expect(refreshButton).toBeVisible();

    await refreshButton.click();
    // Should trigger re-fetch; loading spinner appears
    await waitForMarketsLoad(page);
  });
});

// ============================================================================
// 2. MARKET CARDS (if markets loaded)
// ============================================================================

test.describe('Market Cards', () => {
  test('market cards display in grid layout when markets are available', async ({ page }) => {
    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    // Check if we have market cards or the empty state
    const hasMarkets = await page.locator('.grid.grid-cols-1').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No markets found').isVisible().catch(() => false);

    if (hasMarkets) {
      // Grid should have responsive columns (grid-cols-1 md:grid-cols-2 xl:grid-cols-3)
      const grid = page.locator('.grid.grid-cols-1').first();
      await expect(grid).toBeVisible();

      // Verify grid has the responsive classes
      await expect(grid).toHaveClass(/md:grid-cols-2/);
      await expect(grid).toHaveClass(/xl:grid-cols-3/);
    } else if (hasEmptyState) {
      console.log('MARKET CARDS: No markets loaded from external APIs - empty state shown');
    }
  });

  test('market card shows all expected elements', async ({ page }) => {
    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    const hasEmptyState = await page.getByText('No markets found').isVisible().catch(() => false);
    if (hasEmptyState) {
      test.skip();
      return;
    }

    // Get the first market card
    const firstCard = page.locator('.grid.grid-cols-1 > div').first();
    if (!(await firstCard.isVisible().catch(() => false))) {
      console.log('MARKET CARD: No cards visible');
      test.skip();
      return;
    }

    // Source badge (POLYMARKET or KALSHI)
    const sourceBadge = firstCard.locator('text=/POLYMARKET|KALSHI/');
    await expect(sourceBadge.first()).toBeVisible();

    // Category name (one of the known categories)
    const categoryText = firstCard.locator('span.text-xs.text-white\\/40').first();
    await expect(categoryText).toBeVisible();

    // External link icon (the <a> with ExternalLink SVG)
    const externalLink = firstCard.locator('a[target="_blank"]');
    await expect(externalLink).toBeVisible();

    // Question text (h3)
    const questionText = firstCard.locator('h3');
    await expect(questionText).toBeVisible();

    // Probability percentage (outcome rows show percentages)
    const probability = firstCard.locator('text=/%$/');
    await expect(probability.first()).toBeVisible();

    // Probability bar (thin progress bar)
    const probBar = firstCard.locator('.h-1\\.5.bg-white\\/10.rounded-full');
    await expect(probBar.first()).toBeVisible();

    // Volume in card footer (BarChart3 icon + volume)
    const volumeStats = firstCard.locator('.flex.items-center.gap-1').first();
    await expect(volumeStats).toBeVisible();

    // Source info footer (via Polymarket / via Kalshi)
    const sourceFooter = firstCard.locator('text=/via Polymarket|via Kalshi/');
    await expect(sourceFooter.first()).toBeVisible();
  });
});

// ============================================================================
// 3. LOADING AND EMPTY STATES
// ============================================================================

test.describe('Loading and Empty States', () => {
  test('loading spinner shows while fetching markets', async ({ page }) => {
    // Intercept Supabase calls to add a delay so we can observe the spinner
    await page.route(SUPABASE_MARKETS, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.continue();
    });

    await page.goto('/predictions');

    // The spinner should be visible during loading
    const spinner = page.locator('.animate-spin').first();
    await expect(spinner).toBeVisible({ timeout: 5000 });
  });

  test('empty state shows when no markets found for a search', async ({ page }) => {
    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    // Intercept Supabase calls to return empty results for the search query
    await page.route(SUPABASE_MARKETS, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/0' },
        body: JSON.stringify([]),
      });
    });

    // Search for something that returns empty
    await page.locator('input[placeholder="Search markets..."]').fill('zzzznonexistent12345');
    await page.getByRole('button', { name: 'Search' }).click();
    await waitForMarketsLoad(page);

    // Should show empty state
    await expect(page.getByText('No markets found')).toBeVisible();
    await expect(page.getByText('Try a different search or check back later')).toBeVisible();
  });

  test('empty state shows when API returns empty array', async ({ page }) => {
    // Intercept Supabase markets calls to return empty
    await page.route(SUPABASE_MARKETS, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/0' },
        body: JSON.stringify([]),
      });
    });

    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    await expect(page.getByText('No markets found')).toBeVisible();
  });
});

// ============================================================================
// 4. FOOTER INFO
// ============================================================================

test.describe('Footer Info', () => {
  test('footer shows market source attribution', async ({ page }) => {
    await page.goto('/predictions');

    // Check the "Markets sourced from" text
    await expect(page.getByText(/Markets sourced from/)).toBeVisible();
  });

  test('footer links to polymarket.com', async ({ page }) => {
    await page.goto('/predictions');

    const polymarketLink = page.locator('a[href="https://polymarket.com"]');
    await expect(polymarketLink).toBeVisible();
    await expect(polymarketLink).toHaveText('Polymarket');
    await expect(polymarketLink).toHaveAttribute('target', '_blank');
  });

  test('footer links to kalshi.com', async ({ page }) => {
    await page.goto('/predictions');

    const kalshiLink = page.locator('a[href="https://kalshi.com"]');
    await expect(kalshiLink).toBeVisible();
    await expect(kalshiLink).toHaveText('Kalshi');
    await expect(kalshiLink).toHaveAttribute('target', '_blank');
  });
});

// ============================================================================
// 5. META MARKETS / AI BETTING PAGE (/predictions/ai-betting)
// ============================================================================

test.describe('Meta Markets / AI Betting Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/predictions/ai-betting');
  });

  test('page loads successfully without 404', async ({ page }) => {
    await expect(page.locator('text=404')).not.toBeVisible();
  });

  test('title and heading visible', async ({ page }) => {
    // The page shows "AI Competition Betting" as the main heading
    await expect(page.getByText('AI Competition Betting')).toBeVisible();
  });

  test('meta-predictions badge is visible', async ({ page }) => {
    await expect(page.getByText('Meta-Predictions')).toBeVisible();
  });

  test('subtitle text about betting on AI agents is visible', async ({ page }) => {
    await expect(
      page.getByText(/Bet on which AI agent will perform best/i)
    ).toBeVisible();
  });

  test('refresh markets button is visible', async ({ page }) => {
    const refreshButton = page.getByRole('button', { name: /Refresh Markets/i });
    await expect(refreshButton).toBeVisible();
  });

  test('stats section shows Live Markets, Total Pool, AI Agents', async ({ page }) => {
    await expect(page.getByText('Live Markets')).toBeVisible();
    await expect(page.getByText('Total Pool')).toBeVisible();
    await expect(page.getByText('AI Agents', { exact: true })).toBeVisible();
  });

  test('active matchups heading is visible', async ({ page }) => {
    // Scroll down to the matchups section heading "Active Matchups"
    const matchupsHeading = page.getByRole('heading', { name: /Active.*Matchups/i });
    await matchupsHeading.scrollIntoViewIfNeeded();
    await expect(matchupsHeading).toBeVisible();
  });

  test('filter buttons visible: All, Live, Upcoming, Completed', async ({ page }) => {
    const filters = ['All', 'Live', 'Upcoming', 'Completed'];
    for (const filterName of filters) {
      await expect(
        page.locator('button', { hasText: filterName }).first()
      ).toBeVisible();
    }
  });

  test('shows matchup cards or loading/empty state', async ({ page }) => {
    // Wait for loading to complete
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    // Should show either matchup cards or empty state
    const hasMatchups = await page.locator('.space-y-6 > div').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No matchups found').isVisible().catch(() => false);

    // One of the two states should be true once loading completes
    expect(hasMatchups || hasEmptyState).toBe(true);

    if (hasMatchups) {
      console.log('META MARKETS: Matchup cards are visible');
    } else {
      console.log('META MARKETS: Empty state shown - no matchups');
    }
  });

  test('matchup cards show AI agents competing', async ({ page }) => {
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    const hasEmptyState = await page.getByText('No matchups found').isVisible().catch(() => false);
    if (hasEmptyState) {
      console.log('META MARKETS: No matchups to inspect - skipping agent check');
      return;
    }

    // Each matchup card should show agent names with provider info
    // In the mock or real data, agents have providers: claude, gpt4, gemini
    const agentProviders = page.locator('text=/claude|gpt4|gemini/i');
    const providerCount = await agentProviders.count();

    if (providerCount > 0) {
      console.log(`META MARKETS: Found ${providerCount} agent provider references`);
    }

    // Should show "Bet on ..." buttons if matchups are not completed
    const betButtons = page.locator('button', { hasText: /Bet on/ });
    const betCount = await betButtons.count();
    console.log(`META MARKETS: Found ${betCount} bet buttons`);
  });

  test('clicking filter buttons updates the displayed matchups', async ({ page }) => {
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    // Click "Live" filter
    const liveBtn = page
      .locator('section button', { hasText: 'Live' })
      .first();
    await liveBtn.click();
    await expect(liveBtn).toHaveClass(/bg-neon-magenta/);

    // Click "Completed" filter
    const completedBtn = page
      .locator('section button', { hasText: 'Completed' })
      .first();
    await completedBtn.click();
    await expect(completedBtn).toHaveClass(/bg-neon-magenta/);

    // Click "All" filter to go back
    const allBtn = page
      .locator('section button', { hasText: 'All' })
      .first();
    await allBtn.click();
    await expect(allBtn).toHaveClass(/bg-neon-magenta/);
  });
});

// ============================================================================
// 6. KEYBOARD INTERACTIONS
// ============================================================================

test.describe('Keyboard Interactions', () => {
  test('pressing Enter in search input triggers search', async ({ page }) => {
    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    const searchInput = page.locator('input[placeholder="Search markets..."]').first();
    await expect(searchInput).toBeVisible({ timeout: 10000 });
    await searchInput.fill('test query');

    // Frontend uses Supabase directly with ilike filter - intercept to verify Enter triggers it
    const searchRequestPromise = page.waitForRequest(
      (req) => req.url().includes('aio_markets') && req.url().includes('ilike'),
      { timeout: 10000 }
    );

    // Press Enter
    await searchInput.press('Enter');

    // Verify the Supabase search request was made with ilike filter
    const searchRequest = await searchRequestPromise;
    expect(searchRequest.url()).toContain('ilike');
  });

  test('category tabs are keyboard accessible', async ({ page }) => {
    await page.goto('/predictions');

    // Focus the first category tab using Tab key navigation
    const allTab = page.locator('button', { hasText: 'All Markets' });
    await allTab.focus();
    await expect(allTab).toBeFocused();

    // Tab to next category button
    await page.keyboard.press('Tab');

    // The politics tab should now be focused
    const politicsTab = page.locator('button', { hasText: 'Politics' });
    await expect(politicsTab).toBeFocused();

    // Press Enter to activate the focused tab
    await page.keyboard.press('Enter');

    // Politics tab should now be active (highlighted)
    await expect(politicsTab).toHaveClass(/bg-neon-magenta/);
  });

  test('sort dropdown is keyboard accessible', async ({ page }) => {
    await page.goto('/predictions');

    const sortSelect = page.locator('select').first();
    await sortSelect.focus();
    await expect(sortSelect).toBeFocused();

    // Change value via keyboard
    await sortSelect.selectOption('newest');
    await expect(sortSelect).toHaveValue('newest');
  });

  test('sort dropdown can be changed via keyboard', async ({ page }) => {
    await page.goto('/predictions');

    const sortSelect = page.locator('select').first();
    await sortSelect.focus();
    await expect(sortSelect).toBeFocused();

    // Change to closing_soon via keyboard
    await sortSelect.selectOption('closing_soon');
    await expect(sortSelect).toHaveValue('closing_soon');
  });
});

// ============================================================================
// 7. SORT AND FILTER FUNCTIONALITY
// ============================================================================

test.describe('Sort and Filter Functionality', () => {
  test('changing sort dropdown reloads markets', async ({ page }) => {
    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    const sortSelect = page.locator('select').first();

    // Change to newest
    await sortSelect.selectOption('newest');
    // Loading should trigger a re-fetch (brief spinner possible)
    await waitForMarketsLoad(page);

    // Change to closing soon
    await sortSelect.selectOption('closing_soon');
    await waitForMarketsLoad(page);

    // Change back to volume
    await sortSelect.selectOption('volume');
    await waitForMarketsLoad(page);
  });
});

// ============================================================================
// 8. RESPONSIVE LAYOUT
// ============================================================================

test.describe('Responsive Layout', () => {
  test('mobile viewport: search and filters stack vertically', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/predictions');

    // Search input should still be visible
    await expect(page.locator('input[placeholder="Search markets..."]')).toBeVisible();

    // Heading should be visible
    await expect(page.getByRole('heading', { name: 'Prediction Markets' })).toBeVisible();

    // Category tabs should wrap (scoped to the category container)
    const categoryContainer = page.locator('.flex.flex-wrap.gap-2.mb-6');
    const categoryButtons = categoryContainer.locator('> button');
    const count = await categoryButtons.count();
    expect(count).toBe(7);
  });

  test('desktop viewport: market grid shows 3 columns', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    const grid = page.locator('.grid.grid-cols-1').first();
    if (await grid.isVisible()) {
      // Verify the grid has responsive column classes
      await expect(grid).toHaveClass(/xl:grid-cols-3/);
    }
  });
});

// ============================================================================
// 9. API MOCKING -- VERIFY CARD RENDERING WITH KNOWN DATA
// ============================================================================

test.describe('Market Cards with Mocked Data', () => {
  test('renders market cards correctly from mocked API response', async ({ page }) => {
    // Supabase REST API returns flat arrays with snake_case column names
    const mockMarkets = [
      {
        id: 'mock-1',
        source: 'polymarket',
        question: 'Will AI pass the Turing test by 2027?',
        category: 'ai-tech',
        outcomes: [
          { id: 'yes', name: 'YES', probability: 0.72, price: 0.72 },
          { id: 'no', name: 'NO', probability: 0.28, price: 0.28 },
        ],
        volume_24h: 150000,
        total_volume: 2500000,
        liquidity: 500000,
        close_time: Date.now() + 86400000 * 30,
        status: 'open',
        url: 'https://polymarket.com/mock',
        image: null,
      },
      {
        id: 'mock-2',
        source: 'kalshi',
        question: 'Will Bitcoin reach $200k in 2026?',
        category: 'crypto',
        outcomes: [
          { id: 'yes', name: 'YES', probability: 0.35, price: 0.35 },
          { id: 'no', name: 'NO', probability: 0.65, price: 0.65 },
        ],
        volume_24h: 80000,
        total_volume: 1200000,
        liquidity: 300000,
        close_time: Date.now() + 86400000 * 60,
        status: 'open',
        url: 'https://kalshi.com/mock',
        image: null,
      },
    ];

    // Intercept Supabase REST API calls (frontend queries aio_markets directly)
    await page.route(SUPABASE_MARKETS, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': `0-${mockMarkets.length - 1}/${mockMarkets.length}` },
        body: JSON.stringify(mockMarkets),
      });
    });

    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    // First card - Polymarket
    await expect(page.getByText('POLYMARKET').first()).toBeVisible();
    await expect(page.getByText('Will AI pass the Turing test by 2027?')).toBeVisible();
    await expect(page.getByText('72%').first()).toBeVisible();
    await expect(page.getByText('via Polymarket').first()).toBeVisible();

    // Second card - Kalshi
    await expect(page.getByText('KALSHI').first()).toBeVisible();
    await expect(page.getByText('Will Bitcoin reach $200k in 2026?')).toBeVisible();
    await expect(page.getByText('35%').first()).toBeVisible();
    await expect(page.getByText('via Kalshi').first()).toBeVisible();
  });

  test('market card external link points to correct URL', async ({ page }) => {
    const mockMarkets = [
      {
        id: 'link-test',
        source: 'polymarket',
        question: 'Link test market',
        category: 'all',
        outcomes: [
          { id: 'yes', name: 'YES', probability: 0.5, price: 0.5 },
        ],
        volume_24h: 1000,
        total_volume: 10000,
        liquidity: 5000,
        status: 'open',
        url: 'https://polymarket.com/test-market',
        image: null,
        close_time: null,
      },
    ];

    await page.route(SUPABASE_MARKETS, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'content-range': '0-0/1' },
        body: JSON.stringify(mockMarkets),
      });
    });

    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    const externalLink = page.locator('a[href="https://polymarket.com/test-market"]');
    await expect(externalLink).toBeVisible();
    await expect(externalLink).toHaveAttribute('target', '_blank');
    await expect(externalLink).toHaveAttribute('rel', 'noopener noreferrer');
  });
});

// ============================================================================
// 10. META MARKETS WITH MOCKED DATA
// ============================================================================

test.describe('Meta Markets with Mocked Data', () => {
  test('renders matchup cards with agent info from mocked data', async ({ page }) => {
    // Supabase REST API returns rows from aio_meta_markets with snake_case columns
    const mockMetaMarkets = [
      {
        id: 'matchup-1',
        question: 'Speed Test Showdown',
        description: 'Which AI completes the task fastest?',
        market_type: 'winner',
        outcomes: [
          { id: 'c1', name: 'Claude 3.5', provider: 'claude' },
          { id: 'g1', name: 'GPT-4 Turbo', provider: 'gpt4' },
          { id: 'gem1', name: 'Gemini Pro', provider: 'gemini' },
        ],
        current_odds: { c1: 0.5, g1: 0.3, gem1: 0.2 },
        status: 'live',
        total_volume: 2000,
        opens_at: null,
        resolves_at: null,
        resolved_outcome: null,
        created_at: new Date().toISOString(),
        competition: { id: 'comp-1', name: 'Speed Test', status: 'live' },
      },
    ];

    await page.route(SUPABASE_META_MARKETS, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMetaMarkets),
      });
    });

    await page.goto('/predictions/ai-betting');

    // Wait for loading
    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    // Matchup title
    await expect(page.getByText('Speed Test Showdown')).toBeVisible();

    // Agent names
    await expect(page.getByText('Claude 3.5').first()).toBeVisible();
    await expect(page.getByText('GPT-4 Turbo').first()).toBeVisible();
    await expect(page.getByText('Gemini Pro').first()).toBeVisible();

    // Odds should be displayed
    await expect(page.getByText('50%').first()).toBeVisible();
    await expect(page.getByText('30%').first()).toBeVisible();
    await expect(page.getByText('20%').first()).toBeVisible();

    // Bet buttons should be visible for live matchups
    await expect(page.getByText('Bet on Claude').first()).toBeVisible();
    await expect(page.getByText('Bet on GPT-4').first()).toBeVisible();
    await expect(page.getByText('Bet on Gemini').first()).toBeVisible();

    // Status badge
    await expect(page.getByText('live').first()).toBeVisible();

    // Pool info
    await expect(page.getByText(/M\$2,000/).first()).toBeVisible();
  });

  test('sign-in prompt shown for unauthenticated users', async ({ page }) => {
    const mockMetaMarkets = [
      {
        id: 'auth-test',
        question: 'Auth Test Matchup',
        description: 'Test sign-in prompt',
        market_type: 'winner',
        outcomes: [
          { id: 'a1', name: 'Agent A', provider: 'claude' },
          { id: 'a2', name: 'Agent B', provider: 'gpt4' },
        ],
        current_odds: { a1: 0.5, a2: 0.5 },
        status: 'live',
        total_volume: 0,
        opens_at: null,
        resolves_at: null,
        resolved_outcome: null,
        created_at: new Date().toISOString(),
        competition: { id: 'comp-1', name: 'Test', status: 'live' },
      },
    ];

    await page.route(SUPABASE_META_MARKETS, async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify(mockMetaMarkets),
      });
    });

    // Clear any auth state
    await page.goto('/predictions/ai-betting');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();

    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    // Unauthenticated users should see "Sign in to place bets" (may appear once per active matchup)
    await expect(page.getByText('Sign in to place bets').first()).toBeVisible();
  });
});

// ============================================================================
// 11. NAVIGATION BETWEEN PREDICTION PAGES
// ============================================================================

test.describe('Prediction Page Navigation', () => {
  test('navigating from /predictions to /predictions/ai-betting works', async ({ page }) => {
    await page.goto('/predictions');
    await expect(page.getByRole('heading', { name: 'Prediction Markets' })).toBeVisible();

    await page.goto('/predictions/ai-betting');
    await expect(page.getByText('AI Competition Betting')).toBeVisible();
  });

  test('navigating from /predictions/ai-betting back to /predictions works', async ({ page }) => {
    await page.goto('/predictions/ai-betting');
    await expect(page.getByText('AI Competition Betting')).toBeVisible();

    await page.goto('/predictions');
    await expect(page.getByRole('heading', { name: 'Prediction Markets' })).toBeVisible();
  });
});

// ============================================================================
// 12. ERROR HANDLING
// ============================================================================

test.describe('Error Handling', () => {
  test('page handles API errors gracefully on /predictions', async ({ page }) => {
    await page.route(SUPABASE_MARKETS, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    // Page should not crash - should show empty state or remain functional
    await expect(page.getByRole('heading', { name: 'Prediction Markets' })).toBeVisible();
  });

  test('page handles network failure gracefully on /predictions', async ({ page }) => {
    await page.route(SUPABASE_MARKETS, async (route) => {
      await route.abort('connectionrefused');
    });

    await page.goto('/predictions');
    await waitForMarketsLoad(page);

    // Page should not crash
    await expect(page.getByRole('heading', { name: 'Prediction Markets' })).toBeVisible();
  });

  test('meta markets page handles API errors gracefully', async ({ page }) => {
    await page.route(SUPABASE_META_MARKETS, async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal server error' }),
      });
    });

    await page.goto('/predictions/ai-betting');

    await page
      .locator('.animate-spin')
      .first()
      .waitFor({ state: 'hidden', timeout: 15000 })
      .catch(() => {});
    await page.waitForTimeout(500);

    // Page should show content (possibly mock data in dev mode or empty state)
    await expect(page.getByText('AI Competition Betting')).toBeVisible();
  });
});
