import { NextRequest, NextResponse } from 'next/server';
import { ACTION_LABELS, MESSAGE_TYPE_PROTOCOLS } from '@/constants/contracts';
import { HELIX_ROUTER_CONTRACTS } from '@/constants/markets';
import { INDEXER_BASE, fetchJsonOverHttps } from '@/lib/injective';

const ADDR_RE = /^inj1[a-z0-9]{38}$/;

// fetchJsonOverHttps fails over between the two indexer mirror hosts, so a 504
// on one host no longer surfaces as "Could not reach Injective indexer".
async function fetchIndexer(url: string): Promise<any> {
  const res = await fetchJsonOverHttps(url);
  if (!res || res.status < 200 || res.status >= 300) return null;
  return res.body;
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
