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

  useEffect(() => {
    if (!open) return;
    setCopied(false);
    setError(null);
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

  const shareUrl = code ? `${window.location.origin}/s/?c=${code}` : '';

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
      setError(`分享卡片未能生成（${(e as Error).message}），連結仍可使用。`);
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

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('未能複製，請長按選取連結。');
    }
  };

  const waShare = () => {
    if (!shareUrl) return;
    window.open(`https://wa.me/?text=${encodeURIComponent(shareUrl)}`, '_blank', 'noopener');
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
        className="w-full max-w-md rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
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
              建立一條分享連結。收到的人會看到清單名稱、日期、主領與說明的預覽卡；
              開啟清單本身則需要團隊帳號登入。
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
              <Button variant="primary" className="flex-1" onClick={waShare}>
                WhatsApp 分享
              </Button>
              <Button variant="ghost" onClick={() => void copy()}>
                {copied ? '已複製' : '複製連結'}
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

        {error ? (
          <p className="mt-3 rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
