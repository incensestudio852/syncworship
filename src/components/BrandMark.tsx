/**
 * The Sync Worship mark.
 *
 * This is the same artwork as /public/icon.svg — the favicon users see in the
 * tab — so the in-app logo and the browser icon are never two different marks.
 * Both draw the note glyph on a round-cornered square.
 *
 * Colour comes from `currentColor` for the glyph and the `bg` prop for the
 * square, so the mark inherits whatever the theme's accent is instead of
 * hard-coding a brand value that would drift again.
 */
export function BrandMark({ size = 32, className = '' }: { size?: number; className?: string }) {
  // Keep the square's corner radius proportional to the favicon's 14/64.
  const radius = Math.round(size * 0.219);
  const glyph = Math.round(size * 0.56);
  return (
    <span
      aria-hidden="true"
      className={`grid shrink-0 place-items-center bg-[var(--accent)] text-white ${className}`}
      style={{ width: size, height: size, borderRadius: radius }}
    >
      <svg
        width={glyph}
        height={glyph}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {/* Same proportions as icon.svg: stem + flag, two note heads. */}
        <path d="M9 18V6l10-2v12" />
        <circle cx="6" cy="18" r="3" fill="currentColor" stroke="none" />
        <circle cx="16" cy="16" r="3" fill="currentColor" stroke="none" />
      </svg>
    </span>
  );
}
