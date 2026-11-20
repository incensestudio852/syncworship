/**
 * Chord transposition.
 *
 * Chords in the stored lyrics look like [G], [C#m7], [D/F#], [Bbadd9]. Only the
 * root and any slash bass are pitch, so only those move; the quality, extensions
 * and formatting must survive untouched.
 */

const SHARP_SPELLING = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_SPELLING = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

/** Every accepted spelling mapped to a pitch class, so input stays flexible. */
const PITCH: Record<string, number> = {
  C: 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

/** True when the song is written with flats, so transposition keeps that feel. */
/**
 * Keys conventionally written with flats vs sharps.
 *
 * A literal 'b' in the key name is not enough — F and Bb minor are flat keys
 * with no flat sign in the name, and writing "A#" instead of "Bb" on a chart is
 * how a band ends up in the wrong key.
 */
const FLAT_KEYS = new Set(['F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
                           'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm']);

function prefersFlats(targetKey: string, chordText: string): boolean {
  const k = targetKey.trim();
  if (k) {
    if (/#/.test(k)) return false;
    if (FLAT_KEYS.has(k)) return true;
    if (/b/.test(k)) return true;
    return false;
  }
  // No key given: follow how the source sheet is already written.
  const flats = (chordText.match(/[A-G]b/g) ?? []).length;
  const sharps = (chordText.match(/[A-G]#/g) ?? []).length;
  return flats > sharps;
}

function spell(pc: number, flats: boolean): string {
  const table = flats ? FLAT_SPELLING : SHARP_SPELLING;
  return table[((pc % 12) + 12) % 12];
}

/** Transpose a bare key name, e.g. 'G' + 2 -> 'A'. */
export function transposeKey(key: string, semitones: number): string {
  const m = key.trim().match(/^([A-G][#b]?)(.*)$/);
  if (!m || !(m[1] in PITCH)) return key;
  const pc = PITCH[m[1]];
  const flats = prefersFlats(key, '');
  return spell(pc + semitones, flats) + m[2];
}

/**
 * Transpose every chord inside brackets, leaving lyrics alone.
 * Unknown tokens (N.C., percussion marks) pass through unchanged.
 */
/**
 * A bracket is a CHORD only when its whole contents look like one.
 *
 * Section markers share the same syntax — `[Chorus]`, `[Verse]`, `[Bridge]` —
 * and `Chorus` parses as root C + quality "horus", so a naive match transposed
 * it to `[C#horus]`. Chords are therefore constrained to a known shape: a root,
 * an optional short quality/extension, an optional slash bass.
 */
const CHORD_SHAPE =
  /^([A-G][#b]?)(maj|min|m|M|dim|aug|sus|add|°|ø|\+|\-|\d{1,2}|[#b]\d{1,2}|\/)*([A-G][#b]?)?$/;

/** Quality suffixes that actually occur in charts. */
const QUALITY = /^(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+|-|\d|#|b|\/)*$/;

function looksLikeChord(token: string): boolean {
  if (!token || token.length > 12) return false;
  const m = token.match(/^([A-G][#b]?)(.*)$/);
  if (!m) return false;
  const [, root, restRaw] = m;
  if (!(root in PITCH)) return false;

  // Split off a slash bass first: "[D/F#]" -> quality "", bass "F#".
  const slash = restRaw.lastIndexOf('/');
  const rest = slash === -1 ? restRaw : restRaw.slice(0, slash);
  if (slash !== -1) {
    const bass = restRaw.slice(slash + 1);
    if (!(bass in PITCH)) return false;
  }
  // "horus", "ridge", "erse 2" — a section name in disguise.
  return QUALITY.test(rest);
}

export function transposeLyrics(lyrics: string, semitones: number, targetKey = ''): string {
  if (!semitones || !lyrics) return lyrics;
  const flats = prefersFlats(targetKey, lyrics);

  return lyrics.replace(/\[([^\]]+)\]/g, (whole, chord: string) => {
    const token = chord.trim();
    // Section markers ([Chorus], [Verse], [Bridge]) must survive untouched.
    if (!looksLikeChord(token)) return whole;
    // root, optional quality/extension, optional /bass
    const m = token.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
    if (!m) return whole;
    const [, root, rest, bass] = m;
    if (!(root in PITCH)) return whole;

    const newRoot = spell(PITCH[root] + semitones, flats);
    const newBass = bass && bass in PITCH ? '/' + spell(PITCH[bass] + semitones, flats) : '';
    return `[${newRoot}${rest}${newBass}]`;
  });
}

/** Semitones between two keys, wrapped to the shorter direction (-6..+6). */
export function keyDistance(from: string, to: string): number {
  const a = PITCH[from.trim()];
  const b = PITCH[to.trim()];
  if (a === undefined || b === undefined) return 0;
  let d = (b - a + 12) % 12;
  if (d > 6) d -= 12;
  return d;
}

/**
 * The key a list item is actually played in: what the list says, else the
 * library's original key.
 *
 * Every surface that shows a key (stage bar, song list, metrics pill) must use
 * this, or the header says F while the chords underneath are still in G.
 */
export function listKey(item: {
  selected_key?: string | null;
  service_key?: string | null;
  songs?: { original_key?: string | null } | null;
} | null | undefined): string {
  if (!item) return '';
  return item.selected_key || item.service_key || item.songs?.original_key || '';
}

/** '1'..'7' for a pitch class relative to a key — Nashville-style, no letters. */
const NASHVILLE = ['1', 'b2', '2', 'b3', '3', '4', 'b5', '5', 'b6', '6', 'b7', '7'];

export function toNashville(lyrics: string, key: string): string {
  const root = PITCH[key.trim()];
  if (root === undefined) return lyrics;

  return lyrics.replace(/\[([^\]]+)\]/g, (whole, chord: string) => {
    const token = chord.trim();
    const m = token.match(/^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/);
    if (!m) return whole;
    const [, r, rest, bass] = m;
    if (!(r in PITCH)) return whole;
    const num = NASHVILLE[(PITCH[r] - root + 12) % 12];
    const bassNum = bass && bass in PITCH ? '/' + NASHVILLE[(PITCH[bass] - root + 12) % 12] : '';
    return `[${num}${rest}${bassNum}]`;
  });
}
