'use client';

export default function InjChart() {
  return (
    <div
      className="tx-card"
      style={{ marginTop: '1.5rem', marginBottom: '2rem' }}
    >
      <div className="tx-card-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="tx-badge tx-badge-cyan">INJ / USDT</span>
          <span style={{ fontSize: '0.65rem', color: 'var(--tx-text-dim)' }}>
            Live Price
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{
            width: 6,
            height: 6,
            borderRadius: '50%',
            background: 'var(--tx-green)',
            display: 'inline-block',
            flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.65rem', color: 'var(--tx-text-dim)' }}>Binance</span>
        </div>
      </div>
      <div style={{ height: 320 }}>
        <iframe
          src="https://s.tradingview.com/widgetembed/?symbol=BINANCE%3AINJUSDT&interval=60&hidesidetoolbar=1&symboledit=0&saveimage=0&theme=Dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=en"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="INJ/USDT Live Price Chart"
          loading="lazy"
          allow="clipboard-write"
        />
      </div>
    </div>
  );
}
