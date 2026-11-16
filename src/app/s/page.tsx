'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, LockKeyhole } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { BrandMark } from '@/components/BrandMark';

type Card = {
  title: string;
  event_date: string | null;
  leader_name: string | null;
  description: string | null;
  song_count: number;
};

function fmtDate(d: string | null): string {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const wd = ['日', '一', '二', '三', '四', '五', '六'][
    new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getUTCDay()
  ];
  return `${m[1]}年${m[2]}月${m[3]}日（${wd}）`;
}

function ShareView() {
  const params = useSearchParams();
  const code = params.get('c') ?? '';
  const [card, setCard] = useState<Card | null>(null);
  const [state, setState] = useState<'loading' | 'ok' | 'gone'>('loading');

  useEffect(() => {
    if (!/^[a-z0-9]{6,24}$/i.test(code)) {
      setState('gone');
      return;
    }
    void (async () => {
      const { data, error } = await supabase().rpc('get_share_card', { p_code: code });
      if (error || !data) {
        setState('gone');
        return;
      }
      setCard(data as Card);
      setState('ok');
    })();
  }, [code]);

  // Keep the tab title in step with the list, so a bookmarked link reads right.
  useEffect(() => {
    if (card?.title) document.title = `${card.title} · Sync Worship`;
  }, [card?.title]);

  if (state === 'loading') {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--bg)]">
        <div className="flex items-center gap-2 text-sm text-[var(--muted-fg)]">
          <Loader2 size={16} className="animate-spin" /> 載入中…
        </div>
      </div>
    );
  }

  if (state === 'gone') {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--bg)] px-6">
        <div className="max-w-sm text-center">
          <p className="text-base font-semibold">這條分享連結已失效</p>
          <p className="mt-2 text-sm leading-relaxed text-[var(--muted-fg)]">
            清單可能已被刪除，或分享已由主領撤銷。
          </p>
          <Link
            href="/login"
            className="mt-5 inline-block rounded-lg bg-[var(--accent)] px-4 py-2 text-sm text-white"
          >
            前往登入
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-[var(--bg)] px-5 py-10">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-5 flex items-center gap-2.5">
          <BrandMark size={36} />
          <div className="leading-tight">
            <p className="text-[15px] font-bold text-[var(--accent)]">Sync Worship</p>
            <p className="text-[11px] text-[var(--muted-fg)]">一同敬拜 · 同步睇譜</p>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[.18em] text-[var(--accent)]">
            敬拜清單
          </p>
          <h1 className="mt-1.5 text-2xl font-bold leading-snug tracking-tight">{card!.title}</h1>

          {card!.event_date ? (
            <p className="mt-2 font-mono text-sm text-[var(--muted-fg)]">{fmtDate(card!.event_date)}</p>
          ) : null}

          {card!.description ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-[var(--fg)]">
              {card!.description}
            </p>
          ) : null}

          <div className="mt-4 flex items-center justify-between border-t border-[var(--border)] pt-3 text-sm">
            <span>
              <span className="text-[var(--muted-fg)]">主領 </span>
              <span className="font-semibold">{card!.leader_name || '—'}</span>
            </span>
            <span className="text-[var(--muted-fg)]">{card!.song_count} 首</span>
          </div>
        </div>

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--soft)]/40 px-4 py-3 text-[12.5px] leading-relaxed text-[var(--muted-fg)]">
          <LockKeyhole size={14} className="mt-0.5 shrink-0" />
          <p>
            清單內容只限團隊成員查看。登入後即可開啟樂譜、歌詞及推送功能。
          </p>
        </div>

        {/* Sign in, then bounce straight to this list. The resolver turns the
            share code into the real list id once a session exists. */}
        <Link
          href={`/login?next=${encodeURIComponent(`/s/open/?c=${code}`)}`}
          className="mt-4 block w-full rounded-xl bg-[var(--accent)] py-2.5 text-center text-sm font-medium text-white"
        >
          登入後開啟清單
        </Link>
      </div>
    </div>
  );
}

export default function SharePage() {
  return (
    <Suspense
      fallback={
        <div className="grid min-h-dvh place-items-center bg-[var(--bg)] text-sm text-[var(--muted-fg)]">
          載入中…
        </div>
      }
    >
      <ShareView />
    </Suspense>
  );
}
