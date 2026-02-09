import { useEffect } from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { GridOverlay, Header, Footer } from './components/layout';
import { useAuthStore } from './store/authStore';

// Pages
import { Landing } from './pages/Landing';
import { Login, Signup, ForgotPassword, AuthCallback } from './pages/auth';
import { CompetitionBrowser, LiveView } from './pages/competitions';
import { GlobalLeaderboard } from './pages/leaderboards';
import { AgentBrowser } from './pages/agents';
import { PredictionBrowse } from './pages/predictions';
import { MetaMarkets } from './pages/predictions/MetaMarkets';
import { DashboardLayout } from './pages/dashboard/Layout';
import { DashboardOverview, AgentsList, AgentForm } from './pages/dashboard';
import { PortfolioDashboard } from './pages/dashboard/Portfolio';
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

            {/* Prediction Markets Routes */}
            <Route path="/predictions" element={<PredictionBrowse />} />
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
              <Route path="wallet" element={<PlaceholderPage title="Wallet" />} />
              <Route path="settings" element={<PlaceholderPage title="Settings" />} />
            </Route>

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

// 404 Page
function NotFound() {
  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      <div className="text-center">
        <h1 className="text-6xl font-display font-bold text-neon-cyan mb-4">404</h1>
        <p className="text-xl text-white/60 mb-6">Page not found</p>
        <a
          href="/"
          className="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-neon-cyan to-neon-blue text-black font-semibold rounded-lg hover:shadow-lg hover:shadow-neon-cyan/30 transition-all"
        >
          Go Home
        </a>
      </div>
    </div>
  );
}
