/**
 * OG share card image.
 *
 * Serves a 1200x630 PNG-ish SVG for a shared list, so WhatsApp / Signal show a
 * preview WITHOUT the recipient holding an account. That is the whole point of
 * a share link, and it is why this runs on a public Pages Function rather than
 * behind the app's login.
 *
 * What it exposes is deliberately narrow: `get_share_card()` returns only the
 * fields printed on the card (title, date, leader, description, song count).
 * Lyrics and sheet image paths are never reachable this way.
 *
 * SVG rather than raster: social scrapers accept image/svg+xml, it needs no
 * native image library at the edge, and the type scales crisply at any size.
 */

type ShareCard = {
  title: string;
  event_date: string | null;
  leader_name: string | null;
  description: string | null;
  song_count: number;
};

const W = 1200;
const H = 630;

/** Escape for XML text nodes — a stray `&` in a song title breaks the document. */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Greedy wrap by character count; CJK has no spaces to break on. */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const lines: string[] = [];
  let rest = clean;
  while (rest && lines.length < maxLines) {
    if (rest.length <= maxChars) {
      lines.push(rest);
      rest = '';
      break;
    }
    let cut = maxChars;
    // Prefer breaking at latin word boundaries when one is close.
    const space = rest.lastIndexOf(' ', maxChars);
    if (space > maxChars * 0.6) cut = space;
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest && lines.length === maxLines) {
    const last = lines[maxLines - 1];
    lines[maxLines - 1] = last.length > maxChars - 1 ? last.slice(0, maxChars - 1) + '…' : last + '…';
  }
  return lines;
}

/**
 * Pick a title size that keeps the title inside its box.
 *
 * Two lines are allowed; past that the font shrinks so the full name stays
 * readable rather than being clipped. Mirrors the fit logic used in the card
 * preview, so what was approved is what ships.
 */
function fitTitle(title: string): { size: number; lines: string[] } {
  const wide = 46; // approx chars per line at full size (CJK)
  for (const size of [64, 58, 52, 46, 40, 34]) {
    const perLine = Math.round((wide * 64) / size);
    const lines = wrap(title, perLine, 2);
    if (lines.join('').replace(/…$/, '').length >= title.replace(/\s+/g, ' ').trim().length) {
      return { size, lines };
    }
  }
  return { size: 34, lines: wrap(title, Math.round((wide * 64) / 34), 2) };
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getUTCDay()];
  return `${m[1]}.${m[2]}.${m[3]}（${weekday}）`;
}

function render(card: ShareCard): string {
  const { size, lines } = fitTitle(card.title);
  const titleH = lines.length * size * 1.18;
  const titleY = 300;

  const descLines = card.description ? wrap(card.description, 30, 2) : [];

  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="72" y="${titleY + i * size * 1.18}" font-size="${size}" font-weight="700" fill="#1e2937" letter-spacing="-0.5">${esc(ln)}</text>`,
    )
    .join('');

  const descSvg = descLines
    .map(
      (ln, i) =>
        `<text x="72" y="${titleY + titleH + 8 + i * 33}" font-size="22" fill="#33404f">${esc(ln)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="g1" cx="92%" cy="6%" r="55%">
      <stop offset="0%" stop-color="#c8955a" stop-opacity="0.20"/>
      <stop offset="100%" stop-color="#c8955a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="3%" cy="97%" r="55%">
      <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#1e3a5f" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#fbf9f5"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>

  <!-- logo mark -->
  <rect x="72" y="52" width="46" height="46" rx="12" fill="#1e3a5f"/>
  <g fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V6l10-2v12" transform="translate(82 63) scale(1.25)"/>
    <circle cx="88.5" cy="85.5" r="3.6"/>
    <circle cx="101" cy="83" r="3.6"/>
  </g>

  <text x="130" y="74" font-size="21" font-weight="700" fill="#1e3a5f">Sync Worship</text>
  <text x="130" y="94" font-size="12" fill="#5b6472">一同敬拜 · 同步睇譜</text>

  <text x="${W - 72}" y="78" font-size="20" font-weight="600" fill="#a8763c" text-anchor="end">${esc(formatDate(card.event_date))}</text>

  <text x="72" y="${titleY - 44}" font-size="15" font-weight="600" fill="#a8763c" letter-spacing="3">敬拜清單</text>

  ${titleSvg}
  ${descSvg}

  <line x1="72" y1="${H - 96}" x2="${W - 72}" y2="${H - 96}" stroke="#e0dbd2" stroke-width="1"/>

  <text x="72" y="${H - 56}" font-size="20" fill="#1e2937">
    <tspan fill="#5b6472" font-size="17">主領 </tspan><tspan font-weight="700" fill="#1e3a5f">${esc(card.leader_name || '—')}</tspan>
  </text>
  <text x="${W - 72}" y="${H - 56}" font-size="18" fill="#5b6472" text-anchor="end">${card.song_count} 首</text>
</svg>`;
}

export async function onRequestGet({
  request,
  env,
}: {
  request: Request;
  env: { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_ANON_KEY?: string };
}): Promise<Response> {
  const code = new URL(request.url).searchParams.get('c') ?? '';
  if (!/^[a-z0-9]{6,24}$/i.test(code)) {
    return new Response('bad code', { status: 400 });
  }

  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) {
    return new Response('not configured', { status: 500 });
  }

  // The RPC is the only thing anon may call, and it returns card fields only.
  let card: ShareCard | null = null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/get_share_card`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ p_code: code }),
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) card = (await res.json()) as ShareCard | null;
  } catch {
    return new Response('upstream error', { status: 502 });
  }

  if (!card || !card.title) {
    // A revoked or unknown link gets a neutral card rather than a broken image.
    return new Response(
      render({
        title: '此清單已停止分享',
        event_date: null,
        leader_name: null,
        description: null,
        song_count: 0,
      }),
      { status: 200, headers: { 'Content-Type': 'image/svg+xml; charset=utf-8' } },
    );
  }

  return new Response(render(card), {
    headers: {
      'Content-Type': 'image/svg+xml; charset=utf-8',
      // Short cache: the card follows list edits, but scrapers re-fetch often.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
