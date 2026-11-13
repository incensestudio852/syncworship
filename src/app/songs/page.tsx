'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronRight, Music4, Plus, Search, X } from 'lucide-react';
import { Button, Card, EmptyState, Spinner } from '@/components/ui';
import { useSongSearch } from '@/components/SongSearch';
import { highlight } from '@/lib/highlight';
import { supabase, type Song } from '@/lib/supabase';

type SortMode = 'recent' | 'title';

/**
 * Chips kept on the collapsed row. Four is what fits a 390px phone alongside the
 * 更多 toggle; showing six pushed the toggle off-screen with no way to reach the
 * remaining tags.
 */
const COLLAPSED_TAGS = 4;

export default function SongsPage() {
  const [q, setQ] = useState('');
  const { hits, loading, error } = useSongSearch(q);
  const [recent, setRecent] = useState<Song[] | null>(null);
  const [sort, setSort] = useState<SortMode>('recent');
  const [activeTag, setActiveTag] = useState<string | null>(null);
  const [showAllTags, setShowAllTags] = useState(false);

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

  const needle = q.trim().toLowerCase();
  const searching = needle.length > 0;

  /**
   * Lyrics search runs client-side over the loaded page of songs.
   *
   * A server-side full-text index over Chinese lyrics needs per-character
   * tokenising, so a single character like 愛 would match nearly everything and
   * the result list would stop being useful. Keeping it local means it is
   * instant, needs no migration, and only searches what is already on screen.
   */
  const lyricHits = useMemo(() => {
    if (!searching) return [] as { song: Song; snippet: string }[];
    const out: { song: Song; snippet: string }[] = [];
    for (const song of recent ?? []) {
      const lyrics = song.lyrics ?? '';
      if (!lyrics) continue;
      // Chords are marked [G]; strip them before matching so a chord name never
      // produces a lyrics hit.
      const plain = lyrics.replace(/\[[^\]]*\]/g, '');
      const at = plain.toLowerCase().indexOf(needle);
      if (at < 0) continue;
      const from = Math.max(0, at - 12);
      const snippet = plain.slice(from, from + 34).replace(/\s+/g, ' ').trim();
      out.push({ song, snippet: (from > 0 ? '…' : '') + snippet + '…' });
    }
    return out;
  }, [searching, needle, recent]);

  /** Title matches first, then songs that matched only in the lyrics. */
  const titleHitIds = new Set(((searching ? hits : []) as Song[]).map((h) => h.id));
  const base = searching
    ? ([...(hits as Song[]), ...lyricHits.map((l) => l.song).filter((s2) => !titleHitIds.has(s2.id))] as Song[])
    : recent;
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
          <p className="mt-0.5 text-sm text-[var(--muted-fg)]">以歌名、歌詞或標籤搜尋詩歌；加入新樂譜</p>
        </div>
        <Link href="/songs/new/">
          <Button variant="primary">
            <Plus size={16} /> 新增詩歌
          </Button>
        </Link>
      </div>

      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
        />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          inputMode="search"
          placeholder="搜尋歌名、歌詞或標籤"
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-9 text-[var(--fg)] outline-none placeholder:text-[var(--muted-fg)]/70 focus:border-[var(--accent)]"
        />
        {q ? (
          <button
            onClick={() => setQ('')}
            aria-label="清除"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {tags.length ? (
        <div
          className={
            showAllTags
              ? '-mx-1 flex flex-wrap gap-1.5 px-1 pb-1'
              : '-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1'
          }
        >
          {activeTag ? (
            <button
              onClick={() => setActiveTag(null)}
              className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-full border border-[var(--accent)] px-3 text-xs text-[var(--accent)]"
            >
              <X size={11} /> 清除標籤
            </button>
          ) : null}
          {(showAllTags ? tags : tags.slice(0, COLLAPSED_TAGS)).map((t) => {
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
          {/* Keep the collapsed bar to one row however many tags exist: the most
              used six stay visible, the rest are one tap away. The active tag is
              always shown so it can't hide behind the toggle. */}
          {activeTag && !(showAllTags ? tags : tags.slice(0, COLLAPSED_TAGS)).some((t) => t.tag === activeTag) ? (
            <button
              onClick={() => setActiveTag(null)}
              aria-pressed
              className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-full border border-[var(--accent)] bg-[var(--accent)] px-3 text-xs font-medium text-white"
            >
              {activeTag} <X size={11} />
            </button>
          ) : null}
          {tags.length > COLLAPSED_TAGS ? (
            <button
              onClick={() => setShowAllTags((v) => !v)}
              aria-expanded={showAllTags}
              className="flex min-h-[34px] shrink-0 items-center gap-1 rounded-full px-2.5 text-xs text-[var(--accent)] hover:bg-[var(--soft)]"
            >
              {showAllTags ? '收起' : `+${tags.length - COLLAPSED_TAGS} 更多`}
            </button>
          ) : null}
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
                  <p className="truncate font-medium">{highlight(s.title, q)}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-[var(--muted-fg)]">
                    {s.original_key ? (
                      <span className="font-mono">{s.original_key}</span>
                    ) : null}
                    {s.source ? <span>{highlight(s.source, q)}</span> : null}
                    {s.tags?.length ? <span>{highlight(s.tags.slice(0, 3).join('、'), q)}</span> : null}
                  </p>
                  {/* Say why this row matched: an unexplained lyrics hit looks
                      like a broken search. */}
                  {searching && !titleHitIds.has(s.id) ? (
                    <p className="mt-1 flex items-start gap-1 text-[11px] text-[var(--accent)]">
                      <span className="shrink-0 rounded bg-[var(--accent-soft)] px-1 text-[10px]">
                        歌詞
                      </span>
                      <span className="truncate">
                        {highlight(lyricHits.find((l) => l.song.id === s.id)?.snippet ?? '', q)}
                      </span>
                    </p>
                  ) : null}
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
