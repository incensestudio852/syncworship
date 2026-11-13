'use client';

import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, FileWarning, Maximize2, Minus, Plus } from 'lucide-react';
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

  /**
   * Zoom is stored as a multiplier of the fitted size, so 1 means "fill the
   * available area" at any window size. Capped at 3x: past that the image is
   * upscaled beyond its rendered resolution and only gets blurry.
   */
  const ZOOM_MIN = 1;
  const ZOOM_MAX = 3;
  const ZOOM_STEP = 0.25;
  const [zoom, setZoom] = useState(1);
  /** Natural size that fills the viewport at zoom 1, measured from the image. */
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);

  // Reset when the song or page changes so the next sheet opens fitted, and
  // drop the cached measurement — reusing the previous page's size would scale
  // a differently-shaped page from the wrong baseline.
  useEffect(() => {
    setZoom(1);
    setFit(null);
  }, [pageNumbers[0], index]);

  const clamp = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * 100) / 100));
  const zoomBy = (d: number) => setZoom((z) => clamp(z + d));

  /** Ctrl/⌘ + wheel, the gesture people already use on sheet readers. */
  const onWheel = (e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    zoomBy(e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP);
  };
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
      <div
        className={`relative flex min-h-0 flex-1 items-center justify-center p-1 ${
          zoom > 1 ? 'overflow-auto' : 'overflow-hidden'
        }`}
        onWheel={onWheel}
      >
        {currentUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={currentUrl}
            ref={imgRef}
            src={currentUrl}
            alt={`樂譜第 ${index + 1} 頁`}
            onLoad={(e) => {
              const r = e.currentTarget.getBoundingClientRect();
              setFit({ w: r.width, h: r.height });
            }}
            // Zoom scales the ALREADY-FITTED box rather than setting a
            // percentage width. A percentage width alone left max-height in
            // charge, so the image grew wider but object-contain shrank the
            // artwork back to the same visible size — only the padding changed.
            style={
              zoom > 1 && fit
                ? { width: fit.w * zoom, height: fit.h * zoom, maxWidth: 'none', maxHeight: 'none' }
                : undefined
            }
            className={`sheet-img select-none object-contain rounded-md ${
              zoom > 1 ? '' : 'max-h-full max-w-full'
            } ${dark ? 'bg-white shadow-[0_0_0_1px_rgba(255,255,255,0.08)]' : 'bg-white shadow-sm'}`}
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
              className="absolute left-1 top-1/2 -translate-y-1/2 rounded-full bg-black/35 p-2 text-white backdrop-blur transition-opacity disabled:opacity-0 sm:left-3 [@media(pointer:fine)]:left-11"
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

        {/* Zoom rail: pinned to the left edge like a sheet-music reader.
            `pointer-fine` keeps it off phones and iPads, where the sheet is
            already edge-to-edge and a rail would cover the music. */}
        <div className="pointer-events-auto absolute left-1 top-1/2 z-10 hidden -translate-y-1/2 flex-col items-center gap-0.5 rounded-full bg-black/40 p-1 text-white shadow-lg backdrop-blur [@media(pointer:fine)]:flex">
          <button
            onClick={() => zoomBy(ZOOM_STEP)}
            disabled={zoom >= ZOOM_MAX}
            aria-label="放大"
            title="放大（Ctrl + 滾輪亦可）"
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30"
          >
            <Plus size={15} />
          </button>
          <span className="min-w-7 py-0.5 text-center font-mono text-[10px] tabular-nums leading-none opacity-90">
            {Math.round(zoom * 100)}%
          </span>
          <button
            onClick={() => zoomBy(-ZOOM_STEP)}
            disabled={zoom <= ZOOM_MIN}
            aria-label="縮小"
            title="縮小（Ctrl + 滾輪亦可）"
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30"
          >
            <Minus size={15} />
          </button>
          <span className="my-0.5 h-px w-4 bg-white/25" />
          <button
            onClick={() => setZoom(1)}
            disabled={zoom === 1}
            aria-label="重設縮放"
            title="重設為填滿"
            className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/20 disabled:opacity-30"
          >
            <Maximize2 size={14} />
          </button>
        </div>
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
