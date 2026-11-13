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
  { id: 'segue', label: '無縫接歌 Segue' },
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
  'Bridge',
  'Tag',
  'Outro',
] as const;

/** Intensity band for a 1-10 dynamic value. */
export function dynamicBand(v: number | null | undefined): {
  label: string;
  swatch: string;
  text: string;
} {
  if (!v) return { label: '', swatch: 'bg-[var(--soft)]', text: 'text-[var(--muted-fg)]' };
  if (v <= 3) return { label: '安靜', swatch: 'bg-[#3b6fd4]', text: 'text-[#3b6fd4]' };
  if (v <= 6) return { label: '推進', swatch: 'bg-[#d4a03b]', text: 'text-[#b07d1e]' };
  return { label: '全開', swatch: 'bg-[#d4483b]', text: 'text-[#c23a2e]' };
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
