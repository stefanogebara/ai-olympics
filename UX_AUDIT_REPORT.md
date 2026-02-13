# AI Olympics - Comprehensive UX/CX Audit Report
**Date:** February 10, 2026
**Audited by:** Skeptical First-Time User Perspective
**Platform:** http://localhost:5173 (dev mode)

---

## Executive Summary

The AI Olympics platform has a **strong visual identity** with its cyberpunk/neon aesthetic and a solid architectural foundation. However, the experience as a first-time user reveals **significant friction points** that would cause drop-off. The biggest issues are: broken navigation links, silent failures on key actions, heavy reliance on mock/fake data that erodes trust, missing pages for core links, and the platform feeling "empty" due to no real content.

**Overall Score: 6/10** - Good bones, needs polish.
**Total Issues Found: 40** (6 Critical, 9 High, 14 Medium, 11 Low)

---

## CRITICAL ISSUES (Must Fix)

### 1. Broken Links Throughout the Platform
**Severity:** CRITICAL
**Pages affected:** Landing page, Footer (every page)

| Link | Location | Result |
|------|----------|--------|
| `/docs` (Read Documentation) | Landing CTA section, Footer | **404 Page** |
| `/privacy` (Privacy Policy) | Footer on every page | **404 Page** |
| `/terms` (Terms of Service) | Footer on every page | **404 Page** |

**Impact:** A user who clicks "Read Documentation" from the landing page immediately hits a dead end. Privacy Policy and Terms of Service links in the footer are broken on EVERY page. For a platform that handles money (real-money competitions), missing legal pages is a serious trust issue.

**Fix:** Create these pages, even as simple placeholder content. The `/docs` page should exist with API documentation or at minimum a "Coming Soon" message.

---

### 2. "Start Game" Button Does Nothing (Silent Failure)
**Severity:** CRITICAL
**Page:** `/games/:type/play` (e.g., `/games/trivia/play`)

When you click "Start Game", the button transitions the state to `playing` and loads an iframe pointing to `${API_BASE}/tasks/${type}`. However:
- The iframe loads a task page from the API server (port 3003)
- If the API isn't serving the task page correctly, the iframe shows nothing or errors silently
- There is **no loading indicator** while the iframe loads
- There is **no error boundary** if the iframe fails to load
- There is **no timeout** - a user could wait forever staring at a blank iframe

**Impact:** This is the core gameplay loop. If a new user clicks "Play Now" on Trivia and nothing happens, they leave immediately.

**Fix:**
- Add a loading spinner overlay on the iframe until it emits a "ready" postMessage
- Add a timeout (e.g., 10 seconds) that shows an error: "Game failed to load. Try again or open in a new tab."
- Add visible error state if the iframe src returns a non-200 response

---

### 3. Landing Page Stats Are Fake/Misleading
**Severity:** HIGH
**Page:** Landing page (`/`)

The hero section displays:
- **500+** Registered Agents
- **$50K** Prize Pool
- **10K+** Competitions Run

These are **hardcoded values** in `Landing.tsx` (lines 127-131). The database is empty - there are 0 agents, 0 competitions, $0 prize pool. This is misleading and destroys trust the moment a user visits `/agents` or `/competitions` and sees "No agents found" / "No competitions found".

**Fix:** Either:
1. Fetch real stats from the API and show actual numbers
2. Remove the stats section entirely until there's real data
3. Label them clearly: "Join the future arena..." without specific numbers

---

### 4. Multiple Pages Show Mock/Fake Data in Dev Mode
**Severity:** HIGH
**Pages:** Games Leaderboard, Meta Markets, Portfolio

Several pages silently fall back to `generateMockData()` when API calls fail:
- **Games Leaderboard** (`Leaderboard.tsx:79`): Shows fake users "AlphaBot", "BrainStorm" etc.
- **Meta Markets** (`MetaMarkets.tsx:150`): Shows fake betting matchups with "Claude 3.5", "GPT-4 Turbo"
- **Portfolio** (`Portfolio.tsx:125`): Shows fake positions and bets

A user sees what looks like real data, tries to interact with it, and the actions fail. This is worse than showing "No data" because it creates false expectations.

**Fix:** Remove mock data fallbacks. Show proper empty states with clear CTAs instead. Mock data should only exist in storybooks or dedicated demo modes, never in the main app.

---

## HIGH PRIORITY ISSUES

### 5. No "Predictions" Link in Navigation Header
**Severity:** HIGH
**Component:** `Header.tsx`

The nav items are: Competitions, Games, Agents, Leaderboards. **Predictions/Markets is completely missing** from the main navigation. The only way to reach `/predictions` is through the landing page domain cards or typing the URL directly.

This is a core feature of the platform and it's hidden from users.

**Fix:** Add Predictions to the nav items array:
```tsx
{ path: '/predictions', label: 'Markets', icon: TrendingUp }
```

---

### 6. Leaderboard Table Overflows on Mobile
**Severity:** HIGH
**Page:** `/leaderboards`

The Global Leaderboard table has columns: Rank, Agent, Owner, ELO, Wins, Co... (cut off). The last column is truncated and a horizontal scrollbar appears. On a 502px viewport (phone), this looks broken.

**Fix:** Make the table responsive:
- Hide less important columns on mobile (Owner, Competitions count)
- Or use a card layout on mobile instead of a table
- Add `overflow-x-auto` with a visual scroll indicator

---

### 7. "Create Competition" Button on Competitions Page - No Auth Check
**Severity:** HIGH
**Page:** `/competitions`

The "Create Competition" button is visible to unauthenticated users. Clicking it likely fails silently or shows an error. There should be either:
- A redirect to login with a "you must sign in" message
- The button hidden for unauthenticated users
- A modal prompting sign-in

---

### 8. Auth Pages - No Error Feedback for OAuth
**Severity:** HIGH
**Pages:** `/auth/login`, `/auth/signup`

The Google and GitHub OAuth buttons call Supabase auth but there's no visible error handling if:
- Supabase credentials aren't configured
- The OAuth redirect fails
- The user cancels the OAuth flow

Users click the button, potentially nothing happens, and they're left confused.

**Fix:** Add try/catch around OAuth calls with toast notifications showing the error.

---

## MEDIUM PRIORITY ISSUES

### 9. Landing Page Title Has Missing Space
**Severity:** MEDIUM
**Page:** Landing page

The markdown extraction shows: "The Global Arena forAI Agent Competition" - there's a missing space between "for" and "AI". This is because the `<br/>` between "for" and the NeonText component doesn't render a space in the text content. The visual rendering may look fine due to the line break, but screen readers and crawlers see "forAI".

**Fix:** Add a space before the NeonText: `for ` or use proper line-break spacing.

---

### 10. Footer Shows on Every Page Including 404
**Severity:** MEDIUM (minor inconsistency)
**Page:** 404 page

The 404 page shows a minimal "404 / Page not found / Go Home" but doesn't show the footer. The header still appears. This inconsistency is minor but the 404 page could benefit from:
- Suggested links ("Were you looking for...?")
- Search functionality
- The footer for navigation

---

### 11. "Predictions" Domain Card Links Don't Match
**Severity:** MEDIUM
**Page:** Landing page

The domain cards link to:
- Browser Tasks -> `/competitions?domain=browser-tasks`
- Prediction Markets -> `/predictions` (different page entirely!)
- Trading & Finance -> `/competitions?domain=trading`
- Games -> `/competitions?domain=games`

Prediction Markets breaks the pattern by going to a different page instead of filtered competitions. This creates inconsistent navigation expectations.

---

### 12. Games Section - No "Back to Games" from Gameplay
**Severity:** MEDIUM
**Page:** `/games/:type/play`

During gameplay (the `playing` state), the only navigation option is "Open in new tab". There's no way to go back or exit the game without using the browser's back button. The "Back" button disappears once you start playing.

**Fix:** Show a "Quit Game" or "Back" button during gameplay, perhaps with a confirmation dialog.

---

### 13. Signup Form - Checkbox Without Validation
**Severity:** MEDIUM
**Page:** `/auth/signup`

The "I agree to Terms of Service and Privacy Policy" checkbox links to `/terms` and `/privacy` which are both 404s. Additionally, it's unclear if the form actually validates that the checkbox is checked before submission.

**Fix:** Create the terms/privacy pages. Ensure form validation requires the checkbox.

---

### 14. Dashboard Auth Guard - No Redirect Message
**Severity:** MEDIUM
**Page:** `/dashboard` (and all sub-routes)

Navigating to `/dashboard` while logged out silently redirects to `/auth/login`. There's no flash message or indication to the user that they need to sign in to access the dashboard. They just suddenly see the login page.

**Fix:** Pass a redirect parameter and show a message: "Please sign in to access your dashboard."

---

### 15. "Predictions" Page - Full-Width "Refresh" Button
**Severity:** MEDIUM (UX/Visual)
**Page:** `/predictions`

The "Refresh" button spans the full container width at the top of the predictions page. This is visually dominant and unexpected. A refresh button should be a small icon button, not a full-width primary CTA.

**Fix:** Make it a smaller button aligned to the right, or use an icon-only refresh button.

---

### 16. Trading & Finance Domain Card Uses Same Icon
**Severity:** LOW (Visual)
**Page:** Landing page

Both "Prediction Markets" and "Trading & Finance" use the `TrendingUp` icon. They should have distinct icons to help users differentiate at a glance.

**Fix:** Use `DollarSign`, `BarChart2`, or `Wallet` for Trading & Finance.

---

## LOW PRIORITY / POLISH ISSUES

### 17. Console.log Override in Games Play
**Severity:** LOW (Code Quality)
**File:** `pages/games/Play.tsx:72-87`

The games Play page overrides `console.log` globally to intercept game completion messages. This is a fragile hack that could break debugging and other console logging.

**Fix:** Use `postMessage` exclusively for game-to-parent communication. Remove the console.log override.

---

### 18. No Favicon or Meta Tags
**Severity:** LOW
**All pages**

The browser tab shows "AI Olympics - Live Competition" which is fine, but there's no custom favicon visible in the screenshots. Meta tags for social sharing (Open Graph, Twitter cards) should be added for link previews.

---

### 19. Community Links Point to Non-Existent Resources
**Severity:** LOW
**Component:** Footer

- GitHub: `https://github.com/ai-olympics` - likely doesn't exist
- Twitter: `https://twitter.com/aiolympics` - likely doesn't exist
- Discord: `https://discord.gg/aiolympics` - likely doesn't exist

**Fix:** Either create these, use `#` as placeholder, or remove until they exist.

---

### 20. Score Submit Missing Auth Header
**Severity:** LOW (Bug)
**File:** `pages/games/Play.tsx:115-120`

The score submission code has a comment `// Add auth header if available` but doesn't actually add it:
```typescript
headers: {
  'Content-Type': 'application/json',
  // Add auth header if available  <-- never implemented
},
```

**Fix:** Add the Supabase session token as a Bearer token in the Authorization header.

---

### 21. Signup Password Placeholder Shows Dots
**Severity:** LOW (UX Polish)

Both password fields show `••••••••` as placeholder text. This is fine for Password, but for "Confirm Password" it might confuse users into thinking a value is pre-filled. Consider using "Re-enter password" as placeholder instead.

---

### 22. Agent Browse - "Create Agent" CTA in Empty State Goes Nowhere Without Auth
**Severity:** LOW
**Page:** `/agents`

When no agents exist, a "Create Agent" button is shown. For unauthenticated users, this likely fails or redirects unexpectedly.

**Fix:** Check auth state and redirect to signup/login with context.

---

### 23. No Loading States on Competitions Browse
**Severity:** LOW
**Page:** `/competitions`

The competitions page shows "No competitions found" immediately. There's no brief loading spinner first. This makes it unclear if the data has loaded or the page is still fetching.

---

## CODE-LEVEL ISSUES (From Source Analysis)

### 24. Dynamic Tailwind Classes Will Break in Production
**Severity:** CRITICAL
**Files:** `games/Browse.tsx`, `games/Play.tsx`

Classes like `bg-neon-${game.color}/20` and `text-neon-${game.color}` are constructed dynamically. Tailwind CSS purges unused classes at build time, so these dynamic classes will **not be in the production CSS bundle**. This means game icons and colors will be invisible/broken in production.

**Fix:** Use a Tailwind safelist in `tailwind.config.js` for all neon color variants, or use inline styles instead of dynamic class names.

---

### 25. Route Gap: `/agents/:slug` Does Not Exist
**Severity:** HIGH
**File:** `App.tsx`, `agents/Browse.tsx`

Agent cards in Browse link to `/agents/${agent.slug}`, but **no route is defined for `/agents/:slug`** in App.tsx. Clicking any agent card navigates to a **404 page**.

**Fix:** Either create an agent detail page route, or change agent cards to be non-clickable / use a modal.

---

### 26. Live Competition View Ignores URL Parameter
**Severity:** HIGH
**File:** `competitions/Live.tsx:12`

`const { id } = useParams()` extracts the competition ID from the URL, but it is **never passed to `useCompetition()`**. The hook always connects to the default/global competition, not the one specified in the URL. Every `/competitions/:id` link shows the same (or no) competition.

**Fix:** Pass `id` to `useCompetition(id)` and use it to subscribe to the correct WebSocket room.

---

### 27. Global Leaderboard Domain Filter Does Nothing
**Severity:** HIGH
**File:** `leaderboards/Global.tsx:27`

The domain filter tabs (All Domains, Browser Tasks, etc.) set `selectedDomain` state, but `loadLeaderboard()` **completely ignores** this value. The buttons appear interactive but filtering never happens.

**Fix:** Use `selectedDomain` in the Supabase query to filter agents by domain.

---

### 28. Security: API Keys Stored Client-Side via Supabase
**Severity:** HIGH (Security)
**File:** `dashboard/AgentForm.tsx:177`

When creating an API Key agent, the raw API key is sent directly to Supabase from the client: `api_key_encrypted: apiKey`. Despite the column name suggesting encryption, no encryption happens. If RLS policies aren't extremely tight, other users could potentially read API keys.

**Fix:** Send API keys to a server-side endpoint that encrypts before storing. Never pass raw secrets through client-side Supabase inserts.

---

### 29. `<button>` Nested Inside `<Link>` (Invalid HTML)
**Severity:** MEDIUM
**Files:** Landing.tsx, multiple pages

Multiple pages wrap `NeonButton` (which renders a `<button>`) inside `<Link>` (which renders an `<a>`). This creates **nested interactive elements**, which is invalid HTML and causes unpredictable behavior with screen readers and click handlers.

**Fix:** Either make `NeonButton` accept an `as="a"` prop, or use `useNavigate()` on button click instead of wrapping in `Link`.

---

### 30. "Remember Me" Checkbox Does Nothing
**Severity:** MEDIUM
**File:** `auth/Login.tsx`

The "Remember me" checkbox on the login page is purely visual. It is not connected to any state or functionality. Users expect this to persist their session.

**Fix:** Either wire it to control Supabase session persistence (e.g., setting `persistSession: true/false`), or remove it.

---

### 31. BetModal Has No Focus Trap or Keyboard Support
**Severity:** MEDIUM (Accessibility)
**File:** `predictions/MetaMarkets.tsx:64-128`

The bet modal:
- Has no `role="dialog"` or `aria-modal="true"`
- Has no focus trap (users can Tab to background content)
- Cannot be closed with Escape key
- Backdrop click does not close it

**Fix:** Add proper modal accessibility: focus trap, Escape to close, backdrop click handler, ARIA attributes.

---

### 32. Predictions Browse - Type Filter is Broken
**Severity:** MEDIUM
**File:** `predictions/Browse.tsx:142`

The market type filter (Binary / Multiple Choice) checks `market.outcomeType`, but the `UnifiedMarket` type does not have an `outcomeType` property. The filter **never matches** and effectively does nothing.

**Fix:** Add `outcomeType` to the `UnifiedMarket` interface and ensure the API returns it, or remove the non-functional filter.

---

### 33. Leaderboard Shows Random Fake Rank Changes
**Severity:** MEDIUM
**File:** `leaderboards/Global.tsx:57`

`rankChange: Math.floor(Math.random() * 5) - 2` generates a random rank change on every render. This shows fake up/down arrows that change every page load, misleading users into thinking ranks are volatile.

**Fix:** Either fetch real rank changes from the API or remove the rank change indicators.

---

### 34. Missing Error Handling on 5+ Supabase Queries
**Severity:** MEDIUM
**Files:** `competitions/Browse.tsx`, `agents/Browse.tsx`, `leaderboards/Global.tsx`, `dashboard/Overview.tsx`, `dashboard/Agents.tsx`

At least 5 pages fetch data from Supabase with **no try/catch and no error display**. If any query fails, the user sees either an infinite loading spinner or empty content with no explanation.

**Fix:** Add try/catch blocks and display error states with retry buttons on all data-fetching pages.

---

### 35. Agent Search Has No Debounce
**Severity:** LOW
**File:** `agents/Browse.tsx:31`

`useEffect` depends on `searchQuery`, so every keystroke triggers a new Supabase query. Typing "test agent" fires 10 separate database queries.

**Fix:** Add a debounce (300-500ms) before firing the search query.

---

### 36. 404 Page Uses `<a>` Instead of `<Link>`
**Severity:** LOW
**File:** `App.tsx:105-120`

The "Go Home" button on the 404 page uses `<a href="/">` instead of `<Link to="/">`, causing a full page reload instead of client-side navigation.

**Fix:** Replace with `<Link to="/">`.

---

### 37. Portfolio Has Hardcoded Initial Stats
**Severity:** LOW
**File:** `dashboard/Portfolio.tsx:57-66`

The stats state initializes with fake values (`totalValue: 10000`, `winRate: 62`, etc.) that flash briefly before real data loads, or persist permanently if the API fails.

**Fix:** Initialize with zeros or nulls and show a loading skeleton.

---

### 38. `Create Competition` Links to Placeholder Page
**Severity:** MEDIUM
**File:** `competitions/Browse.tsx:112`

The "Create Competition" button links to `/dashboard/competitions/create`, but this route maps to `PlaceholderPage` showing "Coming soon...". Users hit a dead end.

**Fix:** Either implement the page or hide the button until it's ready.

---

### 39. Social Media Icons in Footer Have No Accessible Labels
**Severity:** LOW (Accessibility)
**File:** `Footer.tsx:80-103`

The GitHub, Twitter, and Discord icon links have no `aria-label`. Screen readers announce them as empty/unlabeled links.

**Fix:** Add `aria-label="GitHub"`, `aria-label="Twitter"`, `aria-label="Discord"`.

---

### 40. Mobile Menu Button Missing ARIA Attributes
**Severity:** LOW (Accessibility)
**File:** `Header.tsx:107-112`

The hamburger menu button lacks `aria-expanded`, `aria-label`, and `aria-controls`. Screen readers can't convey the menu state.

**Fix:** Add `aria-expanded={mobileMenuOpen}`, `aria-label="Toggle navigation menu"`.

---

## UX FLOW OBSERVATIONS

### What Works Well
1. **Visual Design** - The cyberpunk neon aesthetic is cohesive and memorable
2. **Landing page structure** - Clear value proposition, domains, how-it-works, CTAs
3. **Auth forms** - Clean, functional, with OAuth options
4. **Empty states** - Most empty states have helpful CTAs (competitions, agents)
5. **Mobile-first layout** - Pages generally work on mobile viewport
6. **Game cards** - The games browse page is visually appealing with difficulty badges
7. **Dashboard overview** - Well-structured with stats, agents, recent activity
8. **Glass card components** - Consistent card styling throughout

### What Needs Work
1. **First-time user confusion** - Too many "coming soon" or empty sections
2. **Trust signals** - Fake stats + fake data = zero trust
3. **Navigation gaps** - Predictions missing from nav, broken footer links
4. **Action feedback** - Silent failures on game start, form submissions
5. **Content density** - Many pages feel barren without real data
6. **Onboarding** - No guided tour or explanation of the platform for newcomers
7. **Mobile nav** - Hamburger menu implementation exists but needs testing
8. **Search** - Agent search and market search exist but may not function without API data

---

## RECOMMENDED PRIORITY ORDER

### Sprint 1: Fix Critical Breaks (Blocking Issues)
1. Fix broken links (/docs, /privacy, /terms) - create pages
2. Fix game Start button (add loading/error states for iframe)
3. Fix dynamic Tailwind classes (safelist neon colors) - **breaks production**
4. Add Predictions to nav header
5. Remove/replace fake stats on landing page
6. Remove mock data fallbacks (show empty states instead)
7. Fix `/agents/:slug` route gap (currently 404s)
8. Fix Live competition view to use URL parameter

### Sprint 2: Fix High Priority + Security
9. Move API key storage to server-side encryption
10. Add error handling to OAuth buttons
11. Fix leaderboard domain filter (currently does nothing)
12. Fix leaderboard table responsive layout
13. Add auth checks on CTA buttons (Create Competition, Create Agent)
14. Fix `Create Competition` dead-end placeholder page
15. Fix predictions type filter (outcomeType doesn't exist)
16. Add redirect messages on auth guard

### Sprint 3: Polish Core Flows
17. Fix nested `<button>` inside `<Link>` across all pages
18. Wire up "Remember Me" or remove it
19. Add focus trap + keyboard support to BetModal
20. Remove random fake rank changes from leaderboard
21. Add try/catch error handling on all 5+ Supabase queries
22. Fix score submission auth header
23. Add debounce to agent search

### Sprint 4: Enhance UX & Accessibility
24. Add loading states to all data-fetching pages
25. Fix icon duplication on landing page
26. Add ARIA labels to footer social links + hamburger menu
27. Fix 404 page to use `<Link>` instead of `<a>`
28. Fix portfolio hardcoded initial stats
29. Add meta tags and favicon
30. Add onboarding/tutorial for first-time users

---

## APPENDIX: Pages Visited

| Page | URL | Status |
|------|-----|--------|
| Landing | `/` | Renders, has issues #1, #3, #9, #11, #16 |
| Login | `/auth/login` | Renders correctly |
| Signup | `/auth/signup` | Renders, has issue #13 |
| Forgot Password | `/auth/forgot-password` | Renders correctly |
| Competitions Browse | `/competitions` | Renders, empty state works, issue #7 |
| Games Browse | `/games` | Renders well |
| Games Play (Trivia) | `/games/trivia/play` | **BROKEN** - issue #2 |
| Games Leaderboard | `/games/leaderboard` | Shows mock data - issue #4 |
| Predictions Browse | `/predictions` | Renders, empty + issue #15 |
| Meta Markets | `/predictions/ai-betting` | Shows mock data - issue #4 |
| Agents Browse | `/agents` | Renders, empty state works |
| Global Leaderboard | `/leaderboards` | Renders, issue #6 |
| Dashboard | `/dashboard` | Redirects to login (correct), issue #14 |
| Documentation | `/docs` | **404** - issue #1 |
| Privacy Policy | `/privacy` | **404** - issue #1 |
| Terms of Service | `/terms` | **404** - issue #1 |
| 404 Page | `/anything` | Renders with "Go Home" button |
