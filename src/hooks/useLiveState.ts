'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type LiveState } from '@/lib/supabase';
import { useRealtimeChannel, type Channel } from './useRealtimeChannel';

export type LiveHook = {
  live: LiveState | null;
  status: ReturnType<typeof useRealtimeChannel>['status'];
  justResynced: number; // increments -> toast
  push: (songId: string, deviceName: string) => Promise<{ error: string | null }>;
  refresh: () => Promise<LiveState | null>;
};

/** Whiteboard semantics: the DB row is the payload; updated_at (server) wins. */
export function useLiveState(listId: string | undefined, onResynced?: () => void): LiveHook {
  const [live, setLive] = useState<LiveState | null>(null);
  const [justResynced, setJustResynced] = useState(0);
  const liveRef = useRef<LiveState | null>(null);
  liveRef.current = live;

  const apply = useCallback((next: LiveState | null) => {
    if (!next) return;
    const prev = liveRef.current;
    if (prev && new Date(next.updated_at) < new Date(prev.updated_at)) return; // stale
    setLive(next);
  }, []);

  const refresh = useCallback(async () => {
    if (!listId) return null;
    const { data } = await supabase()
      .from('live_state')
      .select('*')
      .eq('list_id', listId)
      .maybeSingle();
    if (data) apply(data as LiveState);
    return (data as LiveState) ?? null;
  }, [listId, apply]);

  const setup = useCallback(
    (ch: Channel) => {
      ch.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'live_state', filter: `list_id=eq.${listId}` },
        (payload) => {
          const row = payload.new as LiveState | null;
          if (row?.list_id) apply(row);
        },
      );
    },
    [listId, apply],
  );

  const { status, resync } = useRealtimeChannel(`live_state:${listId ?? 'none'}`, setup, {
    enabled: Boolean(listId),
    onResync: async () => {
      const row = await refresh();
      if (row) setJustResynced((n) => n + 1);
      onResynced?.();
    },
  });

  // Initial read (also what makes a cold stage open land on the right song).
  useEffect(() => {
    if (!listId) return;
    void refresh();
  }, [listId, refresh]);

  const push = useCallback(
    async (songId: string, deviceName: string) => {
      if (!listId) return { error: '缺少清單' };
      if (!navigator.onLine) return { error: '離線中，無法推送' };
      const { data, error } = await supabase().rpc('push_song', {
        p_list_id: listId,
        p_song_id: songId,
        p_name: deviceName || '未命名裝置',
      });
      if (error || !data) {
        return { error: `推送失敗：${error?.message ?? '未知錯誤'}` };
      }
      const row = data as LiveState;
      apply(row);
      return { error: null };
    },
    [listId, apply],
  );

  return { live, status, justResynced, push, refresh };
}
