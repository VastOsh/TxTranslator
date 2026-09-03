'use client';

import { useEffect, useRef } from 'react';

declare global {
  interface Window {
    TradingView?: { widget: new (c: Record<string, unknown>) => void };
  }
}

const CHART_ID = 'tv-inj-chart';

export default function InjChart() {
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    function init() {
      if (!window.TradingView) return;
      new window.TradingView.widget({
        container_id: CHART_ID,
        symbol: 'BINANCE:INJUSDT',
        interval: '60',
        timezone: 'Etc/UTC',
        theme: 'dark',
        style: '1',
        locale: 'en',
        backgroundColor: 'rgba(10, 11, 15, 1)',
        gridColor: 'rgba(53, 201, 190, 0.06)',
        toolbar_bg: '#0A0B0F',
        hide_side_toolbar: true,
        hide_top_toolbar: true,
        withdateranges: false,
        save_image: false,
        enable_publishing: false,
        width: '100%',
        height: 400,
      });
    }

    if (window.TradingView) {
      init();
    } else {
      const script = document.createElement('script');
      script.src = 'https://s3.tradingview.com/tv.js';
      script.async = true;
      script.onload = init;
      document.head.appendChild(script);
    }
    /*
     * Security note: tv.js runs in our origin and could in principle access
     * localStorage. Accepted tradeoff: localStorage here contains only public
     * on-chain tx hashes (no keys, no tokens, no PII). The JS widget is the
     * only way to set backgroundColor and match the page background.
     */
  }, []);

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
      <div
        id={CHART_ID}
        style={{
          width: '100%',
          height: 400,
          borderRadius: 8,
          overflow: 'hidden',
          border: '1px solid var(--tx-border)',
        }}
      />
    </section>
  );
}
