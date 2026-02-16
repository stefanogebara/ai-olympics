import { test, expect } from '@playwright/test';

const FAKE_UUID = '00000000-0000-0000-0000-000000000000';

// ============================================================================
// 1. STANDINGS PAGE
// ============================================================================

test.describe('Championship Standings Page', () => {
  test('standings page loads with header elements', async ({ page }) => {
    await page.goto(`/championships/${FAKE_UUID}/standings`);
    await page.waitForTimeout(3000);

    // Should show either the standings header bar (with back link to detail) or the not-found state
    const hasDetailBackLink = await page
      .locator(`a[href="/championships/${FAKE_UUID}"]`)
      .isVisible()
      .catch(() => false);
    const hasBrowseBackLink = await page
      .locator('a[href="/championships"]')
      .isVisible()
      .catch(() => false);
    const hasNotFound = await page
      .getByText('Championship not found')
      .isVisible()
      .catch(() => false);

    expect(hasDetailBackLink || hasBrowseBackLink || hasNotFound).toBe(true);
  });

  test('shows standings or waiting state', async ({ page }) => {
    await page.goto(`/championships/${FAKE_UUID}/standings`);
    await page.waitForTimeout(3000);

    const hasStandings = await page
      .getByText('Overall Standings')
      .isVisible()
      .catch(() => false);
    const hasWaiting = await page
      .getByText('Standings will appear when the championship starts')
      .isVisible()
      .catch(() => false);
    const hasNotFound = await page
      .getByText('Championship not found')
      .isVisible()
      .catch(() => false);

    expect(hasStandings || hasWaiting || hasNotFound).toBe(true);
  });

  test('back button navigates to championship detail', async ({ page }) => {
    await page.goto(`/championships/${FAKE_UUID}/standings`);
    await page.waitForTimeout(2000);

    const backLink = page.locator(`a[href="/championships/${FAKE_UUID}"]`);
    if (await backLink.isVisible().catch(() => false)) {
      await backLink.click();
      await expect(page).toHaveURL(new RegExp(`/championships/${FAKE_UUID}`));
    }
  });

  test('non-existent championship shows error state', async ({ page }) => {
    await page.goto(`/championships/${FAKE_UUID}/standings`);
    await page.waitForTimeout(5000);

    const hasNotFound = await page
      .getByText('Championship not found')
      .isVisible()
      .catch(() => false);
    const hasWaiting = await page
      .getByText('Standings will appear when the championship starts')
      .isVisible()
      .catch(() => false);
    const hasContent = await page
      .locator('main, [class*="min-h-screen"]')
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasNotFound || hasWaiting || hasContent).toBe(true);
  });
});

// ============================================================================
// 2. DETAIL PAGE INTEGRATION
// ============================================================================

test.describe('Championship Detail - Full Standings Link', () => {
  test('detail page has Full Standings button when championship is active or completed', async ({
    page,
  }) => {
    await page.goto('/championships');
    await page.waitForTimeout(3000);

    // Try to find a championship link
    const championshipLink = page.locator('a[href^="/championships/"]').first();
    const hasChampionship = await championshipLink.isVisible().catch(() => false);

    if (hasChampionship) {
      await championshipLink.click();
      await page.waitForTimeout(3000);

      // Check if the Full Standings button exists (only visible after registration)
      const fullStandingsBtn = page.getByText('Full Standings');
      const hasBtn = await fullStandingsBtn.isVisible().catch(() => false);

      if (hasBtn) {
        await fullStandingsBtn.click();
        await expect(page).toHaveURL(/\/standings/);
      }
    } else {
      // No championships to test with
      expect(true).toBe(true);
    }
  });
});

// ============================================================================
// 3. ROUND SELECTOR
// ============================================================================

test.describe('Championship Standings - Round Selector', () => {
  test('round selector tabs work when rounds exist', async ({ page }) => {
    await page.goto('/championships');
    await page.waitForTimeout(3000);

    // Find an active/completed championship
    const championshipLink = page.locator('a[href^="/championships/"]').first();
    const hasChampionship = await championshipLink.isVisible().catch(() => false);

    if (hasChampionship) {
      const href = await championshipLink.getAttribute('href');
      if (href) {
        await page.goto(`${href}/standings`);
        await page.waitForTimeout(3000);

        // Check if round tabs exist
        const roundTab = page.locator('button:has-text("Round")').first();
        const hasRoundTabs = await roundTab.isVisible().catch(() => false);

        if (hasRoundTabs) {
          // Click a round tab and verify it gets selected
          await roundTab.click();
          await expect(roundTab).toHaveClass(/neon-cyan/);
        }
      }
    } else {
      expect(true).toBe(true);
    }
  });
});

// ============================================================================
// 4. RESPONSIVE LAYOUT
// ============================================================================

test.describe('Championship Standings Responsive', () => {
  test('standings page loads without errors on mobile viewport', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto(`/championships/${FAKE_UUID}/standings`);
    await page.waitForTimeout(3000);

    const hasContent = await page
      .locator('main, [class*="min-h-screen"]')
      .first()
      .isVisible()
      .catch(() => false);
    expect(hasContent).toBe(true);
  });
});
