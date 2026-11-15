/**
 * OG share card image — PNG, not SVG.
 *
 * WhatsApp and Signal IGNORE SVG entirely (Meta's docs list only JPEG, PNG and
 * GIF for og:image), so an SVG card produces no preview at all. The card is
 * therefore authored as SVG and rasterised to PNG at the edge with resvg-wasm.
 *
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

/** Usable text width inside the card's 72px side margins. */
const USABLE = W - 72 * 2;

/**
 * Chars that fit on one line at a given size.
 *
 * CJK glyphs are ~1em wide, so this is a direct division rather than a guessed
 * constant. Getting this wrong is what pushed long descriptions off the card.
 */
function charsPerLine(size: number): number {
  // A CJK glyph is ~1em wide, so this is pure division. The old version shrank
  // the divisor for "some latin", which OVERestimated how much fits and pushed
  // long descriptions past the card edge.
  //
  // 0.98 guards against glyphs that render slightly wider than their em (some
  // punctuation does), and the -1 keeps the last glyph off the margin.
  return Math.max(6, Math.floor(USABLE / (size * 0.98)) - 1);
}

/**
 * Wrap text to a character budget.
 *
 * CJK has no word spaces, so a greedy grab of `maxChars` is the correct unit;
 * latin runs are broken at a space when one falls in the last third, which
 * keeps English song titles from splitting mid-word.
 */
function wrap(text: string, maxChars: number, maxLines: number): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean || maxLines <= 0) return [];

  const lines: string[] = [];
  let rest = clean;

  while (rest && lines.length < maxLines) {
    if (rest.length <= maxChars) {
      lines.push(rest);
      rest = '';
      break;
    }
    let cut = maxChars;
    const space = rest.lastIndexOf(' ', maxChars);
    // Only honour a space break if it does not waste most of the line.
    if (space > maxChars * 0.7) cut = space;
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }

  // Anything left over becomes an ellipsis on the final line.
  if (rest) {
    const i = lines.length - 1;
    const trimmed = lines[i].replace(/[\s，。、；：]$/, '');
    lines[i] = trimmed.length >= maxChars ? trimmed.slice(0, maxChars - 1) + '…' : trimmed + '…';
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
function fitTitle(title: string, reserveDesc: boolean): { size: number; lines: string[] } {
  const flat = title.replace(/\s+/g, ' ').trim();
  // When a description is present the title may use fewer lines at large
  // sizes, so the description always keeps a place. A title that pushes the
  // description off the card is worse than a slightly smaller title.
  const maxLines = reserveDesc ? 1 : 2;

  for (const size of [64, 58, 52, 46, 40, 34]) {
    const lines = wrap(flat, charsPerLine(size), maxLines);
    if (lines.join('').replace(/…$/, '').length >= flat.length) {
      return { size, lines };
    }
  }
  // Last resort: two lines at the minimum, still complete.
  return { size: 34, lines: wrap(flat, charsPerLine(34), 2) };
}

function formatDate(d: string | null): string {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const weekday = ['日', '一', '二', '三', '四', '五', '六'][new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getUTCDay()];
  return `${m[1]}.${m[2]}.${m[3]}（${weekday}）`;
}

function render(card: ShareCard): string {
  const titleY = 300;
  const { size, lines } = fitTitle(card.title, Boolean(card.description));
  const titleH = lines.length * size * 1.18;

  // Keep the description inside its own band: it must not touch the divider.
  const descTop = titleY + titleH + 12;
  const maxDescLines = Math.max(0, Math.floor((H - 96 - 18 - descTop) / 58));

  const descLines = card.description && maxDescLines > 0
    ? wrap(card.description, charsPerLine(40), maxDescLines)
    : [];

  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="72" y="${titleY + i * size * 1.18}" font-size="${size}" font-weight="700" fill="#1e2937" letter-spacing="-0.5">${esc(ln)}</text>`,
    )
    .join('');

  const descSvg = descLines
    .map(
      (ln, i) =>
        `<text x="72" y="${titleY + titleH + 12 + i * 58}" font-size="40" fill="#33404f">${esc(ln)}</text>`,
    )
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
     font-family="'Noto Sans TC','Noto Sans CJK TC','Source Han Sans TC','WenQuanYi Zen Hei','PingFang TC','Helvetica Neue',Helvetica,Arial,sans-serif"
     font-synthesis="none">
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
  <rect x="72" y="44" width="64" height="64" rx="16" fill="#1e3a5f"/>
  <g fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V6l10-2v12" transform="translate(85 55) scale(1.75)"/>
    <circle cx="93.5" cy="90" r="5"/>
    <circle cx="111" cy="86" r="5"/>
  </g>

  <text x="156" y="76" font-size="38" font-weight="700" fill="#1e3a5f" letter-spacing="-0.4">Sync Worship</text>
  <text x="156" y="104" font-size="22" fill="#5b6472">一同敬拜 · 同步睇譜</text>

  <text x="${W - 72}" y="86" font-size="36" font-weight="600" fill="#a8763c" text-anchor="end">${esc(formatDate(card.event_date))}<tspan font-size="27" dx="16" fill="#b9a68f">敬拜清單</tspan></text>


  ${titleSvg}
  ${descSvg}

  <line x1="72" y1="${H - 96}" x2="${W - 72}" y2="${H - 96}" stroke="#e0dbd2" stroke-width="1"/>

  <text x="${W - 72}" y="${H - 52}" font-size="36" fill="#1e2937" text-anchor="end">
    <tspan fill="#5b6472" font-size="31">主領 </tspan><tspan font-weight="700" fill="#1e3a5f">${esc(card.leader_name || '—')}</tspan>
  </text>
</svg>`;
}

import { Resvg, initWasm } from '@resvg/resvg-wasm';
// Bundled next to the Function by wrangler's wasm module rule.
import wasmModule from '@resvg/resvg-wasm/index_bg.wasm';

let wasmReady: Promise<void> | null = null;
function ensureWasm(): Promise<void> {
  if (!wasmReady) wasmReady = initWasm(wasmModule);
  return wasmReady;
}

/** Rasterise the card. Returns image/png bytes. */
async function toPng(svg: string): Promise<ArrayBuffer> {
  await ensureWasm();
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: W },
    // resvg has no system fonts on Workers. The SVG names a sans stack, and
    // resvg falls back to its built-in sans for Han glyphs rather than a serif.
    font: { loadSystemFonts: false, defaultFontFamily: 'sans-serif' },
  });
  const png = resvg.render().asPng();
  // Copy into a plain ArrayBuffer: Response's BodyInit accepts BufferSource,
  // and the wasm-returned view is backed by memory resvg no longer owns.
  return new Uint8Array(png).buffer;
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
    const fallback = await toPng(
      render({
        title: '此清單已停止分享',
        event_date: null,
        leader_name: null,
        description: null,
        song_count: 0,
      }),
    );
    return new Response(fallback, { status: 200, headers: { 'Content-Type': 'image/png' } });
  }

  const png = await toPng(render(card));
  return new Response(png, {
    headers: {
      'Content-Type': 'image/png',
      // Short cache: the card follows list edits, but scrapers re-fetch often.
      'Cache-Control': 'public, max-age=300, s-maxage=300',
    },
  });
}
