'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { chordsForKey } from '@/lib/chordEntry';
import { KEY_OPTIONS, keyLabel } from '@/lib/setlist';

/**
 * Mobile chord toolbar.
 *
 * Sits directly above the lyrics field, because the keyboard occupies the lower
 * half of the screen: anything below the field is unreachable without scrolling.
 * Compact by necessity — one scrollable row of chords rather than a wrapping
 * grid, so the field keeps its height.
 */
export function ChordToolbar({
  initialKey,
  onInsert,
}: {
  initialKey: string;
  onInsert: (chord: string) => void;
}) {
  const [key, setKey] = useState(initialKey || 'G');
  const chords = useMemo(() => chordsForKey(key), [key]);

  return (
    <div className="mb-1.5 flex items-center gap-1.5 lg:hidden">
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
  );
}
