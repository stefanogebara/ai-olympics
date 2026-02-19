/**
 * E2E Tests: AI Olympics Task Pages
 *
 * Covers the three challenge task pages served directly from the backend:
 *   - http://localhost:3003/tasks/code    (Code Debug Challenge)
 *   - http://localhost:3003/tasks/cipher  (Cipher Break Challenge)
 *   - http://localhost:3003/tasks/spatial (Spatial Logic Challenge)
 *
 * All tests intercept the puzzle API via route mocking so they do not depend
 * on a live Supabase database.  The pages themselves are served as static HTML
 * by the backend, so the backend must be running at http://localhost:3003.
 *
 * Test coverage:
 *  - Page title, subtitle, timer, progress bar, stats bar
 *  - Puzzle API called with correct difficulties (2 easy, 2 medium, 1 hard)
 *  - Puzzle card: header, difficulty badge, content area, input, submit button
 *  - Correct answer -> green feedback, score increment, advance to next puzzle
 *  - Incorrect answer -> red feedback with correct-answer hint
 *  - Stats bar updates after each submission
 *  - Progress bar advances after each puzzle
 *  - After puzzle 5: results screen with summary stats and per-puzzle grid
 *  - Empty answer -> red input border, submit API NOT called
 *  - Enter key submits the answer
 *  - Network error on puzzle fetch -> error message shown
 *  - Network error on submit -> input/button re-enabled
 */

import { test, expect, type Page, type Route } from '@playwright/test';

// ============================================================================
// CONSTANTS
// ============================================================================

const BACKEND = 'http://localhost:3003';

interface TaskConfig {
  id: string;
  path: string;
  title: string;
  subtitle: string;
  loadingText: string;
  submitBtnText: string;
  successLabel: string;
  puzzleLabel: string;
}

const TASK_PAGES: TaskConfig[] = [
  {
    id: 'code',
    path: `${BACKEND}/tasks/code`,
    title: 'Code Debug Challenge',
    subtitle: 'Find the bug in 5 code puzzles!',
    loadingText: 'Loading puzzles...',
    submitBtnText: 'Submit',
    successLabel: 'Bugs Found',
    puzzleLabel: 'Puzzle',
  },
  {
    id: 'cipher',
    path: `${BACKEND}/tasks/cipher`,
    title: 'Cipher Break Challenge',
    subtitle: 'Decode 5 encrypted messages!',
    loadingText: 'Loading ciphers...',
    submitBtnText: 'Decode',
    successLabel: 'Ciphers Broken',
    puzzleLabel: 'Cipher',
  },
  {
    id: 'spatial',
    path: `${BACKEND}/tasks/spatial`,
    title: 'Spatial Logic Challenge',
    subtitle: 'Solve 5 grid-based spatial puzzles!',
    loadingText: 'Loading puzzles...',
    submitBtnText: 'Submit',
    successLabel: 'Grids Solved',
    puzzleLabel: 'Puzzle',
  },
];

// ============================================================================
// HELPERS
// ============================================================================

/** Build one fake puzzle object matching the shape the page scripts expect. */
function makeFakePuzzle(
  id: string,
  difficulty: 'easy' | 'medium' | 'hard',
  question: string,
): Record<string, unknown> {
  return { id, difficulty, question, hint: `Hint for puzzle ${id}` };
}

/** Deterministic set of 5 fake puzzles (easy, easy, medium, medium, hard). */
function fakePuzzlesFor(gameType: string): Record<string, unknown>[] {
  return [
    makeFakePuzzle(`${gameType}-e1`, 'easy', `Easy Q1 for ${gameType}`),
    makeFakePuzzle(`${gameType}-e2`, 'easy', `Easy Q2 for ${gameType}`),
    makeFakePuzzle(`${gameType}-m1`, 'medium', `Medium Q1 for ${gameType}`),
    makeFakePuzzle(`${gameType}-m2`, 'medium', `Medium Q2 for ${gameType}`),
    makeFakePuzzle(`${gameType}-h1`, 'hard', `Hard Q1 for ${gameType}`),
  ];
}

/**
 * Register a route handler that returns deterministic fake puzzles for every
 * GET /api/games/{type}/puzzle request, in order.
 */
async function mockPuzzleApi(page: Page, gameType: string): Promise<void> {
  const puzzles = fakePuzzlesFor(gameType);
  let callIndex = 0;

  await page.route(`**/api/games/${gameType}/puzzle**`, async (route: Route) => {
    const puzzle = puzzles[callIndex] ?? puzzles[puzzles.length - 1];
    callIndex++;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(puzzle),
    });
  });
}

/**
 * Register a route handler for the submit endpoint.
 * @param isCorrect - whether to respond with is_correct: true or false
 */
async function mockSubmitApi(
  page: Page,
  gameType: string,
  isCorrect: boolean,
): Promise<void> {
  await page.route(`**/api/games/${gameType}/submit`, async (route: Route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        is_correct: isCorrect,
        score: isCorrect ? 100 : 0,
        correct_answer: 'correct_answer',
        explanation: isCorrect ? 'Well done!' : 'Better luck next time.',
      }),
    });
  });
}

/**
 * Navigate to the task page and wait for the first puzzle card to appear.
 * Requires mockPuzzleApi to be called first so the loading completes.
 */
async function loadTaskPage(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await expect(page.locator('#loadingMsg')).toBeHidden({ timeout: 10000 });
  await expect(page.locator('.puzzle-card').first()).toBeVisible({ timeout: 5000 });
}

/**
 * Submit all 5 puzzles by filling the answer input and clicking submit.
 * Sets up waitForResponse BEFORE clicking to avoid race conditions.
 */
async function answerAllPuzzles(
  page: Page,
  gameType: string,
  answer = 'test_answer',
): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await expect(page.locator('.puzzle-card').first()).toBeVisible({ timeout: 5000 });
    await page.locator('#answerInput').fill(answer);
    // Set up response listener before clicking to avoid missing the response
    const responsePromise = page.waitForResponse(
      (resp) => resp.url().includes(`/api/games/${gameType}/submit`),
      { timeout: 8000 },
    );
    await page.locator('#submitBtn').click();
    await responsePromise;
    if (i < 4) {
      await expect(page.locator('#puzzleNum')).toHaveText(`${i + 2}/5`, { timeout: 5000 });
    }
  }
}

// ============================================================================
// SUITE 1: PAGE LOAD & STATIC STRUCTURE
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Page load and structure`, () => {
    test.beforeEach(async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await loadTaskPage(page, task.path);
    });

    test('page title matches the challenge name', async ({ page }) => {
      await expect(page).toHaveTitle(new RegExp(task.title, 'i'));
    });

    test('heading h1 shows the challenge title', async ({ page }) => {
      await expect(page.locator('.header h1')).toContainText(task.title);
    });

    test('subtitle / description is visible', async ({ page }) => {
      await expect(page.locator('.header p')).toContainText(task.subtitle);
    });

    test('timer is visible and displays MM:SS format', async ({ page }) => {
      const timer = page.locator('#timer');
      await expect(timer).toBeVisible();
      await expect(timer).toHaveText(/^\d{2}:\d{2}$/);
    });

    test('progress bar container is visible and fill starts at 0%', async ({ page }) => {
      // The progress bar container (.progress-bar) should be visible
      await expect(page.locator('.progress-bar')).toBeVisible();
      // The fill element exists in the DOM and has width: 0% at the start
      const fill = page.locator('#progressFill');
      await expect(fill).toBeAttached();
      const style = await fill.getAttribute('style');
      expect(style).toContain('0%');
    });

    test('stats bar shows score=0, correct=0, puzzle=1/5', async ({ page }) => {
      await expect(page.locator('#scoreDisplay')).toHaveText('0');
      await expect(page.locator('#correctDisplay')).toHaveText('0');
      await expect(page.locator('#puzzleNum')).toHaveText('1/5');
    });

    test('success screen is initially hidden', async ({ page }) => {
      await expect(page.locator('#successScreen')).toBeHidden();
    });

    test('feedback div is initially hidden', async ({ page }) => {
      await expect(page.locator('#feedback')).toBeHidden();
    });
  });
}

// ============================================================================
// SUITE 2: PUZZLE CARD STRUCTURE
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Puzzle card structure`, () => {
    test.beforeEach(async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await loadTaskPage(page, task.path);
    });

    test('puzzle card is rendered with a header section', async ({ page }) => {
      await expect(page.locator('.puzzle-card .puzzle-header').first()).toBeVisible();
    });

    test('puzzle number label shows "Puzzle 1" (or Cipher 1)', async ({ page }) => {
      await expect(page.locator('.puzzle-number').first()).toContainText(`${task.puzzleLabel} 1`);
    });

    test('difficulty badge is visible on the first (easy) puzzle', async ({ page }) => {
      const badge = page.locator('.difficulty-badge').first();
      await expect(badge).toBeVisible();
      await expect(badge).toHaveText(/easy/i);
      await expect(badge).toHaveClass(/diff-easy/);
    });

    test('answer input is visible and enabled', async ({ page }) => {
      const input = page.locator('#answerInput');
      await expect(input).toBeVisible();
      await expect(input).toBeEnabled();
    });

    test('submit button is visible, enabled, and has correct label', async ({ page }) => {
      const btn = page.locator('#submitBtn');
      await expect(btn).toBeVisible();
      await expect(btn).toBeEnabled();
      await expect(btn).toHaveText(task.submitBtnText);
    });
  });
}

// ============================================================================
// SUITE 3: PUZZLE API REQUEST VALIDATION
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] API puzzle fetching`, () => {
    test('fetches exactly 5 puzzles on page load', async ({ page }) => {
      const fetchedDifficulties: string[] = [];

      await page.route(`**/api/games/${task.id}/puzzle**`, async (route, request) => {
        const url = new URL(request.url());
        const difficulty = url.searchParams.get('difficulty') || 'unknown';
        fetchedDifficulties.push(difficulty);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            id: `fake-${difficulty}-${fetchedDifficulties.length}`,
            difficulty,
            question: `Question for ${difficulty}`,
          }),
        });
      });

      await page.goto(task.path);
      await expect(page.locator('#loadingMsg')).toBeHidden({ timeout: 10000 });
      await expect(page.locator('.puzzle-card').first()).toBeVisible({ timeout: 5000 });

      // Exactly 5 puzzle requests made
      expect(fetchedDifficulties).toHaveLength(5);

      // Correct difficulty distribution
      expect(fetchedDifficulties.filter((d) => d === 'easy')).toHaveLength(2);
      expect(fetchedDifficulties.filter((d) => d === 'medium')).toHaveLength(2);
      expect(fetchedDifficulties.filter((d) => d === 'hard')).toHaveLength(1);

      // Correct order: easy, easy, medium, medium, hard
      expect(fetchedDifficulties).toEqual(['easy', 'easy', 'medium', 'medium', 'hard']);
    });
  });
}

// ============================================================================
// SUITE 4: SUBMIT ANSWER FLOW
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Submit answer flow`, () => {
    test('submitting an answer sends POST to /api/games/{type}/submit with correct body', async ({ page }) => {
      await mockPuzzleApi(page, task.id);

      const capturedBodies: Record<string, unknown>[] = [];
      await page.route(`**/api/games/${task.id}/submit`, async (route, request) => {
        capturedBodies.push(request.postDataJSON() as Record<string, unknown>);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: false, score: 0, correct_answer: 'x' }),
        });
      });

      await loadTaskPage(page, task.path);
      await page.locator('#answerInput').fill('my test answer');
      // Register listener BEFORE clicking to avoid missing fast responses
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#submitBtn').click();
      await responsePromise;

      expect(capturedBodies).toHaveLength(1);
      const body = capturedBodies[0];
      expect(body.puzzleId).toBe(`${task.id}-e1`); // first fake puzzle id
      expect(body.answer).toBe('my test answer');
      expect(typeof body.timeMs).toBe('number');
      expect(body.timeMs as number).toBeGreaterThanOrEqual(0);
    });

    test('correct answer shows green feedback containing "Correct"', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, true);
      await loadTaskPage(page, task.path);

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('right');
      await page.locator('#submitBtn').click();
      await responsePromise;

      const feedback = page.locator('#feedback');
      await expect(feedback).toBeVisible({ timeout: 5000 });
      await expect(feedback).toHaveClass(/correct/);
      await expect(feedback).toContainText('Correct');
    });

    test('incorrect answer shows red feedback containing "Incorrect"', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('wrong');
      await page.locator('#submitBtn').click();
      await responsePromise;

      const feedback = page.locator('#feedback');
      await expect(feedback).toBeVisible({ timeout: 5000 });
      await expect(feedback).toHaveClass(/incorrect/);
      await expect(feedback).toContainText('Incorrect');
    });

    test('incorrect feedback shows the correct answer hint', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('wrong');
      await page.locator('#submitBtn').click();
      await responsePromise;

      const feedback = page.locator('#feedback');
      await expect(feedback).toBeVisible({ timeout: 5000 });
      // The code appends "Answer: {correct_answer}." from the API response
      await expect(feedback).toContainText('correct_answer');
    });

    test('submit button and input are disabled while request is in flight', async ({ page }) => {
      await mockPuzzleApi(page, task.id);

      let resolveSubmit!: () => void;
      const submitPending = new Promise<void>((resolve) => { resolveSubmit = resolve; });

      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        // Hold the request until the test tells us to release it
        await submitPending;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: false, score: 0 }),
        });
      });

      await loadTaskPage(page, task.path);
      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 10000 },
      );
      await page.locator('#answerInput').fill('test');
      await page.locator('#submitBtn').click();

      // While request is still pending, input and button should be disabled
      await expect(page.locator('#answerInput')).toBeDisabled({ timeout: 2000 });
      await expect(page.locator('#submitBtn')).toBeDisabled({ timeout: 2000 });

      // Release the request and wait for it to complete
      resolveSubmit();
      await responsePromise;
    });
  });
}

// ============================================================================
// SUITE 5: STATS BAR UPDATES
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Stats bar updates`, () => {
    test('correct answer increments score and correct count', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, true);
      await loadTaskPage(page, task.path);

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('right');
      await page.locator('#submitBtn').click();
      await responsePromise;

      await expect(page.locator('#scoreDisplay')).toHaveText('100', { timeout: 3000 });
      await expect(page.locator('#correctDisplay')).toHaveText('1', { timeout: 3000 });
    });

    test('incorrect answer does not change score or correct count', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('wrong');
      await page.locator('#submitBtn').click();
      await responsePromise;

      await expect(page.locator('#scoreDisplay')).toHaveText('0', { timeout: 3000 });
      await expect(page.locator('#correctDisplay')).toHaveText('0', { timeout: 3000 });
    });

    test('puzzle number updates to 2/5 after first answer', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);

      await expect(page.locator('#puzzleNum')).toHaveText('1/5');

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('answer');
      await page.locator('#submitBtn').click();
      await responsePromise;

      // After 2.5 s the page advances to puzzle 2
      await expect(page.locator('#puzzleNum')).toHaveText('2/5', { timeout: 5000 });
    });
  });
}

// ============================================================================
// SUITE 6: PROGRESS BAR UPDATES
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Progress bar`, () => {
    test('progress bar advances to 20% after first puzzle answered', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);

      const fill = page.locator('#progressFill');
      // Confirm initial width is 0%
      let style = await fill.getAttribute('style');
      expect(style).toContain('0%');

      const responsePromise = page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 8000 },
      );
      await page.locator('#answerInput').fill('answer');
      await page.locator('#submitBtn').click();
      await responsePromise;

      // After advancing to puzzle 2, progress = 1/5 = 20%
      await expect(page.locator('#puzzleNum')).toHaveText('2/5', { timeout: 5000 });
      style = await fill.getAttribute('style');
      expect(style).toContain('20%');
    });

    test('progress bar reaches 100% after all 5 puzzles answered', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, true);
      await loadTaskPage(page, task.path);

      await answerAllPuzzles(page, task.id);

      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });
      const fill = page.locator('#progressFill');
      await expect(fill).toBeAttached();
      const style = await fill.getAttribute('style');
      expect(style).toContain('100%');
    });
  });
}

// ============================================================================
// SUITE 7: RESULTS SCREEN
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Results screen`, () => {
    test.beforeEach(async ({ page }) => {
      await mockPuzzleApi(page, task.id);
    });

    test('results screen appears after all 5 puzzles', async ({ page }) => {
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });
    });

    test('results screen shows "Challenge Complete!" heading', async ({ page }) => {
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#successScreen h2')).toContainText('Challenge Complete!');
    });

    test('final score matches sum of puzzle scores (3 correct = 300)', async ({ page }) => {
      let submitCount = 0;
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        const correct = submitCount < 3;
        submitCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: correct, score: correct ? 100 : 0, correct_answer: 'x' }),
        });
      });

      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      await expect(page.locator('#finalScore')).toHaveText('300');
    });

    test('correct count shows 3/5 when 3 answers are correct', async ({ page }) => {
      let submitCount = 0;
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        const correct = submitCount < 3;
        submitCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: correct, score: correct ? 100 : 0, correct_answer: 'x' }),
        });
      });

      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      await expect(page.locator('#finalCorrect')).toContainText('3/5');
    });

    test('accuracy shows 60% when 3/5 answers are correct', async ({ page }) => {
      let submitCount = 0;
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        const correct = submitCount < 3;
        submitCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: correct, score: correct ? 100 : 0, correct_answer: 'x' }),
        });
      });

      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      await expect(page.locator('#accuracy')).toHaveText('60%');
    });

    test('results screen shows timing info (total time and average)', async ({ page }) => {
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      await expect(page.locator('#finalTime')).toHaveText(/^\d+\.?\d*s$/);
      await expect(page.locator('#avgTime')).toHaveText(/^\d+\.?\d*s$/);
    });

    test('results screen shows the challenge-specific label', async ({ page }) => {
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#successScreen')).toContainText(task.successLabel);
    });

    test('results grid has exactly 5 boxes', async ({ page }) => {
      await mockSubmitApi(page, task.id, false);
      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      await expect(page.locator('#resultsGrid .result-box')).toHaveCount(5);
    });

    test('result boxes are correct (green) or incorrect (red) based on answers', async ({ page }) => {
      let submitCount = 0;
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        const correct = submitCount < 3;
        submitCount++;
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: correct, score: correct ? 100 : 0, correct_answer: 'x' }),
        });
      });

      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      const boxes = page.locator('#resultsGrid .result-box');
      await expect(boxes.nth(0)).toHaveClass(/correct/);
      await expect(boxes.nth(1)).toHaveClass(/correct/);
      await expect(boxes.nth(2)).toHaveClass(/correct/);
      await expect(boxes.nth(3)).toHaveClass(/incorrect/);
      await expect(boxes.nth(4)).toHaveClass(/incorrect/);
    });

    test('puzzle container is hidden when results screen is shown', async ({ page }) => {
      await mockSubmitApi(page, task.id, true);
      await loadTaskPage(page, task.path);
      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });
      await expect(page.locator('#puzzleContainer')).toBeHidden();
    });
  });
}

// ============================================================================
// SUITE 8: ERROR HANDLING — EMPTY SUBMISSION
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Error handling: empty submission`, () => {
    test('clicking Submit with empty input sets a pink border and does NOT call the API', async ({ page }) => {
      await mockPuzzleApi(page, task.id);

      const submitCalled: boolean[] = [];
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        submitCalled.push(true);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await loadTaskPage(page, task.path);

      const input = page.locator('#answerInput');
      await expect(input).toBeEmpty();

      await page.locator('#submitBtn').click();

      // Border color should be magenta (#FF00FF) per the validation code
      const borderColor = await input.evaluate((el: HTMLElement) => el.style.borderColor);
      expect(borderColor).toBe('rgb(255, 0, 255)');

      // No API call
      expect(submitCalled).toHaveLength(0);
    });

    test('pressing Enter with empty input does not call submit API', async ({ page }) => {
      await mockPuzzleApi(page, task.id);

      const submitCalled: boolean[] = [];
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        submitCalled.push(true);
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await loadTaskPage(page, task.path);

      await page.locator('#answerInput').focus();
      await page.keyboard.press('Enter');

      expect(submitCalled).toHaveLength(0);
    });

    test('feedback remains hidden after empty submit attempt', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        await route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
      });

      await loadTaskPage(page, task.path);
      await page.locator('#submitBtn').click();

      await expect(page.locator('#feedback')).toBeHidden();
    });
  });
}

// ============================================================================
// SUITE 9: ERROR HANDLING — NETWORK ERRORS
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Error handling: network errors`, () => {
    test('failed puzzle load shows error message in loading element', async ({ page }) => {
      await page.route(`**/api/games/${task.id}/puzzle**`, async (route) => {
        await route.abort('failed');
      });

      await page.goto(task.path);

      const loadingMsg = page.locator('#loadingMsg');
      await expect(loadingMsg).toBeVisible();

      // After all 5 fetch calls fail, the .catch() sets the loading text to an error
      await expect(loadingMsg).toHaveText(/Failed to load|fail|retry/i, { timeout: 8000 });
    });

    test('network error on submit re-enables input and button', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        await route.abort('failed');
      });

      await loadTaskPage(page, task.path);

      await page.locator('#answerInput').fill('some answer');
      await page.locator('#submitBtn').click();

      // After a network error the .catch() handler re-enables both elements
      await expect(page.locator('#answerInput')).toBeEnabled({ timeout: 5000 });
      await expect(page.locator('#submitBtn')).toBeEnabled({ timeout: 5000 });
    });

    test('code challenge: network error on submit shows "Network error." feedback', async ({ page }) => {
      // Only the code task page specifically adds a 'Network error.' message in its .catch()
      if (task.id !== 'code') {
        test.skip();
        return;
      }

      await mockPuzzleApi(page, task.id);
      await page.route(`**/api/games/${task.id}/submit`, async (route) => {
        await route.abort('failed');
      });

      await loadTaskPage(page, task.path);

      await page.locator('#answerInput').fill('some answer');
      await page.locator('#submitBtn').click();

      const feedback = page.locator('#feedback');
      await expect(feedback).toBeVisible({ timeout: 5000 });
      await expect(feedback).toContainText('Network error');
      await expect(feedback).toHaveClass(/incorrect/);
    });
  });
}

// ============================================================================
// SUITE 10: KEYBOARD INTERACTION
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Keyboard interaction`, () => {
    test('pressing Enter in the input field submits the answer', async ({ page }) => {
      await mockPuzzleApi(page, task.id);

      const submittedAnswers: string[] = [];
      await page.route(`**/api/games/${task.id}/submit`, async (route, request) => {
        const body = request.postDataJSON() as Record<string, unknown>;
        submittedAnswers.push(body.answer as string);
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ is_correct: false, score: 0, correct_answer: 'x' }),
        });
      });

      await loadTaskPage(page, task.path);

      await page.locator('#answerInput').fill('keyboard_submit');
      await page.keyboard.press('Enter');

      await page.waitForResponse(
        (resp) => resp.url().includes(`/api/games/${task.id}/submit`),
        { timeout: 5000 },
      );

      expect(submittedAnswers).toContain('keyboard_submit');
    });
  });
}

// ============================================================================
// SUITE 11: SCREENSHOTS AT KEY MOMENTS
// ============================================================================

for (const task of TASK_PAGES) {
  test.describe(`[${task.id}] Screenshots`, () => {
    test('screenshot: initial puzzle state', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await loadTaskPage(page, task.path);
      await page.screenshot({
        path: `./e2e/screenshots/${task.id}-01-initial.png`,
        fullPage: true,
      });
    });

    test('screenshot: correct feedback after submit', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, true);
      await loadTaskPage(page, task.path);

      await page.locator('#answerInput').fill('correct');
      await page.locator('#submitBtn').click();
      await expect(page.locator('#feedback')).toBeVisible({ timeout: 5000 });

      await page.screenshot({
        path: `./e2e/screenshots/${task.id}-02-correct-feedback.png`,
        fullPage: true,
      });
    });

    test('screenshot: results screen', async ({ page }) => {
      await mockPuzzleApi(page, task.id);
      await mockSubmitApi(page, task.id, true);
      await loadTaskPage(page, task.path);

      await answerAllPuzzles(page, task.id);
      await expect(page.locator('#successScreen')).toBeVisible({ timeout: 5000 });

      await page.screenshot({
        path: `./e2e/screenshots/${task.id}-03-results.png`,
        fullPage: true,
      });
    });
  });
}
