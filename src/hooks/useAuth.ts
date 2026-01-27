import { useState, useEffect } from 'react';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { useNavigate } from 'react-router-dom';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

// Mock user for MVP mode - no login required
const mvpDemoUser: User = {
  id: 'mvp-demo-user',
  email: 'demo@evergreenfarms.mvp',
  app_metadata: {},
  user_metadata: { name: 'Evergreen Farms Demo' },
  aud: 'authenticated',
  created_at: new Date().toISOString(),
};

/**
 * useAuth hook for MVP mode
 * Always returns the MVP demo user without requiring authentication
 */
export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
  });
  const navigate = useNavigate();

  useEffect(() => {
    // MVP mode: immediately set demo user without any auth checks
    console.log('[Auth] MVP mode - using demo user for Evergreen Farms');
    setAuthState({
      user: mvpDemoUser,
      session: null,
      loading: false,
    });
  }, []);

  // Disabled auth functions for MVP mode
  const signUp = async (_email: string, _password: string) => {
    console.log('[Auth] MVP mode - signUp disabled');
    return { data: null, error: { message: 'MVP mode - authentication disabled' } as AuthError };
  };

  const signIn = async (_email: string, _password: string) => {
    console.log('[Auth] MVP mode - signIn disabled, using demo user');
    return { data: null, error: { message: 'MVP mode - authentication disabled' } as AuthError };
  };

  const signOut = async () => {
    console.log('[Auth] MVP mode - signOut disabled');
    navigate('/');
  };

  return {
    ...authState,
    signUp,
    signIn,
    signOut,
  };
}







