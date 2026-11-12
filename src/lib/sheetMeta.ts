'use client';

/**
 * Metadata inference from a sheet.
 *
 * Filenames are unreliable (browser downloads are hashes), but the page itself
 * usually states its own title, key and tempo. Reading those beats guessing.
 */

export type SheetMeta = {
  title?: string;
  originalKey?: string;
  source?: string;
};

/** Lines that are never a song title. */
const NOT_TITLE =
  /^(verse|chorus|bridge|pre|intro|outro|tag|ending|interlude|instrumental|vocal|piano|key\b|tempo\b|copyright|©|\(|page\s*\d)/i;

/** Credit lines ("曲/詞 李俊霆", "Words and Music by …") are never the title. */
const CREDIT =
  /^(曲詞|曲\/詞|詞\s*[:：]|曲\s*[:：]|詞曲|words?\s*(and\s*music)?\s*by|music\s*by|and\s+[A-Z]|arr\.|arranged\s+by|編曲)/i;

/** A plausible title: short, has real letters, no chord/section vocabulary. */
function looksLikeTitle(line: string): boolean {
  const t = line.trim();
  if (t.length < 2 || t.length > 40) return false;
  if (NOT_TITLE.test(t)) return false;
  if (CREDIT.test(t)) return false;
  // Chord rows are not titles: every whitespace token parses as a chord.
  if (isChordRow(t)) return false;
  // Bar-line chord notation ("|G |Em |Am") likewise.
  if (/[|｜]/.test(t) && /[A-G]/.test(t)) return false;
  // Must contain at least one letter or CJK character.
  if (!/[\p{L}\u2e80-\u2fdf]/u.test(t)) return false;
  // A line that is mostly digits is a bassline/jianpu, not a title.
  const letters = (t.match(/[\p{L}\u2e80-\u2fdf]/gu) ?? []).length;
  if (letters / t.length < 0.4) return false;
  // OCR noise: lines dominated by 1-2 char fragments ("ls 5 ee rr 和 >").
  const tokens = t.split(' ');
  const shortFrags = tokens.filter((w) => w.length <= 2).length;
  if (tokens.length >= 3 && shortFrags / tokens.length > 0.6) return false;
  // Lyrics are sentences: they carry commas/stops or run long. Count CJK on
  // the line as written so joined-up OCR text can't slip past the limit.
  const withoutNumbers = t.replace(/\d[\d,.]*/g, '');
  if (/[，。！？；、,;]/.test(withoutNumbers)) return false;
  const cjk = (t.match(/[\u4e00-\u9fff]/g) ?? []).length;
  if (cjk > 12) return false;
  // Must have at least one real word (3+ letters) or a 2+ char CJK run.
  const realWords = tokens.filter(
    (w) => /\p{L}{3,}/u.test(w) || /[\u2e80-\u9fff]{2,}/u.test(w),
  );
  if (realWords.length === 0 && tokens.length > 1) return false;
  return true;
}

/** Strip the parenthetical/bracket annotations OCR keeps around titles. */
function cleanTitle(t: string): string {
  const out = t
    .replace(/^[^\p{L}\p{N}]+/gu, '')
    .replace(/\(.*?\)|（.*?）|【.*?】|\[.*?\]|〈.*?〉|《.*?》/g, ' ')
    // A title stops where the credit block begins: "〈立志擺上〉… 曲詞：DJS"
    .replace(/\s*(曲詞|曲\/詞|詞曲|詞\s*[:：]|曲\s*[:：]).*$/, '')
    .replace(/[〈》「」『』【】〈〉《》]+/g, ' ')
    .trim();
  // Tesseract often spaces CJK out ("立 志 擺 上"); join those back up.
  return out.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '').replace(/\s{2,}/g, ' ');
}

/**
 * Tesseract spaces CJK apart ("立 志 擺 上"). Join those back up, but only for
 * short titles — a spaced lyric line must stay spaced so its length is still
 * visible to the guards.
 */
function joinCjkSpacing(s: string): string {
  if ((s.match(/[\u4e00-\u9fff]/g) ?? []).length > 8) return s;
  return s.replace(/(?<=[\u4e00-\u9fff])\s+(?=[\u4e00-\u9fff])/g, '');
}

/** True when every token looks like a chord symbol. */
function isChordRow(line: string): boolean {
  const tokens = line.trim().split(/\s+/).filter(Boolean);
  if (!tokens.length) return false;
  const chordish = tokens.filter(
    (t) =>
      /^[A-G](#|b)?(maj|min|m|dim|aug|sus|add|M)?\d{0,2}(\/[A-G](#|b)?)?$/i.test(t) ||
      /^\|[A-G]/.test(t) ||
      /^[A-G][a-z]*\d*\|$/.test(t),
  ).length;
  return chordish / tokens.length >= 0.8;
}

/**
 * Normalise CJK compatibility forms.
 *
 * PDF text layers often emit Kangxi radicals (U+2F00-range) instead of the
 * unified ideographs they look like: 三⼀神 uses U+2F00 ⼀ rather than U+4E00 一.
 * They render deceptively but break search, duplicate-title matching and look
 * wrong once copied. NFKC maps them back to the unified block.
 */
export function normaliseCjk(s: string): string {
  return s.normalize('NFKC');
}

/**
 * Infer title / key / source from the sheet's own text.
 * The title is the first plausible line, which is where every published sheet
 * puts it (top-centre, above the key signature).
 */
export function inferMetaFromText(text: string): SheetMeta {
  const lines = text
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);

  const meta: SheetMeta = {};

  // ---- title: first plausible line in the top third of page 1 -------------
  // Only the top of page 1 can hold a title: stop at the first chord row or
  // bar line, because everything below that is lyric text.
  const stopAt = lines.findIndex((l) => isChordRow(l) || /^[|｜]/.test(l));
  const head = lines.slice(0, stopAt === -1 ? Math.min(8, lines.length) : Math.min(stopAt + 1, 8));
  for (const raw of head) {
    // Judge on the raw line (a long lyric can't dodge the length guard), then
    // join OCR-split CJK only for the stored title.
    const joined = joinCjkSpacing(raw);
    if (!looksLikeTitle(joined)) continue;
    const candidate = normaliseCjk(cleanTitle(joined));
    if (candidate.length >= 2 && looksLikeTitle(candidate)) {
      meta.title = candidate;
      break;
    }
  }

  // ---- key: "Key: G Major", "Key A 4/4", "1 = G", "Key of D" ---------------
  for (const line of lines.slice(0, 12)) {
    const m =
      // Alternation order matters: "Major" must match before the bare "m",
      // otherwise "Key: G Major" is read as G minor ("Gm").
      line.match(/key\s*(?:of)?\s*:?\s*([A-G])\s*(#|b)?\s*(major|minor|maj|min|m)?/i) ??
      line.match(/1\s*=\s*([A-G])\s*(#|b)?/);
    if (m) {
      const root = m[1].toUpperCase();
      const acc = m[2] === '#' || m[2] === 'b' ? m[2] : '';
      // "Major" is the DEFAULT — only an explicit minor marker means minor.
      // Matching /m/ against "Major" produced "Gm" for "Key: G Major".
      const qualifier = (m[3] ?? '').toLowerCase();
      const minor = qualifier === 'm' || qualifier === 'min' || qualifier === 'minor';
      meta.originalKey = `${root}${acc}${minor ? 'm' : ''}`;
      break;
    }
  }

  // ---- source: composer/lyricist credit lines -----------------------------
  for (const line of lines.slice(0, 14)) {
    const m = line.match(/(?:曲詞|曲\/詞|詞|曲|words? and music by|words by)\s*[:：]?\s*(.{2,40})/i);
    if (m) {
      const src = m[1]
        .replace(/^[\s/:：|｜\-]+/, '')
        .replace(/[|｜].*$/, '')
        .replace(/\b(曲|詞)\s*[:：]?\s*/g, ' ')
        .replace(/\s{2,}/g, ' ')
        .trim();
      if (src && src.length > 1) {
        meta.source = src.slice(0, 40);
        break;
      }
    }
  }

  return meta;
}
