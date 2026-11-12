'use client';

import { useEffect, useState } from 'react';
import { WifiOff, Loader2 } from 'lucide-react';
import type { ConnStatus } from '@/hooks/useRealtimeChannel';

/** Persistent top banner whenever the realtime channel is not SUBSCRIBED. */
export function ConnectionBanner({ status }: { status: ConnStatus }) {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    setOnline(navigator.onLine);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);

  if (status === 'subscribed' && online) return null;

  const offline = !online || status === 'offline';
  return (
    <div
      className={`flex items-center justify-center gap-2 px-3 py-1.5 text-xs font-medium ${
        offline ? 'bg-rose-600 text-white' : 'bg-amber-500 text-black'
      }`}
      role="status"
      aria-live="polite"
    >
      {offline ? <WifiOff size={13} /> : <Loader2 size={13} className="animate-spin" />}
      <span>{offline ? '離線中，顯示已快取內容' : '重新連線中…'}</span>
    </div>
  );
}
