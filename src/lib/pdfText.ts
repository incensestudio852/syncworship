'use client';

/**
 * Extracts the PDF's own text layer, arranged into reading order.
 *
 * Many published chord sheets are vector PDFs with real text (三一神 was
 * `|G |G |Em |Am` / `三 一 神 我 要 深 愛 你`). Reading that text is exact and
 * instant, while OCR on the same page introduces errors. So we always try the
 * text layer first and only OCR when it is empty (scans, images).
 */
export type TextLayerResult = {
  text: string;
  pages: number;
  /** true when at least one page had usable text */
  usable: boolean;
};

type TextItem = { str: string; transform: number[] };

export async function extractPdfText(file: File): Promise<TextLayerResult> {
  const { pdfjs, pdfDocOptions } = await import('./pdfjsClient');
  const buf = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjs.getDocument(pdfDocOptions(buf));

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch {
    return { text: '', pages: 0, usable: false };
  }

  const perPage: string[] = [];
  try {
    for (let p = 1; p <= Math.min(doc.numPages, 5); p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const rows = new Map<number, { x: number; s: string }[]>();
      for (const raw of content.items as TextItem[]) {
        if (!raw.str || !raw.str.trim()) continue;
        // Group into visual lines: round the baseline y to absorb jitter.
        const y = Math.round(raw.transform[5] / 4) * 4;
        const list = rows.get(y) ?? [];
        list.push({ x: raw.transform[4], s: raw.str });
        rows.set(y, list);
      }
      const lines = [...rows.keys()]
        .sort((a, b) => b - a) // top of page first
        .map((y) =>
          rows
            .get(y)!
            .sort((a, b) => a.x - b.x)
            .map((o) => o.s)
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim(),
        )
        .filter(Boolean);
      perPage.push(lines.join('\n'));
    }
  } finally {
    await loadingTask.destroy().catch(() => {});
  }

  // NFKC folds Kangxi radicals (U+2F00 ⼀) into unified ideographs (U+4E00 一).
  // Text layers emit the former, which breaks search and duplicate matching.
  const text = perPage.join('\n\n').normalize('NFKC').trim();
  // A handful of characters (a copyright line, a page number) is not usable
  // text — a real chart yields dozens. Treat those as "scan" and OCR instead.
  return { text, pages: perPage.length, usable: text.replace(/\s/g, '').length >= 40 };
}
