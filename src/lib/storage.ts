import { CFG } from '@/config';
import { supabase } from './supabase';

export const BUCKET = 'sheets';

/** Storage path convention: <songId>/p<n>.webp  (bucket 'sheets') */
export const sheetPath = (songId: string, page: number) => `${songId}/p${page}.webp`;

export async function uploadSheetPages(
  songId: string,
  blobs: Blob[],
  startPage = 1,
): Promise<{ path: string; page_number: number }[]> {
  const sb = supabase();
  const out: { path: string; page_number: number }[] = [];
  for (let i = 0; i < blobs.length; i++) {
    const page = startPage + i;
    const path = sheetPath(songId, page);
    const { error } = await sb.storage.from(BUCKET).upload(path, blobs[i], {
      contentType: 'image/webp',
      upsert: true,
      cacheControl: '31536000',
    });
    if (error) throw new Error(`第 ${page} 頁上傳失敗：${error.message}`);
    out.push({ path, page_number: page });
  }
  return out;
}

/** One batched createSignedUrls call. Paths stay as-is on failure (caller falls back to cache). */
export async function signPaths(paths: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(paths.filter(Boolean)));
  if (!unique.length) return map;
  const sb = supabase();
  const { data, error } = await sb.storage
    .from(BUCKET)
    .createSignedUrls(unique, CFG.SIGNED_URL_TTL_SECONDS);
  if (error || !data) {
    console.warn('signPaths failed', error);
    return map;
  }
  for (const row of data) {
    if (row.signedUrl && row.path) map.set(row.path, row.signedUrl);
  }
  return map;
}

export async function fetchSheetBytes(path: string): Promise<Blob | null> {
  const signed = await signPaths([path]);
  const url = signed.get(path);
  if (!url) return null;
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    return await res.blob();
  } catch {
    return null;
  }
}

/**
 * Delete order matters: files first, row second.
 * If file removal throws, we abort so the row (and paths) survive and a retry is possible.
 */
export async function deleteSongWithFiles(songId: string): Promise<void> {
  const sb = supabase();

  // pages live under sheets/<songId>/...
  const { data: list, error: listErr } = await sb.storage.from(BUCKET).list(songId, { limit: 100 });
  if (listErr) throw new Error(`讀取樂譜檔案失敗：${listErr.message}`);

  if (list && list.length) {
    const paths = list.map((f) => `${songId}/${f.name}`);
    const { error: rmErr } = await sb.storage.from(BUCKET).remove(paths);
    if (rmErr) throw new Error(`刪除樂譜檔案失敗：${rmErr.message}`);
  }

  const { error: rowErr } = await sb.from('songs').delete().eq('id', songId);
  if (rowErr) throw new Error(`刪除詩歌失敗：${rowErr.message}`);
}

export async function removeSheetPages(paths: string[]): Promise<void> {
  if (!paths.length) return;
  const { error } = await supabase().storage.from(BUCKET).remove(paths);
  if (error) throw new Error(`刪除樂譜檔案失敗：${error.message}`);
}
