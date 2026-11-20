'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { LyricsEditor } from '@/components/LyricsEditor';
import { LyricsLookupDialog } from '@/components/LyricsLookupDialog';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Music2,
  Pencil,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { CFG } from '@/config';
import { supabase, type Song, type SongSheet } from '@/lib/supabase';
import { checkSize, fileToWebp, isImage, isPdf } from '@/lib/imageProcess';
import { renderPdfToWebp } from '@/lib/pdfRender';
import { extractPdfText } from '@/lib/pdfText';
import { inferMetaFromText, normaliseCjk } from '@/lib/sheetMeta';
import { convertChartToInline } from '@/lib/chartToInline';
import { deleteSongWithFiles, removeSheetPages, uploadSheetPages } from '@/lib/storage';
import { signPaths } from '@/lib/storage';
import { chordList, hasChords } from '@/lib/chords';
import { transposeKey, transposeLyrics } from '@/lib/transpose';
import { Button, Card, Field, Input, Label, Spinner } from '@/components/ui';
import { ChordLyrics } from '@/components/ChordLyrics';
import { TransposeControl } from '@/components/TransposeControl';
import { ImageLightbox } from '@/components/ImageLightbox';
import { ConfirmDelete, ConfirmDialog } from '@/components/ConfirmDialogs';
import { useToast } from '@/components/Toast';

type Editable = Pick<
  Song,
  'title' | 'lyrics' | 'original_key' | 'tags' | 'source' | 'composer' | 'lyricist'
>;

const emptyEditable: Editable = {
  title: '',
  lyrics: '',
  original_key: '',
  tags: null,
  source: '',
  composer: '',
  lyricist: '',
};

export default function SongDetailPage() {
  const router = useRouter();

  const search = useSearchParams();
  const id = search.get('id') ?? undefined;
  const { toast } = useToast();

  const [song, setSong] = useState<Song | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [editing, setEditing] = useState(false);
  const [lookupOpen, setLookupOpen] = useState(false);
  const [form, setForm] = useState<Editable>(emptyEditable);
  const [saving, setSaving] = useState(false);
  const [dupOpen, setDupOpen] = useState(false);

  const [sheets, setSheets] = useState<SongSheet[]>([]);
  const [thumbs, setThumbs] = useState<Map<string, string>>(new Map());
  const [lightboxAt, setLightboxAt] = useState<number | null>(null);
  const [addingPages, setAddingPages] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delBusy, setDelBusy] = useState(false);
  const [pageToDelete, setPageToDelete] = useState<SongSheet | null>(null);
  const [showChords, setShowChords] = useState(true);
  /**
   * Transposition for the read-only lyrics. Local to the page like `showChords`
   * — it is a viewing convenience, never written back to the song.
   */
  const [offset, setOffset] = useState(0);
  const objectUrls = useRef<string[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const [{ data: s }, { data: sh }] = await Promise.all([
      supabase().from('songs').select('*').eq('id', id).maybeSingle(),
      supabase().from('song_sheets').select('*').eq('song_id', id).order('page_number'),
    ]);
    if (!s) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    const row = s as Song;
    setSong(row);
    setForm({
      title: row.title,
      lyrics: row.lyrics ?? '',
      original_key: row.original_key ?? '',
      tags: row.tags,
      source: row.source ?? '',
      composer: row.composer ?? '',
      lyricist: row.lyricist ?? '',
    });
    const sheetRows = (sh as SongSheet[]) ?? [];
    setSheets(sheetRows);
    setLoading(false);

    if (sheetRows.length) {
      const signed = await signPaths(sheetRows.map((r) => r.file_url));
      setThumbs(signed);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    return () => objectUrls.current.forEach((u) => URL.revokeObjectURL(u));
  }, []);

  const save = async (skipDup = false) => {
    if (!song) return;
    if (!form.title.trim()) {
      toast('請輸入詩歌名稱。', 'error');
      return;
    }
    if (!skipDup) {
      const { data: same } = await supabase()
        .from('songs')
        .select('id, title')
        .ilike('title', form.title.trim())
        .limit(5);
      const clash = (same ?? []).some(
        (r: { id: string; title: string }) =>
          r.id !== song.id && r.title.trim() === form.title.trim(),
      );
      if (clash) {
        setDupOpen(true);
        return;
      }
    }
    setSaving(true);
    const tagsInput = Array.isArray(form.tags) ? form.tags.join('、') : (form.tags ?? '');
    const finalTags = (tagsInput as string)
      .split(/[,，、]/)
      .map((t) => t.trim())
      .filter(Boolean);

    const { error } = await supabase()
      .from('songs')
      .update({
        title: form.title.trim(),
        lyrics: (form.lyrics ?? '').trim() || null,
        original_key: form.original_key?.trim() || null,
        source: form.source?.trim() || null,
        composer: form.composer?.trim() || null,
        lyricist: form.lyricist?.trim() || null,
        tags: finalTags.length ? finalTags : null,
      })
      .eq('id', song.id);
    setSaving(false);
    if (error) {
      toast(`儲存失敗：${error.message}`, 'error');
      return;
    }
    setDupOpen(false);
    toast('已儲存', 'success');
    setEditing(false);
    void load();
  };

  /**
   * Fill empty song fields from an added PDF's own text layer.
   * Never overwrites what the user already entered.
   */
  const mergeSheetMeta = async (files: FileList) => {
    if (!song) return;
    const patch: Record<string, string> = {};
    let kind: string | null = null;

    for (const file of Array.from(files)) {
      if (!isPdf(file)) continue;
      const tl = await extractPdfText(file);
      if (!tl.usable) continue;
      const meta = inferMetaFromText(tl.text);
      const converted = convertChartToInline(tl.text);
      kind = converted.kind;
      if (meta.title && !song.title) patch.title = normaliseCjk(meta.title);
      if (meta.originalKey && !song.original_key) patch.original_key = meta.originalKey;
      if (meta.source && !song.source) patch.source = meta.source;
      // If this sheet is a plain chord chart and we have no lyrics yet, use them.
      if (!song.lyrics && converted.lyrics && converted.kind === 'chord_chart') {
        patch.lyrics = converted.lyrics;
      }
    }
    if (kind) patch.sheet_kind = kind;
    if (!Object.keys(patch).length) return;

    const { error } = await supabase().from('songs').update(patch).eq('id', song.id);
    if (!error) {
      const filled = Object.keys(patch).filter((k) => k !== 'sheet_kind');
      if (filled.length) toast(`已從樂譜補上：${filled.join('、')}`, 'success');
    }
  };

  const addPages = async (files: FileList) => {
    if (!song) return;
    setAddingPages(true);
    try {
      const blobs: Blob[] = [];
      for (const file of Array.from(files)) {
        const sizeErr = checkSize(file);
        if (sizeErr) throw new Error(`${file.name}：${sizeErr}`);
        if (isPdf(file)) {
          const res = await renderPdfToWebp(file);
          if (res.truncated) toast(`PDF 超過 ${CFG.PDF_MAX_PAGES} 頁，只加入前 ${CFG.PDF_MAX_PAGES} 頁`, 'info');
          blobs.push(...res.pages);
        } else if (isImage(file)) {
          blobs.push(await fileToWebp(file));
        } else {
          throw new Error(`${file.name}：只支援 JPG、PNG 或 PDF。`);
        }
      }
      if (!blobs.length) return;
      const start = sheets.length ? Math.max(...sheets.map((s) => s.page_number)) + 1 : 1;
      const uploaded = await uploadSheetPages(song.id, blobs.slice(0, CFG.PDF_MAX_PAGES), start);
      const { error } = await supabase()
        .from('song_sheets')
        .insert(
          uploaded.map((u) => ({
            song_id: song.id,
            sheet_type: 'page_image',
            file_url: u.path,
            page_number: u.page_number,
          })),
        );
      if (error) throw new Error(error.message);

      // Merge metadata from the added sheets. This is the two-sheet workflow:
      // a song may hold a chord chart AND a full score, and the fields should
      // reflect whichever sheet actually states them.
      await mergeSheetMeta(files);

      toast(`已加入 ${uploaded.length} 頁`, 'success');
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setAddingPages(false);
    }
  };

  const reorder = async (index: number, delta: number) => {
    const next = [...sheets];
    const j = index + delta;
    if (j < 0 || j >= next.length) return;
    [next[index], next[j]] = [next[j], next[index]];
    setSheets(next);
    // Persist with temporary negative slots to dodge unique-order conflicts.
    const updates = next.map((s, i) =>
      supabase()
        .from('song_sheets')
        .update({ page_number: -(i + 1) })
        .eq('id', s.id),
    );
    await Promise.all(updates);
    await Promise.all(
      next.map((s, i) =>
        supabase()
          .from('song_sheets')
          .update({ page_number: i + 1 })
          .eq('id', s.id),
      ),
    );
    toast('已更新頁序', 'success');
    void load();
  };

  const deletePage = async () => {
    if (!pageToDelete) return;
    setDelBusy(true);
    try {
      await removeSheetPages([pageToDelete.file_url]);
      const { error } = await supabase().from('song_sheets').delete().eq('id', pageToDelete.id);
      if (error) throw new Error(error.message);
      setPageToDelete(null);
      toast('已刪除頁面', 'success');
      void load();
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
    } finally {
      setDelBusy(false);
    }
  };

  const deleteSong = async () => {
    if (!song) return;
    setDelBusy(true);
    try {
      await deleteSongWithFiles(song.id);
      toast('已刪除詩歌', 'success');
      router.replace('/songs/');
    } catch (e) {
      toast(e instanceof Error ? e.message : String(e), 'error');
      setDelBusy(false);
      setDelOpen(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-12 text-sm text-[var(--muted-fg)]">
        <Spinner /> 載入中…
      </div>
    );
  }

  if (notFound || !song) {
    return (
      <div className="py-12 text-center">
        <p className="font-medium">找不到這首詩歌</p>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">可能已被刪除。</p>
        <Link href="/songs/" className="mt-3 inline-block text-sm text-[var(--accent)] underline">
          回詩歌庫
        </Link>
      </div>
    );
  }

  // Only whether chords exist matters now: the on-page chord inventory was
  // removed as noise, so a boolean is enough for the toggle.
  const chordCount = chordList(song.lyrics).length;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <Link
          href="/songs/"
          className="inline-flex min-h-[36px] items-center gap-1 text-sm text-[var(--muted-fg)] hover:text-[var(--fg)]"
        >
          <ArrowLeft size={15} /> 詩歌庫
        </Link>
        <div className="flex items-center gap-1">
          <Link href={`/view/?id=${song.id}`}>
            <Button variant="ghost" size="sm">
              <ExternalLink size={14} /> 全螢幕
            </Button>
          </Link>
          <Button variant="ghost" size="sm" onClick={() => setEditing((e) => !e)}>
            {editing ? <X size={14} /> : <Pencil size={14} />}
            {editing ? '取消' : '編輯'}
          </Button>
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-500"
            onClick={() => setDelOpen(true)}
          >
            <Trash2 size={14} />
          </Button>
        </div>
      </div>

      {!editing ? (
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{song.title}</h1>
          <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-[var(--muted-fg)]">
            {song.original_key ? (
              <span className="rounded-md bg-[var(--soft)] px-2 py-0.5 font-mono text-[var(--fg)]">
                原調 {song.original_key}
              </span>
            ) : null}
            {song.source ? <span>{song.source}</span> : null}
            {song.composer ? <span>曲：{song.composer}</span> : null}
            {song.lyricist ? <span>詞：{song.lyricist}</span> : null}
            {song.tags?.map((t) => (
              <span key={t} className="rounded-full border border-[var(--border)] px-2 py-0.5">
                {t}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <Card className="space-y-3.5 p-4">
          <Field label="詩歌名稱" required>
            <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>原調</Label>
              <Input
                className="font-mono"
                value={form.original_key ?? ''}
                onChange={(e) => setForm({ ...form, original_key: e.target.value })}
              />
            </div>
            <div>
              <Label>出處</Label>
              <Input
                value={form.source ?? ''}
                onChange={(e) => setForm({ ...form, source: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-3 sm:col-span-2">
              <div>
                <Label>作曲</Label>
                <Input
                  value={form.composer ?? ''}
                  onChange={(e) => setForm({ ...form, composer: e.target.value })}
                />
              </div>
              <div>
                <Label>作詞</Label>
                <Input
                  value={form.lyricist ?? ''}
                  onChange={(e) => setForm({ ...form, lyricist: e.target.value })}
                />
              </div>
            </div>
          </div>
          {/* Experimental: pull lyrics from the LRCLIB community database.
              Opens a picker rather than inserting directly, since coverage and
              Chinese script (simplified vs traditional) are both unreliable. */}
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-[var(--muted-fg)]">歌詞</span>
            {/* `primary` is the Action role here — the filled accent button.
                There is no separate "action" variant in ui.tsx. */}
            <Button variant="primary" onClick={() => setLookupOpen(true)}>
              <Music2 size={14} />
              搜尋歌詞
              <span className="rounded-full bg-white/25 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                實驗
              </span>
            </Button>
          </div>
          {/* Same editor as 新增詩歌: one component means the chord tooling
              cannot exist on one page and be missing on the other. */}
          <LyricsEditor
            value={form.lyrics ?? ''}
            onChange={(next) => setForm({ ...form, lyrics: next })}
            songKey={form.original_key ?? song?.original_key ?? ''}
            rows={14}
          />
          <div>
            <Label>標籤（逗號分隔）</Label>
            <Input
              value={(form.tags ?? []).join('、')}
              onChange={(e) => setForm({ ...form, tags: e.target.value.split(/[,，、]/) })}
            />
          </div>
          {lookupOpen ? (
            <LyricsLookupDialog
              title={form.title ?? ''}
              artist={form.composer ?? ''}
              onUse={(lyrics) => setForm((f) => ({ ...f, lyrics }))}
              onClose={() => setLookupOpen(false)}
            />
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditing(false)} disabled={saving}>
              取消
            </Button>
            <Button variant="primary" onClick={() => void save()} disabled={saving}>
              {saving ? <Spinner /> : <Save size={15} />} 儲存
            </Button>
          </div>
        </Card>
      )}

      {/* lyrcs */}
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">歌詞</h2>
          <div className="flex items-center gap-2">
            <TransposeControl
              baseKey={song.original_key ?? ''}
              offset={offset}
              onChange={setOffset}
            />
            {chordCount ? (
              <button
                onClick={() => setShowChords((v) => !v)}
                className={`flex min-h-[36px] items-center rounded-full px-3 text-[11px] font-medium transition-colors ${
                  showChords
                    ? 'bg-[var(--accent)] text-white'
                    : 'bg-[var(--soft)] text-[var(--muted-fg)]'
                }`}
              >
                和弦 {showChords ? '開' : '關'}
              </button>
            ) : null}
          </div>
        </div>
        <ChordLyrics
          lyrics={
            offset
              ? transposeLyrics(song.lyrics ?? '', offset, transposeKey(song.original_key ?? '', offset))
              : song.lyrics
          }
          showChords={showChords && hasChords(song.lyrics)}
        />
      </Card>

      {/* sheets */}
      <Card className="p-4">
        {song.sheet_kind === 'lead_sheet' ? (
          <p className="mb-3 rounded-lg bg-[var(--accent-soft)] px-3 py-2 text-[11px] leading-relaxed text-[var(--accent)]">
            此為五線譜／鋼琴伴奏譜。舞台上以<strong>樂譜影像</strong>為準；歌詞只是參考，未必完全準確。
          </p>
        ) : null}
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold">樂譜影像（{sheets.length} 頁）</h2>
          <label className="cursor-pointer">
            <input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              className="hidden"
              disabled={addingPages}
              onChange={(e) => {
                if (e.target.files?.length) void addPages(e.target.files);
                e.currentTarget.value = '';
              }}
            />
            <span className="inline-flex items-center gap-1 rounded-xl border border-[var(--border)] px-2.5 py-1.5 text-xs hover:bg-[var(--soft)]">
              {addingPages ? <Loader2 size={13} className="animate-spin" /> : <Plus size={13} />}
              {addingPages ? '處理中…' : '加入樂譜頁面'}
            </span>
          </label>
        </div>

        {sheets.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[var(--border)] px-3 py-6 text-center text-sm text-[var(--muted-fg)]">
            還沒有樂譜影像。
          </p>
        ) : (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {sheets.map((s, i) => (
              <li
                key={s.id}
                className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--border)] bg-white"
              >
                {thumbs.get(s.file_url) ? (
                  // Reading a sheet means reading the whole page: tapping a
                  // thumbnail opens it full screen, scroll-zoom included.
                  <button
                    type="button"
                    onClick={() => setLightboxAt(i)}
                    aria-label={`放大第 ${i + 1} 頁`}
                    className="block h-full w-full cursor-zoom-in"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={thumbs.get(s.file_url)}
                      alt={`第 ${s.page_number} 頁`}
                      className="h-full w-full object-cover"
                    />
                  </button>
                ) : (
                  <div className="grid h-full place-items-center text-[10px] text-slate-400">
                    無法載入
                  </div>
                )}
                <span className="absolute left-1 top-1 rounded bg-black/60 px-1 font-mono text-[10px] text-white">
                  {i + 1}
                </span>
                <div className="absolute inset-x-1 bottom-1 flex justify-between transition-opacity group-focus-within:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100">
                  <div className="flex gap-1">
                    <button
                      onClick={() => void reorder(i, -1)}
                      disabled={i === 0}
                      className="grid h-9 w-9 place-items-center rounded bg-black/60 text-white disabled:opacity-30"
                      aria-label="前移"
                    >
                      <ChevronUp size={11} />
                    </button>
                    <button
                      onClick={() => void reorder(i, 1)}
                      disabled={i === sheets.length - 1}
                      className="grid h-9 w-9 place-items-center rounded bg-black/60 text-white disabled:opacity-30"
                      aria-label="後移"
                    >
                      <ChevronDown size={11} />
                    </button>
                  </div>
                  <button
                    onClick={() => setPageToDelete(s)}
                    className="grid h-9 w-9 place-items-center rounded bg-rose-600/85 text-white"
                    aria-label="刪除頁面"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-[11px] text-[var(--muted-fg)]">
          可加入 PDF 或圖片。同一首歌可放置多份樂譜（例如和弦譜＋鋼琴譜），頁面會依序排列。
        </p>
        <p className="mt-1 text-[11px] text-[var(--muted-fg)]">
          本系統不保留原始 PDF，請自行備份原檔。
        </p>
      </Card>

      <ConfirmDialog
        open={dupOpen}
        title={`已存在同名詩歌《${form.title.trim()}》`}
        body="同名詩歌可以並存。仍要儲存嗎？"
        confirmLabel="仍要儲存"
        busy={saving}
        onCancel={() => setDupOpen(false)}
        onConfirm={() => void save(true)}
      />

      <ConfirmDelete
        open={Boolean(pageToDelete)}
        title={`刪除第 ${pageToDelete?.page_number ?? ''} 頁？`}
        body="此頁影像會一併從儲存空間移除。"
        busy={delBusy}
        onCancel={() => setPageToDelete(null)}
        onConfirm={() => void deletePage()}
      />

      <ConfirmDelete
        open={delOpen}
        title={`刪除《${song.title}》？`}
        body="樂譜影像會先從儲存空間刪除，然後才刪除詩歌紀錄；此操作無法復原。"
        busy={delBusy}
        onCancel={() => setDelOpen(false)}
        onConfirm={() => void deleteSong()}
      />

      {/* Full-screen sheet viewer. Uses the same signed URLs as the thumbnails,
          so no extra network round-trip. */}
      {lightboxAt !== null ? (
        <ImageLightbox
          pages={sheets
            .filter((sh) => thumbs.get(sh.file_url))
            .map((sh) => ({ url: thumbs.get(sh.file_url) as string, page: sh.page_number }))}
          index={lightboxAt}
          onClose={() => setLightboxAt(null)}
          onIndexChange={setLightboxAt}
          viewerHref={`/view/?id=${song.id}`}
          hint="按右上角可翻頁及切換和弦"
        />
      ) : null}
    </div>
  );
}
