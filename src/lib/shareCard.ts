/**
 * Share card rendering (client side, on demand).
 *
 * The card is a static PNG in Supabase Storage, so serving it is free and fast
 * and never depends on an edge renderer. It is (re)generated only when a field
 * the card prints changes: name, date, description, 主領, or song count. Reordering
 * songs or changing keys does NOT trigger a re-render, because none of that is
 * drawn on the card.
 *
 * Rendering happens in the browser because the draw is simple (text + a logo)
 * and the user is already there, saving. That keeps a 2.5 MB WASM renderer out
 * of the edge bundle entirely.
 */

import { supabase } from '@/lib/supabase';

// Public bucket: WhatsApp fetches this with no credentials. The private
// `sheets` bucket stays private — licensed sheet images must not be exposed.
const BUCKET = 'share-cards';
const W = 1200;
const H = 630;

export type CardData = {
  title: string;
  event_date: string | null;
  leader_name: string | null;
  description: string | null;
  song_count: number;
};

/** XML-escape; a stray & in a title breaks the document. */
function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/**
 * Chars per line at a given size.
 *
 * CJK glyphs are ~1em wide, so this is division, not a guess. The old guessed
 * constant pushed long descriptions off the card.
 */
function charsPerLine(size: number): number {
  const usable = W - 52 * 2;
  return Math.max(6, Math.floor(usable / (size * 0.98)) - 1);
}

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
    if (space > maxChars * 0.7) cut = space;
    lines.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) {
    const i = lines.length - 1;
    const t = lines[i].replace(/[\s，。、；：]$/, '');
    lines[i] = t.length >= maxChars ? t.slice(0, maxChars - 1) + '…' : t + '…';
  }
  return lines;
}

/** Largest title size at which the full string still fits. */
function fitTitle(title: string, reserveDesc: boolean): { size: number; lines: string[] } {
  const flat = title.replace(/\s+/g, ' ').trim();
  const maxLines = reserveDesc ? 2 : 3;
  for (const size of [66, 60, 54, 48, 42, 36]) {
    const lines = wrap(flat, charsPerLine(size), maxLines);
    if (lines.join('').replace(/…$/, '').length >= flat.length) return { size, lines };
  }
  return { size: 36, lines: wrap(flat, charsPerLine(36), maxLines) };
}

function fmtDate(d: string | null): string {
  if (!d) return '';
  const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return d;
  const wd = ['日', '一', '二', '三', '四', '五', '六'][
    new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).getUTCDay()
  ];
  return `${m[1]}.${m[2]}.${m[3]}（${wd}）`;
}

function buildSvg(card: CardData): string {
  // Body is vertically centred between masthead and footer, so short cards
  // breathe evenly instead of stacking at the top.
  const hasDesc = Boolean(card.description?.trim());
  const { size, lines } = fitTitle(card.title, hasDesc);
  const descLines = hasDesc ? wrap(card.description!, charsPerLine(27), 2) : [];

  const titleH = lines.length * size * 1.12;
  const descH = descLines.length * 27 * 1.52;

  // Centre the block in the space between the masthead and the footer rule.
  const top = 46;              // padding
  const mastH = 56;            // logo height
  const footH = 78;            // divider + leader line
  const metaH = 30;
  const gapTitle = 14;
  const gapDesc = 18;
  const blockH = metaH + gapTitle + titleH + (hasDesc ? gapDesc + descH : 0);
  const bandTop = top + mastH + 22;
  const bandBottom = H - 40 - footH;
  const startY = bandTop + Math.max(0, (bandBottom - bandTop - blockH) / 2);

  const metaY = startY + metaH - 10;
  const titleStartY = startY + metaH + gapTitle + size * 0.86;

  const titleSvg = lines
    .map(
      (ln, i) =>
        `<text x="52" y="${titleStartY + i * size * 1.12}" font-size="${size}" font-weight="700" fill="#1e2937" letter-spacing="-1">${esc(ln)}</text>`,
    )
    .join('');

  const firstDescY = titleStartY + (lines.length - 1) * size * 1.12 + gapDesc + 20;
  const descSvg = descLines
    .map(
      (ln, i) =>
        `<text x="52" y="${firstDescY + i * 27 * 1.52}" font-size="27" fill="#37424f">${esc(ln)}</text>`,
    )
    .join('');

  const dividerY = H - 40 - 52;
  const leaderY = H - 40 - 18;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}"
     font-family="'PingFang TC','Noto Sans TC','Helvetica Neue',sans-serif">
  <defs>
    <radialGradient id="g1" cx="97%" cy="-5%" r="52%">
      <stop offset="0%" stop-color="#c8955a" stop-opacity="0.24"/>
      <stop offset="100%" stop-color="#c8955a" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="g2" cx="-3%" cy="105%" r="52%">
      <stop offset="0%" stop-color="#1e3a5f" stop-opacity="0.08"/>
      <stop offset="100%" stop-color="#1e3a5f" stop-opacity="0"/>
    </radialGradient>
  </defs>

  <rect width="${W}" height="${H}" fill="#fbf9f5"/>
  <rect width="${W}" height="${H}" fill="url(#g1)"/>
  <rect width="${W}" height="${H}" fill="url(#g2)"/>

  <!-- logo mark -->
  <rect x="52" y="${top}" width="56" height="56" rx="15" fill="#1e3a5f"/>
  <g fill="none" stroke="#ffffff" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round">
    <path d="M9 18V6l10-2v12" transform="translate(63 ${top + 9}) scale(1.5)"/>
    <circle cx="71" cy="${top + 42}" r="4.4"/>
    <circle cx="87" cy="${top + 39}" r="4.4"/>
  </g>
  <text x="122" y="${top + 26}" font-size="32" font-weight="700" fill="#1e3a5f" letter-spacing="-0.3">Sync Worship</text>
  <text x="122" y="${top + 48}" font-size="16" fill="#5b6472">一同敬拜 · 同步睇譜</text>

  <!-- meta line: date · 敬拜清單 -->
  <text x="52" y="${metaY}" font-size="22" font-weight="600" fill="#a8763c" letter-spacing="0.6">${esc(fmtDate(card.event_date))}<tspan dx="16" fill="#c4b3a0">·</tspan><tspan dx="16">敬拜清單</tspan></text>

  ${titleSvg}
  ${descSvg}

  <line x1="52" y1="${dividerY}" x2="${W - 52}" y2="${dividerY}" stroke="#e0dbd2" stroke-width="1"/>
  <text x="52" y="${leaderY}" font-size="25" fill="#1e2937">
    <tspan fill="#5b6472" font-size="19">主領 </tspan><tspan font-weight="700" fill="#1e3a5f">${esc(card.leader_name || '—')}</tspan>
  </text>
  <text x="${W - 52}" y="${leaderY}" font-size="19" fill="#5b6472" text-anchor="end">${card.song_count} 首</text>
</svg>`;
}

/** Rasterise the SVG in the browser and upload it; returns the storage path. */
export async function renderShareCard(listId: string, card: CardData): Promise<string> {
  const svg = buildSvg(card);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

  try {
    const img = new Image();
    img.decoding = 'sync';
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error('卡片繪製失敗'));
      img.src = url;
    });

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('瀏覽器不支援繪圖');
    ctx.fillStyle = '#fbf9f5';
    ctx.fillRect(0, 0, W, H);
    ctx.drawImage(img, 0, 0, W, H);

    const png = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/png', 0.92));
    if (!png) throw new Error('卡片輸出失敗');

    const path = `${listId}.png`;
    // upsert: a re-render replaces the previous card in place, so the public URL
    // stays the same and WhatsApp's cache refreshes on the version query.
    const { error } = await supabase()
      .storage.from(BUCKET)
      .upload(path, png, { upsert: true, contentType: 'image/png', cacheControl: '300' });
    if (error) throw error;

    return path;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Public URL for a stored card, versioned so caches refresh after a re-render. */
export function cardUrl(listId: string, version: string | null): string {
  const base = supabase().storage.from(BUCKET).getPublicUrl(`${listId}.png`).data.publicUrl;
  return version ? `${base}?v=${encodeURIComponent(version)}` : base;
}
