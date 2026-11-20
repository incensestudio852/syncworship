'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Maximize2 } from 'lucide-react';
import { useSong, useSongSheets } from '@/hooks/useSongData';
import { useIsDark } from '@/hooks/useDarkMode';
import { ChordLyrics } from '@/components/ChordLyrics';
import { SheetViewer } from '@/components/SheetViewer';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { useRealtimeChannel, type ConnStatus } from '@/hooks/useRealtimeChannel';
import { Button, Spinner } from '@/components/ui';
import { hasChords } from '@/lib/chords';
import { transposeKey, transposeLyrics } from '@/lib/transpose';
import { TransposeControl } from '@/components/TransposeControl';

export default function SongViewPage() {
  const search = useSearchParams();
  const id = search.get('id') ?? undefined;
  const { song, loading } = useSong(id);
  const { sheets, urls, loading: sheetsLoading } = useSongSheets(id, true);
  const dark = useIsDark();
  const [showChords, setShowChords] = useState(true);
  /**
   * Transpose offset, in semitones.
   *
   * View mode is a reading surface, so the same control as stage's lyric view
   * belongs beside the key: a singer checking a song before the service wants
   * to hear it in their key, and going to stage mode to do that is a detour.
   */
  const [offset, setOffset] = useState(0);
  const [view, setView] = useState<'sheet' | 'lyrics'>('sheet');
  const [fullscreen, setFullscreen] = useState(false);

  // Standalone viewer only needs connectivity *status* (no live sync).
  const { status } = useRealtimeChannel(`viewer:${id ?? 'none'}`, () => {}, {
    enabled: Boolean(id),
    onResync: () => {},
  });

  if (loading || !id) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--muted-fg)]">
        <Spinner /> 載入中…
      </div>
    );
  }
  if (!song) {
    return (
      <div className="py-12 text-center text-sm">
        找不到這首詩歌。<Link href="/songs/" className="underline">回詩歌庫</Link>
      </div>
    );
  }

  const paths = sheets.map((s) => s.file_url);
  const hasSheet = paths.length > 0;
  const mode = hasSheet ? view : 'lyrics';

  /**
   * Sounding key and transposed lyrics, derived exactly as stage does.
   *
   * Deliberately NOT useMemo: this sits after the `!song` early return, and a
   * hook there would change hook order between the loading and loaded renders.
   * Transposing a lyric string is cheap enough not to cache.
   */
  const baseKey = song.original_key ?? '';
  const sungKey = baseKey ? transposeKey(baseKey, offset) : '';
  const rawLyrics = song.lyrics ?? '';
  const displayLyrics = offset ? transposeLyrics(rawLyrics, offset, sungKey) : rawLyrics;

  return (
    <div className={fullscreen ? 'fixed inset-0 z-50 flex flex-col bg-[var(--bg)]' : 'space-y-4'}>
      <ConnectionBanner status={status as ConnStatus} />
      <div className="flex items-center justify-between gap-2 px-1 pt-2">
        <Link
          href={`/songs/detail/?id=${song.id}`}
          className="inline-flex items-center gap-1 text-sm text-[var(--muted-fg)] hover:text-[var(--fg)]"
        >
          <ArrowLeft size={15} /> 返回
        </Link>
        <div className="flex items-center gap-1">
          {hasSheet ? (
            <div className="flex rounded-full bg-[var(--soft)] p-0.5 text-[11px]">
              {(
                [
                  ['sheet', '樂譜'],
                  ['lyrics', '歌詞'],
                ] as const
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => setView(k)}
                  className={`rounded-full px-2.5 py-1 ${
                    mode === k ? 'bg-[var(--card)] font-medium shadow-sm' : 'text-[var(--muted-fg)]'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setFullscreen((v) => !v)}
            aria-label="全螢幕"
          >
            <Maximize2 size={14} />
          </Button>
        </div>
      </div>

      {mode === 'lyrics' ? (
        <div className="mx-auto max-w-2xl px-1 pb-10">
          {/* Same layout as the stage lyric view: title, then the key group
              (sounding key, the original it came from, and the stepper). */}
          <div className="flex items-center gap-2.5">
            <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">{song.title}</h1>

            <TransposeControl
              baseKey={baseKey}
              offset={offset}
              onChange={setOffset}
            />
          </div>

          <div className="mb-3 mt-1 flex items-center gap-2 text-xs text-[var(--muted-fg)]">
            {hasChords(song.lyrics) ? (
              <button
                onClick={() => setShowChords((v) => !v)}
                className="rounded-full bg-[var(--soft)] px-2 py-0.5"
              >
                和弦 {showChords ? '開' : '關'}
              </button>
            ) : null}
          </div>
          <ChordLyrics lyrics={displayLyrics} showChords={showChords} className="text-[15px]" />
        </div>
      ) : sheetsLoading && !urls.size ? (
        <div className="flex items-center gap-2 py-12 text-sm text-[var(--muted-fg)]">
          <Spinner /> 載入樂譜…
        </div>
      ) : (
        <SheetViewer urls={urls} pageNumbers={paths} dark={dark} className="h-[calc(100dvh-7rem)]" />
      )}
    </div>
  );
}
