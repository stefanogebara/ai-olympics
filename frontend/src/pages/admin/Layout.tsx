import { NavLink, Outlet, Navigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { LayoutDashboard, Users, Bot, Trophy, Shield } from 'lucide-react';

const adminLinks = [
  { to: '/admin', icon: LayoutDashboard, label: 'Overview', end: true },
  { to: '/admin/users', icon: Users, label: 'Users' },
  { to: '/admin/agents', icon: Bot, label: 'Agents' },
  { to: '/admin/competitions', icon: Trophy, label: 'Competitions' },
];

export function AdminLayout() {
  const { profile, isLoading } = useAuthStore();

  // Show nothing while profile is loading to prevent flash
  if (isLoading || !profile) {
    return null;
  }

  // Redirect non-admins
  if (!profile.is_admin) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center gap-3 mb-8">
        <Shield size={28} className="text-red-400" />
        <h1 className="text-2xl font-display font-bold text-red-400">Admin Panel</h1>
      </div>

      <div className="flex gap-8">
        {/* Sidebar */}
        <nav className="w-48 flex-shrink-0 space-y-1">
          {adminLinks.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              end={link.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  isActive
                    ? 'bg-red-500/10 text-red-400 border border-red-500/30'
                    : 'text-white/60 hover:text-white hover:bg-white/5'
                }`
              }
            >
              <link.icon size={18} />
              {link.label}
            </NavLink>
          ))}
        </nav>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <Outlet />
        </div>
      </div>
    </div>
  );
}
