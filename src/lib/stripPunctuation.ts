/**
 * Replace every punctuation character with a single space.
 *
 * OCR on chord charts produces a lot of noise — stray bars, quotes, brackets and
 * printer artefacts — which reads as clutter in the lyrics field. Punctuation
 * carries little meaning for lyrics display, and worshipping from the field is
 * easier without it.
 *
 * Chord markers are the exception: `[G]`, `[Am7]`, `[D/F#]` must survive, because
 * they are the chord data itself. The converter runs BEFORE this, so brackets
 * here are already chord markers only.
 *
 * Also collapses the runs of spaces this creates, and drops whitespace at the
 * end of lines, so the result stays tidy.
 */
export function stripPunctuation(text: string): string {
  // Protect chord tokens, then restore them afterwards.
  const chords: string[] = [];
  const masked = text.replace(/\[[^\]]*\]/g, (m) => {
    chords.push(m);
    return `\u0000${chords.length - 1}\u0000`;
  });

  const cleaned = masked
    // Unicode punctuation (P*), symbols that OCR emits as noise (S*), and the
    // ASCII marks people actually type. Keep letters, digits and whitespace.
    .replace(/[\p{P}\p{S}]/gu, ' ')
    // Keep the newline structure that separates lyric lines.
    .replace(/[^\S\n]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n');

  return cleaned.replace(/\u0000(\d+)\u0000/g, (_, i) => chords[Number(i)]).trim();
}
