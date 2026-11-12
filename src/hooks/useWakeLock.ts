'use client';

import { useEffect, useRef, useState } from 'react';

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
  addEventListener: (t: string, cb: () => void) => void;
};

/**
 * Keeps the screen awake during stage view.
 * 1. Screen Wake Lock API where available (iOS 16.4+, Chrome/Edge).
 * 2. Fallback: an off-screen muted looping <video> — still needed on Safari < 16.4.
 */
export function useWakeLock(enabled = true) {
  const [isHeld, setIsHeld] = useState(false);
  const [mode, setMode] = useState<'native' | 'video' | 'none'>('none');
  const sentinelRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) return;
    let disposed = false;

    const acquireNative = async () => {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (t: 'screen') => Promise<WakeLockSentinel> };
      };
      if (!nav.wakeLock) return false;
      try {
        const s = await nav.wakeLock.request('screen');
        if (disposed) {
          await s.release();
          return true;
        }
        sentinelRef.current = s;
        setIsHeld(true);
        setMode('native');
        s.addEventListener('release', () => {
          if (!disposed) setIsHeld(false);
        });
        return true;
      } catch {
        return false;
      }
    };

    const acquireVideo = () => {
      // 1x1 silent looping video keeps iOS from dimming in many cases.
      if (!videoRef.current) {
        const v = document.createElement('video');
        v.setAttribute('playsinline', 'true');
        v.muted = true;
        v.loop = true;
        v.style.cssText =
          'position:fixed;left:0;top:0;width:1px;height:1px;opacity:0.01;pointer-events:none;z-index:-1';
        v.src = BLANK_MP4;
        document.body.appendChild(v);
        videoRef.current = v;
      }
      const v = videoRef.current;
      v.play()
        .then(() => {
          setIsHeld(true);
          setMode('video');
        })
        .catch(() => {
          setIsHeld(false);
          setMode('none');
        });
    };

    const start = async () => {
      const nativeOk = await acquireNative();
      if (!nativeOk && !disposed) acquireVideo();
    };

    void start();

    const onVisibility = () => {
      if (document.visibilityState === 'visible' && enabledRef.current) {
        if (mode === 'video') acquireVideo();
        else void acquireNative();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      sentinelRef.current?.release().catch(() => {});
      sentinelRef.current = null;
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.remove();
        videoRef.current = null;
      }
      setIsHeld(false);
      setMode('none');
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return { isHeld, mode };
}

// Silent looping video used only as a keep-awake driver where the
// Screen Wake Lock API is unavailable. 0.64s black H.264, 32x32, no audio.
const BLANK_MP4 =
  'data:video/mp4;base64,AAAAIGZ0eXBpc29tAAACAGlzb21pc28yYXZjMW1wNDEAAAOxbW9vdgAAAGxtdmhkAAAAAAAAAAAAAAAAAAAD6AAAA+gAAQAAAQAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgAAAtt0cmFrAAAAXHRraGQAAAADAAAAAAAAAAAAAAABAAAAAAAAA+gAAAAAAAAAAAAAAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAAABAAAAAACAAAAAgAAAAAAAkZWR0cwAAABxlbHN0AAAAAAAAAAEAAAPoAAAIAAABAAAAAAJTbWRpYQAAACBtZGhkAAAAAAAAAAAAAAAAAAAoAAAAKABVxAAAAAAALWhkbHIAAAAAAAAAAHZpZGUAAAAAAAAAAAAAAABWaWRlb0hhbmRsZXIAAAAB/m1pbmYAAAAUdm1oZAAAAAEAAAAAAAAAAAAAACRkaW5mAAAAHGRyZWYAAAAAAAAAAQAAAAx1cmwgAAAAAQAAAb5zdGJsAAAAvnN0c2QAAAAAAAAAAQAAAK5hdmMxAAAAAAAAAAEAAAAAAAAAAAAAAAAAAAAAACAAIABIAAAASAAAAAAAAAABFUxhdmM2Mi4yOC4xMDIgbGlieDI2NAAAAAAAAAAAAAAAGP//AAAANGF2Y0MBZAAK/+EAF2dkAAqs2UlsBEAAAAMAQAAABQPEiWWAAQAGaOvjyyLA/fj4AAAAABBwYXNwAAAAAQAAAAEAAAAUYnRydAAAAAAAABowAAAAAAAAABhzdHRzAAAAAAAAAAEAAAAKAAAEAAAAABRzdHNzAAAAAAAAAAEAAAABAAAAYGN0dHMAAAAAAAAACgAAAAEAAAgAAAAAAQAAFAAAAAABAAAIAAAAAAEAAAAAAAAAAQAABAAAAAABAAAUAAAAAAEAAAgAAAAAAQAAAAAAAAABAAAEAAAAAAEAAAgAAAAAHHN0c2MAAAAAAAAAAQAAAAEAAAAKAAAAAQAAADxzdHN6AAAAAAAAAAAAAAAKAAACygAAAA0AAAAMAAAADAAAAAwAAAATAAAADgAAAAwAAAAMAAAAEgAAABRzdGNvAAAAAAAAAAEAAAPhAAAAYnVkdGEAAABabWV0YQAAAAAAAAAhaGRscgAAAAAAAAAAbWRpcmFwcGwAAAAAAAAAAAAAAAAtaWxzdAAAACWpdG9vAAAAHWRhdGEAAAABAAAAAExhdmY2Mi4xMi4xMDIAAAAIZnJlZQAAA05tZGF0AAACrgYF//+q3EXpvebZSLeWLNgg2SPu73gyNjQgLSBjb3JlIDE2NSByMzIyMiBiMzU2MDVhIC0gSC4yNjQvTVBFRy00IEFWQyBjb2RlYyAtIENvcHlsZWZ0IDIwMDMtMjAyNSAtIGh0dHA6Ly93d3cudmlkZW9sYW4ub3JnL3gyNjQuaHRtbCAtIG9wdGlvbnM6IGNhYmFjPTEgcmVmPTMgZGVibG9jaz0xOjA6MCBhbmFseXNlPTB4MzoweDExMyBtZT1oZXggc3VibWU9NyBwc3k9MSBwc3lfcmQ9MS4wMDowLjAwIG1peGVkX3JlZj0xIG1lX3JhbmdlPTE2IGNocm9tYV9tZT0xIHRyZWxsaXM9MSA4eDhkY3Q9MSBjcW09MCBkZWFkem9uZT0yMSwxMSBmYXN0X3Bza2lwPTEgY2hyb21hX3FwX29mZnNldD0tMiB0aHJlYWRzPTEgbG9va2FoZWFkX3RocmVhZHM9MSBzbGljZWRfdGhyZWFkcz0wIG5yPTAgZGVjaW1hdGU9MSBpbnRlcmxhY2VkPTAgYmx1cmF5X2NvbXBhdD0wIGNvbnN0cmFpbmVkX2ludHJhPTAgYmZyYW1lcz0zIGJfcHlyYW1pZD0yIGJfYWRhcHQ9MSBiX2JpYXM9MCBkaXJlY3Q9MSB3ZWlnaHRiPTEgb3Blbl9nb3A9MCB3ZWlnaHRwPTIga2V5aW50PTI1MCBrZXlpbnRfbWluPTEwIHNjZW5lY3V0PTQwIGludHJhX3JlZnJlc2g9MCByY19sb29rYWhlYWQ9NDAgcmM9Y3JmIG1idHJlZT0xIGNyZj0yMy4wIHFjb21wPTAuNjAgcXBtaW49MCBxcG1heD02OSBxcHN0ZXA9NCBpcF9yYXRpbz0xLjQwIGFxPTE6MS4wMACAAAAAFGWIhAAR//73iB8yy2+catdqphTfAAAACUGaJGxBD/6rgAAAAAhBnkJ4h39GwQAAAAgBnmF0Q39MQAAAAAgBnmNqQ39MQQAAAA9BmmhJqEFomUwId//+q4EAAAAKQZ6GRREsO/9GwQAAAAgBnqV0Q39MQQAAAAgBnqdqQ39MQAAAAA5BmqlJqEFsmUwIb//+qw==';
