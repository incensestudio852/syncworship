/**
 * CantonHymn lyric lookup (client side).
 *
 * The browser cannot call CantonHymn directly — their API sends no CORS
 * header — so requests go to our own `/api/cantonhymn` Pages Function, which
 * proxies upstream from the same origin.
 *
 * Lookup is by TITLE, because that is all the user has when filling in a new
 * song. CantonHymn addresses songs as `/song/<percent-encoded title>/`, so the
 * title IS the slug for the common case; when it isn't (duplicate titles get a
 * suffix, translations differ), the request simply returns not_found and the
 * user edits the lyrics by hand as before.
 */

export type CantonHymnSong = {
  title: string | null;
  lyrics: string;
  key: string | null;
  composer: string | null;
  lyricist: string | null;
  translator: string | null;
  language: string | null;
  album: string | null;
  year: string | null;
  sourceUrl: string | null;
};

export type LookupResult =
  | { status: 'found'; song: CantonHymnSong }
  | { status: 'not_found' }
  | { status: 'error'; message: string };

/**
 * Candidate slugs for a title, most likely first.
 *
 * Chinese titles are their own slug ("大山為我挪開" -> percent-encoded title).
 * Latin titles are NOT: the site transliterates to lowercase-hyphenated
 * ("Warrior Bride" lives at /song/warrior-bride/), so the literal title 404s.
 * Both shapes are tried in order; a hit on any of them stops the search.
 */
export function slugCandidates(title: string): string[] {
  const t = title.trim();
  const out = [t];

  // Lowercase, hyphens for whitespace and punctuation — the observed Latin form.
  const slugged = t
    .normalize('NFKC')
    .toLowerCase()
    .replace(/['’"]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{Script=Han}a-z0-9-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  if (slugged && slugged !== t) out.push(slugged);

  return out;
}

/**
 * Trim what a lookup costs before it is made.
 *
 * A search needs a real title: single characters match almost everything and
 * would produce a wrong song rather than no song, which is worse than nothing.
 */
export function canLookup(title: string): boolean {
  const t = title.trim();
  return t.length >= 2;
}

export async function fetchLyrics(title: string, signal?: AbortSignal): Promise<LookupResult> {
  if (!canLookup(title)) return { status: 'not_found' };

  // Try each slug shape. A 404 just means "try the next spelling"; a network or
  // upstream error is reported immediately so a real outage isn't mistaken for
  // a missing song.
  for (const slug of slugCandidates(title)) {
    let res: Response;
    try {
      res = await fetch(`/api/cantonhymn?slug=${encodeURIComponent(slug)}`, { signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') return { status: 'error', message: '已取消' };
      return { status: 'error', message: '無法連線，請檢查網絡。' };
    }

    if (res.status === 404) continue;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return { status: 'error', message: '回應格式有誤。' };
    }

    if (!res.ok) {
      const err = (body as { error?: string })?.error ?? 'unknown';
      return { status: 'error', message: `查詢失敗（${err}）。` };
    }

    const song = body as CantonHymnSong;
    if (song?.lyrics?.trim()) return { status: 'found', song };
  }

  return { status: 'not_found' };
}

/**
 * CantonHymn marks sections as bare lines (`Verse`, `Chorus`, `Bridge`), which
 * this app also understands. The one difference is that some entries put a
 * repeat count on the same line; normalise to the bracketed marker the app
 * renders as a chip.
 */
export function normaliseLyrics(lyrics: string): string {
  return lyrics
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => {
      const t = line.trim();
      const m = t.match(/^(verse|chorus|pre-chorus|bridge|intro|outro|interlude|instrumental|tag|ending|refrain)\b\s*(\d+)?$/i);
      if (!m) return line;
      const name = m[1].replace(/^\w/, (c) => c.toUpperCase());
      return `[${name}${m[2] ? ` ${m[2]}` : ''}]`;
    })
    .join('\n')
    // Section markers are their own block: collapse the blank lines the source
    // leaves around them so the stage view doesn't show double gaps.
    .replace(/\n{3,}/g, '\n\n');
}
