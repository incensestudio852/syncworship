'use client';

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { usePathname, useRouter } from 'next/navigation';
import { isConfigured, supabase } from './supabase';

type AuthCtx = {
  session: Session | null;
  user: User | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const Ctx = createContext<AuthCtx>({
  session: null,
  user: null,
  loading: true,
  signIn: async () => ({ error: 'not ready' }),
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (!isConfigured) {
      setLoading(false);
      return;
    }
    const sb = supabase();
    let alive = true;
    sb.auth.getSession().then(({ data }) => {
      if (!alive) return;
      setSession(data.session ?? null);
      setLoading(false);
    });
    const { data: sub } = sb.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      setLoading(false);
    });
    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Guard: no session -> /login (static export has no middleware)
  useEffect(() => {
    if (!isConfigured || loading) return;
    const onLogin = pathname?.startsWith('/login');
    if (!session && !onLogin) {
      const next = typeof window !== 'undefined' ? window.location.pathname + window.location.search : '/';
      router.replace(`/login${next && next !== '/' ? `?next=${encodeURIComponent(next)}` : ''}`);
    }
    if (session && onLogin) router.replace('/');
  }, [session, loading, pathname, router]);

  const value: AuthCtx = {
    session,
    user: session?.user ?? null,
    loading,
    signIn: async (email, password) => {
      const { error } = await supabase().auth.signInWithPassword({ email, password });
      return { error: error ? translateAuthError(error.message) : null };
    },
    signOut: async () => {
      await supabase().auth.signOut();
      router.replace('/login');
    },
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export const useAuth = () => useContext(Ctx);

function translateAuthError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes('invalid login credentials')) return '電郵或密碼不正確。';
  if (m.includes('email not confirmed')) return '帳號尚未驗證，請聯絡管理員。';
  if (m.includes('rate limit') || m.includes('too many')) return '嘗試次數過多，請稍後再試。';
  if (m.includes('network') || m.includes('fetch')) return '網絡連線失敗，請檢查網絡。';
  return `登入失敗：${msg}`;
}
