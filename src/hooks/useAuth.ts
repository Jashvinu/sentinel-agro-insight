import { useState, useEffect } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { supabase, isSupabaseAvailable } from '@/services/supabase';
import { useNavigate } from 'react-router-dom';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

// Mock user for local development without Supabase
const mockUser: User = {
  id: 'local-dev-user',
  email: 'dev@localhost',
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
    // If Supabase is not available, use mock user for local development
    if (!isSupabaseAvailable() || !supabase) {
      console.log('[Auth] Supabase not configured - using mock user for local development');
      setAuthState({
        user: mockUser,
        session: null,
        loading: false,
      });
      return;
    }

    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setAuthState({
        user: session?.user ?? null,
        session,
        loading: false,
      });
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAuthState({
        user: session?.user ?? null,
        session,
        loading: false,
      });
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    if (!isSupabaseAvailable() || !supabase) {
      return { data: null, error: { message: 'Supabase not configured' } as AuthError };
    }
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error as AuthError };
    }
  };

  const signIn = async (email: string, password: string) => {
    if (!isSupabaseAvailable() || !supabase) {
      return { data: null, error: { message: 'Supabase not configured' } as AuthError };
    }
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      return { data, error: null };
    } catch (error) {
      return { data: null, error: error as AuthError };
    }
  };

  const signOut = async () => {
    if (!isSupabaseAvailable() || !supabase) {
      navigate('/login');
      return;
    }
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  return {
    ...authState,
    signUp,
    signIn,
    signOut,
  };
}







