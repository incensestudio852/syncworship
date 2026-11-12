'use client';

/**
 * Single pdf.js entry point.
 *
 * Shared by rendering (pdfRender.ts) and text extraction (pdfText.ts) so the
 * worker, CMap tables and standard fonts are configured in exactly one place.
 * Misconfiguring any of these makes CJK pages render blank or garbled.
 */
import * as pdfjs from 'pdfjs-dist';

let configured = false;
let worker: ReturnType<typeof pdfjs.PDFWorker.create> | null = null;

/** pdf.js 5/6 ships an ES-module worker; a classic worker dies on import.meta. */
export function getPdfWorker() {
  if (worker) return worker;
  const port = new Worker('/pdf.worker.min.mjs', { type: 'module' });
  worker = pdfjs.PDFWorker.create({ port });
  configured = true;
  return worker;
}

export function isPdfWorkerConfigured() {
  return configured;
}

export function disposePdfWorker() {
  if (!worker) return;
  void worker.destroy();
  worker = null;
  configured = false;
}

/** getDocument options that every caller should use. */
export function pdfDocOptions(data: Uint8Array) {
  return {
    data,
    worker: getPdfWorker(),
    cMapUrl: '/cmaps/',
    cMapPacked: true,
    standardFontDataUrl: '/standard_fonts/',
    // Scanned sheets are often JBIG2 (and sometimes JPEG2000). Both need the
    // decoders from /wasm or the page comes out blank with no error.
    wasmUrl: '/wasm/',
  };
}

export { pdfjs };
