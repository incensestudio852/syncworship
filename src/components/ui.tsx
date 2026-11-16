'use client';

import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode } from 'react';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';

const base =
  'inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]';

const variants: Record<Variant, string> = {
  primary: 'bg-[var(--accent)] text-white hover:brightness-105 active:brightness-95',
  secondary:
    'border border-[var(--border)] bg-[var(--card)] text-[var(--fg)] hover:bg-[var(--soft)]',
  ghost: 'text-[var(--muted-fg)] hover:bg-[var(--soft)] hover:text-[var(--fg)]',
  danger: 'bg-rose-600 text-white hover:bg-rose-700',
};

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  children,
  ref,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: 'sm' | 'md' | 'lg';
  ref?: React.Ref<HTMLButtonElement>;
}) {
  const sizes = {
    // min-h keeps every button a real touch target on phone/tablet.
    sm: 'min-h-[36px] px-2.5 py-1.5 text-xs',
    md: 'min-h-[40px] px-3.5 py-2',
    lg: 'min-h-[44px] px-5 py-2.5 text-base',
  };
  return (
    <button
      ref={ref}
      className={`${base} ${variants[variant]} ${sizes[size]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function Input({
  className = '',
  ref,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { ref?: React.Ref<HTMLInputElement> }) {
  return (
    <input
      ref={ref}
      className={`w-full rounded-lg border border-[var(--border)] bg-[var(--card)] px-3 py-2 text-[var(--fg)] outline-none placeholder:text-[var(--muted-fg)]/70 focus:border-[var(--accent)] ${className}`}
      {...rest}
    />
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <label className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-[var(--muted-fg)]">
      {children}
      {hint}
    </label>
  );
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-3xl border border-[var(--border)] bg-[var(--card)] ${className}`}>
      {children}
    </div>
  );
}

export function Field({
  label,
  required,
  highlight,
  hint,
  children,
}: {
  label: string;
  required?: boolean;
  highlight?: boolean;
  /** Plain-language note shown instead of the 請確認 / * badge. */
  hint?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <Label
        hint={
          hint ? (
            <span className="rounded bg-rose-500/12 px-1.5 py-0.5 text-[10px] text-rose-600 dark:text-rose-400">
              {hint}
            </span>
          ) : highlight ? (
            <span className="rounded bg-amber-400/20 px-1.5 py-0.5 text-[10px] text-amber-600 dark:text-amber-400">
              請確認
            </span>
          ) : required ? (
            <span className="text-rose-500">*</span>
          ) : null
        }
      >
        {label}
      </Label>
      {children}
    </div>
  );
}

export function Spinner({ size = 16 }: { size?: number }) {
  return (
    <span
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent align-[-2px]"
      style={{ width: size, height: size }}
    />
  );
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-[var(--border)] px-6 py-14 text-center">
      {icon ? <div className="text-[var(--muted-fg)]">{icon}</div> : null}
      <p className="font-medium">{title}</p>
      {body ? <p className="max-w-sm text-sm text-[var(--muted-fg)]">{body}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
