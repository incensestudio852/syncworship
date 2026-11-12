import type { Song } from './supabase';

export type ChordSegment = { chord: string | null; text: string };
export type ChordLine = ChordSegment[];

const TOKEN = /\[([^\]]{1,12})\]/g;

/**
 * Splits chord-marked lyrics into per-line segments.
 * `[G]奇異恩典 [C]何等甘[G]甜` -> [[{G,'奇異恩典 '},{C,'何等甘'},{G,'甜'}]]
 */
export function parseChordLyrics(lyrics: string | null | undefined): ChordLine[] {
  if (!lyrics) return [];
  const lines = lyrics.replace(/\r\n/g, '\n').split('\n');
  return lines.map((line) => {
    if (!line.includes('[')) return [{ chord: null, text: line }];
    const segs: ChordSegment[] = [];
    let last = 0;
    let pendingChord: string | null = null;
    let m: RegExpExecArray | null;
    TOKEN.lastIndex = 0;
    while ((m = TOKEN.exec(line))) {
      const text = line.slice(last, m.index);
      if (text.length || pendingChord) segs.push({ chord: pendingChord, text });
      pendingChord = m[1];
      last = m.index + m[0].length;
    }
    const tail = line.slice(last);
    if (tail.length || pendingChord) segs.push({ chord: pendingChord, text: tail });
    return segs;
  });
}

export function chordList(lyrics: string | null | undefined): string[] {
  if (!lyrics) return [];
  const set = new Set<string>();
  const re = new RegExp(TOKEN);
  let m: RegExpExecArray | null;
  while ((m = re.exec(lyrics))) set.add(m[1]);
  return Array.from(set).slice(0, 24);
}

export function hasChords(lyrics: string | null | undefined) {
  return Boolean(lyrics && TOKEN.test(lyrics));
}

/** Relative time, zh-Hant: 剛剛 / 3 分鐘前 / 昨天 14:20 / 11月3日 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return '';
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 10) return '剛剛';
  if (s < 60) return `${s} 秒前`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} 分鐘前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小時前`;
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mi = String(d.getMinutes()).padStart(2, '0');
  const days = Math.floor(h / 24);
  if (days === 1) return `昨天 ${hh}:${mi}`;
  if (d.getFullYear() === new Date().getFullYear()) return `${mm}月${dd}日 ${hh}:${mi}`;
  return `${d.getFullYear()}年${mm}月${dd}日`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  if (!y || !m || !d) return iso;
  return `${y}年${Number(m)}月${Number(d)}日`;
}

export function weekdayZh(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return '';
  return ['週日', '週一', '週二', '週三', '週四', '週五', '週六'][d.getDay()];
}

export function todayISO(): string {
  const now = new Date();
  const off = now.getTimezoneOffset() * 60000;
  return new Date(now.getTime() - off).toISOString().slice(0, 10);
}

/** Sort helper: items may carry a joined `songs` object. */
export function sortItems<T extends { sort_order: number }>(items: T[]): T[] {
  return [...items].sort((a, b) => a.sort_order - b.sort_order);
}

export function songTitle(item: { songs?: Song | null; song_id: string }): string {
  return item.songs?.title ?? '（詩歌已刪除）';
}
