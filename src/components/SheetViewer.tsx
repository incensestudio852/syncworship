'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileWarning } from 'lucide-react';
import { Button } from './ui';

/**
 * Page-image viewer: flip buttons + swipe, preloads page n+1.
 * Sits inside a fixed-height flex area so page images letterbox.
 */
export function SheetViewer({
  urls,
  pageNumbers,
  dark,
  onPageChange,
  className = '',
}: {
  urls: Map<string, string>;
  pageNumbers: string[]; // ordered storage paths
  dark?: boolean;
  onPageChange?: (index: number, total: number) => void;
  className?: string;
}) {
  const [index, setIndex] = useState(0);
  const total = pageNumbers.length;
  const startX = useRef<number | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (index > total - 1) setIndex(Math.max(0, total - 1));
  }, [total, index]);

  useEffect(() => {
    onPageChange?.(index, total);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, total]);

  const go = (delta: number) => setIndex((i) => Math.min(Math.max(i + delta, 0), total - 1));

  const currentPath = pageNumbers[index];
  const currentUrl = currentPath ? urls.get(currentPath) : undefined;
  const nextUrl = pageNumbers[index + 1] ? urls.get(pageNumbers[index + 1]) : undefined;

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
  };
  const onTouchEnd = (e: React.TouchEvent) => {
    if (startX.current == null) return;
    const dx = e.changedTouches[0].clientX - startX.current;
    startX.current = null;
    if (Math.abs(dx) > 55) go(dx < 0 ? 1 : -1);
  };

  if (total === 0) {
    return (
      <div className={`grid place-items-center text-sm text-[var(--muted-fg)] ${className}`}>
        <div className="flex flex-col items-center gap-2">
          <FileWarning size={22} />
          <span>此詩歌沒有樂譜影像</span>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`relative flex min-h-0 flex-1 flex-col ${className}`}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-1">
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={currentUrl}
            src={currentUrl}
            alt={`樂譜第 ${index + 1} 頁`}
            className={`sheet-img max-h-full max-w-full select-none object-contain rounded-md ${
              dark ? 'bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'bg-white shadow-sm'
            }`}
            draggable={false}
          />
        ) : (
          <div className="text-sm text-[var(--muted-fg)]">載入第 {index + 1} 頁…</div>
        )}
        {nextUrl ? <link rel="preload" as="image" href={nextUrl} /> : null}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {nextUrl ? <img src={nextUrl} alt="" className="hidden" aria-hidden /> : null}

        {total > 1 ? (
          <>
            <button
              onClick={() => go(-1)}
              disabled={index === 0}
              aria-label="上一頁"
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur transition-opacity disabled:opacity-0 sm:left-3"
            >
              <ChevronLeft size={22} />
            </button>
            <button
              onClick={() => go(1)}
              disabled={index >= total - 1}
              aria-label="下一頁"
              className="absolute right-1 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur transition-opacity disabled:opacity-0 sm:right-3"
            >
              <ChevronRight size={22} />
            </button>
          </>
        ) : null}
      </div>

      {total > 1 ? (
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="ghost" size="sm" onClick={() => go(-1)} disabled={index === 0}>
            <ChevronLeft size={14} /> 上一頁
          </Button>
          <span className="min-w-16 text-center font-mono text-xs text-[var(--muted-fg)]">
            {index + 1} / {total}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => go(1)}
            disabled={index >= total - 1}
          >
            下一頁 <ChevronRight size={14} />
          </Button>
        </div>
      ) : null}
    </div>
  );
}
