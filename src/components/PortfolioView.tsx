'use client';

import type { Portfolio } from '@/lib/portfolio/nft';

interface Props {
  portfolio: Portfolio;
}

// IPFS gateways can flake individually, so a thumbnail that fails on ipfs.io
// retries once on dweb.link before giving up to a placeholder.
function handleImgError(e: React.SyntheticEvent<HTMLImageElement>) {
  const img = e.currentTarget;
  if (img.dataset.fallback === 'done') {
    img.style.display = 'none';
    img.parentElement?.classList.add('tx-nft-thumb--broken');
    return;
  }
  img.dataset.fallback = 'done';
  img.src = img.src.replace('https://ipfs.io/ipfs/', 'https://dweb.link/ipfs/');
}

export default function PortfolioView({ portfolio }: Props) {
  const { holdings, totalNfts, collectionsScanned, collectionsKnown, partial } = portfolio;

  if (totalNfts === 0) {
    return (
      <div className="tx-nft-wrap">
        <div className="tx-nft-empty">
          <span className="tx-nft-empty-title">No NFTs found</span>
          <span className="tx-nft-empty-sub">
            This wallet holds nothing in the {collectionsScanned.toLocaleString()} Talis
            collections scanned{partial ? ' so far' : ''}. It may hold NFTs in a collection outside
            the Talis registry.
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="tx-nft-wrap">
      <div className="tx-nft-summary">
        <div className="tx-nft-summary-stats">
          <span className="tx-nft-stat">
            <span className="tx-nft-stat-value">{totalNfts.toLocaleString()}</span>
            <span className="tx-nft-stat-label">NFTs</span>
          </span>
          <span className="tx-nft-stat">
            <span className="tx-nft-stat-value">{holdings.length.toLocaleString()}</span>
            <span className="tx-nft-stat-label">Collections</span>
          </span>
        </div>
        <span className="tx-nft-coverage">
          {partial ? 'Scanned' : 'Checked'} {collectionsScanned.toLocaleString()} of{' '}
          {collectionsKnown.toLocaleString()} Talis collections
          {partial && ' — hit the time budget; refine or retry for the rest'}
        </span>
      </div>

      {holdings.map(h => {
        const shown = h.items.length;
        const remaining = h.count - shown;
        return (
          <section key={h.address} className="tx-nft-collection">
            <header className="tx-nft-collection-head">
              <div className="tx-nft-collection-title">
                <span className="tx-nft-collection-name">{h.name}</span>
                {h.symbol && <span className="tx-nft-collection-symbol">{h.symbol}</span>}
                {h.isBlueChip && <span className="tx-badge tx-badge-blue-chip">◆ Blue Chip</span>}
                {h.verified && !h.isBlueChip && (
                  <span className="tx-nft-verified" title="Address-verified collection">✓ Verified</span>
                )}
              </div>
              <div className="tx-nft-collection-meta">
                <span className="tx-nft-collection-count">
                  {h.count} owned
                </span>
                <a
                  href={`https://explorer.injective.network/account/${h.address}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="tx-nft-collection-link"
                  aria-label={`${h.name} contract on the explorer`}
                >
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M7 17L17 7M17 7H8M17 7v9" />
                  </svg>
                </a>
              </div>
            </header>

            {shown > 0 ? (
              <div className="tx-nft-grid">
                {h.items.map(item => (
                  <div key={item.tokenId} className="tx-nft-card">
                    <div className="tx-nft-thumb">
                      {item.image ? (
                        // Arbitrary per-NFT IPFS images: a raw <img> lazy-loads them
                        // directly instead of routing every thumbnail through the
                        // Vercel image optimizer (cost + per-gateway remotePatterns).
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={item.image}
                          alt={item.name ?? `Token ${item.tokenId}`}
                          loading="lazy"
                          onError={handleImgError}
                        />
                      ) : (
                        <span className="tx-nft-thumb-fallback">#{item.tokenId}</span>
                      )}
                    </div>
                    <span className="tx-nft-card-name">{item.name ?? `#${item.tokenId}`}</span>
                  </div>
                ))}
                {remaining > 0 && (
                  <div className="tx-nft-card tx-nft-card--more">
                    <span>+{remaining}</span>
                    <span className="tx-nft-card-name">more</span>
                  </div>
                )}
              </div>
            ) : (
              <div className="tx-nft-count-only">
                {h.count} NFT{h.count === 1 ? '' : 's'} owned — images not loaded (display cap
                reached)
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
