'use client';

export default function InjChart() {
  return (
    <section style={{ width: '100%', maxWidth: 680, marginTop: '2rem', marginBottom: '2rem' }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 0.15rem',
        marginBottom: '0.6rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="tx-badge tx-badge-cyan">INJ / USDT</span>
          <span style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.65rem',
            color: 'var(--tx-text-dim)',
          }}>1h</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{
            width: 6, height: 6, borderRadius: '50%',
            background: 'var(--tx-green)', display: 'inline-block', flexShrink: 0,
          }} />
          <span style={{ fontSize: '0.65rem', color: 'var(--tx-text-dim)' }}>Live · Binance</span>
        </div>
      </div>
      {/*
        Iframe keeps TradingView origin-isolated: their script runs in its own
        browsing context and cannot access our localStorage or cookies.
        The JS widget approach (tv.js injected into our origin) was reverted
        for this reason — same-origin script trust boundary.
      */}
      <div style={{
        width: '100%',
        height: 400,
        borderRadius: 8,
        overflow: 'hidden',
        border: '1px solid var(--tx-border)',
      }}>
        <iframe
          src="https://s.tradingview.com/widgetembed/?symbol=BINANCE%3AINJUSDT&interval=60&hidesidetoolbar=1&symboledit=0&saveimage=0&theme=Dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=en"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="INJ/USDT Live Price Chart"
          loading="lazy"
          allow="clipboard-write"
          sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox"
        />
      </div>
    </section>
  );
}
