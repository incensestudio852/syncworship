'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';
type Toast = { id: number; kind: ToastKind; text: string };

const ToastCtx = createContext<{ toast: (text: string, kind?: ToastKind) => void }>({
  toast: () => {},
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Toast[]>([]);

  const toast = useCallback((text: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setItems((prev) => [...prev, { id, kind, text }]);
    window.setTimeout(() => setItems((prev) => prev.filter((t) => t.id !== id)), 4200);
  }, []);

  const value = useMemo(() => ({ toast }), [toast]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      {/* bottom-20 clears the stage's 56px control bar; toasts used to cover it */}
      <div className="pointer-events-none fixed inset-x-0 bottom-[72px] z-[200] flex flex-col items-center gap-2 px-3 sm:bottom-28 sm:px-4">
        {items.map((t) => (
          <div
            key={t.id}
            className="pointer-events-auto flex w-full max-w-md items-start gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-4 py-3 text-sm shadow-xl"
          >
            <span className="mt-0.5 shrink-0">
              {t.kind === 'success' ? (
                <CheckCircle2 size={16} className="text-emerald-500" />
              ) : t.kind === 'error' ? (
                <AlertTriangle size={16} className="text-rose-500" />
              ) : (
                <Info size={16} className="text-sky-500" />
              )}
            </span>
            <span className="flex-1 leading-snug">{t.text}</span>
            <button
              onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
              className="grid h-7 w-7 shrink-0 place-items-center rounded text-[var(--muted-fg)] opacity-60 hover:opacity-100"
              aria-label="關閉"
            >
              <X size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);

/**
 * Fire 已重新同步至最新 once per resync burst.
 *
 * A page can hold two realtime channels (live_state + list_items) and both
 * resync on SUBSCRIBE, so a naive effect shows the toast twice. Coalescing on
 * a short window keeps it to one message per reconnect.
 */
export function useResyncToast(trigger: number, text = '已重新同步至最新') {
  const { toast } = useToast();
  const lastFired = useRef(0);
  useEffect(() => {
    if (trigger <= 0) return;
    const now = Date.now();
    if (now - lastFired.current < 1500) return; // same burst
    lastFired.current = now;
    toast(text, 'success');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trigger]);
}
