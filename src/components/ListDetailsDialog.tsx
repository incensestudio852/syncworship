'use client';

import { useEffect, useState } from 'react';
import { Loader2, X } from 'lucide-react';
import { Button, Card, Input, Label } from '@/components/ui';
import { supabase, type WorshipList } from '@/lib/supabase';

/**
 * Edit a list's own metadata: name, date, leader and description.
 *
 * `description` doubles as the remarks field — a list rarely needs two free-text
 * areas, and one box is easier to fill in on a phone.
 */
export function ListDetailsDialog({
  open,
  list,
  onClose,
  onSaved,
}: {
  open: boolean;
  list: WorshipList;
  onClose: () => void;
  onSaved: (patch: Partial<WorshipList>) => void;
}) {
  const [title, setTitle] = useState(list.title);
  const [date, setDate] = useState(list.event_date);
  const [leader, setLeader] = useState(list.leader_name ?? '');
  const [description, setDescription] = useState(list.description ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-seed whenever the dialog is reopened against a changed row.
  useEffect(() => {
    if (!open) return;
    setTitle(list.title);
    setDate(list.event_date);
    setLeader(list.leader_name ?? '');
    setDescription(list.description ?? '');
    setError(null);
  }, [open, list.id, list.title, list.event_date, list.leader_name, list.description]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const save = async () => {
    if (!title.trim()) {
      setError('請輸入清單名稱');
      return;
    }
    if (!date) {
      setError('請選擇日期');
      return;
    }
    setBusy(true);
    const patch = {
      title: title.trim(),
      event_date: date,
      leader_name: leader.trim() || null,
      description: description.trim() || null,
    };
    const { error: err } = await supabase()
      .from('worship_lists')
      .update(patch)
      .eq('id', list.id);
    setBusy(false);
    if (err) {
      setError(
        /column .*description/i.test(err.message)
          ? '資料庫尚未更新（缺少「description」欄位）。請先執行 supabase/steps/10_list_meta_and_sharing.sql。'
          : `儲存失敗：${err.message}`,
      );
      return;
    }
    onSaved(patch);
    onClose();
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
        aria-label="編輯清單資料"
        className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5"
      >
        <div className="mb-4 flex items-start justify-between gap-2">
          <h2 className="text-base font-semibold">編輯清單資料</h2>
          <button
            onClick={onClose}
            aria-label="關閉"
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
          >
            <X size={15} />
          </button>
        </div>

        <div className="space-y-3.5">
          <div>
            <Label>清單名稱</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：20261114 青少年聚會"
            />
          </div>

          {/* Date and leader sit side by side only where there is room for both.
              Safari renders a native date input wider than Chrome does (text +
              picker glyph + its own padding), so a two-column row that merely
              "fits" in Chrome overlapped on iPhone 17. Below the container width
              that can hold a 160px date field, the row stacks instead of
              colliding. Grid + container queries means no JS and no guessing a
              device width. */}
          <div className="@container">
            <div className="grid grid-cols-1 gap-3 @[300px]:grid-cols-[minmax(160px,1fr)_minmax(0,1fr)]">
              <div className="min-w-0">
                <Label>日期</Label>
                <Input
                  type="date"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className="min-w-0 pr-2 [color-scheme:light]"
                />
              </div>
              <div className="min-w-0">
                <Label>主領</Label>
                <Input
                  value={leader}
                  onChange={(e) => setLeader(e.target.value)}
                  placeholder="例如：陳大文"
                  className="min-w-0"
                />
              </div>
            </div>
          </div>

          <div>
            <Label>說明／備註</Label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={300}
              placeholder="例如：本週主題：成為祝福。會前 30 分鐘集合練歌。"
              className="w-full resize-y rounded-lg border border-[var(--border)] bg-[var(--card)] px-2.5 py-2 text-sm outline-none focus:border-[var(--accent)]"
            />
            <p className="mt-1 text-right text-[11px] text-[var(--muted-fg)]">
              {description.length} / 300
            </p>
          </div>

          {error ? (
            <p className="rounded-lg bg-rose-500/10 px-3 py-2 text-[12px] text-rose-600 dark:text-rose-400">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? <Loader2 size={14} className="animate-spin" /> : null}
            儲存
          </Button>
        </div>
      </div>
    </div>
  );
}
