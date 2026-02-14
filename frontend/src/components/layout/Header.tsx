import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { NeonButton } from '../ui/NeonButton';
import { useAuthStore } from '../../store/authStore';
import {
  Trophy,
  Users,
  LayoutDashboard,
  Bot,
  LogOut,
  Menu,
  X,
  Gamepad2,
  TrendingUp,
  Swords,
  Medal
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/competitions', label: 'Competitions', icon: Trophy },
  { path: '/tournaments', label: 'Tournaments', icon: Swords },
  { path: '/championships', label: 'Championships', icon: Medal },
  { path: '/games', label: 'Games', icon: Gamepad2 },
  { path: '/predictions', label: 'Markets', icon: TrendingUp },
  { path: '/agents', label: 'Agents', icon: Bot },
  { path: '/leaderboards', label: 'Leaderboards', icon: Users },
];

export function Header() {
  const location = useLocation();
  const { user, profile, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-cyber-dark/80 backdrop-blur-md border-b border-white/10">
      {/* Skip to main content link - visible only on keyboard focus */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-neon-cyan focus:text-black focus:rounded-lg focus:font-semibold"
      >
        Skip to main content
      </a>
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link to="/" className="flex items-center gap-3" aria-label="AI Olympics Home">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center">
              <span className="text-xl font-display font-bold text-black">AI</span>
            </div>
            <span className="text-xl font-display font-bold neon-text hidden sm:block">
              AI Olympics
            </span>
            <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider bg-neon-magenta/20 text-neon-magenta border border-neon-magenta/30 rounded">
              Beta
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-1" aria-label="Main navigation">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
                    isActive
                      ? 'bg-neon-cyan/10 text-neon-cyan'
                      : 'text-white/70 hover:text-white hover:bg-white/5'
                  )}
                >
                  <Icon size={18} />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          {/* Auth Section */}
          <div className="hidden md:flex items-center gap-3">
            {user ? (
              <>
                <Link to="/dashboard">
                  <NeonButton variant="ghost" size="sm" icon={<LayoutDashboard size={18} />}>
                    Dashboard
                  </NeonButton>
                </Link>
                {profile?.is_admin && (
                  <Link to="/admin">
                    <NeonButton variant="ghost" size="sm">
                      Admin
                    </NeonButton>
                  </Link>
                )}
                <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center text-sm font-bold text-black">
                    {profile?.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                  </div>
                  <span className="text-sm text-white/80">
                    {profile?.username || user.email?.split('@')[0]}
                  </span>
                </div>
                <button
                  onClick={logout}
                  className="p-2 rounded-lg text-white/50 hover:text-white hover:bg-white/5 transition-all"
                  aria-label="Log out"
                >
                  <LogOut size={18} aria-hidden="true" />
                </button>
              </>
            ) : (
              <>
                <Link to="/auth/login">
                  <NeonButton variant="ghost" size="sm">
                    Log In
                  </NeonButton>
                </Link>
                <Link to="/auth/signup">
                  <NeonButton size="sm">
                    Sign Up
                  </NeonButton>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 rounded-lg text-white/70 hover:text-white hover:bg-white/5"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={24} /> : <Menu size={24} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 border-t border-white/10">
            <nav className="flex flex-col gap-2" aria-label="Mobile navigation">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-all',
                      isActive
                        ? 'bg-neon-cyan/10 text-neon-cyan'
                        : 'text-white/70 hover:text-white hover:bg-white/5'
                    )}
                  >
                    <Icon size={18} />
                    {item.label}
                  </Link>
                );
              })}

              <div className="border-t border-white/10 mt-2 pt-4 flex flex-col gap-2">
                {user ? (
                  <>
                    <Link
                      to="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
                    >
                      <LayoutDashboard size={18} />
                      Dashboard
                    </Link>
                    <button
                      onClick={() => {
                        logout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/10"
                    >
                      <LogOut size={18} />
                      Log Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center px-4 py-3 rounded-lg text-sm font-medium text-white/70 hover:text-white hover:bg-white/5"
                    >
                      Log In
                    </Link>
                    <Link
                      to="/auth/signup"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <NeonButton className="w-full">
                        Sign Up
                      </NeonButton>
                    </Link>
                  </>
                )}
              </div>
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
