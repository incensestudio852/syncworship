/**
 * Worker entry point.
 *
 * WHY THIS EXISTS:
 * The site deploys as Workers static assets (`assets.directory: ./out`), which
 * serves files and nothing else. Cloudflare *Pages* would run the same code from
 * `functions/`, but Workers never looks at that directory — so /share/ and
 * /api/og returned 404 in production while working perfectly under
 * `wrangler pages dev`. This file is the bridge: it routes those two paths into
 * the existing Pages-style handlers, and hands every other request to the asset
 * layer via `env.ASSETS.fetch`.
 *
 * The handlers are imported UNCHANGED — they keep their `onRequestGet` shape and
 * take a `{ request, env, next }` context, which this adapter constructs. That
 * way the same code runs under `wrangler pages dev` locally and on Workers in
 * production, and there is no second copy to drift.
 */

import { onRequestGet as ogGet } from './functions/api/og';
import { onRequestGet as shareGet } from './functions/share/index';

export interface Env {
  ASSETS: { fetch: (req: Request) => Promise<Response> };
  NEXT_PUBLIC_SUPABASE_URL?: string;
  NEXT_PUBLIC_SUPABASE_ANON_KEY?: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // Build the Pages-style context the handlers expect. `next` falls through to
    // assets, mirroring how Pages resolves an unhandled path.
    const ctx = {
      request,
      env,
      next: () => env.ASSETS.fetch(request),
    };

    try {
      // /share/ — the public share page with injected OG tags. Also accept
      // /share (no slash) so a pasted link never 404s.
      if (path === '/share/' || path === '/share') {
        return await shareGet(ctx);
      }

      // /api/og — rendered card image. Only used as a fallback now that
      // og:image points at the stored PNG, but kept working for old links.
      if (path === '/api/og') {
        // The handler already returns a complete Response (image/png), so it is
        // passed straight through.
        return await ogGet(ctx);
      }
    } catch (err) {
      // A preview must never take down the page: fall back to the plain app.
      console.error('edge route failed', path, err);
      return env.ASSETS.fetch(request);
    }

    // Everything else is the static export.
    return env.ASSETS.fetch(request);
  },
};
