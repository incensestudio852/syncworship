'use client';

import { Radio, X } from 'lucide-react';

/**
 * Receiver-side broadcast offer.
 *
 * A push from another device never takes over this screen. It appears centred
 * in the middle of the stage as a compact card — wide enough to name the song
 * and its sender, narrow enough to leave the sheet readable around it — and the
 * receiver decides when to switch.
 */
export function IncomingPushBanner({
  title,
  by,
  onAccept,
  onDismiss,
}: {
  title: string;
  by: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <div
      className="pointer-events-auto absolute left-1/2 top-1/2 z-40 flex w-[min(84vw,290px)] -translate-x-1/2 -translate-y-1/2 flex-col items-center gap-2.5 rounded-2xl border border-[var(--accent)]/40 bg-[var(--card)]/97 px-4 py-4 text-center shadow-xl backdrop-blur"
      role="status"
      aria-live="polite"
      aria-label="收到推送"
    >
      <button
        onClick={onDismiss}
        aria-label="留在目前詩歌"
        className="absolute right-1.5 top-1.5 grid h-8 w-8 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
      >
        <X size={15} />
      </button>

      <span className="grid h-9 w-9 place-items-center rounded-full bg-[var(--accent)] text-white">
        <Radio size={16} />
      </span>

      <div className="min-w-0">
        <p className="line-clamp-2 text-sm font-semibold leading-snug">《{title}》</p>
        <p className="mt-0.5 truncate text-[11px] text-[var(--muted-fg)]">由 {by} 推送</p>
      </div>

      <button
        onClick={onAccept}
        className="min-h-[42px] w-full rounded-xl bg-[var(--accent)] px-4 text-sm font-semibold text-white"
      >
        切換
      </button>
    </div>
  );
}
