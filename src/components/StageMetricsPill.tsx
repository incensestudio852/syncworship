'use client';

import type { ListItem } from '@/lib/supabase';
import { dynamicBand, keyLabel, transitionLabel } from '@/lib/setlist';

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
  pushedDown,
}: {
  item: ListItem;
  /** Key actually being sung (service key, shifted by the transpose offset). */
  transposedKey: string;
  offset: number;
  hidden: boolean;
  onToggleHidden: () => void;
  onOpenDetails: () => void;
  /** True while an incoming-push banner occupies the top of the stage. */
  pushedDown?: boolean;
}) {
  const tempo = item.tempo ?? item.songs?.tempo ?? null;

  /**
   * Flow rows, each with its own dynamic.
   *
   * The pill mirrors the arrangement sheet: one line per section, with its
   * intensity on the right and an arrow showing the order, so the leader can
   * see where the song is heading without opening anything.
   */
  // How this song hands over to the next one — the last thing a leader needs to
  // know before the song ends, so it belongs at the end of the same pill.
  const transition = transitionLabel(item.transition);

  const rows = (item.flow ?? []).map((step) => ({
    label: `${step.section}${step.count && step.count > 1 ? `x${step.count}` : ''}`,
    dynamic: step.dynamic ?? '',
    band: dynamicBand(step.dynamic),
  }));

  if (hidden) {
    return (
      <button
        onClick={onToggleHidden}
        aria-label="顯示歌曲資訊"
        className={`absolute right-2 ${pushedDown ? 'top-[60px]' : 'top-10'} z-20 grid h-8 w-8 place-items-center rounded-lg border border-[var(--border)] bg-[var(--card)]/95 text-[var(--muted-fg)] shadow-sm backdrop-blur sm:hidden`}
      >
        <span className="text-[10px] font-semibold">i</span>
      </button>
    );
  }

  return (
    <div className={`absolute right-2 ${pushedDown ? 'top-[60px]' : 'top-10'} z-20 max-w-[70vw] rounded-xl border border-[var(--border)] bg-[var(--card)]/95 px-2 py-1.5 shadow-sm backdrop-blur sm:hidden`}>
      {/* One value per line: key / tempo / dynamic / flow read as a stacked
          column, which is easier to scan mid-song than a wrapped row. */}
      <div className="flex items-start justify-between gap-1">
        <button
          onClick={onOpenDetails}
          className="flex min-w-0 flex-1 flex-col items-start gap-[3px] text-left"
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

          {/* one section per line: name, then its dynamic, arrow to the next */}
          <span className="max-h-[101px] w-full overflow-y-auto">
          {rows.map((r) => (
            <span key={r.label + r.dynamic} className="flex w-full items-center gap-1 leading-tight">
              <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-[var(--muted-fg)]">
                {r.label}
              </span>
              {r.dynamic ? (
                <span className={`shrink-0 font-mono text-[10px] ${r.band.text}`}>
                  {r.dynamic}
                </span>
              ) : null}
            </span>
          ))}
          </span>

          {transition ? (
            <span className="flex w-full items-center gap-1 border-t border-[var(--border)] pt-1 leading-tight">
              <span className="shrink-0 text-[9px] text-[var(--muted-fg)]">接</span>
              <span className="min-w-0 truncate text-[10px] text-[var(--gold)]">
                {transition}
                {item.transition_note ? ` · ${item.transition_note}` : ''}
              </span>
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
