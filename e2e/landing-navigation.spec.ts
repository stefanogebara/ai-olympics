import { test, expect } from '@playwright/test';

// ============================================================================
// 1. LANDING PAGE
// ============================================================================

test.describe('Landing Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('page loads with correct title', async ({ page }) => {
    await expect(page).toHaveTitle(/AI Olympics/i);
  });

  test('hero section is visible with heading text about AI Agent competition', async ({ page }) => {
    const heroSection = page.locator('section').first();
    await expect(heroSection).toBeVisible();

    // The heading contains "The Global Arena for" and "AI Agent Competition"
    await expect(page.locator('h1')).toBeVisible();
    await expect(page.getByText('The Global Arena for')).toBeVisible();
    await expect(page.getByText('AI Agent Competition')).toBeVisible();
  });

  test('CTA buttons are visible in hero section', async ({ page }) => {
    // Primary CTA: "Start Competing" (button or link)
    const startCompeting = page.getByRole('button', { name: /Start Competing/i })
      .or(page.getByRole('link', { name: /Start Competing/i }));
    await expect(startCompeting).toBeVisible();

    // Secondary CTA: "Browse Competitions" (button or link)
    const browseCompetitions = page.getByRole('button', { name: /Browse Competitions/i })
      .or(page.getByRole('link', { name: /Browse Competitions/i }));
    await expect(browseCompetitions).toBeVisible();
  });

  test('stats section is visible with key metrics', async ({ page }) => {
    // Stats strip shows: 6 Competition Domains, 25+ Task Types, Free Sandbox Mode
    const statsSection = page.locator('[class*="stats"], [class*="grid"]').filter({ hasText: 'Competition Domains' }).first();
    await expect(statsSection).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('25+')).toBeVisible();
    await expect(page.getByText('Task Types').first()).toBeVisible();
    await expect(page.getByText('Sandbox Mode').first()).toBeVisible();
  });

  test('features section is visible with feature cards', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Submit Your Agent' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Compete Globally' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Climb the Leaderboards' })).toBeVisible();
  });

  test('competition domains section shows all 6 domains', async ({ page }) => {
    await expect(page.getByRole('heading', { name: /Competition Domains/i })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Browser Tasks' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Prediction Markets' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Trading & Finance' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Games' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Creative' }).first()).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Coding' }).first()).toBeVisible();
  });

  test('animated elements render (framer-motion divs)', async ({ page }) => {
    // Framer-motion renders elements with style attributes for opacity/transform
    // After animation completes, the motion.div elements should be visible
    // Check that multiple motion-generated elements exist on the page
    const animatedElements = page.locator('[style*="opacity"]');
    // Wait for animations to start rendering
    await page.waitForTimeout(1000);
    const count = await animatedElements.count();
    expect(count).toBeGreaterThan(0);
  });

  test('bottom CTA section with Create Free Account is visible', async ({ page }) => {
    await expect(page.getByText('Ready to')).toBeVisible();
    const createAccountBtn = page.getByRole('button', { name: /Create Free Account/i })
      .or(page.getByRole('link', { name: /Create Free Account/i }));
    await expect(createAccountBtn).toBeVisible();
  });
});

// ============================================================================
// 2. HEADER NAVIGATION (UNAUTHENTICATED)
// ============================================================================

test.describe('Header Navigation (unauthenticated)', () => {
  test.beforeEach(async ({ page }) => {
    // Clear auth state so we test as unauthenticated user
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test('logo/brand link is visible and links to /', async ({ page }) => {
    const logoLink = page.locator('header a[href="/"]');
    await expect(logoLink).toBeVisible();

    // Should contain the "AI" text in the logo
    await expect(logoLink.locator('text=AI').first()).toBeVisible();
  });

  test('navigation links are visible: Competitions, Tournaments, Championships, Games, Markets, Agents, Leaderboards', async ({ page }) => {
    const header = page.locator('header');

    // Desktop nav links (hidden on mobile via md:flex)
    const desktopNav = header.locator('nav.hidden.md\\:flex');

    await expect(desktopNav.getByRole('link', { name: 'Competitions' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'Tournaments' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'Championships' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'Games' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'Markets' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'Agents' })).toBeVisible();
    await expect(desktopNav.getByRole('link', { name: 'Leaderboards' })).toBeVisible();
  });

  test('Competitions nav link navigates to /competitions', async ({ page }) => {
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Competitions' }).click();
    await expect(page).toHaveURL(/\/competitions$/);
  });

  test('Games nav link navigates to /games', async ({ page }) => {
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Games' }).click();
    await expect(page).toHaveURL(/\/games$/);
  });

  test('Agents nav link navigates to /agents', async ({ page }) => {
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Agents' }).click();
    await expect(page).toHaveURL(/\/agents$/);
  });

  test('Leaderboards nav link navigates to /leaderboards', async ({ page }) => {
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Leaderboards' }).click();
    await expect(page).toHaveURL(/\/leaderboards$/);
  });

  test('Log In and Sign Up buttons are visible', async ({ page }) => {
    const loginLink = page.locator('header a[href="/auth/login"]');
    const signupLink = page.locator('header a[href="/auth/signup"]');

    await expect(loginLink).toBeVisible();
    await expect(signupLink).toBeVisible();
  });

  test('Log In button links to /auth/login', async ({ page }) => {
    const loginLink = page.locator('header a[href="/auth/login"]');
    await loginLink.click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('Sign Up button links to /auth/signup', async ({ page }) => {
    const signupLink = page.locator('header a[href="/auth/signup"]');
    await signupLink.click();
    await expect(page).toHaveURL(/\/auth\/signup/);
  });
});

// ============================================================================
// 3. FOOTER
// ============================================================================

test.describe('Footer', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('footer is visible at bottom of page', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer).toBeVisible();
  });

  test('footer contains AI Olympics branding', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('AI Olympics').first()).toBeVisible();
  });

  test('footer contains copyright text', async ({ page }) => {
    const footer = page.locator('footer');
    const currentYear = new Date().getFullYear().toString();
    await expect(footer.getByText(new RegExp(`${currentYear}.*AI Olympics`))).toBeVisible();
    await expect(footer.getByText('All rights reserved')).toBeVisible();
  });

  test('footer contains platform links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('heading', { name: 'Platform' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Competitions' })).toBeVisible();
  });

  test('footer contains domain links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('Domains')).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Browser Tasks' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Prediction Markets' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Trading' })).toBeVisible();
  });

  test('footer contains community section with social links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByText('Community')).toBeVisible();

    // GitHub link opens in new tab
    const githubLink = footer.locator('a[href="https://github.com/stefanogebara/ai-olympics"]');
    await expect(githubLink).toBeVisible();
    await expect(githubLink).toHaveAttribute('target', '_blank');

    // Twitter and Discord are placeholder links
    const twitterLink = footer.locator('a[aria-label="Twitter (coming soon)"]');
    await expect(twitterLink).toBeVisible();

    const discordLink = footer.locator('a[aria-label="Discord (coming soon)"]');
    await expect(discordLink).toBeVisible();
  });

  test('footer contains Privacy Policy and Terms of Service links', async ({ page }) => {
    const footer = page.locator('footer');
    await expect(footer.getByRole('link', { name: 'Privacy Policy' })).toBeVisible();
    await expect(footer.getByRole('link', { name: 'Terms of Service' })).toBeVisible();
  });
});

// ============================================================================
// 4. MOBILE RESPONSIVE NAVIGATION
// ============================================================================

test.describe('Mobile Responsive Navigation', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 });
    await page.goto('/');
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });
    await page.reload();
  });

  test('hamburger menu button is visible on mobile', async ({ page }) => {
    // The hamburger button uses the lucide Menu icon, rendered inside a button with md:hidden class
    const menuButton = page.locator('header button.md\\:hidden');
    await expect(menuButton).toBeVisible();
  });

  test('clicking hamburger opens mobile menu with all nav links', async ({ page }) => {
    const menuButton = page.locator('header button.md\\:hidden');
    await menuButton.click();

    // Mobile menu should now be visible
    const mobileMenu = page.locator('header .md\\:hidden').nth(1); // the menu panel div
    await expect(mobileMenu).toBeVisible();

    // All nav links should be present in the mobile menu
    await expect(page.locator('header nav.flex.flex-col a[href="/competitions"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/tournaments"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/championships"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/games"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/predictions"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/agents"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/leaderboards"]')).toBeVisible();
  });

  test('mobile menu shows auth links for unauthenticated users', async ({ page }) => {
    const menuButton = page.locator('header button.md\\:hidden');
    await menuButton.click();

    // Auth links in the mobile menu
    await expect(page.locator('header nav.flex.flex-col a[href="/auth/login"]')).toBeVisible();
    await expect(page.locator('header nav.flex.flex-col a[href="/auth/signup"]')).toBeVisible();
  });

  test('clicking a nav link in mobile menu navigates and closes menu', async ({ page }) => {
    const menuButton = page.locator('header button.md\\:hidden');
    await menuButton.click();

    // Click the Competitions link in the mobile menu
    await page.locator('header nav.flex.flex-col a[href="/competitions"]').click();

    // Should navigate to /competitions
    await expect(page).toHaveURL(/\/competitions$/);

    // Mobile menu should close (the mobile nav column should no longer be visible)
    await expect(page.locator('header nav.flex.flex-col')).not.toBeVisible();
  });

  test('clicking Log In in mobile menu navigates to /auth/login', async ({ page }) => {
    const menuButton = page.locator('header button.md\\:hidden');
    await menuButton.click();

    await page.locator('header nav.flex.flex-col a[href="/auth/login"]').click();
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test('clicking Sign Up in mobile menu navigates to /auth/signup', async ({ page }) => {
    const menuButton = page.locator('header button.md\\:hidden');
    await menuButton.click();

    await page.locator('header nav.flex.flex-col a[href="/auth/signup"]').click();
    await expect(page).toHaveURL(/\/auth\/signup/);
  });
});

// ============================================================================
// 5. NAVIGATION BETWEEN PUBLIC PAGES
// ============================================================================

test.describe('Navigation Between Public Pages', () => {
  test('from landing, click Competitions nav -> goes to /competitions', async ({ page }) => {
    await page.goto('/');
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Competitions' }).click();
    await expect(page).toHaveURL(/\/competitions$/);
  });

  test('from competitions, click Games -> goes to /games', async ({ page }) => {
    await page.goto('/competitions');
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Games' }).click();
    await expect(page).toHaveURL(/\/games$/);
  });

  test('from games, click Agents -> goes to /agents', async ({ page }) => {
    await page.goto('/games');
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Agents' }).click();
    await expect(page).toHaveURL(/\/agents$/);
  });

  test('from agents, click Leaderboards -> goes to /leaderboards', async ({ page }) => {
    await page.goto('/agents');
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Leaderboards' }).click();
    await expect(page).toHaveURL(/\/leaderboards$/);
  });

  test('from leaderboards, navigate back to landing via logo', async ({ page }) => {
    await page.goto('/leaderboards');
    const logoLink = page.locator('header a[href="/"]');
    await logoLink.click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('sequential navigation through all public pages', async ({ page }) => {
    await page.goto('/');
    await expect(page).toHaveURL(/\/$/);

    // Landing -> Competitions
    const header = page.locator('header');
    await header.getByRole('link', { name: 'Competitions' }).click();
    await expect(page).toHaveURL(/\/competitions$/);

    // Competitions -> Games
    await header.getByRole('link', { name: 'Games' }).click();
    await expect(page).toHaveURL(/\/games$/);

    // Games -> Agents
    await header.getByRole('link', { name: 'Agents' }).click();
    await expect(page).toHaveURL(/\/agents$/);

    // Agents -> Leaderboards
    await header.getByRole('link', { name: 'Leaderboards' }).click();
    await expect(page).toHaveURL(/\/leaderboards$/);

    // Leaderboards -> back to landing via logo
    await page.locator('header a[href="/"]').click();
    await expect(page).toHaveURL(/\/$/);
  });
});

// ============================================================================
// 6. 404 PAGE
// ============================================================================

test.describe('404 Page', () => {
  test('navigating to nonexistent page shows 404', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');

    await expect(page.locator('h1')).toContainText('404');
  });

  test('404 page shows Page not found text', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');

    await expect(page.getByText('Page not found')).toBeVisible();
  });

  test('404 page shows Go Home link', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');

    const goHomeLink = page.getByRole('link', { name: /Go Home/i });
    await expect(goHomeLink).toBeVisible();
    await expect(goHomeLink).toHaveAttribute('href', '/');
  });

  test('clicking Go Home on 404 page navigates to /', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');

    const goHomeLink = page.getByRole('link', { name: /Go Home/i });
    await goHomeLink.click();

    await expect(page).toHaveURL(/\/$/);
    // Verify we are back on the landing page
    await expect(page.getByText('The Global Arena for')).toBeVisible();
  });

  test('404 page still shows header and footer', async ({ page }) => {
    await page.goto('/nonexistent-page-xyz');

    await expect(page.locator('header')).toBeVisible();
    await expect(page.locator('footer')).toBeVisible();
  });
});
