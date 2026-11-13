'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  Check,
  FileText,
  ImagePlus,
  Loader2,
  ScanText,
  Sparkles,
  Trash2,
  Upload,
  ZoomIn,
} from 'lucide-react';
import Link from 'next/link';
import { CFG } from '@/config';
import { Button, Card, Field, Input, Label, Spinner } from '@/components/ui';
import { ConfirmDialog } from '@/components/ConfirmDialogs';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { checkSize, fileToWebp, isImage, isPdf } from '@/lib/imageProcess';
import { renderPdfToWebp } from '@/lib/pdfRender';
import { ocrImage } from '@/lib/ocr';
import { extractPdfText } from '@/lib/pdfText';
import { inferMetaFromText, normaliseCjk } from '@/lib/sheetMeta';
import { LanguagePicker } from '@/components/LanguagePicker';
import { ImageLightbox } from '@/components/ImageLightbox';
import { DEFAULT_OCR_LANGS, type OcrLangId } from '@/config';
import { convertChartToInline } from '@/lib/chartToInline';
import { parseFilename } from '@/lib/parseFilename';
import { uploadSheetPages } from '@/lib/storage';

type ReadyPage = { blob: Blob; url: string; page: number };
type Stage = 'idle' | 'rendering' | 'uploading' | 'saving';

export default function NewSongPage() {
  return (
    <Suspense fallback={<div className="py-10 text-sm text-[var(--muted-fg)]">載入中…</div>}>
      <NewSongForm />
    </Suspense>
  );
}

function NewSongForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { toast } = useToast();

  const [title, setTitle] = useState(params.get('title') ?? '');
  const [originalKey, setOriginalKey] = useState('');
  const [lyrics, setLyrics] = useState('');
  const lyricsRef = useRef('');
  // Mirrors of the text fields so async inference can fill only untouched ones.
  const titleRef = useRef('');
  const keyRef = useRef('');
  const sourceRef = useRef('');
  const [tags, setTags] = useState('');
  const [source, setSource] = useState('');
  const [composer, setComposer] = useState('');
  const [lyricist, setLyricist] = useState('');

  const [highlight, setHighlight] = useState<Set<string>>(new Set());
  const [pages, setPages] = useState<ReadyPage[]>([]);
  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [ocrState, setOcrState] = useState<'idle' | 'running' | 'done' | 'failed'>('idle');
  const [ocrPage, setOcrPage] = useState<{ at: number; of: number } | null>(null);
  const [ocrUnconfirmed, setOcrUnconfirmed] = useState(false);
  const [chordCount, setChordCount] = useState(0);
  const [titleNeedsInput, setTitleNeedsInput] = useState(false);
  const [ocrLangs, setOcrLangs] = useState<OcrLangId[]>([...DEFAULT_OCR_LANGS]);
  const [sourceNote, setSourceNote] = useState<'text_layer' | 'ocr' | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const ocrLangsRef = useRef<OcrLangId[]>([...DEFAULT_OCR_LANGS]);
  const [sheetKind, setSheetKind] = useState<'chord_chart' | 'lead_sheet' | 'lyrics_only'>('lyrics_only');
  const lyricsTouched = useRef(false);

  const [truncateInfo, setTruncateInfo] = useState<{ pages: Blob[]; total: number } | null>(null);
  const [dupOpen, setDupOpen] = useState(false);

  const pagesRef = useRef<ReadyPage[]>([]);
  const ocrRef = useRef<Promise<void> | null>(null);
  pagesRef.current = pages;
  useEffect(() => {
    return () => pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
  }, []);

  const flag = (k: string) => setHighlight((s) => new Set(s).add(k));

  /**
   * OCR page 1 with the chosen languages, then convert to inline chords.
   * Shared by the initial upload and the "re-run OCR" button so both paths
   * behave identically.
   */
  const updateLangs = useCallback((next: OcrLangId[]) => {
    ocrLangsRef.current = next;
    setOcrLangs(next);
  }, []);

  /**
   * Read the PDF text layer first; only OCR page 1 when there is no usable
   * text (a scan or a photo). Text layers give perfect chords and lyrics.
   */
  const runTextThenOcr = useCallback(
    async (file: File, pageImages: Blob[], langs: OcrLangId[]) => {
      setOcrState('running');
      if (isPdf(file)) {
        const tl = await extractPdfText(file);
        if (tl.usable) {
          setSourceNote('text_layer');
          const meta = inferMetaFromText(tl.text);
          // The sheet's own title beats a hash filename. Only fill fields the
          // user hasn't touched, and flag them 請確認 like any other guess.
          const flagged = new Set<string>();
          if (meta.title && !titleRef.current) {
            const t = normaliseCjk(meta.title);
            titleRef.current = t;
            setTitle(t);
            setTitleNeedsInput(false);
            flagged.add('title');
          }
          if (meta.originalKey && !keyRef.current) {
            keyRef.current = meta.originalKey;
            setOriginalKey(meta.originalKey);
            flagged.add('original_key');
          }
          if (meta.source && !sourceRef.current) {
            sourceRef.current = meta.source;
            setSource(meta.source);
            flagged.add('source');
          }
          if (flagged.size) setHighlight((prev) => new Set([...prev, ...flagged]));
          applyRecognisedText(tl.text);
          setOcrState('done');
          return;
        }
      }
      setSourceNote('ocr');
      await runOcr(pageImages, langs);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const applyRecognisedText = useCallback((raw: string) => {
    const converted = convertChartToInline(raw);
    lyricsRef.current = converted.lyrics;
    setLyrics(converted.lyrics);
    setChordCount(converted.chordsFound);
    setSheetKind(converted.kind);
    setOcrUnconfirmed(true);
    flag('lyrics');
    if (converted.kind === 'lead_sheet') {
      toast('此為五線譜／簡譜樂譜，只匯入歌詞；和弦請人手標註。', 'info');
    }
  }, []);

  /**
   * OCR the supplied page images (up to 3) and merge the text.
   *
   * A single-page chord chart needs one page; a multi-page score has lyrics on
   * every page, so OCR'ing only page 1 silently loses most of the song.
   */
  const runOcr = useCallback(
    async (images: Blob[], langs: OcrLangId[]) => {
      setOcrState('running');
      const texts: string[] = [];
      let firstError: string | null = null;
      const batch = images.slice(0, 3);
      setOcrPage(batch.length > 1 ? { at: 1, of: batch.length } : null);
      for (const [i, img] of batch.entries()) {
        setOcrPage(batch.length > 1 ? { at: i + 1, of: batch.length } : null);
        const out = await ocrImage(img, langs);
        if (out.error && !firstError) firstError = out.error;
        if (out.text.trim()) texts.push(out.text.trim());
      }
      setOcrPage(null);
      if (!texts.length) {
        setOcrState('failed');
        if (firstError) toast(`未能辨識：${firstError}`, 'error');
        return;
      }
      setOcrState('done');
      applyRecognisedText(texts.join('\n\n'));
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const onFile = useCallback(
    async (file: File) => {
      setError(null);
      const sizeErr = checkSize(file);
      if (sizeErr) {
        setError(sizeErr);
        return;
      }

      // Filename prefill (non-authoritative; everything is user-confirmable)
      const parsed = parseFilename(file.name);
      const flagged = new Set<string>();
      if (parsed.title && !titleRef.current) {
        titleRef.current = parsed.title;
        setTitle(parsed.title);
        flagged.add('title');
      }
      if (parsed.originalKey && !keyRef.current) {
        keyRef.current = parsed.originalKey;
        setOriginalKey(parsed.originalKey);
        flagged.add('original_key');
      }
      if (parsed.source && !sourceRef.current) {
        sourceRef.current = parsed.source;
        setSource(parsed.source);
        flagged.add('source');
      }
      if (flagged.size) setHighlight(flagged);
      // A hash-like filename carries no title. Say so instead of leaving the
      // user staring at an empty required field (and never save the hash).
      if (parsed.bareName && !titleRef.current) {
        setTitleNeedsInput(true);
      }

      setStage('rendering');
      try {
        let blobs: Blob[] = [];
        if (isPdf(file)) {
          const res = await renderPdfToWebp(file, (done, total) => setProgress({ done, total }));
          blobs = res.pages;
          if (res.truncated) setTruncateInfo({ pages: res.pages, total: res.totalPages });
        } else if (isImage(file)) {
          blobs = [await fileToWebp(file)];
        } else {
          setError('只支援 JPG、PNG 或 PDF 檔案。');
          setStage('idle');
          return;
        }

        if (!blobs.length) {
          setError('檔案沒有可用的頁面。');
          setStage('idle');
          return;
        }

        const ready = blobs.map((b, i) => ({
          blob: b,
          url: URL.createObjectURL(b),
          page: i + 1,
        }));
        pagesRef.current.forEach((p) => URL.revokeObjectURL(p.url));
        setPages(ready);

        // Prefer the PDF's own text layer: it is exact and instant, while OCR
        // on the same page introduces errors. Fall back to OCR for scans.
        ocrRef.current = runTextThenOcr(file, ready.map((r) => r.blob), ocrLangsRef.current);
      } catch (e) {
        setError(`處理檔案失敗：${e instanceof Error ? e.message : String(e)}`);
      } finally {
        setStage('idle');
        setProgress(null);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [title, originalKey, source],
  );

  const removePage = (idx: number) => {
    setPages((prev) => {
      URL.revokeObjectURL(prev[idx].url);
      return prev.filter((_, i) => i !== idx).map((p, i) => ({ ...p, page: i + 1 }));
    });
  };

  const doSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError(titleNeedsInput ? '檔名沒有辨識到詩歌名稱，請手動輸入名稱後再儲存。' : '請輸入詩歌名稱。');
      return;
    }
    if (!pages.length) {
      setError('請先選擇樂譜檔案（JPG / PNG / PDF）。');
      return;
    }

    // Duplicate-title check BEFORE anything is written.
    const { data: same, error: dupErr } = await supabase()
      .from('songs')
      .select('id, title')
      .ilike('title', title.trim())
      .limit(5);
    if (dupErr) {
      setError(`檢查重複名稱失敗：${dupErr.message}`);
      return;
    }
    if (same && same.some((s: { title: string }) => s.title.trim() === title.trim())) {
      setDupOpen(true);
      return;
    }
    await saveNow();
  };

  const saveNow = async () => {
    setDupOpen(false);
    setSaving(true);
    try {
      // The OCR of page 1 is what fills the lyrics field. Saving before it
      // settles is how the first E2E upload stored a song with no lyrics.
      if (ocrRef.current) {
        setStage('uploading');
        await ocrRef.current;
        ocrRef.current = null;
      }
      // Re-read the field after OCR resolved.
      const finalLyrics = lyricsRef.current.trim();
      const tagArr = tags
        .split(/[,，、]/)
        .map((t) => t.trim())
        .filter(Boolean);

      const { data: song, error: songErr } = await supabase()
        .from('songs')
        .insert({
          title: title.trim(),
          lyrics: finalLyrics || null,
          ocr_langs: ocrLangsRef.current,
          sheet_kind: sheetKind,
          original_key: originalKey.trim() || null,
          tags: tagArr.length ? tagArr : null,
          source: source.trim() || null,
          composer: composer.trim() || null,
          lyricist: lyricist.trim() || null,
        })
        .select('id')
        .single();
      if (songErr || !song) throw new Error(`建立詩歌失敗：${songErr?.message ?? ''}`);
      const songId = (song as { id: string }).id;

      setStage('uploading');
      const uploaded = await uploadSheetPages(songId, pages.map((p) => p.blob));

      setStage('saving');
      const { error: sheetErr } = await supabase().from('song_sheets').insert(
        uploaded.map((u) => ({
          song_id: songId,
          sheet_type: 'page_image',
          file_url: u.path,
          page_number: u.page_number,
        })),
      );
      if (sheetErr) throw new Error(`儲存樂譜紀錄失敗：${sheetErr.message}`);

      toast('已新增詩歌', 'success');
      router.push(`/songs/detail/?id=${songId}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      toast(msg, 'error');
      setStage('idle');
      setSaving(false);
    }
  };

  const busy = stage !== 'idle' || saving;
  const ocrPageLabel = ocrPage ? `（第 ${ocrPage.at} / ${ocrPage.of} 頁）` : '';
  const ocrChip = useMemo(() => {
    if (ocrState === 'running')
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--accent-soft)] px-2 py-0.5 text-[10px] text-[var(--accent)]">
          <Loader2 size={10} className="animate-spin" /> 辨識中…
        </span>
      );
    if (ocrState === 'done')
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
          <ScanText size={10} />
          {sourceNote === 'text_layer' ? '直接讀取 PDF 文字' : 'OCR 辨識'}
          {sheetKind === 'lead_sheet'
            ? ' · 五線譜：只匯入歌詞'
            : chordCount
              ? ` · ${chordCount} 個和弦`
              : ' · 純歌詞'}
          ，請核對
        </span>
      );
    if (ocrState === 'failed')
      return <span className="text-[10px] text-[var(--muted-fg)]">未能辨識，請自行輸入</span>;
    return null;
  }, [ocrState]);

  return (
    <div className="space-y-5">
      <Link
        href="/songs/"
        className="inline-flex min-h-[36px] items-center gap-1 text-sm text-[var(--muted-fg)] hover:text-[var(--fg)]"
      >
        <ArrowLeft size={15} /> 詩歌庫
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">新增詩歌</h1>
        <p className="mt-0.5 text-sm text-[var(--muted-fg)]">
          上傳樂譜後，系統會轉成網頁影像；原始 PDF 不會被保存。
        </p>
      </div>

      {/* 1 — file */}
      <Card className="space-y-2 p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium text-[var(--muted-fg)]">識別語言：</span>
          <span className="text-[11px] text-[var(--muted-fg)]">可多選，每種語言首次辨識需下載語言資料</span>
        </div>
        <LanguagePicker value={ocrLangs} onChange={updateLangs} disabled={busy} />
        <div className="mt-3">
          <Label>樂譜檔案（JPG / PNG / PDF）</Label>
        </div>
        <label
          className={`mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors ${
            busy ? 'pointer-events-none opacity-60' : 'border-[var(--border)] hover:border-[var(--accent)]'
          }`}
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault();
            const f = e.dataTransfer.files?.[0];
            if (f) void onFile(f);
          }}
        >
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void onFile(f);
              e.currentTarget.value = '';
            }}
          />
          {stage === 'rendering' ? (
            <>
              <Spinner size={20} />
              <span className="text-sm">
                {progress ? `轉換頁面中 ${progress.done}/${progress.total}…` : '讀取檔案中…'}
              </span>
            </>
          ) : (
            <>
              <Upload size={22} className="text-[var(--muted-fg)]" />
              <span className="text-sm font-medium">點擊選擇或拖放檔案</span>
              <span className="text-[11px] text-[var(--muted-fg)]">
                上限 10MB · PDF 最多 {CFG.PDF_MAX_PAGES} 頁 · 自動壓縮為 WebP
              </span>
            </>
          )}
        </label>

        <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--muted-fg)]">
          <FileText size={11} /> 本系統不保留原始 PDF，請自行備份原檔。
        </p>

        {error ? (
          <p className="mt-2 rounded-lg bg-rose-500/10 px-3 py-2 text-sm text-rose-600 dark:text-rose-400">
            {error}
          </p>
        ) : null}

        {pages.length ? (
          <div className="mt-3">
            <div className="mb-1.5 flex items-center justify-between">
              <span className="text-[11px] text-[var(--muted-fg)]">共 {pages.length} 頁</span>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => {
                    if (pages.length) void runOcr(pages.map((p) => p.blob), ocrLangsRef.current);
                  }}
                  disabled={ocrState === 'running'}
                  className="text-[11px] text-[var(--accent)] hover:underline disabled:opacity-50"
                >
                  {ocrState === 'running' ? '辨識中…' : '重新辨識歌詞'}
                </button>
              <button
                onClick={() => {
                  pages.forEach((p) => URL.revokeObjectURL(p.url));
                  setPages([]);
                }}
                className="text-[11px] text-[var(--muted-fg)] hover:text-rose-500"
              >
                清除全部
              </button>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
              {pages.map((p, i) => (
                <div
                  key={p.url}
                  className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-[var(--border)] bg-white"
                >
                  <button
                    onClick={() => setPreviewIndex(i)}
                    className="block h-full w-full cursor-zoom-in"
                    aria-label={`預覽第 ${i + 1} 頁`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.url} alt={`第 ${i + 1} 頁`} className="h-full w-full object-cover" />
                    <span className="absolute inset-0 flex items-center justify-center bg-black/0 text-white opacity-0 transition-all group-hover:bg-black/25 group-hover:opacity-100">
                      <ZoomIn size={18} />
                    </span>
                  </button>
                  <span className="pointer-events-none absolute left-1 top-1 rounded bg-black/55 px-1 font-mono text-[10px] text-white">
                    {i + 1}
                  </span>
                  <button
                    onClick={() => removePage(i)}
                    className="absolute right-1 top-1 rounded bg-black/55 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                    aria-label="移除這頁"
                  >
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Card>

      {/* OCR status sits between the upload and the title fields: recognition
          starts on upload, so its progress belongs next to where the file went. */}
      {ocrState !== 'idle' ? (
        <div
          className={`flex items-start gap-2.5 rounded-xl border px-3.5 py-3 ${
            ocrState === 'running'
              ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)]'
              : ocrState === 'done'
                ? 'border-emerald-500/30 bg-emerald-500/10'
                : 'border-amber-500/30 bg-amber-500/10'
          }`}
          role="status"
          aria-live="polite"
        >
          {ocrState === 'running' ? (
            <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-[var(--accent)]" />
          ) : ocrState === 'done' ? (
            <ScanText size={18} className="mt-0.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-amber-600 dark:text-amber-400" />
          )}
          <div className="min-w-0 flex-1">
            <p
              className={`text-sm font-semibold ${
                ocrState === 'running'
                  ? 'text-[var(--accent)]'
                  : ocrState === 'done'
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-amber-700 dark:text-amber-300'
              }`}
            >
              {ocrState === 'running'
                ? `正在辨識歌詞${ocrPageLabel}`
                : ocrState === 'done'
                  ? '已辨識歌詞，請核對'
                  : '未能辨識，請自行輸入歌詞'}
            </p>
            <p className="mt-0.5 text-xs text-[var(--muted-fg)]">
              {ocrState === 'running'
                ? '掃描樂譜需要 20–40 秒，完成後會自動填入下方欄位。你可以先填寫其他資料。'
                : ocrState === 'done'
                  ? sourceNote === 'text_layer'
                    ? '直接讀取 PDF 文字，準確度較高。'
                    : sheetKind === 'lead_sheet'
                      ? '此為五線譜／簡譜，只匯入歌詞文字。'
                      : '辨識結果可能有錯字或漏字，儲存前請檢查。'
                  : '可能是圖片太模糊或空白頁，請自行輸入。'}
            </p>
          </div>
        </div>
      ) : null}

      {/* 2 — metadata */}
      <Card className="space-y-3.5 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold">詩歌資料</h2>
          {highlight.size ? (
            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400">
              <Sparkles size={10} /> 由檔名推測，請確認
            </span>
          ) : null}
        </div>

        <Field
          label="詩歌名稱"
          required
          highlight={highlight.has('title')}
          hint={titleNeedsInput ? '檔名沒有歌名，請自行輸入' : undefined}
        >
          <Input
            value={title}
            onChange={(e) => {
              titleRef.current = e.target.value;
              setTitle(e.target.value);
              setHighlight((s) => {
                const n = new Set(s);
                n.delete('title');
                return n;
              });
            }}
            placeholder="例如：奇異恩典"
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="原調" highlight={highlight.has('original_key')}>
            <Input
              value={originalKey}
              onChange={(e) => {
                keyRef.current = e.target.value;
                setOriginalKey(e.target.value);
                setHighlight((s) => {
                  const n = new Set(s);
                  n.delete('original_key');
                  return n;
                });
              }}
              placeholder="G / Bb / Em"
              className="font-mono"
            />
          </Field>
          <Field label="出處" highlight={highlight.has('source')}>
            <Input
              value={source}
              onChange={(e) => {
                sourceRef.current = e.target.value;
                setSource(e.target.value);
                setHighlight((s) => {
                  const n = new Set(s);
                  n.delete('source');
                  return n;
                });
              }}
              placeholder="例：讚美之泉"
            />
          </Field>
        </div>

      </Card>

      <Card className="space-y-3.5 p-4">
        <div>
          <Label>
            歌詞（可含和弦）
          </Label>
          <textarea
            value={lyrics}
            onChange={(e) => {
              lyricsTouched.current = true;
              lyricsRef.current = e.target.value;
              setLyrics(e.target.value);
              setOcrUnconfirmed(false);
              setHighlight((s) => {
                const n = new Set(s);
                n.delete('lyrics');
                return n;
              });
            }}
            rows={10}
            placeholder={'和弦寫在音節前，例如：\n[G]奇異恩典 [C]何等甘[G]甜'}
            className="w-full rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 font-mono text-[13px] leading-relaxed outline-none focus:border-[var(--accent)]"
          />
          <p className="mt-1 text-[11px] text-[var(--muted-fg)]">
            和弦語法：[G] 放在字前，舞台上可一鍵切換顯示或隱藏。
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label>作曲</Label>
            <Input value={composer} onChange={(e) => setComposer(e.target.value)} />
          </div>
          <div>
            <Label>作詞</Label>
            <Input value={lyricist} onChange={(e) => setLyricist(e.target.value)} />
          </div>
        </div>

        <div>
          <Label>標籤</Label>
          <Input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="以逗號分隔，例如：敬拜, 聖誕, 快歌"
          />
          <p className="mt-1 text-[11px] text-[var(--muted-fg)]">
            逗號或頓號皆可：敬拜, 聖誕、快歌
          </p>
        </div>
      </Card>

      <div className="sticky bottom-0 -mx-3 flex items-center gap-2 border-t border-[var(--border)] bg-[var(--bg)]/95 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur sm:-mx-5 sm:px-5">
        <Link href="/songs/" className="flex-1 sm:flex-none">
          <Button variant="secondary" className="w-full" disabled={busy}>
            取消
          </Button>
        </Link>
        <Button variant="primary" className="flex-1 sm:flex-none" onClick={() => void doSave()} disabled={busy}>
          {busy ? <Spinner /> : <Check size={16} />}
          {stage === 'uploading'
            ? '上傳樂譜中…'
            : stage === 'saving'
              ? '儲存中…'
              : busy
                ? '處理中…'
                : '儲存詩歌'}
        </Button>
      </div>

      {/* page preview */}
      {previewIndex !== null ? (
        <ImageLightbox
          pages={pages.map((p) => ({ url: p.url, page: p.page }))}
          index={previewIndex}
          onClose={() => setPreviewIndex(null)}
          onIndexChange={setPreviewIndex}
        />
      ) : null}

      <ConfirmDialog
        open={dupOpen}
        title={`已存在同名詩歌《${title.trim()}》`}
        body="同名詩歌可以並存。仍要儲存這首嗎？"
        confirmLabel="仍要儲存"
        onCancel={() => setDupOpen(false)}
        onConfirm={() => void saveNow()}
        busy={saving}
      />

      <ConfirmDialog
        open={Boolean(truncateInfo)}
        title="PDF 頁數超過上限"
        body={
          <>
            此 PDF 共有 {truncateInfo?.total} 頁，系統只匯入前 {CFG.PDF_MAX_PAGES} 頁。
            如需完整樂譜，請拆分檔案後再上傳。
          </>
        }
        confirmLabel={`只匯入前 ${CFG.PDF_MAX_PAGES} 頁`}
        cancelLabel="重新選擇"
        onCancel={() => {
          pages.forEach((p) => URL.revokeObjectURL(p.url));
          setPages([]);
          setTruncateInfo(null);
        }}
        onConfirm={() => setTruncateInfo(null)}
      />
    </div>
  );
}
