'use client';

import { Suspense } from 'react';
import SongDetail from '@/views/SongDetail';

export default function Page() {
  return (
    <Suspense fallback={<div className="py-10 text-sm text-[var(--muted-fg)]">載入中…</div>}>
      <SongDetail />
    </Suspense>
  );
}
