/**
 * Gauntlet end-to-end smoke test.
 * Uses Playwright bundled Chromium + Supabase magic link auth.
 * Run: npx tsx e2e-smoke-gauntlet.ts
 */
import { chromium } from 'playwright';
import * as https from 'https';

const FRONTEND_URL = 'https://ai-olympics.vercel.app';
const API_URL = 'https://ai-olympics-api.fly.dev';
const SUPABASE_URL = 'https://sujsmwoaxurlyxjossid.supabase.co';
const SERVICE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InN1anNtd29heHVybHl4am9zc2lkIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3MDI0NTE1MiwiZXhwIjoyMDg1ODIxMTUyfQ.NAeDey8RuR44Uyb-Tg5Tba_L6YkUbb5NG0TmduEUwFY';
const TEST_EMAIL = 'stefanogebara@gmail.com';
const TEST_API_KEY = process.env.ANTHROPIC_API_KEY ?? '';

function httpsPost(hostname: string, path: string, body: string, headers: Record<string, string>): Promise<{ status: number; data: string }> {
  return new Promise((resolve, reject) => {
    const req = https.request({ hostname, path, method: 'POST', headers: { ...headers, 'Content-Length': Buffer.byteLength(body) } }, (res) => {
      let data = '';
      res.on('data', d => data += d);
      res.on('end', () => resolve({ status: res.statusCode ?? 0, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function getMagicLink(): Promise<string> {
  const body = JSON.stringify({ email: TEST_EMAIL, type: 'magiclink' });
  const { data } = await httpsPost(
    new URL(SUPABASE_URL).hostname,
    '/auth/v1/admin/generate_link',
    body,
    { 'Authorization': `Bearer ${SERVICE_KEY}`, 'apikey': SERVICE_KEY, 'Content-Type': 'application/json' }
  );
  const parsed = JSON.parse(data);
  if (!parsed.action_link) throw new Error('No action_link in response');
  return parsed.action_link;
}

async function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

async function main() {
  console.log('=== AI Olympics Gauntlet Smoke Test ===\n');

  // ── Step 1: Generate magic link ────────────────────────────────────────
  console.log('1. Generating magic link for', TEST_EMAIL, '...');
  const magicLink = await getMagicLink();
  console.log('   ✓ Magic link obtained');

  // ── Step 2: Launch Playwright Chromium, visit magic link ───────────────
  console.log('\n2. Launching browser + visiting magic link...');
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext();
  const page = await ctx.newPage();

  try {
    // Visit magic link — Supabase will redirect to /auth/callback with tokens in URL hash
    // The React app will consume the hash and store in localStorage
    await page.goto(magicLink, { waitUntil: 'domcontentloaded', timeout: 30_000 });
    // Capture hash BEFORE React consumes it
    const urlAfter = page.url();
    const hashParams = new URLSearchParams(urlAfter.split('#')[1] ?? '');
    const hashToken = hashParams.get('access_token');
    console.log('   URL after magic link:', urlAfter.substring(0, 80));
    if (hashToken) {
      console.log(`   ✓ Token found in URL hash (${hashToken.substring(0, 20)}...)`);
      await runTest(page, hashToken);
      return;
    }

    // Wait for React to process and store in localStorage
    await sleep(5000);
    await page.screenshot({ path: 'smoke-1-auth.png' });

    // Extract access_token from localStorage
    const token: string | null = await page.evaluate(() => {
      const allKeys = Object.keys(localStorage);
      console.log('localStorage keys:', allKeys.join(', '));
      for (const key of allKeys) {
        try {
          const raw = localStorage.getItem(key) ?? '';
          if (raw.includes('access_token')) {
            const val = JSON.parse(raw);
            return val?.access_token ?? val?.session?.access_token ?? null;
          }
        } catch { /* skip */ }
      }
      return null;
    });

    if (!token) {
      // Last resort: check cookies or session storage
      const sessionToken: string | null = await page.evaluate(() => {
        for (const key of Object.keys(sessionStorage)) {
          try {
            const val = JSON.parse(sessionStorage.getItem(key) ?? '{}');
            const t = val?.access_token ?? val?.session?.access_token;
            if (t) return t;
          } catch { /* skip */ }
        }
        return null;
      });
      if (sessionToken) {
        console.log(`   ✓ Token found in sessionStorage`);
        await runTest(page, sessionToken);
        return;
      }
      throw new Error('Could not extract auth token — check smoke-1-auth.png');
    }

    console.log(`   ✓ Auth token extracted (${token.substring(0, 20)}...)`);
    await runTest(page, token);

  } finally {
    await browser.close();
    // Clean up temp script
    try { require('fs').unlinkSync('e2e-smoke-gauntlet.ts'); } catch { /* ok */ }
  }
}

async function runTest(page: import('playwright').Page, token: string) {
  // ── Step 3: Create a gauntlet run ───────────────────────────────────────
  console.log('\n3. Creating drop-in gauntlet run...');
  console.log(`   Provider: anthropic / Model: claude-haiku-4-5-20251001`);

  const createResult = await page.evaluate(async ({ apiUrl, token, apiKey }) => {
    const res = await fetch(`${apiUrl}/api/gauntlet/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
      body: JSON.stringify({
        track: 'dropin',
        provider: 'anthropic',
        model: 'claude-haiku-4-5-20251001',
        api_key: apiKey,
      }),
    });
    return { status: res.status, body: await res.json().catch(() => ({})) };
  }, { apiUrl: API_URL, token, apiKey: TEST_API_KEY });

  console.log(`   POST /api/gauntlet/runs → HTTP ${createResult.status}`);

  if (createResult.status !== 201) {
    console.log(`   ✗ FAILED: ${JSON.stringify(createResult.body)}`);
    return;
  }

  const runId = (createResult.body as any).runId ?? (createResult.body as any).id;
  console.log(`   ✓ Run created: ${runId}`);
  console.log(`   Replay: ${FRONTEND_URL}/gauntlet/runs/${runId}`);

  // ── Step 4: Navigate to replay page ─────────────────────────────────────
  console.log('\n4. Loading replay page...');
  await page.goto(`${FRONTEND_URL}/gauntlet/runs/${runId}`, { waitUntil: 'networkidle', timeout: 20_000 });
  await sleep(2000);
  await page.screenshot({ path: 'smoke-2-replay.png' });
  const liveVisible = (await page.locator('text=AGENT RUNNING').count()) > 0;
  const spinnerVisible = (await page.locator('text=Agent is running').count()) > 0;
  console.log(`   "AGENT RUNNING" badge: ${liveVisible ? '✓ visible' : '✗ not found'}`);
  console.log(`   "Agent is running" spinner: ${spinnerVisible ? '✓ visible' : '✗ not found'}`);
  console.log(`   Screenshot: smoke-2-replay.png`);

  // ── Step 5: Poll until completed (max 8 min) ─────────────────────────────
  console.log('\n5. Polling run status (max 8 min)...');
  const deadline = Date.now() + 8 * 60 * 1000;
  let lastStatus = 'running';
  let lastScore: number | null = null;
  let lastFrames = 0;

  while (Date.now() < deadline) {
    const poll = await page.evaluate(async ({ apiUrl, runId, token }) => {
      const res = await fetch(`${apiUrl}/api/gauntlet/runs/${runId}/replay`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      return res.ok ? res.json() : null;
    }, { apiUrl: API_URL, runId, token });

    if (poll) {
      // replay API returns flat fields: { status, totalScore, frames, tasks, ... }
      lastStatus = poll.status ?? 'running';
      lastScore = poll.totalScore ?? null;
      lastFrames = poll.frames?.length ?? 0;
      process.stdout.write(`\r   [${new Date().toLocaleTimeString()}] status=${lastStatus} score=${lastScore ?? '—'} frames=${lastFrames}   `);

      if (lastStatus === 'completed' || lastStatus === 'failed') break;
    }
    await sleep(5000);
  }
  console.log('\n');

  // ── Step 6: Final screenshot + results ────────────────────────────────────
  await page.reload({ waitUntil: 'networkidle', timeout: 15_000 });
  await sleep(2000);
  await page.screenshot({ path: 'smoke-3-final.png', fullPage: true });

  // Get final task details
  const final = await page.evaluate(async ({ apiUrl, runId, token }) => {
    const res = await fetch(`${apiUrl}/api/gauntlet/runs/${runId}/replay`, {
      headers: { 'Authorization': `Bearer ${token}` },
    });
    return res.ok ? res.json() : null;
  }, { apiUrl: API_URL, runId, token });

  console.log('=== RESULTS ===');
  console.log(`Run ID:    ${runId}`);
  console.log(`Status:    ${final?.status ?? lastStatus}`);
  console.log(`Score:     ${final?.totalScore ?? lastScore ?? '—'}`);
  console.log(`Frames:    ${final?.frames?.length ?? lastFrames}`);
  const tasks = final?.tasks ?? [];
  if (tasks.length > 0) {
    console.log('Tasks:');
    for (const t of tasks) {
      console.log(`  [${t.index ?? '?'}] ${t.title ?? t.id} → score=${t.score ?? '—'} answer="${t.agentAnswer ?? '—'}"`);
    }
  }
  console.log(`\nReplay:    ${FRONTEND_URL}/gauntlet/runs/${runId}`);
  console.log('Screenshots: smoke-1-auth.png, smoke-2-replay.png, smoke-3-final.png');

  const passed = final?.status === 'completed';
  const failed = final?.status === 'failed';
  console.log(
    passed ? '\n✅ SMOKE TEST PASSED' :
    failed ? '\n⚠️  Run finished as FAILED — agent errored or tasks timed out' :
             '\n⚠️  Run did not finish in time — still running or timed out'
  );
}

main().catch(err => {
  console.error('\n✗ Test error:', err.message);
  process.exit(1);
});
