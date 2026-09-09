import { INDEXER_BASE, LCD_ENDPOINTS, fetchJsonOverHttps } from '../injective';
import { fetchInjSupply } from './supply';
import { fetchTokenPrices } from '../prices';

// ── Onchain metrics ──────────────────────────────────────────────────────────
// The "Onchain Metrics" panel (the same figures Mintscan / injhub show) computed
// straight from the chain, from endpoints Renzu already hits. No scraping.
//
// The one figure that needs care is Staking APR. The naive Cosmos formula
// (annual_provisions x (1 - community_tax) / bonded) overstates it, because the
// mint module mints per BLOCK and the chain runs faster/slower than the block
// time baked into blocks_per_year. Injective's blocks_per_year (63,072,000)
// assumes ~0.5s blocks while the chain actually runs ~0.61s, so it mints fewer
// tokens per real year. Correcting by (paramBlockTime / realBlockTime) reproduces
// the 7.27% shown on injhub / Mintscan exactly, versus ~8.8% uncorrected.

const WAD = 1e18;
const SECONDS_PER_YEAR = 31_557_600;
const BLOCK_SAMPLE = 2000;               // blocks to average real block time over
const EVM_RPC = 'https://sentry.evm-rpc.injective.network';

export interface ChainMetrics {
  blockHeight: number | null;
  blockTimeSec: number | null;
  totalTxs: number | null;
  txPerBlock: number | null;
  inflation: number | null;            // fraction, e.g. 0.044
  stakingApr: number | null;           // fraction, e.g. 0.0727
  bondedInj: number | null;
  bondedRatio: number | null;          // fraction of supply
  supplyInj: number | null;
  communityPoolInj: number | null;
  communityPoolRatio: number | null;   // fraction of supply
  communityPoolUsd: number | null;
  evmGasPriceInj: number | null;       // INJ per gas unit
  injPrice: number | null;
}

function posNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}
function anyNum(v: unknown): number | null {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

// GET an LCD path, trying each endpoint in order until one answers 200.
async function lcdGet(path: string): Promise<any> {
  for (const base of LCD_ENDPOINTS) {
    if (!base) continue;
    const r = await fetchJsonOverHttps(`${base}${path}`);
    if (r && r.status === 200 && r.body) return r.body;
  }
  return null;
}

// EVM average gas price via the native EVM JSON-RPC (eth_gasPrice → wei hex).
async function fetchEvmGasInj(): Promise<number | null> {
  try {
    const res = await fetch(EVM_RPC, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', method: 'eth_gasPrice', params: [], id: 1 }),
      signal: AbortSignal.timeout(6_000),
    });
    const d = await res.json();
    const wei = typeof d?.result === 'string' ? parseInt(d.result, 16) : NaN;
    return Number.isFinite(wei) && wei > 0 ? wei / WAD : null;
  } catch {
    return null;
  }
}

export async function fetchChainMetrics(): Promise<ChainMetrics> {
  const [latest, txr, inflationBody, mintParams, annualProvBody, distParams, pool, commPool, supply, prices, evmGasPriceInj] =
    await Promise.all([
      lcdGet('/cosmos/base/tendermint/v1beta1/blocks/latest'),
      fetchJsonOverHttps(`${INDEXER_BASE}/api/explorer/v1/txs?limit=1`),
      lcdGet('/cosmos/mint/v1beta1/inflation'),
      lcdGet('/cosmos/mint/v1beta1/params'),
      lcdGet('/cosmos/mint/v1beta1/annual_provisions'),
      lcdGet('/cosmos/distribution/v1beta1/params'),
      lcdGet('/cosmos/staking/v1beta1/pool'),
      lcdGet('/cosmos/distribution/v1beta1/community_pool'),
      fetchInjSupply(),
      fetchTokenPrices(),
      fetchEvmGasInj(),
    ]);

  const blockHeight = posNum(latest?.block?.header?.height);
  const tLatest: string | undefined = latest?.block?.header?.time;

  // Real average block time over a wide sample of recent blocks.
  let blockTimeSec: number | null = null;
  if (blockHeight && tLatest && blockHeight > BLOCK_SAMPLE) {
    const older = await lcdGet(`/cosmos/base/tendermint/v1beta1/blocks/${blockHeight - BLOCK_SAMPLE}`);
    const tOlder: string | undefined = older?.block?.header?.time;
    if (tOlder) {
      const dt = (Date.parse(tLatest) - Date.parse(tOlder)) / 1000;
      if (dt > 0) blockTimeSec = dt / BLOCK_SAMPLE;
    }
  }

  const totalTxs = txr && txr.status === 200 ? posNum(txr.body?.paging?.total) : null;
  const txPerBlock = totalTxs && blockHeight ? totalTxs / blockHeight : null;

  const inflation = anyNum(inflationBody?.inflation);
  const blocksPerYear = posNum(mintParams?.params?.blocks_per_year);
  const annualProvInj = annualProvBody?.annual_provisions ? Number(annualProvBody.annual_provisions) / WAD : null;
  const communityTax = anyNum(distParams?.params?.community_tax) ?? 0;
  const bondedInj = pool?.pool?.bonded_tokens ? Number(pool.pool.bonded_tokens) / WAD : null;
  const supplyInj = supply.totalSupply;

  const poolInjRaw = Array.isArray(commPool?.pool)
    ? commPool.pool.find((c: any) => c?.denom === 'inj')?.amount
    : null;
  const communityPoolInj = poolInjRaw ? Number(poolInjRaw) / WAD : null;

  // Block-time correction (see header note) reproduces injhub / Mintscan's APR.
  const paramBlockTime = blocksPerYear ? SECONDS_PER_YEAR / blocksPerYear : null;
  const correction = paramBlockTime && blockTimeSec ? paramBlockTime / blockTimeSec : 1;
  const stakingApr =
    annualProvInj && bondedInj ? (annualProvInj * (1 - communityTax)) / bondedInj * correction : null;

  const injPrice = typeof prices.INJ === 'number' ? prices.INJ : null;

  return {
    blockHeight,
    blockTimeSec,
    totalTxs,
    txPerBlock,
    inflation,
    stakingApr,
    bondedInj,
    bondedRatio: bondedInj && supplyInj ? bondedInj / supplyInj : null,
    supplyInj,
    communityPoolInj,
    communityPoolRatio: communityPoolInj && supplyInj ? communityPoolInj / supplyInj : null,
    communityPoolUsd: communityPoolInj && injPrice ? communityPoolInj * injPrice : null,
    evmGasPriceInj,
    injPrice,
  };
}
