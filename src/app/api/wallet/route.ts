import { NextRequest, NextResponse } from 'next/server';
import { ACTION_LABELS, MESSAGE_TYPE_PROTOCOLS } from '@/constants/contracts';
import { HELIX_ROUTER_CONTRACTS } from '@/constants/markets';

const INDEXER_BASE = 'https://sentry.exchange.grpc-web.injective.network';
const ADDR_RE = /^inj1[a-z0-9]{38}$/;

async function fetchIndexer(url: string): Promise<any> {
  try {
    const res = await fetch(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

function detectProtocol(messages: Array<{ type: string; value: any }>): string | null {
  const first = messages[0];
  if (!first) return null;
  const type = first.type ?? '';
  if (
    (type === '/injective.wasmx.v1.MsgExecuteContractCompat' ||
      type === '/cosmwasm.wasm.v1.MsgExecuteContract') &&
    HELIX_ROUTER_CONTRACTS.has(first.value?.contract ?? '')
  ) return 'Helix';
  return (MESSAGE_TYPE_PROTOCOLS as Record<string, string>)[type] ?? null;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const address = typeof body?.address === 'string' ? body.address.trim() : '';

    if (!ADDR_RE.test(address)) {
      return NextResponse.json({ error: 'Invalid Injective address.' }, { status: 400 });
    }

    const data = await fetchIndexer(
      `${INDEXER_BASE}/api/explorer/v1/accountTxs/${address}?limit=10&skip=0`
    );

    if (!data) {
      return NextResponse.json({ error: 'Could not reach Injective indexer.' }, { status: 502 });
    }

    const raw: any[] = Array.isArray(data.data) ? data.data : [];

    const txs = raw.map((tx) => {
      const messages: Array<{ type: string; value: any }> = tx.messages ?? [];
      const firstMsg = messages[0];
      const msgType: string = firstMsg?.type ?? '';

      const actionLabel =
        (ACTION_LABELS as Record<string, string>)[msgType] ??
        msgType.split('.').pop()?.replace(/^Msg/, '') ??
        'Unknown';

      const rawTs: string = tx.block_timestamp ?? '';
      const timestamp = rawTs
        .replace(' ', 'T')
        .replace(/\.\d+ \+0000 UTC$/, 'Z');

      const hash = (tx.hash as string ?? '').replace(/^0x/i, '').toUpperCase();

      return {
        hash,
        timestamp,
        messageType: msgType,
        actionLabel,
        status: ((tx.code ?? 0) === 0 ? 'success' : 'failed') as 'success' | 'failed',
        protocol: detectProtocol(messages),
      };
    });

    return NextResponse.json({ txs, address });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unexpected error.';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
