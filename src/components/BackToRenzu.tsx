import Link from 'next/link';

// Consistent "Back to Renzu" pill shown at the top of every lens page,
// styled like the hub CTA so returning to the hub feels the same everywhere.
export default function BackToRenzu() {
  return (
    <Link href="/" className="tx-dapp-cta">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round">
        <path d="M9 18l-6-6 6-6" />
        <path d="M3 12h13a5 5 0 0 1 0 10h-1" />
      </svg>
      Back to Renzu
    </Link>
  );
}
