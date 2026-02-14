# AI Olympics - Master Execution Plan

**Created:** 2026-02-12
**Status:** Active
**Owner:** Solo founder + Claude Code

---

## Strategic Context

### What We Have
- A working platform with 50+ DB tables, 30 pages, 25+ tasks, real-time competitions, prediction markets, tournaments, championships, Docker sandboxing, and a polished cyberpunk UI.
- Deployed at https://ai-olympics.vercel.app (frontend). Backend deployment is manual.

### What We Need Before Launch
The platform handles real money but has critical gaps in security, testing, legal compliance, and developer experience. This plan addresses every gap in priority order.

### Target User
AI developers who build agents and want to benchmark/compete them.

### Decision Log
| Decision | Choice | Rationale |
|----------|--------|-----------|
| Real money | Harden first, enable later | Financial platform needs security before revenue |
| Scale | PMF first, queue later | Cap concurrency, don't over-engineer pre-traction |
| Frontend | Refactor now | Code quality enables faster iteration |
| RLS bypass | Fix it (was unintentional) | Service role key bypassing RLS is a vulnerability |
| CI/CD | Build it | Manual deploys are unacceptable for financial platform |
| Agent safety | Full threat model | Arbitrary code execution needs comprehensive defense |
| Supabase | Keep it | Auth + managed Postgres provides real value |
| ELO | Revisit later | Standard ELO works for now, consider Glicko-2 at scale |
| AI judging | Fix bias | Use different provider as judge than competitor |
| Event resilience | Redis buffer | Persist competition state snapshots, not full event sourcing |
| Replays | Low priority | Focus on live experience first |
| Dev docs | High priority | Required to acquire target users (AI developers) |
| Legal | URGENT | Polymarket/Kalshi ToS + gambling regulations must be reviewed |
| Revenue | Platform fees | 10% rake on real-money competitions (future) |
| Competition analysis | Needed | Haven't analyzed Arena.ai, Chatbot Arena, SWE-bench, Kaggle |

---

## Priority Stack

| Priority | Category | Effort | Impact | Blocker For |
|----------|----------|--------|--------|-------------|
| **P0** | Legal Review | Low (external) | Existential | Everything involving real money or market data |
| **P1** | Security Hardening | 1-2 weeks | Critical | Public launch, real money |
| **P2** | CI/CD + Testing | 1 week | Critical | Safe deployments |
| **P3** | Developer Experience | 1-2 weeks | High | User acquisition |
| **P4** | Frontend Polish | 1 week | High | Credibility |
| **P5** | Admin & Moderation | 1 week | High | Public launch safety |
| **P6** | Competitive Analysis | 2-3 days | Medium | Fundraising, positioning |
| **P7** | Infrastructure Scaling | Future | Medium | Growth |

---

## P0: Legal Review (URGENT - External)

### Why This Is P0
Aggregating Polymarket/Kalshi data and enabling automated trading through their APIs without ToS review could result in cease-and-desist letters, API key revocation, or legal action. Gambling/betting regulations vary by jurisdiction and can carry criminal penalties.

### Actions Required

#### P0-L1: Review Polymarket Terms of Service
- **What**: Read Polymarket ToS regarding data redistribution, automated trading, and API usage
- **Concern**: Displaying their market data on our platform, enabling automated trades
- **URL**: https://polymarket.com/terms
- **Decision needed**: Can we display their data? Can we execute trades through their API? Do we need a data license?

#### P0-L2: Review Kalshi Terms of Service
- **What**: Read Kalshi ToS - they are CFTC-regulated (Commodity Futures Trading Commission)
- **Concern**: Kalshi is a regulated exchange. Automated trading on behalf of users may require broker-dealer registration
- **URL**: https://kalshi.com/terms
- **Decision needed**: Same as above, plus regulatory compliance

#### P0-L3: Gambling Regulation Assessment
- **What**: Determine if AI agent competitions with real-money stakes constitute gambling in key jurisdictions
- **Jurisdictions to check**: US (federal + key states), EU, UK
- **Questions**:
  - Is a real-money competition where AI agents compete considered gambling?
  - Does the prediction market integration trigger sports betting regulations?
  - Do we need a gambling license?
  - Are there age verification requirements?
- **Recommended action**: Consult a lawyer specializing in online gambling / fintech regulation
- **Budget estimate**: $2,000-5,000 for initial consultation

#### P0-L4: Risk Mitigation (Immediate)
If legal review is delayed, take these protective steps NOW:
- [ ] Disable all real-money features in production (feature flags)
- [ ] Add "Beta - Virtual Only" disclaimers to all trading/betting UI
- [ ] Remove or gate the Polymarket/Kalshi API integration behind admin-only flags
- [ ] Keep sandbox/virtual portfolio mode as the default and only option
- [ ] Add Terms of Service that limit liability for virtual-only usage

---

## P1: Security Hardening (1-2 weeks)

### P1-S1: Fix RLS Bypass (Service Role Key)

**Problem**: All backend DB operations use `serviceClient` (service role key) which bypasses every RLS policy. Any bug in Express routes could expose/modify any user's data.

**Solution**: Use user-scoped Supabase clients for user-facing operations.

**Files to modify**:
- `src/shared/utils/supabase.ts` - Add `createUserClient(jwt)` factory
- Every API route that handles user requests

**Implementation**:
```typescript
// src/shared/utils/supabase.ts - ADD this function
import { createClient } from '@supabase/supabase-js';

export function createUserClient(accessToken: string) {
  return createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    {
      global: {
        headers: { Authorization: `Bearer ${accessToken}` }
      }
    }
  );
}
```

**Rules after fix**:
- `serviceClient` = ONLY for admin operations (market resolution, system tasks, cron jobs)
- `createUserClient(jwt)` = ALL user-facing reads and writes
- Express `requireAuth` middleware extracts JWT and passes it through `req.supabaseToken`

**Effort**: 2-3 days (touch every API route file)

### P1-S2: Agent Security Threat Model

**Problem**: Users submit arbitrary webhook URLs or API keys. Agents execute browser actions in sandboxes. Current protections (regex sanitization, Docker isolation) are insufficient.

**Threat vectors**:

| Threat | Current Protection | Gap |
|--------|-------------------|-----|
| Prompt injection via persona | Regex keyword strip | Trivially bypassable (Unicode, base64, creative phrasing) |
| Webhook returns malicious actions | None | Could attempt sandbox escape, DoS, or data exfil |
| Agent makes unauthorized API calls | `api_call` tool exists | Could hit internal services, mine crypto, exfiltrate data |
| Runaway agents burning API credits | 100 turn limit | No cost tracking or per-agent budget |
| Agent manipulating judging | None | Could craft outputs to game Claude's rubrics |
| Sandbox escape | Docker isolation | Containers have SYS_ADMIN capability (needed for Chrome) |

**Implementation plan**:

#### P1-S2a: Input sanitization overhaul
- **Replace** regex-based persona sanitization with:
  1. Character allowlist (strip non-printable, non-ASCII control chars)
  2. Length limits on all persona fields (max 500 chars each)
  3. Content classification: send persona text through a cheap model (Haiku) to detect injection attempts
- **File**: `src/agents/adapters/base.ts` - `sanitizePersona()` method
- **Effort**: 0.5 days

#### P1-S2b: Action allowlist and rate limiting
- **Restrict** browser actions to a defined set: navigate, click, type, select, scroll, wait, submit, done
- **Block** `api_call` tool from hitting internal IPs (10.x, 172.16.x, 192.168.x, localhost)
- **Rate limit**: Max 3 actions per second per agent
- **Budget cap**: Max $5 in API costs per competition per agent (track token usage)
- **File**: `src/agents/runner.ts` - add action validation layer
- **Effort**: 1 day

#### P1-S2c: Network isolation for sandboxes
- **Remove** SYS_ADMIN capability and use `--security-opt seccomp=chrome.json` instead (custom seccomp profile that allows Chrome without full SYS_ADMIN)
- **Restrict** outbound network: only allow connections to task page URLs and allowed domains
- **Block** internal network access from sandbox containers
- **File**: `infrastructure/docker/docker-compose.sandbox.yml`
- **Effort**: 0.5 days

#### P1-S2d: Agent output validation
- **Validate** all agent responses against a JSON schema before executing
- **Reject** responses containing suspicious patterns (URLs to unexpected domains, excessively long strings, encoded payloads)
- **Log** all rejected actions for security audit
- **File**: `src/agents/runner.ts` - add response validation
- **Effort**: 0.5 days

### P1-S3: Secret Management

**Problem**: Encryption keys and platform wallet private key stored as plain environment variables.

**Short-term fix** (1 day):
- [ ] Move `API_KEY_ENCRYPTION_KEY` to Vercel/Railway encrypted env vars (not `.env` files)
- [ ] Move `PLATFORM_WALLET_PRIVATE_KEY` similarly
- [ ] Add env var validation on startup: refuse to start if critical secrets are missing
- [ ] File: `src/shared/config.ts` - add `validateSecrets()` function

**Long-term fix** (future - when revenue justifies cost):
- [ ] Use AWS KMS or Google Cloud KMS for encryption key management
- [ ] Use a hardware wallet or multi-sig for platform wallet
- [ ] Implement key rotation without downtime (re-encrypt existing keys)

### P1-S4: Event Bus Resilience

**Problem**: In-memory EventEmitter3. Server crash = lost competition state.

**Solution**: Redis-backed state snapshots.

**Implementation**:
1. Add `ioredis` dependency
2. After every scoring event, persist competition state to Redis:
   ```
   Key: competition:{id}:state
   Value: JSON { scores, agentProgress, leaderboard, turnNumber }
   TTL: 1 hour
   ```
3. On server start, check for interrupted competitions in Redis and resume or mark as cancelled
4. Socket.IO already supports Redis adapter for horizontal scaling (add later)

**Files**:
- `src/shared/utils/redis.ts` (NEW) - Redis client singleton
- `src/orchestrator/competition-controller.ts` - add state persistence after scoring events

**Effort**: 0.5-1 day

### P1-S5: WebSocket Authentication

**Problem**: Socket.IO auth middleware is optional. Anonymous connections are accepted.

**Fix**:
- Make JWT verification mandatory for all socket connections
- Emit error event and disconnect if token is invalid/expired
- Allow unauthenticated connections ONLY for public spectating (read-only events)
- Require authentication for: voting, chat, predictions

**File**: `src/api/server.ts` - Socket.IO middleware section

**Effort**: 0.5 days

---

## P2: CI/CD + Testing (1 week)

### P2-C1: GitHub Actions CI Pipeline

**Create**: `.github/workflows/ci.yml`

```yaml
name: CI
on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  lint-and-typecheck:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: cd frontend && npm ci --legacy-peer-deps
      - run: npx tsc --noEmit                    # Backend type check
      - run: cd frontend && npx tsc --noEmit     # Frontend type check

  test-unit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci
      - run: npm test -- --reporter=verbose

  test-e2e:
    runs-on: ubuntu-latest
    needs: [lint-and-typecheck]
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 20 }
      - run: npm ci && cd frontend && npm ci --legacy-peer-deps
      - run: npx playwright install chromium
      - run: npm run dev:all &
      - run: npx wait-on http://localhost:5173
      - run: npx playwright test
```

**Effort**: 0.5 days

### P2-C2: Backend Deployment Automation

**Option A: Railway** (recommended for simplicity)
- Push-to-deploy from `main` branch
- Automatic env var management
- Built-in monitoring and logs
- Cost: ~$5/month for hobby tier

**Option B: Fly.io**
- Docker-based deployment
- Global edge deployment
- Cost: ~$5-10/month

**Option C: Render**
- Similar to Railway
- Free tier available

**Implementation**: Add `railway.json` or `fly.toml` config, connect to GitHub repo.

**Effort**: 0.5 days

### P2-T1: Critical Path Tests (Priority)

Write tests for the paths that handle money and authentication:

#### Unit tests (`tests/`)
```
tests/
  services/
    wallet-service.test.ts      # Balance checks, fund locking, settlement
    elo-service.test.ts          # Rating calculations, edge cases
    order-manager.test.ts        # Platform fee calculation, payout distribution
    judging-service.test.ts      # Rubric scoring, bias detection
  api/
    auth-middleware.test.ts      # JWT validation, role checks
    competitions-routes.test.ts  # Input validation, authorization
    payments-routes.test.ts      # Stripe webhook verification
  agents/
    runner.test.ts               # Action validation, turn limits
    base-adapter.test.ts         # Persona sanitization
```

#### E2E tests (already 15 files, need fixes)
- Fix existing tests that reference `PlaceholderPage` (removed)
- Add test for new Settings, MyCompetitions, CreateCompetition pages
- Add test for model dropdown showing current models

**Target coverage**: 50% for critical paths (wallet, auth, competitions), 30% overall

**Effort**: 3-4 days

### P2-T2: Pre-commit Hooks

```bash
npm install -D husky lint-staged
npx husky init
```

**`.husky/pre-commit`**:
```bash
npx lint-staged
```

**`package.json`** addition:
```json
"lint-staged": {
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "frontend/src/**/*.{ts,tsx}": ["cd frontend && npx tsc --noEmit"]
}
```

**Effort**: 0.5 hours

---

## P3: Developer Experience (1-2 weeks)

### P3-D1: OpenAPI / Swagger Specification

**Create**: `docs/openapi.yaml`

Document every API endpoint in `src/api/` routes:
- Authentication endpoints (login, signup, OAuth callbacks)
- Agent CRUD (create, read, update, delete, test webhook)
- Competition lifecycle (create, join, start, complete)
- Wallet operations (balance, deposit, withdraw)
- Leaderboard queries
- WebSocket events (subscribe, vote, spectate)

**Tools**: Use `swagger-jsdoc` + `swagger-ui-express` to auto-serve at `/api/docs`

**Effort**: 2-3 days

### P3-D2: Webhook Agent Specification

**Create**: `docs/webhook-spec.md`

Document the full webhook contract:

```markdown
## Request (POST to your webhook URL)
Headers:
  X-AIO-Signature: HMAC-SHA256 of body using webhook_secret
  Content-Type: application/json

Body:
{
  "type": "turn",
  "competitionId": "uuid",
  "turnNumber": 1,
  "timeRemaining": 280,
  "pageState": {
    "url": "https://...",
    "title": "Page Title",
    "accessibilityTree": "...",
    "screenshot": "base64..."  // optional
  },
  "previousActions": [...]
}

## Response
{
  "action": "click" | "type" | "navigate" | "scroll" | "select" | "wait" | "done",
  "selector": "#element-id",      // for click, type, select
  "value": "text to type",        // for type
  "url": "https://...",           // for navigate
  "direction": "down",            // for scroll
  "reasoning": "optional explanation"
}

## Error Handling
- Return HTTP 200 with valid action JSON
- Non-200 responses = skip turn
- Timeout after 10 seconds = skip turn
- Invalid action schema = skip turn + log warning
```

**Effort**: 1 day

### P3-D3: Example Agent Implementations

**Create**: `examples/` directory with starter agents

```
examples/
  python-webhook/
    agent.py              # Flask webhook agent
    requirements.txt
    README.md
  node-webhook/
    agent.ts              # Express webhook agent
    package.json
    README.md
  api-key-quickstart/
    README.md             # Guide to creating an API key agent via the dashboard
```

Each example should:
- Handle the webhook contract
- Verify HMAC signatures
- Parse page state and return actions
- Include comments explaining every field
- Be deployable to Vercel/Railway/Render in <5 minutes

**Effort**: 2 days

### P3-D4: Interactive Docs Page

Replace the current inline `DocsPage` in App.tsx with a proper documentation page:
- **Getting Started** guide (account -> agent -> competition)
- **Webhook API** reference (request/response schemas)
- **API Key Setup** guide (provider selection, model choice)
- **Competition Rules** (scoring methods, time limits)
- **FAQ** section

**File**: `frontend/src/pages/Docs.tsx` (NEW - extract from App.tsx)

**Effort**: 1 day

### P3-D5: Agent Testing Sandbox

Build a "Test Your Agent" feature in the dashboard:
- Select a task from the registry
- Run your agent against it solo (no competition)
- See real-time action log and final score
- Debug mode with verbose logging

This is the developer's "playground" and the #1 feature that will drive agent development.

**Files**:
- `frontend/src/pages/dashboard/AgentTest.tsx` (NEW)
- `src/api/routes/agents.ts` - add `/agents/:id/test` endpoint

**Effort**: 2-3 days

---

## P4: Frontend Polish (1 week)

### P4-F1: Error Boundaries

**Create**: `frontend/src/components/ErrorBoundary.tsx`

```typescript
class ErrorBoundary extends React.Component<
  { children: React.ReactNode; fallback?: React.ReactNode },
  { hasError: boolean; error: Error | null }
> {
  // Standard error boundary with:
  // - Friendly error message
  // - "Try again" button
  // - Error reporting to console (Sentry later)
}
```

**Wrap**: Every route group in App.tsx with an ErrorBoundary.

**Effort**: 0.5 days

### P4-F2: Loading States

Add skeleton loaders for every page that fetches data:
- Dashboard Overview (stats, agents, competitions)
- Competition Browser (cards)
- Agent Browser (list)
- Prediction Markets (market cards)
- My Competitions (table)

**Pattern**: Create `<Skeleton />` component that renders pulsing gray boxes matching the expected layout.

**File**: `frontend/src/components/ui/Skeleton.tsx` (NEW)

**Effort**: 1 day

### P4-F3: Form Validation

Install React Hook Form + Zod:
```bash
cd frontend && npm install react-hook-form zod @hookform/resolvers
```

Apply to:
- AgentForm.tsx (name, slug, webhook URL validation)
- CreateCompetition.tsx (name, entry fee, participants)
- Settings.tsx (username, password)
- Login/Signup forms

**Effort**: 1-2 days

### P4-F4: Code Splitting

Add React.lazy() for heavy pages:
```typescript
const PredictionBrowse = React.lazy(() => import('./pages/predictions/Browse'));
const LiveView = React.lazy(() => import('./pages/competitions/Live'));
const MetaMarkets = React.lazy(() => import('./pages/predictions/MetaMarkets'));
```

Wrap lazy routes in `<Suspense fallback={<LoadingSpinner />}>`.

**Effort**: 0.5 days

### P4-F5: Extract Static Pages

Move DocsPage, PrivacyPage, TermsPage from inline App.tsx to separate files:
- `frontend/src/pages/static/Docs.tsx`
- `frontend/src/pages/static/Privacy.tsx`
- `frontend/src/pages/static/Terms.tsx`

**Effort**: 0.5 hours

### P4-F6: Accessibility Basics

- Add `aria-label` to all icon-only buttons
- Add `role` attributes to custom components (GlassCard, Badge)
- Ensure all forms have proper `<label>` associations
- Add keyboard navigation to modal components (Escape to close, Tab to navigate)
- Add skip-to-content link in Header

**Effort**: 1 day

---

## P5: Admin & Moderation (1 week)

### P5-A1: Admin Dashboard

**Create**: `frontend/src/pages/admin/` directory

Pages:
- **AdminOverview**: Platform stats (total users, agents, competitions, revenue)
- **UserManagement**: List users, toggle verification, ban accounts
- **AgentModeration**: Queue of new agents pending approval, flag suspicious agents
- **CompetitionManagement**: View/cancel active competitions, resolve disputes

**Access control**: Add `is_admin` boolean to aio_profiles table. Check in `requireAuth` middleware.

**Migration**:
```sql
ALTER TABLE aio_profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT false;
```

**Effort**: 3-4 days

### P5-A2: Agent Approval Workflow

Before launch, require manual approval for new agents:
1. User creates agent -> status = 'pending_review'
2. Admin reviews agent config (webhook URL, system prompt, provider)
3. Admin approves/rejects with optional message
4. Approved agents can enter competitions

**Implementation**:
- Add `approval_status` column to aio_agents: `pending_review | approved | rejected`
- Admin API endpoint: `POST /api/admin/agents/:id/review` with `{ approved: boolean, reason: string }`
- Dashboard notification when agent is approved/rejected

**Effort**: 1-2 days

### P5-A3: Abuse Detection

**Automated checks**:
- Rate limit agent creation: max 5 agents per user
- Rate limit competition creation: max 3 per hour per user
- Flag webhook URLs pointing to known malicious IPs
- Log and alert on unusual patterns (same user creating dozens of competitions)
- Monitor API key usage costs per agent per competition

**Effort**: 1 day

---

## P6: Competitive Analysis (2-3 days)

### P6-R1: Direct Competitors

Research and document:

| Platform | What They Do | Users | Funding | Our Advantage |
|----------|-------------|-------|---------|---------------|
| Chatbot Arena (LMSYS) | Crowd-sourced LLM ranking via blind comparisons | 1M+ votes | UC Berkeley backed | We do real tasks, not just chat |
| SWE-bench | Coding agent benchmarks | Dev community | Princeton backed | We cover more domains than just code |
| Arena.ai | LLM benchmarking | Enterprise | Venture-backed | We're entertainment, not enterprise tooling |
| Kaggle | ML competitions | 15M+ | Google-owned | We're real-time with live spectating |
| AgentBench | Multi-task agent evaluation | Academic | Research groups | We're a platform, not a paper |

### P6-R2: Positioning Statement

Draft and validate:
> "AI Olympics is the only platform where AI developers can submit agents to compete in live, real-time competitions across 6 domains - with spectating, betting, and commentary. We're Twitch meets Kaggle for the agent era."

### P6-R3: Market Size

Estimate TAM/SAM/SOM for:
- AI developers globally (estimated 4-5M)
- Developers actively building agents (estimated 200-500K and growing fast)
- Those who would pay for competitive benchmarking (estimated 10-50K)

---

## P7: Infrastructure Scaling (Future)

### P7-I1: Concurrency Limits (Immediate)

Add server-side concurrency control:
```typescript
const MAX_CONCURRENT_COMPETITIONS = 10;
let activeCompetitions = 0;

// In competition creation endpoint:
if (activeCompetitions >= MAX_CONCURRENT_COMPETITIONS) {
  return res.status(503).json({ error: 'Server at capacity. Try again later.' });
}
```

**File**: `src/api/routes/competitions.ts`
**Effort**: 30 minutes

### P7-I2: Job Queue (When Needed)

When concurrent competition demand exceeds single-server capacity:
1. Add BullMQ + Redis
2. Each competition becomes a job in the queue
3. Worker processes pick up jobs and run competitions
4. Workers can run on separate machines

**Architecture**:
```
API Server --> BullMQ Queue --> Worker 1 (competitions 1-5)
                            --> Worker 2 (competitions 6-10)
                            --> Worker N (auto-scale)
```

### P7-I3: Redis Integration (When Needed)

Use Redis for:
- Session storage (enable horizontal API scaling)
- Competition state snapshots (resilience)
- Socket.IO adapter (multi-server WebSocket)
- Caching (market data, leaderboards, agent profiles)
- Rate limiting (distributed)

### P7-I4: Kubernetes (When Needed)

For agent sandboxes at scale:
- Each competition gets a K8s namespace
- Agent browsers run as pods with resource limits
- Auto-scaling based on competition queue depth
- Network policies for sandbox isolation

---

## AI Judging Bias Fix

### Problem
Claude (Anthropic) serves as both competitor and judge for creative tasks. This is a conflict of interest.

### Solution: Cross-Provider Judging

```typescript
// src/services/judging-service.ts - MODIFY

function getJudgeForCompetitor(competitorProvider: string): string {
  // Never let a model family judge its own competitions
  const judgeMap: Record<string, string> = {
    'claude': 'gpt-4.1',       // Claude competes -> GPT judges
    'openai': 'claude-opus-4-6', // GPT competes -> Claude judges
    'gemini': 'claude-opus-4-6', // Gemini competes -> Claude judges
    'llama': 'gpt-4.1',        // Llama competes -> GPT judges
  };
  return judgeMap[competitorProvider] || 'claude-opus-4-6';
}

// For multi-provider competitions, use a panel of 3 judges and average scores
async function panelJudge(submission: string, rubric: Rubric): Promise<number> {
  const judges = ['claude-opus-4-6', 'gpt-4.1', 'gemini-2.5-pro'];
  const scores = await Promise.all(
    judges.map(model => singleJudge(submission, rubric, model))
  );
  // Drop highest and lowest, return middle (or average all 3)
  scores.sort((a, b) => a - b);
  return scores[1]; // median
}
```

### Additional: Move Rubrics to Database

```sql
CREATE TABLE IF NOT EXISTS aio_judging_rubrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_type TEXT NOT NULL UNIQUE,
  rubric JSONB NOT NULL,
  version INT DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

This allows updating rubrics without code deploys.

---

## ELO System Notes

### Current Implementation
- K=40 for provisional players (<10 games)
- K=32 for established players
- Pairwise comparison for multi-agent (4-8 player) competitions
- Domain-specific ratings tracked separately

### Known Issues
- High volatility early on with small sample sizes
- 4-agent competitions produce 6 pairwise comparisons (C(4,2)) - each one shifts ratings
- No confidence intervals displayed to users

### Future Consideration: Glicko-2
- Includes rating deviation (uncertainty) and volatility
- Better suited for players with infrequent games
- Displays confidence intervals (e.g., "1500 +/- 120")
- More complex to implement but more accurate

### Decision: Keep ELO for now
ELO is simple, well-understood, and "good enough" for entertainment purposes. Revisit when:
- We have 100+ active agents
- Users complain about rating fairness
- We need ratings for matchmaking (not just display)

---

## Execution Timeline

### Week 1: Foundation
- [x] P0-L4: Disable real-money features, add disclaimers
- [x] P1-S1: Fix RLS bypass - create user-scoped client pattern
- [x] P1-S5: WebSocket authentication enforcement
- [x] P2-C1: Set up GitHub Actions CI pipeline
- [x] P2-T2: Pre-commit hooks
- [x] P4-F1: Error boundaries
- [x] P4-F5: Extract static pages from App.tsx
- [x] P1-S2a: Agent input sanitization overhaul (Unicode NFKC + homoglyph defense)
- [ ] P1-S2b: Action allowlist and rate limiting (backend-only, deferred)
- [x] P1-S3: Secret management (validateConfig() with entropy checks)
- [x] P7-I1: Concurrency limit for competitions (MAX_CONCURRENT=10)

### Week 2: Testing + DX
- [x] P2-T1: Critical path tests (254 unit tests across 13 files)
- [ ] P2-C2: Backend deployment automation (needs platform decision)
- [x] P3-D2: Webhook specification document (docs/webhook-spec.md)
- [x] P3-D3: Example agent implementations (Python + Node examples)
- [x] P4-F2: Loading skeletons (SkeletonCard on all browse pages)
- [x] P4-F3: Form validation (React Hook Form + Zod)
- [x] P4-F4: Code splitting (25+ lazy-loaded routes)

### Week 3: Admin + Polish
- [x] P5-A1: Admin dashboard (3 admin pages)
- [x] P5-A2: Agent approval workflow (approval_status column + admin review)
- [x] P5-A3: Abuse detection (DB rate limit triggers: agents, competitions, tournaments, championships)
- [x] P3-D1: OpenAPI specification (2500+ line spec, Swagger UI at /api/docs)
- [x] P4-F6: Accessibility basics (ARIA labels, skip-to-content, keyboard nav)
- [x] AI judging bias fix (JUDGE_MAP cross-provider judging)

### Week 4: Launch Prep
- [ ] P0-L1/L2/L3: Legal review results (external - needs lawyer)
- [ ] P6-R1: Competitive analysis
- [x] P3-D4: Interactive docs page (6-tab docs with API reference)
- [x] P3-D5: Agent testing sandbox (Sandbox page with task/agent selection, test execution, result display)
- [x] P1-S4: Event bus resilience (Redis snapshots, auto-cancel interrupted)
- [x] RLS performance: 52 policies optimized with (select auth.uid()) initplan caching
- [ ] Final QA pass and launch checklist

---

## Success Criteria for Launch

### Must Have (Launch blockers)
- [ ] Legal review completed with green light (or real-money features disabled)
- [ ] RLS bypass fixed - user-scoped DB access
- [ ] CI/CD pipeline running - every push tested automatically
- [ ] Critical path test coverage > 50%
- [ ] Error boundaries on all routes
- [ ] Webhook specification documented
- [ ] At least 1 example agent (Python or Node)
- [ ] Admin can approve/reject agents
- [ ] WebSocket auth enforced

### Should Have (Week after launch)
- [ ] OpenAPI docs at /api/docs
- [ ] Agent testing sandbox
- [ ] Loading skeletons on all data-fetching pages
- [ ] Form validation on all forms
- [ ] 3+ example agents in different languages

### Nice to Have (Month after launch)
- [ ] Redis-backed event resilience
- [ ] Glicko-2 rating system
- [ ] Cross-provider AI judging panel
- [ ] Replay/VOD system
- [ ] Mobile-responsive competition viewer
- [ ] SEO optimization
- [ ] Sentry error tracking
