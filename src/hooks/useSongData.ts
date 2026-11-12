'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, type Song, type SongSheet } from '@/lib/supabase';
import { readPageBytes, hasPageBytes } from '@/lib/offlineCache';
import { signPaths } from '@/lib/storage';

export type SheetsResult = {
  sheets: SongSheet[];
  /** storage path -> displayable URL (signed now, or an object URL from cache) */
  urls: Map<string, string>;
  fromCache: boolean;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
};

/**
 * Loads a song's page sheets and makes them displayable.
 * Online: signed URLs. Offline / signing failure: cached bytes -> object URL.
 */
export function useSongSheets(songId: string | undefined, online: boolean): SheetsResult {
  const [sheets, setSheets] = useState<SongSheet[]>([]);
  const [urls, setUrls] = useState<Map<string, string>>(new Map());
  const [fromCache, setFromCache] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const objectUrls = useRef<string[]>([]);

  const revokeAll = () => {
    objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
    objectUrls.current = [];
  };

  const load = useCallback(async () => {
    if (!songId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await supabase()
      .from('song_sheets')
      .select('*')
      .eq('song_id', songId)
      .order('page_number', { ascending: true });

    const rows = (data as SongSheet[]) ?? [];
    setSheets(rows);

    if (rows.length === 0) {
      setUrls(new Map());
      setLoading(false);
      return;
    }

    const next = new Map<string, string>();
    let cached = false;

    if (!err && navigator.onLine) {
      const signed = await signPaths(rows.map((r) => r.file_url));
      signed.forEach((url, path) => next.set(path, url));
    }

    // Fill gaps from the Cache API (offline, or signing failed).
    for (const row of rows) {
      if (next.has(row.file_url)) continue;
      const blob = await readPageBytes(row.file_url);
      if (blob) {
        const u = URL.createObjectURL(blob);
        objectUrls.current.push(u);
        next.set(row.file_url, u);
        cached = true;
      }
    }

    setUrls(next); // never revoke before replacing: same-URL reloads would blank out
    setFromCache(cached);
    setError(err ? '無法載入樂譜，顯示已快取內容' : null);
    setLoading(false);
  }, [songId]);

  useEffect(() => {
    void load();
    return () => revokeAll();
  }, [load, online]);

  return { sheets, urls, fromCache, loading, error, reload: load };
}

/** Warm the Cache API for a song's pages (called when a list is opened). */
export async function prefetchSongPages(songId: string): Promise<void> {
  if (!navigator.onLine) return;
  const { data } = await supabase()
    .from('song_sheets')
    .select('file_url')
    .eq('song_id', songId)
    .order('page_number');
  const rows = data as { file_url: string }[] | null;
  if (!rows?.length) return;
  const missing: string[] = [];
  for (const r of rows) {
    if (!(await hasPageBytes(r.file_url))) missing.push(r.file_url);
  }
  if (!missing.length) return;
  const signed = await signPaths(missing);
  const { savePageBytes } = await import('@/lib/offlineCache');
  await Promise.all(
    missing.map(async (path) => {
      const url = signed.get(path);
      if (!url) return;
      try {
        const res = await fetch(url, { cache: 'no-store' });
        if (res.ok) await savePageBytes(path, await res.blob());
      } catch {
        /* non-fatal */
      }
    }),
  );
}

export type SongResult = {
  song: Song | null;
  loading: boolean;
  error: string | null;
};

export function useSong(songId: string | undefined): SongResult {
  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!songId) return;
    let alive = true;
    setLoading(true);
    supabase()
      .from('songs')
      .select('*')
      .eq('id', songId)
      .maybeSingle()
      .then(({ data, error: err }) => {
        if (!alive) return;
        if (err) setError(err.message);
        setSong((data as Song) ?? null);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [songId]);

  return { song, loading, error };
}
