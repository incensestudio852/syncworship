'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Loader2, LockKeyhole } from 'lucide-react';
import { AuthProvider, useAuth } from '@/lib/auth';
import { isConfigured, missingEnvMessage } from '@/lib/supabase';
import { TopBar } from './TopBar';
import { ToastProvider } from './Toast';
import { resolveDeviceName } from '@/lib/deviceName';

/**
 * Registers the offline shell service worker.
 *
 * public/sw.js existed but was never registered, so a cold start with no
 * network showed a browser error instead of the cached app. Registration is
 * skipped in dev (HMR breaks the cache-first asset strategy).
 */
function useServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;
    const onLoad = () => {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    };
    if (document.readyState === 'complete') onLoad();
    else window.addEventListener('load', onLoad, { once: true });
    return () => window.removeEventListener('load', onLoad);
  }, []);
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  useServiceWorker();
  if (!isConfigured) return <SetupNeeded />;

  return (
    <AuthProvider>
      <ToastProvider>
        <Inner>{children}</Inner>
      </ToastProvider>
    </AuthProvider>
  );
}

function Inner({ children }: { children: React.ReactNode }) {
  const { session, loading } = useAuth();
  const pathname = usePathname() ?? '/';
  const isLogin = pathname.startsWith('/login');
  const isStage = /\/stage\/?$/.test(pathname);
  // /s/ is the share landing page. It must render WITHOUT a session, because
  // its job is to show the preview card to someone who has not signed in.
  const isShare = /^\/s\/?$/.test(pathname);

  if (isLogin || isShare) return <>{children}</>;

  if (loading || !session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <div className="flex items-center gap-2 text-sm text-[var(--muted-fg)]">
          <Loader2 size={16} className="animate-spin" />
          載入中…
        </div>
      </div>
    );
  }

  if (isStage) return <>{children}</>;

  return (
    <div className="flex min-h-dvh flex-col">
      <TopBar />
      <main className="mx-auto w-full max-w-5xl flex-1 px-3 py-5 sm:px-5">{children}</main>
      <Footer />
    </div>
  );
}

function Footer() {
  // Read on mount, not during render: localStorage is unavailable during the
  // static export's prerender and would otherwise cause a hydration mismatch.
  const [name, setName] = useState<string | null>(null);
  useEffect(() => {
    setName(resolveDeviceName());
  }, []);

  return (
    <footer className="no-print mt-8 border-t border-[var(--border)] px-4 py-5 text-center text-[11px] leading-relaxed text-[var(--muted-fg)]">
      <p>本系統不保留原始 PDF，請自行備份原檔。</p>
      <p className="mt-1 opacity-80">
        建議在<Link href="/settings/" className="underline underline-offset-2 hover:text-[var(--fg)]">「設定」</Link>
        為每部裝置命名，以便識別推送來源。
        {name ? (
          <>
            {' '}
            本機為：
            <span className="font-medium text-[var(--fg)]">{name}</span>
          </>
        ) : null}
      </p>
    </footer>
  );
}

/** Shown when NEXT_PUBLIC_SUPABASE_* are absent (e.g. local dev before .env.local). */
function SetupNeeded() {
  return (
    <div className="grid min-h-dvh place-items-center px-5">
      <div className="w-full max-w-lg rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="mb-3 flex items-center gap-2 text-lg font-semibold">
          <LockKeyhole size={18} className="text-[var(--accent)]" />
          需要連線設定
        </div>
        <p className="text-sm leading-relaxed text-[var(--muted-fg)]">{missingEnvMessage}</p>
        <div className="mt-4 rounded-xl bg-[var(--soft)] p-3 font-mono text-[11px] leading-relaxed">
          NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
          <br />
          NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGci...
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[var(--muted-fg)]">
          本機開發：建立 <code>.env.local</code> 並重新執行 build。
          <br />
          Cloudflare Workers：Worker → Settings → Build → Variables and Secrets，加入同名變數後<b>重新部署</b>。
          <br />
          Cloudflare Pages：Settings → Environment variables。
        </p>
        <p className="mt-2 text-xs text-amber-600 dark:text-amber-400">
          這些是 build-time 變數：只加入變數而不重新部署，頁面仍會顯示此訊息。
        </p>
      </div>
    </div>
  );
}

/** Kept for symmetry with Next's error boundaries. */
export function useRequireAuth() {
  const router = useRouter();
  const { session, loading } = useAuth();
  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [session, loading, router]);
  return { session, loading };
}
