'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CalendarDays, Plus, Radio, Trash2, Users } from 'lucide-react';
import { Button, Card, EmptyState, Field, Input, Label, Spinner } from '@/components/ui';
import { ConfirmDelete, useIsWide } from '@/components/ConfirmDialogs';
import { useToast } from '@/components/Toast';
import { supabase, type ListItem, type WorshipList } from '@/lib/supabase';
import { formatDate, todayISO, weekdayZh } from '@/lib/chords';

type Row = WorshipList & { item_count: number; live_song: string | null };

export default function ListsPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [toDelete, setToDelete] = useState<Row | null>(null);
  const [busy, setBusy] = useState(false);
  const { toast } = useToast();
  const wide = useIsWide();

  const load = useCallback(async () => {
    const sb = supabase();
    const { data: lists, error: err } = await sb
      .from('worship_lists')
      .select('*')
      .order('event_date', { ascending: false });
    if (err) {
      setError(err.message);
      setRows([]);
      return;
    }
    const all = (lists as WorshipList[]) ?? [];
    const ids = all.map((l) => l.id);

    let items: ListItem[] = [];
    let live: { list_id: string; active_song_id: string | null }[] = [];
    if (ids.length) {
      const [it, lv] = await Promise.all([
        sb.from('list_items').select('list_id, song_id').in('list_id', ids),
        sb.from('live_state').select('list_id, active_song_id').in('list_id', ids),
      ]);
      items = (it.data as ListItem[]) ?? [];
      live = (lv.data as { list_id: string; active_song_id: string | null }[]) ?? [];
    }

    const counts = new Map<string, number>();
    items.forEach((i) => counts.set(i.list_id, (counts.get(i.list_id) ?? 0) + 1));
    const liveByList = new Map(live.filter((l) => l.active_song_id).map((l) => [l.list_id, l.active_song_id!]));

    // live song titles
    const liveIds = Array.from(new Set(liveByList.values()));
    const titles = new Map<string, string>();
    if (liveIds.length) {
      const { data: songs } = await sb.from('songs').select('id, title').in('id', liveIds);
      (songs ?? []).forEach((s: { id: string; title: string }) => titles.set(s.id, s.title));
    }

    setRows(
      all.map((l) => ({
        ...l,
        item_count: counts.get(l.id) ?? 0,
        live_song: liveByList.has(l.id) ? titles.get(liveByList.get(l.id)!) ?? null : null,
      })),
    );
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const { upcoming, past } = useMemo(() => {
    const today = todayISO();
    const list = rows ?? [];
    const up = list
      .filter((r) => r.event_date >= today)
      .sort((a, b) => a.event_date.localeCompare(b.event_date));
    const pa = list.filter((r) => r.event_date < today);
    return { upcoming: up, past: pa };
  }, [rows]);

  const remove = async () => {
    if (!toDelete) return;
    setBusy(true);
    const { error: err } = await supabase().from('worship_lists').delete().eq('id', toDelete.id);
    setBusy(false);
    if (err) {
      toast(`刪除失敗：${err.message}`, 'error');
      return;
    }
    setToDelete(null);
    toast('已刪除清單', 'success');
    void load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">敬拜清單</h1>
          <p className="mt-0.5 text-sm text-[var(--muted-fg)]">
            {upcoming.length ? `接下來有 ${upcoming.length} 場敬拜` : '建立清單，安排本週聚會的詩歌'}
          </p>
        </div>
        <Button variant="primary" onClick={() => setCreating(true)}>
          <Plus size={16} /> 新增清單
        </Button>
      </div>

      {rows === null ? (
        <div className="flex items-center gap-2 py-10 text-sm text-[var(--muted-fg)]">
          <Spinner /> 載入中…
        </div>
      ) : error ? (
        <Card className="p-4 text-sm text-rose-500">載入失敗：{error}</Card>
      ) : rows.length === 0 ? (
        <EmptyState
          icon={<CalendarDays size={26} />}
          title="還沒有敬拜清單"
          body="建立第一個清單，加入詩歌後即可推送到台上所有裝置。"
          action={
            <Button variant="primary" onClick={() => setCreating(true)}>
              <Plus size={16} /> 新增清單
            </Button>
          }
        />
      ) : (
        <>
          {upcoming.length ? (
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--muted-fg)]">
                即將舉行
              </h2>
              {upcoming.map((r) => (
                <ListRow key={r.id} row={r} wide={wide} onDelete={() => setToDelete(r)} />
              ))}
            </section>
          ) : null}

          {past.length ? (
            <section className="space-y-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--muted-fg)]">
                過往清單（超過 3 個月會自動刪除）
              </h2>
              {past.map((r) => (
                <ListRow key={r.id} row={r} wide={wide} muted onDelete={() => setToDelete(r)} />
              ))}
            </section>
          ) : null}
        </>
      )}

      <CreateListModal
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={(id) => {
          setCreating(false);
          window.location.href = `/lists/?id=${id}`;
        }}
      />

      <ConfirmDelete
        open={Boolean(toDelete)}
        title={`刪除清單「${toDelete?.title ?? ''}」？`}
        body="清單內的詩歌與樂譜不會被刪除，只有這份清單會消失。"
        busy={busy}
        onCancel={() => setToDelete(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}

function ListRow({
  row,
  wide,
  muted,
  onDelete,
}: {
  row: Row;
  wide: boolean;
  muted?: boolean;
  onDelete: () => void;
}) {
  return (
    <Card
      className={`group flex items-center gap-3 p-3 transition-colors hover:border-[var(--accent)]/40 ${
        muted ? 'opacity-75' : ''
      }`}
    >
      <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-center leading-none">
        <span className="text-[10px] text-[var(--muted-fg)]">{row.event_date.slice(5, 7)}月</span>
        <span className="mt-0.5 text-base font-semibold text-[var(--accent)]">
          {row.event_date.slice(8, 10)}
        </span>
      </div>

      <Link href={`/lists/?id=${row.id}`} className="min-w-0 flex-1">
        <p className="truncate font-medium">{row.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--muted-fg)]">
          <span>
            {formatDate(row.event_date)} · {weekdayZh(row.event_date)}
          </span>
          {row.leader_name ? <span>· 帶領：{row.leader_name}</span> : null}
          <span>· {row.item_count} 首</span>
        </p>
        {row.live_song ? (
          <p className="mt-1 flex items-center gap-1 text-[11px] text-[var(--gold)]">
            <Radio size={11} className="animate-pulse" /> 台上：{row.live_song}
          </p>
        ) : null}
      </Link>

      <div className="flex shrink-0 items-center gap-1">
        <Link href={`/stage/?id=${row.id}`}>
          <Button variant="ghost" size="sm" className="!px-2" aria-label="開啟舞台">
            <Radio size={15} />
            {wide ? '' : null}
          </Button>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          className="!px-2 text-rose-500 opacity-60 hover:opacity-100"
          onClick={onDelete}
          aria-label="刪除清單"
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </Card>
  );
}

function CreateListModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(todayISO());
  const [leader, setLeader] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (open) {
      setTitle('');
      setDate(todayISO());
      setLeader('');
      setError(null);
    }
  }, [open]);

  if (!open) return null;

  const save = async () => {
    if (!title.trim()) {
      setError('請輸入清單名稱');
      return;
    }
    setBusy(true);
    const { data, error: err } = await supabase()
      .from('worship_lists')
      .insert({ title: title.trim(), event_date: date, leader_name: leader.trim() || null })
      .select('id')
      .single();
    setBusy(false);
    if (err || !data) {
      setError(`建立失敗：${err?.message ?? '未知錯誤'}`);
      return;
    }
    toast('已建立清單', 'success');
    onCreated((data as { id: string }).id);
  };

  return (
    <div
      className="fixed inset-0 z-[140] grid place-items-center bg-black/50 p-4 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5">
        <h2 className="mb-4 flex items-center gap-2 text-base font-semibold">
          <Users size={16} /> 新增敬拜清單
        </h2>
        <div className="space-y-3">
          <Field label="清單名稱" required>
            <Input
              autoFocus
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="例如：主日崇拜"
            />
          </Field>
          <Field label="聚會日期" required>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <div>
            <Label>帶領人（選填）</Label>
            <Input value={leader} onChange={(e) => setLeader(e.target.value)} placeholder="姓名" />
          </div>
          {error ? <p className="text-sm text-rose-500">{error}</p> : null}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            取消
          </Button>
          <Button variant="primary" onClick={() => void save()} disabled={busy}>
            {busy ? '建立中…' : '建立'}
          </Button>
        </div>
      </div>
    </div>
  );
}
