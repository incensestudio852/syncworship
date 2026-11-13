'use client';

import { Music2, Moon, Settings2, Sun } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useDarkMode } from '@/hooks/useDarkMode';
import { Button } from './ui';

export function TopBar() {
  const { signOut, user } = useAuth();
  const pathname = usePathname() ?? '/';
  const { dark, toggle } = useDarkMode();

  const nav = [
    { href: '/', label: '敬拜清單' },
    { href: '/songs', label: '詩歌庫' },
  ];

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--border)] bg-[var(--bg)]/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center gap-1.5 px-2.5 sm:gap-2 sm:px-5">
        <Link href="/" className="flex min-h-[40px] shrink-0 items-center gap-2 font-semibold tracking-tight">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--accent)] text-white">
            <Music2 size={17} />
          </span>
          <span className="hidden whitespace-nowrap text-[15px] min-[430px]:inline sm:text-base">Sync Worship</span>
        </Link>

        <nav className="ml-1 flex items-center gap-0.5 sm:ml-4 sm:gap-1">
          {nav.map((n) => {
            const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`flex min-h-[40px] items-center whitespace-nowrap rounded-lg px-2.5 text-sm transition-colors sm:px-3.5 ${
                  active
                    ? 'bg-[var(--soft)] font-medium text-[var(--fg)]'
                    : 'text-[var(--muted-fg)] hover:text-[var(--fg)]'
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            onClick={toggle}
            aria-label={dark ? '切換淺色' : '切換深色'}
            className="!min-h-[40px] !px-2.5"
          >
            {dark ? <Sun size={17} /> : <Moon size={17} />}
          </Button>
          <Link
            href="/settings/"
            aria-label="設定"
            className="inline-flex min-h-[40px] shrink-0 items-center justify-center rounded-xl px-2 text-[var(--muted-fg)] transition-colors hover:bg-[var(--soft)] hover:text-[var(--fg)] sm:px-2.5"
          >
            <Settings2 size={17} />
          </Link>
          {user ? (
            <button
              onClick={() => void signOut()}
              className="flex min-h-[40px] items-center whitespace-nowrap rounded-lg px-2 text-xs text-[var(--muted-fg)] hover:text-[var(--fg)]"
            >
              登出
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
