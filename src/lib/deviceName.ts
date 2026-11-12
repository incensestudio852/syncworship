'use client';

/**
 * Device identity. Everyone shares one Supabase account, so the "who pushed
 * this" label is a locally chosen name.
 *
 * IMPORTANT: never use window.prompt() here. On mobile Safari and in standalone
 * PWAs it blocks the main thread, and it stalls the whole page until dismissed.
 * The UI asks via <DeviceNamePrompt />; this module only reads/writes storage.
 */

import { CFG } from '@/config';

export function getDeviceName(): string | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(CFG.DEVICE_NAME_KEY);
  return v && v.trim() ? v.trim() : null;
}

export function setDeviceName(name: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(CFG.DEVICE_NAME_KEY, name.trim().slice(0, 24));
}

/** Fallback label used when a push happens before the device has been named. */
export function fallbackDeviceName(): string {
  if (typeof navigator === 'undefined') return '裝置';
  const ua = navigator.userAgent;
  if (/iPad|Macintosh.*Mobile|Tablet/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return '裝置';
}

export function resolveDeviceName(): string {
  return getDeviceName() ?? fallbackDeviceName();
}
