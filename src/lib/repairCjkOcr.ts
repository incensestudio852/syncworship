/**
 * Characters Tesseract reliably gets wrong in Traditional-Chinese hymns.
 *
 * 祢 (U+7962, "You" addressed to God) is the worst offender. It is rare in
 * general text, so the chi_tra model has little training data for it and
 * substitutes a nearby, more common glyph that shares the 礻 radical:
 *
 *   祁 U+7941 — a surname/place name, visually close to 祢
 *   禰 U+79B0 — the traditional variant of 祢 (same word)
 *   襧 U+8967 — 衤 radical instead of 礻
 *
 * In a lyric these substitutions are never intended, so mapping them back is
 * safe. The map is deliberately tight: it does NOT touch 你 or 祂. Both are real
 * words that appear correctly in the same songs, and guessing from context
 * mis-converted lyrics where the two were used side by side.
 */

/** Damage -> intended character. Only entries that cannot be right in a lyric. */
const SUBSTITUTIONS: Record<string, string> = {
  '祁': '祢',
  '禰': '祢',
  '襧': '祢',
  '祙': '祢',
};

/**
 * Repair 祢-family OCR substitutions.
 *
 * Applied to recognised text before it reaches the lyrics field, so the stored
 * song is already correct and nothing has to be fixed by hand later.
 */
export function repairCjkOcr(text: string): string {
  let out = text;
  for (const [bad, good] of Object.entries(SUBSTITUTIONS)) {
    if (!out.includes(bad)) continue;
    out = out.split(bad).join(good);
  }
  return out;
}
