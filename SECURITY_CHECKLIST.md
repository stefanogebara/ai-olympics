# Security Checklist - AI Olympics

## Key Regeneration Status

The following keys should be regenerated before any public or production deployment.
If any key has ever been exposed in git history, logs, or client-side code, treat it as compromised.

### Critical Priority (Regenerate Immediately)

| Key | Where to Rotate | Status |
|-----|-----------------|--------|
| **SUPABASE_SERVICE_KEY** | Supabase Dashboard > Settings > API > service_role key. Note: this key cannot be independently rotated; you must rotate the JWT secret which invalidates both anon and service keys. | Needs rotation if exposed |
| **SUPABASE_ANON_KEY** | Rotated together with service key (same JWT secret). After rotation, update both backend `.env` and frontend `VITE_SUPABASE_ANON_KEY`. | Needs rotation if exposed |
| **STRIPE_SECRET_KEY** | Stripe Dashboard > Developers > API keys > Roll key. Create new key first, update env, then revoke old key. | Needs rotation if exposed |
| **STRIPE_WEBHOOK_SECRET** | Stripe Dashboard > Developers > Webhooks > select endpoint > Reveal signing secret. Delete old endpoint and create new one if compromised. | Needs rotation if exposed |
| **GITHUB_CLIENT_SECRET** | GitHub > Settings > Developer settings > OAuth Apps > select app > Generate a new client secret. Update env, then delete old secret. | Needs rotation if exposed |
| **JWT_SECRET** | Self-managed. Generate new value: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`. Note: rotating this invalidates all existing user sessions. | Needs rotation if exposed |
| **API_KEY_ENCRYPTION_KEY** | Self-managed. If rotated, all encrypted API keys in the database must be re-encrypted. Run the migration script before changing this value. | Needs rotation if exposed |
| **PLATFORM_WALLET_PRIVATE_KEY** | Transfer all funds to a new wallet immediately if exposed. Generate a new wallet and update the address and private key. | Needs rotation if exposed |

### High Priority

| Key | Where to Rotate | Status |
|-----|-----------------|--------|
| **ANTHROPIC_API_KEY** | Anthropic Console > Settings > API Keys > Create new key, delete old. | Needs rotation if exposed |
| **OPENAI_API_KEY** | OpenAI Platform > API Keys > Create new secret key, revoke old. | Needs rotation if exposed |
| **GOOGLE_AI_API_KEY** | Google AI Studio > API Keys > Create new key, delete old. | Needs rotation if exposed |
| **OPENROUTER_API_KEY** | OpenRouter Dashboard > Keys > Create new key, delete old. | Needs rotation if exposed |
| **ELEVENLABS_API_KEY** | ElevenLabs > Profile > API Keys > Create new, delete old. | Needs rotation if exposed |

### Medium Priority

| Key | Where to Rotate | Status |
|-----|-----------------|--------|
| **KALSHI_EMAIL/PASSWORD** | Change password at kalshi.com account settings. | Needs rotation if exposed |
| **OBS_WEBSOCKET_PASSWORD** | OBS > Tools > WebSocket Server Settings > change password. | Needs rotation if exposed |

---

## Rotation Steps (General Process)

1. **Generate** the new key/secret in the provider's dashboard
2. **Update** the key in your production environment (hosting platform env vars, not files)
3. **Test** that the application works with the new key
4. **Revoke** the old key in the provider's dashboard
5. **Verify** the old key no longer works

For keys that cause downtime during rotation (JWT_SECRET, SUPABASE keys), schedule a maintenance window.

---

## Supabase Dashboard Security Settings

### Row Level Security (RLS)
- [ ] Verify RLS is enabled on ALL tables in Supabase Dashboard > Table Editor
- [ ] Each table should have appropriate SELECT/INSERT/UPDATE/DELETE policies
- [ ] Service role key bypasses RLS -- only use it server-side for admin operations
- [ ] Use `createUserClient(jwt)` utility for user-scoped operations (already implemented)

### API Settings (Dashboard > Settings > API)
- [ ] Confirm JWT secret is not the default Supabase-generated one for production
- [ ] Review exposed schemas -- only `public` should be exposed unless intentional
- [ ] Max rows returned should be set to a reasonable limit (e.g., 1000)

### Auth Settings (Dashboard > Authentication > Settings)
- [ ] Disable email confirmations only if using social auth exclusively
- [ ] Set appropriate password requirements
- [ ] Configure rate limiting for auth endpoints
- [ ] Add production domain to Site URL and Redirect URLs
- [ ] Remove localhost URLs from Redirect URLs in production

### Database Settings
- [ ] Disable direct database connections if not needed (use API only)
- [ ] Enable SSL enforcement for database connections
- [ ] Review database roles and permissions

---

## Git History Audit

### Checking for leaked secrets
```bash
# Check if .env was ever committed
git log --all --full-history -- .env
git log --all --full-history -- frontend/.env

# Search for potential secrets in history (broad search)
git log --all -p --diff-filter=A -- "*.env" "*.env.*"

# If secrets were found in history, they MUST be rotated
# Do NOT rely on git history rewriting -- treat them as compromised
```

### Current .gitignore Coverage
The following patterns are covered:
- `.env` -- main environment file
- `.env.local` -- local overrides
- `.env.production` -- production environment
- `.env.*.local` -- local overrides for any environment

---

## Production Deployment Checklist

### Before First Deploy
- [ ] All keys listed above have been generated fresh (not copied from development)
- [ ] `NODE_ENV=production` is set
- [ ] `LOG_LEVEL=warn` or `error` (not `debug`)
- [ ] `CLIENT_URL` points to actual production domain (not localhost)
- [ ] Stripe is using **live** keys, not test keys
- [ ] Supabase RLS policies are reviewed and tested
- [ ] JWT_SECRET is a strong random value (64+ chars)
- [ ] CORS allowlist does not include localhost origins
- [ ] Rate limiting is configured and tested
- [ ] Helmet security headers are enabled (already implemented)

### Environment Variable Storage
- [ ] All secrets stored in hosting platform's secret manager (Vercel env vars, Railway variables, etc.)
- [ ] No secrets in Docker images, git repos, or client-side code
- [ ] `VITE_` prefixed vars are safe for client exposure (only public keys)
- [ ] Server-side secrets (STRIPE_SECRET_KEY, SERVICE_KEY, etc.) are never sent to the frontend

### Ongoing
- [ ] Rotate keys quarterly or immediately after any suspected exposure
- [ ] Monitor Supabase Dashboard > Logs for unusual activity
- [ ] Review Stripe Dashboard for unexpected charges or webhook failures
- [ ] Keep dependencies updated (`npm audit` regularly)
- [ ] Review GitHub OAuth app access periodically
