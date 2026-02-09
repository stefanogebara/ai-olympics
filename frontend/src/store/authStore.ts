import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '../lib/supabase';
import type { User, Session } from '@supabase/supabase-js';
import type { Profile } from '../types/database';

interface AuthState {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  isLoading: boolean;
  isAuthenticated: boolean;

  // Actions
  setUser: (user: User | null) => void;
  setSession: (session: Session | null) => void;
  setProfile: (profile: Profile | null) => void;
  setLoading: (loading: boolean) => void;

  // Auth methods
  signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
  signUp: (email: string, password: string, username: string) => Promise<{ error: Error | null }>;
  signInWithGoogle: () => Promise<{ error: Error | null }>;
  signInWithGithub: () => Promise<{ error: Error | null }>;
  signOut: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: Error | null }>;
  updatePassword: (password: string) => Promise<{ error: Error | null }>;

  // Profile methods
  loadProfile: (userId: string) => Promise<void>;
  updateProfile: (updates: Partial<Profile>) => Promise<{ error: Error | null }>;

  // Initialize auth state
  initialize: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      session: null,
      profile: null,
      isLoading: true,
      isAuthenticated: false,

      setUser: (user) => set({ user, isAuthenticated: !!user }),
      setSession: (session) => set({ session }),
      setProfile: (profile) => set({ profile }),
      setLoading: (isLoading) => set({ isLoading }),

      signIn: async (email, password) => {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email,
            password,
          });
          if (error) throw error;

          set({ user: data.user, session: data.session, isAuthenticated: true });
          if (data.user) {
            await get().loadProfile(data.user.id);
          }
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      signUp: async (email, password, username) => {
        try {
          const { data, error } = await supabase.auth.signUp({
            email,
            password,
            options: {
              data: { username },
            },
          });
          if (error) throw error;

          // Create profile for new user
          if (data.user) {
            const { error: profileError } = await supabase
              .from('aio_profiles')
              .insert({
                id: data.user.id,
                username,
                display_name: username,
              });
            if (profileError) throw profileError;
          }

          set({ user: data.user, session: data.session, isAuthenticated: !!data.user });
          if (data.user) {
            await get().loadProfile(data.user.id);
          }
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      signInWithGoogle: async () => {
        try {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'google',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          if (error) throw error;
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      signInWithGithub: async () => {
        try {
          const { error } = await supabase.auth.signInWithOAuth({
            provider: 'github',
            options: {
              redirectTo: `${window.location.origin}/auth/callback`,
            },
          });
          if (error) throw error;
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      signOut: async () => {
        await supabase.auth.signOut();
        set({ user: null, session: null, profile: null, isAuthenticated: false });
      },

      logout: async () => {
        await get().signOut();
      },

      resetPassword: async (email) => {
        try {
          const { error } = await supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/auth/reset-password`,
          });
          if (error) throw error;
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      updatePassword: async (password) => {
        try {
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      loadProfile: async (userId) => {
        try {
          const { data, error } = await supabase
            .from('aio_profiles')
            .select('*')
            .eq('id', userId)
            .single();

          if (error) {
            // Profile doesn't exist, might need to create it
            console.error('Error loading profile:', error);
            return;
          }

          set({ profile: data });
        } catch (error) {
          console.error('Error loading profile:', error);
        }
      },

      updateProfile: async (updates) => {
        const { user } = get();
        if (!user) return { error: new Error('Not authenticated') };

        try {
          const { error } = await supabase
            .from('aio_profiles')
            .update(updates)
            .eq('id', user.id);

          if (error) throw error;

          // Reload profile
          await get().loadProfile(user.id);
          return { error: null };
        } catch (error) {
          return { error: error as Error };
        }
      },

      initialize: async () => {
        set({ isLoading: true });
        try {
          const { data: { session } } = await supabase.auth.getSession();

          if (session?.user) {
            set({ user: session.user, session, isAuthenticated: true });
            await get().loadProfile(session.user.id);
          }

          // Listen for auth changes
          supabase.auth.onAuthStateChange(async (event, session) => {
            set({
              user: session?.user ?? null,
              session,
              isAuthenticated: !!session?.user
            });

            if (session?.user) {
              await get().loadProfile(session.user.id);
            } else {
              set({ profile: null });
            }
          });
        } catch (error) {
          console.error('Error initializing auth:', error);
        } finally {
          set({ isLoading: false });
        }
      },
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        // Only persist what's needed
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
