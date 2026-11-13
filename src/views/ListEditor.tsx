'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  GripVertical,
  Loader2,
  Pencil,
  Plus,
  Radio,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { supabase, type ListItem, type Song, type WorshipList } from '@/lib/supabase';
import { useLiveState } from '@/hooks/useLiveState';
import { useRealtimeChannel, type Channel, type ConnStatus } from '@/hooks/useRealtimeChannel';
import { useResyncToast, useToast } from '@/components/Toast';
import { prefetchSongPages } from '@/hooks/useSongData';
import { ConnectionBanner } from '@/components/ConnectionBanner';
import { SongSearch } from '@/components/SongSearch';
import { ConfirmDelete } from '@/components/ConfirmDialogs';
import { Button, Card, Spinner } from '@/components/ui';
import { formatDate, relativeTime, sortItems, weekdayZh } from '@/lib/chords';
import { saveListCache, readListCache } from '@/lib/offlineCache';
import { getDeviceName, setDeviceName, resolveDeviceName, fallbackDeviceName } from '@/lib/deviceName';
import { DeviceNamePrompt } from '@/components/DeviceNamePrompt';
import { SetlistRowSettings, TransitionPicker } from '@/components/SetlistSettings';

export default function ListEditorPage() {
  const router = useRouter();

  const search = useSearchParams();
  const id = search.get('id') ?? undefined;
  const { toast } = useToast();

  const [list, setList] = useState<WorshipList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [offlineCopy, setOfflineCopy] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);
  const [deviceName, setDevice] = useState('');
  const defaultDeviceName = useMemo(() => fallbackDeviceName(), []);
  const [deleteItem, setDeleteItem] = useState<ListItem | null>(null);
  const [deleteList, setDeleteList] = useState(false);
  const [busy, setBusy] = useState(false);
  const dragIndex = useRef<number | null>(null);

  const { live, status: liveStatus, justResynced, push } = useLiveState(id);
  useResyncToast(justResynced);

  const [askName, setAskName] = useState(false);

  useEffect(() => {
    const saved = getDeviceName();
    if (saved) setDevice(saved);
    else setAskName(true); // first run on this device: ask in-app, never window.prompt
  }, []);

  const idRef = useRef(id);
  idRef.current = id;

  const loadFromNetwork = useCallback(async () => {
    const id = idRef.current;
    if (!id) return;
    const sb = supabase();
    const [{ data: l }, { data: it }] = await Promise.all([
      sb.from('worship_lists').select('*').eq('id', id).maybeSingle(),
      sb.from('list_items').select('*, songs(*)').eq('list_id', id).order('sort_order'),
    ]);
    if (l) {
      setList(l as WorshipList);
      const rows = (it as ListItem[]) ?? [];
      setItems(sortItems(rows));
      setOfflineCopy(false);
      void saveListCache({
        list: l as WorshipList,
        items: rows,
        songs: rows.map((r) => r.songs).filter(Boolean) as Song[],
        savedAt: Date.now(),
      });
      // Warm the offline cache for every song's sheet pages.
      rows.forEach((r) => void prefetchSongPages(r.song_id));
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    // Cache-first so an offline open still renders the active list.
    const cached = await readListCache(id ?? '');
    if (cached) {
      setList(cached.list);
      setItems(sortItems(cached.items));
      setOfflineCopy(true);
    }
    try {
      await loadFromNetwork();
    } catch {
      if (!cached) toast('載入失敗，請檢查網絡。', 'error');
    }
    setLoading(false);
  }, [id, loadFromNetwork, toast]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live list_items convergence: a row update only wins if it is newer locally.
  const rowSetup = useCallback(
    (ch: Channel) => {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${id}` },
        (payload) => {
          setItems((prev) => {
            if (payload.eventType === 'DELETE') {
              return prev.filter((i) => i.id !== (payload.old as Partial<ListItem>).id);
            }
            const next = payload.new as ListItem;
            if (!next?.id) return prev;
            const idx = prev.findIndex((i) => i.id === next.id);
            if (idx === -1) {
              // New row: refetch joined song data for it
              void supabase()
                .from('list_items')
                .select('*, songs(*)')
                .eq('id', next.id)
                .maybeSingle()
                .then(({ data }) => {
                  if (data) setItems((p) => (p.some((x) => x.id === (data as ListItem).id) ? p : sortItems([...p, data as ListItem])));
                });
              return prev;
            }
            const current = prev[idx];
            if (new Date(next.updated_at) <= new Date(current.updated_at)) return prev;
            const merged = { ...current, ...next, songs: current.songs };
            const copy = [...prev];
            copy[idx] = merged;
            return sortItems(copy);
          });
        },
      );
    },
    [id],
  );

  const { status: rowStatus } = useRealtimeChannel(`list_items:${id}`, rowSetup, {
    enabled: Boolean(id),
    onResync: () => loadFromNetwork(),
  });

  const status = (liveStatus === 'subscribed' ? rowStatus : liveStatus) as ConnStatus;

  const addSong = async (song: { id: string; title: string }) => {
    if (!id) return;
    const nextOrder = items.length ? Math.max(...items.map((i) => i.sort_order)) + 1 : 0;

    // Carry the song's own defaults into the setlist so a leader does not retype
    // the tempo and flow for every service. service_key stays NULL, which means
    // "sing it in the original key".
    const { data: src } = await supabase()
      .from('songs')
      .select('tempo,dynamic,flow')
      .eq('id', song.id)
      .maybeSingle();
    const defaults = (src as { tempo?: number | null; dynamic?: number | null; flow?: unknown } | null) ?? {};

    const { error } = await supabase().from('list_items').insert({
      list_id: id,
      song_id: song.id,
      sort_order: nextOrder,
      tempo: defaults.tempo ?? null,
      dynamic: defaults.dynamic ?? null,
      flow: defaults.flow ?? null,
    });
    if (error) {
      toast(`加入失敗：${error.message}`, 'error');
      return;
    }
    toast(`已加入《${song.title}》`, 'success');
    void loadFromNetwork();
    void prefetchSongPages(song.id);
  };

  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const saveTimers = useRef<Map<string, number>>(new Map());

  /**
   * Write any per-item setting.
   *
   * The UI updates immediately, then the row is written after a short pause so
   * dragging the dynamic slider or typing a tempo does not fire a request per
   * keystroke. A timer per item id means editing two rows at once still saves
   * both.
   */
  const updateItem = (item: ListItem, patch: Partial<ListItem>) => {
    setItems((prev) =>
      prev.map((i) =>
        i.id === item.id ? { ...i, ...patch, updated_at: new Date().toISOString() } : i,
      ),
    );

    const existing = saveTimers.current.get(item.id);
    if (existing) window.clearTimeout(existing);
    setSavingItemId(item.id);

    const timer = window.setTimeout(async () => {
      const { error } = await supabase().from('list_items').update(patch).eq('id', item.id);
      saveTimers.current.delete(item.id);
      setSavingItemId((cur) => (cur === item.id ? null : cur));
      if (error) {
        // "Could not find the 'flow' column ... in the schema cache" means the
        // database predates this feature. Say that plainly instead of surfacing
        // PostgREST's schema-cache wording, which reads like a bug in the app.
        const missing = error.message.match(/'([a-z_]+)' column/);
        toast(
          missing
            ? `資料庫尚未更新（缺少「${missing[1]}」欄位）。請先執行 supabase/steps/08_setlist_settings.sql 與 09_flow_rows.sql。`
            : `儲存失敗：${error.message}`,
          'error',
        );
      }
    }, 450);
    saveTimers.current.set(item.id, timer);
  };

  const removeItem = async () => {
    if (!deleteItem) return;
    setBusy(true);
    const { error } = await supabase().from('list_items').delete().eq('id', deleteItem.id);
    setBusy(false);
    if (error) {
      toast(`移除失敗：${error.message}`, 'error');
      return;
    }
    setItems((prev) => prev.filter((i) => i.id !== deleteItem.id));
    setDeleteItem(null);
  };

  const removeList = async () => {
    if (!id) return;
    setBusy(true);
    const { error } = await supabase().from('worship_lists').delete().eq('id', id);
    setBusy(false);
    if (error) {
      toast(`刪除失敗：${error.message}`, 'error');
      return;
    }
    toast('已刪除清單', 'success');
    router.replace('/');
  };

  const persistOrder = async (ordered: ListItem[]) => {
    // Each row write touches updated_at -> LWW convergence for reordering.
    await Promise.all(
      ordered.map((item, index) =>
        item.sort_order === index
          ? Promise.resolve()
          : supabase().from('list_items').update({ sort_order: index }).eq('id', item.id),
      ),
    );
    setItems(ordered.map((item, index) => ({ ...item, sort_order: index })));
  };

  const onDrop = (index: number) => {
    const from = dragIndex.current;
    dragIndex.current = null;
    if (from == null || from === index) return;
    const next = [...items];
    const [moved] = next.splice(from, 1);
    next.splice(index, 0, moved);
    void persistOrder(next);
  };

  const moveBy = (index: number, delta: number) => {
    const j = index + delta;
    if (j < 0 || j >= items.length) return;
    const next = [...items];
    [next[index], next[j]] = [next[j], next[index]];
    void persistOrder(next);
  };

  const doPush = async (item: ListItem) => {
    const name = resolveDeviceName();
    setPushingId(item.id);
    const { error } = await push(item.song_id, name);
    setPushingId(null);
    if (error) {
      toast(error, 'error');
      return;
    }
    toast(`已推送《${item.songs?.title ?? ''}》到台上`, 'success');
  };

  if (loading && !list) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--muted-fg)]">
        <Spinner /> 載入中…
      </div>
    );
  }

  if (!list) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium">找不到這個清單</p>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">可能已被刪除（超過 3 個月的清單會自動刪除）。</p>
        <Link href="/" className="mt-3 inline-block text-sm text-[var(--accent)] underline">
          回清單列表
        </Link>
      </div>
    );
  }

  const liveItem = items.find((i) => i.song_id === live?.active_song_id);

  return (
    <div className="space-y-4 pb-24">
      <ConnectionBanner status={status} />

      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link
            href="/"
            className="inline-flex min-h-[36px] items-center gap-1 text-xs text-[var(--muted-fg)] hover:text-[var(--fg)]"
          >
            <ArrowLeft size={13} /> 所有清單
          </Link>
          <h1 className="mt-1 truncate text-xl font-semibold tracking-tight">{list.title}</h1>
          <p className="mt-0.5 text-xs text-[var(--muted-fg)]">
            {formatDate(list.event_date)} · {weekdayZh(list.event_date)}
            {list.leader_name ? ` · 帶領：${list.leader_name}` : ''}
            {offlineCopy ? ' · 離線快取' : ''}
          </p>
        </div>
        <Link href={`/stage/?id=${list.id}`}>
          <Button variant="primary">
            <Radio size={15} /> 開啟舞台模式
          </Button>
        </Link>
      </div>

      {liveItem ? (
        <Card className="flex items-center gap-2 border-[var(--gold)]/40 bg-[var(--gold)]/8 px-3 py-2">
          <Radio size={14} className="shrink-0 animate-pulse text-[var(--gold)]" />
          <p className="min-w-0 flex-1 truncate text-sm">
            <span className="text-[var(--muted-fg)]">台上：</span>
            {liveItem.songs?.title}
          </p>
          <span className="shrink-0 text-[11px] text-[var(--muted-fg)]">
            {live?.pushed_by_name ? `由 ${live.pushed_by_name} 推送 · ` : ''}
            {relativeTime(live?.updated_at)}
          </span>
        </Card>
      ) : null}

      <Card className="p-3">
        <SongSearch onPick={(s) => void addSong(s)} placeholder="搜尋並加入詩歌…" />
      </Card>

      {items.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--border)] px-4 py-12 text-center">
          <p className="text-sm font-medium">清單是空的</p>
          <p className="mt-1 text-xs text-[var(--muted-fg)]">用上面的搜尋框加入詩歌。</p>
        </div>
      ) : (
        <ol className="space-y-2">
          {items.map((item, index) => {
            const isLive = live?.active_song_id === item.song_id;
            return (
              <Fragment key={item.id}>
              <li
                draggable
                onDragStart={() => {
                  dragIndex.current = index;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => onDrop(index)}
                className={`group flex items-center gap-2 rounded-xl border bg-[var(--card)] px-2 py-2.5 transition-colors ${
                  isLive ? 'border-[var(--gold)]' : 'border-[var(--border)]'
                }`}
              >
                <button
                  className="grid min-h-[36px] w-7 cursor-grab touch-none place-items-center text-[var(--muted-fg)] active:cursor-grabbing"
                  aria-label="拖曳排序"
                  onClick={() => moveBy(index, -1)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    moveBy(index, 1);
                  }}
                >
                  <GripVertical size={15} />
                </button>

                <span className="w-5 shrink-0 text-center font-mono text-xs text-[var(--muted-fg)]">
                  {index + 1}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <p className="truncate text-sm font-medium">{item.songs?.title ?? '（已刪除）'}</p>
                    {isLive ? (
                      <span className="shrink-0 rounded bg-[var(--gold)]/20 px-1 text-[9px] text-[var(--gold)]">
                        台上
                      </span>
                    ) : null}
                    {/* Quick jump to the song's edit page — fixing a title or
                        typo shouldn't require going back to the library. */}
                    {item.song_id ? (
                      <Link
                        href={`/songs/detail/?id=${item.song_id}`}
                        aria-label={`編輯《${item.songs?.title ?? ''}》`}
                        title="編輯這首詩歌"
                        className="grid h-9 w-8 shrink-0 place-items-center rounded text-[var(--muted-fg)] transition-opacity hover:text-[var(--accent)] focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                      >
                        <Pencil size={11} />
                      </Link>
                    ) : null}
                  </div>
                  <SetlistRowSettings
                    item={item}
                    saving={savingItemId === item.id}
                    onChange={(patch) => updateItem(item, patch)}
                  />
                </div>

                <div className="flex shrink-0 items-center">
                  <Button
                    variant={isLive ? 'secondary' : 'primary'}
                    size="sm"
                    className="!px-2.5"
                    disabled={pushingId === item.id || status === 'offline'}
                    onClick={() => void doPush(item)}
                    aria-label="推送上台"
                  >
                    {pushingId === item.id ? (
                      <Loader2 size={13} className="animate-spin" />
                    ) : (
                      <Radio size={13} />
                    )}
                    推送
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="!px-1.5 text-[var(--muted-fg)]"
                    onClick={() => setDeleteItem(item)}
                    aria-label="移除"
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </li>
              {/* Gap between songs: the transition belongs to the pair, so it
                  renders after the row rather than inside it. */}
              {index < items.length - 1 ? (
                <li className="flex justify-center py-0.5 pl-7">
                  <TransitionPicker
                    value={item.transition ?? null}
                    note={item.transition_note ?? null}
                    onChange={(transition, note) =>
                      updateItem(item, { transition, transition_note: note })
                    }
                  />
                </li>
              ) : null}
              </Fragment>
          );
        })}
        </ol>
      )}

      {items.length > 1 ? (
        <p className="text-center text-[11px] text-[var(--muted-fg)]">
          拖曳可排序；手機上點一下把手可前移，長按可後移。
        </p>
      ) : null}

      {/* footer actions */}
      <div className="space-y-3 pt-2">

        <div className="flex items-center justify-between gap-2">
          <Button variant="ghost" size="sm" onClick={() => void loadFromNetwork()}>
            <RefreshCw size={13} /> 重新整理
          </Button>
          <Button variant="ghost" size="sm" className="text-rose-500" onClick={() => setDeleteList(true)}>
            <Trash2 size={13} /> 刪除此清單
          </Button>
        </div>
      </div>

      <ConfirmDelete
        open={Boolean(deleteItem)}
        title={`從清單移除《${deleteItem?.songs?.title ?? ''}》？`}
        body="詩歌與樂譜仍會保留在詩歌庫。"
        confirmLabel="移除"
        busy={busy}
        onCancel={() => setDeleteItem(null)}
        onConfirm={() => void removeItem()}
      />

      <ConfirmDelete
        open={deleteList}
        title={`刪除清單「${list.title}」？`}
        body="清單內的詩歌與樂譜不會被刪除。"
        busy={busy}
        onCancel={() => setDeleteList(false)}
        onConfirm={() => void removeList()}
      />

      <DeviceNamePrompt
        open={askName}
        initialName={deviceName || defaultDeviceName}
        onSave={(name) => {
          setDeviceName(name);
          setDevice(name);
          setAskName(false);
          toast('已儲存裝置名稱', 'success');
        }}
        onSkip={() => setAskName(false)}
      />
    </div>
  );
}
