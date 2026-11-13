// All tunables live here. Storage/free-tier pressure is controlled by IMAGE_*.
export const CFG = {
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024, // 10 MB, enforced client + bucket
  IMAGE_MAX_WIDTH: 1100, // px, applied to all WebP output
  IMAGE_QUALITY: 80, // WebP quality
  PDF_MAX_PAGES: 30, // hard cap per PDF
  PDF_RENDER_SCALE: 2, // pdf.js scale ≈150 DPI
  OCR_LANGS: 'eng+chi_tra+chi_sim', // legacy default; see OCR_LANGUAGES below
  SEARCH_DEBOUNCE_MS: 250,
  SEARCH_LIMIT: 20,
  SIGNED_URL_TTL_SECONDS: 60 * 60, // 1h, re-signed on read
  DEVICE_NAME_KEY: 'worship_device_name',
  DARK_MODE_KEY: 'worship_dark_mode',
} as const;

/**
 * OCR languages the CMS offers.
 *
 * `tesseract` is the Tesseract language code; `bytes` is the approximate
 * traineddata size, because the user pays that on first use per language
 * (cached afterwards). Keep the default set small.
 */
export const OCR_LANGUAGES = [
  { id: 'chi_tra', label: '繁中', tesseract: 'chi_tra', bytes: 1.6e6, default: true },
  { id: 'chi_sim', label: '简中', tesseract: 'chi_sim', bytes: 1.6e6, default: false },
  { id: 'eng', label: 'English', tesseract: 'eng', bytes: 2.8e6, default: false },
  { id: 'jpn', label: '日本語', tesseract: 'jpn', bytes: 1.9e6, default: false },
  { id: 'kor', label: '한국어', tesseract: 'kor', bytes: 1.5e6, default: false },
  { id: 'tha', label: 'ไทย', tesseract: 'tha', bytes: 0.9e6, default: false },
] as const;

export type OcrLangId = (typeof OCR_LANGUAGES)[number]['id'];

export const DEFAULT_OCR_LANGS: OcrLangId[] = OCR_LANGUAGES.filter((l) => l.default).map(
  (l) => l.id as OcrLangId,
);

/** Resolve ids -> Tesseract language string, always including English. */
export function toTesseractLangs(ids: readonly string[]): string {
  const valid = OCR_LANGUAGES.filter((l) => ids.includes(l.id)).map((l) => l.tesseract);
  if (!valid.length) return DEFAULT_OCR_LANGS.map((id) => {
    const l = OCR_LANGUAGES.find((x) => x.id === id);
    return l ? l.tesseract : 'eng';
  }).join('+');
  return valid.join('+');
}

/** Human label list for display ("繁中 · English"). */
export function langLabels(ids: readonly string[]): string {
  const labels = OCR_LANGUAGES.filter((l) => ids.includes(l.id)).map((l) => l.label);
  return labels.join(' · ');
}

export const COPY = {
  appName: 'Sync Worship',
  uploadTooBig: '檔案超過 10MB，請壓縮後再上傳。',
  noOriginalPdf: '本系統不保留原始 PDF，請自行備份原檔。',
  resynced: '已重新同步至最新',
  reconnecting: '重新連線中…',
  offline: '離線中，暫停同步',
  ocrRunning: '辨識中…',
  confirmRequired: '請確認',
} as const;
