'use client';

import { useMemo } from 'react';
import { Check } from 'lucide-react';
import { OCR_LANGUAGES, DEFAULT_OCR_LANGS, type OcrLangId } from '@/config';

/**
 * OCR language picker.
 *
 * A checkbox row rather than auto-detection: Tesseract's language detection is
 * unreliable on sparse lyric pages, and a wrong guess silently degrades OCR.
 * The cost shown is the traineddata the user downloads once per language.
 */
export function LanguagePicker({
  value,
  onChange,
  disabled,
}: {
  value: readonly OcrLangId[];
  onChange: (next: OcrLangId[]) => void;
  disabled?: boolean;
}) {
  const totalMb = useMemo(() => {
    const bytes = OCR_LANGUAGES.filter((l) => value.includes(l.id as OcrLangId)).reduce(
      (sum, l) => sum + l.bytes,
      0,
    );
    return (bytes / 1e6).toFixed(1);
  }, [value]);

  const toggle = (id: OcrLangId) => {
    if (disabled) return;
    if (value.includes(id)) {
      // Never allow zero languages — the worker needs at least one.
      if (value.length === 1) return;
      onChange(value.filter((v) => v !== id));
    } else {
      onChange([...value, id]);
    }
  };

  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {OCR_LANGUAGES.map((lang) => {
          const id = lang.id as OcrLangId;
          const on = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              onClick={() => toggle(id)}
              disabled={disabled}
              aria-pressed={on}
              className={`flex min-h-[36px] items-center gap-1 rounded-lg border px-2.5 text-xs transition-colors disabled:opacity-60 ${
                on
                  ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
                  : 'border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--soft)]'
              }`}
            >
              {on ? <Check size={11} /> : null}
              {lang.label}
            </button>
          );
        })}
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--muted-fg)]">
        首次辨識需下載約 {totalMb}MB 語言資料，之後會快取。
        {value.length === DEFAULT_OCR_LANGS.length &&
        value.every((v) => DEFAULT_OCR_LANGS.includes(v))
          ? ' 目前為預設組合。'
          : ''}
      </p>
    </div>
  );
}
