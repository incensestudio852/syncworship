import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/** Thrown by feature pages when env vars are missing; App shows a setup screen. */
export const isConfigured = Boolean(url && anon);
export const missingEnvMessage =
  '尚未設定 Supabase 連線。請在 .env.local 或 Cloudflare Pages 環境變數加入 NEXT_PUBLIC_SUPABASE_URL 與 NEXT_PUBLIC_SUPABASE_ANON_KEY。';

let _client: SupabaseClient | null = null;

export function supabase(): SupabaseClient {
  if (!isConfigured) throw new Error(missingEnvMessage);
  if (!_client) {
    _client = createClient(url as string, anon as string, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
        storageKey: 'worship_auth',
      },
      realtime: { params: { eventsPerSecond: 10 } },
    });
  }
  return _client;
}

// ---------- shared types ----------
export type Song = {
  id: string;
  title: string;
  lyrics: string | null;
  original_key: string | null;
  tags: string[] | null;
  source: string | null;
  composer: string | null;
  lyricist: string | null;
  /** OCR languages chosen for this song, e.g. ['chi_tra','eng']. */
  ocr_langs?: string[] | null;
  /** What the upload detected: chord_chart | lead_sheet | lyrics_only. */
  sheet_kind?: string | null;
  created_at: string;
  updated_at: string;
};

export type SongSheet = {
  id: string;
  song_id: string;
  sheet_type: string;
  file_url: string; // storage path
  page_number: number;
  created_at: string;
};

export type WorshipList = {
  id: string;
  title: string;
  event_date: string;
  leader_name: string | null;
  created_at: string;
  updated_at: string;
};

export type ListItem = {
  id: string;
  list_id: string;
  song_id: string;
  selected_key: string | null;
  sort_order: number;
  notes: string | null;
  updated_at: string;
  songs?: Song | null;
};

export type LiveState = {
  list_id: string;
  active_song_id: string | null;
  pushed_by: string | null;
  pushed_by_name: string | null;
  updated_at: string;
};
