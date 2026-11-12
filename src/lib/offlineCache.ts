/**
 * Offline cache for the active list.
 *
 * - JSON (list + items + songs) is cached as plain responses.
 * - Sheet BYTES are cached by storage path. Signed URLs are NEVER cached (they expire).
 */
import type { ListItem, Song, WorshipList } from './supabase';

const CACHE = 'worship-offline-v1';

const listKey = (listId: string) => `/__offline/list/${listId}.json`;
const pageKey = (path: string) => `/__offline/page/${encodeURIComponent(path)}`;

export type CachedList = {
  list: WorshipList;
  items: ListItem[];
  songs: Song[];
  savedAt: number;
};

const hasCaches = () => typeof caches !== 'undefined';

export async function saveListCache(data: CachedList): Promise<void> {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(
      listKey(data.list.id),
      new Response(JSON.stringify(data), {
        headers: { 'content-type': 'application/json' },
      }),
    );
  } catch (e) {
    console.warn('saveListCache', e);
  }
}

export async function readListCache(listId: string): Promise<CachedList | null> {
  if (!hasCaches()) return null;
  try {
    const cache = await caches.open(CACHE);
    const res = await cache.match(listKey(listId));
    if (!res) return null;
    return (await res.json()) as CachedList;
  } catch {
    return null;
  }
}

/** Store page bytes under the storage path (sign-free, permanent key). */
export async function savePageBytes(path: string, blob: Blob): Promise<void> {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.put(
      pageKey(path),
      new Response(blob, { headers: { 'content-type': blob.type || 'image/webp' } }),
    );
  } catch (e) {
    console.warn('savePageBytes', e);
  }
}

export async function readPageBytes(path: string): Promise<Blob | null> {
  if (!hasCaches()) return null;
  try {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(pageKey(path));
    return hit ? await hit.blob() : null;
  } catch {
    return null;
  }
}

export async function hasPageBytes(path: string): Promise<boolean> {
  if (!hasCaches()) return false;
  try {
    const cache = await caches.open(CACHE);
    return Boolean(await cache.match(pageKey(path)));
  } catch {
    return false;
  }
}

export async function dropListCache(listId: string): Promise<void> {
  if (!hasCaches()) return;
  try {
    const cache = await caches.open(CACHE);
    await cache.delete(listKey(listId));
  } catch {
    /* ignore */
  }
}
