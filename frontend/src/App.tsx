import { useEffect, lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { HelmetProvider } from 'react-helmet-async';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/react';
import { GridOverlay, Header, Footer } from './components/layout';
import { useAuthStore } from './store/authStore';
import { PageSkeleton } from './components/ui';
import { ErrorBoundary } from './components/ErrorBoundary';

// Pages - eagerly loaded (critical path)
import { Link } from 'react-router-dom';
import { Landing } from './pages/Landing';
import { Login, Signup, ForgotPassword, AuthCallback } from './pages/auth';
import { DashboardLayout } from './pages/dashboard/Layout';
import { DashboardOverview, AgentsList, AgentForm } from './pages/dashboard';

// Pages - lazy loaded (reduces initial bundle)
const CompetitionBrowser = lazy(() => import('./pages/competitions/Browse').then(m => ({ default: m.CompetitionBrowser })));
const CompetitionDetail = lazy(() => import('./pages/competitions/Detail').then(m => ({ default: m.CompetitionDetail })));
const LiveView = lazy(() => import('./pages/competitions/Live').then(m => ({ default: m.LiveView })));
const ReplayViewer = lazy(() => import('./pages/competitions/Replay').then(m => ({ default: m.ReplayViewer })));
const GlobalLeaderboard = lazy(() => import('./pages/leaderboards/Global').then(m => ({ default: m.GlobalLeaderboard })));
const AgentBrowser = lazy(() => import('./pages/agents/Browse').then(m => ({ default: m.AgentBrowser })));
const AgentDetail = lazy(() => import('./pages/agents/Detail').then(m => ({ default: m.AgentDetail })));
const PredictionBrowse = lazy(() => import('./pages/predictions/Browse').then(m => ({ default: m.PredictionBrowse })));
const EventDetail = lazy(() => import('./pages/predictions/EventDetail').then(m => ({ default: m.EventDetail })));
const PredictionLeaderboard = lazy(() => import('./pages/predictions/Leaderboard').then(m => ({ default: m.PredictionLeaderboard })));
const MetaMarkets = lazy(() => import('./pages/predictions/MetaMarkets').then(m => ({ default: m.MetaMarkets })));
const PortfolioDashboard = lazy(() => import('./pages/dashboard/Portfolio').then(m => ({ default: m.PortfolioDashboard })));
const WalletDashboard = lazy(() => import('./pages/dashboard/Wallet').then(m => ({ default: m.WalletDashboard })));
const Settings = lazy(() => import('./pages/dashboard/Settings').then(m => ({ default: m.Settings })));
const MyCompetitions = lazy(() => import('./pages/dashboard/MyCompetitions').then(m => ({ default: m.MyCompetitions })));
const CreateCompetition = lazy(() => import('./pages/dashboard/CreateCompetition').then(m => ({ default: m.CreateCompetition })));
const VerificationFlow = lazy(() => import('./components/agents/VerificationFlow').then(m => ({ default: m.VerificationFlow })));
const Sandbox = lazy(() => import('./pages/dashboard/Sandbox').then(m => ({ default: m.Sandbox })));
const AgentAnalytics = lazy(() => import('./pages/dashboard/AgentAnalytics').then(m => ({ default: m.AgentAnalytics })));
const GamesBrowse = lazy(() => import('./pages/games/Browse').then(m => ({ default: m.GamesBrowse })));
const GamesPlay = lazy(() => import('./pages/games/Play').then(m => ({ default: m.GamesPlay })));
const GamesLeaderboard = lazy(() => import('./pages/games/Leaderboard').then(m => ({ default: m.GamesLeaderboard })));
const TournamentBrowse = lazy(() => import('./pages/tournaments/Browse').then(m => ({ default: m.TournamentBrowse })));
const TournamentDetail = lazy(() => import('./pages/tournaments/Detail').then(m => ({ default: m.TournamentDetail })));
const TournamentBracketPage = lazy(() => import('./pages/tournaments/Bracket').then(m => ({ default: m.TournamentBracketPage })));
const ChampionshipBrowse = lazy(() => import('./pages/championships/Browse').then(m => ({ default: m.ChampionshipBrowse })));
const ChampionshipDetail = lazy(() => import('./pages/championships/Detail').then(m => ({ default: m.ChampionshipDetail })));
const ChampionshipStandingsPage = lazy(() => import('./pages/championships/Standings').then(m => ({ default: m.ChampionshipStandingsPage })));
const DocsPage = lazy(() => import('./pages/static/Docs').then(m => ({ default: m.DocsPage })));
const PrivacyPage = lazy(() => import('./pages/static/Privacy').then(m => ({ default: m.PrivacyPage })));
const TermsPage = lazy(() => import('./pages/static/Terms').then(m => ({ default: m.TermsPage })));
const AdminLayout = lazy(() => import('./pages/admin/Layout').then(m => ({ default: m.AdminLayout })));
const AdminOverview = lazy(() => import('./pages/admin/Overview').then(m => ({ default: m.AdminOverview })));
const AdminUsers = lazy(() => import('./pages/admin/UserManagement').then(m => ({ default: m.UserManagement })));
const AdminAgents = lazy(() => import('./pages/admin/AgentModeration').then(m => ({ default: m.AgentModeration })));
const AdminCompetitions = lazy(() => import('./pages/admin/CompetitionManagement').then(m => ({ default: m.CompetitionManagement })));

export default function App() {
  const { initialize } = useAuthStore();

  useEffect(() => {
    initialize();
  }, [initialize]);

  return (
    <HelmetProvider>
    <BrowserRouter>
      <div className="min-h-screen bg-cyber-dark text-white flex flex-col">
        {/* Background */}
        <GridOverlay />

        {/* Header */}
        <Header />

        {/* Main Content */}
        <main id="main-content" className="relative z-10 flex-1">
          <ErrorBoundary>
          <Suspense fallback={<PageSkeleton />}>
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
            <Route path="/competitions/:id" element={<CompetitionDetail />} />
            <Route path="/competitions/:id/live" element={<LiveView />} />
            <Route path="/competitions/:id/replay" element={<ReplayViewer />} />

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

            {/* Tournament Routes */}
            <Route path="/tournaments" element={<TournamentBrowse />} />
            <Route path="/tournaments/:id" element={<TournamentDetail />} />
            <Route path="/tournaments/:id/bracket" element={<TournamentBracketPage />} />

            {/* Championship Routes */}
            <Route path="/championships" element={<ChampionshipBrowse />} />
            <Route path="/championships/:id" element={<ChampionshipDetail />} />
            <Route path="/championships/:id/standings" element={<ChampionshipStandingsPage />} />

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
              <Route path="agents/:id/analytics" element={<AgentAnalytics />} />
              <Route path="portfolio" element={<PortfolioDashboard />} />
              <Route path="competitions" element={<MyCompetitions />} />
              <Route path="competitions/create" element={<CreateCompetition />} />
              <Route path="wallet" element={<WalletDashboard />} />
              <Route path="sandbox" element={<Sandbox />} />
              <Route path="settings" element={<Settings />} />
            </Route>

            {/* Admin Routes (Protected) */}
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<AdminOverview />} />
              <Route path="users" element={<AdminUsers />} />
              <Route path="agents" element={<AdminAgents />} />
              <Route path="competitions" element={<AdminCompetitions />} />
            </Route>

            {/* Static Pages */}
            <Route path="/docs" element={<DocsPage />} />
            <Route path="/privacy" element={<PrivacyPage />} />
            <Route path="/terms" element={<TermsPage />} />

            {/* Redirects for common URL mistakes */}
            <Route path="/login" element={<Navigate to="/auth/login" replace />} />
            <Route path="/signup" element={<Navigate to="/auth/signup" replace />} />
            <Route path="/leaderboard" element={<Navigate to="/leaderboards" replace />} />
            <Route path="/markets" element={<Navigate to="/predictions" replace />} />

            {/* 404 */}
            <Route path="*" element={<NotFound />} />
          </Routes>
          </Suspense>
          </ErrorBoundary>
        </main>

        {/* Footer */}
        <Footer />
      </div>
    </BrowserRouter>
    <Analytics />
    <SpeedInsights />
    </HelmetProvider>
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
