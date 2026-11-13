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
export function transposeLyrics(lyrics: string, semitones: number, targetKey = ''): string {
  if (!semitones || !lyrics) return lyrics;
  const flats = prefersFlats(targetKey, lyrics);

  return lyrics.replace(/\[([^\]]+)\]/g, (whole, chord: string) => {
    const token = chord.trim();
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
