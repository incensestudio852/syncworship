/**
 * Chord helpers for the lyric editor.
 *
 * The editor is a plain <textarea> using inline `[G]` syntax, so every helper
 * here works on a string plus a caret offset — no contenteditable, no rich-text
 * model, no new dependency. That keeps the editor's existing behaviour (OCR
 * fill, touched tracking, save gating) exactly as it is.
 */

// Mirrors KEY_OPTIONS in lib/setlist.ts, but as the chords a player actually
// needs when scoring a chart rather than the keys a song can be sung in.
const SEMITONES = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

// Common shapes per key, ordered by how often they appear in worship charts.
const DEGREES: Array<{ suffix: string; semitoneFromRoot: number }> = [
  { suffix: '', semitoneFromRoot: 0 }, // I
  { suffix: 'm', semitoneFromRoot: 9 }, // vi
  { suffix: '', semitoneFromRoot: 7 }, // V
  { suffix: '', semitoneFromRoot: 5 }, // IV
  { suffix: 'm', semitoneFromRoot: 2 }, // ii
  { suffix: 'm', semitoneFromRoot: 4 }, // iii
  { suffix: 'sus4', semitoneFromRoot: 7 },
  { suffix: '7', semitoneFromRoot: 7 },
  { suffix: '', semitoneFromRoot: 10 }, // bVII
  { suffix: 'm7', semitoneFromRoot: 9 },
  { suffix: 'add9', semitoneFromRoot: 0 },
  { suffix: 'maj7', semitoneFromRoot: 0 },
];

/**
 * Chord spelling.
 *
 * Sharps and flats are separate tables on purpose. Transposing E major must
 * yield C#m/G#m, not Dbm/Abm — a chart spelling the vi as Dbm is wrong to any
 * player. The key's own spelling decides which table to use, so a sharp key
 * stays sharp and a flat key stays flat throughout its chord set.
 */
const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'] as const;
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'] as const;
const NATURAL = ['C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B'] as const;

/** Minor keys published by the editor, so `Am` is recognised as minor. */
const MINOR_ROOTS: Record<string, number> = {
  Cm: 0, 'C#m': 1, Dm: 2, Ebm: 3, Em: 4, Fm: 5,
  'F#m': 6, Gm: 7, 'G#m': 8, Am: 9, Bbm: 10, Bm: 11,
};

const ALIASES: Record<string, number> = {
  'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, C: 0,
};

/** Semitone position of any root spelling, minor suffix allowed. */
function semitoneOf(root: string): number {
  return ALIASES[root] ?? 0;
}

/**
 * Note `offset` semitones above `root`, spelled the same way the key is.
 * Minor keys default to the natural spelling (Db/Eb/Ab/Bb) because that is how
 * they are almost always written in worship charts.
 */
function shift(root: string, offset: number, spelling: 'sharp' | 'flat' | 'natural'): string {
  const table = spelling === 'sharp' ? SHARP : spelling === 'flat' ? FLAT : NATURAL;
  return table[(semitoneOf(root) + offset) % 12];
}

/**
 * Spell chords the way the key signature does.
 *
 * Looking only at the tonic's accidental is wrong: E major has no '#' in its
 * name but four sharps in its signature, so its iii is G#m, never Abm. Minor
 * keys reuse their relative major's signature (Am -> C, no accidentals).
 */
const SHARP_KEYS = new Set(['G', 'D', 'A', 'E', 'B', 'F#', 'C#']);
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb']);
const RELATIVE_MAJOR: Record<string, string> = {
  Am: 'C', Em: 'G', Bm: 'D', 'F#m': 'A', 'C#m': 'E', 'G#m': 'B', 'D#m': 'F#',
  Dm: 'F', Gm: 'Bb', Cm: 'Eb', Fm: 'Ab', Bbm: 'Db', Ebm: 'Gb',
};

function spellingFor(key: string, isMinor = false): 'sharp' | 'flat' | 'natural' {
  // Compare by the key SIGNATURE: use the relative major for minor keys.
  const major = isMinor ? (RELATIVE_MAJOR[key] ?? key.replace('m', '')) : key;
  if (SHARP_KEYS.has(major)) return 'sharp';
  if (FLAT_KEYS.has(major)) return 'flat';
  return 'natural';
}

/**
 * Chord set for a key.
 *
 * Major and minor are handled separately rather than by transposing the tonic
 * string: a minor key's chord family is completely different (Am -> Am F E Dm
 * C G), so deriving it from "Am + offsets" produced nonsense like A/F#m/E.
 */
export function chordsForKey(key: string): string[] {
  const k = key.trim();
  const isMinor = MINOR_ROOTS[k] !== undefined;

  if (isMinor) {
    const root = k.replace('m', '');
    const spelling = spellingFor(k, true);
    // i, VI, V, iv, III, VII, i7, V7, Vsus4, iv6
    const plan: Array<[number, string]> = [
      [0, 'm'], [8, ''], [7, ''], [5, 'm'], [3, ''], [10, ''],
      [0, 'm7'], [7, '7'], [7, 'sus4'], [5, 'm7'],
    ];
    const seen = new Set<string>();
    const out: string[] = [];
    for (const [off, suffix] of plan) {
      const chord = shift(root, off, spelling) + suffix;
      if (!seen.has(chord)) { seen.add(chord); out.push(chord); }
    }
    return out;
  }

  // Major: I vi V IV ii iii, then the colour chords charts actually use.
  const root = k;
  const spelling = spellingFor(k);
  const plan: Array<[number, string]> = [
    [0, ''], [9, 'm'], [7, ''], [5, ''], [2, 'm'], [4, 'm'],
    [7, 'sus4'], [7, '7'], [10, ''], [9, 'm7'], [0, 'add9'], [0, 'maj7'],
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const [off, suffix] of plan) {
    const chord = shift(root, off, spelling) + suffix;
    if (!seen.has(chord)) { seen.add(chord); out.push(chord); }
  }
  return out;
}

/**
 * Insert `[chord]` at the caret.
 *
 * Returns the new text and the caret position after the insert, so the caller
 * can restore focus and continue typing. Wrapping selected text is NOT done:
 * a chord annotates the syllable that follows it, so the insert goes at the
 * selection's start and the text is left intact.
 */
export function insertChordAt(
  text: string,
  start: number,
  end: number,
  chord: string,
): { text: string; caret: number } {
  const token = `[${chord}]`;
  const before = text.slice(0, start);
  // The selection is KEPT, not swallowed: a chord annotates the syllable that
  // follows it, so it goes in front of the selected text. Slicing from `end`
  // deleted the very word the user had selected.
  const selected = text.slice(start, end);
  const after = text.slice(end);
  // No space is inserted: `[G]奇異恩典` is the syntax the parser expects, and a
  // leading space pushed chords off the syllable they annotate.
  const pad = '';
  const next = before + pad + token + selected + after;
  // Caret lands after the inserted chord but BEFORE the kept selection, so the
  // next chord can be typed straight away without re-selecting.
  return { text: next, caret: before.length + pad.length + token.length };
}

/** The chord immediately before the caret, if the caret sits after `]`. */
export function chordBeforeCaret(text: string, caret: number): string | null {
  const upTo = text.slice(0, caret);
  const m = upTo.match(/\[([A-G][#b]?(?:m|maj|min|sus|add|dim|aug)?\d*(?:\/[A-G][#b]?)?)\]$/);
  return m ? m[1] : null;
}

/** Remove that chord token, returning the text and the caret before it. */
export function removeChordBeforeCaret(
  text: string,
  caret: number,
): { text: string; caret: number } | null {
  const upTo = text.slice(0, caret);
  const m = upTo.match(/\[([A-G][#b]?(?:m|maj|min|sus|add|dim|aug)?\d*(?:\/[A-G][#b]?)?)\]$/);
  if (!m) return null;
  const start = caret - m[0].length;
  return { text: text.slice(0, start) + text.slice(caret), caret: start };
}

/**
 * Viewport rect of a character range inside a <textarea>.
 *
 * A textarea exposes no API for this, so the standard technique is a hidden
 * mirror: a div laid out with the SAME font, padding and width, into which the
 * text up to `end` is copied and a marker span is measured. The marker's rect,
 * offset back by the textarea's own position, is where that character sits on
 * screen.
 *
 * Without this the bubble anchored to the textarea's corner and floated far
 * from the selected word, which is what it looked like in practice.
 */
export function selectionRectInTextarea(
  el: HTMLTextAreaElement,
  start: number,
  end: number,
): DOMRect | null {
  const cs = window.getComputedStyle(el);
  const rect = el.getBoundingClientRect();

  const mirror = document.createElement('div');
  const props = [
    'boxSizing', 'width', 'borderTopWidth', 'borderRightWidth', 'borderBottomWidth',
    'borderLeftWidth', 'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
    'fontFamily', 'fontSize', 'fontWeight', 'fontStyle', 'letterSpacing', 'lineHeight',
    'wordSpacing', 'textTransform', 'textIndent',
  ] as const;
  for (const p of props) {
    mirror.style[p] = cs[p] as string;
  }
  mirror.style.position = 'absolute';
  mirror.style.visibility = 'hidden';
  mirror.style.top = '0';
  mirror.style.left = '-9999px';
  mirror.style.height = 'auto';
  mirror.style.overflow = 'hidden';
  mirror.style.whiteSpace = 'pre-wrap';
  mirror.style.wordWrap = 'break-word';

  // Everything before the selection, then a marker at the selection END —
  // anchoring to the end keeps the bubble beside the word rather than behind it.
  const before = el.value.slice(0, end);
  mirror.textContent = before;

  const marker = document.createElement('span');
  // Zero-width but measurable, and it forces its own line box if at a wrap.
  marker.textContent = el.value.slice(end, end + 1) || '.';
  mirror.appendChild(marker);

  document.body.appendChild(mirror);
  const mRect = marker.getBoundingClientRect();
  const mBox = mirror.getBoundingClientRect();
  document.body.removeChild(mirror);

  // Translate into viewport coordinates. Subtract scroll so a scrolled textarea
  // reports where the text is actually visible.
  const top = rect.top + (mRect.top - mBox.top) - el.scrollTop;
  const right = rect.left + (mRect.right - mBox.left);

  if (!Number.isFinite(top) || !Number.isFinite(right)) return null;
  return new DOMRect(right, top, 0, mRect.height || parseFloat(cs.lineHeight) || 18);
}

/**
 * Section markers the editor offers.
 *
 * These are written as bare `[Verse]` lines rather than `[G]`-style chords: the
 * stage parser recognises them as section labels and renders a chip. The labels
 * match the ones parseSection() already understands, so nothing downstream
 * needs to change.
 */
export const SECTION_MARKERS = [
  { label: 'Intro', shown: 'Intro' },
  { label: 'Verse', shown: 'Verse' },
  { label: 'Pre-Chorus', shown: 'Pre-C' },
  { label: 'Chorus', shown: 'Chorus' },
  { label: 'Bridge', shown: 'Bridge' },
  { label: 'Interlude', shown: 'Inter' },
  { label: 'Tag', shown: 'Tag' },
  { label: 'Outro', shown: 'Outro' },
] as const;

/**
 * Insert a section marker on its own line at the caret.
 *
 * A section label only parses when it stands alone on a line, so leading and
 * trailing newlines are added when the caret is mid-text. Putting `[Chorus]`
 * inline with lyrics would be treated as a chord-like token and silently fail
 * to register as a section.
 */
export function insertSectionAt(
  text: string,
  caret: number,
  label: string,
): { text: string; caret: number } {
  const before = text.slice(0, caret);
  const after = text.slice(caret);
  const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n';
  const trail = after.length === 0 || after.startsWith('\n') ? '\n' : '\n';
  const token = `[${label}]`;
  const next = before + lead + token + trail + after;
  return { text: next, caret: (before + lead + token).length };
}


/**
 * Chord-block syntax.
 *
 * A fenced ```` ```chords ```` block holds a monospaced grid where chord names
 * sit ABOVE the lyric line they belong to, spaced by column. That is the only
 * way to express two chords per word, which the inline `[G]` form cannot.
 *
 * Both forms coexist: inline for quick entry, the block for charts imported
 * from elsewhere or where spacing carries meaning.
 */
export const CHORD_BLOCK_FENCE = '```chords';

/** Wrap the caret in an empty chord block, or fill an existing one. */
export function insertChordBlock(
  text: string,
  start: number,
  end: number,
): { text: string; caret: number } {
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const lead = before.length === 0 || before.endsWith('\n') ? '' : '\n';
  const body = selected || '\nG      Bm\n愛是基督教我愛';
  const block = `${CHORD_BLOCK_FENCE}\n${body.replace(/^\n/, '')}\n\`\`\`\n`;
  const next = before + lead + block + after;
  return { text: next, caret: before.length + lead.length + CHORD_BLOCK_FENCE.length + 1 };
}

/**
 * Convert an inline `[G]lyrics` passage into a chord-aligned block.
 *
 * Used by the "convert to block" action for charts the user typed inline but
 * which need column alignment — typically two chords over one word.
 */
export function inlineToChordBlock(passage: string): string {
  const lines = passage.split('\n');
  const out: string[] = [];
  for (const line of lines) {
    const tokens = [...line.matchAll(/\[([^\]]+)\]/g)];
    if (!tokens.length) {
      out.push(line);
      continue;
    }
    let chordRow = '';
    let lyricRow = '';
    let cursor = 0;
    for (const t of tokens) {
      const at = t.index ?? 0;
      const plain = line.slice(cursor, at).replace(/\[/g, '');
      lyricRow += plain;
      // Pad the chord row so it sits exactly above its syllable.
      chordRow = chordRow.padEnd(lyricRow.length, ' ') + t[1] + ' ';
      cursor = at + t[0].length;
    }
    lyricRow += line.slice(cursor);
    out.push(chordRow.trimEnd(), lyricRow);
  }
  return out.join('\n');
}
