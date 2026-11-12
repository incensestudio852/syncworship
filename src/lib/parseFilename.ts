export type ParsedFilename = {
  title?: string;
  originalKey?: string;
  source?: string;
  confidence: 'low' | 'medium';
  usedChunks: string[];
  bareName: boolean;
};

const KEY_RE = /^(?:key\s*of\s*)?([A-G])([#b]?)(m)?$/i;
const SOURCE_RE = /^(?:詩歌|讚美|敬拜|hymn|praise|worship)$/i;
const NOISE_RE = /^(?:final|v\d+|ver\d*|copy|new|new1|掃描|scan|\d{1,2})$/i;
const DATE_RE = /^(?:19|20)\d{2}[-_.]?\d{0,2}[-_.]?\d{0,2}$/;
// Pure hex ids / hashes / timestamps: downloads and scans usually look like
// "09a563_90c73b4f20e9486cb0e05a955c646360" with no human-readable title.
const HASH_RE = /^[0-9a-f]{6,}$/i;
const HASHY_RE = /^(?:[0-9a-f]{4,}[_-]){1,}[0-9a-f]{4,}$/i;

/** True when a chunk carries no title information worth showing. */
function isJunkChunk(chunk: string): boolean {
  if (NOISE_RE.test(chunk) || DATE_RE.test(chunk)) return true;
  if (HASH_RE.test(chunk) || HASHY_RE.test(chunk)) return true;
  // Mostly digits/symbols with almost no letters or CJK.
  const meaningful = (chunk.match(/[\p{L}]/gu) ?? []).length;
  return meaningful === 0 || (meaningful / chunk.length < 0.4 && chunk.length > 6);
}

/**
 * Best-effort, NON-authoritative prefill from a file name.
 * Nothing here is saved without the user submitting the form.
 */
export function parseFilename(rawName: string): ParsedFilename {
  const base = rawName.replace(/\.[a-z0-9]{1,5}$/i, '');
  const chunks = base
    .split(/[-_–—.]+|\s{2,}/)
    .map((c) => c.trim())
    .filter(Boolean);

  let originalKey: string | undefined;
  let source: string | undefined;
  const rest: string[] = [];

  for (const chunk of chunks) {
    const keyMatch = chunk.match(KEY_RE);
    if (keyMatch && !originalKey && chunk.length <= 12) {
      const [, root, accidental, minor] = keyMatch;
      originalKey = `${root.toUpperCase()}${accidental || ''}${minor ? 'm' : ''}`;
      continue;
    }
    if (SOURCE_RE.test(chunk) && !source) {
      source = chunk;
      continue;
    }
    if (isJunkChunk(chunk)) continue;
    rest.push(chunk);
  }

  // Title heuristic: song titles are the FIRST meaningful chunk in almost every
  // real naming scheme (履海-A-原始和聲.pdf, 04-輕輕聽-D-陳天賜.pdf). Picking the
  // longest chunk instead wrongly prefers the ministry (原始和聲) over the song.
  // Only fall back to "longest" when the first chunk is a bare number/label.
  const first = rest[0];
  const title =
    first && /[\p{L}]{2,}/u.test(first)
      ? first
      : [...rest].sort((a, b) => b.length - a.length)[0];

  return {
    title: title?.trim(),
    originalKey,
    source,
    confidence: originalKey && title && title.length >= 2 ? 'medium' : 'low',
    usedChunks: rest,
    bareName: rest.length === 0, // nothing usable: no filename, or a pure hash
  };
}
