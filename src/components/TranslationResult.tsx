'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { TranslationResponse, MultiSendRecipient, TradeData, UnbondingData, GovernanceData, RevokeData } from '@/types';

const COSMOSTATION_LOGO =
  'https://raw.githubusercontent.com/cosmostation/cosmostation_token_resource/master/moniker/injective';

const INJ_CDN = 'https://imagedelivery.net/lPzngbR8EltRfBOi_WYaXw';
const CHAIN_REGISTRY = 'https://raw.githubusercontent.com/cosmos/chain-registry/master';
const TRUST_WALLET_ETH = 'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ethereum/assets';

const TOKEN_LOGOS: Record<string, string> = {
  // Injective CDN (official)
  INJ:   `${INJ_CDN}/7123d071-0def-459a-16b9-d85e8ea04700/public`,
  USDT:  `${INJ_CDN}/e46e1742-fb16-4393-cc40-83b20e875400/public`,
  USDC:  `${INJ_CDN}/c09b0eff-fd4a-4756-e5c9-f6bf8ac0c900/public`,
  WETH:  `${INJ_CDN}/0d22b678-a78f-4e64-5a7d-d9bd0f261f00/public`,
  hINJ:  `${INJ_CDN}/95699092-79b3-42b0-3796-e4395f0e3a00/public`,
  BTC:   `${INJ_CDN}/f51ce0dd-54de-4b65-8b2b-09579b6c6600/public`,
  // Cosmos chain registry
  ATOM:  `${CHAIN_REGISTRY}/cosmoshub/images/atom.png`,
  TIA:   `${CHAIN_REGISTRY}/celestia/images/celestia.png`,
  stINJ: `${CHAIN_REGISTRY}/stride/images/stinj.png`,
  // Trust Wallet (Ethereum ERC-20 contracts)
  LINK:  `${TRUST_WALLET_ETH}/0x514910771AF9Ca656af840dff83E8264EcF986CA/logo.png`,
  ARB:   `${TRUST_WALLET_ETH}/0xB50721BCf8d664c30412Cfbc6cf7a15145234ad1/logo.png`,
  // Trust Wallet (native chains)
  SOL:   'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/solana/info/logo.png',
  TON:   'https://raw.githubusercontent.com/trustwallet/assets/master/blockchains/ton/info/logo.png',
};

interface Props {
  data: TranslationResponse;
}

function ImpactText({
  text,
  negativeColor = 'var(--tx-red)',
  className = 'tx-impact-text',
}: {
  text: string;
  negativeColor?: string;
  className?: string;
}) {
  const parts = text.split(/([-+][0-9,.]+\s*[A-Z]+)/g);
  return (
    <span className={className}>
      {parts.map((part, i) => {
        if (/^\+/.test(part))
          return <span key={i} style={{ color: 'var(--tx-green)', fontWeight: 600 }}>{part}</span>;
        if (/^-/.test(part))
          return <span key={i} style={{ color: negativeColor, fontWeight: 600 }}>{part}</span>;
        return <span key={i}>{part}</span>;
      })}
    </span>
  );
}

function ValidatorAvatar({
  address,
  name,
}: {
  address: string;
  name: string;
}) {
  const [error, setError] = useState(false);
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map(w => w[0] ?? '')
    .join('')
    .toUpperCase();

  if (!error) {
    return (
      <img
        className="tx-avatar-img"
        src={`${COSMOSTATION_LOGO}/${address}.png`}
        alt={name}
        onError={() => setError(true)}
      />
    );
  }
  return <span className="tx-avatar-initials">{initials}</span>;
}

function TokenIcon({ symbol, size = 18 }: { symbol: string; size?: number }) {
  const [error, setError] = useState(false);
  const url = TOKEN_LOGOS[symbol.toUpperCase()];
  const style = { width: size, height: size };
  if (url && !error) {
    return (
      <img
        className="tx-token-icon"
        style={style}
        src={url}
        alt={symbol}
        onError={() => setError(true)}
      />
    );
  }
  return (
    <span className="tx-token-icon tx-token-icon--fallback" style={style}>
      {symbol[0] ?? '?'}
    </span>
  );
}

const BRAND_LINKS: Array<{ pattern: RegExp; url: string; className: string }> = [
  { pattern: /Mito(?:\s+[\w']+)?/g,  url: 'https://mito.fi/vaults',           className: 'tx-mito-link' },
  { pattern: /Hydro Protocol/g,        url: 'https://hydroprotocol.finance',    className: 'tx-mito-link' },
];

function linkifyBrands(text: string): React.ReactNode {
  const combined = /(Mito(?:\s+[\w']+)?|Hydro Protocol)/g;
  const parts = text.split(combined);
  return parts.map((part, i) => {
    const brand = BRAND_LINKS.find(b => b.pattern.test(part));
    // reset lastIndex after .test()
    BRAND_LINKS.forEach(b => { b.pattern.lastIndex = 0; });
    if (brand) {
      return (
        <a key={i} href={brand.url} target="_blank" rel="noopener noreferrer" className={brand.className}>
          {part}
        </a>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

function VotingFormula({ tally, proposalId }: { tally?: GovernanceData['tally']; proposalId?: string | null }) {
  const yesNum = tally?.yes ? parseFloat(tally.yes) : null;
  const yesMet = yesNum !== null ? yesNum > 50 : null;
  const injhubUrl = proposalId ? `https://injhub.com/proposal/${proposalId}/` : null;

  return (
    <div className="tx-voting-formula">
      <div className="tx-formula-rule">
        <span className="tx-formula-lhs">Condition</span>
        <span className="tx-formula-eq"> = </span>
        <span className="tx-formula-group">Participation ≥ 33.4%</span>
        <span className="tx-formula-op"> ∧ </span>
        <span className="tx-formula-group">YES {'>'} 50%</span>
      </div>
      {yesNum !== null && (
        <div className="tx-formula-current">
          <span className="tx-formula-cl">Current YES</span>
          <span className={`tx-formula-cv ${yesMet ? 'tx-formula-pass' : 'tx-formula-fail'}`}>
            {yesNum.toFixed(2)}%{yesMet ? ' ✓' : ' ✗'}
          </span>
          <span className="tx-formula-cl">· Quorum tracked on-chain</span>
        </div>
      )}
      {injhubUrl && (
        <div className="tx-formula-track">
          <a href={injhubUrl} target="_blank" rel="noopener noreferrer" className="tx-formula-track-link">
            Track live on InjHub →
          </a>
        </div>
      )}
    </div>
  );
}

function DetailsBlock({ text, txCategory, governanceData }: { text: string; txCategory?: string; governanceData?: GovernanceData | null }) {
  if (!text || typeof text !== 'string') return null;
  // Split on real newlines OR literal \n (AI sometimes double-escapes in JSON)
  const lines = text.split(/\n|\\n/).map(l => l.trim()).filter(Boolean);
  const isBullets = lines.length >= 2 && lines.every(l => l.startsWith('•'));
  if (!isBullets) return <p className="tx-ai-details">{linkifyBrands(text)}</p>;

  return (
    <ul className="tx-ai-bullets">
      {lines.map((line, i) => {
        const content = line.replace(/^•\s*/, '');
        const colonIdx = content.indexOf(':');
        if (colonIdx > 0 && colonIdx < 25) {
          const cat = content.slice(0, colonIdx).trim();
          const rest = content.slice(colonIdx + 1).trimStart();
          return (
            <li key={i} className="tx-ai-bullet">
              <span className="tx-ai-bullet-cat">{cat}</span>
              <span>{linkifyBrands(rest)}</span>
              {txCategory === 'VOTE' && cat.toUpperCase() === 'STATUS' && <VotingFormula tally={governanceData?.tally} proposalId={governanceData?.proposalId} />}
            </li>
          );
        }
        return <li key={i} className="tx-ai-bullet"><span>{linkifyBrands(content)}</span></li>;
      })}
    </ul>
  );
}

function CopyIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ size = 11 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg width="8" height="8" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function XLogoIcon() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.73-8.835L1.254 2.25H8.08l4.253 5.622zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

const APP_URL = 'txtranslator.vercel.app';

function buildTweetText(data: TranslationResponse): string {
  const td = data.tradeData;
  const g  = data.governanceData;
  const ud = data.unbondingData;

  switch (data.txCategory) {

    case 'TRADE': {
      if (td) {
        const from = td.spentAmount && td.spentSymbol ? `${td.spentAmount} ${td.spentSymbol}` : '?';
        const to   = td.receivedAmount && td.receivedSymbol ? `${td.receivedAmount} ${td.receivedSymbol}` : 'pending';
        const slip = td.slippagePct != null ? parseFloat(td.slippagePct) : null;
        const slipLine = slip == null ? '' :
          slip < 0.1  ? `⚡ Slippage: ${td.slippagePct}% (Ultra-optimal)` :
          slip < 0.3  ? `⚡ Slippage: ${td.slippagePct}% (Clean execution)` :
                        `⚡ Slippage: ${td.slippagePct}%`;

        if (td.isDerivative) {
          return [
            `Trading tokenized ${td.ticker ?? 'perp'} on @Injective Helix! 🧠`,
            `📊 ${td.isBuy ? 'Long' : 'Short'} · Margin: ${td.marginAmount ?? '?'} ${td.marginSymbol ?? ''}`,
            slipLine,
            `Real equity perps on-chain. Zero gas, zero front-running.`,
            `Decode yours: 🔍 ${APP_URL}`,
            `@Injective #Injective #DeFi #Perps`,
          ].filter(Boolean).join('\n');
        }

        return [
          `Just decoded my latest Helix swap! 🧠`,
          `🔄 ${from} ➔ ${to}`,
          slipLine,
          `💸 Gas: < $0.01`,
          `Front-run proof execution. Decode yours: 🔍 ${APP_URL}`,
          `@Injective #Injective #DeFi`,
        ].filter(Boolean).join('\n');
      }
      break;
    }

    case 'VOTE': {
      const propId  = g?.proposalId ? `#${g.proposalId}` : '';
      const title   = g?.proposalTitle ? g.proposalTitle.slice(0, 55) + (g.proposalTitle.length > 55 ? '…' : '') : '';
      const vote    = g?.voteOption ?? 'YES';
      return [
        `I just voted on @Injective Proposal ${propId}! 🗳️`,
        `🔹 ${vote}: ${title}`,
        `Don't just stake — participate. Understand your votes:`,
        `🔍 ${APP_URL}`,
        `@Injective #Injective #Governance #nINJas`,
      ].filter(Boolean).join('\n');
    }

    case 'PROPOSE': {
      const title = g?.proposalTitle ? g.proposalTitle.slice(0, 60) + (g.proposalTitle.length > 60 ? '…' : '') : 'a new proposal';
      return [
        `Just submitted a governance proposal on @Injective! 🏛️`,
        `📋 ${title}`,
        `On-chain governance: your staked INJ = your voice.`,
        `Decode governance txs: 🔍 ${APP_URL}`,
        `@Injective #Injective #Governance #nINJas`,
      ].filter(Boolean).join('\n');
    }

    case 'STAKE': {
      const validator = data.validatorName ?? 'a validator';
      const aprLine   = data.effectiveAPR != null ? `📈 Earning: ~${data.effectiveAPR.toFixed(1)}% APR` : '';
      return [
        `Staked my INJ on @Injective! 🥩`,
        `🏛️ Validator: ${validator}`,
        aprLine,
        `Every INJ staked = a vote for decentralization.`,
        `Decode your staking txs: 🔍 ${APP_URL}`,
        `@Injective #Injective #Staking #nINJas`,
      ].filter(Boolean).join('\n');
    }

    case 'UNSTAKE': {
      const amtLine = ud ? `💰 ${ud.amount} ${ud.humanDenom} unlocking in 21 days` : '';
      return [
        `Unbonding INJ on @Injective 🔓`,
        amtLine,
        `Tip: Hydro Protocol's hINJ stays liquid while earning rewards.`,
        `Decode yours: 🔍 ${APP_URL}`,
        `@Injective #Injective #Staking`,
      ].filter(Boolean).join('\n');
    }

    case 'REDELEGATE':
      return [
        `Redelegated my INJ stake on @Injective ⚡`,
        `Instant validator switch — no 21-day lockup. That's Cosmos.`,
        `Decode your txs: 🔍 ${APP_URL}`,
        `@Injective #Injective #Staking #nINJas`,
      ].join('\n');

    case 'BRIDGE':
      return [
        `Just bridged assets via IBC on @Injective 🌉`,
        `Trustless cross-chain in seconds. No wrapped tokens, no bridges to trust.`,
        `Decode your bridge txs: 🔍 ${APP_URL}`,
        `@Injective #Injective #IBC #DeFi`,
      ].join('\n');

    default: {
      // Security & Transparency angle — batch orders, contracts, sends, authz, etc.
      const snippet = data.action.length > 80 ? data.action.slice(0, 79) + '…' : data.action;
      return [
        `Keeping my @Injective positions secure and optimized ⚡`,
        snippet,
        `Stop guessing what your txs are doing. Translate them instantly:`,
        `🔍 ${APP_URL}`,
        `@Injective #Injective`,
      ].join('\n');
    }
  }

  const snippet = data.action.length > 140 ? data.action.slice(0, 139) + '…' : data.action;
  return `${snippet}\n\n🔍 ${APP_URL}\n@Injective #Injective`;
}

function buildTweetUrl(data: TranslationResponse): string {
  return `https://x.com/intent/tweet?text=${encodeURIComponent(buildTweetText(data))}`;
}

function ArrowRightIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="5" y1="12" x2="19" y2="12" />
      <polyline points="12 5 19 12 12 19" />
    </svg>
  );
}

function HourglassIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M5 22h14" />
      <path d="M5 2h14" />
      <path d="M17 22v-4.172a2 2 0 0 0-.586-1.414L12 12l-4.414 4.414A2 2 0 0 0 7 17.828V22" />
      <path d="M7 2v4.172a2 2 0 0 0 .586 1.414L12 12l4.414-4.414A2 2 0 0 0 17 6.172V2" />
    </svg>
  );
}

function UnbondingDisplay({
  validatorAddress,
  validatorName,
  unbondingData,
}: {
  validatorAddress: string | null;
  validatorName: string | null;
  unbondingData: UnbondingData;
}) {
  const availableDate = new Date(unbondingData.availableDate);
  const now = new Date();
  const msLeft = availableDate.getTime() - now.getTime();
  const daysLeft = msLeft > 0 ? Math.ceil(msLeft / (1000 * 60 * 60 * 24)) : 0;
  const isReady = msLeft <= 0;

  const formattedDate = availableDate.toLocaleDateString('en-US', {
    month: 'long', day: 'numeric', year: 'numeric',
  });

  const displayName = validatorName ?? 'Validator';

  return (
    <div className="tx-unbonding">
      {/* Same layout as staking hero row: entity left, hourglass center, amount right */}
      <div className="tx-unbonding-flow">
        <div className="tx-entity">
          {validatorAddress && (
            <div className="tx-avatar">
              <ValidatorAvatar address={validatorAddress} name={displayName} />
            </div>
          )}
          <span className="tx-entity-name" style={{ cursor: 'default', pointerEvents: 'none' }}>
            {displayName}
          </span>
        </div>

        <div className="tx-unbonding-hourglass-col">
          <HourglassIcon />
        </div>

        <div className="tx-amount-hero">
          <span className="tx-amount-hero-text" style={{ color: 'var(--tx-amber)' }}>
            {unbondingData.amount} {unbondingData.humanDenom}
          </span>
        </div>
      </div>

      {/* Release date banner */}
      <div className="tx-unbonding-date-row">
        <span className="tx-unbonding-date-label">AVAILABLE</span>
        <span className="tx-unbonding-date-value">
          {formattedDate}
          {isReady
            ? <span className="tx-unbonding-days tx-unbonding-days--ready"> · Ready to claim</span>
            : <span className="tx-unbonding-days"> · {daysLeft}d remaining</span>
          }
        </span>
      </div>
    </div>
  );
}

function SwapDisplay({ td }: { td: TradeData }) {
  return (
    <div className="tx-swap">
      <div className="tx-swap-flow">
        {/* FROM */}
        <div className="tx-swap-side">
          <div className="tx-swap-side-header">
            <TokenIcon symbol={td.spentSymbol ?? ''} size={22} />
            <span className="tx-swap-sym">{td.spentSymbol ?? '?'}</span>
          </div>
          <span className="tx-swap-qty tx-swap-qty--out">
            {td.spentAmount ?? '—'}
          </span>
        </div>

        {/* Arrow */}
        <div className="tx-swap-arrow-col">
          <ArrowRightIcon />
        </div>

        {/* TO */}
        <div className="tx-swap-side tx-swap-side--right">
          <div className="tx-swap-side-header tx-swap-side-header--right">
            <span className="tx-swap-sym">{td.receivedSymbol ?? '?'}</span>
            <TokenIcon symbol={td.receivedSymbol ?? ''} size={22} />
          </div>
          <span className="tx-swap-qty tx-swap-qty--in">
            {td.receivedAmount ?? '—'}
          </span>
        </div>
      </div>

      {/* Meta: price + fee */}
      <div className="tx-swap-meta">
        {td.executionPrice && (
          <span className="tx-swap-price">
            @ {td.executionPrice} {td.quoteSymbol}/{td.baseSymbol}
          </span>
        )}
        {td.feeAmount != null && (
          <span className="tx-swap-fee">
            FEE: {td.feeAmount === '0' ? 'FREE' : `${td.feeAmount} ${td.feeSymbol}`}
          </span>
        )}
      </div>
    </div>
  );
}

function ChevronIcon({ expanded }: { expanded: boolean }) {
  return (
    <svg
      width="10" height="10" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5"
      style={{ transform: expanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.2s' }}
    >
      <polyline points="6 9 12 15 18 9" />
    </svg>
  );
}

function RecipientRow({ recipient }: { recipient: MultiSendRecipient }) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(null);

  function copy() {
    navigator.clipboard.writeText(recipient.address).then(() => {
      setCopied(true);
      timer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  return (
    <li className="tx-recipient-row">
      <button
        className={`tx-recipient-name${copied ? ' copied' : ''}`}
        onClick={copy}
        title={recipient.address}
      >
        {recipient.name ?? `${recipient.address.slice(0, 8)}…${recipient.address.slice(-6)}`}
        <span className="tx-entity-copy-hint">
          {copied ? <CheckIcon /> : <CopyIcon />}
        </span>
      </button>
      <span className="tx-recipient-amount">
        {recipient.amounts.map(a => `-${a.amount} ${a.humanDenom}`).join(', ')}
      </span>
    </li>
  );
}

function MultiSendBreakdown({ recipients }: { recipients: MultiSendRecipient[] }) {
  const [expanded, setExpanded] = useState(recipients.length <= 5);

  return (
    <div className="tx-recipients">
      <button className="tx-recipients-toggle" onClick={() => setExpanded(e => !e)}>
        <span>{recipients.length} RECIPIENT{recipients.length !== 1 ? 'S' : ''}</span>
        <ChevronIcon expanded={expanded} />
      </button>
      {expanded && (
        <ul className="tx-recipients-list">
          {recipients.map((r, i) => (
            <RecipientRow key={i} recipient={r} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function TranslationResult({ data }: Props) {
  const [copied, setCopied] = useState(false);
  const [copiedAddr, setCopiedAddr] = useState(false);
  const [showScan, setShowScan] = useState(true);
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const addrTimer = useRef<ReturnType<typeof setTimeout>>(null);
  const scanTimer = useRef<ReturnType<typeof setTimeout>>(null);

  useEffect(() => {
    setShowScan(true);
    scanTimer.current = setTimeout(() => setShowScan(false), 1300);
    return () => {
      if (scanTimer.current) clearTimeout(scanTimer.current);
      if (copyTimer.current) clearTimeout(copyTimer.current);
      if (addrTimer.current) clearTimeout(addrTimer.current);
    };
  }, [data.hash]);

  function copyHash() {
    navigator.clipboard.writeText(data.hash).then(() => {
      setCopied(true);
      copyTimer.current = setTimeout(() => setCopied(false), 2000);
    });
  }

  function copyAddr() {
    if (!data.validatorAddress) return;
    navigator.clipboard.writeText(data.validatorAddress).then(() => {
      setCopiedAddr(true);
      addrTimer.current = setTimeout(() => setCopiedAddr(false), 2000);
    });
  }

  const shortHash = `${data.hash.slice(0, 8)}…${data.hash.slice(-6)}`;
  const isSuccess = data.status === 'success';
  const isStake = data.txCategory === 'STAKE';
  const isUnstake = data.txCategory === 'UNSTAKE';
  const isRedelegate = data.txCategory === 'REDELEGATE';
  const hasValidator = !!data.validatorAddress;

  const negativeColor =
    isStake || isRedelegate ? 'var(--tx-cyan)' :
    isUnstake               ? 'var(--tx-purple)' :
                              'var(--tx-red)';

  const isMultiSend = data.txCategory === 'MULTISEND';
  const isTrade = data.txCategory === 'TRADE';
  const isGov = data.txCategory === 'VOTE' || data.txCategory === 'PROPOSE' || data.txCategory === 'GOV_DEPOSIT';
  const isRevoke = data.txCategory === 'REVOKE';
  const isGrant = data.txCategory === 'GRANT';
  const multiSendLabel = isMultiSend && data.multiSendRecipients?.length
    ? `${data.multiSendRecipients.length} Recipients`
    : null;
  const revokeLabel = (isRevoke || isGrant) && data.revokeData
    ? (data.revokeData.granteeName ?? `${data.revokeData.grantee.slice(0, 8)}…${data.revokeData.grantee.slice(-6)}`)
    : null;
  const displayName = data.validatorName ?? revokeLabel ?? multiSendLabel ?? data.protocol ?? '—';

  const tradeSlipNum = isTrade && data.tradeData?.slippagePct != null
    ? parseFloat(data.tradeData.slippagePct)
    : null;
  const tradeBadgeLabel =
    tradeSlipNum === null ? null :
    tradeSlipNum < 0.05   ? 'ELITE FILL' :
    tradeSlipNum < 0.3    ? 'CLEAN FILL' :
    tradeSlipNum < 1.0    ? 'MOD. SLIPPAGE' :
                            'HIGH SLIPPAGE';
  const tradeBadgeClass =
    tradeSlipNum === null ? '' :
    tradeSlipNum < 0.3    ? 'tx-badge-green' :
    tradeSlipNum < 1.0    ? 'tx-badge-amber' :
                            'tx-badge-red';

  return (
    <div className="tx-card">
      {showScan && <div className="tx-scan" aria-hidden />}

      {/* ── Header: protocol badge + execution quality + status ── */}
      <div className="tx-card-header">
        <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
          {data.protocol && (
            <span className="tx-badge tx-badge-cyan">{data.protocol}</span>
          )}
          {isUnstake && (
            <span className="tx-badge tx-badge-amber">UNBONDING</span>
          )}
          {isRevoke && (
            <span className="tx-badge tx-badge-red">REVOKED</span>
          )}
          {isGrant && (
            <span className="tx-badge tx-badge-cyan">GRANTED</span>
          )}
          {tradeBadgeLabel && (
            <span className={`tx-badge ${tradeBadgeClass}`}>{tradeBadgeLabel}</span>
          )}
        </div>
        <span className={`tx-badge ${isSuccess ? 'tx-badge-green' : 'tx-badge-red'}`}>
          {isSuccess ? <CheckIcon size={8} /> : <XIcon />}
          {isSuccess ? 'SUCCESS' : 'FAILED'}
        </span>
      </div>

      {/* ── Trade swap visual (replaces hero row for TRADE txs) ── */}
      {isTrade && data.tradeData && (
        <SwapDisplay td={data.tradeData} />
      )}

      {/* ── Unbonding visual (replaces hero row for UNSTAKE txs) ── */}
      {isUnstake && data.unbondingData && (
        <UnbondingDisplay
          validatorAddress={data.validatorAddress}
          validatorName={data.validatorName}
          unbondingData={data.unbondingData}
        />
      )}

      {/* ── Hero row: entity + amount (non-trade, non-unstake txs) ── */}
      <div className={`tx-hero-row${isTrade || isUnstake ? ' tx-hero-row--hidden' : ''}${isGov ? ' tx-hero-row--gov' : ''}`}>
        <div className="tx-entity">
          {hasValidator && (
            <div className="tx-avatar">
              <ValidatorAvatar
                address={data.validatorAddress!}
                name={displayName}
              />
            </div>
          )}
          <button
            className={`tx-entity-name${copiedAddr ? ' copied' : ''}`}
            onClick={copyAddr}
            title={data.validatorAddress ?? undefined}
            disabled={!hasValidator}
          >
            {displayName}
            {hasValidator && (
              <span className="tx-entity-copy-hint">
                {copiedAddr ? <CheckIcon /> : <CopyIcon />}
              </span>
            )}
          </button>
        </div>

        <div className="tx-amount-hero">
          <ImpactText
            text={data.impact}
            negativeColor={negativeColor}
            className="tx-amount-hero-text"
          />
        </div>
      </div>

      {/* ── Multi-Send recipients breakdown ── */}
      {isMultiSend && data.multiSendRecipients && data.multiSendRecipients.length > 0 && (
        <MultiSendBreakdown recipients={data.multiSendRecipients} />
      )}

      {/* ── Revoke/Grant permission label ── */}
      {(isRevoke || isGrant) && data.revokeData && (
        <div className="tx-vp-row">
          <span className="tx-vp-label">Permission</span>
          <span className="tx-vp-value">{data.revokeData.msgTypeLabel}</span>
        </div>
      )}

      {/* ── Voting power indicator ── */}
      {data.validatorVotingPower != null && (
        <div className="tx-vp-row">
          <span className="tx-vp-label">Voting power</span>
          <span className={`tx-vp-value${data.validatorVotingPower >= 5 ? ' tx-vp-high' : ''}`}>
            {data.validatorVotingPower.toFixed(2)}%
            {data.validatorVotingPower >= 5 && (
              <span className="tx-vp-warn"> · High concentration</span>
            )}
          </span>
        </div>
      )}

      {/* ── Staking APR (effective, after commission) ── */}
      {data.effectiveAPR != null && (
        <div className="tx-vp-row">
          <span className="tx-vp-label">Staking APR</span>
          <span className="tx-vp-value">~{data.effectiveAPR.toFixed(1)}%</span>
        </div>
      )}

      {/* ── Divider ── */}
      <div className="tx-divider" />

      {/* ── AI insight block ── */}
      <div className="tx-ai-block">
        <div className="tx-ai-eyebrow">
          <span className="tx-ai-glyph">◈</span>
          AI INSIGHT
        </div>
        <p className="tx-ai-action">{data.action}</p>
        {data.details && <DetailsBlock text={data.details} txCategory={data.txCategory} governanceData={data.governanceData} />}
      </div>

      {/* ── Footer: hash + share + copy ── */}
      <div className="tx-card-footer">
        <span className="tx-hash" title={data.hash}>{shortHash}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <a
            className="tx-share-btn"
            href={buildTweetUrl(data)}
            target="_blank"
            rel="noopener noreferrer"
            title="Share on X"
            aria-label="Share on X"
          >
            <XLogoIcon />
            Share
          </a>
          <button
            className={`tx-copy-btn${copied ? ' copied' : ''}`}
            onClick={copyHash}
            title="Copy full hash"
            aria-label="Copy transaction hash"
          >
            {copied ? <CheckIcon size={14} /> : <CopyIcon />}
          </button>
        </div>
      </div>
    </div>
  );
}
