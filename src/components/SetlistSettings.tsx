'use client';

import { useEffect, useState } from 'react';
import { ArrowUp, ChevronDown, Plus, Trash2, X } from 'lucide-react';
import type { FlowStep, ListItem } from '@/lib/supabase';
import {
  FLOW_SECTIONS,
  KEY_OPTIONS,
  TRANSITIONS,
  dynamicBand,
  keyLabel,
  normaliseDynamic,
} from '@/lib/setlist';

/**
 * Per-song setlist settings.
 *
 * Collapsed it shows only what a leader reads at a glance: key, tempo and the
 * flow summary. Expanded it becomes the arrangement *table*, because a real
 * worship flow sheet gives every section its own intensity and remark:
 *
 *   Intro  3    [Ab-Bb-Eb] Piano and second key on
 *   V1     3    AG in
 *   V1     4    Drum in
 *   Cx2    3    Accent on the first beat
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

  /**
   * Flow lives in LOCAL state, not straight off the prop.
   *
   * `onChange` is debounced (~450ms) before it reaches the database and back
   * down as a new `item`. Reading `item.flow` meant two quick taps of +V1 both
   * built from the same stale array, so the second overwrote the first and the
   * list appeared not to change. Local state applies each tap immediately; the
   * effect below re-syncs if the row is changed elsewhere (realtime, another
   * tab).
   */
  /**
   * Counts are legacy. Earlier builds collapsed repeats into `count: 2` with no
   * way to edit or remove the extra pass, so on load each count is expanded into
   * real rows — one row per pass. The first keeps the dynamics; the copies start
   * blank so they can be set individually.
   */
  const expandCounts = (steps: FlowStep[]): FlowStep[] =>
    steps.flatMap((st) => {
      const n = Math.max(1, st.count ?? 1);
      return Array.from({ length: n }, (_, k) => ({
        ...st,
        count: 1,
        dynamic: k === 0 ? st.dynamic : '',
        remark: k === 0 ? st.remark : '',
      }));
    });

  const [flow, setFlowLocal] = useState<FlowStep[]>(() =>
    expandCounts(item.flow ?? []),
  );
  const flowKey = JSON.stringify(item.flow ?? []);
  useEffect(() => {
    setFlowLocal(expandCounts(item.flow ?? []));
    // Only when the persisted value actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowKey]);

  const setFlow = (next: FlowStep[]) => {
    setFlowLocal(next);
    onChange({ flow: next });
  };

  const patchRow = (i: number, patch: Partial<FlowStep>) => {
    const next = [...flow];
    next[i] = { ...next[i], ...patch };
    setFlow(next);
  };

  /**
   * Add a section. One tap, one row.
   *
   * Repeating a section is expressed by tapping again, which adds another row
   * in the order sung — the flow is a table of passes, and each pass can carry
   * its own dynamic and remark.
   */
  const addRow = (section: string) =>
    setFlow([...flow, { section, count: 1, dynamic: '', remark: '' }]);

  const moveRow = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= flow.length) return;
    const next = [...flow];
    [next[i], next[j]] = [next[j], next[i]];
    setFlow(next);
  };

  const summary = flow
    .map((s) => s.section)
    .join(' → ');

  return (
    <div className="mt-1.5 space-y-1.5">
      {/* ---- collapsed: key · tempo · flow summary ---- */}
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        <select
          value={serviceKey}
          onChange={(e) => onChange({ service_key: e.target.value || null })}
          aria-label="演唱調性"
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

        {flow.length ? (
          <span className="min-w-0 flex-1 truncate rounded-md bg-[var(--soft)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--muted-fg)]">
            {summary}
          </span>
        ) : null}
      </div>

      <input
        value={item.notes ?? ''}
        onChange={(e) => onChange({ notes: e.target.value })}
        placeholder="整首備註…"
        aria-label="備註"
        className="h-8 w-full bg-transparent text-[11px] leading-none text-[var(--muted-fg)] outline-none placeholder:text-[var(--muted-fg)]/60 focus:text-[var(--fg)] [@media(hover:none)]:text-base [@media(hover:none)]:leading-tight sm:text-[11px]"
      />

      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex min-h-[28px] items-center gap-1 text-[11px] text-[var(--accent)] hover:underline"
      >
        <ChevronDown className={`transition-transform ${open ? 'rotate-180' : ''}`} size={12} />
        {open ? '收起段落 Flow' : '編輯段落 Flow'}
        {saving ? <span className="text-[var(--muted-fg)]">儲存中…</span> : null}
      </button>

      {open ? (
        <div className="space-y-2 rounded-xl border border-[var(--border)] bg-[var(--soft)]/50 p-2.5">
          <div className="flex flex-wrap gap-1">
            {FLOW_SECTIONS.map((sec) => (
              <button
                key={sec}
                onClick={() => addRow(sec)}
                className="min-h-[28px] rounded-md border border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
              >
                +{sec}
              </button>
            ))}
            <button
              onClick={() => addRow('')}
              className="min-h-[28px] rounded-md border border-dashed border-[var(--border)] bg-[var(--card)] px-2 text-[11px] text-[var(--muted-fg)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
            >
              +自訂
            </button>
          </div>

          {flow.length ? (
            <div>
              {/* headers mirror the worship sheet the team already uses */}
              <div className="flex items-center gap-1 pb-1 text-[10px] font-medium text-[var(--muted-fg)]">
                <span className="w-4" />
                <span className="w-[74px]">段落</span>
                <span className="w-10 text-center">動態</span>
                <span className="flex-1">備註</span>
                <span className="w-4" />
              </div>

              <ul className="space-y-1">
                {flow.map((step, i) => {
                  const band = dynamicBand(step.dynamic);
                  return (
                    <li key={i} className="flex items-center gap-1">
                      {/* Flow rows are not draggable — each tap moves the row
                          up one place — so an arrow states what actually happens. */}
                      <button
                        onClick={() => moveRow(i, -1)}
                        aria-label="上移"
                        title="上移"
                        disabled={i === 0}
                        className="grid h-7 w-4 shrink-0 place-items-center text-[var(--muted-fg)] hover:text-[var(--accent)] disabled:opacity-25 disabled:hover:text-[var(--muted-fg)]"
                      >
                        <ArrowUp size={12} />
                      </button>

                      <input
                        value={step.section}
                        onChange={(e) => patchRow(i, { section: e.target.value })}
                        placeholder="段落"
                        aria-label="段落名稱"
                        className="h-7 w-[74px] shrink-0 rounded-md border border-[var(--border)] bg-[var(--card)] px-1 text-center font-mono text-[11px] outline-none focus:border-[var(--accent)]"
                      />

                      <input
                        value={step.dynamic ?? ''}
                        onChange={(e) =>
                          patchRow(i, { dynamic: normaliseDynamic(e.target.value) })
                        }
                        placeholder="1-10"
                        aria-label={`${step.section} 動態級數`}
                        className={`h-7 w-10 shrink-0 rounded-md border border-[var(--border)] bg-[var(--card)] px-0.5 text-center font-mono text-[11px] outline-none focus:border-[var(--accent)] ${band.text}`}
                      />

                      <input
                        value={step.remark ?? ''}
                        onChange={(e) => patchRow(i, { remark: e.target.value })}
                        placeholder="此段提示…"
                        aria-label={`${step.section} 備註`}
                        className="h-7 min-w-0 flex-1 rounded-md border border-[var(--border)] bg-[var(--card)] px-1.5 text-[11px] outline-none focus:border-[var(--accent)]"
                      />

                      <button
                        onClick={() => setFlow(flow.filter((_, j) => j !== i))}
                        aria-label={`移除 ${step.section || '段落'}`}
                        className="grid h-7 w-4 shrink-0 place-items-center text-[var(--muted-fg)] hover:text-rose-500"
                      >
                        <Trash2 size={11} />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : (
            <p className="text-[11px] leading-relaxed text-[var(--muted-fg)]">
              點選上方段落建立流程。每個段落可各自設定動態級數與備註；同一段落可加入多次（例如 C 兩次、B 一次）。
            </p>
          )}

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
    <div className="flex flex-wrap items-center justify-center gap-1">
      {TRANSITIONS.map((t) => (
        <button
          key={t.id}
          onClick={() => onChange(value === t.id ? null : t.id, t.id === 'other' ? note : null)}
          aria-pressed={value === t.id}
          className={`min-h-[28px] rounded-md border px-2 text-[11px] ${
            value === t.id
              ? 'border-[var(--accent)]/40 bg-[var(--accent-soft)] font-medium text-[var(--accent)]'
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
          aria-label="過場說明"
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
          className="grid h-7 w-5 place-items-center text-[var(--muted-fg)] hover:text-rose-500"
        >
          <X size={12} />
        </button>
      ) : null}
    </div>
  );
}
