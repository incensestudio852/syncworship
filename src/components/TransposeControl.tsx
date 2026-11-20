'use client';

import { transposeKey } from '@/lib/transpose';

/**
 * Key label + semitone stepper, shared by every place that shows a song's key.
 *
 * Exists so the tritone-stepper cannot drift between the song view, the song
 * detail page and stage mode: they all render the same control, so they all
 * behave and look the same.
 *
 * The key shown is the SOUNDING key. When the song is transposed, the original
 * key is shown in muted text beside it so nobody loses track of what the chart
 * was written in.
 */
export function TransposeControl({
  baseKey,
  offset,
  onChange,
  size = 'sm',
}: {
  /** The song's written key, e.g. "G". Empty string renders nothing. */
  baseKey: string;
  /** Current transposition in semitones. */
  offset: number;
  onChange: (next: number) => void;
  /** `sm` for page headers, `md` where there is more room to breathe. */
  size?: 'sm' | 'md';
}) {
  if (!baseKey) return null;

  const sungKey = transposeKey(baseKey, offset);
  const btn = size === 'md' ? 'h-9 w-9' : 'h-8 w-8';
  const keyPill = size === 'md' ? 'text-base px-2.5 py-1' : 'text-sm px-2 py-0.5';

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span
        className={`rounded-md bg-[var(--soft)] font-mono font-semibold text-[var(--accent)] ${keyPill}`}
      >
        {sungKey}
      </span>
      {offset !== 0 ? (
        <span className="font-mono text-[11px] text-[var(--muted-fg)]">{baseKey}</span>
      ) : null}

      <div className="flex items-center rounded-lg border border-[var(--border)]">
        <button
          type="button"
          onClick={() => onChange(offset - 1)}
          aria-label="降半音"
          className={`grid place-items-center rounded-l-lg text-[var(--muted-fg)] hover:bg-[var(--soft)] hover:text-[var(--accent)] ${btn}`}
        >
          −
        </button>
        <span className="min-w-7 text-center font-mono text-[11px] tabular-nums text-[var(--muted-fg)]">
          {offset > 0 ? `+${offset}` : offset}
        </span>
        <button
          type="button"
          onClick={() => onChange(offset + 1)}
          aria-label="升半音"
          className={`grid place-items-center rounded-r-lg text-[var(--muted-fg)] hover:bg-[var(--soft)] hover:text-[var(--accent)] ${btn}`}
        >
          +
        </button>
      </div>

      {offset !== 0 ? (
        <button
          type="button"
          onClick={() => onChange(0)}
          className="rounded-full px-1.5 py-0.5 text-[11px] text-[var(--muted-fg)] underline underline-offset-2 hover:text-[var(--accent)]"
        >
          還原
        </button>
      ) : null}
    </div>
  );
}
