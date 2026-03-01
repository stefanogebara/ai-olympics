import { Link, useLocation } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { NeonButton } from '../ui/NeonButton';
import { useAuthStore } from '../../store/authStore';
import {
  LayoutDashboard,
  LogOut,
  Menu,
  X,
  ChevronDown,
} from 'lucide-react';
import { useState } from 'react';

const navItems = [
  { path: '/competitions', label: 'Competitions' },
  { path: '/tournaments', label: 'Tournaments' },
  { path: '/championships', label: 'Championships' },
  { path: '/games', label: 'Games' },
  { path: '/predictions', label: 'Markets' },
  { path: '/agents', label: 'Agents' },
  { path: '/leaderboards', label: 'Leaderboards' },
];

export function Header() {
  const location = useLocation();
  const { user, profile, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 bg-cyber-dark/90 backdrop-blur-xl border-b border-white/[0.06]">
      {/* Accent line */}
      <div className="h-px w-full bg-gradient-to-r from-transparent via-neon-cyan/40 to-transparent" />

      {/* Skip to main content */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-neon-cyan focus:text-black focus:rounded-lg focus:font-semibold"
      >
        Skip to main content
      </a>

      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-14">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2.5 shrink-0" aria-label="AI Olympics Home">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center shadow-[0_0_12px_rgba(6,182,212,0.35)]">
              <span className="text-sm font-display font-black text-black tracking-tight">AI</span>
            </div>
            <span className="text-base font-display font-bold text-white hidden sm:block tracking-wide">
              AI Olympics
            </span>
            <span className="hidden sm:inline-flex px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest bg-neon-cyan/15 text-neon-cyan border border-neon-cyan/25 rounded-full">
              Beta
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden lg:flex items-center" aria-label="Main navigation">
            {navItems.map((item) => {
              const isActive = location.pathname.startsWith(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  className={cn(
                    'relative px-3.5 py-4 text-sm font-medium transition-colors duration-150',
                    isActive
                      ? 'text-neon-cyan'
                      : 'text-white/55 hover:text-white/90'
                  )}
                >
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-neon-cyan/40 via-neon-cyan to-neon-cyan/40 rounded-full" />
                  )}
                </Link>
              );
            })}
          </nav>

          {/* Auth Section */}
          <div className="hidden lg:flex items-center gap-2">
            {user ? (
              <>
                <Link to="/dashboard">
                  <button className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-white/60 hover:text-white/90 hover:bg-white/5 rounded-lg transition-all">
                    <LayoutDashboard size={15} />
                    Dashboard
                  </button>
                </Link>
                {profile?.is_admin && (
                  <Link to="/admin">
                    <button className="px-3 py-1.5 text-xs font-semibold text-neon-magenta/80 hover:text-neon-magenta bg-neon-magenta/10 hover:bg-neon-magenta/15 border border-neon-magenta/20 rounded-lg transition-all">
                      Admin
                    </button>
                  </Link>
                )}

                {/* User dropdown */}
                <div className="relative">
                  <button
                    onClick={() => setUserMenuOpen(!userMenuOpen)}
                    className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-white/5 hover:bg-white/8 border border-white/[0.08] hover:border-white/15 transition-all"
                  >
                    <div className="w-6 h-6 rounded-full bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center text-xs font-bold text-black">
                      {profile?.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                    </div>
                    <span className="text-sm text-white/75 max-w-[96px] truncate">
                      {profile?.username || user.email?.split('@')[0]}
                    </span>
                    <ChevronDown size={13} className={cn('text-white/40 transition-transform duration-150', userMenuOpen && 'rotate-180')} />
                  </button>

                  {userMenuOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setUserMenuOpen(false)} />
                      <div className="absolute right-0 top-full mt-1.5 w-44 bg-cyber-dark border border-white/10 rounded-xl shadow-2xl z-20 overflow-hidden">
                        <button
                          onClick={() => { logout(); setUserMenuOpen(false); }}
                          className="w-full flex items-center gap-2 px-4 py-3 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                        >
                          <LogOut size={15} />
                          Log out
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </>
            ) : (
              <>
                <Link to="/auth/login">
                  <button className="px-4 py-1.5 text-sm font-medium text-white/65 hover:text-white/90 hover:bg-white/5 rounded-lg transition-all">
                    Log In
                  </button>
                </Link>
                <Link to="/auth/signup">
                  <NeonButton size="sm">Sign Up</NeonButton>
                </Link>
              </>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="lg:hidden p-2 rounded-lg text-white/60 hover:text-white hover:bg-white/5 transition-all"
            aria-expanded={mobileMenuOpen}
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X size={22} /> : <Menu size={22} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="lg:hidden pb-4 border-t border-white/[0.06]">
            <nav className="flex flex-col mt-2" aria-label="Mobile navigation">
              {navItems.map((item) => {
                const isActive = location.pathname.startsWith(item.path);
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={cn(
                      'px-4 py-3 text-sm font-medium transition-colors rounded-lg',
                      isActive
                        ? 'text-neon-cyan bg-neon-cyan/5'
                        : 'text-white/60 hover:text-white hover:bg-white/5'
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}

              <div className="border-t border-white/[0.06] mt-3 pt-3 flex flex-col gap-1">
                {user ? (
                  <>
                    <div className="flex items-center gap-2 px-4 py-2">
                      <div className="w-7 h-7 rounded-full bg-gradient-to-br from-neon-cyan to-neon-magenta flex items-center justify-center text-xs font-bold text-black">
                        {profile?.username?.charAt(0).toUpperCase() || user.email?.charAt(0).toUpperCase()}
                      </div>
                      <span className="text-sm text-white/70">
                        {profile?.username || user.email?.split('@')[0]}
                      </span>
                    </div>
                    <Link
                      to="/dashboard"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      <LayoutDashboard size={16} />
                      Dashboard
                    </Link>
                    <button
                      onClick={() => { logout(); setMobileMenuOpen(false); }}
                      className="flex items-center gap-2 px-4 py-3 text-sm font-medium text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                    >
                      <LogOut size={16} />
                      Log Out
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      to="/auth/login"
                      onClick={() => setMobileMenuOpen(false)}
                      className="flex items-center justify-center px-4 py-3 text-sm font-medium text-white/60 hover:text-white hover:bg-white/5 rounded-lg transition-colors"
                    >
                      Log In
                    </Link>
                    <Link
                      to="/auth/signup"
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <NeonButton className="w-full">Sign Up</NeonButton>
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
