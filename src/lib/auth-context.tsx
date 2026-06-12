import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';

import { supabase } from '@/lib/supabase';

type AuthState = {
  session: Session | null;
  loading: boolean;
  profileComplete: boolean;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState>({
  session: null,
  loading: true,
  profileComplete: false,
  refreshProfile: async () => {},
});

async function fetchProfileComplete(userId: string): Promise<boolean> {
  const { data } = await supabase
    .from('profiles')
    .select('first_name')
    .eq('id', userId)
    .single();
  return !!data?.first_name;
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [profileComplete, setProfileComplete] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      if (data.session) {
        setProfileComplete(await fetchProfileComplete(data.session.user.id));
      }
      setLoading(false);
    });

    const { data: subscription } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
      setSession(newSession);
      if (newSession) {
        setProfileComplete(await fetchProfileComplete(newSession.user.id));
      } else {
        setProfileComplete(false);
      }
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session) {
      setProfileComplete(await fetchProfileComplete(session.user.id));
    }
  }, [session]);

  return (
    <AuthContext.Provider value={{ session, loading, profileComplete, refreshProfile }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/** Current user id; only call inside (app) routes where a session is guaranteed. */
export function useUserId() {
  const { session } = useAuth();
  if (!session) throw new Error('useUserId called without a session');
  return session.user.id;
}
