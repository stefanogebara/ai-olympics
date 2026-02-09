import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../../lib/supabase';
import { useAuthStore } from '../../store/authStore';

export function AuthCallback() {
  const navigate = useNavigate();
  const { loadProfile } = useAuthStore();

  useEffect(() => {
    const handleAuthCallback = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();

        if (error) {
          console.error('Auth callback error:', error);
          navigate('/auth/login');
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
            // Create profile for OAuth user
            const username = session.user.email?.split('@')[0] || `user_${session.user.id.slice(0, 8)}`;
            await supabase
              .from('aio_profiles')
              .insert({
                id: session.user.id,
                username,
                display_name: session.user.user_metadata?.full_name || username,
                avatar_url: session.user.user_metadata?.avatar_url,
              });
          }

          await loadProfile(session.user.id);
          navigate('/dashboard');
        } else {
          navigate('/auth/login');
        }
      } catch (error) {
        console.error('Error in auth callback:', error);
        navigate('/auth/login');
      }
    };

    handleAuthCallback();
  }, [navigate, loadProfile]);

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center">
      <div className="text-center">
        <div className="w-12 h-12 border-4 border-neon-cyan/30 border-t-neon-cyan rounded-full animate-spin mx-auto mb-4" />
        <p className="text-white/60">Completing sign in...</p>
      </div>
    </div>
  );
}
