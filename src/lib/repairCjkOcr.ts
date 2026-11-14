/**
 * Fix characters Tesseract reliably gets wrong in Traditional-Chinese hymns.
 *
 * 祢 (U+7962, "You" addressed to God) is the single worst offender. It is rare
 * in general text, so the chi_tra model has little training data for it and
 * substitutes a nearby, far more common glyph — usually 禰 (a variant) or 你.
 * Worshippers notice immediately, because the word appears in nearly every song.
 *
 * The repair is deliberately narrow. It only rewrites glyphs that are provably
 * the SAME WORD or not words at all — 禰 and 襧 are the traditional variant and
 * a 衤-radical misprint of 祢, so mapping them back is lossless. It never
 * rewrites 你 or 祂: those are different words, they are frequently correct, and
 * guessing from context (試過) mis-converted lyrics where 你/祢 both appear.
 * A wrong 你 stays wrong and the user can fix it; a destroyed 你 cannot be seen.
 */

/** Glyphs that mean (or misprint) 祢, mapped back to the standard form. */
const NI_VARIANTS: Record<string, string> = {
  '禰': '祢', // traditional variant of 祢
  '襧': '祢', // 衤 radical instead of 礻
  '祙': '祢', // 末 misread for 尔
};

/**
 * Repair 祢-family substitutions.
 *
 * Lossless by design: every entry maps to the same word, so this cannot damage
 * a lyric that was already correct.
 */
export function repairCjkOcr(text: string): string {
  let out = text;
  for (const [bad, good] of Object.entries(NI_VARIANTS)) {
    if (!out.includes(bad)) continue;
    out = out.split(bad).join(good);
  }
  return out;
}
