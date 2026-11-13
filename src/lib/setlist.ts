'use client';

/**
 * Setlist vocabulary.
 *
 * Transition and flow labels are content the worship team thinks in, not
 * implementation detail, so they live here once and every surface (editor,
 * stage, PNG export) reads the same list.
 */

/** How a song hands over to the next one. `other` reveals a free-text field. */
export const TRANSITIONS = [
  { id: 'stop', label: '直接停頓' },
  { id: 'pad', label: 'Pad 鋪底' },
  { id: 'segue', label: '無縫接歌' },
  { id: 'prayer', label: '禱告或讀經' },
  { id: 'other', label: '其他' },
] as const;

export type TransitionId = (typeof TRANSITIONS)[number]['id'];

export const transitionLabel = (id: string | null | undefined): string =>
  TRANSITIONS.find((t) => t.id === id)?.label ?? '';

/** Common arrangement sections offered as one-tap chips. */
export const FLOW_SECTIONS = [
  'Intro',
  'Interlude',
  'V1',
  'V2',
  'V3',
  'Pre-C',
  'C',
  'B',
  'Tag',
  '自由敬拜',
  'Outro',
] as const;

/**
 * Intensity band for a dynamic value.
 *
 * Accepts a range ("5-7") as well as a single level ("8") because real worship
 * charts write both. A range is banded by its midpoint, which is what a player
 * actually experiences across the section.
 */
export function dynamicBand(v: number | string | null | undefined): {
  label: string;
  swatch: string;
  text: string;
} {
  const n = dynamicMid(v);
  if (n === null) return { label: '', swatch: 'bg-[var(--soft)]', text: 'text-[var(--muted-fg)]' };
  if (n <= 3) return { label: '安靜', swatch: 'bg-[#3b6fd4]', text: 'text-[#3b6fd4]' };
  if (n <= 6) return { label: '推進', swatch: 'bg-[#d4a03b]', text: 'text-[#b07d1e]' };
  return { label: '全開', swatch: 'bg-[#d4483b]', text: 'text-[#c23a2e]' };
}

/** '7' -> 7, '5-7' -> 6, '' -> null. */
export function dynamicMid(v: number | string | null | undefined): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  const m = String(v).match(/(\d+)\s*[-–~]\s*(\d+)/);
  if (m) return (Number(m[1]) + Number(m[2])) / 2;
  const single = String(v).match(/(\d+)/);
  return single ? Number(single[1]) : null;
}

/** Normalise user input into '3' or '5-7'; returns '' for empty. */
export function normaliseDynamic(input: string): string {
  const s = input.replace(/[^\d\-–~]/g, '').replace(/[–~]/g, '-');
  const m = s.match(/^(\d{1,2})(?:-\d{0,2})?/);
  if (!m) return '';
  const lo = Math.min(10, Math.max(1, Number(m[1])));
  const range = s.match(/^\d{1,2}-(\d{1,2})/);
  if (range) {
    const hi = Math.min(10, Math.max(lo, Number(range[1])));
    return `${lo}-${hi}`;
  }
  return String(lo);
}

/** "Gm Key" / "A Key" — how the team says a key aloud. */
export function keyLabel(key: string | null | undefined): string {
  const k = (key ?? '').trim();
  return k ? `${k} Key` : '';
}

/** "Intro → V1 → C → V2 → Cx2" */
export function flowLabel(flow: { section: string; count?: number }[] | null | undefined): string {
  if (!flow?.length) return '';
  return flow
    .map((s) => (s.count && s.count > 1 ? `${s.section}x${s.count}` : s.section))
    .join(' → ');
}

/** Colour class for a key badge, so the same key always looks the same. */
export const KEY_OPTIONS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm',
] as const;
