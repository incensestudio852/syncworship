'use client';

import { DEFAULT_OCR_LANGS, toTesseractLangs, type OcrLangId } from '@/config';

type Worker = {
  recognize: (img: Blob) => Promise<{ data: { text: string; confidence: number } }>;
  terminate: () => Promise<unknown>;
};

/**
 * One worker per language set.
 *
 * Languages are NOT interchangeable at runtime: a worker created for
 * chi_tra+eng cannot recognise Japanese. Caching by the joined language string
 * means switching languages re-creates the worker (and downloads that
 * traineddata), while re-OCR in the same language stays instant.
 */
const workers = new Map<string, Promise<{ langs: string; worker: Worker }>>();

async function getWorker(langs: string) {
  const cached = workers.get(langs);
  if (cached) return cached;

  const created = (async () => {
    const { createWorker } = await import('tesseract.js');
    const worker = (await createWorker(langs.split('+'), 1, {
      workerPath: '/tesseract/worker.min.js',
      corePath: '/tesseract-core',
      langPath: '/tessdata',
      gzip: true,
      cacheMethod: 'none',
      workerBlobURL: true,
      logger: () => {},
    })) as unknown as Worker;
    return { langs, worker };
  })();

  workers.set(langs, created);
  return created;
}

export type OcrOutcome = { text: string; error?: string };

/**
 * OCR a single page image.
 * Result is a *suggestion* — chord charts and handwriting are unreliable.
 */
export async function ocrImage(
  blob: Blob,
  langIds: readonly OcrLangId[] = DEFAULT_OCR_LANGS,
): Promise<OcrOutcome> {
  try {
    // Tesseract needs decodable bytes, not a canvas draw. If a caller passes a
    // blob whose pixels came from a cross-origin image the decode fails with an
    // empty result (conf 0), which looks like "OCR found nothing".
    if (!blob || blob.size === 0) {
      return { text: '', error: '圖片為空' };
    }
    const langs = toTesseractLangs(langIds);
    const { worker } = await getWorker(langs);
    const { data } = await worker.recognize(blob);
    if (!data.text.trim() && data.confidence === 0) {
      return { text: '', error: '未能讀取影像內容（可能是空白頁或語言不符）' };
    }
    return { text: normaliseOcr(data.text ?? '') };
  } catch (e) {
    return { text: '', error: e instanceof Error ? e.message : String(e) };
  }
}

/** Terminate every cached worker (call when leaving the CMS). */
export function terminateOcr() {
  for (const p of workers.values()) {
    p.then(({ worker }) => worker.terminate().catch(() => {})).catch(() => {});
  }
  workers.clear();
}

/**
 * Normalise raw OCR text.
 *
 * Whitespace handling differs by script: Latin and Korean lyrics need their
 * word spaces intact, while Tesseract inserts a space between every CJK glyph
 * that must be removed (it would otherwise break chord anchoring and display).
 */
function normaliseOcr(raw: string): string {
  return raw
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => {
      const collapsed = line.replace(/\s+/g, ' ').trim();
      // Only strip inter-glyph spaces when the line is predominantly CJK.
      const cjk = (collapsed.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) ?? []).length;
      const letters = (collapsed.match(/[A-Za-z\uac00-\ud7af]/g) ?? []).length;
      if (cjk === 0 || letters > cjk) return collapsed;
      return collapsed
        .replace(/(?<=[\u4e00-\u9fff\u3040-\u30ff])\s+(?=[\u4e00-\u9fff\u3040-\u30ff])/g, '')
        .trim();
    })
    .filter((l) => l.length > 0)
    .join('\n')
    .replace(/[ \t]+(?=[，。、！？：；])/g, '')
    .trim();
}
