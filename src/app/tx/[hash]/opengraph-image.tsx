import { ImageResponse } from 'next/og';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchTransaction } from '@/lib/injective';
import { normalizeTransaction } from '@/lib/normalizer';
import { HELIX_ROUTER_CONTRACTS } from '@/constants/markets';

export const alt = 'Injective Transaction Decoded';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';
// Tx data is immutable on-chain — cache the generated image at the CDN edge.
// After first generation per hash, Twitter/Discord get an instant cached response.
export const revalidate = 86400;

const MSG_TO_CATEGORY: Record<string, string> = {
  '/cosmos.staking.v1beta1.MsgDelegate': 'STAKE',
  '/cosmos.staking.v1beta1.MsgUndelegate': 'UNSTAKE',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'REDELEGATE',
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': 'CLAIM',
  '/cosmos.bank.v1beta1.MsgSend': 'SEND',
  '/cosmos.bank.v1beta1.MsgMultiSend': 'MULTI-SEND',
  // v1beta1 exchange messages
  '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgBatchUpdateOrders': 'TRADE',
  '/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgDeposit': 'DEPOSIT',
  '/injective.exchange.v1beta1.MsgWithdraw': 'WITHDRAW',
  // v2 exchange messages (newer Injective protocol version)
  '/injective.exchange.v2.MsgCreateSpotMarketOrder': 'TRADE',
  '/injective.exchange.v2.MsgCreateSpotLimitOrder': 'TRADE',
  '/injective.exchange.v2.MsgBatchUpdateOrders': 'TRADE',
  '/injective.exchange.v2.MsgCreateDerivativeLimitOrder': 'TRADE',
  '/injective.exchange.v2.MsgCreateDerivativeMarketOrder': 'TRADE',
  '/injective.exchange.v2.MsgDeposit': 'DEPOSIT',
  '/injective.exchange.v2.MsgWithdraw': 'WITHDRAW',
  '/ibc.applications.transfer.v1.MsgTransfer': 'BRIDGE',
  '/cosmwasm.wasm.v1.MsgExecuteContract': 'CONTRACT',
  '/injective.wasmx.v1.MsgExecuteContractCompat': 'CONTRACT',
  '/cosmos.gov.v1beta1.MsgVote': 'VOTE',
  '/cosmos.gov.v1.MsgVote': 'VOTE',
  '/cosmos.gov.v1beta1.MsgSubmitProposal': 'PROPOSE',
  '/cosmos.gov.v1.MsgSubmitProposal': 'PROPOSE',
  '/cosmos.gov.v1beta1.MsgDeposit': 'GOV DEPOSIT',
  '/cosmos.gov.v1.MsgDeposit': 'GOV DEPOSIT',
  '/cosmos.authz.v1beta1.MsgRevoke': 'REVOKE',
  '/cosmos.authz.v1beta1.MsgGrant': 'GRANT',
};

function detectCategory(messages: Array<{ '@type': string; contract?: string; msgs?: any[] }>): string {
  let first = messages[0];
  if (!first) return 'TRANSACTION';

  // Unwrap MsgExec (authz) to inspect the inner message type
  if (first['@type'] === '/cosmos.authz.v1beta1.MsgExec' && first.msgs?.[0]) {
    first = first.msgs[0];
  }

  const type = first['@type'] ?? '';
  if (
    (type === '/injective.wasmx.v1.MsgExecuteContractCompat' ||
      type === '/cosmwasm.wasm.v1.MsgExecuteContract') &&
    HELIX_ROUTER_CONTRACTS.has(first.contract ?? '')
  )
    return 'TRADE';
  return MSG_TO_CATEGORY[type] ?? 'TRANSACTION';
}

const CATEGORY_COLOR: Record<string, string> = {
  TRADE: '#00f2fe',
  STAKE: '#22c55e',
  UNSTAKE: '#fb923c',
  REDELEGATE: '#60a5fa',
  CLAIM: '#fbbf24',
  SEND: '#60a5fa',
  'MULTI-SEND': '#60a5fa',
  BRIDGE: '#a78bfa',
  VOTE: '#c084fc',
  PROPOSE: '#c084fc',
  'GOV DEPOSIT': '#c084fc',
  CONTRACT: '#00f2fe',
  DEPOSIT: '#22c55e',
  WITHDRAW: '#fb923c',
  GRANT: '#fbbf24',
  REVOKE: '#f87171',
  TRANSACTION: '#94a3b8',
};

const VALID_FONT_SIGS = [
  '00010000', // TrueType
  '74727565', // 'true' (Apple TrueType)
  '4f54544f', // 'OTTO' (CFF/OTF)
];

async function loadFont(): Promise<ArrayBuffer | null> {
  try {
    const buf = await readFile(join(process.cwd(), 'public/fonts/Rajdhani-Bold.ttf'));
    // Reject corrupt or WOFF/WOFF2 files — Satori only accepts raw TTF/OTF buffers
    const sig = buf.slice(0, 4).toString('hex');
    if (!VALID_FONT_SIGS.includes(sig)) return null;
    return buf.buffer as ArrayBuffer;
  } catch {
    return null;
  }
}

export default async function Image({ params }: { params: Promise<{ hash: string }> }) {
  const { hash } = await params;

  let category = 'TRANSACTION';
  let protocol: string | null = null;
  let status: 'success' | 'failed' = 'success';
  let assetsLine = '';

  try {
    const rawTx = await fetchTransaction(hash);
    const normalized = normalizeTransaction(hash, rawTx);
    category = detectCategory(rawTx.tx.body.messages);
    protocol = normalized.target_protocol;
    status = normalized.status;

    const nonZeroAssets = normalized.assets.filter(a => parseFloat(a.amount) > 0);
    if (nonZeroAssets.length > 0) {
      assetsLine = nonZeroAssets
        .slice(0, 2)
        .map(a => {
          const sign = a.direction === 'in' ? '+' : a.direction === 'out' ? '−' : '';
          return `${sign}${a.amount} ${a.humanDenom}`;
        })
        .join('   ·   ');
    }
  } catch {
    // render fallback generic card
  }

  const color = CATEGORY_COLOR[category] ?? '#94a3b8';
  const shortHash =
    hash.length > 16
      ? `${hash.slice(0, 8).toUpperCase()}···${hash.slice(-8).toUpperCase()}`
      : hash.toUpperCase();

  const fontData = await loadFont();
  const fontFamily = fontData ? 'Rajdhani' : 'sans-serif';

  const card = (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          backgroundColor: '#0b111e',
          backgroundImage: `radial-gradient(ellipse 900px 600px at -80px -80px, ${color}1e, transparent 65%)`,
        }}
      >
        {/* Top accent line */}
        <div
          style={{
            width: '100%',
            height: 3,
            background: `linear-gradient(to right, transparent, ${color}, transparent)`,
            display: 'flex',
          }}
        />

        {/* Body */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            flex: 1,
            padding: '40px 64px 36px',
            justifyContent: 'space-between',
          }}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div
                style={{
                  width: 44,
                  height: 44,
                  background: color,
                  borderRadius: 8,
                  display: 'flex',
                }}
              />
              <span
                style={{
                  fontSize: 26,
                  fontWeight: 700,
                  color: '#e2e8f0',
                  letterSpacing: '0.18em',
                  fontFamily,
                }}
              >
                TX · TRANSLATOR
              </span>
            </div>
            <div
              style={{
                display: 'flex',
                padding: '6px 18px',
                border: '1px solid rgba(0,242,254,0.28)',
                borderRadius: 6,
              }}
            >
              <span
                style={{
                  fontSize: 13,
                  letterSpacing: '0.12em',
                  color: 'rgba(0,242,254,0.7)',
                  fontFamily,
                }}
              >
                INJECTIVE MAINNET
              </span>
            </div>
          </div>

          {/* Center */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 22 }}>
            {/* Category badge */}
            <div
              style={{
                display: 'flex',
                alignSelf: 'flex-start',
                padding: '10px 30px',
                background: `${color}1a`,
                border: `2px solid ${color}55`,
                borderRadius: 12,
              }}
            >
              <span
                style={{
                  fontSize: 50,
                  fontWeight: 700,
                  color,
                  letterSpacing: '0.1em',
                  fontFamily,
                }}
              >
                {category}
              </span>
            </div>

            {/* Assets */}
            {assetsLine ? (
              <span
                style={{
                  fontSize: 30,
                  color: 'rgba(226,232,240,0.88)',
                  letterSpacing: '0.02em',
                  fontFamily,
                }}
              >
                {assetsLine}
              </span>
            ) : null}

            {/* Protocol + Status row */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {protocol ? (
                <div
                  style={{
                    display: 'flex',
                    padding: '5px 16px',
                    background: 'rgba(255,255,255,0.055)',
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 6,
                  }}
                >
                  <span style={{ fontSize: 18, color: 'rgba(203,213,225,0.88)', fontFamily }}>
                    via {protocol}
                  </span>
                </div>
              ) : null}
              <div
                style={{
                  display: 'flex',
                  padding: '5px 16px',
                  background:
                    status === 'success' ? 'rgba(34,197,94,0.1)' : 'rgba(248,113,113,0.1)',
                  border: `1px solid ${status === 'success' ? 'rgba(34,197,94,0.35)' : 'rgba(248,113,113,0.35)'}`,
                  borderRadius: 6,
                }}
              >
                <span
                  style={{
                    fontSize: 18,
                    color: status === 'success' ? '#4ade80' : '#f87171',
                    fontFamily,
                  }}
                >
                  {status === 'success' ? '✓ Success' : '✗ Failed'}
                </span>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span
              style={{
                fontSize: 14,
                color: 'rgba(100,116,139,0.65)',
                letterSpacing: '0.1em',
                fontFamily: 'monospace',
              }}
            >
              {shortHash}
            </span>
            <span
              style={{
                fontSize: 14,
                color: 'rgba(100,116,139,0.5)',
                letterSpacing: '0.04em',
                fontFamily,
              }}
            >
              Decode any Injective transaction in plain English
            </span>
          </div>
        </div>

        {/* Bottom accent line */}
        <div
          style={{
            width: '100%',
            height: 2,
            background: `linear-gradient(to right, transparent, ${color}80, transparent)`,
            display: 'flex',
          }}
        />
      </div>
  );

  try {
    return new ImageResponse(card, {
      ...size,
      fonts: fontData ? [{ name: 'Rajdhani', data: fontData, weight: 700, style: 'normal' }] : [],
    });
  } catch (err) {
    console.error('[og-image] ImageResponse render failed:', err);
    // Last-resort fallback: plain text card that will never crash
    return new ImageResponse(
      (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: '#0b111e',
            color: '#e2e8f0',
            fontSize: 48,
            fontFamily: 'sans-serif',
          }}
        >
          TX · TRANSLATOR — Injective Transaction Decoder
        </div>
      ),
      size,
    );
  }
}
