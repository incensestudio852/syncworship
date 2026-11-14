'use client';

import { useEffect, useRef, useState } from 'react';
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
  songKey,
  hidden,
  onToggleHidden,
  onOpenDetails,
  pushedDown,
}: {
  item: ListItem;
  /** Service key from the setlist — what this song is played in. */
  songKey: string;
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

  /**
   * Is the flow list taller than the space allowed for it?
   *
   * The pill is capped so it never covers the sheet, which means a long flow
   * gets silently clipped. Measuring the real content tells us whether to show
   * the "more below" affordances at all — a gradient over a short list would be
   * a permanent lie.
   */
  const scrollRef = useRef<HTMLSpanElement | null>(null);
  const [overflowing, setOverflowing] = useState(false);
  /** How many rows fit in the capped height — lets us say "5 / 11". */
  const [visible, setVisible] = useState(rows.length);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const measure = () => {
      const more = el.scrollHeight - el.clientHeight > 2;
      setOverflowing(more);
      if (!more) {
        setVisible(rows.length);
        return;
      }
      // Row height is uniform, so one known row height gives the count.
      const first = el.querySelector('span');
      const rowH = first ? first.getBoundingClientRect().height : 0;
      setVisible(rowH > 0 ? Math.max(1, Math.floor(el.clientHeight / rowH)) : rows.length);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [rows.length]);

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
          {/* The service key the user set in the list, and nothing else.
              Playback transpose (lyrics view) does not change what this song IS,
              and showing the shifted key here made the pill disagree with the
              setlist. The sung key lives in the lyrics view instead. */}
          <span className="flex items-baseline gap-1">
            <span className="font-mono text-[12px] font-semibold text-[var(--fg)]">
              {keyLabel(songKey) || '—'}
            </span>
          </span>

          {tempo ? (
            <span className="font-mono text-[10px] leading-tight text-[var(--muted-fg)]">
              ♩ {tempo} BPM
            </span>
          ) : null}

          {/* Flow list, capped so the pill stays compact. When it overflows the
              label carries an "x / y" count and the list fades at its bottom
              edge, so a clipped flow reads as "there is more" rather than as the
              whole song. */}
          {overflowing ? (
            <span className="flex w-full items-center justify-between leading-none">
              <span className="text-[9px] uppercase tracking-wide text-[var(--muted-fg)]">段落</span>
              <span className="font-mono text-[9px] text-[var(--muted-fg)]">
                {visible} / {rows.length}
              </span>
            </span>
          ) : null}
          <span className="relative flex w-full flex-col">
            <span
              ref={scrollRef}
              className="max-h-[101px] w-full flex-col overflow-y-auto"
              style={{
                // Bottom fade: a soft hint that rows continue past the cap.
                maskImage: overflowing
                  ? 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)'
                  : undefined,
                WebkitMaskImage: overflowing
                  ? 'linear-gradient(to bottom, #000 calc(100% - 28px), transparent 100%)'
                  : undefined,
              }}
            >
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
