'use client';

import { useMemo } from 'react';
import { parseChordLyrics } from '@/lib/chords';

/**
 * Renders lyrics with optional inline chords.
 * ON  : [G]奇異恩典 -> chord "G" above "奇異恩典"
 * OFF : brackets stripped entirely.
 * Plain lyrics render identically in both modes.
 */
export function ChordLyrics({
  lyrics,
  showChords,
  className = '',
}: {
  lyrics: string | null | undefined;
  showChords: boolean;
  className?: string;
}) {
  const lines = useMemo(() => parseChordLyrics(lyrics), [lyrics]);

  if (!lyrics?.trim()) {
    return <p className="text-sm text-[var(--muted-fg)]">此詩歌尚未輸入歌詞。</p>;
  }

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {lines.map((segs, i) => {
        const empty = segs.length === 1 && !segs[0].text && !segs[0].chord;
        if (empty) return <div key={i} className="h-4" />;
        if (!showChords) {
          const text = segs.map((s) => s.text).join('');
          return (
            <p key={i} className="leading-[1.75]">
              {text || '\u00a0'}
            </p>
          );
        }
        // Keep plain lines plain so static lyrics don't gain fake spacing.
        const anyChord = segs.some((s) => s.chord);
        if (!anyChord) {
          return (
            <p key={i} className="leading-[1.75]">
              {segs.map((s) => s.text).join('') || '\u00a0'}
            </p>
          );
        }
        return (
          <p key={i} className="mb-1 flex flex-wrap items-end leading-[1.3]">
            {segs.map((s, j) => (
              <span key={j} className="chord-seg">
                <span className="chord-name">{s.chord ?? ''}</span>
                <span className="chord-text">{s.text || '\u00a0'}</span>
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
