'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

/**
 * Turn a share code into the real list id, now that the user is signed in.
 *
 * The share page is public, so it cannot read `list_shares` directly — only the
 * narrow `get_share_card` RPC is exposed to anon. After login the session exists
 * and the table is readable, so the code resolves here and redirects into the
 * normal editor.
 */
function Resolver() {
  const params = useSearchParams();
  const router = useRouter();
  const code = params.get('c') ?? '';
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!code) {
      setError('缺少分享代碼。');
      return;
    }
    void (async () => {
      const { data, error: err } = await supabase()
        .from('list_shares')
        .select('list_id, revoked_at')
        .eq('code', code)
        .maybeSingle();

      if (err || !data) {
        setError('找不到這條分享連結。');
        return;
      }
      if ((data as { revoked_at: string | null }).revoked_at) {
        setError('這條分享連結已被撤銷。');
        return;
      }
      router.replace(`/lists/?id=${(data as { list_id: string }).list_id}`);
    })();
  }, [code, router]);

  if (error) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--bg)] px-6">
        <div className="max-w-sm text-center">
          <p className="text-base font-semibold">{error}</p>
          <button
            onClick={() => router.replace('/')}
            className="mt-4 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            回到清單
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--bg)]">
      <div className="flex items-center gap-2 text-sm text-[var(--muted-fg)]">
        <Loader2 size={16} className="animate-spin" /> 正在開啟清單…
      </div>
    </div>
  );
}

export default function OpenSharePage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[var(--bg)] text-sm text-[var(--muted-fg)]">
          載入中…
        </div>
      }
    >
      <Resolver />
    </Suspense>
  );
}
