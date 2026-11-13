'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileImage,
  FileText,
  Loader2,
  EyeOff,
  ListMusic,
  Maximize2,
  Minimize2,
  Moon,
  Pencil,
  X,
  Radio,
  Sun,
  WifiOff,
} from 'lucide-react';
import { supabase, type ListItem, type WorshipList } from '@/lib/supabase';
import { useLiveState } from '@/hooks/useLiveState';
import { useSongSheets, prefetchSongPages } from '@/hooks/useSongData';
import { useRealtimeChannel, type Channel, type ConnStatus } from '@/hooks/useRealtimeChannel';
import { useWakeLock } from '@/hooks/useWakeLock';
import { useDarkMode } from '@/hooks/useDarkMode';
import { useResyncToast, useToast } from '@/components/Toast';
import { SheetViewer } from '@/components/SheetViewer';
import { ChordLyrics } from '@/components/ChordLyrics';
import { readListCache, saveListCache } from '@/lib/offlineCache';
import { getDeviceName, fallbackDeviceName } from '@/lib/deviceName';
import { hasChords, relativeTime, sortItems } from '@/lib/chords';
import { Button } from '@/components/ui';
import { IncomingPushBanner } from '@/components/IncomingPushBanner';
import { StageMetricsPill } from '@/components/StageMetricsPill';
import { StageMetricsPanel } from '@/components/StageMetricsPanel';
import { transposeKey, transposeLyrics } from '@/lib/transpose';

type View = 'sheet' | 'lyrics';

export default function StagePage() {
  const search = useSearchParams();
  const listId = search.get('id') ?? undefined;
  const { toast } = useToast();
  const { dark, toggle: toggleDark } = useDarkMode();
  const { isHeld } = useWakeLock(true);

  const [list, setList] = useState<WorshipList | null>(null);
  const [items, setItems] = useState<ListItem[]>([]);
  const [index, setIndex] = useState(0);
  const [manual, setManual] = useState(false);
  const [view, setView] = useState<View>('sheet');
  const [showChords, setShowChords] = useState(true);
  const [offset, setOffset] = useState(0);
  const [metricsHidden, setMetricsHidden] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [showList, setShowList] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isWide, setIsWide] = useState(true);
  const [pageInfo, setPageInfo] = useState({ index: 0, total: 0 });
  const [missing, setMissing] = useState(false);
  const [pushingId, setPushingId] = useState<string | null>(null);

  const { live, status: liveStatus, justResynced, push } = useLiveState(listId);
  useResyncToast(justResynced);

  // ---------------- data ----------------
  const listIdRef = useRef(listId);
  listIdRef.current = listId;

  const loadNetwork = useCallback(async () => {
    const listId = listIdRef.current;
    if (!listId) return;
    const sb = supabase();
    const [{ data: l }, { data: it }] = await Promise.all([
      sb.from('worship_lists').select('*').eq('id', listId).maybeSingle(),
      sb.from('list_items').select('*, songs(*)').eq('list_id', listId).order('sort_order'),
    ]);
    if (l) setList(l as WorshipList);
    else if (!it) setMissing(true);
    if (it) {
      const rows = sortItems(it as ListItem[]);
      setItems(rows);
      if (l) {
        void saveListCache({
          list: l as WorshipList,
          items: rows,
          songs: rows.map((r) => r.songs).filter(Boolean) as never,
          savedAt: Date.now(),
        });
      }
    }
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const cached = await readListCache(listId ?? '');
      if (alive && cached) {
        setList(cached.list);
        setItems(sortItems(cached.items));
      }
      try {
        await loadNetwork();
      } catch {
        /* offline: the cache stays on screen */
      }
    })();
    return () => {
      alive = false;
    };
  }, [listId, loadNetwork]);

  const onRow = useCallback(
    (ch: Channel) => {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'list_items', filter: `list_id=eq.${listId}` },
        () => void loadNetwork(),
      );
    },
    [listId, loadNetwork],
  );

  const { status: rowStatus } = useRealtimeChannel(`stage_items:${listId}`, onRow, {
    enabled: Boolean(listId),
    onResync: loadNetwork,
  });
  const status = (liveStatus === 'subscribed' ? rowStatus : liveStatus) as ConnStatus;

  /**
   * Push a song to every device from the stage sidebar.
   * The list editor already has this action; doing it here means the leader
   * never has to leave the stage mid-set to change what the team sees.
   */
  /** Push a song to every device from the stage sidebar. */
  const pushSong = useCallback(
    async (songId: string) => {
      if (!songId || status === 'offline') return;
      const item = items.find((i) => i.song_id === songId);
      setPushingId(item?.id ?? songId);
      const name = getDeviceName() ?? fallbackDeviceName();
      // Mark it so the follow-effect applies our own push without a banner.
      selfPushedRef.current.add(songId);
      const { error } = await push(songId, name);
      if (error) selfPushedRef.current.delete(songId);
      setPushingId(null);
      if (error) {
        toast(error, 'error');
        return;
      }
      toast(`已推送《${item?.songs?.title ?? ''}》到台上`, 'success');
      setShowList(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [push, items, status, toast],
  );

  // ---------------- follow the whiteboard ----------------
  const liveIndex = useMemo(
    () => items.findIndex((i) => i.song_id === live?.active_song_id),
    [items, live?.active_song_id],
  );
  const liveSongId = live?.active_song_id ?? null;

  /**
   * A remote push no longer yanks the receiver's screen.
   *
   * Broadcasts now arrive as an offer: the stage keeps showing what the
   * receiver is looking at and shows a banner naming the incoming song. They
   * switch when they choose — so a leader changing the set never interrupts
   * someone mid-verse on a different device.
   */
  const [pending, setPending] = useState<{ songId: string; title: string; by: string } | null>(
    null,
  );
  const selfPushedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!liveSongId || liveIndex < 0) return;
    // Our own push applies immediately — we already chose it.
    if (selfPushedRef.current.has(liveSongId)) {
      selfPushedRef.current.delete(liveSongId);
      setIndex(liveIndex);
      setManual(false);
      setPending(null);
      return;
    }
    // Already looking at it: nothing to offer.
    if (current?.song_id === liveSongId) {
      setPending(null);
      return;
    }
    setPending({
      songId: liveSongId,
      title: items[liveIndex]?.songs?.title ?? '',
      by: live?.pushed_by_name ?? '團隊成員',
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveSongId, liveIndex, live?.updated_at]);

  const acceptPending = () => {
    if (!pending) return;
    const i = items.findIndex((it) => it.song_id === pending.songId);
    if (i >= 0) setIndex(i);
    setManual(false);
    setPending(null);
  };

  useEffect(() => {
    if (items.length && index > items.length - 1) setIndex(items.length - 1);
  }, [items.length, index]);

  const current = items[index];

  /**
   * Key actually being sung.
   *
   * service_key is what the leader chose for this service; the offset is a
   * per-device nudge on top of it, so a stage can drop a semitone without
   * changing what anyone else sees.
   */
  const serviceKey = current?.service_key ?? current?.songs?.original_key ?? '';
  const sungKey = serviceKey ? transposeKey(serviceKey, offset) : '';
  const displayLyrics = useMemo(() => {
    const raw = current?.songs?.lyrics ?? '';
    if (!offset) return raw;
    return transposeLyrics(raw, offset, sungKey);
  }, [current?.songs?.lyrics, offset, sungKey]);

  // A new song starts from its own key, not the previous song's transpose.
  useEffect(() => {
    setOffset(0);
  }, [current?.id]);

  const isLive = Boolean(liveSongId && current?.song_id === liveSongId);

  // ---------------- current song sheets ----------------
  const { sheets, urls, loading: sheetsLoading, fromCache } = useSongSheets(current?.song_id, true);

  const pagePaths = useMemo(
    () => sheets.map((s) => s.file_url).filter((p) => urls.has(p)),
    [sheets, urls],
  );
  const hasSheet = pagePaths.length > 0;
  // Default view: a lead/piano score opens on the SHEET, because the image is
  // the authoritative source and OCR lyrics are only a rough reference.
  // A lyric-only song has no sheet, so it falls through to lyrics.
  const isLeadSheet = current?.songs?.sheet_kind === 'lead_sheet';
  const plan: View = !sheetsLoading && !hasSheet ? 'lyrics' : isLeadSheet ? 'sheet' : view;

  // Preload neighbours so a push never waits on the network.
  useEffect(() => {
    const n = items[index + 1]?.song_id;
    const p = items[index - 1]?.song_id;
    if (n) void prefetchSongPages(n);
    if (p) void prefetchSongPages(p);
  }, [items, index]);

  // ---------------- controls ----------------
  const fullscreenRef = useRef<() => void>(() => {});

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {
      toast('此瀏覽器不支援全螢幕', 'info');
    }
  }, [toast]);
  fullscreenRef.current = () => void toggleFullscreen();

  const go = useCallback(
    (delta: number) => {
      setIndex((i) => {
        const next = Math.min(Math.max(i + delta, 0), Math.max(items.length - 1, 0));
        if (next !== i) setManual(true);
        return next;
      });
    },
    [items.length],
  );

  const chordKey = hasChords(current?.songs?.lyrics);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'c' && chordKey) setShowChords((v) => !v);
      else if (e.key === 'd') toggleDark();
      else if (e.key === 'f') fullscreenRef.current();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go, chordKey, toggleDark]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const set = () => setIsWide(mq.matches);
    set();
    mq.addEventListener('change', set);
    return () => mq.removeEventListener('change', set);
  }, []);

  useEffect(() => {
    const on = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);

  if (missing) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[var(--bg)] px-4 text-center">
        <div>
          <p className="text-sm font-medium">找不到這個清單</p>
          <p className="mt-1 text-xs text-[var(--muted-fg)]">
            可能已被刪除（超過 3 個月的清單會自動刪除）。
          </p>
          <Link href="/" className="mt-3 inline-block text-sm underline">
            回清單列表
          </Link>
        </div>
      </div>
    );
  }

  const offline = status === 'offline';

  return (
    <div className="relative flex h-dvh flex-col overflow-hidden bg-[var(--bg)]">
      {pending ? (
        <IncomingPushBanner
          title={pending.title}
          by={pending.by}
          onAccept={acceptPending}
          onDismiss={() => setPending(null)}
        />
      ) : null}

        {detailsOpen && current ? (
          <div className="absolute inset-x-0 bottom-0 z-40 sm:hidden">
            <StageMetricsPanel
              item={current}
              sungKey={sungKey}
              offset={offset}
              onClose={() => setDetailsOpen(false)}
              variant="sheet"
            />
          </div>
        ) : null}

      {/* status strip */}
      <div
        className={`flex h-8 shrink-0 items-center gap-2 px-3 text-[11px] ${
          offline ? 'bg-rose-600 text-white' : 'border-b border-[var(--border)]'
        }`}
      >
        {offline ? (
          <>
            <WifiOff size={12} />
            <span>離線中，顯示已快取內容</span>
          </>
        ) : status !== 'subscribed' ? (
          <>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-amber-500" />
            <span>重新連線中…</span>
          </>
        ) : (
          <>
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            <span className="text-[var(--muted-fg)]">已連線</span>
          </>
        )}
        <span className={`truncate ${offline ? '' : 'text-[var(--muted-fg)]'}`}>{list?.title}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {manual ? (
            <button
              onClick={() => {
                setManual(false);
                if (liveIndex >= 0) setIndex(liveIndex);
              }}
              className="rounded-full bg-[var(--soft)] px-2 py-0.5 text-[10px] text-[var(--fg)]"
            >
              返回台上
            </button>
          ) : null}
          {isLive ? (
            <span className="flex items-center gap-1 rounded-full bg-[var(--gold)]/20 px-2 py-0.5 text-[10px] text-[var(--gold)]">
              <Radio size={10} className="animate-pulse" /> 台上
            </span>
          ) : null}
          {fromCache ? (
            <span className="rounded bg-[var(--soft)] px-1.5 py-0.5 text-[10px] text-[var(--muted-fg)]">
              快取
            </span>
          ) : null}
          <span className={isHeld ? 'text-[var(--muted-fg)]' : 'text-amber-500'}>
            {isHeld ? '螢幕常亮' : '螢幕可能變暗'}
          </span>
        </div>
      </div>

      {/* main — the right padding reserves the metrics rail on tablet+, so the
          sheet stays centred in the space that is actually visible. */}
      <div className={`relative flex min-h-0 flex-1 ${!showList ? 'sm:pr-64 lg:pr-72' : ''}`}>
        {plan === 'sheet' ? (
          <SheetViewer
            urls={urls}
            pageNumbers={pagePaths}
            dark={dark}
            onPageChange={(i, total) => setPageInfo({ index: i, total })}
            className="p-1 sm:p-3"
          />
        ) : (
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 sm:px-10">
            <div className="mx-auto max-w-3xl">
              <h1 className="mb-4 text-2xl font-semibold tracking-tight sm:text-3xl">
                {current?.songs?.title ?? '—'}
              </h1>
              <ChordLyrics
                lyrics={displayLyrics}
                showChords={showChords}
                className={isWide ? 'text-[19px]' : 'text-[17px]'}
              />
            </div>
          </div>
        )}

        {/* Sits low-right, clear of the sheet's page arrows which are vertically
            centred — at top-1/2 the two were easy to hit by mistake. */}
        {/* Tablet and up: metrics live in a rail, expanded by default, because
            there is room and a leader wants them at a glance. Phones use the
            floating pill instead. */}
        {!showList ? (
          <aside className="absolute inset-y-0 right-0 z-10 hidden w-64 flex-col border-l border-[var(--border)] bg-[var(--card)]/95 backdrop-blur sm:flex lg:w-72">
            <div className="flex items-center gap-1 border-b border-[var(--border)] py-1 pl-3 pr-1.5 text-xs font-medium">
              <span className="flex-1 truncate">{current?.songs?.title ?? '—'}</span>
              {current ? (
                <Link
                  href={`/lists/?id=${listId}`}
                  aria-label="編輯敬拜清單"
                  className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
                >
                  <Pencil size={14} />
                </Link>
              ) : null}
            </div>
            {current ? (
              <StageMetricsPanel item={current} sungKey={sungKey} offset={offset} variant="rail" />
            ) : null}
          </aside>
        ) : null}

        {/* Compact metrics float above the toggle so the sheet keeps the whole
            screen; the full panel is one tap away. */}
        {current ? (
          <StageMetricsPill
            item={current}
            transposedKey={sungKey}
            offset={offset}
            hidden={metricsHidden}
            onToggleHidden={() => setMetricsHidden((v) => !v)}
            onOpenDetails={() => setDetailsOpen(true)}
          />
        ) : null}

        <button
          onClick={() => setShowList((v) => !v)}
          className="absolute bottom-28 right-0 z-20 grid min-h-[44px] w-9 place-items-center rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--card)]/95 text-[var(--muted-fg)] shadow-sm backdrop-blur sm:bottom-32"
          aria-label="詩歌順序"
        >
          <ListMusic size={16} />
        </button>

        {showList ? (
          <aside className="absolute inset-y-0 right-0 z-30 flex w-64 flex-col border-l border-[var(--border)] bg-[var(--card)]/97 backdrop-blur sm:w-72">
            <div className="flex items-center gap-1 border-b border-[var(--border)] py-1 pl-3 pr-1.5 text-xs font-medium">
              <span className="flex-1">詩歌順序</span>
              {/* Jump straight to editing the list instead of leaving the stage
                  and hunting for it — the reason people open this panel mid-set. */}
              <Link
                href={`/lists/?id=${listId}`}
                aria-label="編輯敬拜清單"
                title="編輯敬拜清單"
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)] hover:text-[var(--fg)]"
              >
                <Pencil size={14} />
              </Link>
              <button
                onClick={() => setShowList(false)}
                aria-label="收起"
                className="grid h-9 w-9 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
              >
                <ChevronRight size={15} />
              </button>
            </div>
            <ol className="min-h-0 flex-1 overflow-y-auto py-1">
              {items.map((it, i) => {
                const active = i === index;
                const onLive = it.song_id === liveSongId;
                return (
                  <li key={it.id} className="flex items-stretch">
                    <button
                      onClick={() => {
                        setIndex(i);
                        setManual(true);
                        setShowList(false);
                      }}
                      className={`flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left text-sm ${
                        active ? 'bg-[var(--soft)] font-medium' : ''
                      }`}
                    >
                      <span className="w-4 shrink-0 font-mono text-[10px] text-[var(--muted-fg)]">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{it.songs?.title}</span>
                      {it.selected_key || it.songs?.original_key ? (
                        <span className="shrink-0 font-mono text-[10px] text-[var(--muted-fg)]">
                          {it.selected_key || it.songs?.original_key}
                        </span>
                      ) : null}
                    </button>
                    {/* Push to every device from the stage — same action as the
                        list editor, so the leader never has to leave the stage. */}
                    <button
                      onClick={() => void pushSong(it.song_id)}
                      disabled={pushingId === it.id || status === 'offline'}
                      aria-label={`推送 ${it.songs?.title ?? ''} 上台`}
                      className={`my-1 mr-1.5 flex shrink-0 items-center gap-1 rounded-lg px-2 text-[11px] font-medium transition-colors disabled:opacity-40 ${
                        onLive
                          ? 'bg-[var(--soft)] text-[var(--gold)]'
                          : 'bg-[var(--accent)] text-white hover:brightness-110'
                      }`}
                    >
                      {pushingId === it.id ? (
                        <Loader2 size={11} className="animate-spin" />
                      ) : (
                        <Radio size={11} />
                      )}
                      推送
                    </button>
                  </li>
                );
              })}
            </ol>
          </aside>
        ) : null}

        {live ? (
          <div className="pointer-events-none absolute bottom-[5.5rem] left-0 right-0 flex justify-center">
            <span className="rounded-full bg-black/40 px-3 py-1 text-[10px] text-white backdrop-blur">
              {live.pushed_by_name ? `由 ${live.pushed_by_name} 推送 · ` : ''}
              {relativeTime(live.updated_at)}
            </span>
          </div>
        ) : null}
      </div>

      {/* bottom bar */}
      <div className="flex h-14 shrink-0 items-center gap-0.5 border-t border-[var(--border)] px-1.5 pb-[env(safe-area-inset-bottom)] [height:calc(3.5rem+env(safe-area-inset-bottom))]">
        <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={index <= 0} aria-label="上一首">
          <ChevronLeft size={17} />
        </Button>

        <div className="min-w-0 flex-1 text-center leading-tight">
          <p className="truncate text-sm font-medium">{current?.songs?.title ?? '清單沒有詩歌'}</p>
          <p className="truncate text-[10px] text-[var(--muted-fg)]">
            {items.length ? `${index + 1} / ${items.length}` : ''}
            {current?.songs?.original_key
              ? ` · ${current.selected_key || current.songs.original_key}`
              : ''}
            {plan === 'sheet' && pageInfo.total > 1
              ? ` · 第 ${pageInfo.index + 1}/${pageInfo.total} 頁`
              : ''}
          </p>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => go(1)}
          disabled={index >= items.length - 1}
          aria-label="下一首"
        >
          <ChevronRight size={17} />
        </Button>

        <div className="mx-0.5 h-6 w-px bg-[var(--border)]" />

        {hasSheet ? (
          <Button
            variant="ghost"
            size="sm"
            className="!px-2"
            onClick={() => setView(plan === 'sheet' ? 'lyrics' : 'sheet')}
            aria-label={plan === 'sheet' ? '顯示歌詞' : '顯示樂譜'}
          >
            {plan === 'sheet' ? <FileText size={16} /> : <FileImage size={16} />}
          </Button>
        ) : null}

        {plan === 'lyrics' && sungKey ? (
          <div className="flex items-center rounded-lg border border-[var(--border)]">
            <Button
              variant="ghost"
              size="sm"
              className="!min-h-[32px] !px-1.5"
              onClick={() => setOffset((v) => v - 1)}
              aria-label="降半音"
            >
              −
            </Button>
            <span className="min-w-10 text-center font-mono text-[11px] text-[var(--muted-fg)]">
              {offset > 0 ? `+${offset}` : offset}
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="!min-h-[32px] !px-1.5"
              onClick={() => setOffset((v) => v + 1)}
              aria-label="升半音"
            >
              +
            </Button>
          </div>
        ) : null}

        {chordKey && plan === 'lyrics' ? (
          <Button
            variant="ghost"
            size="sm"
            className="!px-2"
            onClick={() => setShowChords((v) => !v)}
            aria-label="切換和弦"
          >
            {showChords ? <Eye size={16} /> : <EyeOff size={16} />}
          </Button>
        ) : null}

        <Button variant="ghost" size="sm" onClick={toggleDark} className="!px-2" aria-label="深色模式">
          {dark ? <Sun size={16} /> : <Moon size={16} />}
        </Button>

        <Button
          variant="ghost"
          size="sm"
          onClick={() => void toggleFullscreen()}
          className="!px-2"
          aria-label="全螢幕"
        >
          {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
        </Button>

        <Link href={`/lists/?id=${listId}`}>
          <Button variant="ghost" size="sm" className="!px-2" aria-label="關閉舞台">
            <X size={16} />
          </Button>
        </Link>
      </div>

    </div>
  );
}
