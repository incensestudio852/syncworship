/**
 * Inject Open Graph tags into the share page at the edge.
 *
 * A static export cannot generate per-list <meta> tags at build time, and the
 * WhatsApp/Signal scrapers never run JS — so the tags must exist in the HTML the
 * first time it is fetched. This Function rewrites the exported /s/index.html,
 * substituting the real title, description and og:image URL for that share code.
 *
 * It deliberately does NOT touch any other path: the app itself keeps its own
 * static metadata.
 */

type ShareCard = {
  title: string;
  event_date: string | null;
  leader_name: string | null;
  description: string | null;
  song_count: number;
};

type PagesContext = {
  request: Request;
  env: { NEXT_PUBLIC_SUPABASE_URL?: string; NEXT_PUBLIC_SUPABASE_ANON_KEY?: string };
  next: () => Promise<Response>;
};

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function fetchCard(code: string, env: PagesContext['env']): Promise<ShareCard | null> {
  const base = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!base || !key) return null;
  try {
    const res = await fetch(`${base}/rest/v1/rpc/get_share_card`, {
      method: 'POST',
      headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ p_code: code }),
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return null;
    return (await res.json()) as ShareCard | null;
  } catch {
    return null;
  }
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const url = new URL(context.request.url);
  const code = url.searchParams.get('c') ?? '';

  // No code: serve the plain page untouched.
  if (!/^[a-z0-9]{6,24}$/i.test(code)) {
    return context.next();
  }

  const res = await context.next();
  const card = await fetchCard(code, context.env);

  // A missing/revoked list still gets the page; it shows its own "expired" state.
  if (!card?.title) return res;

  const origin = url.origin;
  const ogImage = `${origin}/api/og?c=${code}`;

  const title = `${card.title} · Sync Worship`;
  const descBits = [
    card.event_date,
    card.leader_name ? `主領 ${card.leader_name}` : '',
    card.description ?? '',
  ].filter(Boolean);
  const description = descBits.join(' · ').slice(0, 200);

  const tags = [
    `<meta property="og:type" content="article" />`,
    `<meta property="og:site_name" content="Sync Worship" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:image" content="${esc(ogImage)}" />`,
    // 1200x630 keeps WhatsApp and Signal from cropping or letterboxing.
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:url" content="${esc(url.href)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="twitter:image" content="${esc(ogImage)}" />`,
  ].join('\n    ');

  // Replace the static <title> and splice the OG block into <head>.
  const html = (await res.text())
    .replace(/<title>[^<]*<\/title>/i, `<title>${esc(title)}</title>`)
    .replace(/<\/head>/i, `  ${tags}\n  </head>`);

  return new Response(html, {
    status: res.status,
    headers: {
      ...Object.fromEntries(res.headers),
      'Content-Type': 'text/html; charset=utf-8',
      // Previews must reflect edits, but scrapers hit hard — keep it short.
      'Cache-Control': 'public, max-age=60, s-maxage=60',
    },
  });
}
