/**
 * CantonHymn lyric lookup proxy.
 *
 * Why a Function at all: the app is a static export, so there is no server to
 * call. CantonHymn's own API (`/api/song-detail.php`) sends no
 * Access-Control-Allow-Origin header, so a browser fetch from our origin is
 * blocked — verified, not assumed. Cloudflare Pages Functions run at the edge
 * on the same origin as the site, which turns the cross-origin call into a
 * same-origin one and needs no CORS cooperation from CantonHymn.
 *
 * The Function is deliberately thin: it validates the slug, calls upstream, and
 * returns only the fields the app renders. Everything is read-only and cached.
 */

const UPSTREAM = 'https://cantonhymn.net/api/song-detail.php';

/**
 * CantonHymn slugs are song titles — mostly Chinese, sometimes ASCII, and
 * sometimes still percent-encoded. `URL.searchParams` DECODES the value before
 * this runs, so Han characters must be allowed here; percent signs stay allowed
 * for callers that pass a pre-encoded slug.
 *
 * Anything else is rejected rather than forwarded, because a permissive proxy
 * becomes a request-forgery surface.
 */
const SLUG_RE = /^[\p{Script=Han}A-Za-z0-9%._~()\[\]\- ]{1,300}$/u;

export async function onRequestGet({ request }: { request: Request }): Promise<Response> {
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') ?? '';

  if (!slug) {
    return json({ error: 'missing_slug' }, 400);
  }
  if (!SLUG_RE.test(slug)) {
    return json({ error: 'invalid_slug' }, 400);
  }

  const upstream = `${UPSTREAM}?slug=${encodeURIComponent(slug)}&songHierarchyType=parent`;

  let res: Response;
  try {
    res = await fetch(upstream, {
      headers: {
        // CantonHymn serves the same JSON to browsers; a plain UA avoids
        // looking like a scraper without pretending to be anything exotic.
        'User-Agent': 'SyncWorship/1.0 (worship sheet assistant)',
        Accept: 'application/json',
      },
      // Do not let a slow upstream hang the Function for the client's whole
      // timeout budget.
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    return json({ error: 'upstream_unreachable' }, 502);
  }

  if (!res.ok) {
    return json({ error: 'upstream_error', status: res.status }, 502);
  }

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return json({ error: 'upstream_bad_json' }, 502);
  }

  const song = (body as { data?: { currentSong?: Record<string, unknown> } })?.data?.currentSong;
  if (!song) {
    return json({ error: 'not_found' }, 404);
  }

  /**
   * CantonHymn's metadata is inconsistent: some fields arrive as parsed JSON
   * ({label}) or arrays of it, others as a PHP-printed string that merely looks
   * like one ("[{'id': 3, 'label': '國語'}]"). All three shapes are handled so a
   * change on their side degrades to a missing label rather than a broken page.
   */
  const firstLabel = (v: unknown): string | null => {
    if (typeof v === 'object' && v !== null) {
      const arr = Array.isArray(v) ? v : [v];
      const label = (arr[0] as { label?: unknown })?.label;
      return typeof label === 'string' && label ? label : null;
    }
    if (typeof v !== 'string') return null;
    const m = v.match(/'label'\s*:\s*'([^']*)'/) ?? v.match(/"label"\s*:\s*"([^"]*)"/);
    return m ? m[1] : null;
  };

  const lyrics = typeof song.lyrics === 'string' ? song.lyrics : '';

  return json(
    {
      title: typeof song.title === 'string' ? song.title : null,
      // CantonHymn already uses [G] inline chords, which is this app's native
      // format — no conversion needed.
      lyrics: lyrics.replace(/\r\n?/g, '\n'),
      key: firstLabel(song.songkey),
      composer: firstLabel(song.songcomposer),
      lyricist: firstLabel(song.songlyricist),
      translator: firstLabel(song.songtranslate),
      language: firstLabel(song.songlanguage),
      album: firstLabel(song.songalbum),
      year: firstLabel(song.songyear_of_publication),
      sourceUrl: typeof song.cmdalink === 'string' ? song.cmdalink : null,
    },
    200,
    // Lyrics rarely change; a day of edge caching keeps repeat lookups free and
    // is polite to a volunteer-run site.
    { 'Cache-Control': 'public, max-age=86400, s-maxage=86400' },
  );
}

function json(data: unknown, status: number, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      // The site itself is the only legitimate caller.
      'Access-Control-Allow-Origin': '*',
      ...headers,
    },
  });
}
