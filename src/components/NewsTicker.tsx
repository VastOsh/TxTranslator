'use client';

import { useState, useEffect, useRef } from 'react';

interface NewsItem {
  id: string;
  type: 'critical' | 'warning' | 'info';
  text: string;
  link?: string;
  linkText?: string;
}

const GAP_PX = 80; // gap between the two copies (matches paddingLeft below)

export default function NewsTicker() {
  const [items, setItems]           = useState<NewsItem[]>([]);
  const [dismissed, setDismissed]   = useState(false);
  const [animStyle, setAnimStyle]   = useState<React.CSSProperties>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const firstCopyRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    fetch('/api/news')
      .then(r => r.json())
      .then(data => setItems(data.items ?? []))
      .catch(() => {});
  }, []);

  // Measure container + first copy to set the exact pixel start/end for the animation.
  // FROM = container width  (content starts just off the right edge)
  // TO   = container width − (firstCopyWidth + gap)
  // At TO the second copy is exactly at the right edge → seamless loop.
  useEffect(() => {
    if (items.length === 0) return;

    const measure = () => {
      if (!containerRef.current || !firstCopyRef.current) return;
      const cw   = containerRef.current.offsetWidth;
      const tw   = firstCopyRef.current.offsetWidth;
      const span = tw + GAP_PX;
      const dur  = Math.max(15, Math.min(60, span / 80)); // 80 px/s
      setAnimStyle({
        '--ticker-from': `${cw}px`,
        '--ticker-to':   `${cw - span}px`,
        animationDuration: `${dur}s`,
      } as React.CSSProperties);
    };

    const raf = requestAnimationFrame(measure);
    const ro  = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); };
  }, [items]);

  if (dismissed || items.length === 0) return null;

  const hasCritical = items.some(i => i.type === 'critical');
  const color  = hasCritical ? 'rgba(255,90,90,0.95)'  : 'rgba(255,179,71,0.95)';
  const bg     = hasCritical ? 'rgba(255,90,90,0.07)'  : 'rgba(255,179,71,0.07)';
  const border = hasCritical ? 'rgba(255,90,90,0.28)'  : 'rgba(255,179,71,0.28)';

  const renderItems = (keySuffix = '') =>
    items.map((item, i) => (
      <span key={item.id + keySuffix}>
        {i > 0 && <span style={{ margin: '0 1.5rem', opacity: 0.3 }}>◆</span>}
        <span style={{ marginRight: '0.4rem', opacity: 0.65 }}>
          {item.type === 'critical' ? '●' : '▲'}
        </span>
        <span>{item.text}</span>
        {item.link && (
          <a
            href={item.link}
            target="_blank"
            rel="noopener noreferrer"
            onClick={e => e.stopPropagation()}
            style={{
              color,
              textDecoration: 'underline',
              textUnderlineOffset: '2px',
              marginLeft: '0.45rem',
            }}
          >
            {item.linkText ?? 'Learn more ↗'}
          </a>
        )}
      </span>
    ));

  return (
    <div style={{
      width: 'calc(100% + 2rem)',
      marginLeft: '-1rem',
      background: bg,
      borderBottom: `1px solid ${border}`,
      position: 'sticky',
      top: 0,
      zIndex: 50,
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'stretch',
    }}>
      {/* LIVE label */}
      <div style={{
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        padding: '0 0.85rem',
        borderRight: `1px solid ${border}`,
        color,
        fontSize: '0.63rem',
        fontWeight: 700,
        letterSpacing: '0.13em',
      }}>
        LIVE
      </div>

      {/* Scrolling track — ref on the container so we can measure its width */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', position: 'relative', height: '2.2rem' }}>
        <span
          className="news-ticker-track"
          style={{
            display: 'inline-block',
            whiteSpace: 'nowrap',
            color,
            fontSize: '0.78rem',
            letterSpacing: '0.02em',
            lineHeight: '2.2rem',
            ...animStyle,
          }}
        >
          {/* First copy — ref used to measure single-copy width */}
          <span ref={firstCopyRef}>{renderItems()}</span>
          {/* Second copy — seamless loop continuation */}
          <span style={{ paddingLeft: `${GAP_PX}px` }}>{renderItems('-dup')}</span>
        </span>
      </div>

      {/* Dismiss */}
      <button
        onClick={() => setDismissed(true)}
        aria-label="Dismiss news ticker"
        style={{
          flexShrink: 0,
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: `${color}88`,
          padding: '0 0.85rem',
          fontSize: '0.85rem',
          borderLeft: `1px solid ${border}`,
        }}
      >
        ✕
      </button>
    </div>
  );
}
