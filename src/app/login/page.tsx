'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Music2, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { Button, Input, Label, Spinner } from '@/components/ui';

export default function LoginPage() {
  return (
    <Suspense fallback={<Center>載入中…</Center>}>
      <LoginForm />
    </Suspense>
  );
}

function LoginForm() {
  const { signIn } = useAuth();
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    const { error: err } = await signIn(email.trim(), password);
    setBusy(false);
    if (err) {
      setError(err);
      return;
    }
    const next = params.get('next');
    router.replace(next && next.startsWith('/') ? next : '/');
  };

  return (
    <Center>
      <form
        onSubmit={submit}
        className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 shadow-sm"
      >
        <div className="mb-6 flex items-center gap-2.5">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-[var(--accent)] text-white">
            <Music2 size={19} />
          </span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Sync Worship</h1>
            <p className="text-xs text-[var(--muted-fg)]">詩歌庫與即時同步</p>
          </div>
        </div>

        <div className="space-y-4">
          <div>
            <Label>電郵</Label>
            <Input
              type="email"
              autoComplete="username"
              inputMode="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="team@example.com"
              required
            />
          </div>
          <div>
            <Label>密碼</Label>
            <div className="relative">
              <Input
                type={showPw ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
              <button
                type="button"
                onClick={() => setShowPw((v) => !v)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
                aria-label={showPw ? '隱藏密碼' : '顯示密碼'}
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}

          <Button type="submit" variant="primary" size="lg" className="w-full" disabled={busy}>
            {busy ? <Spinner /> : null}
            {busy ? '登入中…' : '登入'}
          </Button>
        </div>

        <p className="mt-5 text-center text-[11px] leading-relaxed text-[var(--muted-fg)]">
          全團隊共用同一個帳號。登入後請於「設定」為這部裝置命名，以識別推送來源。
        </p>
      </form>
    </Center>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--bg)] px-4">
      <div className="flex w-full justify-center">{children}</div>
    </div>
  );
}
