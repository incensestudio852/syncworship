'use client';

import { useEffect, useState } from 'react';
import { Check, Copy, Link2, Loader2, Share2, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { renderShareCard, cardUrl, type CardData } from '@/lib/shareCard';

/**
 * Create / copy / revoke a list's share link.
 *
 * The link opens a preview page anyone can read (title, date, leader,
 * description, song count). The list itself still requires the team account.
 *
 * The card image is rendered ONCE here, at share time, and re-rendered on later
 * saves only when a printed field changes — see the trigger in
 * supabase/steps/10_list_meta_and_sharing.sql.
 */
export function ShareListDialog({
  open,
  listId,
  card,
  onClose,
}: {
  open: boolean;
  listId: string;
  /** Data to draw on the card, gathered by the caller from the list + items. */
  card: CardData;
  onClose: () => void;
}) {
  const [code, setCode] = useState<string | null>(null);
  const [version, setVersion] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setError(null);
    setNotice(null);
    void (async () => {
      const { data } = await supabase()
        .from('list_shares')
        .select('code, card_ver')
        .eq('list_id', listId)
        .is('revoked_at', null)
        .maybeSingle();
      const row = data as { code?: string; card_ver?: string } | null;
      setCode(row?.code ?? null);
      setVersion(row?.card_ver ?? null);
    })();
  }, [open, listId]);

  if (!open) return null;

  const shareUrl = code ? `${window.location.origin}/share/?c=${code}` : '';

  const create = async () => {
    setBusy(true);
    setError(null);
    const { data, error: err } = await supabase().rpc('create_list_share', {
      p_list_id: listId,
    });
    if (err || !data) {
      setBusy(false);
      setError(
        /function .* does not exist/i.test(err?.message ?? '')
          ? '資料庫尚未更新。請先執行 supabase/steps/10_list_meta_and_sharing.sql。'
          : `建立失敗：${err?.message ?? '未知錯誤'}`,
      );
      return;
    }

    const res = data as { code: string; version: string | null };
    // Draw and upload the card now, so the link has an image from the first share.
    try {
      await renderShareCard(listId, card);
    } catch (e) {
      // A missing image must not block sharing — the text preview still works.
      // Translate the two setup failures into something actionable, because
      // "Bucket not found" reads like a bug rather than a missing migration.
      const msg = (e as Error).message ?? '';
      setError(
        /bucket not found/i.test(msg)
          ? '預覽卡未啟用：資料庫尚未建立 share-cards 儲存桶。請執行 supabase/steps/11_share_cards_fixup.sql。連結仍可使用。'
          : /column .*card_ver/i.test(msg)
            ? '預覽卡未啟用：資料庫缺少 card_ver 欄位。請執行 supabase/steps/11_share_cards_fixup.sql。連結仍可使用。'
            : `分享卡片未能生成（${msg}），連結仍可使用。`,
      );
    }
    setCode(res.code);
    setVersion(res.version);
    setBusy(false);
  };

  const revoke = async () => {
    if (!code) return;
    setBusy(true);
    const { error: err } = await supabase().rpc('revoke_list_share', { p_code: code });
    setBusy(false);
    if (err) {
      setError(`撤銷失敗：${err.message}`);
      return;
    }
    setCode(null);
    setVersion(null);
  };

  const copy = async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
      return true;
    } catch {
      setError('未能複製，請長按選取連結。');
      return false;
    }
  };

  /**
   * Share the link.
   *
   * On a phone the native sheet is strictly better than a WhatsApp-only link:
   * it lists every app the user actually has (WhatsApp, Signal, Telegram,
   * Mail, Messages). `navigator.share` needs a user gesture and can be absent
   * (desktop Chrome, some in-app browsers), so it is feature-detected and the
   * caller falls back to WhatsApp, then to "copied".
   */
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const doShare = async () => {
    if (!shareUrl) return;
    if (canNativeShare) {
      try {
        await navigator.share({ title: 'Sync Worship 敬拜清單', url: shareUrl });
        return;
      } catch (e) {
        // AbortError = user dismissed the sheet; anything else falls through.
        if ((e as Error).name === 'AbortError') return;
      }
    }
    // No share sheet: put the link on the clipboard and say so explicitly, so
    // the user is not left wondering whether anything happened.
    const ok = await copy();
    if (ok) setNotice('連結已複製，可以直接貼到 WhatsApp 或其他應用程式。');
  };

  return (
    <div
      className="fixed inset-0 z-[150] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-label="分享清單"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <div className="mb-3 flex items-start justify-between gap-2">
          <h2 className="flex items-center gap-1.5 text-base font-semibold">
            <Share2 size={15} /> 分享清單
          </h2>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
          >
            <X size={15} />
          </button>
        </div>

        {!code ? (
          <>
            <p className="text-[13px] leading-relaxed text-[var(--muted-fg)]">
              建立一條分享連結，以便隊員直接開啟此敬拜清單；開啟清單仍需要登入帳號。
            </p>
            <Button
              variant="primary"
              className="mt-4 w-full"
              onClick={() => void create()}
              disabled={busy}
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />}
              {busy ? '正在製作預覽卡…' : '建立分享連結'}
            </Button>
          </>
        ) : (
          <>
            <p className="mb-2 text-[13px] leading-relaxed text-[var(--muted-fg)]">
              透過連結登入，可直接開啟此敬拜清單。
            </p>
            <div className="overflow-hidden rounded-xl border border-[var(--border)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={cardUrl(listId, version)} alt="分享預覽" className="block w-full" />
            </div>

            <div className="mt-3 flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--soft)]/50 px-2.5 py-2">
              <input
                readOnly
                value={shareUrl}
                aria-label="分享連結"
                className="min-w-0 flex-1 truncate bg-transparent font-mono text-[12px] outline-none"
                onFocus={(e) => e.currentTarget.select()}
              />
              <button
                onClick={() => void copy()}
                aria-label="複製連結"
                className="grid h-8 w-8 shrink-0 place-items-center rounded-md text-[var(--muted-fg)] hover:bg-[var(--card)] hover:text-[var(--accent)]"
              >
                {copied ? <Check size={14} className="text-emerald-500" /> : <Copy size={14} />}
              </button>
            </div>

            <div className="mt-3 flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => void doShare()}>
                {canNativeShare ? '分享' : '複製連結'}
              </Button>
              <Button variant="ghost" onClick={() => void copy()}>
                {copied ? '已複製' : '複製'}
              </Button>
            </div>

            <button
              onClick={() => void revoke()}
              disabled={busy}
              className="mt-3 w-full text-[12px] text-[var(--muted-fg)] underline underline-offset-2 hover:text-rose-500"
            >
              撤銷這條連結
            </button>
          </>
        )}

        {notice ? (
          <p className="mt-3 rounded-lg bg-emerald-500/10 px-3 py-2 text-[12px] text-emerald-700 dark:text-emerald-400">
            {notice}
          </p>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
