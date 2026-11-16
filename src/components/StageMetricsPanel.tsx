'use client';

import { X } from 'lucide-react';
import type { ListItem } from '@/lib/supabase';
import { dynamicBand, flowLabel, keyLabel, transitionLabel } from '@/lib/setlist';

/**
 * Full song detail: flow, per-section remarks, transition and intensity.
 *
 * Phones open this as a bottom sheet (they have no room for a rail); tablets
 * and laptops render the same content in the right rail by default.
 */
export function StageMetricsPanel({
  item,
  sungKey,
  offset,
  onClose,
  variant = 'sheet',
}: {
  item: ListItem;
  sungKey: string;
  offset: number;
  onClose?: () => void;
  variant?: 'sheet' | 'rail';
}) {
  const tempo = item.tempo ?? item.songs?.tempo ?? null;
  const dyn = item.dynamic ?? item.songs?.dynamic ?? null;
  const band = dynamicBand(dyn);
  const flow = item.flow ?? [];
  const transition = transitionLabel(item.transition);

  // Each row carries its own intensity and remark, matching the flow sheet.
  const rows = flow.map((step, i) => ({
    key: `${step.section}${step.count && step.count > 1 ? step.count : ''}`,
    dynamic: step.dynamic ?? '',
    note: step.remark ?? '',
    band: dynamicBand(step.dynamic),
    i,
  }));

  return (
    <div
      className={
        variant === 'rail'
          ? 'flex min-h-0 flex-1 flex-col overflow-y-auto px-3 py-2'
          : 'max-h-[60vh] overflow-y-auto rounded-t-2xl border-t border-[var(--border)] bg-[var(--card)] px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-2'
      }
    >
      {variant === 'sheet' ? (
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium">歌曲詳情</span>
          <button
            onClick={onClose}
            aria-label="關閉詳情"
            className="grid h-8 w-8 place-items-center rounded-lg text-[var(--muted-fg)] hover:bg-[var(--soft)]"
          >
            <X size={15} />
          </button>
        </div>
      ) : null}

      {/* key · tempo · dynamic */}
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="rounded-md bg-[var(--soft)] px-1.5 py-0.5 font-mono font-medium">
          {keyLabel(sungKey) || '—'}
          {offset !== 0 ? (
            <span className="ml-1 text-[var(--live)]">{offset > 0 ? `+${offset}` : offset}</span>
          ) : null}
        </span>
        {tempo ? (
          <span className="font-mono text-[var(--muted-fg)]">♩ {tempo} BPM</span>
        ) : null}
        {dyn ? (
          <span className={`flex items-center gap-1 ${band.text}`}>
            <span className={`h-2 w-2 rounded-full ${band.swatch}`} />
            {dyn} · {band.label}
          </span>
        ) : null}
      </div>

      {/* flow + per-section remarks */}
      {rows.length ? (
        <div className="mt-2.5">
          <p className="text-[13px] font-medium uppercase tracking-wide text-[var(--muted-fg)]">
            段落流程
          </p>
          {/* Expanded for reading, not glancing: 30% larger than the collapsed
              pill, and the section column widened so longer labels still fit. */}
          <ul className="mt-1 space-y-1">
            {rows.map((r) => (
              <li key={`${r.key}-${r.i}`} className="flex items-start gap-1.5 text-[14px] leading-snug">
                <span className="w-16 shrink-0 font-mono text-[var(--muted-fg)]">{r.key}</span>
                <span className={`w-8 shrink-0 text-center font-mono ${r.band.text}`}>
                  {r.dynamic}
                </span>
                <span className="min-w-0 flex-1 text-[var(--fg)]">{r.note}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {transition ? (
        <div className="mt-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-fg)]">
            接下一首
          </p>
          <p className="mt-0.5 text-[11px]">
            {transition}
            {item.transition_note ? ` · ${item.transition_note}` : ''}
          </p>
        </div>
      ) : null}

      {item.notes ? (
        <div className="mt-2.5">
          <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--muted-fg)]">
            備註
          </p>
          <p className="mt-0.5 text-[11px] text-[var(--fg)]">{item.notes}</p>
        </div>
      ) : null}
    </div>
  );
}
