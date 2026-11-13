'use client';

import { useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { FlowStep, ListItem } from '@/lib/supabase';
import {
  FLOW_SECTIONS,
  KEY_OPTIONS,
  TRANSITIONS,
  dynamicBand,
  keyLabel,
} from '@/lib/setlist';
import { Input, Label } from '@/components/ui';

/**
 * Per-song setlist settings, following progressive disclosure:
 * collapsed shows only what a leader reads at a glance (key, tempo, one line of
 * remarks); everything structural lives behind 編輯段落 Flow.
 */
export function SetlistRowSettings({
  item,
  saving,
  onChange,
}: {
  item: ListItem;
  saving: boolean;
  onChange: (patch: Partial<ListItem>) => void;
}) {
  const [open, setOpen] = useState(false);

  const originalKey = item.songs?.original_key ?? '';
  const serviceKey = item.service_key ?? '';
  const tempo = item.tempo ?? item.songs?.tempo ?? null;
  const flow = item.flow ?? [];
  const dyn = item.dynamic ?? item.songs?.dynamic ?? null;
  const band = dynamicBand(dyn);

  const setFlow = (next: FlowStep[]) => onChange({ flow: next });

  const addSection = (section: string) => {
    const existing = flow.findIndex((s) => s.section === section);
    if (existing >= 0) {
      // Tapping the same chip again bumps its repeat count — that is how a
      // leader says "chorus twice", so it should not require a second control.
      const next = [...flow];
      next[existing] = { ...next[existing], count: (next[existing].count ?? 1) + 1 };
      setFlow(next);
      return;
    }
    setFlow([...flow, { section, count: 1 }]);
  };

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* ---- collapsed row: key · tempo · remarks ---- */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <label className="sr-only" htmlFor={`key-${item.id}`}>
          調性
        </label>
        <select
          id={`key-${item.id}`}
          value={serviceKey}
          onChange={(e) => onChange({ service_key: e.target.value || null })}
          className="h-7 w-[76px] shrink-0 truncate rounded-md border border-[var(--border)] bg-transparent px-1 font-mono text-[11px] text-[var(--fg)] outline-none focus:border-[var(--accent)]"
          title={originalKey ? `原調 ${keyLabel(originalKey)}` : '原調未設定'}
        >
          <option value="">{originalKey ? keyLabel(originalKey) : '原調'}</option>
          {KEY_OPTIONS.filter((k) => k !== originalKey).map((k) => (
            <option key={k} value={k}>
              {keyLabel(k)}
            </option>
          ))}
        </select>

        <input
          value={tempo ?? ''}
          onChange={(e) => {
            const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 3);
            onChange({ tempo: v ? Number(v) : null });
          }}
          inputMode="numeric"
          placeholder="BPM"
          aria-label="速度 BPM"
          className="h-7 w-12 rounded-md border border-[var(--border)] bg-transparent px-1 text-center font-mono text-[11px] outline-none focus:border-[var(--accent)]"
        />

        {dyn ? (
          <span className={`flex items-center gap-1 rounded-md px-1.5 py-0.5 ${band.text}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${band.swatch}`} />
            {dyn}
          </span>
        ) : null}

        {flow.length ? (
          <span className="truncate rounded-md bg-[var(--soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-fg)]">
            {flow.map((s) => (s.count && s.count > 1 ? `${s.section}x${s.count}` : s.section)).join(' → ')}
          </span>
        ) : null}
      </div>

      <input
        value={item.notes ?? ''}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="備註…"
        aria-label="備註"
        className="h-8 w-full bg-transparent text-[11px] leading-none text-[var(--muted-fg)] outline-none placeholder:text-[var(--muted-fg)]/60 focus:text-[var(--fg)] [@media(hover:none)]:text-base [@media(hover:none)]:leading-tight sm:text-[11px]"
      />

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[28px] items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
      >
        <ChevronDown
          size={12}
          className={`transition-transform ${open ? 'rotate-180' : ''}`}
        />
        {open ? '收起段落設定' : '編輯段落 Flow'}
        {saving ? <span className="text-[var(--muted-fg)]">儲存中…</span> : null}
      </button>

      {open ? (
        <div className="space-y-3 rounded-xl border border-[var(--border)] bg-[var(--soft)]/50 p-2.5">
          {/* ---- flow builder ---- */}
          <div>
            <Label>段落流程</Label>
            <div className="mt-1 flex flex-wrap gap-1">
              {FLOW_SECTIONS.map((sec) => (
                <button
                  key={sec}
                  onClick={() => addSection(sec)}
                  className="min-h-[28px] rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
                >
                  +{sec}
                </button>
              ))}
            </div>

            {flow.length ? (
              <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px]">
                {flow.map((step, i) => (
                  <span
                    key={`${step.section}-${i}`}
                    className="flex items-center gap-0.5 rounded-md bg-[var(--accent)]/10 px-1.5 py-0.5 font-mono text-[var(--accent)]"
                  >
                    {step.section}
                    <span className="ml-0.5 flex items-center">
                      {[1, 2, 3, 4].map((n) => (
                        <button
                          key={n}
                          onClick={() => {
                            const next = [...flow];
                            next[i] = { ...step, count: n };
                            setFlow(next);
                          }}
                          aria-label={`${step.section} 重複 ${n} 次`}
                          className={`px-0.5 ${
                            (step.count ?? 1) === n ? 'font-bold text-[var(--accent)]' : 'text-[var(--muted-fg)]'
                          }`}
                        >
                          x{n}
                        </button>
                      ))}
                    </span>
                    <button
                      onClick={() => setFlow(flow.filter((_, j) => j !== i))}
                      aria-label={`移除 ${step.section}`}
                      className="ml-0.5 text-[var(--muted-fg)] hover:text-rose-500"
                    >
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[11px] text-[var(--muted-fg)]">
                點選段落加入順序；再點一次同一段落會增加次數（Cx2）。
              </p>
            )}
          </div>

          {/* ---- dynamic ---- */}
          <div>
            <Label>動態級數（1 安靜 · 10 全開）</Label>
            <div className="mt-1 flex items-center gap-2">
              <input
                type="range"
                min={1}
                max={10}
                value={dyn ?? 5}
                onChange={(e) => onChange({ dynamic: Number(e.target.value) })}
                className="h-8 flex-1 accent-[var(--accent)]"
                aria-label="動態級數"
              />
              <span className={`flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium ${band.text}`}>
                <span className={`h-2 w-2 rounded-full ${band.swatch}`} />
                {dyn ?? 5} · {band.label}
              </span>
            </div>
          </div>

          {/* ---- per-section remarks ---- */}
          {flow.length ? (
            <div>
              <Label>段落備註</Label>
              <div className="mt-1 space-y-1">
                {flow.map((step, i) => {
                  const key = `${step.section}${step.count && step.count > 1 ? step.count : ''}`;
                  return (
                    <div key={`${key}-${i}`} className="flex items-center gap-1.5">
                      <span className="w-14 shrink-0 truncate font-mono text-[11px] text-[var(--muted-fg)]">
                        {key}
                      </span>
                      <Input
                        value={item.flow_notes?.[key] ?? ''}
                        onChange={(e) =>
                          onChange({
                            flow_notes: { ...(item.flow_notes ?? {}), [key]: e.target.value },
                          })
                        }
                        placeholder="此段提示…"
                        className="!min-h-[32px] !py-1 text-[11px]"
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/** The "add a transition between these two songs" affordance. */
export function TransitionPicker({
  value,
  note,
  onChange,
}: {
  value: string | null;
  note: string | null;
  onChange: (transition: string | null, note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(note ?? '');

  if (!open && !value) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-[30px] items-center gap-1 text-[11px] text-[var(--muted-fg)] hover:text-[var(--accent)]"
      >
        <Plus size={11} /> 加入過場指示
      </button>
    );
  }

  const active = TRANSITIONS.find((t) => t.id === value);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {TRANSITIONS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(value === t.id ? null : t.id, t.id === 'other' ? note : null)}
          aria-pressed={value === t.id}
          className={`min-h-[28px] rounded-md border px-2 text-[11px] ${
            value === t.id
              ? 'border-[var(--gold)] bg-[var(--gold)]/15 font-medium text-[var(--gold)]'
              : 'border-[var(--border)] text-[var(--muted-fg)] hover:bg-[var(--soft)]'
          }`}
        >
          {t.label}
        </button>
      ))}
      {active?.id === 'other' ? (
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => onChange('other', draft)}
          placeholder="說明…"
          className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-transparent px-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
        />
      ) : null}
      {value ? (
        <button
          onClick={() => {
            setOpen(false);
            onChange(null, null);
          }}
          aria-label="移除過場指示"
          className="text-[var(--muted-fg)] hover:text-rose-500"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}
