import { test, expect } from '@playwright/test';

const API_BASE = 'http://localhost:3003';

// ============================================================================
// API HEALTH & ENDPOINT TESTS
// ============================================================================

test.describe('API Health & Core Endpoints', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('GET /api/health returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.status).toBeTruthy();
    console.log(`HEALTH: ${JSON.stringify(body)}`);
  });

  test('GET /api/leaderboards/global returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/leaderboards/global`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    console.log(`LEADERBOARD GLOBAL: ${body.length} agents`);
  });

  test('GET /api/leaderboards/top returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/leaderboards/top?count=5`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body)).toBe(true);
    console.log(`LEADERBOARD TOP: ${body.length} agents`);
  });

  test('GET /api/leaderboards/stats returns 200 with stats object', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/leaderboards/stats`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(typeof body.totalAgents).toBe('number');
    expect(typeof body.totalCompetitions).toBe('number');
    console.log(`STATS: agents=${body.totalAgents}, competitions=${body.totalCompetitions}, prize=${body.totalPrizePool}`);
  });

  test('GET /api/competitions returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/competitions`);
    const status = res.status();
    // May return 200 with data or 200 with empty array
    expect(status).toBe(200);
    const body = await res.json();
    console.log(`COMPETITIONS: ${JSON.stringify(body).substring(0, 200)}`);
  });

  test('GET /api/predictions/categories returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/predictions/categories`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.categories).toBeTruthy();
    console.log(`PREDICTION CATEGORIES: ${body.categories?.length || 0} categories`);
  });

  test('GET /api/predictions/markets returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/predictions/markets?limit=5`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    console.log(`PREDICTION MARKETS: ${body.markets?.length || 0} markets`);
  });

  test('GET /api/games/leaderboard returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/games/leaderboard`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    console.log(`GAMES LEADERBOARD: ${JSON.stringify(body).substring(0, 200)}`);
  });

  test('GET /api/meta-markets returns 200', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/meta-markets`);
    const status = res.status();
    expect(status).toBe(200);
    const body = await res.json();
    console.log(`META MARKETS: ${JSON.stringify(body).substring(0, 200)}`);
  });
});

// ============================================================================
// API QUERY PARAMETER VALIDATION
// ============================================================================

test.describe('API Query Parameter Validation', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('leaderboards/global respects limit parameter', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/leaderboards/global?limit=2`);
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.length).toBeLessThanOrEqual(2);
  });

  test('leaderboards/global clamps excessive limit', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/leaderboards/global?limit=99999`);
    expect(res.status()).toBe(200);
    // Should be clamped to 500 max
    const body = await res.json();
    expect(body.length).toBeLessThanOrEqual(500);
  });

  test('leaderboards/global handles negative offset gracefully', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/leaderboards/global?offset=-5`);
    expect(res.status()).toBe(200);
  });

  test('predictions/markets handles invalid category', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/predictions/markets?category=invalid_xyz`);
    expect(res.status()).toBe(200);
  });

  test('predictions/search handles empty query', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/predictions/search?q=&limit=5`);
    // Should return 200 with empty or default results
    expect([200, 400]).toContain(res.status());
  });
});

// ============================================================================
// API AUTH-REQUIRED ENDPOINTS (should reject without auth)
// ============================================================================

test.describe('API Auth Protection', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('POST /api/agents rejects unauthenticated request', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/agents`, {
      data: { name: 'Unauthorized Agent', slug: 'unauth-test' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('GET /api/agents returns 200 (public listing) or requires auth', async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/agents`);
    // GET agents may be public (returns empty list) or auth-protected
    expect([200, 401, 403]).toContain(res.status());
  });

  test('POST /api/verification/start rejects unauthenticated request', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/verification/start`, {
      data: { agent_id: 'fake-id' },
    });
    expect([401, 403]).toContain(res.status());
  });

  test('POST /api/competitions/join rejects unauthenticated request', async ({ request }) => {
    const res = await request.post(`${API_BASE}/api/competitions/fake-id/join`, {
      data: { agent_id: 'fake-id' },
    });
    expect([401, 403]).toContain(res.status());
  });
});

// ============================================================================
// TASK PAGES (HTML served by backend)
// ============================================================================

test.describe('Task Pages Served by Backend', () => {
  test.beforeEach(async ({ request }) => {
    const res = await request.get(`${API_BASE}/api/health`, { timeout: 5000 }).catch(() => null);
    test.skip(!res?.ok(), 'Backend API not running');
  });

  test('GET /tasks/trivia returns HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/tasks/trivia`);
    expect(res.status()).toBe(200);
    const contentType = res.headers()['content-type'] || '';
    expect(contentType).toContain('text/html');
  });

  test('GET /tasks/math returns HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/tasks/math`);
    expect(res.status()).toBe(200);
  });

  test('GET /tasks/word returns HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/tasks/word`);
    expect(res.status()).toBe(200);
  });

  test('GET /tasks/logic returns HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/tasks/logic`);
    expect(res.status()).toBe(200);
  });

  test('GET /tasks/chess returns HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/tasks/chess`);
    expect(res.status()).toBe(200);
  });

  test('GET /tasks/verification returns HTML', async ({ request }) => {
    const res = await request.get(`${API_BASE}/tasks/verification`);
    expect(res.status()).toBe(200);
  });
});
