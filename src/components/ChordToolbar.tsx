'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { SECTION_MARKERS, chordsForKey } from '@/lib/chordEntry';
import { KEY_OPTIONS, keyLabel } from '@/lib/setlist';

/**
 * Mobile chord toolbar.
 *
 * It lives above the lyrics field AND pins to the top of the on-screen keyboard
 * while the field has focus. Without the pin it scrolls away the moment the
 * keyboard opens — which is exactly when it is needed.
 *
 * The pin uses visualViewport rather than a fixed offset: the keyboard's height
 * differs between iOS, Android, and portrait/landscape, and reading it is the
 * only way to sit flush without guessing.
 *
 * Compact by necessity — two scrollable rows rather than wrapping grids, so the
 * field keeps its height.
 */
export function ChordToolbar({
  initialKey,
  onInsert,
  onInsertSection,
  onInsertBlock,
}: {
  initialKey: string;
  onInsert: (chord: string) => void;
  onInsertSection: (label: string) => void;
  onInsertBlock: () => void;
}) {
  const [key, setKey] = useState(initialKey || 'G');
  const chords = useMemo(() => chordsForKey(key), [key]);

  /** Keyboard height in px; 0 when closed. Drives the pinned offset. */
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;

    const onResize = () => {
      // The keyboard is open when the visual viewport is meaningfully shorter
      // than the layout viewport; the difference IS its height.
      const kb = Math.max(0, window.innerHeight - vv.height);
      setKbHeight(kb > 120 ? kb : 0);
    };
    vv.addEventListener('resize', onResize);
    onResize();
    return () => vv.removeEventListener('resize', onResize);
  }, []);

  return (
    <div
      className={
        kbHeight
          // Pinned: sits directly on top of the keyboard.
          ? 'fixed inset-x-0 z-30 space-y-1 border-t border-[var(--border)] bg-[var(--card)]/97 px-2 pt-1.5 backdrop-blur lg:hidden'
          : 'mb-1.5 space-y-1 lg:hidden'
      }
      style={kbHeight ? { bottom: kbHeight } : undefined}
    >
    <div className="flex items-center gap-1.5">
      <label className="relative shrink-0">
        <select
          value={key}
          onChange={(e) => setKey(e.target.value)}
          aria-label="和弦調性"
          className="appearance-none rounded-full border border-[var(--border)] bg-[var(--card)] py-1 pl-2.5 pr-6 font-mono text-[11px] font-semibold text-[var(--fg)] outline-none focus:border-[var(--accent)]"
        >
          {KEY_OPTIONS.map((k) => (
            <option key={k} value={k}>
              {keyLabel(k)}
            </option>
          ))}
        </select>
        <ChevronDown
          size={10}
          className="pointer-events-none absolute right-1.5 top-1/2 -translate-y-1/2 text-[var(--muted-fg)]"
        />
      </label>

      {/* Horizontal scroll, not wrap: a wrapping grid would eat two extra rows
          of the already-short field. */}
      <div className="-mx-0.5 flex min-w-0 flex-1 gap-1 overflow-x-auto px-0.5 py-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chords.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onInsert(c)}
            className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 font-mono text-[11.5px] font-semibold text-[var(--fg)] active:border-[var(--accent)] active:bg-[var(--accent-soft)] active:text-[var(--accent)]"
          >
            {c}
          </button>
        ))}
      </div>
    </div>

    {/* Sections on their own row: a second horizontal scroller keeps both bars
        one line tall, which matters with the keyboard open. */}
    <div className="-mx-0.5 flex gap-1 overflow-x-auto px-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {SECTION_MARKERS.map((sec) => (
        <button
          key={sec.label}
          type="button"
          onClick={() => onInsertSection(sec.label)}
          className="shrink-0 rounded-full border border-[var(--border)] bg-[var(--card)] px-2.5 py-1 text-[11px] font-medium text-[var(--muted-fg)] active:border-[var(--accent)] active:bg-[var(--accent-soft)] active:text-[var(--accent)]"
        >
          {sec.shown}
        </button>
      ))}
      <button
        type="button"
        onClick={onInsertBlock}
        className="shrink-0 rounded-full border border-dashed border-[var(--border)] bg-[var(--card)] px-2.5 py-1 font-mono text-[11px] font-medium text-[var(--muted-fg)] active:border-[var(--accent)] active:text-[var(--accent)]"
      >
        ```chords
      </button>
    </div>
    </div>
  );
}
