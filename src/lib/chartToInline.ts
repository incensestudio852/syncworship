/**
 * Converts chord-ChART layout into the app's inline format.
 *
 * Sheet style (what churches actually publish, and what OCR returns):
 *
 *     Dmaj7        E
 *     我看見暴風
 *
 *     C#m7   F#m
 *     主稱看見星空  在祢手中
 *
 * App format:
 *     我看見[Dmaj7]暴風[E]
 *
 * Two column-cases have to be handled, and they are NOT the same:
 *   1. A single lyric line under a chord line  -> chords attach to that line.
 *   2. Two side-by-side lyric columns (Verse | Bridge) -> OCR emits them as
 *      ONE line with a big gap. The gap is the column boundary; chords above
 *      are likewise two groups. Split on the widest gap, then pair up.
 *      If column widths don't line up we bail out rather than guess.
 */

export type SheetKind = 'chord_chart' | 'lead_sheet' | 'lyrics_only';

export type ConvertResult = {
  lyrics: string;
  chordsFound: number;
  linesConverted: number;
  warnings: string[];
  kind: SheetKind;
};

/**
 * Detect what kind of sheet the OCR text came from.
 *
 * A lead sheet (staff notation) puts jianpu numbers and bar lines between the
 * chords and the lyrics, so chords cannot be attached to syllables by position.
 * Attaching anyway produces wrong harmony — worse than none — so we refuse.
 */
export function detectSheetKind(raw: string): SheetKind {
  const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return 'lyrics_only';

  // Jianpu melody rows: a line of mostly single digits separated by spaces,
  // optionally with bar marks/dashes. Matches "1 1 1 32 | 1 1 65 61 |".
  // Metadata lines ("Key A 4/4 Tempo 64", "4. 河 曲") contain digits too, but
  // they also contain words — require the line to be almost nothing but digits
  // and bar/dash marks so a chord chart is never mistaken for a staff sheet.
  const jianpu = lines.filter((l) => {
    const digits = (l.match(/\d/g) ?? []).length;
    if (digits < 5) return false;
    const nonDigitJunk = (l.match(/[\s.|\-—~]/g) ?? []).length;
    const letters = (l.match(/[A-Za-z\u4e00-\u9fff]/g) ?? []).length;
    // Must be >60% digits+junk and contain essentially no words.
    return nonDigitJunk / l.length >= 0.45 && letters <= 2;
  });

  // Bar lines are meaningful only when no chord row is present — a scanned
  // chord chart routinely OCRs '|' from borders and crop marks.
  const barred = lines.filter((l) => (l.match(/[|｜]/g) ?? []).length >= 2);
  // Staves/beams OCR as runs of short uppercase fragments ("EHRBRCFT").
  // Section headings ("Verse Bridge", "Pre Chorus") also look wordy, so they
  // must be excluded or every chord chart gets misread as staff notation.
  const isHeading = (l: string) =>
    /^(verse|chorus|bridge|pre|intro|outro|tag|ending|interlude|instrumental)/i.test(
      l.replace(/[()（）\s]/g, ''),
    ) || /^(前奏|主歌|副歌|橋段|間奏|尾聲|導歌)/.test(l);
  const staffNoise = lines.filter(
    (l) => /^(?:[A-Za-z]{1,3}\s?){4,}$/.test(l) && !isHeading(l),
  );
  const chordLines = lines.filter(
    (l) => isChordOrNoiseRow(l) || (l.match(/\[[A-G][^\]]*\]/g) ?? []).length >= 2,
  );

  // A real chord grid (2+ chord rows, each with a lyric beneath) is decisive.
  // On a staff sheet the line under the chords is a jianpu number row, not
  // lyrics — that is what separates 履海 (chart) from 輕輕聽 (lead sheet).
  const isMelodyRow = (l: string) => {
    const digits = (l.match(/\d/g) ?? []).length;
    if (digits < 5) return false;
    // Digit density is the reliable signal; OCR mangles a jianpu row into
    // letter fragments ("sl5--szl1-7fsls"), so word-counting rejects real rows.
    return digits / l.length >= 0.12;
  };

  const melodyRows = lines.filter((l) => isMelodyRow(l)).length;
  if (melodyRows >= 2) return 'lead_sheet';

  if (chordLines.length >= 2) {
    let withLyric = 0;
    let withMelody = 0;
    lines.forEach((l, i) => {
      if (chordTokens(l.trim()) === null) return;
      const next = lines[i + 1]?.trim();
      const prev = lines[i - 1]?.trim() ?? '';
      if (isMelodyRow(prev)) {
        withMelody++;
        return;
      }
      if (!next) return;
      if (isMelodyRow(next)) withMelody++;
      else if (chordTokens(next) === null && !isHeading(next)) withLyric++;
    });
    if (withMelody >= 2 && withMelody >= withLyric) return 'lead_sheet';
    if (withLyric >= 2) return 'chord_chart';
  }

  // Jianpu number rows are definitive for lead sheets.
  if (jianpu.length >= 2) return 'lead_sheet';
  if (staffNoise.length >= 3) return 'lead_sheet';

  // A chord grid (chord row directly above a lyric row) is a chord chart.
  if (chordLines.length >= 3) return 'chord_chart';

  if (!chordLines.length && barred.length >= 2) return 'lead_sheet';
  if (chordLines.length >= 2) return 'chord_chart';
  return 'lyrics_only';
}

const CHORD_TOKEN =
  /^[A-G](#|b)?(maj|min|m|dim|aug|sus|add|M|°|ø)?\d{0,2}(sus\d?|add\d+)?(\/[A-G](#|b)?)?$/i;

/** Fix the character damage Tesseract reliably makes on chord names. */
export function repairChord(raw: string): string | null {
  let s = raw.trim();
  if (!s) return null;
  // A leading bar number ("5 ", "17.") is not part of the chord.
  s = s.replace(/^\d{1,3}[.)]?\s*/, '');
  // Bar-line chord notation: "|G", "|Em", "G|", "|D/F#" — the pipe is the bar
  // marker, not part of the chord. This is how most Chinese chord charts are
  // typeset, so it must be stripped before parsing.
  s = s.replace(/^[|｜]+/, '').replace(/[|｜]+$/, '');
  if (!s) return null;
  // "h" is a misread flat sign: Bh(sus4) -> Bb(sus4). Must run before the
  // brackets are unwrapped so the accidental stays attached to the root.
  s = s.replace(/^([A-G])h(?=[(m\d/#b]|$)/, '$1b');
  // Extended qualities OCR keeps in brackets: Eb(add2), Bb(sus4), Dm7(b5).
  s = s.replace(/\(([^)]*)\)/g, '$1');
  // 7th read as apostrophe/quote: Dmaj' -> Dmaj7, C#m' -> C#m7
  // Quote-family glyphs are almost always a misread "7": Dmaj' Dmaj" Dmaj`
  s = s.replace(/[’'‘`ʼ"”″]/g, '7');
  // "#m" read as "om" (C#m7 -> Com7, C#m7 -> Com?). Handle both spellings in
  // one pass, before '?' is rewritten, or "Com?" turns into "Com#" first.
  // NOTE: no /i flag — with it, [A-G] matches the lowercase "o" and "Com" is
  // consumed as a single letter, so the pattern never fires.
  s = s.replace(/^([A-G])om(?!7)/, '$1#m');
  // '?' is ambiguous: "#" when a quality follows (C?m7 -> C#m7), otherwise a
  // truncated "7" (Dmaj? -> Dmaj7). A trailing '?' is therefore a 7.
  s = s.replace(/\?(?=m|maj|min|dom|dim|aug|sus|add)/, '#');
  s = s.replace(/\?/g, '7');
  // Remaining o used for the minor marker: Co7 -> C#o is covered above; Cob -> Cb
  s = s.replace(/^([A-G])o(?=m|\d)/i, '$1');
  // sus4 misreads
  s = s.replace(/sus[0oO°®]/gi, 'sus4');
  // "e" misread for 4 after sus/add: Bbsuse -> Bbsus4, Cadd e -> Cadd4
  s = s.replace(/(sus|add)e$/i, '$14');
  s = s.replace(/°/g, 'dim');
  s = s.replace(/ø/g, 'm7b5');
  // OCR injects a stray "y" between quality and extension: C#my7 / Dmajy7.
  s = s.replace(/^([A-G](?:#|b)?(?:maj|min|m|dim|aug|sus|add)?)y(\d)/, '$1$2');
  // Trailing "y" with no digit is a misread 7: By -> B7, Cmy -> Cm7
  s = s.replace(/^([A-G](?:#|b)?(?:maj|min|m)?)y$/, '$17');
  // ep/Ep -> Eb (lowercase e misread as the note E with p for b)
  s = s.replace(/^[Ee][pP]/, 'Eb');
  // Trailing stray punctuation from the scan
  s = s.replace(/[.,;:|]+$/, '');
  if (!CHORD_TOKEN.test(s)) return null;
  // Normalise accidental casing: C#m stays, c#m7 -> C#m7
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Split a line of chord tokens; returns null if the line isn't chords-only. */
function chordTokens(line: string): string[] | null {
  const parts = line.trim().split(/\s{1,}/).filter(Boolean);
  if (!parts.length) return null;
  const fixed = parts.map(repairChord);
  if (fixed.some((c) => c === null)) return null;
  return fixed as string[];
}

/**
 * True when a line is a chord row, not lyrics.
 *
 * Scanned lead sheets prefix chord rows with bar numbers ("5 Eb(add2) Fm7/Eb"),
 * and OCR can leave non-chord tokens in them. Requiring EVERY token to be a
 * chord is too strict for real scans, so we accept a row when at least half
 * its tokens parse as chords and no token is ordinary prose.
 */
function isChordOrNoiseRow(line: string): boolean {
  if (chordTokens(line)) return true;
  const parts = line.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return false;
  let chords = 0;
  for (const p of parts) if (repairChord(p) !== null) chords++;
  const ratio = chords / parts.length;
  // A line with mostly CJK is lyric text even if a stray chord slipped in.
  const hasCjk = /[\u4e00-\u9fff]/.test(line);
  return ratio >= 0.5 && !hasCjk;
}

function isSectionHeader(line: string): boolean {
  return /^(verse|chorus|bridge|pre|intro|outro|tag|ending|interlude|instrumental)\b/i.test(
    line.replace(/[()（）\s]/g, ''),
  ) || /^(前奏|主歌|副歌|橋段|間奏|尾聲|導歌)/.test(line.trim());
}

/** Collapse the wide spaces Tesseract leaves between CJK glyphs. */
function tidyChinese(text: string): string {
  return text
    .replace(/(?<=[\u4e00-\u9fff，。、！？：；」』）])\s+(?=[\u4e00-\u9fff，。、！？：；「『（])/g, '')
    .replace(/\s{2,}/g, '  ')
    .trim();
}

/**
 * Attach chords to a lyric line.
 *
 * Two very different scripts:
 *
 *  CJK (Chinese/Japanese): no inter-word spaces, so the chord lands on the
 *  Nth character. OCR inserts spaces between glyphs; those are collapsed.
 *
 *  Latin (English etc.): spaces separate words and MUST be preserved, and a
 *  chord belongs with a word ("[G]Amazing grace"), never inside one
 *  ("[G]Amazinggrace"). Chords are matched to word starts proportionally.
 */
function attachChords(chords: string[], lyric: string): string {
  const n = chords.length;
  if (!lyric.trim()) return chords.map((c) => `[${c}]`).join(' ');

  // Space-delimited scripts keep their words. Latin does; Korean (Hangul)
  // does too. Chinese/Japanese do not — those anchor on characters.
  const hasCJK = /[\u4e00-\u9fff\u3040-\u30ff]/.test(lyric);
  const hasHangul = /[\uac00-\ud7af]/.test(lyric);
  const isWordBased = (hasHangul || /[A-Za-z]/.test(lyric)) && !hasCJK;

  if (isWordBased) return attachLatin(chords, lyric);

  // ---- CJK path: collapse inter-glyph spaces, anchor on characters --------
  const chars = Array.from(lyric.replace(/\s+/g, ''));
  const total = chars.length;
  const slots = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const pos = n === 1 ? 0 : Math.min(total - 1, Math.round((i * total) / n));
    const list = slots.get(pos) ?? [];
    list.push(chords[i]);
    slots.set(pos, list);
  }
  const out: string[] = [];
  for (let i = 0; i < total; i++) {
    const at = slots.get(i);
    if (at) out.push(at.map((c) => `[${c}]`).join(''));
    out.push(chars[i]);
  }
  return out.join('');
}

/**
 * Latin lyrics: keep the words intact and put each chord before a word.
 * Chord k of n goes to word round(k * words / n), so the mapping stays even
 * across the line and the first chord always starts the line.
 */
function attachLatin(chords: string[], lyric: string): string {
  const clean = lyric.replace(/\s+/g, ' ').trim();
  const words = clean.split(' ').filter(Boolean);
  if (!words.length) return chords.map((c) => `[${c}]`).join('');

  const n = chords.length;
  const w = words.length;
  const slots = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const pos = n === 1 ? 0 : Math.min(w - 1, Math.round((i * w) / n));
    const list = slots.get(pos) ?? [];
    list.push(chords[i]);
    slots.set(pos, list);
  }

  return words
    .map((word, i) => {
      const at = slots.get(i);
      return at ? at.map((c) => `[${c}]`).join('') + word : word;
    })
    .join(' ');
}

export function convertChartToInline(raw: string): ConvertResult {
  const kind = detectSheetKind(raw);
  const warnings: string[] = [];
  const lines = raw.replace(/\r/g, '').split('\n');
  const out: string[] = [];
  let chordsFound = 0;
  let linesConverted = 0;

  // ---- Lead sheet: keep lyrics, refuse to place chords -------------------
  // Chords on a staff sheet sit over bar lines, not syllables. Placing them by
  // character position would be invention, so we strip the chord/jianpu/staff
  // rows and hand back lyric text only, with an explicit notice.
  if (kind === 'lead_sheet') {
    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        out.push('');
        continue;
      }
      // Drop chord rows (incl. bar-numbered ones), jianpu rows, bar lines and
      // staff noise.
      const chordRow = isChordOrNoiseRow(trimmed);
      if (chordRow) continue;
      // Jianpu/melody rows: predominantly digits, dashes and bar marks.
      const digits = (trimmed.match(/\d/g) ?? []).length;
      const marks = (trimmed.match(/[\s.\-~一—|｜]/g) ?? []).length;
      if (digits >= 3 && digits + marks >= trimmed.length * 0.7) continue;
      if ((trimmed.match(/[|｜]/g) ?? []).length >= 2) continue;
      if (/^(?:[A-Za-z]{1,3}\s?){4,}$/.test(trimmed)) continue;
      // Keep only lines that actually carry lyrics. On a lead sheet the rest
      // is staff/beam noise, chord debris, tempo marks and credits. Requiring
      // CJK is the reliable rule for this material; a sheet whose lyrics are
      // Japanese or Korean still contains kanji/hanja, and English lyrics are
      // long word runs rather than fragments, handled below.
      const cjkCount = (trimmed.match(/[\u4e00-\u9fff]/g) ?? []).length;
      const longWords = (trimmed.match(/[A-Za-z]{3,}/g) ?? []).length;
      // One or two stray glyphs ("曾", "站") are bleed from the staff, not a lyric line.
      if (cjkCount < 3 && longWords < 3) continue;

      const kept = tidyChinese(trimmed.replace(/[|｜]+/g, ' ').trim());
      if (kept) out.push(kept);
    }
    warnings.push('此為五線譜／簡譜樂譜，系統不會自動標註和弦——請於編輯頁人手加入 [G] 標記。');
    return {
      lyrics: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
      chordsFound: 0,
      linesConverted: 0,
      warnings,
      kind,
    };
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) {
      out.push('');
      continue;
    }
    if (isSectionHeader(trimmed)) {
      out.push(`【${trimmed.replace(/[()（）]/g, '').trim()}】`);
      continue;
    }

    const chords = chordTokens(trimmed);
    if (!chords) {
      out.push(tidyChinese(trimmed));
      continue;
    }

    chordsFound += chords.length;
    // Next non-empty line is the lyric this chord row belongs to.
    let j = i + 1;
    while (j < lines.length && !lines[j].trim()) j++;
    const lyric = lines[j];

    if (!lyric || chordTokens(lyric.trim()) || isSectionHeader(lyric.trim())) {
      // Chord-only row with no lyric under it: keep as-is, converted.
      out.push(chords.map((c) => `[${c}]`).join(' '));
      continue;
    }

    // Two-column charts: chords sit over a lyric that has a very wide gap.
    const lyricGaps = lyric.trim().split(/\s{4,}/);
    const hasColumnSplit = lyricGaps.length >= 2;
    const mid = chords.length / 2;

    if (hasColumnSplit && Number.isInteger(mid) && mid > 0 && mid < chords.length) {
      const left = chords.slice(0, mid);
      const right = chords.slice(mid);
      out.push(attachChords(left, lyricGaps[0]));
      out.push(attachChords(right, lyricGaps[1]));
      linesConverted += 1;
      i = j;
      continue;
    }

    out.push(attachChords(chords, lyric.trim()));
    linesConverted += 1;
    i = j;
  }

  if (chordsFound === 0) {
    warnings.push('未偵測到和弦列——樂譜可能掃描品質較低。');
  }
  return {
    lyrics: out.join('\n').replace(/\n{3,}/g, '\n\n').trim(),
    chordsFound,
    linesConverted,
    warnings,
    kind,
  };
}
