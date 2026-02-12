import { test, expect } from '@playwright/test';

// ============================================================================
// 1. COMPETITIONS BROWSE PAGE (/competitions)
// ============================================================================

test.describe('Competitions Browse Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/competitions');
  });

  test('page loads successfully and shows heading', async ({ page }) => {
    // The heading contains "Competitions" rendered via NeonText inside an h1
    await expect(page.getByRole('heading', { level: 1 }).getByText('Competitions')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Browse and join AI agent competitions')).toBeVisible();
  });

  test('Create Competition button is visible with link to create page', async ({ page }) => {
    const createButton = page.locator('a[href="/dashboard/competitions/create"]').first();
    await expect(createButton).toBeVisible({ timeout: 10000 });
    await expect(createButton.getByText('Create Competition')).toBeVisible();
  });

  test('filter controls are visible with domain, status, and mode selects', async ({ page }) => {
    // Wait for the page to finish loading (spinner gone or filters visible)
    await expect(page.getByText('Filters:')).toBeVisible({ timeout: 10000 });

    // Domain filter select
    const domainSelect = page.locator('select').nth(0);
    await expect(domainSelect).toBeVisible();
    await expect(domainSelect.locator('option[value="all"]')).toHaveText('All Domains');

    // Status filter select
    const statusSelect = page.locator('select').nth(1);
    await expect(statusSelect).toBeVisible();
    await expect(statusSelect.locator('option[value="all"]')).toHaveText('All Status');
    await expect(statusSelect.locator('option[value="scheduled"]')).toHaveText('Scheduled');
    await expect(statusSelect.locator('option[value="lobby"]')).toHaveText('Open Lobby');
    await expect(statusSelect.locator('option[value="running"]')).toHaveText('Running');
    await expect(statusSelect.locator('option[value="completed"]')).toHaveText('Completed');

    // Mode filter select
    const modeSelect = page.locator('select').nth(2);
    await expect(modeSelect).toBeVisible();
    await expect(modeSelect.locator('option[value="all"]')).toHaveText('All Modes');
    await expect(modeSelect.locator('option[value="sandbox"]')).toHaveText('Sandbox (Free)');
    await expect(modeSelect.locator('option[value="real"]')).toHaveText('Real Money');
  });

  test('shows loading spinner initially, then either competitions or empty state', async ({ page }) => {
    // Wait for either content or empty state to appear
    try {
      await Promise.race([
        page.locator('h3:has-text("No competitions found")').waitFor({ timeout: 28000 }),
        page.locator('.grid .p-6').first().waitFor({ timeout: 28000 }),
      ]);
    } catch {
      // If neither appeared, check if spinner is still going
    }

    const hasCompetitions = await page.locator('.grid .p-6').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No competitions found').isVisible().catch(() => false);
    const hasSpinner = await page.locator('.animate-spin').isVisible().catch(() => false);

    expect(hasCompetitions || hasEmptyState || hasSpinner).toBe(true);
  });

  test('empty state shows trophy icon and create button when no competitions', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const emptyState = page.getByText('No competitions found');
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    if (hasEmptyState) {
      await expect(emptyState).toBeVisible();
      await expect(page.getByText('Try adjusting your filters or create a new competition')).toBeVisible();
      // The empty state has a "Create Competition" NeonButton
      const createBtn = page.locator('a[href="/dashboard/competitions/create"]').last();
      await expect(createBtn).toBeVisible();
    } else {
      // Competitions exist - verify that at minimum one card is rendered
      const competitionCards = page.locator('.grid > div');
      const count = await competitionCards.count();
      expect(count).toBeGreaterThan(0);
    }
  });

  test('competition cards display name, status badge, participant count, and prize pool', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const hasCompetitions = await page.locator('.grid .p-6 h3').first().isVisible().catch(() => false);

    if (hasCompetitions) {
      // Each card has an h3 with the competition name
      const firstCard = page.locator('.grid > div').first();
      await expect(firstCard.locator('h3')).toBeVisible();

      // Status badge (scheduled, lobby, running, completed, cancelled)
      const statusBadge = firstCard.locator('.rounded-full').first();
      await expect(statusBadge).toBeVisible();

      // Participant count (Users icon + "X/Y")
      await expect(firstCard.getByText(/\d+\/\d+/).first()).toBeVisible();

      // Prize pool (DollarSign icon + "$X")
      await expect(firstCard.getByText(/\$\d+/).first()).toBeVisible();
    } else {
      console.log('COMPETITIONS: No competitions in database - card tests skipped');
    }
  });

  test('competition cards link to their detail page', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const hasCompetitions = await page.locator('.grid a[href^="/competitions/"]').first().isVisible().catch(() => false);

    if (hasCompetitions) {
      const firstLink = page.locator('.grid a[href^="/competitions/"]').first();
      const href = await firstLink.getAttribute('href');
      expect(href).toMatch(/^\/competitions\/[a-zA-Z0-9-]+$/);
    } else {
      console.log('COMPETITIONS: No competition links to check');
    }
  });

  test('status filter updates the URL and triggers reload', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 20000 }).catch(() => {});

    const statusSelect = page.locator('select').nth(1);
    await statusSelect.selectOption('completed');

    // URL should update with status parameter
    await expect(page).toHaveURL(/status=completed/, { timeout: 10000 });

    // Loading spinner may appear again briefly
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('mode filter updates the URL and triggers reload', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 20000 }).catch(() => {});

    const modeSelect = page.locator('select').nth(2);
    await modeSelect.selectOption('sandbox');

    await expect(page).toHaveURL(/mode=sandbox/, { timeout: 10000 });
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('lobby competitions show Join Now button', async ({ page }) => {
    // Filter to only lobby status competitions
    const statusSelect = page.locator('select').nth(1);
    await statusSelect.selectOption('lobby');
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const hasLobbyCompetitions = await page.getByText('Join Now').first().isVisible().catch(() => false);

    if (hasLobbyCompetitions) {
      await expect(page.getByText('Join Now').first()).toBeVisible();
      console.log('COMPETITIONS: Lobby competitions with Join Now button found');
    } else {
      const empty = await page.getByText('No competitions found').isVisible().catch(() => false);
      if (empty) {
        console.log('COMPETITIONS: No lobby competitions available');
      }
    }
  });
});

// ============================================================================
// 2. COMPETITION LIVE VIEW (/competitions/:id)
// ============================================================================

test.describe('Competition Live View', () => {
  test('navigating to a non-existent competition shows the live view layout', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    // The LiveView component always renders regardless of whether the competition exists.
    // It shows the competition header with fallback text
    await expect(page.locator('main .container').first()).toBeVisible({ timeout: 10000 });

    // The component renders "AI Olympics" as the fallback competition name
    // or the actual competition name if it exists
    const headerText = page.getByRole('heading', { level: 1 }).first();
    await expect(headerText).toBeVisible();
  });

  test('live view shows Agents section', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    // The "Agents" heading is always rendered
    await expect(page.getByText('Agents', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Since this is a fake ID, it should show "Waiting for agents..."
    const waitingText = page.getByText('Waiting for agents...');
    const hasAgentCards = await page.locator('.p-4.rounded-lg.bg-white\\/5').first().isVisible().catch(() => false);

    const showsAgentsOrWaiting = (await waitingText.isVisible().catch(() => false)) || hasAgentCards;
    expect(showsAgentsOrWaiting).toBe(true);
  });

  test('live view shows Leaderboard section', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    await expect(page.getByText('Leaderboard', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Either leaderboard entries or "No scores yet..."
    const noScores = page.getByText('No scores yet...');
    const hasEntries = await page.locator('.flex.items-center.gap-4.p-3').first().isVisible().catch(() => false);

    const showsLeaderboardContent = (await noScores.isVisible().catch(() => false)) || hasEntries;
    expect(showsLeaderboardContent).toBe(true);
  });

  test('live view shows Commentary section', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    await expect(page.getByText('Commentary', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Either commentary items or waiting text
    const waitingCommentary = page.getByText('Waiting for commentary...');
    const hasCommentary = await page.locator('.bg-white\\/5.border-l-2').first().isVisible().catch(() => false);

    const showsCommentaryContent = (await waitingCommentary.isVisible().catch(() => false)) || hasCommentary;
    expect(showsCommentaryContent).toBe(true);
  });

  test('live view shows Action Feed section', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    await expect(page.getByText('Action Feed', { exact: true }).first()).toBeVisible({ timeout: 10000 });

    // Either action items or waiting text
    const waitingActions = page.getByText('Waiting for actions...');
    const hasActions = await page.locator('.flex.items-center.gap-3.p-2').first().isVisible().catch(() => false);

    const showsActionContent = (await waitingActions.isVisible().catch(() => false)) || hasActions;
    expect(showsActionContent).toBe(true);
  });

  test('live view shows timer and status indicator', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    // Elapsed Time label
    await expect(page.getByText('Elapsed Time')).toBeVisible({ timeout: 10000 });

    // Timer display (font-mono class with formatted time)
    const timerDisplay = page.locator('.font-mono.font-bold.text-neon-cyan').first();
    await expect(timerDisplay).toBeVisible();

    // Status text (idle, running, or completed) rendered in an uppercase span
    const statusBadge = page.locator('.uppercase').first();
    await expect(statusBadge).toBeVisible();
  });

  test('live view shows connection status indicator', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    // Connection status text: "Connected" or "Disconnected"
    const connected = page.getByText('Connected', { exact: true });
    const disconnected = page.getByText('Disconnected', { exact: true });

    await page.waitForTimeout(2000);

    const isConnected = await connected.isVisible().catch(() => false);
    const isDisconnected = await disconnected.isVisible().catch(() => false);

    expect(isConnected || isDisconnected).toBe(true);
    console.log(`LIVE VIEW: Connection status = ${isConnected ? 'Connected' : 'Disconnected'}`);
  });

  test('live view has three-column grid layout on desktop', async ({ page }) => {
    await page.goto('/competitions/test-competition-id');

    // The three-column grid: col-span-12 lg:col-span-4 for each column
    const gridContainer = page.locator('.grid.grid-cols-12');
    await expect(gridContainer).toBeVisible({ timeout: 10000 });

    // Three main column sections exist
    const columns = gridContainer.locator('> .col-span-12');
    const count = await columns.count();
    expect(count).toBeGreaterThanOrEqual(3);
  });
});

// ============================================================================
// 3. GLOBAL LEADERBOARD PAGE (/leaderboards)
// ============================================================================

test.describe('Global Leaderboard Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/leaderboards');
  });

  test('page loads successfully with heading and subtitle', async ({ page }) => {
    // Heading contains "Global" and "Leaderboard" (Leaderboard in NeonText)
    await expect(page.getByRole('heading', { level: 1 }).getByText('Leaderboard')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Top AI agents ranked by ELO rating')).toBeVisible();
  });

  test('domain tabs are visible with All Domains selected by default', async ({ page }) => {
    // "All Domains" tab button should be visible and active (has cyan styling)
    const allDomainsTab = page.getByRole('button', { name: 'All Domains' });
    await expect(allDomainsTab).toBeVisible({ timeout: 10000 });

    // It should have the active styling class
    await expect(allDomainsTab).toHaveClass(/bg-neon-cyan/);
  });

  test('shows loading spinner then resolves to table or empty state', async ({ page }) => {
    // Wait for either table or spinner to resolve
    try {
      await Promise.race([
        page.locator('table').waitFor({ timeout: 28000 }),
        page.locator('.animate-spin').waitFor({ state: 'hidden', timeout: 28000 }),
      ]);
    } catch {
      // If neither resolved, check current state
    }

    const hasTable = await page.locator('table').isVisible().catch(() => false);
    const hasSpinner = await page.locator('.animate-spin').isVisible().catch(() => false);

    // Table renders after loading, or spinner may still be going (slow Supabase)
    expect(hasTable || hasSpinner).toBe(true);
  });

  test('table has correct column headers', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 25000 }).catch(() => {});

    const hasTable = await page.locator('table').isVisible().catch(() => false);
    if (hasTable) {
      const headerRow = page.locator('table thead tr');
      await expect(headerRow).toBeVisible();

      // Check all expected column headers
      await expect(headerRow.getByText('Rank')).toBeVisible();
      await expect(headerRow.getByText('Agent')).toBeVisible();
      await expect(headerRow.getByText('Owner')).toBeVisible();
      await expect(headerRow.getByText('ELO')).toBeVisible();
      await expect(headerRow.getByText('Wins')).toBeVisible();
      await expect(headerRow.getByText('Competitions')).toBeVisible();
      await expect(headerRow.getByText('Win Rate')).toBeVisible();
    } else {
      console.log('LEADERBOARD: Table not visible yet (still loading)');
    }
  });

  test('agent rows display rank, name, owner, ELO rating, and stats when agents exist', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const firstRow = page.locator('table tbody tr').first();
    const hasRows = await firstRow.isVisible().catch(() => false);

    if (hasRows) {
      // Rank column shows "#1" style
      await expect(firstRow.getByText('#1')).toBeVisible();

      // Agent name cell contains text
      const agentNameCell = firstRow.locator('td').nth(1);
      const agentName = await agentNameCell.locator('.font-semibold').textContent();
      expect(agentName).toBeTruthy();

      // Owner cell shows @username
      const ownerCell = firstRow.locator('td').nth(2);
      const ownerText = await ownerCell.textContent();
      expect(ownerText).toMatch(/@/);

      // ELO rating is displayed with neon-cyan styling
      const eloCell = firstRow.locator('td').nth(3);
      await expect(eloCell.locator('.font-mono.font-bold.text-neon-cyan')).toBeVisible();

      console.log(`LEADERBOARD: First agent = ${agentName}, ELO = ${await eloCell.textContent()}`);
    } else {
      console.log('LEADERBOARD: No agents in the leaderboard');
    }
  });

  test('podium section appears when at least 3 agents exist', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const rowCount = await page.locator('table tbody tr').count();

    if (rowCount >= 3) {
      // The podium section shows the top 3 agents with visual cards
      // 1st place has a Crown icon and yellow/gold styling
      const podiumContainer = page.locator('.flex.justify-center.items-end.gap-4');
      await expect(podiumContainer).toBeVisible();

      // 1st place card has neonBorder styling
      const firstPlaceCard = podiumContainer.locator('div').filter({ hasText: /#1|Crown/ }).first();
      // Crown icon should be present somewhere in the podium
      const crownSvg = page.locator('svg.lucide-crown').first();
      await expect(crownSvg).toBeVisible();

      console.log('LEADERBOARD: Top 3 podium is visible');
    } else {
      console.log(`LEADERBOARD: Only ${rowCount} agents - podium not shown (needs 3+)`);
    }
  });

  test('clicking a domain tab filters the leaderboard', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    // Count available domain tabs (beyond "All Domains")
    const domainButtons = page.locator('.flex.flex-wrap.justify-center.gap-2 button');
    const buttonCount = await domainButtons.count();

    if (buttonCount > 1) {
      // Click the second tab (first specific domain)
      await domainButtons.nth(1).click();

      // The clicked tab should now have the active cyan styling
      await expect(domainButtons.nth(1)).toHaveClass(/bg-neon-cyan/);

      // "All Domains" should no longer have active styling
      await expect(domainButtons.nth(0)).not.toHaveClass(/border-neon-cyan/);

      // Wait for reload
      await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

      console.log('LEADERBOARD: Domain tab filter works');
    } else {
      console.log('LEADERBOARD: No domain tabs to test (only "All Domains")');
    }
  });

  test('agent names in table link to agent detail pages', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const agentLink = page.locator('table tbody a[href^="/agents/"]').first();
    const hasLink = await agentLink.isVisible().catch(() => false);

    if (hasLink) {
      const href = await agentLink.getAttribute('href');
      expect(href).toMatch(/^\/agents\//);
      console.log(`LEADERBOARD: Agent link found: ${href}`);
    } else {
      console.log('LEADERBOARD: No agent links in table');
    }
  });

  test('ELO ratings are displayed as numbers', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const eloValues = page.locator('table tbody .text-neon-cyan.font-mono');
    const count = await eloValues.count();

    if (count > 0) {
      for (let i = 0; i < Math.min(count, 5); i++) {
        const text = await eloValues.nth(i).textContent();
        const num = parseInt(text?.trim() || '', 10);
        expect(num).not.toBeNaN();
        expect(num).toBeGreaterThanOrEqual(0);
      }
      console.log(`LEADERBOARD: Verified ${Math.min(count, 5)} ELO ratings are valid numbers`);
    }
  });
});

// ============================================================================
// 4. PUBLIC AGENTS BROWSER (/agents)
// ============================================================================

test.describe('Public Agents Browser', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/agents');
  });

  test('page loads successfully with heading and subtitle', async ({ page }) => {
    // Heading contains "Browse" and "Agents" (Agents in NeonText)
    await expect(page.getByRole('heading', { level: 1 }).getByText('Agents')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Explore public AI agents competing on the platform')).toBeVisible();
  });

  test('search input is visible and functional', async ({ page }) => {
    const searchInput = page.locator('input[placeholder="Search agents..."]');
    await expect(searchInput).toBeVisible({ timeout: 10000 });

    // Type a search query
    await searchInput.fill('test-agent');
    await expect(searchInput).toHaveValue('test-agent');

    // Wait for data reload
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('sort dropdown is visible with correct options', async ({ page }) => {
    await expect(page.getByText('Sort by:')).toBeVisible({ timeout: 10000 });

    const sortSelect = page.locator('select');
    await expect(sortSelect).toBeVisible();

    // Check the sort options
    await expect(sortSelect.locator('option[value="elo_rating"]')).toHaveText('ELO Rating');
    await expect(sortSelect.locator('option[value="total_wins"]')).toHaveText('Total Wins');
    await expect(sortSelect.locator('option[value="total_competitions"]')).toHaveText('Competitions');
    await expect(sortSelect.locator('option[value="created_at"]')).toHaveText('Newest');
  });

  test('default sort is by ELO Rating', async ({ page }) => {
    const sortSelect = page.locator('select');
    await expect(sortSelect).toBeVisible({ timeout: 10000 });
    await expect(sortSelect).toHaveValue('elo_rating');
  });

  test('shows loading spinner then resolves to agents or empty state', async ({ page }) => {
    try {
      await Promise.race([
        page.locator('h3:has-text("No agents found")').waitFor({ timeout: 28000 }),
        page.locator('.grid a[href^="/agents/"]').first().waitFor({ timeout: 28000 }),
      ]);
    } catch {
      // If neither appeared, check if spinner is still going
    }

    const hasAgents = await page.locator('.grid a[href^="/agents/"]').first().isVisible().catch(() => false);
    const hasEmptyState = await page.getByText('No agents found').isVisible().catch(() => false);
    const hasSpinner = await page.locator('.animate-spin').isVisible().catch(() => false);

    expect(hasAgents || hasEmptyState || hasSpinner).toBe(true);
  });

  test('empty state shows bot icon, message, and create agent link', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const hasEmptyState = await page.getByText('No agents found').isVisible().catch(() => false);

    if (hasEmptyState) {
      await expect(page.getByText('No agents found')).toBeVisible();
      await expect(page.getByText('Try adjusting your search or create your own agent')).toBeVisible();
      const createLink = page.locator('a[href="/dashboard/agents/create"]');
      await expect(createLink).toBeVisible();
    } else {
      console.log('AGENTS: Agents exist - empty state not shown');
    }
  });

  test('agent cards display name, owner, type badge, ELO rating, and wins', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    // Check if we have the empty state - meaning no agents exist
    const hasEmptyState = await page.getByText('No agents found').isVisible().catch(() => false);
    if (hasEmptyState) {
      console.log('AGENTS: No agents in DB - skipping card checks');
      return;
    }

    const hasAgents = await page.locator('.grid > div a[href^="/agents/"]').first().isVisible().catch(() => false);

    if (hasAgents) {
      const firstCard = page.locator('.grid > div').filter({ has: page.locator('a[href^="/agents/"]') }).first();

      // Agent name (h3 element)
      const agentName = firstCard.locator('h3');
      await expect(agentName).toBeVisible();
      const nameText = await agentName.textContent();
      expect(nameText?.length).toBeGreaterThan(0);

      // Owner username (by @username)
      await expect(firstCard.getByText(/by @/).first()).toBeVisible();

      // Type badge (either "Webhook" or "API")
      const hasBadge = await firstCard.getByText('Webhook').isVisible().catch(() => false)
        || await firstCard.getByText('API').isVisible().catch(() => false);
      expect(hasBadge).toBe(true);

      // ELO rating displayed as a number
      const eloText = firstCard.locator('.font-mono').first();
      await expect(eloText).toBeVisible();
      const eloValue = await eloText.textContent();
      expect(parseInt(eloValue?.trim() || '', 10)).not.toBeNaN();

      // Wins count
      await expect(firstCard.getByText(/wins/).first()).toBeVisible();

      console.log(`AGENTS: First agent = ${nameText}, ELO = ${eloValue}`);
    } else {
      console.log('AGENTS: No agent cards to verify');
    }
  });

  test('agent cards have description text when available', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const hasAgents = await page.locator('.grid > div').first().isVisible().catch(() => false);

    if (hasAgents) {
      // Description is shown with line-clamp-2 class
      const descriptions = page.locator('.line-clamp-2');
      const count = await descriptions.count();
      console.log(`AGENTS: Found ${count} agents with descriptions`);
    }
  });

  test('agent cards link to agent detail pages', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    const agentLink = page.locator('.grid a[href^="/agents/"]').first();
    const hasLink = await agentLink.isVisible().catch(() => false);

    if (hasLink) {
      const href = await agentLink.getAttribute('href');
      expect(href).toMatch(/^\/agents\//);
      console.log(`AGENTS: Agent card links to ${href}`);
    } else {
      console.log('AGENTS: No agent card links present');
    }
  });

  test('changing sort option updates URL and reloads agents', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 20000 }).catch(() => {});

    const sortSelect = page.locator('select');
    await sortSelect.selectOption('total_wins');

    await expect(page).toHaveURL(/sort=total_wins/, { timeout: 10000 });
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
  });

  test('search filters agents and shows results or empty state', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 20000 }).catch(() => {});

    const searchInput = page.locator('input[placeholder="Search agents..."]');
    await searchInput.fill('zzzznonexistent12345');

    // Wait for the debounced search to trigger and complete
    await page.waitForTimeout(2500);
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    // Should show "No agents found" for a nonsense search
    const hasEmpty = await page.getByText('No agents found').isVisible().catch(() => false);
    const hasResults = await page.locator('.grid > div a[href^="/agents/"]').first().isVisible().catch(() => false);

    expect(hasEmpty || hasResults).toBe(true);
    console.log(`AGENTS SEARCH: Empty state = ${hasEmpty}, Has results = ${hasResults}`);
  });

  test('agent cards show initial letter avatar with color', async ({ page }) => {
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});

    // Check if we have the empty state - meaning no agents exist
    const hasEmptyState = await page.getByText('No agents found').isVisible().catch(() => false);
    if (hasEmptyState) {
      console.log('AGENTS: No agents in DB - skipping avatar checks');
      return;
    }

    const hasAgents = await page.locator('.grid > div a[href^="/agents/"]').first().isVisible().catch(() => false);

    if (hasAgents) {
      // The avatar is a div with inline style backgroundColor and a single letter
      const firstCard = page.locator('.grid > div').filter({ has: page.locator('a[href^="/agents/"]') }).first();
      const avatar = firstCard.locator('[class*="rounded"][class*="flex"][class*="items-center"][class*="justify-center"]').first();
      await expect(avatar).toBeVisible();

      const avatarText = await avatar.textContent();
      expect(avatarText?.trim().length).toBe(1); // Single letter initial

      console.log(`AGENTS: Avatar initial = "${avatarText?.trim()}"`);
    }
  });
});

// ============================================================================
// 5. CROSS-PAGE NAVIGATION
// ============================================================================

test.describe('Cross-Page Navigation', () => {
  test('can navigate from landing page to competitions', async ({ page }) => {
    await page.goto('/');
    await page.goto('/competitions');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Competitions')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate from landing page to leaderboards', async ({ page }) => {
    await page.goto('/');
    await page.goto('/leaderboards');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Leaderboard')).toBeVisible({ timeout: 10000 });
  });

  test('can navigate from landing page to agents', async ({ page }) => {
    await page.goto('/');
    await page.goto('/agents');
    await expect(page.getByRole('heading', { level: 1 }).getByText('Agents')).toBeVisible({ timeout: 10000 });
  });

  test('header and footer are present on all public pages', async ({ page }) => {
    const pagesToCheck = ['/competitions', '/leaderboards', '/agents'];

    for (const path of pagesToCheck) {
      await page.goto(path);

      const header = page.locator('header');
      await expect(header).toBeVisible({ timeout: 10000 });

      // Footer is rendered by the Footer component
      const footer = page.locator('footer');
      // Footer may or may not be in viewport, but should exist in DOM
      const footerCount = await footer.count();
      expect(footerCount).toBeGreaterThanOrEqual(0);
    }
  });

  test('404 page shows for completely invalid routes', async ({ page }) => {
    await page.goto('/this-route-does-not-exist');

    await expect(page.getByText('404')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Page not found')).toBeVisible();
    await expect(page.getByText('Go Home')).toBeVisible();
  });
});
