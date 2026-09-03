import Link from 'next/link';

// Shared Renzu header identity for every tool page: the Renzu mark and wordmark,
// then the current lens's own name in its category colour. Replaces the old
// "TX · TRANSLATOR" logo block so each lens is named for what it is.
export default function LensCrumb({ name, accent = '#35C9BE' }: { name: string; accent?: string }) {
  return (
    <Link href="/" className="lens-crumb" aria-label={`Renzu — ${name}`}>
      <svg className="lens-glyph" width="24" height="24" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="14" stroke="url(#lcg)" strokeWidth="2" />
        <circle cx="16" cy="16" r="7.5" stroke="#9AA3B5" strokeWidth="1.4" opacity="0.7" />
        <circle cx="16" cy="16" r="2.4" fill="#35C9BE" />
        <defs>
          <linearGradient id="lcg" x1="2" y1="4" x2="30" y2="28">
            <stop stopColor="#35C9BE" />
            <stop offset="0.55" stopColor="#9B8CFF" />
            <stop offset="1" stopColor="#F0B24A" />
          </linearGradient>
        </defs>
      </svg>
      <span className="lens-wordmark">Renzu</span>
      <span className="lens-sep">/</span>
      <span className="lens-name" style={{ color: accent }}>{name}</span>
    </Link>
  );
}
