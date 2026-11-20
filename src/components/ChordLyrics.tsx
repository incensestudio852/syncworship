'use client';

import { useMemo } from 'react';
import { parseChordLyrics } from '@/lib/chords';
import { chipLabel, parseSection } from '@/lib/sections';

/**
 * True when a line inside a ```chords block is a chord row rather than a lyric.
 *
 * Chord rows contain only chord tokens and spaces. Used to hide them when the
 * chord toggle is off, so the block degrades to plain lyrics instead of
 * disappearing entirely.
 */
function isChordOnlyLine(line: string): boolean {
  const t = line.trim();
  if (!t) return false;
  return t.split(/\s+/).every((w) => /^[A-G][#b]?(?:m|maj|min|sus|add|dim|aug|M)?\d*(?:\/[A-G][#b]?)?$/.test(w));
}

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
  /**
   * Split the source into ```` ```chords ```` blocks and everything else.
   *
   * A fenced block is an ALIGNED GRID: chord names sit above the syllable they
   * belong to, spaced by column, with more than one chord per word possible.
   * Parsing those lines as inline `[G]` lyrics destroyed the alignment (the
   * fence itself became a lyric line), so blocks are handed to the renderer
   * intact and drawn in a monospace column grid.
   */
  const blocks = useMemo(() => {
    const src = lyrics ?? '';

    type Block =
      | { kind: 'chords'; lines: string[] }
      | { kind: 'line'; section: string | null; segs: ReturnType<typeof parseChordLyrics>[number] };

    const out: Block[] = [];
    let inBlock = false;
    let collected: string[] = [];
    // Parse outside-block text separately so `[G]` inline syntax keeps working.
    const plainLines: string[] = [];
    const plainIndex: number[] = [];

    for (const raw of src.split('\n')) {
      const trimmed = raw.trim();
      if (!inBlock && /^```chords\b/i.test(trimmed)) {
        inBlock = true;
        collected = [];
        continue;
      }
      if (inBlock && trimmed === '```') {
        out.push({ kind: 'chords', lines: collected });
        inBlock = false;
        collected = [];
        continue;
      }
      if (inBlock) {
        collected.push(raw);
        continue;
      }
      plainIndex.push(out.length);
      plainLines.push(raw);
      out.push({ kind: 'line', section: null, segs: [] });
    }

    const parsed = parseChordLyrics(plainLines.join('\n'));
    plainIndex.forEach((outAt, j) => {
      const raw = plainLines[j];
      const m = raw.trim().match(/^\[([^\]]+)\]$/);
      const sec = m ? parseSection(m[1]) : null;
      out[outAt] = {
        kind: 'line',
        section: sec ? chipLabel(sec.label) : null,
        segs: parsed[j] ?? [],
      };
    });

    return out;
  }, [lyrics]);

  if (!lyrics?.trim()) {
    return <p className="text-sm text-[var(--muted-fg)]">此詩歌尚未輸入歌詞。</p>;
  }

  return (
    <div className={`whitespace-pre-wrap break-words ${className}`}>
      {blocks.map((b, i) => {
        if (b.kind === 'chords') {
          // Monospace + preserved whitespace is the whole point: the columns
          // ARE the notation. Wrapping would break alignment, so the block
          // scrolls horizontally instead.
          return (
            <div key={i} className="my-2 overflow-x-auto rounded-lg bg-[var(--soft)]/40 px-3 py-2">
              <pre className="whitespace-pre font-mono text-[12.5px] leading-[1.5] text-[var(--fg)]">
                {showChords ? b.lines.join('\n') : b.lines.filter(isChordOnlyLine).join('\n')}
              </pre>
            </div>
          );
        }
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
