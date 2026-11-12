'use client';

import { Suspense } from 'react';
import ListEditor from '@/views/ListEditor';

export default function Page() {
  return (
    <Suspense fallback={<Fallback />}>
      <ListEditor />
    </Suspense>
  );
}

function Fallback() {
  return <div className="py-10 text-center text-sm text-[var(--muted-fg)]">載入中…</div>;
}
