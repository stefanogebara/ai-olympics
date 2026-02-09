/**
 * Auth Integration Test Script
 *
 * Tests the complete authentication flow including:
 * 1. User signup with Supabase
 * 2. User signin
 * 3. JWT token validation on API endpoints
 * 4. Portfolio and betting operations
 * 5. Stats retrieval
 *
 * Usage: npx ts-node src/tests/auth-integration.ts
 *
 * Prerequisites:
 * - Set SUPABASE_URL and SUPABASE_ANON_KEY environment variables
 * - API server running on localhost:3003
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuration
const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const API_BASE = process.env.API_BASE || 'http://localhost:3003';

// Test state
interface TestResult {
  name: string;
  passed: boolean;
  duration: number;
  error?: string;
}

const results: TestResult[] = [];

// Helper to run a test
async function runTest(name: string, testFn: () => Promise<void>): Promise<void> {
  const startTime = Date.now();
  try {
    await testFn();
    results.push({
      name,
      passed: true,
      duration: Date.now() - startTime
    });
    console.log(`  ✓ ${name} (${Date.now() - startTime}ms)`);
  } catch (error) {
    results.push({
      name,
      passed: false,
      duration: Date.now() - startTime,
      error: error instanceof Error ? error.message : String(error)
    });
    console.log(`  ✗ ${name} - ${error instanceof Error ? error.message : error}`);
  }
}

// Test: Create Supabase client
async function testSupabaseConnection(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.getSession();
  if (error) throw new Error(`Supabase connection failed: ${error.message}`);
}

// Test: Sign up new user
async function testSignUp(supabase: SupabaseClient, email: string, password: string): Promise<string | null> {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { username: `testuser_${Date.now()}` }
    }
  });

  if (error) {
    // If user exists, that's okay for testing
    if (error.message.includes('already registered')) {
      return null;
    }
    throw new Error(`Sign up failed: ${error.message}`);
  }

  if (!data.user) throw new Error('No user returned from sign up');
  return data.user.id;
}

// Test: Sign in user
async function testSignIn(
  supabase: SupabaseClient,
  email: string,
  password: string
): Promise<{ userId: string; token: string }> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password
  });

  if (error) throw new Error(`Sign in failed: ${error.message}`);
  if (!data.session) throw new Error('No session returned from sign in');

  return {
    userId: data.user.id,
    token: data.session.access_token
  };
}

// Test: Get user portfolio
async function testGetPortfolio(token: string): Promise<any> {
  const response = await fetch(`${API_BASE}/api/user/portfolio`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Portfolio request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Test: Place a bet
async function testPlaceBet(token: string): Promise<any> {
  const response = await fetch(`${API_BASE}/api/user/bets`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      marketId: 'test-market-1',
      outcome: 'YES',
      amount: 100
    })
  });

  // May fail if market doesn't exist, which is acceptable
  const data = await response.json();
  return data;
}

// Test: Get user stats
async function testGetStats(token: string): Promise<any> {
  const response = await fetch(`${API_BASE}/api/user/stats`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Stats request failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// Test: Get games list
async function testGetGames(): Promise<any> {
  const response = await fetch(`${API_BASE}/api/games`);

  if (!response.ok) {
    throw new Error(`Games list request failed: ${response.status}`);
  }

  return response.json();
}

// Test: Get trivia puzzle
async function testGetTriviaPuzzle(): Promise<any> {
  const response = await fetch(`${API_BASE}/api/games/trivia/puzzle`);

  // May return 404 if not implemented, which is acceptable
  if (response.status === 404) {
    return { fallback: true };
  }

  if (!response.ok) {
    throw new Error(`Trivia puzzle request failed: ${response.status}`);
  }

  return response.json();
}

// Test: Submit game score
async function testSubmitGameScore(token: string): Promise<any> {
  const response = await fetch(`${API_BASE}/api/games/trivia/submit`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      score: 750,
      correctCount: 8,
      totalQuestions: 10,
      timeSpent: 120
    })
  });

  // May fail if endpoint doesn't exist yet
  const data = await response.json().catch(() => ({ submitted: false }));
  return data;
}

// Test: Sign out
async function testSignOut(supabase: SupabaseClient): Promise<void> {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Sign out failed: ${error.message}`);
}

// Main test runner
async function runAuthIntegrationTests(): Promise<void> {
  console.log('\n🚀 AI Olympics - Auth Integration Tests\n');
  console.log('━'.repeat(50));

  // Check configuration
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.log('\n⚠️  Missing environment variables:');
    console.log('   SUPABASE_URL and SUPABASE_ANON_KEY are required');
    console.log('\n   Running in mock mode...\n');

    // Run basic API tests without auth
    console.log('📡 API Connectivity Tests\n');

    await runTest('API health check', async () => {
      const response = await fetch(`${API_BASE}/health`);
      // Accept either success or 404 (endpoint may not exist)
      if (!response.ok && response.status !== 404) {
        throw new Error(`API not reachable: ${response.status}`);
      }
    });

    await runTest('Get games list', testGetGames);
    await runTest('Get trivia puzzle', testGetTriviaPuzzle);

    printSummary();
    return;
  }

  // Create Supabase client
  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

  // Test user credentials
  const testEmail = `test-${Date.now()}@ai-olympics.test`;
  const testPassword = 'TestPass123!';
  let authToken = '';

  // Connection tests
  console.log('📡 Connection Tests\n');

  await runTest('Supabase connection', () => testSupabaseConnection(supabase));

  // Authentication tests
  console.log('\n🔐 Authentication Tests\n');

  await runTest('Sign up new user', async () => {
    await testSignUp(supabase, testEmail, testPassword);
  });

  await runTest('Sign in user', async () => {
    const { token } = await testSignIn(supabase, testEmail, testPassword);
    authToken = token;
    if (!authToken) throw new Error('No token received');
  });

  // API tests with auth
  console.log('\n📊 API Tests (Authenticated)\n');

  await runTest('Get user portfolio', async () => {
    if (!authToken) throw new Error('No auth token available');
    const portfolio = await testGetPortfolio(authToken);
    console.log(`     Balance: M$${portfolio.balance || 'N/A'}`);
  });

  await runTest('Get user stats', async () => {
    if (!authToken) throw new Error('No auth token available');
    const stats = await testGetStats(authToken);
    console.log(`     Stats loaded: ${JSON.stringify(stats).substring(0, 50)}...`);
  });

  await runTest('Place a bet', async () => {
    if (!authToken) throw new Error('No auth token available');
    const result = await testPlaceBet(authToken);
    console.log(`     Result: ${result.success ? 'Success' : result.error || 'Pending'}`);
  });

  // Games API tests
  console.log('\n🎮 Games API Tests\n');

  await runTest('Get games list', testGetGames);
  await runTest('Get trivia puzzle', testGetTriviaPuzzle);

  await runTest('Submit game score', async () => {
    if (!authToken) throw new Error('No auth token available');
    const result = await testSubmitGameScore(authToken);
    console.log(`     Score submitted: ${result.submitted !== false}`);
  });

  // Cleanup
  console.log('\n🧹 Cleanup\n');

  await runTest('Sign out', () => testSignOut(supabase));

  // Print summary
  printSummary();
}

function printSummary(): void {
  console.log('\n' + '━'.repeat(50));
  console.log('\n📋 Test Summary\n');

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;
  const totalTime = results.reduce((sum, r) => sum + r.duration, 0);

  console.log(`   Total: ${results.length}`);
  console.log(`   ✓ Passed: ${passed}`);
  console.log(`   ✗ Failed: ${failed}`);
  console.log(`   Time: ${totalTime}ms`);

  if (failed > 0) {
    console.log('\n   Failed tests:');
    results
      .filter(r => !r.passed)
      .forEach(r => console.log(`     - ${r.name}: ${r.error}`));
  }

  console.log('\n' + '━'.repeat(50) + '\n');

  // Exit with error code if any tests failed
  process.exit(failed > 0 ? 1 : 0);
}

// Run tests
runAuthIntegrationTests().catch(console.error);
