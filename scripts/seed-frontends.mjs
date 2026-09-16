#!/usr/bin/env node
// One-off: identify the dominant fee-recipient (front-end) addresses on the
// Injective exchange module, so the Volume lens can label them. Samples recent
// taker trades across every active market, aggregates USD notional per
// feeRecipient, and reports the top addresses with how many markets each spans
// (broad reach = a universal front-end like Helix; single-market = an MM/vault).

import https from 'node:https';
import zlib from 'node:zlib';

const INDEXER_BASE = 'https://sentry.exchange.grpc-web.injective.network';
const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36',
  'Accept-Encoding': 'gzip, deflate',
};
const PAGES = 3; // 300 recent taker+maker trades per market — enough to rank recipients

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
async function idx(path) {
  for (let i = 0; i < 3; i++) {
    const r = await fetchJson(`${INDEXER_BASE}${path}`);
    if (r) return r;
    await new Promise((res) => setTimeout(res, 300 * (i + 1)));
  }
  return null;
}
const stable = (s) => ['USDT', 'USDC', 'USD'].includes((s || '').toUpperCase());

async function pool(items, workers, fn) {
  let next = 0;
  async function run() { while (next < items.length) { const i = next++; await fn(items[i]); } }
  await Promise.all(Array.from({ length: Math.min(workers, items.length) }, run));
}

const [der, spo] = await Promise.all([
  idx('/api/exchange/derivative/v1/markets?market_status=active'),
  idx('/api/exchange/spot/v1/markets'),
]);
const markets = [];
for (const m of der?.markets ?? []) markets.push({ id: m.marketId, type: 'derivative', quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6), quoteSym: (m.quoteTokenMeta?.symbol ?? '').toUpperCase() });
for (const m of spo?.markets ?? []) markets.push({ id: m.marketId, type: 'spot', quoteDec: Number(m.quoteTokenMeta?.decimals ?? 6), quoteSym: (m.quoteTokenMeta?.symbol ?? '').toUpperCase() });

// INJ price for INJ-quoted spot
let injPrice = 0;
{
  const inj = spo?.markets?.find((m) => m.ticker === 'INJ/USDT');
  if (inj) { const d = await idx(`/api/exchange/spot/v1/trades?marketId=${inj.marketId}&limit=1`); const p = d?.trades?.[0]?.price; if (p) injPrice = Number(p.price) * 10 ** (18 - Number(inj.quoteTokenMeta?.decimals ?? 6)); }
}

const agg = new Map(); // addr -> { vol, n, markets:Set }
console.log(`Sampling ${markets.length} markets...`);
await pool(markets, 12, async (m) => {
  let qUsd = stable(m.quoteSym) ? 1 : m.quoteSym === 'INJ' ? injPrice : null;
  if (!qUsd) return;
  for (let skip = 0; skip < PAGES * 100; skip += 100) {
    const d = await idx(`/api/exchange/${m.type}/v1/trades?marketId=${m.id}&limit=100&skip=${skip}`);
    if (!d?.trades?.length) break;
    for (const t of d.trades) {
      if (t.executionSide !== 'taker') continue;
      let dv;
      if (m.type === 'derivative') dv = (Number(t.positionDelta.executionPrice) / 10 ** m.quoteDec) * Number(t.positionDelta.executionQuantity);
      else dv = ((Number(t.price.price) * Number(t.price.quantity)) / 10 ** m.quoteDec) * qUsd;
      const fr = t.feeRecipient || '(none)';
      let e = agg.get(fr);
      if (!e) { e = { vol: 0, n: 0, markets: new Set() }; agg.set(fr, e); }
      e.vol += dv; e.n++; e.markets.add(m.id);
    }
  }
});

const total = [...agg.values()].reduce((s, e) => s + e.vol, 0);
const top = [...agg.entries()].sort((a, b) => b[1].vol - a[1].vol).slice(0, 30);
console.log(`\nDistinct feeRecipients: ${agg.size}   sampled USD: $${Math.round(total).toLocaleString('en-US')}\n`);
console.log('  share    markets   trades   address');
for (const [addr, e] of top) {
  console.log(`  ${((e.vol / total) * 100).toFixed(2).padStart(6)}%   ${String(e.markets.size).padStart(3)}      ${String(e.n).padStart(6)}   ${addr}`);
}
