import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { GlassCard, NeonButton, NeonText, Input } from '../../components/ui';
import { useAuthStore } from '../../store/authStore';
import { User, Lock, LogOut, Save, AlertTriangle } from 'lucide-react';

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
