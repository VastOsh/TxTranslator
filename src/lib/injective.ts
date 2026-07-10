import https from 'node:https';
import { getNetworkEndpoints, Network } from '@injectivelabs/networks';

const endpoints = getNetworkEndpoints(Network.Mainnet);

// LCD endpoints tried in order. Polkachu is first because *.injective.network
// and publicnode.com are commonly blocked by DNS filters (OpenDNS/corporate).
export const LCD_ENDPOINTS = [
  'https://injective-api.polkachu.com',
  endpoints.rest,
  'https://injective-rest.publicnode.com',
  'https://lcd.injective.network',
];

export interface CosmosTxResponse {
  tx: {
    body: {
      messages: Array<{ '@type': string; [key: string]: any }>;
      memo?: string;
    };
    auth_info?: {
      fee?: {
        amount: Array<{ denom: string; amount: string }>;
        gas_limit: string;
      };
    };
  };
  tx_response: {
    txhash: string;
    code: number;
    raw_log: string;
    gas_wanted: string;
    gas_used: string;
    timestamp: string;
    logs?: any[];
    events?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>;
  };
}

// Node.js on Windows cannot verify the intermediate CA for Injective endpoints
// because its bundled CA store lacks the issuer cert. We scope the bypass to
// these specific public blockchain read-only requests only.
const injectiveAgent = new https.Agent({ rejectUnauthorized: false });

function normalizeHash(hash: string): string {
  const trimmed = hash.trim();
  if (trimmed.startsWith('0x') || trimmed.startsWith('0X')) {
    return trimmed.slice(2).toUpperCase();
  }
  return trimmed.toUpperCase();
}

const HEADERS = {
  Accept: 'application/json',
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
  'Accept-Encoding': 'gzip, deflate',
};

export async function fetchJsonOverHttps(url: string): Promise<{ status: number; body: any } | null> {
  return new Promise((resolve) => {
    const req = https.get(url, { agent: injectiveAgent, headers: HEADERS }, (res) => {
      let raw = '';
      res.on('data', (chunk) => (raw += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode ?? 0, body: null });
        }
      });
    });
    req.on('error', (err) => {
      console.warn(`[injective] request error: ${err.message}`);
      resolve(null);
    });
    req.setTimeout(10_000, () => {
      req.destroy();
      resolve(null);
    });
  });
}

// Injective on-chain indexer — full history, no tx-index pruning.
// api.injective.network issues a 302 to this sentry endpoint, so we call it directly.
export const INDEXER_BASE = 'https://sentry.exchange.grpc-web.injective.network';

async function fetchFromIndexer(txHash: string): Promise<CosmosTxResponse | null> {
  const url = `${INDEXER_BASE}/api/explorer/v1/txs/${txHash}`;
  const result = await fetchJsonOverHttps(url);
  if (!result || result.status !== 200) return null;
  const d = result.body?.data;
  if (!d?.messages || !Array.isArray(d.messages)) return null;

  try {
    // "2026-05-13 21:37:30.398 +0000 UTC" → "2026-05-13T21:37:30Z"
    const timestamp = (d.block_timestamp as string)
      .replace(' ', 'T')
      .replace(/\.\d+ \+0000 UTC$/, 'Z');

    return {
      tx: {
        body: {
          messages: (d.messages as Array<{ type: string; value: Record<string, any> }>).map(m => ({
            '@type': m.type,
            ...m.value,
          })),
          memo: d.memo,
        },
        auth_info: d.gas_fee ? {
          fee: {
            amount: d.gas_fee.amount ?? [],
            gas_limit: String(d.gas_fee.gas_limit ?? d.gas_wanted ?? '0'),
          },
        } : undefined,
      },
      tx_response: {
        txhash: (d.hash as string).replace(/^0x/i, '').toUpperCase(),
        code: d.code ?? 0,
        raw_log: d.error_log ?? '',
        gas_wanted: String(d.gas_wanted ?? '0'),
        gas_used: String(d.gas_used ?? '0'),
        timestamp,
        logs: d.logs,
        // indexer does not expose top-level events; all events are in logs[]
      },
    };
  } catch {
    return null;
  }
}

async function fetchFromEndpoint(base: string, txHash: string): Promise<CosmosTxResponse | null> {
  const url = `${base}/cosmos/tx/v1beta1/txs/${txHash}`;
  const result = await fetchJsonOverHttps(url);
  if (!result) return null;
  if (result.status === 404) return null;
  if (result.status >= 400) {
    console.warn(`[injective] ${base} → HTTP ${result.status}`);
    return null;
  }
  const data = result.body;
  if (!data?.tx || !data?.tx_response) return null;
  return data as CosmosTxResponse;
}

export async function fetchTransaction(hash: string): Promise<CosmosTxResponse> {
  const txHash = normalizeHash(hash);

  // Race all LCD endpoints in parallel — first successful response wins.
  // Sequential retries cost up to 10s per blocked/slow endpoint; parallel costs one round-trip.
  const lcdResult = await Promise.any(
    LCD_ENDPOINTS.map(base =>
      fetchFromEndpoint(base, txHash).then(r => {
        if (r === null) throw new Error('no result');
        return r;
      })
    )
  ).catch(() => null);
  if (lcdResult) return lcdResult;

  // Fallback: Injective on-chain indexer has full history (no tx-index pruning)
  const indexerResult = await fetchFromIndexer(txHash);
  if (indexerResult) return indexerResult;

  throw new Error('Transaction not found. Please verify the hash and try again.');
}
