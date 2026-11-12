'use client';

import { useEffect, useRef } from 'react';
import { Loader2, Radio, Send, X } from 'lucide-react';

/**
 * Confirmation banner shown after tapping 推送.
 *
 * Pushing changes every device in the room, so a single tap used to be
 * irreversible — a mis-tap during a set is expensive. The push is now staged:
 * this banner names the song, waits for an explicit 確認推送, and auto-dismisses
 * after `seconds` so a forgotten banner never lingers on the list editor.
 */
export type PendingPush = { songId: string; title: string; at: number };

const DEFAULT_TTL_MS = 30_000;

export function PushConfirmBanner({
  pending,
  busy,
  onConfirm,
  onCancel,
  ttlMs = DEFAULT_TTL_MS,
}: {
  pending: PendingPush | null;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  ttlMs?: number;
}) {
  const onCancelRef = useRef(onCancel);
  onCancelRef.current = onCancel;

  // Restart the countdown whenever a different push is staged.
  useEffect(() => {
    if (!pending) return;
    const remaining = Math.max(0, pending.at + ttlMs - Date.now());
    const t = setTimeout(() => onCancelRef.current(), remaining);
    return () => clearTimeout(t);
  }, [pending?.at, pending, ttlMs]);

  if (!pending) return null;

  return (
    <div
      role="alertdialog"
      aria-live="assertive"
      aria-label="確認推送"
      className="fixed inset-x-0 bottom-0 z-[150] border-t-2 border-[var(--accent)] bg-[var(--card)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 shadow-[0_-8px_24px_rgba(0,0,0,0.14)] sm:bottom-4 sm:mx-auto sm:max-w-xl sm:rounded-xl sm:border"
    >
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-white">
          <Radio size={15} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">推送到所有裝置？</p>
          <p className="mt-0.5 truncate text-xs text-[var(--muted-fg)]">
            《{pending.title}》會顯示在每一部正在看舞台的裝置上。
          </p>
        </div>
        <button
          onClick={onCancel}
          aria-label="取消推送"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
        >
          <X size={16} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <button
          onClick={onConfirm}
          disabled={busy}
          className="flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-lg bg-[var(--accent)] px-4 text-sm font-semibold text-white disabled:opacity-60"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />}
          {busy ? '推 送 中…' : '確 認 推 送'}
        </button>
        <button
          onClick={onCancel}
          disabled={busy}
          className="min-h-[44px] rounded-lg px-4 text-sm text-[var(--muted-fg)] hover:bg-[var(--soft)]"
        >
          取消
        </button>
      </div>
    </div>
  );
}
