import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GlassCard, NeonButton, NeonText, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { User, Lock, LogOut, Save, AlertTriangle, ShieldOff, Download } from 'lucide-react';
import { supabase } from '../../lib/supabase';

const profileSchema = z.object({
  displayName: z.string().max(100, 'Display name must be under 100 characters').optional().or(z.literal('')),
  username: z.string().min(1, 'Username is required').max(30, 'Username must be under 30 characters')
    .regex(/^[a-z0-9_-]+$/, 'Username can only contain lowercase letters, numbers, hyphens, and underscores'),
  avatarUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
});

const passwordSchema = z.object({
  newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  confirmPassword: z.string().min(1, 'Please confirm your password'),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export function Settings() {
  const navigate = useNavigate();
  const { profile, user, updateProfile, updatePassword, signOut } = useAuthStore();

  const [profileSaving, setProfileSaving] = useState(false);
  const [passwordSaving, setPasswordSaving] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const [pausedUntil, setPausedUntil] = useState<string | null>(null);
  const [exclusionLoading, setExclusionLoading] = useState(false);
  const [exclusionMessage, setExclusionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [exportLoading, setExportLoading] = useState(false);

  useEffect(() => {
    if (profile && 'betting_paused_until' in profile) {
      setPausedUntil((profile as Record<string, unknown>).betting_paused_until as string | null);
    }
  }, [profile]);

  const handleSelfExclude = async (days: 30 | 90 | 180) => {
    if (!confirm(`Pause betting for ${days} days? This cannot be shortened once set.`)) return;

    setExclusionLoading(true);
    setExclusionMessage(null);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/user/self-exclude', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ days }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.error);

      setPausedUntil(result.pausedUntil);
      setExclusionMessage({ type: 'success', text: `Betting paused until ${new Date(result.pausedUntil).toLocaleDateString()}` });
    } catch (err) {
      setExclusionMessage({ type: 'error', text: err instanceof Error ? err.message : 'Failed to set exclusion' });
    } finally {
      setExclusionLoading(false);
    }
  };

  const handleExportData = async () => {
    setExportLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch('/api/user/export-data', {
        headers: { 'Authorization': `Bearer ${session?.access_token}` },
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'ai-olympics-data-export.json';
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      alert('Failed to export data. Please try again.');
    } finally {
      setExportLoading(false);
    }
  };

  const profileForm = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      displayName: profile?.display_name || '',
      username: profile?.username || '',
      avatarUrl: profile?.avatar_url || '',
    },
  });

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: {
      newPassword: '',
      confirmPassword: '',
    },
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    setProfileSaving(true);
    setProfileMessage(null);

    const { error } = await updateProfile({
      display_name: data.displayName || null,
      username: data.username,
      avatar_url: data.avatarUrl || null,
    });

    if (error) {
      setProfileMessage({ type: 'error', text: error.message });
    } else {
      setProfileMessage({ type: 'success', text: 'Profile updated successfully' });
    }
    setProfileSaving(false);
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    setPasswordSaving(true);
    setPasswordMessage(null);

    const { error } = await updatePassword(data.newPassword);

    if (error) {
      setPasswordMessage({ type: 'error', text: error.message });
    } else {
      setPasswordMessage({ type: 'success', text: 'Password updated successfully' });
      passwordForm.reset();
    }
    setPasswordSaving(false);
  };

  const handleSignOut = async () => {
    await signOut();
    navigate('/');
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-2xl font-display font-bold">
        <NeonText variant="cyan" glow>Settings</NeonText>
      </h1>

      {/* Profile Section */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-display font-bold flex items-center gap-2 mb-4">
          <User size={20} className="text-neon-cyan" />
          Profile
        </h2>

        <form onSubmit={profileForm.handleSubmit(onProfileSubmit)} className="space-y-4">
          <Input
            label="Display Name"
            placeholder="Your display name"
            error={profileForm.formState.errors.displayName?.message}
            {...profileForm.register('displayName')}
          />

          <Input
            label="Username"
            placeholder="your-username"
            error={profileForm.formState.errors.username?.message}
            {...profileForm.register('username')}
          />

          <Input
            label="Avatar URL"
            placeholder="https://example.com/avatar.png"
            error={profileForm.formState.errors.avatarUrl?.message}
            {...profileForm.register('avatarUrl')}
          />

          <div className="text-sm text-white/40">
            Email: {user?.email}
          </div>

          {profileMessage && (
            <div className={`p-3 rounded-lg text-sm ${
              profileMessage.type === 'success'
                ? 'bg-neon-green/10 border border-neon-green/30 text-neon-green'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {profileMessage.text}
            </div>
          )}

          <NeonButton type="submit" loading={profileSaving} icon={<Save size={16} />}>
            Save Profile
          </NeonButton>
        </form>
      </GlassCard>

      {/* Security Section */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-display font-bold flex items-center gap-2 mb-4">
          <Lock size={20} className="text-neon-magenta" />
          Security
        </h2>

        <form onSubmit={passwordForm.handleSubmit(onPasswordSubmit)} className="space-y-4">
          <Input
            label="New Password"
            type="password"
            placeholder="Enter new password"
            error={passwordForm.formState.errors.newPassword?.message}
            {...passwordForm.register('newPassword')}
          />

          <Input
            label="Confirm Password"
            type="password"
            placeholder="Confirm new password"
            error={passwordForm.formState.errors.confirmPassword?.message}
            {...passwordForm.register('confirmPassword')}
          />

          {passwordMessage && (
            <div className={`p-3 rounded-lg text-sm ${
              passwordMessage.type === 'success'
                ? 'bg-neon-green/10 border border-neon-green/30 text-neon-green'
                : 'bg-red-500/10 border border-red-500/30 text-red-400'
            }`}>
              {passwordMessage.text}
            </div>
          )}

          <NeonButton type="submit" variant="secondary" loading={passwordSaving} icon={<Lock size={16} />}>
            Change Password
          </NeonButton>
        </form>
      </GlassCard>

      {/* Responsible Forecasting */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-display font-bold flex items-center gap-2 mb-2">
          <ShieldOff size={20} className="text-neon-gold" />
          Responsible Forecasting
        </h2>
        <p className="text-sm text-white/50 mb-4">
          Take a break from virtual betting. Self-exclusion cannot be shortened once activated.
        </p>

        {pausedUntil && new Date(pausedUntil) > new Date() ? (
          <div className="p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-sm mb-4">
            Betting paused until <strong>{new Date(pausedUntil).toLocaleDateString()}</strong>
          </div>
        ) : null}

        {exclusionMessage && (
          <div className={`p-3 rounded-lg text-sm mb-4 ${
            exclusionMessage.type === 'success'
              ? 'bg-neon-green/10 border border-neon-green/30 text-neon-green'
              : 'bg-red-500/10 border border-red-500/30 text-red-400'
          }`}>
            {exclusionMessage.text}
          </div>
        )}

        <div className="flex flex-wrap gap-3">
          {([30, 90, 180] as const).map((days) => (
            <button
              key={days}
              onClick={() => handleSelfExclude(days)}
              disabled={exclusionLoading || (!!pausedUntil && new Date(pausedUntil) > new Date())}
              className="px-4 py-2 text-sm rounded-lg border border-yellow-500/30 text-yellow-300 hover:bg-yellow-500/10 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
            >
              Pause {days} days
            </button>
          ))}
        </div>
      </GlassCard>

      {/* Data & Privacy */}
      <GlassCard className="p-6">
        <h2 className="text-lg font-display font-bold flex items-center gap-2 mb-2">
          <Download size={20} className="text-neon-cyan" />
          Data & Privacy
        </h2>
        <p className="text-sm text-white/50 mb-4">
          Export a copy of all your data (GDPR Article 20 — right to data portability).
        </p>
        <NeonButton
          variant="secondary"
          onClick={handleExportData}
          loading={exportLoading}
          icon={<Download size={16} />}
        >
          Download My Data
        </NeonButton>
      </GlassCard>

      {/* Danger Zone */}
      <GlassCard className="p-6 border-red-500/20">
        <h2 className="text-lg font-display font-bold flex items-center gap-2 mb-4 text-red-400">
          <AlertTriangle size={20} />
          Danger Zone
        </h2>

        <p className="text-sm text-white/60 mb-4">
          Sign out of your account on this device.
        </p>

        <NeonButton variant="ghost" onClick={handleSignOut} icon={<LogOut size={16} />}>
          Sign Out
        </NeonButton>
      </GlassCard>
    </div>
  );
}
