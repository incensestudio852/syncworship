'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ConnStatus = 'connecting' | 'subscribed' | 'error' | 'offline';

export type Channel = ReturnType<SupabaseClient['channel']>;
export type ChannelSetup = (ch: Channel) => void;

/**
 * Owns one Supabase realtime channel.
 *
 * The channel effect depends ONLY on `name`/`enabled`: `setup` and `onResync`
 * are read through refs. Letting them into the dependency array is what turns
 * "reset state" into an infinite re-subscribe loop, because a state change in
 * the resync handler recreates the callback that the effect depends on.
 *
 * Resync policy:
 *  - on every SUBSCRIBED (first connect, Realtime auto-rejoin after a drop);
 *  - forced re-subscribe on `online` (mobile browsers suspend sockets silently).
 */
export function useRealtimeChannel(
  name: string,
  setup: ChannelSetup,
  opts: { onResync: () => void | Promise<void>; enabled?: boolean },
) {
  const [status, setStatus] = useState<ConnStatus>('connecting');
  const onResyncRef = useRef(opts.onResync);
  onResyncRef.current = opts.onResync;
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const enabled = opts.enabled !== false;

  const resync = useCallback(async () => {
    try {
      await onResyncRef.current();
    } catch (e) {
      console.warn('resync failed', e);
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    let ch: Channel | null = null;
    let sb: ReturnType<typeof supabase> | null = null;

    const attach = (forceResubscribe: boolean) => {
      if (!sb || cancelled) return;
      if (ch && forceResubscribe) {
        sb.removeChannel(ch);
        ch = null;
      }
      if (ch) return;
      const built = sb.channel(name, { config: { broadcast: { self: false } } });
      ch = built;
      setupRef.current(built);
      built.subscribe((state: string) => {
        if (cancelled) return;
        if (state === 'SUBSCRIBED') {
          setStatus('subscribed');
          void resync();
        } else if (state === 'TIMED_OUT' || state === 'CHANNEL_ERROR') {
          setStatus(navigator.onLine ? 'error' : 'offline');
        }
      });
    };

    (async () => {
      const mod: typeof import('@/lib/supabase') = await import('@/lib/supabase');
      if (cancelled || !mod.isConfigured) return;
      sb = mod.supabase();
      attach(false);
      if (!navigator.onLine) setStatus('offline');
    })();

    const onOnline = () => attach(true);
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);

    return () => {
      cancelled = true;
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      if (ch && sb) sb.removeChannel(ch);
      ch = null;
    };
  }, [name, enabled, resync]);

  return { status, resync };
}
