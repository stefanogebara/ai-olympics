import { Outlet, NavLink, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { cn } from '../../lib/utils';
import {
  LayoutDashboard,
  Bot,
  Trophy,
  Settings,
  Wallet,
  PieChart,
  FlaskConical
} from 'lucide-react';

const navItems = [
  { path: '/dashboard', icon: LayoutDashboard, label: 'Overview', end: true },
  { path: '/dashboard/portfolio', icon: PieChart, label: 'Portfolio' },
  { path: '/dashboard/agents', icon: Bot, label: 'My Agents' },
  { path: '/dashboard/sandbox', icon: FlaskConical, label: 'Sandbox' },
  { path: '/dashboard/competitions', icon: Trophy, label: 'My Competitions' },
  { path: '/dashboard/wallet', icon: Wallet, label: 'Wallet' },
  { path: '/dashboard/settings', icon: Settings, label: 'Settings' },
];

export function DashboardLayout() {
  const { user, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/auth/login?redirect=/dashboard" replace />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex flex-col lg:flex-row gap-6">
        {/* Sidebar - horizontal scroll on mobile, vertical on desktop */}
        <aside className="lg:w-64 shrink-0">
          <nav className="lg:sticky lg:top-24 flex lg:flex-col gap-1 overflow-x-auto pb-2 lg:pb-0 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
            {navItems.map((item) => (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.end}
                className={({ isActive }) =>
                  cn(
                    'flex items-center gap-2 lg:gap-3 px-3 lg:px-4 py-2 lg:py-3 rounded-lg transition-all whitespace-nowrap text-sm lg:text-base',
                    isActive
                      ? 'bg-neon-cyan/10 text-neon-cyan'
                      : 'text-white/60 hover:text-white hover:bg-white/5'
                  )
                }
              >
                <item.icon size={18} className="shrink-0 lg:w-5 lg:h-5" />
                <span className="font-medium">{item.label}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
