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

/**
 * Hardware class, guessed from the user agent.
 *
 * iPadOS 13+ reports itself as "Macintosh", so a touch-capable "Mac" is an iPad.
 * The order matters: check touch before the generic Mac case.
 */
export function deviceType(): string {
  if (typeof navigator === 'undefined') return '裝置';
  const ua = navigator.userAgent;
  const touch = (navigator.maxTouchPoints ?? 0) > 1;
  if (/iPad/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Macintosh/i.test(ua) && touch) return 'iPad'; // iPadOS desktop-mode UA
  if (/Android/i.test(ua)) return /Mobile/i.test(ua) ? 'Android 手機' : 'Android 平板';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return '裝置';
}

/**
 * Short per-device code, e.g. "7K2F".
 *
 * Two iPads in the same room need distinguishable labels, and the device type
 * alone cannot do that. Ambiguous glyphs (0/O, 1/I/L) are excluded so the code
 * reads cleanly when spoken aloud or written on a sticky note. The value is
 * generated once and kept in localStorage, so a device keeps its code across
 * reloads and deploys.
 */
const CODE_KEY = 'worship_device_code';
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';

function deviceCode(): string {
  if (typeof window === 'undefined') return '';
  try {
    const existing = window.localStorage.getItem(CODE_KEY);
    if (existing && /^[A-Z0-9]{4}$/.test(existing)) return existing;
    const bytes = new Uint8Array(4);
    crypto.getRandomValues(bytes);
    const code = [...bytes].map((b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
    window.localStorage.setItem(CODE_KEY, code);
    return code;
  } catch {
    return '';
  }
}

/**
 * The name a device reports when nobody has set one, e.g. "iPad 7K2F".
 * Used both for pushes and as the default in the settings field.
 */
export function fallbackDeviceName(): string {
  const type = deviceType();
  const code = deviceCode();
  return code ? `${type} ${code}` : type;
}

export function resolveDeviceName(): string {
  return getDeviceName() ?? fallbackDeviceName();
}
