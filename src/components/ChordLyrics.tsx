'use client';

import { useMemo } from 'react';
import { parseChordLyrics } from '@/lib/chords';
import { chipLabel, parseSection } from '@/lib/sections';

/**
 * Renders lyrics with optional inline chords.
 * ON  : [G]奇異恩典 -> chord "G" above "奇異恩典"
 * OFF : brackets stripped entirely.
 * Plain lyrics render identically in both modes.
 *
 * A line that is only a section marker ("[Chorus]", "[Pre-Chorus]") renders as
 * a chip instead of text, so the team can locate a section at a glance.
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
  /**
   * One entry per source line, keeping the line index aligned with the chord
   * parse so section chips and lyric lines never drift apart.
   */
  const blocks = useMemo(() => {
    const parsed = parseChordLyrics(lyrics);
    return (lyrics ?? '').split('\n').map((raw, i) => {
      const m = raw.trim().match(/^\[([^\]]+)\]$/);
      const sec = m ? parseSection(m[1]) : null;
      return {
        section: sec ? chipLabel(sec.label) : null,
        segs: parsed[i] ?? [],
      };
    });
  }, [lyrics]);

  if (!lyrics?.trim()) {
    return <p className="text-sm text-[var(--muted-fg)]">此詩歌尚未輸入歌詞。</p>;
  }

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {blocks.map((b, i) => {
        if (b.section) {
          return (
            <p key={i} className="my-2 first:mt-0">
              <span className="inline-flex items-center rounded-md bg-[var(--accent)]/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--accent)]">
                {b.section}
              </span>
            </p>
          );
        }

        const segs = b.segs;
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
