'use client';

import { Suspense } from 'react';
import SongView from '@/views/SongView';

export default function Page() {
  return (
    <Suspense fallback={<div className="py-10 text-sm text-[var(--muted-fg)]">載入中…</div>}>
      <SongView />
    </Suspense>
  );
}
