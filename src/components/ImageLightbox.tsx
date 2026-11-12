'use client';

import { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

/**
 * Lightbox for the pages about to be uploaded.
 *
 * Uploading a sheet is irreversible (the original PDF is never kept), so the
 * user must be able to check the converted page images first — a blank or
 * half-rendered page is otherwise only discovered after saving.
 */
export function ImageLightbox({
  pages,
  index,
  onClose,
  onIndexChange,
}: {
  pages: { url: string; page: number }[];
  index: number;
  onClose: () => void;
  onIndexChange: (i: number) => void;
}) {
  const [i, setI] = useState(index);
  const total = pages.length;

  useEffect(() => {
    setI(index);
  }, [index]);

  const go = (delta: number) => {
    const next = Math.min(Math.max(i + delta, 0), total - 1);
    setI(next);
    onIndexChange(next);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      else if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
    };
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i, total]);

  if (!total) return null;
  const current = pages[i];

  return (
    <div
      className="fixed inset-0 z-[190] flex flex-col bg-black/85 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label="預覽上傳頁面"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="flex shrink-0 items-center justify-between px-4 py-3 text-white">
        <span className="text-sm">
          第 {i + 1} / {total} 頁
          <span className="ml-2 text-[11px] text-white/60">確認無誤後再儲存</span>
        </span>
        <button
          onClick={onClose}
          className="rounded-full p-1.5 hover:bg-white/15"
          aria-label="關閉預覽"
        >
          <X size={18} />
        </button>
      </div>

      <div className="relative flex min-h-0 flex-1 items-center justify-center p-2">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={current.url}
          alt={`第 ${current.page} 頁預覽`}
          className="max-h-full max-w-full rounded bg-white object-contain shadow-2xl"
        />
        {total > 1 ? (
          <>
            <button
              onClick={() => go(-1)}
              disabled={i === 0}
              className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white disabled:opacity-25"
              aria-label="上一頁"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={() => go(1)}
              disabled={i >= total - 1}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/50 p-2.5 text-white disabled:opacity-25"
              aria-label="下一頁"
            >
              <ChevronRight size={22} />
            </button>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex shrink-0 justify-center gap-1.5 px-4 py-3">
          {pages.map((p, n) => (
            <button
              key={p.url}
              onClick={() => {
                setI(n);
                onIndexChange(n);
              }}
              className={`h-1.5 rounded-full transition-all ${
                n === i ? 'w-6 bg-white' : 'w-1.5 bg-white/40'
              }`}
              aria-label={`第 ${n + 1} 頁`}
            />
          ))}
        </div>
      ) : (
        <div className="h-3 shrink-0" />
      )}
    </div>
  );
}
