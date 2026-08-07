'use client';

import { useState } from 'react';
import type { CollectionHolding, NftItem, Portfolio } from '@/lib/portfolio/nft';

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

// One NFT thumbnail → its exact Talis page. Talis addresses each NFT by
// /nft/<contract>/<on-chain token id> and redirects to its internal page —
// the token id (not the display "#" number) is the key.
function NftCard({ item, collection }: { item: NftItem; collection: string }) {
  return (
    <a
      href={`https://injective.talis.art/nft/${collection}/${item.tokenId}`}
      target="_blank"
      rel="noopener noreferrer"
      className="tx-nft-card"
      title={`${item.name ?? `#${item.tokenId}`} on Talis`}
    >
      <div className="tx-nft-thumb">
        {item.image ? (
          // Arbitrary per-NFT IPFS images: a raw <img> lazy-loads them directly
          // instead of routing every thumbnail through the Vercel image optimizer
          // (cost + per-gateway remotePatterns).
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
    </a>
  );
}

// A collection block. The portfolio scan resolves a capped set of thumbnails up
// front for speed; the rest load on demand when the owner expands the block,
// via /api/portfolio/collection.
function CollectionSection({ h, wallet }: { h: CollectionHolding; wallet: string }) {
  const [items, setItems] = useState<NftItem[]>(h.items);
  const [expanded, setExpanded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);

  const shown = items.length;
  const remaining = h.count - shown;

  async function showAll() {
    if (loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/portfolio/collection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: wallet, collection: h.address }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? 'Could not load the rest.');
      setItems(Array.isArray(data.items) ? data.items : []);
      setTruncated(Boolean(data.truncated));
      setExpanded(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not load the rest.');
    } finally {
      setLoading(false);
    }
  }

  function showLess() {
    setItems(h.items);
    setExpanded(false);
    setTruncated(false);
    setError(null);
  }

  return (
    <section className="tx-nft-collection">
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
          <a
            href={`https://injective.talis.art/profile/${wallet}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-nft-collection-count"
            title="This wallet's NFTs on Talis"
          >
            {h.count} owned
          </a>
          <a
            href={`https://injective.talis.art/collection/${h.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-nft-collection-out"
            aria-label={`${h.name} on Talis`}
          >
            Talis
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M17 7H8M17 7v9" />
            </svg>
          </a>
          <a
            href={`https://explorer.injective.network/contract/${h.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="tx-nft-collection-out"
            aria-label={`${h.name} contract on the explorer`}
          >
            Explorer
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 17L17 7M17 7H8M17 7v9" />
            </svg>
          </a>
        </div>
      </header>

      {shown > 0 ? (
        <>
          <div className="tx-nft-grid">
            {items.map(item => (
              <NftCard key={item.tokenId} item={item} collection={h.address} />
            ))}
            {!expanded && remaining > 0 && (
              <button
                type="button"
                className="tx-nft-card tx-nft-card--more"
                onClick={showAll}
                disabled={loading}
                aria-label={`Show all ${h.count} ${h.name} NFTs`}
              >
                <span>{loading ? '…' : `+${remaining}`}</span>
                <span className="tx-nft-card-name">{loading ? 'loading' : 'show all'}</span>
              </button>
            )}
          </div>
          {error && (
            <div className="tx-nft-expand-note tx-nft-expand-note--error">
              {error} <button type="button" className="tx-nft-linkbtn" onClick={showAll}>Retry</button>
            </div>
          )}
          {expanded && (
            <div className="tx-nft-expand-note">
              {truncated && `Showing the first ${shown} of ${h.count}. `}
              <button type="button" className="tx-nft-linkbtn" onClick={showLess}>Show less</button>
            </div>
          )}
        </>
      ) : (
        <div className="tx-nft-count-only">
          {h.count} NFT{h.count === 1 ? '' : 's'} owned — images not loaded yet.{' '}
          <button type="button" className="tx-nft-linkbtn" onClick={showAll} disabled={loading}>
            {loading ? 'Loading…' : 'Load images'}
          </button>
          {error && <span className="tx-nft-expand-note--error"> · {error}</span>}
        </div>
      )}
    </section>
  );
}

export default function PortfolioView({ portfolio }: Props) {
  const { address, holdings, totalNfts, collectionsScanned, collectionsKnown, partial } = portfolio;

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

      {holdings.map(h => (
        <CollectionSection key={h.address} h={h} wallet={address} />
      ))}
    </div>
  );
}
