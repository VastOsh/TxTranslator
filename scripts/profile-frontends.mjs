#!/usr/bin/env node
// Fingerprint specific fee-recipient wallets to identify the front-end behind
// them: what markets they trade (broad majors = an order-book front-end like
// Choice; obscure new tokens = a launchpad like Trippy; a few vault markets =
// Mito) and the cid format their orders carry (each front-end stamps orders
// differently). Helix is included as a reference fingerprint.

import https from 'node:https';
import zlib from 'node:zlib';

const INDEXER_BASE = 'https://sentry.exchange.grpc-web.injective.network';
const HEADERS = { Accept: 'application/json', 'User-Agent': 'Mozilla/5.0 Chrome/125', 'Accept-Encoding': 'gzip, deflate' };
const PAGES = 3;

const TARGETS = {
  'inj1tnf9wk2yuu32xj4unhkh8d3nflacnhq8n0u7kp': 'Helix (ref)',
  'inj14k7wgey85pt226ugr9sq4h2ya774n82hzy26nf': '#1 unknown (10.6%)',
  'inj1jse4yg2h2uh7g8ucl3sd8j89td7x6g23tuhhlm': '#2 unknown (10.5%)',
  'inj1spwvf0n77k2g767rau05jssp073eh0vdgetn4l': '#3 unknown (9.5%)',
  'inj1q0k0gawl6k04852zr0h059lysrcatkujjdxsdk': '#4 unknown (8.7%)',
};

function fetchJson(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: HEADERS }, (res) => {
      const enc = (res.headers['content-encoding'] ?? '').toLowerCase();
      const s = enc === 'gzip' ? res.pipe(zlib.createGunzip()) : enc === 'deflate' ? res.pipe(zlib.createInflate()) : enc === 'br' ? res.pipe(zlib.createBrotliDecompress()) : res;
      const chunks = [];
      s.on('data', (c) => chunks.push(Buffer.from(c)));
      s.on('error', () => resolve(null));
      s.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { resolve(null); } });
    });
    req.on('error', () => resolve(null));
    req.setTimeout(12000, () => { req.destroy(); resolve(null); });
  });
}
async function idx(p) { for (let i = 0; i < 3; i++) { const r = await fetchJson(`${INDEXER_BASE}${p}`); if (r) return r; await new Promise((res) => setTimeout(res, 300 * (i + 1))); } return null; }
const stable = (s) => ['USDT', 'USDC', 'USD'].includes((s || '').toUpperCase());
async function pool(items, workers, fn) { let next = 0; const run = async () => { while (next < items.length) await fn(items[next++]); }; await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run)); }

const [der, spo] = await Promise.all([idx('/api/exchange/derivative/v1/markets?market_status=active'), idx('/api/exchange/spot/v1/markets')]);
const markets = [];
for (const m of der?.markets ?? []) markets.push({ id: m.marketId, ticker: m.ticker, type: 'derivative', quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6), quoteSym: (m.quoteTokenMeta?.symbol ?? '').toUpperCase() });
for (const m of spo?.markets ?? []) markets.push({ id: m.marketId, ticker: m.ticker, type: 'spot', quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6), quoteSym: (m.quoteTokenMeta?.symbol ?? '').toUpperCase() });
let injPrice = 0;
{ const inj = spo?.markets?.find((m) => m.ticker === 'INJ/USDT'); if (inj) { const d = await idx(`/api/exchange/spot/v1/trades?marketId=${inj.marketId}&limit=1`); const p = d?.trades?.[0]?.price; if (p) injPrice = Number(p.price) * 10 ** (18 - Number(inj.quoteTokenMeta?.decimals ?? 6)); } }

const prof = {};
for (const a of Object.keys(TARGETS)) prof[a] = { vol: 0, n: 0, tickers: new Map(), cids: [], spot: 0, deriv: 0 };

console.log(`Sampling ${markets.length} markets...`);
await pool(markets, 12, async (m) => {
  const qUsd = stable(m.quoteSym) ? 1 : m.quoteSym === 'INJ' ? injPrice : null;
  if (!qUsd) return;
  for (let skip = 0; skip < PAGES * 100; skip += 100) {
    const d = await idx(`/api/exchange/${m.type}/v1/trades?marketId=${m.id}&limit=100&skip=${skip}`);
    if (!d?.trades?.length) break;
    for (const t of d.trades) {
      if (t.executionSide !== 'taker') continue;
      const fr = t.feeRecipient || '';
      const p = prof[fr];
      if (!p) continue;
      const dv = m.type === 'derivative' ? (Number(t.positionDelta.executionPrice) / 10 ** m.quoteDec) * Number(t.positionDelta.executionQuantity) : ((Number(t.price.price) * Number(t.price.quantity)) / 10 ** m.quoteDec) * qUsd;
      p.vol += dv; p.n++;
      p[m.type === 'derivative' ? 'deriv' : 'spot'] += dv;
      p.tickers.set(m.ticker, (p.tickers.get(m.ticker) || 0) + dv);
      if (p.cids.length < 4) p.cids.push(t.cid ?? '');
    }
  }
});

for (const [addr, label] of Object.entries(TARGETS)) {
  const p = prof[addr];
  console.log(`\n=== ${label} ===\n  ${addr}`);
  console.log(`  sampled: $${Math.round(p.vol).toLocaleString('en-US')}   ${p.n} taker trades   deriv ${((p.deriv / (p.vol || 1)) * 100).toFixed(0)}% / spot ${((p.spot / (p.vol || 1)) * 100).toFixed(0)}%`);
  const top = [...p.tickers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`  markets (${p.tickers.size} total): ` + top.map(([tk, v]) => `${tk} ${((v / (p.vol || 1)) * 100).toFixed(0)}%`).join(', '));
  console.log(`  cid samples: ` + p.cids.map((c) => (c ? `"${c}"` : '(empty)')).join('  '));
}
