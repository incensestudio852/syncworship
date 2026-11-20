'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Languages, Music2, Search, X } from 'lucide-react';
import { Label, Input, Button, Spinner } from '@/components/ui';
import { searchLyrics, type LrcLibHit } from '@/lib/lrclib';

/**
 * LRCLIB search dialog — EXPERIMENTAL.
 *
 * Deliberately a picker rather than a one-tap fetch: every result can be
 * previewed before it replaces the lyrics, because the database is
 * user-contributed and Chinese coverage is patchy in both content and script
 * (Simplified results are common). Nothing is written until 使用 is pressed.
 */
export function LyricsLookupDialog({
  title,
  artist,
  onUse,
  onClose,
}: {
  title: string;
  /** Composer/artist field, if the song has one — improves the query a lot. */
  artist?: string;
  onUse: (lyrics: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState([title, artist].filter(Boolean).join(' ').trim());
  const [hits, setHits] = useState<LrcLibHit[] | null>(null);
  const [preview, setPreview] = useState<LrcLibHit | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Converted text for the current preview; null until the user asks. */
  const [converted, setConverted] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (q: string) => {
    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setBusy(true);
    setError(null);
    setPreview(null);
    try {
      const found = await searchLyrics(q, ac.signal);
      setHits(found);
      // Show the first result straight away so the user sees something useful
      // even when the list is long.
      setPreview(found[0] ?? null);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setError((e as Error).message);
      setHits([]);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Switching results discards any conversion: stale converted text must never
  // be inserted against a different song.
  useEffect(() => {
    setConverted(null);
  }, [preview?.id]);

  /**
   * Convert 簡→繁 on demand.
   *
   * opencc's cn2t dictionary is ~440 KB gzipped, so it is dynamically imported
   * here rather than bundled into the page: users who never press this button
   * never download it. That is the whole reason this is a button and not an
   * automatic conversion.
   */
  const convertToTraditional = useCallback(async () => {
    if (!preview?.plainLyrics) return;
    setConverting(true);
    try {
      const { Converter } = await import('opencc-js/cn2t');
      const conv = Converter({ from: 'cn', to: 'tw' });
      setConverted(conv(preview.plainLyrics));
    } catch {
      setError('簡繁轉換載入失敗，請檢查網絡後再試。');
    } finally {
      setConverting(false);
    }
  }, [preview?.plainLyrics]);

  const shown = converted ?? preview?.plainLyrics ?? null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-t-2xl border border-[var(--border)] bg-[var(--card)] shadow-2xl sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--border)] p-4">
          <div>
            <h3 className="flex items-center gap-1.5 text-[15px] font-bold">
              <Music2 size={15} />
              歌詞搜尋
              <span className="rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                實驗
              </span>
            </h3>
            <p className="mt-1 text-[11px] leading-snug text-[var(--muted-fg)]">
              資料來自 LRCLIB 社群資料庫，涵蓋率不穩定，中文歌詞多為簡體。請先預覽再使用。
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="rounded-lg p-1 text-[var(--muted-fg)] hover:bg-[var(--soft)]"
          >
            <X size={16} />
          </button>
        </div>

        <form
          className="flex items-end gap-2 border-b border-[var(--border)] p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(query);
          }}
        >
          <div className="min-w-0 flex-1">
            <Label>關鍵字（歌名、歌手）</Label>
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="例：恩典之路 讚美之泉" />
          </div>
          <Button type="submit" variant="primary" disabled={busy || !query.trim()}>
            {busy ? <Spinner size={15} /> : <Search size={15} />}
            搜尋
          </Button>
        </form>

        <div className="grid min-h-0 flex-1 grid-rows-1 gap-0 overflow-hidden sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
          <div className="max-h-[30vh] overflow-y-auto border-b border-[var(--border)] sm:max-h-none sm:border-b-0 sm:border-r">
            {error ? (
              <p className="p-3 text-[12px] text-rose-600">{error}</p>
            ) : hits === null ? (
              <p className="p-3 text-[12px] text-[var(--muted-fg)]">輸入關鍵字後按「搜尋」。</p>
            ) : hits.length === 0 ? (
              <p className="p-3 text-[12px] leading-snug text-[var(--muted-fg)]">
                找不到歌詞。LRCLIB 以英文流行曲為主，中文敬拜詩歌經常沒有收錄。
              </p>
            ) : (
              <ul>
                {hits.map((h) => {
                  const active = preview?.id === h.id;
                  return (
                    <li key={h.id}>
                      <button
                        type="button"
                        onClick={() => setPreview(h)}
                        className={
                          'w-full px-3 py-2 text-left transition-colors ' +
                          (active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--soft)]')
                        }
                      >
                        <span className="block truncate text-[13px] font-semibold">{h.trackName}</span>
                        <span className="block truncate text-[11px] text-[var(--muted-fg)]">
                          {h.artistName}
                          {h.albumName ? ` · ${h.albumName}` : ''}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="flex min-h-0 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto p-3">
              {shown ? (
                <pre className="whitespace-pre-wrap font-sans text-[12.5px] leading-relaxed">{shown}</pre>
              ) : (
                <p className="text-[12px] text-[var(--muted-fg)]">選擇一首以預覽歌詞。</p>
              )}
            </div>
            <div className="flex items-center justify-between gap-2 border-t border-[var(--border)] p-3">
              <p className="text-[11px] text-[var(--muted-fg)]">
                {preview ? '使用後會覆寫目前的歌詞欄位。' : ''}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  disabled={!preview?.plainLyrics || converting}
                  onClick={() => void convertToTraditional()}
                  title="需要時才下載字典"
                >
                  {converting ? <Spinner size={14} /> : <Languages size={14} />}
                  {converted ? '已轉繁體' : '簡轉繁'}
                </Button>
                <Button
                  variant="primary"
                  disabled={!shown}
                  onClick={() => {
                    if (shown) onUse(shown);
                    onClose();
                  }}
                >
                  使用這段歌詞
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
