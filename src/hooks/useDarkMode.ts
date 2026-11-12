'use client';

import { useCallback, useEffect, useState } from 'react';
import { CFG } from '@/config';

/** Persisted dark mode. Defaults to light; applies `dark` class on <html>. */
export function useDarkMode() {
  const [dark, setDark] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem(CFG.DARK_MODE_KEY);
    const initial = stored === '1';
    setDark(initial);
    apply(initial);
    setReady(true);
  }, []);

  const toggle = useCallback(() => {
    setDark((prev) => {
      const next = !prev;
      window.localStorage.setItem(CFG.DARK_MODE_KEY, next ? '1' : '0');
      apply(next);
      return next;
    });
  }, []);

  const set = useCallback((v: boolean) => {
    window.localStorage.setItem(CFG.DARK_MODE_KEY, v ? '1' : '0');
    apply(v);
    setDark(v);
  }, []);

  return { dark, toggle, set, ready };
}

function apply(dark: boolean) {
  const el = document.documentElement;
  el.classList.toggle('dark', dark);
  el.style.colorScheme = dark ? 'dark' : 'light';
}

/** Read-only variant for pages that shouldn't own the toggle. */
export function useIsDark() {
  const [dark, setDark] = useState(false);
  useEffect(() => {
    setDark(document.documentElement.classList.contains('dark'));
    const mo = new MutationObserver(() => setDark(document.documentElement.classList.contains('dark')));
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => mo.disconnect();
  }, []);
  return dark;
}
