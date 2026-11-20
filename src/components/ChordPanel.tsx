'use client';

import { useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { chordsForKey } from '@/lib/chordEntry';
import { KEY_OPTIONS, keyLabel } from '@/lib/setlist';

/**
 * Desktop chord panel.
 *
 * The chart's key is usually known before a single syllable is typed, so
 * pre-loading that key's chords turns scoring into one click per chord instead
 * of typing `[G]` every time. The list is generated from the key rather than
 * hardcoded, so every key works including the minor ones.
 *
 * Chords insert at the caret (see insertChordAt) — this panel never wraps or
 * replaces selected text, because a chord annotates the syllable that follows.
 */
export function ChordPanel({
  initialKey,
  onInsert,
}: {
  initialKey: string;
  onInsert: (chord: string) => void;
}) {
  const [key, setKey] = useState(initialKey || 'G');
  const chords = useMemo(() => chordsForKey(key), [key]);

  return (
    <aside className="sticky top-4 hidden w-[196px] shrink-0 self-start lg:block">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-[11px] font-semibold uppercase tracking-wide text-[var(--muted-fg)]">
            和弦
          </h3>
          <label className="relative">
            <select
              value={key}
              onChange={(e) => setKey(e.target.value)}
              aria-label="和弦調性"
              className="appearance-none rounded-lg border border-[var(--border)] bg-transparent py-0.5 pl-2 pr-6 font-mono text-[11px] font-semibold text-[var(--fg)] outline-none focus:border-[var(--accent)]"
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
        </div>

        <div className="flex flex-wrap gap-1">
          {chords.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => onInsert(c)}
              className="min-h-[32px] rounded-full border border-[var(--border)] px-2.5 font-mono text-[12px] font-semibold text-[var(--fg)] transition-colors hover:border-[var(--accent)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
            >
              {c}
            </button>
          ))}
        </div>

        <p className="mt-3 border-t border-[var(--border)] pt-2 text-[10.5px] leading-relaxed text-[var(--muted-fg)]">
          點一下和弦，插入到游標位置。
        </p>
      </div>
    </aside>
  );
}
