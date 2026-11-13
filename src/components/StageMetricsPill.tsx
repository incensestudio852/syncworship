'use client';

import type { ListItem } from '@/lib/supabase';
import { dynamicBand, flowLabel, keyLabel } from '@/lib/setlist';

/**
 * Compact live metrics, floating above the stage's list toggle.
 *
 * On a phone the sheet is the whole point, so nothing is reserved for metrics:
 * this pill floats over the corner and can be dismissed. It shows only what a
 * singer glances at mid-song — key, tempo, dynamic and the flow — and taps
 * through to the full panel.
 */
export function StageMetricsPill({
  item,
  transposedKey,
  offset,
  hidden,
  onToggleHidden,
  onOpenDetails,
}: {
  item: ListItem;
  /** Key actually being sung (service key, shifted by the transpose offset). */
  transposedKey: string;
  offset: number;
  hidden: boolean;
  onToggleHidden: () => void;
  onOpenDetails: () => void;
}) {
  const tempo = item.tempo ?? item.songs?.tempo ?? null;
  // The flow's first row usually sets the tone; fall back to the song-level
  // value for songs saved before flows carried their own dynamic.
  const dyn = item.flow?.find((f) => f.dynamic)?.dynamic ?? item.dynamic ?? null;
  const band = dynamicBand(dyn);
  const flow = flowLabel(item.flow);

  if (hidden) {
    return (
      <button
        onClick={onToggleHidden}
        aria-label="顯示歌曲資訊"
        className="absolute right-0 bottom-[84px] z-20 grid h-9 w-9 place-items-center rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--card)]/95 text-[var(--muted-fg)] shadow-sm backdrop-blur sm:hidden"
      >
        <span className="text-[10px] font-semibold">i</span>
      </button>
    );
  }

  return (
    <div className="absolute right-0 bottom-[84px] z-20 w-[min(62vw,230px)] rounded-l-xl border border-r-0 border-[var(--border)] bg-[var(--card)]/95 py-1.5 pl-2.5 pr-1 shadow-sm backdrop-blur sm:hidden">
      {/* One value per line: key / tempo / dynamic / flow read as a stacked
          column, which is easier to scan mid-song than a wrapped row. */}
      <div className="flex items-start justify-between gap-1">
        <button
          onClick={onOpenDetails}
          className="flex min-w-0 flex-1 flex-col items-start gap-0.5 text-left"
          aria-label="開啟歌曲詳情"
        >
          <span className="flex items-baseline gap-1">
            <span className="font-mono text-[12px] font-semibold text-[var(--fg)]">
              {keyLabel(transposedKey) || '—'}
            </span>
            {offset !== 0 ? (
              <span className="font-mono text-[10px] text-[var(--gold)]">
                {offset > 0 ? `+${offset}` : offset}
              </span>
            ) : null}
          </span>

          {tempo ? (
            <span className="font-mono text-[10px] leading-tight text-[var(--muted-fg)]">
              ♩ {tempo} BPM
            </span>
          ) : null}

          {dyn ? (
            <span className={`flex items-center gap-1 text-[10px] leading-tight ${band.text}`}>
              <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${band.swatch}`} />
              動態 {dyn}
              {band.label ? <span className="opacity-80">· {band.label}</span> : null}
            </span>
          ) : null}

          {flow ? (
            <span className="w-full truncate font-mono text-[10px] leading-tight text-[var(--muted-fg)]">
              {flow}
            </span>
          ) : null}
        </button>
        <button
          onClick={onToggleHidden}
          aria-label="隱藏歌曲資訊"
          className="grid h-6 w-6 shrink-0 place-items-center rounded text-[var(--muted-fg)] hover:bg-[var(--soft)]"
        >
          <span className="text-[11px]">×</span>
        </button>
      </div>
    </div>
  );
}
