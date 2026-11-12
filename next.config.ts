import { readFileSync, existsSync, copyFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { NextConfig } from 'next';

// Next only auto-loads .env.local in `next dev`. For `next build` (and CI /
// Cloudflare Pages, where the vars come from the dashboard) we read it
// explicitly so a local build matches dev.
function loadDotEnvLocal(): Record<string, string> {
  const path = '.env.local';
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const raw of readFileSync(path, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    const v = line.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
    if (k && v) out[k] = v;
  }
  return out;
}

const injected: Record<string, string> = {};
for (const [k, v] of Object.entries(loadDotEnvLocal())) {
  if (k.startsWith('NEXT_PUBLIC_')) injected[k] = v;
}

// 404.html is not part of the App Router export; Cloudflare Pages serves it
// for unknown paths. Copy the app's own not-found page instead of a bare stub.
class Copy404 {
  apply(compiler: { hooks: { afterEmit: { tap: (n: string, cb: () => void) => void } } }) {
    compiler.hooks.afterEmit.tap('Copy404', () => {
      const out = join(process.cwd(), 'out');
      const src = join(out, '404.html');
      const notFound = join(out, '_not-found.html');
      if (existsSync(notFound)) {
        mkdirSync(out, { recursive: true });
        copyFileSync(notFound, src);
      }
    });
  }
}

const nextConfig: NextConfig = {
  output: 'export',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  // Avoid Turbopack walking up to the home directory for a lockfile.
  turbopack: { root: process.cwd() },
  env: injected,
  // pdf.js and Tesseract are large and only needed inside the CMS upload flow.
  // Keeping them out of the shared chunk means opening the stage never pays for them.
  webpack: (config) => {
    config.plugins = config.plugins ?? [];
    config.plugins.push(new Copy404());
    return config;
  },
};

export default nextConfig;
