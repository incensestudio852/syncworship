import { Suspense } from 'react';
import Stage from '@/views/Stage';

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="grid h-dvh place-items-center bg-[var(--bg)] text-sm text-[var(--muted-fg)]">
          載入舞台…
        </div>
      }
    >
      <Stage />
    </Suspense>
  );
}
