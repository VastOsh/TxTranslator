'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import Lenis from 'lenis';
import Ferrofluid from '@/components/Ferrofluid';
import Changelog from '@/components/Changelog';
import { CURRENT_VERSION } from '@/data/changelog';
import { NEWS, type NewsItem } from '@/data/news';

// Official Injective symbol path (viewBox 308.5 308.699 617 617).
const INJ_PATH =
  'M681.785 316.104L679.934 319.806C744.102 347.571 780.505 404.952 780.505 467.886C780.505 535.756 736.081 597.456 649.701 649.901L635.51 658.539C570.725 698.027 538.024 742.451 538.024 796.13C538.024 865.234 592.32 915.827 666.977 915.827C786.675 915.827 925.5 788.109 925.5 617.817C925.5 590.052 921.798 562.904 915.011 536.99L910.692 538.224C912.543 552.415 913.16 562.904 913.16 572.776C913.16 673.347 856.396 759.727 761.378 817.108L752.123 822.661C731.762 834.384 714.486 841.171 697.21 841.171C674.381 841.171 657.105 826.363 657.105 804.768C657.105 786.258 669.445 767.748 709.55 744.302L721.273 737.515C810.121 685.687 859.481 612.881 859.481 532.054C859.481 429.632 782.973 345.103 681.785 316.104ZM552.215 918.912L554.066 915.21C489.898 887.446 453.495 830.065 453.495 767.131C453.495 699.261 497.919 637.561 584.299 585.116L598.49 576.478C663.275 536.99 695.976 492.566 695.976 438.887C695.976 369.783 641.68 319.189 567.023 319.189C447.325 319.189 308.5 446.908 308.5 617.2C308.5 644.965 312.202 672.113 318.989 698.027L323.308 696.793C321.457 682.602 320.84 672.113 320.84 662.241C320.84 561.67 377.604 475.29 472.622 417.909L481.877 412.356C502.238 400.633 519.514 393.846 536.79 393.846C559.619 393.846 576.895 408.654 576.895 430.249C576.895 448.759 564.555 467.269 524.45 490.715L512.727 497.502C423.879 549.33 374.519 622.136 374.519 702.963C374.519 805.385 451.027 889.914 552.215 918.912Z';

type Detected = { name: string | null; color: string; kind: string; href: string | null };

function detect(raw: string): Detected | null {
  const v = raw.trim();
  if (!v) return null;
  if (/^inj1[0-9a-z]{34,}$/i.test(v))
    return { name: 'Wallet Intelligence', color: 'var(--violet)', kind: 'Injective address', href: `/wallet?address=${encodeURIComponent(v)}` };
  if (/^0x[0-9a-fA-F]{40}$/.test(v))
    return { name: 'Wallet Intelligence', color: 'var(--violet)', kind: 'EVM address', href: `/wallet?address=${encodeURIComponent(v)}` };
  if (/^(0x)?[0-9a-fA-F]{64}$/.test(v))
    return { name: 'TxTranslator', color: 'var(--teal)', kind: 'Transaction hash', href: `/tx/${v}` };
  if (/^(factory\/|peggy0x|ibc\/)/i.test(v))
    return { name: 'Token Safety', color: 'var(--amber)', kind: 'Token / denom', href: `/token?q=${encodeURIComponent(v)}` };
  if (/^[A-Za-z][A-Za-z0-9]{1,11}$/.test(v))
    return { name: 'Token Safety', color: 'var(--amber)', kind: 'Token symbol', href: `/token?q=${encodeURIComponent(v)}` };
  return { name: null, color: 'var(--faint)', kind: 'Unrecognized, keep typing', href: null };
}

const EXAMPLES = [
  { label: 'transaction', value: '0x9f3ca8b1d47e2065f0a9c7b3e15d8842aa6c04f19b7de35216c0af8de49b7c31' },
  { label: 'inj1… address', value: 'inj1kp9r7q2y8xhs3f4m6vd0lw5nt7cga2ejzu4b9d' },
  { label: 'token', value: 'INJ' },
];

type Summary = { vol7d: number | null; injSupply: number | null };

function fmtUsdCompact(n: number | null | undefined): string {
  if (n == null) return '—';
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (a >= 1e6) return `$${Math.round(n / 1e6)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function fmtSupply(n: number | null | undefined): string {
  if (n == null) return '—';
  return `${(n / 1e6).toFixed(2)}M INJ`;
}

type CardDef = { href: string; external?: boolean; name: string; chip: string; desc: string; stat: string };
type CatDef = { id: string; tag: string; desc: string; color: string; cards: CardDef[] };

const CATS: CatDef[] = [
  {
    id: 'understand', tag: 'Understand', desc: 'Make sense of what just happened.', color: 'var(--teal)',
    cards: [
      { href: '/tx', name: 'TxTranslator', chip: 'flagship · on X', desc: 'Any Injective transaction decoded into plain English. Every message, transfer and fee, in the order they happened.', stat: 'decode · wallet scan · PnL' },
    ],
  },
  {
    id: 'detect', tag: 'Detect', desc: 'See risk and intent before it costs you.', color: 'var(--violet)',
    cards: [
      { href: '/token', name: 'Token Safety', chip: '6 signals', desc: 'Impersonation checks, launchpad rug signals, holder bubble maps and wallet-funding graphs for any denom.', stat: 'impersonates · creator history' },
      { href: '/wallet', name: 'Wallet Intelligence', chip: 'Cosmos · EVM', desc: 'Who is behind an address. Wallet age, first funder, launchpad track record, holdings and live risk flags.', stat: 'first funder · portfolio' },
      { href: '/insiders', name: 'Insiders', chip: 'cross-token', desc: 'Serial funders that quietly seed the same wallets across tokens, surfaced before a launch rather than after.', stat: 'funding graph · 1h refresh' },
    ],
  },
  {
    id: 'markets', tag: 'Markets', desc: 'Real numbers, reconstructed from the chain.', color: 'var(--amber)',
    cards: [
      { href: '/stats', name: 'Volume', chip: 'on-chain', desc: 'Spot and perp volume rebuilt trade by trade, plus the INJ burn auction. Daily, weekly, monthly, all time.', stat: 'spot · perp · INJ burn' },
      { href: 'https://x.com/TxTranslator', external: true, name: 'Whale Feed', chip: 'live · on X', desc: 'Large trades and transfers the moment they settle, streamed and auto-posted to X.', stat: 'thresholded · real time' },
    ],
  },
  {
    id: 'ecosystem', tag: 'Ecosystem', desc: 'Everything else worth watching on Injective.', color: 'var(--rose)',
    cards: [
      { href: '/dapps', name: 'dApp Directory', chip: 'directory', desc: 'Every app building on Injective, gathered in one browsable place, with the links that actually work.', stat: 'DeFi · NFT · infra' },
      { href: '/buyback', name: 'Community BuyBack', chip: '/buyback', desc: 'Follow each INJ buyback round, with honest deposit timing and a clear read on where the flows land.', stat: 'rounds · leaderboard' },
    ],
  },
];

function Lensmark() {
  return (
    <svg className="rz-lensmark" viewBox="0 0 118 118" fill="none" aria-hidden="true">
      <circle cx="59" cy="59" r="46" stroke="var(--cc)" strokeWidth="1.2" opacity=".9" />
      <circle cx="59" cy="59" r="30" stroke="var(--cc)" strokeWidth="1" opacity=".55" />
      <circle className="rz-pupil" cx="59" cy="59" r="6" fill="var(--faint)" />
    </svg>
  );
}

function ToolCard({ c }: { c: CardDef }) {
  const inner = (
    <>
      <Lensmark />
      <div className="rz-card-top">
        <h3>{c.name}</h3>
        <span className="rz-chip">{c.chip}</span>
      </div>
      <p>{c.desc}</p>
      <div className="rz-foot">
        <span className="rz-stat">{c.stat}</span>
        <span className="rz-go">open →</span>
      </div>
    </>
  );
  return c.external ? (
    <a className="rz-card" href={c.href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    <Link className="rz-card" href={c.href}>{inner}</Link>
  );
}

function NewsCard({ n }: { n: NewsItem }) {
  const inner = (
    <>
      <div className="rz-news-top">
        <span className="rz-news-kind">{n.kind}</span>
        <span className="rz-news-date">{n.date}</span>
      </div>
      <h3 className="rz-news-title">{n.title}</h3>
      <p className="rz-news-blurb">{n.blurb}</p>
      {n.angle && (
        <div className="rz-news-angle">
          <span className="rz-news-angle-tag">Angle</span>
          <span>{n.angle}</span>
        </div>
      )}
      <span className="rz-news-go">{n.cta ?? 'Open lens'} →</span>
    </>
  );
  const style = { ['--cc' as string]: n.accent } as React.CSSProperties;
  return n.external ? (
    <a className="rz-news-card" style={style} href={n.href} target="_blank" rel="noopener noreferrer">{inner}</a>
  ) : (
    <Link className="rz-news-card" style={style} href={n.href}>{inner}</Link>
  );
}

function RenzuGlyph({ size = 26 }: { size?: number }) {
  return (
    <svg className="rz-glyph" width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <circle cx="16" cy="16" r="14" stroke="url(#rzg)" strokeWidth="2" />
      <circle cx="16" cy="16" r="7.5" stroke="#9AA3B5" strokeWidth="1.4" opacity=".7" />
      <circle cx="16" cy="16" r="2.4" fill="#35C9BE" />
      <defs>
        <linearGradient id="rzg" x1="2" y1="4" x2="30" y2="28">
          <stop stopColor="#35C9BE" /><stop offset=".55" stopColor="#9B8CFF" /><stop offset="1" stopColor="#F0B24A" />
        </linearGradient>
      </defs>
    </svg>
  );
}

export default function RenzuHub() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const heroRef = useRef<HTMLElement>(null);
  const [q, setQ] = useState('');
  const [fluidPaused, setFluidPaused] = useState(false);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [changelogOpen, setChangelogOpen] = useState(false);

  const det = detect(q);
  const rc = det ? det.color : 'var(--accent)';

  // Live headline numbers (7d verified volume, INJ supply). Fails soft.
  useEffect(() => {
    let alive = true;
    fetch('/api/summary')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive && d && !d.error) setSummary({ vol7d: d.vol7d ?? null, injSupply: d.injSupply ?? null }); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const vol7d = summary?.vol7d ?? null;
  const vol7dLabel = vol7d != null ? `${fmtUsdCompact(vol7d)} / 7d verified` : null;

  function go() {
    const d = detect(q);
    if (d?.href) router.push(d.href);
  }

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion:reduce)').matches;
    const finePt = window.matchMedia('(pointer:fine)').matches;

    // reveal-on-scroll (enabled only after mount; hero/proof are never hidden)
    root.classList.add('rz-anim');
    const io = new IntersectionObserver(
      (es) => es.forEach((en) => { if (en.isIntersecting) { en.target.classList.add('rz-in'); io.unobserve(en.target); } }),
      { rootMargin: '0px 0px -8% 0px', threshold: 0.08 },
    );
    root.querySelectorAll('.rz-reveal').forEach((el) => {
      if (el.getBoundingClientRect().top < window.innerHeight * 0.92) el.classList.add('rz-in');
      else io.observe(el);
    });

    // progress bar
    const setProgress = () => {
      const h = document.documentElement.scrollHeight - window.innerHeight;
      const p = h > 0 ? Math.min(window.scrollY / h, 1) : 0;
      if (progressRef.current) progressRef.current.style.transform = `scaleX(${p})`;
    };

    // Lenis smooth scroll
    let lenis: Lenis | null = null;
    let rafId = 0;
    if (!reduce) {
      lenis = new Lenis({ lerp: 0.09, smoothWheel: true });
      const raf = (t: number) => { lenis!.raf(t); rafId = requestAnimationFrame(raf); };
      rafId = requestAnimationFrame(raf);
      lenis.on('scroll', setProgress);
    }
    window.addEventListener('scroll', setProgress, { passive: true });
    setProgress();

    // in-page anchor links
    const anchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('a[href^="#"]'));
    const onAnchor = (e: Event) => {
      const a = e.currentTarget as HTMLAnchorElement;
      const id = a.getAttribute('href');
      if (!id || id.length < 2) return;
      const t = root.querySelector(id);
      if (!t) return;
      e.preventDefault();
      if (lenis) lenis.scrollTo(t as HTMLElement, { offset: -72 });
      else (t as HTMLElement).scrollIntoView({ behavior: 'smooth' });
    };
    anchors.forEach((a) => a.addEventListener('click', onAnchor));

    // custom lens cursor
    const cur = cursorRef.current;
    let curRaf = 0;
    let tx = window.innerWidth / 2, ty = window.innerHeight / 2, cx = tx, cy = ty;
    const onMove = (e: MouseEvent) => {
      tx = e.clientX; ty = e.clientY;
      if (reduce && cur) cur.style.transform = `translate(${tx}px,${ty}px)`;
    };
    const addHot = () => cur?.classList.add('rz-hot');
    const rmHot = () => cur?.classList.remove('rz-hot');
    const hideCur = () => { if (cur) { cur.style.opacity = '0'; cur.classList.remove('rz-hot'); } };
    const showCur = () => { if (cur) cur.style.opacity = '1'; };
    const hotEls: Element[] = [];
    const inEls: Element[] = [];
    if (finePt && cur) {
      root.classList.add('rz-cursoron');
      window.addEventListener('mousemove', onMove, { passive: true });
      if (!reduce) {
        const loop = () => {
          cx += (tx - cx) * 0.32; cy += (ty - cy) * 0.32;
          cur.style.transform = `translate(${cx}px,${cy}px)`;
          curRaf = requestAnimationFrame(loop);
        };
        curRaf = requestAnimationFrame(loop);
      }
      root.querySelectorAll('a,button,.rz-card,.rz-ex').forEach((el) => {
        el.addEventListener('mouseenter', addHot); el.addEventListener('mouseleave', rmHot); hotEls.push(el);
      });
      root.querySelectorAll('input,textarea').forEach((el) => {
        el.addEventListener('mouseenter', hideCur); el.addEventListener('mouseleave', showCur); inEls.push(el);
      });
      document.addEventListener('mouseleave', hideCur);
      document.addEventListener('mouseenter', showCur);
    }

    return () => {
      io.disconnect();
      window.removeEventListener('scroll', setProgress);
      anchors.forEach((a) => a.removeEventListener('click', onAnchor));
      lenis?.destroy();
      if (rafId) cancelAnimationFrame(rafId);
      if (curRaf) cancelAnimationFrame(curRaf);
      window.removeEventListener('mousemove', onMove);
      hotEls.forEach((el) => { el.removeEventListener('mouseenter', addHot); el.removeEventListener('mouseleave', rmHot); });
      inEls.forEach((el) => { el.removeEventListener('mouseenter', hideCur); el.removeEventListener('mouseleave', showCur); });
      document.removeEventListener('mouseleave', hideCur);
      document.removeEventListener('mouseenter', showCur);
      root.classList.remove('rz-cursoron', 'rz-anim');
    };
  }, []);

  // While the changelog modal is open, hand the pointer back to the native cursor
  // (the modal overlay sits above the custom lens cursor) and stop the hub's
  // hover-hotspot styling from forcing cursor:none over it.
  useEffect(() => {
    rootRef.current?.classList.toggle('rz-modal-open', changelogOpen);
  }, [changelogOpen]);

  // Pause the hero fluid when it scrolls out of view or for reduced-motion.
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion:reduce)').matches) { setFluidPaused(true); return; }
    const hero = heroRef.current;
    if (!hero) return;
    const io = new IntersectionObserver(([e]) => setFluidPaused(!e.isIntersecting), { threshold: 0 });
    io.observe(hero);
    return () => io.disconnect();
  }, []);

  return (
    <div className="renzu" ref={rootRef}>
      <div className="rz-progress" ref={progressRef} />

      <div className="rz-cursor" ref={cursorRef} aria-hidden="true">
        <div className="rz-cur-in">
          <svg width="34" height="34" viewBox="0 0 34 34" fill="none">
            <circle cx="17" cy="17" r="14" stroke="#35C9BE" strokeWidth="1.4" opacity=".9" />
            <circle cx="17" cy="17" r="7.5" stroke="#9AA3B5" strokeWidth="1.1" opacity=".65" />
            <circle cx="17" cy="17" r="2" fill="#35C9BE" />
          </svg>
        </div>
      </div>

      {/* Injective symbol gradients */}
      <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
        <defs>
          <linearGradient id="inj" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#4D3DFF" /><stop offset="1" stopColor="#9A8CFF" />
          </linearGradient>
          <linearGradient id="injL" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8E7FFF" /><stop offset="1" stopColor="#D8D1FF" />
          </linearGradient>
        </defs>
      </svg>

      <header className="rz-nav">
        <div className="rz-wrap rz-nav-in">
          <Link href="/" className="rz-brand"><RenzuGlyph /> Renzu</Link>
          <nav className="rz-nav-links">
            <a href="#lenses">Lenses</a>
            <a href="#news">News</a>
            <button type="button" className="rz-nav-whatsnew" onClick={() => setChangelogOpen(true)}>
              What&apos;s new <span className="rz-nav-ver">{CURRENT_VERSION}</span>
            </button>
            <a href="#" className="rz-nav-cta"><span className="rz-dot" />renzu.xyz</a>
          </nav>
        </div>
      </header>

      <section className="rz-hero" ref={heroRef}>
        <Ferrofluid
          className="rz-hero-fluid"
          colors={['#35C9BE', '#9B8CFF', '#F0B24A', '#E77BA6']}
          speed={0.26}
          scale={1.5}
          turbulence={1}
          fluidity={0.12}
          rimWidth={0.22}
          sharpness={2.4}
          shimmer={1.2}
          glow={1.5}
          flowDirection="up"
          opacity={0.85}
          mouseStrength={1.1}
          mouseRadius={0.32}
          dpr={1.5}
          paused={fluidPaused}
        />
        <div className="rz-wrap rz-hero-grid">
          <div>
            <span className="rz-eyebrow"><b>Injective</b> · intelligence hub · v2.0</span>
            <h1 className="rz-title">Every lens on <span className="rz-spectral">Injective.</span></h1>
            <p className="rz-lede">Renzu turns raw chain activity into something you can actually read. Transactions, wallets, tokens, whales and real volume, each brought into focus through its own lens.</p>
            <p className="rz-lineage">Formerly <b>TxTranslator</b>. Now one lens among many.</p>

            <div className="rz-lensbar-shell">
              <form className="rz-lensbar" style={{ ['--rc' as string]: rc } as React.CSSProperties} onSubmit={(e) => { e.preventDefault(); go(); }}>
                <span className="rz-lead">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <circle cx="11" cy="11" r="7" /><path d="m20 20-3.2-3.2" />
                  </svg>
                </span>
                <input
                  ref={inputRef}
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="Paste a transaction, inj1… address, or token"
                  aria-label="Paste a transaction, address, or token"
                />
                <button className="rz-focus-btn" type="submit">Focus</button>
              </form>
              <div className="rz-route">
                <span className="rz-kind">{det ? det.kind : 'Paste anything on-chain'}</span>
                <span className="rz-arrow" style={{ opacity: det ? 1 : 0.5 }}>→</span>
                <span className="rz-lens" style={{ fontStyle: det && !det.name ? 'italic' : 'normal' }}>
                  {det ? (det.name ? `opens in ${det.name}` : 'no lens yet') : 'Renzu picks the lens'}
                </span>
              </div>
              <div className="rz-examples">
                <span className="rz-lbl">Try:</span>
                {EXAMPLES.map((ex) => (
                  <button key={ex.label} className="rz-ex" type="button" onClick={() => { setQ(ex.value); inputRef.current?.focus(); }}>
                    {ex.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="rz-orb-stage">
            <div className="rz-orb-float">
              <div className="rz-inj-bg">
                <svg viewBox="308.5 308.699 617 617" aria-hidden="true"><path fill="url(#inj)" d={INJ_PATH} /></svg>
              </div>
              <div className="rz-orb">
                <div className="rz-orb-refract">
                  <svg viewBox="308.5 308.699 617 617" aria-hidden="true"><path fill="url(#injL)" d={INJ_PATH} /></svg>
                </div>
                <div className="rz-orb-spec" />
                <div className="rz-orb-glint" />
              </div>
            </div>
            <span className="rz-orb-cap">borosilicate · refracting Injective</span>
          </div>
        </div>

        <div className="rz-wrap">
          <div className="rz-proof">
            <div>
              <div className="rz-n rz-teal">{vol7d != null ? fmtUsdCompact(vol7d) : '···'}</div>
              <div className="rz-k">verified spot and perp volume over 7 days, rebuilt trade by trade</div>
            </div>
            <div>
              <div className="rz-n">{summary ? fmtSupply(summary.injSupply) : '···'}</div>
              <div className="rz-k">live INJ total supply. <b>No fixed max cap</b>, it moves with staking inflation and the weekly burn</div>
            </div>
            <div>
              <div className="rz-n">9 lenses</div>
              <div className="rz-k">one hub to decode, detect and monitor Injective</div>
            </div>
            <div>
              <div className="rz-n rz-amber">2 years</div>
              <div className="rz-k">of trade history reconstructable, block by block</div>
            </div>
          </div>
        </div>
      </section>

      <main className="rz-wrap rz-main" id="lenses">
        {CATS.map((cat) => (
          <section className="rz-cat rz-reveal" id={cat.id} key={cat.id} style={{ ['--cc' as string]: cat.color } as React.CSSProperties}>
            <div className="rz-cat-head">
              <span className="rz-cat-tag">{cat.tag}</span>
              <span className="rz-cat-desc">{cat.desc}</span>
            </div>
            <div className="rz-cards">
              {cat.cards.map((c) => <ToolCard key={c.name} c={c.href === '/stats' && vol7dLabel ? { ...c, stat: vol7dLabel } : c} />)}
            </div>
          </section>
        ))}

        <section className="rz-news rz-reveal" id="news" style={{ ['--cc' as string]: 'var(--teal)' } as React.CSSProperties}>
          <div className="rz-cat-head">
            <span className="rz-cat-tag">News</span>
            <span className="rz-cat-desc">What&apos;s new on Renzu, and what&apos;s worth sharing.</span>
          </div>
          <div className="rz-news-grid">
            {NEWS.map((n) => <NewsCard key={n.id} n={n} />)}
          </div>
        </section>
      </main>

      {changelogOpen && <Changelog onClose={() => setChangelogOpen(false)} />}

      <footer className="rz-footer">
        <div className="rz-wrap rz-foot-in">
          <div>
            <div className="rz-foot-brand"><RenzuGlyph size={24} /> Renzu</div>
            <div className="rz-foot-tag"><span className="rz-spectral">Every lens on Injective.</span></div>
          </div>
          <div className="rz-foot-meta">
            <a href="#lenses">renzu.xyz</a>
            <a href="https://x.com/TxTranslator" target="_blank" rel="noopener noreferrer">TxTranslator on X</a>
            <a href="https://x.com/SiGPRMR" target="_blank" rel="noopener noreferrer">Contact</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
