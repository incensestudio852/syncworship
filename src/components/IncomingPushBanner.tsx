'use client';

import { Radio, X } from 'lucide-react';

/**
 * Receiver-side broadcast offer.
 *
 * A push from another device never takes over this screen. It drops in just
 * below the status strip, horizontally centred, as a small pill: a compact icon,
 * the song, and one small 切換 button. The sheet below stays readable, and the
 * receiver decides when to switch.
 */
/**
 * Song names are usually under ~12 characters, so the pill caps the field there.
 * Longer titles are cut with an ellipsis rather than widening the banner; the
 * full name remains available as a tooltip and in the list sidebar.
 */
const TITLE_MAX = 12;

function truncateTitle(title: string): string {
  const t = title.trim();
  return t.length <= TITLE_MAX ? `《${t}》` : `《${t.slice(0, TITLE_MAX)}…》`;
}

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
      className="pointer-events-auto absolute left-1/2 top-10 z-40 flex w-max max-w-[min(80vw,280px)] -translate-x-1/2 items-center gap-1.5 rounded-full border border-[var(--live)]/35 bg-[var(--live-soft)]/97 py-1 pl-1 pr-1.5 shadow-lg backdrop-blur"
      role="status"
      aria-live="polite"
      aria-label="收到推送"
    >
      <button
        onClick={onDismiss}
        aria-label="留在目前詩歌"
        className="order-last grid h-6 w-6 shrink-0 place-items-center rounded-full text-[var(--live)]/70 hover:bg-[var(--live)]/15"
      >
        <X size={13} />
      </button>

      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--live)] text-white">
        <Radio size={13} />
      </span>

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-semibold leading-tight" title={title}>
          {truncateTitle(title)}
        </p>
        <p className="truncate text-[10px] leading-tight text-[var(--live)]/80">由 {by} 推送</p>
      </div>

      <button
        onClick={onAccept}
        className="min-h-[30px] shrink-0 rounded-full bg-[var(--live)] px-2.5 text-[12px] font-semibold text-white"
      >
        切換
      </button>
    </div>
  );
}
