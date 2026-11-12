'use client';

import { Radio, X } from 'lucide-react';

/**
 * Receiver-side broadcast offer.
 *
 * A push from another device does not take over this screen — it appears here
 * as a choice, so a receiver mid-song is never interrupted. Slides in from the
 * top so it doesn't collide with the bottom control bar.
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
      className="pointer-events-auto absolute inset-x-2 top-10 z-40 flex items-center gap-2 rounded-xl border border-[var(--accent)]/40 bg-[var(--card)]/97 px-2.5 py-2 shadow-lg backdrop-blur sm:inset-x-4 sm:top-11"
      role="status"
      aria-live="polite"
      aria-label="收到推送"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">
        <Radio size={15} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">《{title}》已推送到台上</p>
        <p className="truncate text-[11px] text-[var(--muted-fg)]">由 {by} 推送</p>
      </div>

      <button
        onClick={onAccept}
        className="min-h-[40px] shrink-0 rounded-lg bg-[var(--accent)] px-3.5 text-[13px] font-semibold text-white"
      >
        切換
      </button>
      <button
        onClick={onDismiss}
        aria-label="留在目前詩歌"
        className="grid h-10 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
      >
        <X size={16} />
      </button>
    </div>
  );
}
