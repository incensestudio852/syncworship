import type { ReactNode } from 'react';

/**
 * Wrap every case-insensitive occurrence of `query` in <mark>.
 *
 * Used by the song library so a result explains itself: seeing WHY a row matched
 * (in the title, the tag, or a lyric line) is what makes tag and lyrics search
 * trustworthy rather than mysterious. Returns plain text when the query is empty
 * so the no-search state renders exactly as before.
 */
export function highlight(text: string, query: string): ReactNode {
  const needle = query.trim();
  if (!needle || !text) return text;

  const haystack = text.toLowerCase();
  const target = needle.toLowerCase();
  const parts: ReactNode[] = [];
  let from = 0;
  let at = haystack.indexOf(target);

  while (at !== -1) {
    if (at > from) parts.push(text.slice(from, at));
    parts.push(
      <mark
        key={`${at}-${parts.length}`}
        className="rounded bg-[var(--accent-soft)] px-[1px] text-inherit"
      >
        {text.slice(at, at + target.length)}
      </mark>,
    );
    from = at + target.length;
    at = haystack.indexOf(target, from);
  }
  if (from < text.length) parts.push(text.slice(from));
  return parts.length ? parts : text;
}
