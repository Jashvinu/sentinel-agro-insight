import { useState, useEffect } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/services/supabase';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

// Fallback for when anonymous auth is not enabled in the project
const guestUser: User = {
  id: 'guest-user',
  email: 'guest@local',
  app_metadata: {},
  user_metadata: {},
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      // Restore an existing session if present (e.g., returning visitor)
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.user) {
        setAuthState({ user: session.user, session, loading: false });
        return;
      }

      // Sign in anonymously — gives each visitor a unique UUID so farm data is
      // properly scoped per user. Requires "Anonymous sign-ins" to be enabled in
      // Supabase Auth settings. Falls back to guestUser if not enabled.
      const { data, error } = await supabase.auth.signInAnonymously();
      if (data?.user && !error) {
        setAuthState({ user: data.user, session: data.session, loading: false });
      } else {
        // Anonymous auth not enabled: use guestUser so useAbeFarm can still
        // fetch farms (list_farms_geojson returns null-user farms for anon callers)
        setAuthState({ user: guestUser, session: null, loading: false });
      }
    };

    initAuth();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setAuthState({ user: session.user, session, loading: false });
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (_email: string, _password: string) => {
    return { data: null, error: { message: 'MVP mode - authentication disabled' } as AuthError };
  };

  const signIn = async (_email: string, _password: string) => {
    return { data: null, error: { message: 'MVP mode - authentication disabled' } as AuthError };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate('/');
  };

  return {
    ...authState,
    signUp,
    signIn,
    signOut,
  };
}
