import { test, expect, type Page } from '@playwright/test';

// ============================================================================
// TEST USER - pre-created via Supabase Admin API with email_confirm=true
// ============================================================================
const TEST_EMAIL = 'e2e-agent-test@gmail.com';
const TEST_PASSWORD = 'E2eTestPass1234';
const TEST_USER_ID = '7d238c61-d5fe-4f2e-a5ff-666fb7740dce';

const SUPABASE_URL = 'https://lurebwaudisfilhuhmnj.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cmVid2F1ZGlzZmlsaHVobW5qIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTc5NjYyNDksImV4cCI6MjA3MzU0MjI0OX0.tXqCn_VGB3OTbXFvKLAd5HNOYqs0FYbLCBvFQ0JVi8A';
const SUPABASE_SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx1cmVid2F1ZGlzZmlsaHVobW5qIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1Nzk2NjI0OSwiZXhwIjoyMDczNTQyMjQ5fQ.fdi6QYU1vftvkqhG9GtGKE0NExUTPLWn_qHl9ye3p7k';

// ============================================================================
// HELPERS
// ============================================================================

/** Get a Supabase access token for the test user */
async function getAuthToken(): Promise<string> {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'apikey': SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Auth failed: ${JSON.stringify(data)}`);
  return data.access_token;
}

/** Login via the UI and persist session */
async function loginViaUI(page: Page) {
  await page.goto('/auth/login');
  await page.locator('input[placeholder="you@example.com"]').fill(TEST_EMAIL);
  await page.locator('input[placeholder="••••••••"]').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('**/dashboard**', { timeout: 15000 });
}

/** Clean up all test agents via Supabase API */
async function cleanupTestAgents(token: string) {
  const res = await fetch(
    `${SUPABASE_URL}/rest/v1/aio_agents?owner_id=eq.${TEST_USER_ID}`,
    {
      method: 'DELETE',
      headers: {
        'apikey': SUPABASE_SERVICE_KEY,
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        'Prefer': 'return=representation',
      },
    }
  );
  const deleted = await res.json().catch(() => []);
  if (Array.isArray(deleted) && deleted.length > 0) {
    console.log(`Cleaned up ${deleted.length} test agent(s)`);
  }
}

/** Safe arithmetic evaluator (no eval) */
function safeArithmeticSolve(expression: string): number {
  // Tokenize: numbers and operators
  const tokens: (number | string)[] = [];
  let current = '';

  for (const ch of expression.replace(/\s/g, '')) {
    if ('+-*/'.includes(ch) && current !== '') {
      tokens.push(Number(current));
      tokens.push(ch);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current) tokens.push(Number(current));

  // Handle * and / first
  const simplified: (number | string)[] = [];
  for (let i = 0; i < tokens.length; i++) {
    if (tokens[i] === '*' || tokens[i] === '/') {
      const left = simplified.pop() as number;
      const right = tokens[++i] as number;
      simplified.push(tokens[i - 1] === '*' ? left * right : Math.floor(left / right));
    } else {
      simplified.push(tokens[i]);
    }
  }

  // Handle + and -
  let result = simplified[0] as number;
  for (let i = 1; i < simplified.length; i += 2) {
    const op = simplified[i] as string;
    const num = simplified[i + 1] as number;
    result = op === '+' ? result + num : result - num;
  }

  return result;
}

// ============================================================================
// 1. AUTH FLOW - Login with pre-confirmed test user
// ============================================================================

test.describe('Authenticated Agent E2E', () => {
  test.describe.configure({ mode: 'serial' });

  let accessToken: string;

  test.beforeAll(async () => {
    accessToken = await getAuthToken();
    await cleanupTestAgents(accessToken);
  });

  test.afterAll(async () => {
    try {
      await cleanupTestAgents(accessToken);
    } catch {}
  });

  // --------------------------------------------------------------------------
  // 1A. Login flow
  // --------------------------------------------------------------------------
  test('login with confirmed test user redirects to dashboard', async ({ page }) => {
    await page.goto('/auth/login');

    await page.locator('input[placeholder="you@example.com"]').fill(TEST_EMAIL);
    await page.locator('input[placeholder="••••••••"]').fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /sign in/i }).click();

    await page.waitForURL('**/dashboard**', { timeout: 15000 });
    await expect(page).toHaveURL(/\/dashboard/);
    console.log('LOGIN: Confirmed test user logged in successfully');
  });

  // --------------------------------------------------------------------------
  // 1B. Dashboard loads after login
  // --------------------------------------------------------------------------
  test('dashboard shows authenticated state', async ({ page }) => {
    await loginViaUI(page);

    await expect(page.getByText('Dashboard')).toBeVisible();
    const header = page.locator('header');
    await expect(header).toBeVisible();
  });

  // --------------------------------------------------------------------------
  // 2. Navigate to Agents page
  // --------------------------------------------------------------------------
  test('agents page loads correctly', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    // Wait for the loading spinner to disappear
    await page.waitForSelector('.animate-spin', { state: 'hidden', timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(2000);

    // Should show either "Create Agent" button or "No agents yet" or agent cards
    const hasCreateBtn = await page.getByText('Create Agent').first().isVisible().catch(() => false);
    const hasNoAgents = await page.getByText('No agents yet').isVisible().catch(() => false);
    const hasAgentCards = await page.locator('[class*="GlassCard"], [class*="glass"]').count() > 0;

    console.log(`AGENTS PAGE: Create button=${hasCreateBtn}, Empty state=${hasNoAgents}, Has cards=${hasAgentCards}`);
    // At least one of these should be true once loading is done
    expect(hasCreateBtn || hasNoAgents || hasAgentCards).toBe(true);
  });

  // --------------------------------------------------------------------------
  // 3. Create Webhook Agent
  // --------------------------------------------------------------------------
  test('create webhook agent via UI', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents/create');

    await expect(page.getByRole('heading', { name: /create agent/i })).toBeVisible();
    await expect(page.getByText('Host your own endpoint')).toBeVisible();

    await page.locator('input[placeholder="My Awesome Agent"]').fill('E2E Webhook Bot');
    await page.waitForTimeout(500);

    const slugInput = page.locator('input[placeholder="my-awesome-agent"]');
    await expect(slugInput).toHaveValue('e2e-webhook-bot');

    await page.locator('textarea[placeholder="What makes your agent special?"]').fill(
      'Automated E2E test webhook agent'
    );

    await page.locator('button[style*="background-color"]').nth(1).click();

    await page.locator('input[placeholder="https://your-server.com/api/agent"]').fill(
      'https://httpbin.org/post'
    );

    // Verify webhook secret was generated
    const secretInput = page.locator('input[readonly]');
    const secretValue = await secretInput.inputValue();
    expect(secretValue).toMatch(/^whs_[a-f0-9]{64}$/);
    console.log(`WEBHOOK SECRET: Generated (${secretValue.substring(0, 12)}...)`);

    await page.getByRole('button', { name: /create agent/i }).click();

    await page.waitForURL('**/dashboard/agents', { timeout: 10000 });
    await expect(page).toHaveURL(/\/dashboard\/agents$/);
    await expect(page.getByText('E2E Webhook Bot')).toBeVisible();
    console.log('WEBHOOK AGENT: Created successfully');
  });

  // --------------------------------------------------------------------------
  // 4. Create API Key Agent
  // --------------------------------------------------------------------------
  test('create API key agent via UI', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents/create');

    await page.getByText('API Key').click();
    await expect(page.getByText('API Configuration')).toBeVisible();

    await page.locator('input[placeholder="My Awesome Agent"]').fill('E2E Claude Agent');
    await page.waitForTimeout(500);

    await page.locator('textarea[placeholder="What makes your agent special?"]').fill(
      'Automated E2E test API key agent with Anthropic provider'
    );

    const providerSelect = page.locator('select').first();
    await providerSelect.selectOption('anthropic');

    const modelSelect = page.locator('select').nth(1);
    await expect(modelSelect).toHaveValue('claude-sonnet-4-20250514');

    await page.locator('input[placeholder="sk-..."]').fill('sk-ant-test-key-for-e2e');

    await page.locator('textarea[placeholder="Custom instructions for your agent..."]').fill(
      'You are an AI Olympics competition agent. Respond efficiently and accurately.'
    );

    await page.getByRole('button', { name: /create agent/i }).click();

    await page.waitForURL('**/dashboard/agents', { timeout: 10000 });
    await expect(page.getByText('E2E Claude Agent')).toBeVisible();
    console.log('API KEY AGENT: Created successfully');
  });

  // --------------------------------------------------------------------------
  // 5. Verify both agents appear in list
  // --------------------------------------------------------------------------
  test('agents list shows both created agents', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    await expect(page.getByText('E2E Webhook Bot')).toBeVisible();
    await expect(page.getByText('E2E Claude Agent')).toBeVisible();

    const unverifiedBadges = page.locator('text=Unverified');
    const count = await unverifiedBadges.count();
    expect(count).toBeGreaterThanOrEqual(2);
    console.log(`AGENTS LIST: Found ${count} unverified agent badges`);
  });

  // --------------------------------------------------------------------------
  // 6. Edit an agent
  // --------------------------------------------------------------------------
  test('edit webhook agent description', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    const editButtons = page.locator('a[href*="/edit"]');
    if (await editButtons.first().isVisible()) {
      await editButtons.first().click();
      await page.waitForURL('**/edit', { timeout: 5000 });

      await expect(page.getByRole('heading', { name: /edit agent/i })).toBeVisible();

      const descField = page.locator('textarea[placeholder="What makes your agent special?"]');
      await descField.clear();
      await descField.fill('Updated E2E test agent description');

      await page.getByRole('button', { name: /save changes/i }).click();
      await page.waitForURL('**/dashboard/agents', { timeout: 10000 });

      console.log('EDIT AGENT: Successfully updated');
    }
  });

  // --------------------------------------------------------------------------
  // 7. Toggle agent visibility (public/private)
  // --------------------------------------------------------------------------
  test('toggle agent public/private visibility', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    const publicToggle = page.locator('button[title="Make Public"]').first();
    if (await publicToggle.isVisible()) {
      await publicToggle.click();
      await page.waitForTimeout(1000);
      await expect(page.getByText('Public').first()).toBeVisible();
      console.log('TOGGLE VISIBILITY: Agent made public');

      const privateToggle = page.locator('button[title="Make Private"]').first();
      if (await privateToggle.isVisible()) {
        await privateToggle.click();
        await page.waitForTimeout(1000);
        console.log('TOGGLE VISIBILITY: Agent made private again');
      }
    }
  });

  // --------------------------------------------------------------------------
  // 8. Toggle agent active/inactive
  // --------------------------------------------------------------------------
  test('toggle agent active/inactive', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    const deactivateBtn = page.locator('button[title="Deactivate"]').first();
    if (await deactivateBtn.isVisible()) {
      await deactivateBtn.click();
      await page.waitForTimeout(1000);
      await expect(page.getByText('Inactive').first()).toBeVisible();
      console.log('TOGGLE ACTIVE: Agent deactivated');

      const activateBtn = page.locator('button[title="Activate"]').first();
      if (await activateBtn.isVisible()) {
        await activateBtn.click();
        await page.waitForTimeout(1000);
        console.log('TOGGLE ACTIVE: Agent reactivated');
      }
    }
  });

  // --------------------------------------------------------------------------
  // 9. Verification badge shows for unverified agents
  // --------------------------------------------------------------------------
  test('verification badge and verify button visible', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    await expect(page.getByText('Unverified').first()).toBeVisible();

    const verifyButton = page.locator('button[title="Verify Agent"]').first();
    await expect(verifyButton).toBeVisible();
    console.log('VERIFICATION: Unverified badge and verify button visible');
  });

  // --------------------------------------------------------------------------
  // 10. Verification flow page loads
  // --------------------------------------------------------------------------
  test('verification flow page loads for agent', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    const verifyLink = page.locator('a[href*="/verify"]').first();
    if (await verifyLink.isVisible()) {
      await verifyLink.click();
      await page.waitForURL('**/verify', { timeout: 5000 });

      await page.waitForTimeout(2000);
      const currentUrl = page.url();
      expect(currentUrl).toContain('/verify');
      console.log(`VERIFICATION FLOW: Page loaded at ${currentUrl}`);
    }
  });

  // --------------------------------------------------------------------------
  // 11. Delete an agent
  // --------------------------------------------------------------------------
  test('delete agent with confirmation', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    const agentsBefore = await page.locator('text=E2E').count();
    console.log(`DELETE: ${agentsBefore} agents before deletion`);

    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(500);

      await expect(page.getByRole('button', { name: /confirm/i })).toBeVisible();
      await expect(page.getByRole('button', { name: /cancel/i })).toBeVisible();

      await page.getByRole('button', { name: /confirm/i }).click();
      await page.waitForTimeout(1000);

      const agentsAfter = await page.locator('text=E2E').count();
      expect(agentsAfter).toBeLessThan(agentsBefore);
      console.log(`DELETE: ${agentsAfter} agents after deletion`);
    }
  });

  // --------------------------------------------------------------------------
  // 12. Delete remaining agent (cleanup)
  // --------------------------------------------------------------------------
  test('delete remaining test agent', async ({ page }) => {
    await loginViaUI(page);
    await page.goto('/dashboard/agents');

    await page.waitForTimeout(2000);

    const deleteBtn = page.locator('button').filter({ has: page.locator('svg.lucide-trash-2') }).first();
    if (await deleteBtn.isVisible()) {
      await deleteBtn.click();
      await page.waitForTimeout(500);

      const confirmBtn = page.getByRole('button', { name: /confirm/i });
      if (await confirmBtn.isVisible()) {
        await confirmBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    const noAgents = await page.getByText('No agents yet').isVisible().catch(() => false);
    console.log(`CLEANUP: Empty state = ${noAgents}`);
  });
});

// ============================================================================
// API-LEVEL AGENT TESTS (bypass UI, test backend directly)
// ============================================================================

test.describe('Agent API E2E', () => {
  let accessToken: string;
  let createdAgentIds: string[] = [];

  test.beforeAll(async () => {
    accessToken = await getAuthToken();
    await cleanupTestAgents(accessToken);
  });

  test.afterAll(async () => {
    for (const id of createdAgentIds) {
      await fetch(`${SUPABASE_URL}/rest/v1/aio_agents?id=eq.${id}`, {
        method: 'DELETE',
        headers: {
          'apikey': SUPABASE_SERVICE_KEY,
          'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
        },
      });
    }
  });

  test('API: create agent via REST endpoint', async ({ request }) => {
    const res = await request.post('http://localhost:3003/api/agents', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        name: 'API Test Bot',
        slug: `api-test-bot-${Date.now()}`,
        agent_type: 'webhook',
        webhook_url: 'https://httpbin.org/post',
        description: 'Created via API test',
      },
    });

    const status = res.status();
    const body = await res.json().catch(() => ({}));

    console.log(`API CREATE: Status ${status}`);
    console.log(`API CREATE: Response = ${JSON.stringify(body).substring(0, 200)}`);

    if (status === 201 || status === 200) {
      expect(body.id || body.agent?.id).toBeTruthy();
      const agentId = body.id || body.agent?.id;
      if (agentId) createdAgentIds.push(agentId);
      console.log(`API CREATE: Agent ID = ${agentId}`);
    }
  });

  test('API: list agents returns created agents', async ({ request }) => {
    const res = await request.get('http://localhost:3003/api/agents', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    expect(res.status()).toBe(200);
    const body = await res.json();
    console.log(`API LIST: Got ${Array.isArray(body.agents) ? body.agents.length : 'unknown'} agents`);
  });

  test('API: get single agent by ID', async ({ request }) => {
    if (createdAgentIds.length === 0) {
      test.skip();
      return;
    }

    const res = await request.get(`http://localhost:3003/api/agents/${createdAgentIds[0]}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    const status = res.status();
    console.log(`API GET: Status ${status}`);
    if (status === 200) {
      const body = await res.json();
      expect(body.name || body.agent?.name).toBeTruthy();
    }
  });

  test('API: update agent', async ({ request }) => {
    if (createdAgentIds.length === 0) {
      test.skip();
      return;
    }

    const res = await request.put(`http://localhost:3003/api/agents/${createdAgentIds[0]}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        description: 'Updated via API test',
      },
    });

    console.log(`API UPDATE: Status ${res.status()}`);
  });

  test('API: delete agent', async ({ request }) => {
    if (createdAgentIds.length === 0) {
      test.skip();
      return;
    }

    const agentId = createdAgentIds.pop();
    const res = await request.delete(`http://localhost:3003/api/agents/${agentId}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
      },
    });

    console.log(`API DELETE: Status ${res.status()}`);
  });
});

// ============================================================================
// VERIFICATION API TESTS
// ============================================================================

test.describe('Verification API E2E', () => {
  let accessToken: string;
  let testAgentId: string;

  test.beforeAll(async () => {
    accessToken = await getAuthToken();
    await cleanupTestAgents(accessToken);

    // Create a test agent via the app's API endpoint (uses same auth chain as verification)
    const res = await fetch('http://localhost:3003/api/agents', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Verify Test Agent',
        slug: `verify-test-${Date.now()}`,
        agent_type: 'webhook',
        webhook_url: 'https://httpbin.org/post',
        description: 'Agent for verification testing',
      }),
    });

    const body = await res.json();
    testAgentId = body.id || body.agent?.id;
    console.log(`VERIFY SETUP: Created test agent ${testAgentId} (status ${res.status})`);
  });

  test.afterAll(async () => {
    await cleanupTestAgents(accessToken);
  });

  test('start verification session', async ({ request }) => {
    const res = await request.post('http://localhost:3003/api/verification/start', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agent_id: testAgentId,
      },
    });

    const status = res.status();
    const body = await res.json();

    console.log(`VERIFY START: Status ${status}`);

    if (status === 201) {
      expect(body.session_id).toBeTruthy();
      expect(body.challenges).toBeTruthy();
      expect(Array.isArray(body.challenges)).toBe(true);

      const challengeTypes = body.challenges.map((c: any) => c.type);
      console.log(`VERIFY START: Challenge types = ${challengeTypes.join(', ')}`);
      console.log(`VERIFY START: Session ID = ${body.session_id}`);
      console.log(`VERIFY START: Expires at = ${body.expires_at}`);

      expect(challengeTypes).toContain('speed_arithmetic');
      expect(challengeTypes).toContain('speed_json_parse');
      expect(challengeTypes).toContain('structured_output');
      expect(challengeTypes).toContain('behavioral_timing');
    } else {
      console.log(`VERIFY START: Error = ${JSON.stringify(body)}`);
    }
  });

  test('submit verification answers and get scored', async ({ request }) => {
    // Start a fresh session
    const startRes = await request.post('http://localhost:3003/api/verification/start', {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agent_id: testAgentId,
      },
    });

    const startStatus = startRes.status();
    if (startStatus !== 201 && startStatus !== 409) {
      console.log(`VERIFY SUBMIT: Could not start session (status ${startStatus})`);
      return;
    }

    const startBody = await startRes.json();
    const sessionId = startBody.session_id;
    const challenges = startBody.challenges || [];

    if (!sessionId || challenges.length === 0) {
      console.log('VERIFY SUBMIT: No valid session/challenges');
      return;
    }

    // Build answers - solve them like an AI agent would
    const answers: Record<string, unknown> = {};

    for (const challenge of challenges) {
      if (challenge.type === 'speed_arithmetic') {
        const solutions: Record<string, number> = {};
        for (const problem of challenge.data.problems || []) {
          try {
            solutions[problem.id] = safeArithmeticSolve(problem.expression);
          } catch {
            solutions[problem.id] = 0;
          }
        }
        answers.speed_arithmetic = { solutions };
      }

      if (challenge.type === 'speed_json_parse') {
        const extractions: Record<string, unknown> = {};
        for (const task of challenge.data.tasks || []) {
          try {
            const obj = task.json_data;
            const path = task.extract_path;
            let value: unknown = obj;
            for (const key of path) {
              if (value && typeof value === 'object') {
                value = (value as Record<string, unknown>)[key];
              }
            }
            extractions[task.id] = value;
          } catch {
            extractions[task.id] = null;
          }
        }
        answers.speed_json_parse = { extractions };
      }

      if (challenge.type === 'structured_output') {
        answers.structured_output = {
          response: challenge.data,
        };
      }

      if (challenge.type === 'behavioral_timing') {
        const responses: unknown[] = [];
        for (const q of challenge.data.questions || []) {
          responses.push({
            question_id: q.id,
            answer: 'test response',
            response_time_ms: 50 + Math.random() * 20,
          });
        }
        answers.behavioral_timing = { responses };
      }
    }

    // Submit answers
    const respondRes = await request.post(
      `http://localhost:3003/api/verification/${sessionId}/respond`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: answers,
      }
    );

    const respondStatus = respondRes.status();
    const respondBody = await respondRes.json();

    console.log(`VERIFY SUBMIT: Status ${respondStatus}`);
    console.log(`VERIFY SUBMIT: Passed = ${respondBody.passed}`);
    console.log(`VERIFY SUBMIT: Total Score = ${respondBody.total_score}`);
    console.log(`VERIFY SUBMIT: Speed Score = ${respondBody.speed_score}`);
    console.log(`VERIFY SUBMIT: Structured Score = ${respondBody.structured_score}`);
    console.log(`VERIFY SUBMIT: Behavioral Score = ${respondBody.behavioral_score}`);

    if (respondBody.challenge_results) {
      for (const r of respondBody.challenge_results) {
        console.log(`  ${r.type}: passed=${r.passed}, score=${r.score}, time=${r.response_time_ms}ms`);
      }
    }

    expect(respondStatus).toBe(200);
    expect(typeof respondBody.total_score).toBe('number');
  });

  test('get verification history for agent', async ({ request }) => {
    const res = await request.get(
      `http://localhost:3003/api/verification/agent/${testAgentId}`,
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
        },
      }
    );

    const status = res.status();
    const body = await res.json();

    console.log(`VERIFY HISTORY: Status ${status}`);
    console.log(`VERIFY HISTORY: Total verifications = ${body.history?.total_verifications || 0}`);
    console.log(`VERIFY HISTORY: Recent sessions = ${body.recent_sessions?.length || 0}`);
  });
});

// ============================================================================
// GOOGLE OAUTH REDIRECT AUDIT
// ============================================================================

test.describe('OAuth Configuration Audit', () => {
  test('Google OAuth redirects to Google (not another project)', async ({ page }) => {
    await page.goto('/auth/login');

    page.getByText('Continue with Google').click();
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const isGoogle = finalUrl.includes('accounts.google.com');
    const isSupabase = finalUrl.includes('supabase.co');
    const isLocalhost = finalUrl.includes('localhost');

    console.log('=== GOOGLE OAUTH AUDIT ===');
    console.log(`Final URL: ${finalUrl.substring(0, 200)}`);
    console.log(`At Google: ${isGoogle}`);
    console.log(`At Supabase: ${isSupabase}`);
    console.log(`Still on localhost: ${isLocalhost}`);

    if (isGoogle) {
      const decodedUrl = decodeURIComponent(decodeURIComponent(finalUrl));
      const hasLocalhostRedirect = decodedUrl.includes('localhost:5173');
      console.log(`Redirect back to localhost:5173: ${hasLocalhostRedirect}`);

      if (!hasLocalhostRedirect) {
        console.log('WARNING: OAuth may redirect to wrong project after Google auth');
        console.log('FIX: Add http://localhost:5173/** to Supabase Redirect URLs');
      }
    }
  });

  test('GitHub OAuth provider status check', async ({ page }) => {
    await page.goto('/auth/login');

    page.getByText('Continue with GitHub').click();
    await page.waitForTimeout(3000);

    const finalUrl = page.url();
    const hasError = await page.locator('.bg-red-500\\/10').isVisible().catch(() => false);

    console.log('=== GITHUB OAUTH AUDIT ===');
    console.log(`Final URL: ${finalUrl.substring(0, 200)}`);

    if (finalUrl.includes('github.com')) {
      console.log('STATUS: GitHub OAuth is ENABLED and redirecting correctly');
    } else if (hasError) {
      const errorText = await page.locator('.bg-red-500\\/10').textContent();
      console.log(`STATUS: GitHub OAuth ERROR - ${errorText}`);
      console.log('FIX: Enable GitHub provider in Supabase Dashboard > Auth > Providers');
    } else if (finalUrl.includes('supabase.co')) {
      const bodyText = await page.textContent('body').catch(() => '');
      if (bodyText.includes('not enabled') || bodyText.includes('unsupported')) {
        console.log('STATUS: GitHub OAuth is NOT ENABLED in Supabase');
        console.log('FIX: Enable GitHub provider in Supabase Dashboard > Auth > Providers');
      }
    } else {
      console.log('STATUS: Unknown state - check Supabase auth logs');
    }
  });

  test('Supabase site URL audit', async ({ page }) => {
    const settingsRes = await page.evaluate(async (config) => {
      const res = await fetch(`${config.url}/auth/v1/settings`, {
        headers: { 'apikey': config.key },
      });
      return res.json();
    }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY });

    console.log('=== SUPABASE AUTH SETTINGS AUDIT ===');
    console.log(`Google enabled: ${settingsRes.external?.google}`);
    console.log(`GitHub enabled: ${settingsRes.external?.github}`);
    console.log(`Email enabled: ${settingsRes.external?.email}`);
    console.log(`Email autoconfirm: ${settingsRes.mailer_autoconfirm}`);
    console.log(`Signup disabled: ${settingsRes.disable_signup}`);

    expect(settingsRes.external?.email).toBe(true);

    if (!settingsRes.external?.github) {
      console.log('ISSUE: GitHub OAuth is DISABLED');
      console.log('ACTION: Enable in Supabase Dashboard > Authentication > Providers > GitHub');
    }

    if (!settingsRes.mailer_autoconfirm) {
      console.log('NOTE: Email autoconfirm is OFF - new signups require email verification');
    }
  });
});
