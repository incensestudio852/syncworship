'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Music4, Plus, X } from 'lucide-react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { SongSearch, useSongSearch } from '@/components/SongSearch';
import { supabase, type Song } from '@/lib/supabase';

type SortMode = 'recent' | 'title';

export default function SongsPage() {
  const [q, setQ] = useState('');
  const { hits, loading, error } = useSongSearch(q);
  const [recent, setRecent] = useState<Song[] | null>(null);
  const [sort, setSort] = useState<SortMode>('recent');
  const [activeTag, setActiveTag] = useState<string | null>(null);

  const loadRecent = useCallback(async () => {
    const { data } = await supabase()
      .from('songs')
      .select('*')
      .order(sort === 'title' ? 'title' : 'updated_at', { ascending: sort === 'title' })
      .limit(60);
    setRecent((data as Song[]) ?? []);
  }, [sort]);

  useEffect(() => {
    void loadRecent();
  }, [loadRecent]);

  const searching = q.trim().length > 0;
  const base = searching ? (hits as Song[]) : recent;
  // The tag filter applies on top of whichever list is showing, so a search
  // plus a tag narrows rather than replaces.
  const list = activeTag ? (base ?? []).filter((x) => (x.tags ?? []).includes(activeTag)) : base;

  // Chips are derived from the loaded songs rather than fetched, so they appear
  // in the same paint as the rows and can never lag behind them.
  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const song of recent ?? []) {
      for (const t of song.tags ?? []) {
        if (t) counts.set(t, (counts.get(t) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([tag, n]) => ({ tag, n }))
      .sort((a, b) => b.n - a.n || a.tag.localeCompare(b.tag))
      .slice(0, 40);
  }, [recent]);

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">詩歌庫</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-fg)]">以歌名或標籤搜尋詩歌、加入新樂譜</p>
        </div>
        <Link href="/songs/new/">
          <Button variant="primary">
            <Plus size={16} /> 新增詩歌
          </Button>
        </Link>
      </div>

      <div className="relative">
        <SongSearch
          onPick={(s) => {
            window.location.href = `/songs/detail/?id=${s.id}`;
          }}
          placeholder="搜尋歌名或標籤（例：奇異恩典、聖餐）"
        />
      </div>

      {tags.length ? (
        <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
          {activeTag ? (
            <button
              onClick={() => setActiveTag(null)}
              className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-full border border-[var(--accent)] px-3 text-xs text-[var(--accent)]"
            >
              <X size={11} /> 清除標籤
            </button>
          ) : null}
          {tags.map((t) => {
            const on = activeTag === t.tag;
            return (
              <button
                key={t.tag}
                onClick={() => setActiveTag(on ? null : t.tag)}
                aria-pressed={on}
                className={`flex min-h-[34px] shrink-0 items-center gap-1 rounded-full border px-3 text-xs transition-colors ${
                  on
                    ? 'border-[var(--accent)] bg-[var(--accent)] font-medium text-white'
                    : 'border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--soft)]'
                }`}
              >
                {t.tag}
                <span className={on ? 'text-white/70' : 'text-[var(--muted-fg)]/60'}>{t.n}</span>
              </button>
            );
          })}
        </div>
      ) : null}

      {!searching ? (
        <div className="flex items-center gap-1 text-xs">
          {(
            [
              ['recent', '最近更新'],
              ['title', '按名稱'],
            ] as [SortMode, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              onClick={() => setSort(k)}
              className={`flex min-h-[36px] items-center rounded-full px-3 transition-colors ${
                sort === k
                  ? 'bg-[var(--accent)] text-white'
                  : 'bg-[var(--soft)] text-[var(--muted-fg)]'
              }`}
            >
              {label}
            </button>
          ))}
          {recent ? <span className="ml-1 text-[var(--muted-fg)]">共 {recent.length} 首</span> : null}
        </div>
      ) : null}

      {loading && searching ? (
        <div className="flex items-center gap-2 py-8 text-sm text-[var(--muted-fg)]">
          <Spinner /> 搜尋中…
        </div>
      ) : error ? (
        <Card className="p-4 text-sm text-rose-500">搜尋失敗：{error}</Card>
      ) : !list || list.length === 0 ? (
        searching ? (
          <EmptyState
            icon={<X size={22} />}
            title={`找不到「${q.trim()}」`}
            body="可以用部分歌名或標籤搜尋，或新增這首詩歌。"
            action={
              <Link href={`/songs/new/?title=${encodeURIComponent(q.trim())}`}>
                <Button variant="primary">
                  <Plus size={16} /> 新增詩歌
                </Button>
              </Link>
            }
          />
        ) : (
          <EmptyState
            icon={<Music4 size={26} />}
            title="詩歌庫還是空的"
            body="上傳樂譜（JPG / PNG / PDF），系統會自動轉成頁面影像並嘗試辨識歌詞。"
            action={
              <Link href="/songs/new/">
                <Button variant="primary">
                  <Plus size={16} /> 新增第一首詩歌
                </Button>
              </Link>
            }
          />
        )
      ) : (
        <ul className="divide-y divide-[var(--border)] overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
          {list.map((s) => (
            <li key={s.id}>
              <Link
                href={`/songs/detail/?id=${s.id}`}
                className="flex items-center gap-3 px-3.5 py-3 hover:bg-[var(--soft)]"
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--muted-fg)]">
                    {s.original_key ? (
                      <span className="font-mono">{s.original_key}</span>
                    ) : null}
                    {s.source ? <span>{s.source}</span> : null}
                    {s.tags?.length ? <span>{s.tags.slice(0, 3).join('、')}</span> : null}
                  </p>
                </div>
                <ChevronRight size={16} className="shrink-0 text-[var(--muted-fg)]" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
