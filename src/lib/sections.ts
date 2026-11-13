/**
 * Section markers.
 *
 * A worship chart is a sequence of labelled sections, and on stage the label is
 * what the team navigates by. Charts write them dozens of different ways —
 * `Chorus`, `CHORUS`, `(Chorus)`, `副歌`, `Chorus 2`, `Pre-Chorus` — so parsing
 * normalises them to one canonical label first, and display decides how to show
 * it.
 */

export type Section = {
  /** Canonical label, e.g. 'Chorus', 'Pre-Chorus', '副歌'. */
  label: string;
  /** Verse number when the source said V2 / Verse 2 / 主歌2. */
  number?: number;
};

type Rule = {
  /** Canonical label to emit. */
  label: string;
  /** Patterns tried against the normalised candidate. */
  patterns: RegExp[];
  /** True when a trailing digit means "verse 2", not "chorus 2". */
  numbered?: boolean;
};

/**
 * Ordered: the first match wins, so longer/more specific names come before the
 * short aliases they contain (Pre-Chorus before Chorus, Instrumental before
 * Interlude, Interlude after Intro).
 */
const RULES: Rule[] = [
  { label: 'Intro', patterns: [/^(intro|introduction|intro\s*\d*)$/i], numbered: true },
  { label: 'Pre-Chorus', patterns: [/^(pre[\s-]?chorus|prechorus|pre[\s-]?c|pre[\s-]?ch)$/i] },
  { label: 'Chorus', patterns: [/^(chorus|chrous|cho|ch)\b/i], numbered: true },
  { label: 'Verse', patterns: [/^(verse|v)(\s*\d+)?$/i], numbered: true },
  { label: 'Bridge', patterns: [/^(bridge|br)\b/i], numbered: true },
  { label: 'Instrumental', patterns: [/^(instrumental|instr|solo|guitar\s*solo|piano\s*solo)$/i] },
  { label: 'Interlude', patterns: [/^(interlude|inter)\b/i] },
  { label: 'Tag', patterns: [/^(tag|vamp|turnaround)$/i] },
  { label: 'Refrain', patterns: [/^(refrain|hook)$/i] },
  { label: 'Outro', patterns: [/^(outro|ending|coda|end)$/i] },
  { label: 'Free worship', patterns: [/^(free\s*worship|free)$/i] },
];

/** Chinese labels map straight to a canonical name, keeping the Chinese word. */
const CJK: { test: RegExp; label: string }[] = [
  { test: /^(前奏|序曲)/, label: '前奏' },
  { test: /^(導歌|前副歌|導唱)/, label: '導歌' },
  { test: /^副歌/, label: '副歌' },
  { test: /^主歌/, label: '主歌' },
  { test: /^(橋段|橋部|過橋)/, label: '橋段' },
  { test: /^(間奏|過門)/, label: '間奏' },
  { test: /^(尾聲|尾奏|結束)/, label: '尾聲' },
  { test: /^(自由敬拜|自由)/, label: '自由敬拜' },
];

/**
 * Words that look like headers but are not sections.
 *
 * `Piano`, `Guitar`, `Tempo` and `Key` are instrument/notation cues that belong
 * in remarks, and a bare number is an ordinary lyric line.
 */
const NOT_SECTIONS = /^(piano|guitar|drums?|bass|keys?|strings|tempo|key|time|capo|tuning|\d+(\.\d+)?)$/i;

/**
 * Parse a candidate line. Returns null when the line is not a section label.
 *
 * The input is the raw line; wrapping punctuation (`()`, `[]`, `【】`, `:`) and
 * a trailing repeat count (`Chorus x2`) are stripped before matching.
 */
export function parseSection(raw: string): Section | null {
  const stripped = raw
    .trim()
    .replace(/^[([【（{]+|[)\]}】）:：]+$/g, '')
    .replace(/\s*[x×]\s*\d+$/i, '')
    .trim();

  if (!stripped || stripped.length > 24) return null;
  if (NOT_SECTIONS.test(stripped)) return null;

  for (const c of CJK) {
    if (c.test.test(stripped)) return { label: c.label };
  }

  for (const rule of RULES) {
    for (const p of rule.patterns) {
      const m = stripped.match(p);
      if (!m) continue;
      // "Verse 2" / "V2" / "Chorus 3" carry the number in the label.
      const num = m[2] ? Number(m[2]) : /(\d+)\s*$/.exec(stripped)?.[1];
      const numbered = rule.numbered && num !== undefined;
      const label =
        numbered && rule.label === 'Verse'
          ? `Verse ${num}`
          : numbered && num !== undefined
            ? `${rule.label} ${num}`
            : rule.label;
      return { label, number: numbered ? Number(num) : undefined };
    }
  }

  return null;
}

/**
 * Short chip text for stage display.
 *
 * Long names are abbreviated so the chip stays small on a phone: Choruses are
 * the common case and get a single letter, matching how charts are annotated by
 * hand (`C`, `V1`, `B`).
 */
export function chipLabel(label: string): string {
  const map: Record<string, string> = {
    'Pre-Chorus': 'Pre-C',
    'Free worship': 'Free',
    Instrumental: 'Instr',
  };
  if (map[label]) return map[label];
  const numbered = label.match(/^(\w+) (\d+)$/);
  if (numbered) {
    const base = map[numbered[1]] ?? numbered[1];
    // Verse 2 -> V2, Chorus 2 -> C2, Bridge 2 -> B2
    const short =
      numbered[1] === 'Verse' ? 'V' : numbered[1] === 'Chorus' ? 'C' : numbered[1] === 'Bridge' ? 'B' : base;
    return `${short}${numbered[2]}`;
  }
  if (label === 'Chorus') return 'C';
  if (label === 'Verse') return 'V';
  if (label === 'Bridge') return 'B';
  return label;
}

/** Text with every detected section label replaced by a marker `[Chorus]`. */
export function markSections(text: string): string {
  return text
    .split('\n')
    .map((line) => {
      const sec = parseSection(line);
      if (!sec) return line;
      // Keep the original wording so the lyric still reads naturally, but make
      // the section explicit and machine-readable.
      return `[${sec.label}]`;
    })
    .join('\n');
}
