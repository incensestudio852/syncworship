'use client';

import { useEffect, useRef, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { CFG } from '@/config';
import { Button, Input } from './ui';

type Props = {
  open: boolean;
  initialName?: string;
  title?: string;
  onSave: (name: string) => void;
  onSkip?: () => void;
};

/**
 * First-run device naming. Replaces window.prompt(), which blocks the main
 * thread entirely on mobile Safari and refuses to render inside a PWA.
 */
export function DeviceNamePrompt({ open, initialName = '', title, onSave, onSkip }: Props) {
  const [name, setName] = useState(initialName);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    setName(initialName);
    const t = window.setTimeout(() => inputRef.current?.focus(), 60);
    return () => window.clearTimeout(t);
  }, [open, initialName]);

  if (!open) return null;

  const submit = () => {
    const v = name.trim().slice(0, 24);
    if (!v) return;
    onSave(v);
  };

  return (
    <div
      className="fixed inset-0 z-[180] grid place-items-center bg-black/55 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="為這部裝置命名"
    >
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-2xl">
        <div className="mb-3 flex items-center gap-2 text-base font-semibold">
          <Smartphone size={17} className="text-[var(--accent)]" />
          {title ?? '為這部裝置命名'}
        </div>
        <p className="mb-3 text-[12px] leading-relaxed text-[var(--muted-fg)]">
          名稱會顯示在舞台上的「由 ___ 推送」，讓大家知道是哪一部裝置在操作。
        </p>
        <Input
          ref={inputRef}
          value={name}
          maxLength={24}
          onChange={(e) => setName(e.target.value)}
          placeholder="例如：台上 iPad"
          onKeyDown={(e) => {
            if (e.key === 'Enter') submit();
          }}
        />
        <div className="mt-4 flex justify-end gap-2">
          {onSkip ? (
            <Button variant="ghost" onClick={onSkip}>
              稍後再說
            </Button>
          ) : null}
          <Button variant="primary" onClick={submit} disabled={!name.trim()}>
            儲存
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Read the stored device name without ever prompting. */
export function storedDeviceName(): string | null {
  if (typeof window === 'undefined') return null;
  const v = window.localStorage.getItem(CFG.DEVICE_NAME_KEY);
  return v && v.trim() ? v.trim() : null;
}

/** Guess a sensible default label from the UA. */
export function guessDeviceName(): string {
  if (typeof navigator === 'undefined') return '裝置';
  const ua = navigator.userAgent;
  if (/iPad|Macintosh.*Mobile|Tablet/i.test(ua)) return 'iPad';
  if (/iPhone/i.test(ua)) return 'iPhone';
  if (/Android/i.test(ua)) return 'Android';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'Mac';
  if (/Windows/i.test(ua)) return 'Windows';
  return '裝置';
}
