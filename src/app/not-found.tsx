'use client';

import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="grid min-h-[60vh] place-items-center px-4 text-center">
      <div>
        <p className="text-3xl font-semibold tracking-tight">404</p>
        <p className="mt-1 text-sm text-[var(--muted-fg)]">找不到這個頁面。</p>
        <Link href="/" className="mt-4 inline-block text-sm text-[var(--accent)] underline underline-offset-2">
          回敬拜清單
        </Link>
      </div>
    </div>
  );
}
