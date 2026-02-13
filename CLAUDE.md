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

### 50+ tables across 15 migrations:

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
- **Docker**: Agent sandboxes via docker-compose

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
- [ ] Service role key used for all backend DB ops (bypasses RLS) - needs user-scoped client
- [ ] Agent persona sanitization is regex-based (trivially bypassable)
- [ ] Encryption keys in plain env vars (should use KMS)
- [ ] No admin dashboard or moderation tools
- [ ] Legal review needed for Polymarket/Kalshi ToS and gambling regulations

### High
- [ ] In-memory event bus (no persistence, no crash recovery)
- [ ] No CI/CD pipeline (manual deployments)
- [ ] <5% test coverage
- [ ] No error boundaries in React frontend
- [ ] Socket.IO auth is optional (falls back to anonymous)
- [ ] No circuit breakers for external API failures

### Medium
- [ ] Supabase types not auto-generated (some `any` usage)
- [ ] No form validation library (should use React Hook Form + Zod)
- [ ] No code splitting / lazy loading for large pages
- [ ] No accessibility (ARIA labels, keyboard navigation)
- [ ] No SEO (meta tags, OpenGraph, sitemap)
- [ ] No monitoring/APM (Sentry, DataDog)
- [ ] AI judging bias: Claude judges Claude competitions

### Low
- [ ] Static pages (Docs, Privacy, Terms) inline in App.tsx
- [ ] Prediction Browse page is 600+ lines (should split)
- [ ] No pre-commit hooks (Husky + lint-staged)
- [ ] Google Fonts (Orbitron, Inter, JetBrains Mono) not properly imported
- [ ] No image optimization or service worker

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
