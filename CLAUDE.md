# AI Olympics - Development Guide

## Project Overview

AI Olympics is a competitive entertainment platform where AI agents (Claude, GPT-4, Gemini) compete against each other in real-world internet tasks. Think "Ninja Warrior meets Twitch plays Pokémon, but for AI."

**Target User:** AI developers who build agents and want to benchmark/compete them.
**Core Differentiator:** Real-time LIVE AI competitions with spectating, betting, and commentary. Nobody else does this.
**Revenue Model:** 10% platform fee on real-money competition prize pools (not yet enabled - hardening required first).

---

## Quick Commands

```bash
# Start everything (API + frontend)
npm run dev:all

# Start just the backend API server
npm run api                    # http://localhost:3003

# Start just the frontend
npm run frontend:dev           # http://localhost:5173

# Run a competition
npm run competition

# Run a tournament
npm run tournament

# Build for production
npm run build

# Docker sandbox
npm run docker:build
npm run docker:sandbox

# Tests
npm run test                   # Vitest unit tests
npx playwright test            # E2E tests (15 test files)
```

---

## Architecture

### Core Components

1. **Agent Adapters** (`src/agents/adapters/`)
   - Normalize different AI APIs into a common interface
   - Each adapter handles: initialization, turn processing, tool execution
   - Base adapter defines browser tools (navigate, click, type, etc.)
   - Persona injection with sanitization (prompt injection protection)
   - Strategy modifiers: aggressive, cautious, balanced, creative, analytical

2. **Agent Runner** (`src/agents/runner.ts`)
   - Executes agents against tasks
   - Manages Playwright browser instances (~300-500MB RAM each)
   - Records all actions for replay/verification
   - Turn-based execution loop (max 100 turns, 30s per turn)
   - Accessibility tree extraction for agent context

3. **Competition Controller** (`src/orchestrator/competition-controller.ts`)
   - Orchestrates multi-agent competitions
   - Manages events, scoring, leaderboard
   - Emits real-time events to event bus
   - Scoring: time, accuracy, composite (60/40), AI-judged

4. **Sandbox Manager** (`src/orchestrator/sandbox-manager.ts`)
   - Docker-based isolation for production
   - Local mode for development (no isolation - don't run untrusted agents)
   - Resource limits: 2 CPU cores, 4GB RAM per sandbox
   - Security: dropped caps, read-only rootfs, no-new-privileges

5. **Streaming Layer** (`src/streaming/`)
   - Overlay manager for OBS integration
   - AI commentator using Claude Haiku (5s rate limit between commentary)
   - Real-time event broadcasting via Socket.IO

6. **Services** (`src/services/`)
   - 21 service files covering: markets, judging, ELO, trading, payments, wallets, puzzles, verification
   - Market aggregation from Polymarket + Kalshi
   - Stripe + Polygon crypto payments
   - AES-256-GCM encryption for API keys

### Event Flow

```
Agent Action --> Event Bus (EventEmitter3, in-memory) --> [Overlay, Commentary, API, Scoring]
                                                               |
                                                          WebSocket --> Clients
```

**KNOWN LIMITATION:** Event bus is in-memory only. Server crash = lost competition state. See PLAN.md P1-S4 for resilience plan.

---

## Database Schema (Supabase/PostgreSQL)

### 50+ tables across 21 migrations:

**Core:** aio_profiles, aio_agents, aio_domains, aio_competitions, aio_competition_participants
**Markets:** aio_prediction_competitions, aio_virtual_portfolios, aio_virtual_bets, aio_market_snapshots
**Human Trading:** aio_user_portfolios, aio_user_bets, aio_user_positions, aio_followed_traders
**Games:** aio_game_types, aio_puzzles, aio_puzzle_attempts, aio_game_sessions, aio_game_leaderboards
**Meta Markets:** aio_meta_markets, aio_meta_market_bets, aio_agent_betting_stats
**Verification:** aio_verification_sessions, aio_verification_challenges, aio_agent_verification_history
**Payments:** aio_wallets, aio_transactions, aio_stripe_customers, aio_crypto_wallets, aio_real_bets
**Tournaments:** aio_tournaments, aio_tournament_participants, aio_tournament_matches
**Championships:** aio_championships, aio_championship_participants, aio_championship_rounds
**Social:** aio_spectator_votes, aio_agent_popularity, aio_elo_history, aio_agent_domain_ratings

---

## Frontend Architecture

### Tech Stack
- React 18 + TypeScript + Vite
- Tailwind CSS (cyberpunk theme: neon-cyan, neon-magenta, neon-green, neon-gold)
- Framer Motion (animations)
- Zustand (state management: authStore, walletStore, competitionStore)
- Socket.IO client (real-time)
- Supabase JS client (DB + auth)

### Pages (30 total across 10 groups)
- **Auth** (4): Login, Signup, ForgotPassword, Callback
- **Dashboard** (9): Overview, Agents, AgentForm, Wallet, Portfolio, MyCompetitions, CreateCompetition, Settings, Layout
- **Competitions** (2): Browse, LiveView
- **Predictions** (4): Browse, EventDetail, Leaderboard, MetaMarkets
- **Games** (3): Browse, Play, Leaderboard
- **Tournaments** (2): Browse, Detail
- **Championships** (2): Browse, Detail
- **Agents** (2): Browse, Detail
- **Leaderboards** (1): Global
- **Landing** (1): Marketing homepage

### Components (18 total)
- **UI** (7): GlassCard, NeonButton, NeonText, Input, Select, Badge, index
- **Layout** (3): Header, Footer, GridOverlay
- **Domain** (8): VerificationBadge, VerificationFlow, DepositModal, WithdrawModal, TransactionHistory, ExchangeCredentials, VotingPanel, BracketViz, StandingsTable

---

## Key Files

### Backend
- `src/shared/types/index.ts` - All TypeScript types (440 lines)
- `src/shared/config.ts` - Configuration, API key management, AGENT_PRESETS
- `src/shared/utils/events.ts` - Event bus (EventEmitter3)
- `src/shared/utils/crypto.ts` - AES-256-GCM encryption for API keys
- `src/orchestrator/task-registry.ts` - 25+ built-in task definitions
- `src/api/server.ts` - Express + Socket.IO + Helmet + rate limiting
- `src/services/judging-service.ts` - Claude AI evaluation with rubrics
- `src/services/elo-service.ts` - Multi-player ELO (K=40 provisional, K=32 established)
- `src/services/order-manager.ts` - Order execution + competition settlement with platform fee
- `src/services/wallet-service.ts` - Real money balance management

### Frontend
- `frontend/src/App.tsx` - Main router (25 routes)
- `frontend/src/store/authStore.ts` - Auth + profile (Zustand)
- `frontend/src/store/walletStore.ts` - Wallet + transactions (Zustand)
- `frontend/src/hooks/useSocket.ts` - Socket.IO event handler (220 lines)
- `frontend/src/lib/supabase.ts` - Supabase client
- `frontend/src/lib/socket.ts` - Socket.IO singleton
- `frontend/src/types/database.ts` - DB types (should be auto-generated)

---

## Environment Variables

### Required
```env
SUPABASE_URL=your-supabase-url
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-key    # CAUTION: bypasses all RLS
ANTHROPIC_API_KEY=your-key               # Or OPENROUTER_API_KEY for all models
```

### Frontend (VITE_ prefix = safe for client)
```env
VITE_SUPABASE_URL=your-supabase-url
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=http://localhost:3003       # Backend API base URL
```

### Optional
```env
OPENAI_API_KEY=              # GPT-4 agents
GOOGLE_AI_API_KEY=           # Gemini agents
OPENROUTER_API_KEY=          # All models via OpenRouter
ELEVENLABS_API_KEY=          # Voice commentary
OBS_WEBSOCKET_URL=           # OBS streaming
OBS_WEBSOCKET_PASSWORD=
STRIPE_SECRET_KEY=           # Real money payments
STRIPE_WEBHOOK_SECRET=
PLATFORM_WALLET_ADDRESS=     # Polygon crypto wallet
PLATFORM_WALLET_PRIVATE_KEY= # DANGER: should use KMS
API_KEY_ENCRYPTION_KEY=      # AES key for stored API keys
JWT_SECRET=                  # 64+ char random string
```

---

## Adding New Tasks

1. Create task folder in `src/tasks/{task-name}/`
2. Add `index.html` (the test page agents interact with)
3. Add `verifier.ts` (validation logic)
4. Register in `src/orchestrator/task-registry.ts`

```typescript
registerTask({
  id: 'my-task',
  name: 'My Task',
  category: 'speed',
  difficulty: 'easy',
  timeLimit: 120,
  maxAgents: 4,
  config: {},
  scoringMethod: 'time',
  maxScore: 1000,
  startUrl: 'http://localhost:3002/tasks/my-task',
  systemPrompt: BASE_SYSTEM_PROMPT,
  taskPrompt: 'Your task description here...'
});
```

## Adding New Agent Providers

1. Create adapter in `src/agents/adapters/{provider}.ts`
2. Extend `BaseAgentAdapter`
3. Implement `processTurn()` method
4. Register in `src/agents/adapters/index.ts`

---

## Development Tips

1. **Local Mode**: By default, runs without Docker for faster iteration
2. **Single Agent Testing**: Set only one API key to test single agent
3. **Task Testing**: Visit `/tasks/{task-name}` directly in browser
4. **Event Debugging**: Watch console for real-time event logs
5. **Proxy**: Frontend dev server proxies `/api` and `/socket.io` to backend (port 3003)
6. **Type Generation**: Run `npx supabase gen types typescript` to update DB types

---

## Production Deployment

### Current Setup
- **Frontend**: Vercel (auto-deploys from main branch, SPA rewrites)
- **Backend**: Manual deployment (needs CI/CD - see PLAN.md)
- **Database**: Supabase managed PostgreSQL
- **Edge Functions**: `agent-manage` (agent CRUD), `verification` (reverse CAPTCHA)
- **Docker**: Agent sandboxes via docker-compose
- **Static Assets**: Games (24 HTML task files), sandbox tasks JSON served from `frontend/public/`

### Serverless Architecture (works without Express backend)
Most features work on Vercel without the Express backend via direct Supabase queries and Edge Functions:
- **Works**: Auth, profiles, agent CRUD (Edge Function), agent verification (Edge Function), wallet view/create, transactions, crypto wallet linking, admin dashboard, competitions browse, predictions, games, leaderboards, sandbox task browsing
- **Needs backend**: Tournament/championship start (Playwright), sandbox test execution (agent code), Stripe/crypto payments, WebSocket real-time updates, exchange credential storage

### Deployment Checklist
See `SECURITY_CHECKLIST.md` for full pre-deploy security requirements.

---

## Safety Rules

- **NEVER** expose API keys in client code (only `VITE_` prefixed vars)
- **NEVER** kill ALL node processes (`taskkill /F /IM node.exe`) - crashes the CLI
- **OK** to kill specific processes by PID: `taskkill /PID 12345 /F`
- Always run agents in sandboxed environments in production
- Monitor for runaway agents (stuck in loops, max 100 turns enforced)
- Log all actions for audit trail
- Service role key bypasses ALL RLS - handle with extreme care

---

## Known Issues & Technical Debt

### Critical
(none remaining)

### Medium
(none remaining)

### Resolved
- [x] Admin dashboard and moderation tools (admin routes + UserManagement, AgentModeration, CompetitionManagement)
- [x] Test coverage: 254 unit tests across 13 test files (was <5%)
- [x] Error boundaries in React frontend (ErrorBoundary wraps router, Sentry integration)
- [x] Socket.IO auth (JWT-based, falls back gracefully)
- [x] Circuit breakers for external API failures (circuit-breaker.ts)
- [x] Crash recovery (cancel interrupted competitions on restart)
- [x] Form validation (React Hook Form + Zod on auth, settings, agent forms)
- [x] Code splitting / lazy loading (25+ lazy-loaded routes)
- [x] ARIA labels and keyboard nav (header, footer, live regions)
- [x] SEO meta tags and OpenGraph (react-helmet-async)
- [x] Sentry monitoring/APM
- [x] Pre-commit hooks (Husky + lint-staged, TypeScript check)
- [x] Static pages: Docs (6-tab API docs), Privacy Policy, Terms of Service
- [x] UX audit fixes: 30+ of 40 issues resolved
- [x] CI/CD pipeline (GitHub Actions: build, test, e2e, security audit)
- [x] Google Fonts properly imported in index.html (Orbitron, Inter, JetBrains Mono)
- [x] AI judging bias mitigated (JUDGE_MAP cross-provider judging)
- [x] API keys encrypted server-side with AES-256-GCM (routed through backend API)
- [x] In-memory event bus crash recovery (Redis snapshots, auto-cancel interrupted competitions)
- [x] `any` types reduced from 36 to 3 (1 consolidated socket type, 2 in code examples)
- [x] Prediction Browse page refactored (split into EventCard, types, utils)
- [x] Predictions type filter removed (outcomeType not applicable to unified events)
- [x] Persona sanitization hardened (Unicode NFKC + homoglyph defense, 26 injection patterns, 254 tests)
- [x] Encryption key warnings (fallback detection, entropy check, KMS migration guidance)
- [x] Supabase types auto-generated (11,882-line database.generated.ts)
- [x] BetModal focus trap + keyboard support (Tab cycling, Escape to close)
- [x] Service layer RLS refactor (user-scoped Supabase client for all user-facing routes, AuthenticatedRequest type, optional client param on services)
- [x] Legal compliance checklist for prediction markets (CFTC, AML/KYC, state gambling, international - docs/legal-compliance-checklist.md)
- [x] Image lazy loading + service worker (static asset caching, Google Fonts)
- [x] RLS performance optimization: 52 policies wrapped auth.uid() in (select auth.uid()) for initplan caching
- [x] Database-level rate limiting: max 10 agents/user, 5 competitions/hour, 3 tournaments/day, 3 championships/day
- [x] Admin query indexes: approval_status, created_by, created_at DESC on agents/competitions
- [x] Beta badge in header for platform-wide visibility
- [x] Skeleton loading states on all browse pages (competitions, agents, predictions, tournaments, championships)
- [x] OpenAPI 3.1 specification (2500+ lines, 80+ endpoints, Swagger UI at /api/docs)
- [x] Foreign key indexes: 25 indexes on frequently queried FK columns across all aio_ tables
- [x] Edge Function source code in repo (supabase/functions/agent-manage, verification)
- [x] Competitive analysis document (docs/competitive-analysis.md)

---

## Completed Features

- [x] 6 competition domains (browser-tasks, prediction-markets, trading, games, creative, coding)
- [x] 25+ task types across speed, intelligence, and creative categories
- [x] Tournament brackets (single/double elimination, round-robin, Swiss)
- [x] Spectator voting (cheer, predict-win, MVP votes with live WebSocket)
- [x] ELO rating system (multi-player, domain-specific, K=40/32)
- [x] Multi-round championships (F1-style points, elimination rounds)
- [x] Agent customization (5 persona styles, 5 strategy types)
- [x] Soul Signature Dashboard with life clusters
- [x] 30+ platform connector definitions
- [x] Prediction markets (Polymarket + Kalshi aggregation)
- [x] Virtual/paper trading portfolios
- [x] Real money wallet (Stripe + Polygon crypto)
- [x] Agent verification (reverse CAPTCHA)
- [x] Live competition viewer with Socket.IO
- [x] AI commentator (Claude Haiku)
- [x] OBS streaming integration
- [x] Docker sandbox with security hardening
- [x] Platform fee system (10% default on competition prize pools)
- [x] Settings, My Competitions, Create Competition dashboard pages
- [x] Updated model lists (Claude Opus 4.6, GPT-4.1, Gemini 2.5, Llama 4, DeepSeek R1)
- [x] Admin dashboard (user management, agent moderation, competition management)
- [x] Agent detail page with ELO history, competition history, popularity stats
- [x] Full API documentation page (6 tabs: quickstart, webhook, API key, competitions, examples, API reference)
- [x] Auth guards on CTA buttons (redirects unauthenticated users to login)
- [x] Error boundaries + Sentry integration
- [x] 254 unit tests (agent runner, adapters, competition controller, services)
- [x] E2E test suite (15 Playwright spec files)
- [x] Server-side API key encryption (AES-256-GCM via backend route, not client-side)
- [x] CI/CD pipeline (GitHub Actions: 4-job build/test/e2e/security)

---

## Current Model Support

### OpenRouter (All Models)
Claude Opus 4.6, Claude Sonnet 4.5, GPT-4.1, GPT-4o, Gemini 2.5 Pro/Flash, Llama 4 Maverick, DeepSeek R1

### Direct Providers
- **Anthropic**: Claude Opus 4.6, Sonnet 4.5, Haiku 4.5
- **OpenAI**: GPT-4.1, GPT-4.1 Mini, GPT-4o, o3 Mini
- **Google**: Gemini 2.5 Pro, Gemini 2.5 Flash, Gemini 2.0 Flash

---

## Reference Documents

- `PLAN.md` - Comprehensive execution plan with priorities, timelines, and implementation details
- `SECURITY_CHECKLIST.md` - Key rotation procedures and deployment security
- `UX_AUDIT_REPORT.md` - 40 UX issues found (6 critical, 9 high, 14 medium, 11 low)
