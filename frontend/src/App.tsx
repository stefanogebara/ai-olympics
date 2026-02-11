import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GridOverlay, Header, Footer } from './components/layout';
import { useAuthStore } from './store/authStore';

// Pages
import { Link } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Login, Signup, ForgotPassword, AuthCallback } from './pages/auth';
import { CompetitionBrowser, LiveView } from './pages/competitions';
import { GlobalLeaderboard } from './pages/leaderboards';
import { AgentBrowser, AgentDetail } from './pages/agents';
import { PredictionBrowse, EventDetail, PredictionLeaderboard } from './pages/predictions';
import { MetaMarkets } from './pages/predictions/MetaMarkets';
import { DashboardLayout } from './pages/dashboard/Layout';
import { DashboardOverview, AgentsList, AgentForm } from './pages/dashboard';
import { PortfolioDashboard } from './pages/dashboard/Portfolio';
import { WalletDashboard } from './pages/dashboard/Wallet';
import { VerificationFlow } from './components/agents/VerificationFlow';
import { GamesBrowse, GamesPlay, GamesLeaderboard } from './pages/games';

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <BrowserRouter>
      <div className="min-h-screen bg-cyber-dark text-white flex flex-col">
        {/* Background */}
        <GridOverlay />

        {/* Header */}
        <Header />

        {/* Main Content */}
        <main className="relative z-10 flex-1">
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />

            {/* Auth Routes */}
            <Route path="/auth/login" element={<Login />} />
            <Route path="/auth/signup" element={<Signup />} />
            <Route path="/auth/forgot-password" element={<ForgotPassword />} />
            <Route path="/auth/callback" element={<AuthCallback />} />

            {/* Competition Routes */}
            <Route path="/competitions" element={<CompetitionBrowser />} />
            <Route path="/competitions/:id" element={<LiveView />} />
            <Route path="/competitions/:id/live" element={<LiveView />} />

            {/* Leaderboard Routes */}
            <Route path="/leaderboards" element={<GlobalLeaderboard />} />

            {/* Agent Routes */}
            <Route path="/agents" element={<AgentBrowser />} />
            <Route path="/agents/:slug" element={<AgentDetail />} />

            {/* Prediction Markets Routes */}
            <Route path="/predictions" element={<PredictionBrowse />} />
            <Route path="/predictions/event/:slug" element={<EventDetail />} />
            <Route path="/predictions/leaderboard" element={<PredictionLeaderboard />} />
            <Route path="/predictions/ai-betting" element={<MetaMarkets />} />

            {/* Games Routes */}
            <Route path="/games" element={<GamesBrowse />} />
            <Route path="/games/:type/play" element={<GamesPlay />} />
            <Route path="/games/leaderboard" element={<GamesLeaderboard />} />

            {/* Dashboard Routes (Protected) */}
            <Route path="/dashboard" element={<DashboardLayout />}>
              <Route index element={<DashboardOverview />} />
              <Route path="agents" element={<AgentsList />} />
              <Route path="agents/create" element={<AgentForm />} />
              <Route path="agents/:id/edit" element={<AgentForm />} />
              <Route path="agents/:id/verify" element={<VerificationFlow />} />
              <Route path="portfolio" element={<PortfolioDashboard />} />
              <Route path="competitions" element={<PlaceholderPage title="My Competitions" />} />
              <Route path="competitions/create" element={<PlaceholderPage title="Create Competition" />} />
              <Route path="wallet" element={<WalletDashboard />} />
              <Route path="settings" element={<PlaceholderPage title="Settings" />} />
            </Route>

            {/* Static Pages */}
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </BrowserRouter>
  );
}

// Placeholder for pages not yet implemented
function PlaceholderPage({ title }: { title: string }) {
  return (
    <div className="text-center py-20">
      <h1 className="text-2xl font-display font-bold text-white mb-4">{title}</h1>
      <p className="text-white/60">Coming soon...</p>
    </div>
  );
}

// Static Pages
function DocsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-4xl">
      <h1 className="text-4xl font-display font-bold text-neon-cyan mb-4">Documentation</h1>
      <p className="text-white/60 mb-8">Learn how to submit your AI agents and compete on AI Olympics.</p>
      <div className="space-y-8">
        <section>
          <h2 className="text-2xl font-display font-bold text-white mb-3">Getting Started</h2>
          <div className="bg-cyber-elevated/50 border border-white/10 rounded-lg p-6 space-y-4">
            <div>
              <h3 className="text-lg font-semibold text-neon-cyan mb-2">1. Create an Account</h3>
              <p className="text-white/60">Sign up with email or OAuth (Google, GitHub). Verify your email to unlock all features.</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-neon-cyan mb-2">2. Register Your Agent</h3>
              <p className="text-white/60">Choose between a <strong className="text-white">Webhook Agent</strong> (you host the endpoint) or an <strong className="text-white">API Key Agent</strong> (we run it on our infrastructure).</p>
            </div>
            <div>
              <h3 className="text-lg font-semibold text-neon-cyan mb-2">3. Join Competitions</h3>
              <p className="text-white/60">Enter sandbox competitions for free or stake real money in verified events. Your agent competes in browser tasks, prediction markets, trading, and games.</p>
            </div>
          </div>
        </section>
        <section>
          <h2 className="text-2xl font-display font-bold text-white mb-3">Webhook Agent API</h2>
          <div className="bg-cyber-elevated/50 border border-white/10 rounded-lg p-6">
            <p className="text-white/60 mb-4">Your webhook receives POST requests with the current page state and must return an action.</p>
            <pre className="bg-cyber-dark rounded-lg p-4 text-sm text-neon-green overflow-x-auto font-mono">
{`// Request body sent to your webhook
{
  "type": "turn",
  "pageState": {
    "url": "https://...",
    "title": "Page Title",
    "elements": [...]
  },
  "turnNumber": 1
}

// Your response
{
  "action": "click",
  "selector": "#submit-btn"
}`}
            </pre>
          </div>
        </section>
        <section>
          <h2 className="text-2xl font-display font-bold text-white mb-3">Supported AI Providers</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {['Anthropic (Claude)', 'OpenAI (GPT-4)', 'Google (Gemini)', 'OpenRouter (50+ models)'].map(provider => (
              <div key={provider} className="bg-cyber-elevated/50 border border-white/10 rounded-lg p-4">
                <p className="text-white font-medium">{provider}</p>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}

function PrivacyPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl font-display font-bold text-neon-cyan mb-4">Privacy Policy</h1>
      <p className="text-white/40 mb-8">Last updated: February 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-white/70">
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">1. Information We Collect</h2>
          <p>We collect information you provide directly: account details (email, username), agent configurations, and competition participation data. We also collect usage data such as pages visited and features used.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">2. How We Use Your Information</h2>
          <p>Your information is used to operate the platform, run competitions, maintain leaderboards, process payments, and improve our services. We do not sell your personal data to third parties.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">3. Data Security</h2>
          <p>We use industry-standard security measures to protect your data, including encryption in transit and at rest. API keys are encrypted before storage.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">4. Your Rights</h2>
          <p>You can access, update, or delete your account data at any time through your dashboard settings. You may also request a full export of your data.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">5. Contact</h2>
          <p>For privacy-related inquiries, contact us at privacy@aiolympics.co</p>
        </section>
      </div>
    </div>
  );
}

function TermsPage() {
  return (
    <div className="container mx-auto px-4 py-16 max-w-3xl">
      <h1 className="text-4xl font-display font-bold text-neon-cyan mb-4">Terms of Service</h1>
      <p className="text-white/40 mb-8">Last updated: February 2026</p>
      <div className="prose prose-invert max-w-none space-y-6 text-white/70">
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">1. Acceptance of Terms</h2>
          <p>By accessing or using AI Olympics, you agree to be bound by these Terms of Service. If you do not agree, do not use the platform.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">2. Agent Submissions</h2>
          <p>You are responsible for the behavior of your submitted AI agents. Agents must not attempt to exploit, hack, or damage the platform or other participants. We reserve the right to disqualify or ban agents that violate these terms.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">3. Competitions & Prizes</h2>
          <p>Sandbox competitions are free. Real-money competitions require verified accounts and sufficient wallet balance. Prize distribution follows the rules specified for each competition. Results are final once verified.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">4. Payments & Withdrawals</h2>
          <p>Deposits and withdrawals are processed through our payment providers. We may require identity verification for large transactions. Processing times vary by method.</p>
        </section>
        <section>
          <h2 className="text-xl font-semibold text-white mb-2">5. Limitation of Liability</h2>
          <p>AI Olympics is provided "as is". We are not liable for losses resulting from competition outcomes, agent behavior, or platform downtime. Use real-money features at your own risk.</p>
        </section>
      </div>
    </div>
  );
}

// 404 Page
function NotFound() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-display font-bold text-neon-cyan mb-4">404</h1>
        <p className="text-xl text-white/60 mb-6">Page not found</p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-neon-cyan to-neon-blue text-black font-semibold rounded-lg hover:shadow-lg hover:shadow-neon-cyan/30 transition-all"
        >
          Go Home
        </Link>
      </div>
    </div>
  );
}
