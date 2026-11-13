'use client';

import { useEffect, useRef, useState } from 'react';
import { Search, X } from 'lucide-react';
import { CFG } from '@/config';
import { supabase } from '@/lib/supabase';
import { highlight } from '@/lib/highlight';

export type SearchHit = {
  id: string;
  title: string;
  original_key: string | null;
  tags: string[] | null;
  /** Only present on rows fetched by the lyrics query. */
  lyrics?: string | null;
};

/** A hit plus why it matched, so the row can explain itself. */
export type RankedHit = SearchHit & { snippet?: string };

/** Debounced server-side search via the `search_songs` RPC (trigram-indexed, 10k-safe). */
export function useSongSearch(query: string) {
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    const q = query.trim();
    if (q.length === 0) {
      setHits([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const id = ++seq.current;
    const t = window.setTimeout(async () => {
      const { data, error: err } = await supabase().rpc('search_songs', {
        q,
        p_limit: CFG.SEARCH_LIMIT,
      });
      if (id !== seq.current) return;
      if (err) {
        setError(err.message);
        setHits([]);
        setLoading(false);
        return;
      }

      const titleHits = (data as SearchHit[]) ?? [];

      // Lyrics are not part of the RPC's result shape (changing it would need a
      // migration), so run one narrow ILIKE query for lyric matches and append
      // the rows that are not already present. Bounded by the same limit and
      // client-cancelled via `seq`, so a fast typer cannot pile up requests.
      let lyricHits: SearchHit[] = [];
      try {
        const { data: lyr } = await supabase()
          .from('songs')
          .select('id,title,original_key,tags,lyrics')
          .ilike('lyrics', `%${q}%`)
          .limit(CFG.SEARCH_LIMIT);
        lyricHits = ((lyr as SearchHit[]) ?? []).filter(
          (l) => !titleHits.some((t) => t.id === l.id),
        );
      } catch {
        // Lyrics search is a bonus; never fail the whole search over it.
        lyricHits = [];
      }
      if (id !== seq.current) return;

      setError(null);
      setHits([...titleHits, ...lyricHits]);
      setLoading(false);
    }, CFG.SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [query]);

  return { hits, loading, error };
}

export function SongSearch({
  placeholder = '搜尋詩歌名稱…',
  onPick,
  autoFocus,
}: {
  placeholder?: string;
  onPick: (song: SearchHit) => void;
  autoFocus?: boolean;
}) {
  const [q, setQ] = useState('');
  const { hits, loading, error } = useSongSearch(q);
  const showList = q.trim().length > 0;
  const needle = q.trim().toLowerCase();
  const titleIds = new Set(
    hits.filter((h) => h.title.toLowerCase().includes(needle)).map((h) => h.id),
  );
  /** Surrounding lyric text for a row that matched only in the lyrics. */
  const snippetFor = (h: SearchHit): string | null => {
    if (!h.lyrics || titleIds.has(h.id)) return null;
    const plain = h.lyrics.replace(/\[[^\]]*\]/g, '');
    const at = plain.toLowerCase().indexOf(needle);
    if (at < 0) return null;
    const from = Math.max(0, at - 10);
    return (from > 0 ? '…' : '') + plain.slice(from, from + 30).replace(/\s+/g, ' ').trim();
  };

  return (
    <div className="relative">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
        />
        <input
          autoFocus={autoFocus}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] py-2.5 pl-9 pr-9 text-[var(--fg)] outline-none placeholder:text-[var(--muted-fg)]/70 focus:border-[var(--accent)]"
          inputMode="search"
        />
        {q ? (
          <button
            onClick={() => setQ('')}
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
            aria-label="清除"
          >
            <X size={15} />
          </button>
        ) : null}
      </div>

      {showList ? (
        <div className="mt-2 overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--card)]">
          {loading && hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--muted-fg)]">搜尋中…</p>
          ) : error ? (
            <p className="px-3 py-3 text-sm text-rose-500">搜尋失敗：{error}</p>
          ) : hits.length === 0 ? (
            <p className="px-3 py-3 text-sm text-[var(--muted-fg)]">
              找不到《{q.trim()}》，可到詩歌庫新增。
            </p>
          ) : (
            <ul className="max-h-80 overflow-y-auto">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    onClick={() => {
                      onPick(h);
                      setQ('');
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-[var(--soft)]"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm">{highlight(h.title, q)}</span>
                      {snippetFor(h) ? (
                        <span className="mt-0.5 flex items-center gap-1 text-[11px] text-[var(--accent)]">
                          <span className="shrink-0 rounded bg-[var(--accent-soft)] px-1 text-[10px]">
                            歌詞
                          </span>
                          <span className="truncate">{highlight(snippetFor(h) ?? '', q)}</span>
                        </span>
                      ) : null}
                    </span>
                    {h.original_key ? (
                      <span className="shrink-0 rounded bg-[var(--soft)] px-1.5 py-0.5 font-mono text-[11px] text-[var(--muted-fg)]">
                        {h.original_key}
                      </span>
                    ) : null}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
