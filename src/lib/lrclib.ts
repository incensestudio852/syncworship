/**
 * LRCLIB lyrics lookup — an experiment, wired behind an explicitly labelled
 * button so nothing is ever overwritten without the user picking a result.
 *
 * Why a direct fetch rather than a Worker proxy (unlike CantonHymn): LRCLIB
 * sends `access-control-allow-origin: *`, so the browser can call it directly.
 * No edge layer, no deploy step, nothing to maintain.
 *
 * Coverage warning: LRCLIB is a general music database. English worship is
 * well represented, Traditional-Chinese worship is not — 大山為我挪開 returns
 * nothing, and 恩典之路 comes back in SIMPLIFIED Chinese. Results are therefore
 * always shown to the user for confirmation before any text is inserted.
 */

const API = 'https://lrclib.net/api';

export type LrcLibHit = {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string | null;
  duration: number | null;
  instrumental: boolean;
  hasSynced: boolean;
  plainLyrics: string | null;
};

type RawHit = {
  id: number;
  trackName?: string;
  artistName?: string;
  albumName?: string | null;
  duration?: number | null;
  instrumental?: boolean;
  plainLyrics?: string | null;
  syncedLyrics?: string | null;
};

/**
 * Strip LRC timestamps (`[00:40.31]`) so the result is plain lyric lines.
 *
 * LRCLIB's `plainLyrics` field is not reliably plain — some entries carry
 * timestamps mid-line (e.g. "你是我的主\n[00:40.31] 引我走正義路"). Both
 * fields therefore go through this, not just the synced fallback.
 */
function stripTimestamps(s: string): string {
  return s
    .replace(/\[\d+:\d+(?:[.:]\d+)?\]\s?/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalise(r: RawHit): LrcLibHit {
  // Prefer plain lyrics, but always clean them: a timed sheet is useless in a
  // chord sheet field, and `plainLyrics` can still hold timestamps.
  const source = r.plainLyrics?.trim() || r.syncedLyrics?.trim() || '';
  const cleaned = source ? stripTimestamps(source) : '';
  return {
    id: r.id,
    trackName: r.trackName ?? '',
    artistName: r.artistName ?? '',
    albumName: r.albumName ?? null,
    duration: r.duration ?? null,
    instrumental: Boolean(r.instrumental),
    hasSynced: Boolean(r.syncedLyrics),
    plainLyrics: cleaned || null,
  };
}

/**
 * Search by free text. `q` matches title, artist and album, so passing
 * "<title> <artist>" finds more than the title alone.
 */
export async function searchLyrics(query: string, signal?: AbortSignal): Promise<LrcLibHit[]> {
  const q = query.trim();
  if (!q) return [];
  const res = await fetch(`${API}/search?${new URLSearchParams({ q })}`, { signal });
  if (!res.ok) throw new Error(`搜尋失敗 (${res.status})`);
  const rows = (await res.json()) as RawHit[];
  // Drop instrumentals and anything with no usable text up front, so the list
  // the user sees only contains things that can actually be inserted.
  return rows
    .map(normalise)
    .filter((h) => !h.instrumental && h.plainLyrics);
}

/**
 * Exact lookup by track + artist (+ album), which is far more precise than a
 * free-text search when the fields are already filled in.
 */
export async function getLyrics(
  trackName: string,
  artistName: string,
  albumName?: string,
  signal?: AbortSignal,
): Promise<LrcLibHit | null> {
  const params = new URLSearchParams({ track_name: trackName.trim(), artist_name: artistName.trim() });
  if (albumName?.trim()) params.set('album_name', albumName.trim());
  const res = await fetch(`${API}/get?${params}`, { signal });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`查詢失敗 (${res.status})`);
  return normalise((await res.json()) as RawHit);
}
