'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  chordBeforeCaret,
  chordsForKey,
  insertChordAt,
  insertChordBlock,
  insertSectionAt,
  inlineToChordBlock,
  removeChordBeforeCaret,
  selectionRectInTextarea,
} from '@/lib/chordEntry';
import { ChordPanel } from '@/components/ChordPanel';
import { ChordToolbar } from '@/components/ChordToolbar';
import { ChordSelectionBubble } from '@/components/ChordSelectionBubble';
import { Label } from '@/components/ui';

/**
 * The lyrics field, shared by "new song" and "edit song".
 *
 * Both pages previously had their own bare <textarea>, which meant the chord
 * tooling lived in one of them and not the other. Keeping the field in one
 * component is what stops that drift: a feature added here appears in both.
 *
 * Chord entry has three routes, deliberately:
 *  1. Desktop panel beside the field — pick the key once, click chords.
 *  2. Mobile toolbar above the field — the keyboard covers anything below.
 *  3. Selection bubble — put a chord on a word already written.
 * Plus the ```chords block for charts that need two chords over one word.
 *
 * Typing `[` auto-completes to `[]` with the caret between them, so a chord
 * never needs its closing bracket typed. If a `]` already follows, nothing is
 * added — the existing one is reused rather than producing `[][]`.
 *
 * A `[`-triggered chip row was tried and removed: a bar that appears and
 * vanishes as you type makes the field jump, and the always-present toolbar
 * above the field is reachable without moving the hands anyway.
 */
export function LyricsEditor({
  value,
  onChange,
  songKey,
  rows = 12,
}: {
  value: string;
  onChange: (next: string) => void;
  /** Song's original key, used to pre-load the chord set. */
  songKey: string;
  rows?: number;
}) {
  const elRef = useRef<HTMLTextAreaElement | null>(null);
  const [selAnchor, setSelAnchor] = useState<{ x: number; y: number } | null>(null);
  const [currentChord, setCurrentChord] = useState<string | null>(null);

  const chords = useMemo(() => chordsForKey(songKey || 'G'), [songKey]);

  /** Write text + restore caret. Shared by every insertion route. */
  const commit = useCallback(
    (next: { text: string; caret: number }) => {
      onChange(next.text);
      setSelAnchor(null);
      requestAnimationFrame(() => {
        const node = elRef.current;
        if (!node) return;
        node.focus();
        node.setSelectionRange(next.caret, next.caret);
        setCurrentChord(chordBeforeCaret(next.text, next.caret));
      });
    },
    [onChange],
  );

  const applyChord = useCallback(
    (chord: string | null) => {
      const el = elRef.current;
      if (!el) return;
      const start = el.selectionStart;
      const end = el.selectionEnd;
      if (chord === null) {
        const removed = removeChordBeforeCaret(value, start);
        if (removed) commit(removed);
        return;
      }
      commit(insertChordAt(value, start, end, chord));
    },
    [value, commit],
  );

  const applySection = useCallback(
    (label: string) => {
      const caret = elRef.current?.selectionStart ?? value.length;
      commit(insertSectionAt(value, caret, label));
    },
    [value, commit],
  );

  const applyBlock = useCallback(() => {
    const el = elRef.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? start;
    commit(insertChordBlock(value, start, end));
  }, [value, commit]);

  /** Convert the selected lines from `[G]words` into an aligned block. */
  const convertToBlock = useCallback(() => {
    const el = elRef.current;
    if (!el || el.selectionStart === el.selectionEnd) return;
    const s = el.selectionStart;
    const e = el.selectionEnd;
    const converted = inlineToChordBlock(value.slice(s, e));
    const next = value.slice(0, s) + converted + value.slice(e);
    commit({ text: next, caret: s + converted.length });
  }, [value, commit]);

  /**
   * Typing `[` completes it to `[]` with the caret inside.
   *
   * Chords are the common case, so the closing bracket is never worth a
   * keystroke. Two guards keep it from being annoying:
   *  - Only fires on a single typed `[` (not paste, not deletion).
   *  - If the character ALREADY after the caret is `]`, no bracket is added and
   *    the caret simply steps over it — otherwise `[[]]` appears.
   */
  const handleChange = useCallback(
    (el: HTMLTextAreaElement) => {
      const next = el.value;
      const caret = el.selectionStart;
      const prev = value;

      const typed = next.length === prev.length + 1 && next.slice(0, caret).endsWith('[');
      if (!typed) {
        onChange(next);
        return;
      }

      // The character that will sit AFTER the newly typed `[`.
      //
      // After typing, the `[` occupies index `caret - 1`, so the next char is
      // at `caret`. (Using `caret + 1` reads one past it — with "x[]" and a
      // `[` typed at index 1 the text is "x[[]", where index `caret` is the
      // pre-existing `[` and the `]` is one further along.)
      // Scan the run of `[` characters right after the typed one, then look at
      // what follows it. Typing `[` before an existing `[` leaves the `]` two
      // characters along ("[[]"), not one, so checking a single index missed it
      // and produced `[][]`.
      let scan = caret;
      while (next[scan] === '[') scan += 1;
      const charAfter = next[scan];

      // A `]` already follows, so this bracket can reuse it.
      if (charAfter === ']') {
        onChange(next);
        requestAnimationFrame(() => {
          const node = elRef.current;
          if (node) node.setSelectionRange(caret, caret);
        });
        return;
      }

      const withClose = next.slice(0, caret) + ']' + next.slice(caret);
      onChange(withClose);
      requestAnimationFrame(() => {
        const node = elRef.current;
        if (!node) return;
        node.focus();
        // Caret sits BETWEEN the brackets so the chord name types inside.
        node.setSelectionRange(caret, caret);
      });
    },
    [value, onChange],
  );

  const syncSelection = useCallback(() => {
    const el = elRef.current;
    if (!el) return;
    const { selectionStart, selectionEnd } = el;
    setCurrentChord(chordBeforeCaret(value, selectionStart));
    if (selectionStart === selectionEnd) {
      setSelAnchor(null);
      return;
    }
    const rect = selectionRectInTextarea(el, selectionStart, selectionEnd);
    setSelAnchor(rect ? { x: rect.right, y: rect.top } : null);
  }, [value]);

  return (
    <div>
      <Label>歌詞（可含和弦 [G]　段落 [Verse] 標籤　或 ```chords 區塊）</Label>

      <ChordToolbar
        initialKey={songKey || 'G'}
        onInsert={(c) => applyChord(c)}
        onInsertSection={applySection}
        onInsertBlock={applyBlock}
      />

      <textarea
        ref={elRef}
        value={value}
        onChange={(e) => handleChange(e.target)}
        onSelect={syncSelection}
        onKeyUp={syncSelection}
        rows={rows}
        placeholder={'和弦寫在音節前：[G]奇異恩典 [C]何等甘[G]甜\n輸入 [ 會自動補上 ]，直接打和弦名即可'}
        className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]"
      />

      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--muted-fg)]">
        <span>選取文字可直接加上和弦。</span>
        <button
          type="button"
          onClick={convertToBlock}
          className="underline underline-offset-2 hover:text-[var(--accent)]"
        >
          選取行 → 轉為對齊區塊
        </button>
        <button
          type="button"
          onClick={applyBlock}
          className="underline underline-offset-2 hover:text-[var(--accent)]"
        >
          插入和弦區塊
        </button>
      </div>

      {selAnchor ? (
        <ChordSelectionBubble
          anchor={selAnchor}
          chords={chords}
          currentChord={currentChord}
          onInsert={(c) => applyChord(c)}
          onClose={() => setSelAnchor(null)}
        />
      ) : null}
    </div>
  );
}
