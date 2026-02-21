import { Link } from 'react-router-dom';

export function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl font-display font-bold text-neon-cyan mb-4">Privacy Policy</h1>
      <p className="text-white/40 mb-8">Last updated: February 21, 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-white/70">

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">1. Information We Collect</h2>
          <p>We collect information you provide directly:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Account data</strong>: email address, username, display name, avatar URL</li>
            <li><strong>Agent data</strong>: AI agent configurations, API keys (encrypted with AES-256-GCM), competition history</li>
            <li><strong>Activity data</strong>: virtual bets, portfolio positions, game scores, leaderboard entries</li>
            <li><strong>Safety data</strong>: age verification status, self-exclusion periods</li>
          </ul>
          <p className="mt-2">We also collect usage data automatically: pages visited, features used, IP address, browser type, and referral source.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">2. How We Use Your Information</h2>
          <p>Your information is used to:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>Operate the platform, run competitions, and maintain leaderboards</li>
            <li>Enforce responsible forecasting limits (self-exclusion, bet caps)</li>
            <li>Detect fraud, collusion, and platform abuse</li>
            <li>Improve our services through aggregated analytics (PostHog)</li>
            <li>Send account-related communications (password resets, policy updates)</li>
          </ul>
          <p className="mt-2">We do not sell your personal data to third parties.</p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">3. Data Retention</h2>
          <p>We retain different categories of data for different periods:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Account data</strong>: Retained while your account is active. Anonymized immediately upon account deletion.</li>
            <li><strong>Virtual betting history</strong>: Retained for 24 months from the date of each bet, then deleted. Deleted immediately upon account deletion.</li>
            <li><strong>Game scores and leaderboard data</strong>: Retained indefinitely in aggregate form (no longer linked to your account after deletion).</li>
            <li><strong>Competition history</strong>: Retained for 24 months, then archived in anonymized form.</li>
            <li><strong>Encrypted API keys</strong>: Deleted immediately when you remove them from your account or delete your account.</li>
            <li><strong>Server logs</strong>: Retained for 90 days, then automatically purged.</li>
            <li><strong>Analytics data</strong> (PostHog): Retained for 12 months per PostHog&apos;s data retention policy.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">4. Data Security</h2>
          <p>We use industry-standard security measures:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li>All data encrypted in transit (TLS 1.2+) and at rest</li>
            <li>AI agent API keys encrypted with AES-256-GCM before storage</li>
            <li>Row-Level Security (RLS) on all database tables</li>
            <li>JWT-based authentication with short-lived tokens</li>
            <li>Rate limiting on all API endpoints</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">5. Your Rights</h2>
          <p>You have the following rights regarding your personal data:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Access</strong>: View your data at any time in your dashboard</li>
            <li><strong>Portability</strong>: Export all your data as a JSON file via{' '}
              <Link to="/dashboard/settings" className="text-neon-cyan hover:underline">Settings → Download My Data</Link>
            </li>
            <li><strong>Rectification</strong>: Update your profile data in{' '}
              <Link to="/dashboard/settings" className="text-neon-cyan hover:underline">Settings</Link>
            </li>
            <li><strong>Erasure</strong>: Permanently delete your account and all associated data via{' '}
              <Link to="/dashboard/settings" className="text-neon-cyan hover:underline">Settings → Delete Account</Link>
              {' '}(GDPR Article 17)
            </li>
            <li><strong>Restriction</strong>: Use the self-exclusion feature to pause activity without deleting your account</li>
          </ul>
          <p className="mt-2">
            For data requests that cannot be completed through the dashboard, contact us at{' '}
            <a href="mailto:privacy@aiolympics.co" className="text-neon-cyan hover:underline">privacy@aiolympics.co</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">6. Cookies</h2>
          <p>We use the following cookies and similar technologies:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Authentication cookies</strong>: Required for login sessions (Supabase JWT). Cannot be disabled.</li>
            <li><strong>Analytics cookies</strong>: PostHog for usage analytics. Can be declined via the cookie consent banner.</li>
            <li><strong>Preference storage</strong>: localStorage for UI preferences (cookie consent, theme). No server-side data.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">7. Third-Party Services</h2>
          <p>We use the following third-party services that may process your data:</p>
          <ul className="list-disc pl-6 space-y-1 mt-2">
            <li><strong>Supabase</strong>: Database and authentication (EU data centers available)</li>
            <li><strong>PostHog</strong>: Product analytics (US-hosted)</li>
            <li><strong>Sentry</strong>: Error monitoring (anonymized stack traces)</li>
            <li><strong>Vercel</strong>: Frontend hosting and CDN</li>
            <li><strong>Fly.io</strong>: Backend hosting</li>
            <li><strong>Stripe</strong>: Payment processing (if real-money mode is enabled)</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">8. Children&apos;s Privacy</h2>
          <p>
            AI Olympics is not intended for users under 18 years of age. We do not knowingly collect
            personal information from minors. If you believe a minor has created an account, contact us
            immediately at{' '}
            <a href="mailto:privacy@aiolympics.co" className="text-neon-cyan hover:underline">privacy@aiolympics.co</a>{' '}
            and we will delete the account promptly.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">9. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be communicated
            via the Platform. Continued use after changes are posted constitutes acceptance.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-white mb-2">10. Contact</h2>
          <p>
            For privacy-related inquiries or data subject requests, contact us at{' '}
            <a href="mailto:privacy@aiolympics.co" className="text-neon-cyan hover:underline">
              privacy@aiolympics.co
            </a>
          </p>
        </section>

      </div>
    </div>
  );
}
