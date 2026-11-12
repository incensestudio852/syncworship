'use client';

import { CFG } from '@/config';
import { canvasToWebp } from './imageProcess';

// Static import on purpose: pdfjs-dist is an ESM package whose namespace must be
// resolved once. A dynamic import() here produced a namespace whose bindings
// were still undefined at use time (GlobalWorkerOptions vanished), which made
// every PDF import stall at "讀取檔案中…". webpack still puts this library in
// its own async chunk, so routes that don't render PDFs never download it.
import { pdfjs, pdfDocOptions, getPdfWorker, disposePdfWorker as disposeWorker } from './pdfjsClient';
import type { PDFDocumentProxy } from 'pdfjs-dist';

/** Human-readable mapping for the failure modes this flow actually hits. */
function describePdfError(e: unknown): string {
  const name = (e as { name?: string })?.name ?? '';
  const msg = (e as { message?: string })?.message ?? String(e);
  if (name === 'PasswordException') return '此 PDF 有密碼保護，無法轉換。';
  if (name === 'InvalidPDFException') return '檔案不是有效的 PDF，或已損壞。';
  if (/import\.meta|module/i.test(msg)) return '瀏覽器不支援模組化 Worker，請更新瀏覽器。';
  return msg;
}

export type PdfProgress = (done: number, total: number) => void;

export type PdfRenderResult = {
  pages: Blob[];
  totalPages: number;
  truncated: boolean;
};

/**
 * Renders a PDF to WebP page blobs entirely in the browser. The original file
 * is never uploaded or persisted anywhere.
 */
export async function renderPdfToWebp(
  file: File,
  onProgress?: PdfProgress,
  maxPages = CFG.PDF_MAX_PAGES,
): Promise<PdfRenderResult> {
  const buf = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument(pdfDocOptions(buf));
  let doc: PDFDocumentProxy;
  try {
    doc = await loadingTask.promise;
  } catch (e) {
    throw new Error(describePdfError(e));
  }
  const totalPages = doc.numPages;
  const toRender = Math.min(totalPages, maxPages);
  const pages: Blob[] = [];

  try {
    for (let p = 1; p <= toRender; p++) {
      const page = await doc.getPage(p);
      // Cap very large pages so a 150-DPI A0 sheet doesn't blow memory.
      const base = page.getViewport({ scale: CFG.PDF_RENDER_SCALE });
      const capScale = Math.min(1, (CFG.IMAGE_MAX_WIDTH * 2.2) / base.width);
      const viewport = page.getViewport({ scale: CFG.PDF_RENDER_SCALE * capScale });

      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d', { alpha: false });
      if (!ctx) throw new Error('瀏覽器不支援 Canvas');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({ canvas, canvasContext: ctx, viewport }).promise;
      const blob = await canvasToWebp(canvas, canvas.width, canvas.height);
      pages.push(blob);

      // release per-page memory
      canvas.width = 0;
      canvas.height = 0;
      page.cleanup();
      onProgress?.(p, toRender);
    }
  } finally {
    // Destroy the loading task (not the worker) so each import starts clean
    // while the expensive worker stays warm for the next file.
    await loadingTask.destroy().catch(() => {});
  }

  return { pages, totalPages, truncated: totalPages > maxPages };
}

/** Release the shared worker (call when leaving the CMS page). */
export function disposePdfWorker() {
  disposeWorker();
}
