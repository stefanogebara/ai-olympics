import { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { AlertCircle } from 'lucide-react';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export function AuthCallback() {
  const navigate = useNavigate();
  const { loadProfile } = useAuthStore();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          if (import.meta.env.DEV) console.error('Auth callback error:', error);
          setError('Sign-in failed. Please try again.');
          return;
        }

        if (session?.user) {
          // Check if profile exists, create if not
          const { data: profile } = await supabase
            .from('aio_profiles')
            .select('*')
            .eq('id', session.user.id)
            .single();

          if (!profile) {
            // Create profile for OAuth user — handle username conflicts with fallback suffixes
            const baseUsername =
              session.user.user_metadata?.user_name ||      // GitHub: actual username
              session.user.user_metadata?.preferred_username || // Google: username hint
              session.user.email?.split('@')[0] ||
              `user_${session.user.id.slice(0, 8)}`;

            let created = false;
            for (let attempt = 0; attempt < 5 && !created; attempt++) {
              const username = attempt === 0 ? baseUsername : `${baseUsername}_${attempt}`;
              const { error: insertErr } = await supabase
                .from('aio_profiles')
                .insert({
                  id: session.user.id,
                  username,
                  display_name: session.user.user_metadata?.full_name || session.user.user_metadata?.name || username,
                  avatar_url: session.user.user_metadata?.avatar_url,
                });
              if (!insertErr) created = true;
            }
          }

          await loadProfile(session.user.id);
          navigate('/dashboard');
        } else {
          setError('No session found. Please try signing in again.');
        }
      } catch (err) {
        if (import.meta.env.DEV) console.error('Error in auth callback:', err);
        setError('Sign-in failed. Please try again.');
      }
    };

    handleAuthCallback();
  }, [navigate, loadProfile]);

  if (error) {
    return (
      <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
        <div className="text-center">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="text-red-400" size={32} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Sign-in Failed</h2>
          <p className="text-white/60 mb-6">{error}</p>
          <Link
            to="/auth/login"
            className="px-5 py-2.5 bg-neon-cyan/10 text-neon-cyan rounded-lg hover:bg-neon-cyan/20 transition-colors"
          >
            Try Again
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60">Completing sign in...</p>
      </div>
    </div>
  );
}
