'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { CircleSlash, Link2, Repeat2, X } from 'lucide-react';

/**
 * Selection bubble for the lyrics field.
 *
 * Appears directly above the selected word and offers chords, so a chord can be
 * placed on the exact syllable the leader is looking at rather than typed blind.
 *
 * Positioning follows the approach in the notes-editor reference: measure the
 * bubble AFTER it renders (its width is unknown until then), right-align it to
 * the selection's end, and clamp it inside the viewport. The previous common
 * bug — a toolbar that covers the very words it acts on — comes from assuming a
 * height. `visibility: hidden` until measured avoids a one-frame jump.
 *
 * This is NOT a rich-text toolbar: the field is a plain textarea with `[G]`
 * syntax, so there is nothing to bold or italicise. The icons are chords.
 */
export function ChordSelectionBubble({
  anchor,
  chords,
  currentChord,
  onInsert,
  onClose,
}: {
  /** Viewport coordinates of the selection's right edge / top. */
  anchor: { x: number; y: number };
  chords: string[];
  /** Chord already attached to the caret, if any — enables remove. */
  currentChord: string | null;
  onInsert: (chord: string | null) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const [showAll, setShowAll] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    const vw = window.innerWidth;
    // Right-align to the selection, then clamp into [8, vw - w - 8].
    const left = Math.min(Math.max(8, anchor.x - w), Math.max(8, vw - w - 8));
    // Sit ABOVE the text: subtract the real height plus a small gap.
    // 10px gap so the bubble never touches the glyphs it sits over.
    const top = Math.max(8, anchor.y - h - 10);
    setPos({ left, top });
  }, [anchor, showAll]);

  /**
   * Dismiss on any pointer press outside the bubble.
   *
   * This replaces relying on the textarea's blur, which fired before the tap
   * could register and tore the bubble down mid-click.
   */
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    // Capture so it runs before the textarea's own handlers.
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [onClose]);

  // Show four chords inline (the common ones), then the rest on demand — the
  // bubble has to stay narrow enough to sit over a phone-width selection.
  const quick = showAll ? chords : chords.slice(0, 4);

  return (
    <div
      ref={ref}
      role="toolbar"
      aria-label="插入和弦"
      style={{
        position: 'fixed',
        left: pos?.left ?? anchor.x,
        top: pos?.top ?? anchor.y,
        // Never paint before it has been measured, or it flashes over the text.
        visibility: pos ? 'visible' : 'hidden',
        zIndex: 60,
      }}
      className="flex items-center gap-0.5 rounded-xl border border-[var(--border)] bg-[var(--card)] p-1 shadow-lg"
      // mousedown, not click: the textarea must not lose its selection before
      // the insert runs.
      onMouseDown={(e) => e.preventDefault()}
    >
      {quick.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onInsert(c)}
          className="min-h-[30px] rounded-lg px-2 font-mono text-[12px] font-semibold text-[var(--fg)] hover:bg-[var(--accent-soft)] hover:text-[var(--accent)]"
        >
          {c}
        </button>
      ))}

      {!showAll && chords.length > 4 ? (
        <button
          type="button"
          onClick={() => setShowAll(true)}
          aria-label="更多和弦"
          className="grid h-[30px] w-7 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
        >
          …
        </button>
      ) : null}

      <span className="mx-0.5 h-4 w-px bg-[var(--border)]" />

      {currentChord ? (
        <button
          type="button"
          onClick={() => onInsert(null)}
          aria-label="移除這個和弦"
          title={`移除 ${currentChord}`}
          className="grid h-[30px] w-7 place-items-center rounded-lg text-rose-500 hover:bg-rose-500/10"
        >
          <CircleSlash size={13} />
        </button>
      ) : null}

      <button
        type="button"
        onClick={onClose}
        aria-label="關閉"
        className="grid h-[30px] w-7 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
      >
        <X size={13} />
      </button>
    </div>
  );
}
