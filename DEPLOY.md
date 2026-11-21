# Deploying Sync Worship

The reference deployment is **Supabase** for the database, auth and storage, and
**Cloudflare Workers** for serving the static build. That is what the author runs.

Nothing here is mandatory. The app builds to a folder of static files, so any
host that serves files will do — see [Other hosts](#other-hosts) at the end.
What you cannot skip is Supabase, because the app has no server of its own.

## What to upload

Upload **the contents of `out/`** — not the folder itself, its contents.
319 files, 57 MB total. All within Pages limits (25 MB/file, 20,000 files).

```
out/
├── index.html              ← the app
├── 404.html
├── _redirects              ← Cloudflare reads this
├── _headers                ← Cloudflare reads this
├── sw.js                   ← offline service worker
├── manifest.webmanifest
├── icon.svg
├── _next/                  ← compiled JS/CSS (1.9 MB)
├── cmaps/  standard_fonts/ wasm/     ← pdf.js CJK + scan decoders
├── tessdata/  tesseract/  tesseract-core/   ← OCR engine + languages
└── lists/ songs/ stage/ login/ settings/ view/   ← one dir per route
```

## Three ways to deploy

### A. Drag and drop (fastest, no git)
1. https://dash.cloudflare.com → **Workers & Pages** → **Create** → **Pages** → **Upload assets**
2. Name it (e.g. `sync-worship`)
3. Drag the **`out` folder's contents** into the upload box
4. Deploy → you get `https://<name>.pages.dev`

### B. Connect the git repo (auto-deploy on push)
1. Push this repo to GitHub.
2. Cloudflare → Pages → Connect to Git → pick the repo.
3. Build settings:
   - **Framework preset:** `Next.js (Static HTML Export)`
   - **Build command:** `npm run build`
   - **Build output directory:** `out`
   - **Node version:** set env var `NODE_VERSION` = `20` (or 22)
4. **Environment variables** (Production *and* Preview):
   ```
   NEXT_PUBLIC_SUPABASE_URL       = https://<your-project-ref>.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY  = <your publishable / anon key>
   ```
5. Save and Deploy.

### C. Wrangler CLI
```bash
npx wrangler pages deploy out --project-name sync-worship
```

## After the first deploy — do not skip

**1. Add the domain to Supabase Auth.**
Supabase dashboard → Authentication → URL Configuration:
- **Site URL:** `https://<name>.pages.dev`
- **Redirect URLs:** add `https://<name>.pages.dev/**`

Without this, login on the deployed site fails with a redirect error, because
Supabase only trusts origins on this list.

**2. Test on the real iPad.**
Sign in, open a list, push a song, open the stage. Confirm wake-lock keeps the
screen on (this cannot be tested in browser emulation).

## About the Supabase key

`NEXT_PUBLIC_SUPABASE_ANON_KEY` is compiled into the JavaScript and is visible to
anyone who views source. **This is normal and safe** — it is a publishable key,
and your Row Level Security policies (`authenticated` only) are what protect the
data. Never put the `service_role` key in a `NEXT_PUBLIC_*` variable; that one
bypasses RLS.

## What is not in the repo

| Not committed | Why |
|---|---|
| `out/`, `.next/`, `node_modules/` | build output |
| `public/tessdata/`, `tesseract-core/`, `cmaps/`, `wasm/` (~53 MB) | fetched by `npm install` via `scripts/copy-assets.mjs` |
| `.env.production`, `.env.local` | environment; set them on your host instead |

A fresh `git clone` + `npm ci` + `npm run build` reproduces `out/` and serves
correctly. The asset copy runs on `postinstall`, so the OCR and pdf.js files
appear without a separate step.

## Redeploying

Drag-and-drop: rebuild locally (`npm run build`) and re-upload `out/`.
Git: just push — Cloudflare rebuilds.

The service worker is network-first for pages, so devices pick up a new deploy
on the next load with a connection. Bump `CACHE_VERSION` in `public/sw.js` if
you ever need to force-clear old caches.

## Other hosts

The build is a plain static export (`output: 'export'`), so the output directory
can be served by anything:

- **Netlify / Vercel / GitHub Pages** — point the build command at `npm run build`
  and the publish directory at `out`.
- **Your own nginx / Apache** — copy `out/` to the web root. Route every path to
  its directory's `index.html` (`trailingSlash` is on, so `/lists/?id=…` resolves
  under `out/lists/`).
- **A Synology or a Raspberry Pi on the church network** — works, and keeps the
  whole thing off the public internet.

Two things are Cloudflare-specific and will need replacing elsewhere:

1. **`worker.ts` + `wrangler.jsonc`** exist to intercept `/s/` and `/api/og` for
   the share-link preview cards. Without them the app still runs; only the social
   preview images are missing.
2. **`functions/`** holds the CantonHymn proxy and the OG renderer. On a plain
   static host these are unused — answer those routes with a 404 or port them.

If you drop the Worker, remove the `share-cards` bucket policies too, or leave
them; they do no harm.
