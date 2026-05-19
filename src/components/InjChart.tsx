'use client';

export default function InjChart() {
  return (
    <section
      style={{
        width: '100%',
        maxWidth: 680,
        marginBottom: '2rem',
        marginTop: '1.5rem',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          marginBottom: '0.6rem',
        }}
      >
        <span style={{ color: 'var(--tx-cyan)', fontSize: '0.6rem' }}>◈</span>
        <span
          style={{
            fontFamily: 'var(--font-rajdhani), sans-serif',
            fontWeight: 700,
            fontSize: '0.65rem',
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            color: 'var(--tx-text-muted)',
          }}
        >
          INJ / USDT · Live Chart
        </span>
      </div>

      <div
        style={{
          width: '100%',
          height: 320,
          borderRadius: 6,
          overflow: 'hidden',
          border: '1px solid var(--tx-border)',
        }}
      >
        <iframe
          src="https://s.tradingview.com/widgetembed/?symbol=BINANCE%3AINJUSDT&interval=60&hidesidetoolbar=1&symboledit=0&saveimage=0&theme=Dark&style=1&timezone=Etc%2FUTC&withdateranges=1&locale=en"
          style={{ width: '100%', height: '100%', border: 'none', display: 'block' }}
          title="INJ/USDT Live Price Chart"
          loading="lazy"
          allow="clipboard-write"
        />
      </div>
    </section>
  );
}
