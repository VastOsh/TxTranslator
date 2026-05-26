import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { fetchTransaction } from '@/lib/injective';
import { normalizeTransaction, formatAmount, getDisplayDenom } from '@/lib/normalizer';
import { fetchTokenPrices } from '@/lib/prices';
import { PROTOCOL_CONTEXTS } from '@/constants/contracts';
import { HELIX_ROUTER_CONTRACTS } from '@/constants/markets';
import { resolveAddress, VALIDATOR_VOTING_POWER, VALIDATOR_COMMISSION } from '@/constants/registry';
import type { NormalizedTransaction, MultiSendRecipient, TradeData, UnbondingData, GovernanceData, RevokeData } from '@/types';

// Helix spot taker fee tiers (INJ staked → taker rate %)
const HELIX_VIP_TIERS = [
  { name: 'Default', minStake: 0,     ratePct: 0.200 },
  { name: 'VIP1',    minStake: 500,   ratePct: 0.150 },
  { name: 'VIP2',    minStake: 1000,  ratePct: 0.100 },
  { name: 'VIP3',    minStake: 5000,  ratePct: 0.080 },
  { name: 'VIP4',    minStake: 10000, ratePct: 0.060 },
  { name: 'VIP5',    minStake: 25000, ratePct: 0.045 },
];

function buildTradeFeeContext(td: TradeData): string {
  const feeNum = parseFloat(td.feeAmount ?? '');
  if (!isFinite(feeNum) || feeNum < 0) return '';

  // Notional in quote currency
  const notional = td.isBuy
    ? parseFloat(td.spentAmount ?? '0')
    : parseFloat(td.receivedAmount ?? '0');
  if (notional <= 0) return '';

  const effectiveRatePct = (feeNum / notional) * 100;

  // Match to current VIP tier (highest tier whose rate is ≥ effective rate, with tolerance)
  const currentTier = [...HELIX_VIP_TIERS]
    .reverse()
    .find(t => t.ratePct <= effectiveRatePct + 0.005) ?? HELIX_VIP_TIERS[0];
  const currentIdx = HELIX_VIP_TIERS.indexOf(currentTier);
  const nextTier = HELIX_VIP_TIERS[currentIdx + 1];

  let out = `\n  Effective taker rate: ${effectiveRatePct.toFixed(3)}% (${currentTier.name})`;
  if (nextTier) {
    const savingAmt = ((effectiveRatePct - nextTier.ratePct) / 100 * notional);
    out += `\n  Next VIP tier: ${nextTier.name} (stake ${nextTier.minStake} INJ) → rate drops to ${nextTier.ratePct.toFixed(3)}%, saving ${savingAmt.toFixed(4).replace(/\.?0+$/, '')} ${td.feeSymbol} on this trade size`;
  }
  return out;
}

const groq = new OpenAI({
  apiKey: process.env.GROQ_API_KEY ?? '',
  baseURL: 'https://api.groq.com/openai/v1',
});

const SYSTEM_PROMPT = `You are an expert Injective blockchain analyst. Teach the user something they don't already know — never restate what they can already see.

Return ONLY a JSON object with exactly these three fields:
{
  "action": "One sentence starting with 'You'. State the verb, exact amount, and named actor. For governance: 'You voted [OPTION] on Proposal #[ID]: [TITLE].' — NEVER include a wallet address in action. CRITICAL for STAKE/UNSTAKE: NEVER read the token amount from raw message content (it contains raw atomic units, e.g. 16000000000000000 = 0.016 INJ) — always use the exact amount shown on the 'Token movements' line. Example for staking: 'You delegated 0.016 INJ to Zellic.'",
  "impact": "Wallet balance change only. Use +X TOKEN for gains, -X TOKEN for losses, include USD value when available. Example: '-100 INJ (~$434.00 USD)'. For MULTISEND: use the total aggregated outflow as a single value — never list individual per-recipient amounts here. For UNDELEGATE: write '+X TOKEN (~$Y USD) — unlocks [DATE]' where DATE comes verbatim from the backend-provided 'unbonding_release_date' field. If no balance changed, explain why in one clause.",
  "details": "2–3 sentences of expert insight the user cannot derive from the action/impact alone. Follow these rules per type: DELEGATE — Output EXACTLY this structure with no deviations: three lines each starting with a bullet "• " followed immediately by the label, a colon, a space, and the content. The three labels are VALIDATOR, YIELD, REMINDER — never write the word CATEGORY. Format verbatim: "• VALIDATOR: [content]\\n• YIELD: [content]\\n• REMINDER: [content]". VALIDATOR: state the validator's name and classify its network standing using the live voting power % provided by the backend (>5% = significant weight, concentration risk; 1–5% = established mid-tier; <1% = smaller/niche validator); mention total staked INJ if provided. YIELD: The effective delegator APR is already displayed in the UI — do NOT restate a percentage. Instead: if the validator's commission ≥ 10%, flag it as notably high and suggest checking lower-commission validators; if < 5%, note it as competitive. Always close with a reminder that re-staking claimed rewards compounds returns over time. REMINDER: undelegating starts a mandatory 21-day unbonding lock with zero staking rewards — consider Hydro Protocol's hINJ for liquid staking that avoids this lockup entirely. UNDELEGATE — Output EXACTLY this structure with no deviations: three lines each starting with a bullet "• " followed immediately by the label, a colon, a space, and the content. The three labels are TIMELINE, WARNING, STRATEGY — never write the word CATEGORY. Format verbatim: "• TIMELINE: [content]\\n• WARNING: [content]\\n• STRATEGY: [content]". TIMELINE content: state the exact release date from 'unbonding_release_date' and that 21 days is Injective's non-negotiable unbonding rule. WARNING content: zero staking rewards during the window; if INJ price known, compute missed_USD = amount × price × 0.15 ÷ 365 × 21 and state it (e.g. "At $12/INJ, ~$8.64 in foregone yield"). STRATEGY content: Hydro Protocol's hINJ avoids this lockup — it stays liquid while earning staking rewards; name one specific action for release (redelegate, Mito vault, or Helix). Example output: "• TIMELINE: Funds release on June 2, 2026 — Injective enforces a strict 21-day unbonding rule with no exceptions.\\n• WARNING: Zero staking rewards for 21 days. At $12/INJ, ~$8.64 in foregone yield on 100 INJ.\\n• STRATEGY: Hydro Protocol's hINJ avoids this lockup entirely — liquid and earning rewards simultaneously. On release, consider staking again or depositing into a Mito vault." REDELEGATE — note the redelegation is instant with no 21-day gap, but the destination validator's commission and VP apply going forward. CLAIM REWARDS — mention that re-delegating the claimed amount compounds yield and state approximately how much more that adds annually at the same APR. SEND — one sentence naming the recipient (use resolved name if known, otherwise truncate address to first 8 + last 6 chars); one sentence on speed and cost (INJ transfers settle in ~1 second for a fraction of a cent); if the recipient is a known exchange or smart contract, flag that funds are moving to a custodial or protocol address. MULTISEND — state the number of recipients and total value distributed in one sentence; note whether the pattern looks like a batch payment (few large outputs) or a distribution/airdrop (many small outputs); mention that all transfers in a MsgMultiSend are atomic — they all succeed or all revert together. TRADE (Helix) — Output exactly 3 bullet lines separated by literal \\n, each starting with "• " then the label, then ": ". The three labels are FEES, EXECUTION, OPPORTUNITY — never write the word CATEGORY. All numeric values (fee, price, slippage, savings) are pre-calculated by the backend — copy them verbatim, do NOT recompute or round differently. FEES: state the exact fee amount and symbol; mention the effective rate %; if next-VIP-tier savings data is provided, quote the exact saving amount — e.g. "staking 500 more INJ saves 0.0007 USDT on this trade". For limit (maker) orders: note fee is 0% (maker rebate). EXECUTION: state the exact backend-calculated execution price and slippage (never recompute these); for limit orders say "filled at your exact limit price — 0% slippage, a key advantage of limit orders"; for market orders classify slippage (< 0.05% = near-perfect, 0.05–0.3% = clean, 0.3–1% = moderate, > 1% = significant). OPPORTUNITY: state one specific, actionable next step for the tokens just received — no speculation about why the trade was made. If received token is a stablecoin (USDT/USDC/USDe): mention Mito Finance yield vaults on Injective. If received is INJ: mention staking earns ~15% APY and increases governance weight. If received is another asset: name one concrete use case in the Injective ecosystem. Example for CosmWasm market sell: "• FEES: 0.0023 USDT (0.100% taker rate). Staking 500 more INJ (VIP2) saves 0.0005 USDT on this trade.\\n• EXECUTION: 4.5054 USDT/INJ — 0.10% slippage, clean execution for a market swap.\\n• OPPORTUNITY: Your 2.25 USDT can earn yield in Mito Finance's automated USDT vault." For DERIVATIVE/PERP trades (order type contains "PERP"): FEES: limit (maker) PERP orders pay 0% fee when they fill — state "0% maker fee: your limit order earns the spread instead of paying it." Market (taker) PERP orders pay a taker fee; state the rate if known. EXECUTION: state the limit price in quote/base format; if fill status is RESTING say "Order resting at [price] — not yet filled. [marginAmount] [marginSymbol] is locked as margin. Leverage: [leverage]. Notional value: [quantity × price] [quote]."; if filled, state the execution price and slippage. OPPORTUNITY: for a BUY PERP on a stock/IPO (SpaceX, AAPL, TSLA etc.): note that tokenized perpetuals on Injective track real-world equity prices via oracle feeds; state that leverage amplifies both gains and losses — a 1% underlying price move results in approximately [leverage] × 1% PnL on the margin; suggest setting a stop-loss or monitoring the oracle price feed to manage liquidation risk. VOTE — Output exactly 3 bullet lines separated by literal \\n, each starting with "• " then the label then ": ". Labels: WHAT'S AT STAKE, POSITION RISK, STATUS. WHAT'S AT STAKE: 1-2 sentences — explain what the proposal changes AND the strategic reason behind it; never just restate the title. Go one layer deeper: if migrating collateral (e.g., USDT → USDC), explain it unifies liquidity on Helix and reduces slippage; if a software upgrade, name the specific improvement; if a parameter change, explain the economic effect. Translate all technical terms into plain language. POSITION RISK: scan the proposal title and summary for any of these trigger keywords: "settle", "settlement", "migrat", "migration", "close", "deprecat", "delist", "suspend", "halt", "liquidat". If ANY match: issue a direct warning naming the specific market and deadline — format: "⚠ If you hold open positions on [MARKET], they will be force-closed at the settlement price on [DATE]. Close them manually before the deadline to control your exit." Do NOT fabricate a market name or date — use only what is stated in the proposal summary. If no trigger keyword matches: state the governance weight of the vote — note whether NO WITH VETO (if that was the option cast) would burn depositor funds if it exceeds 33.4%; do NOT invent penalty narratives for YES or NO votes. STATUS: always state Injective's passing conditions — quorum requires >33.4% of total staked INJ to participate, then YES must exceed 50% of non-abstain votes cast. If tally data is provided, report it and note whether quorum and YES majority appear on track. If no tally data is provided, do NOT say "not yet available" — instead state "Voting is live — a real-time tracking link is shown below." PROPOSE — Output exactly 3 bullet lines (• PROPOSAL, • PROCESS, • RISK). PROPOSAL: explain what the proposal would change or enable on Injective — base this on the title and summary, translating technical content into plain language; state the proposal ID if known. PROCESS: the proposal has entered the deposit period — once the minimum INJ deposit threshold is reached (typically 500 INJ on Injective), a 5-day voting period opens automatically; validators and delegators vote with their staked INJ weight. RISK: if more than 33.4% of votes are NO WITH VETO, the entire deposit pool (including the proposer's initial deposit) is burned — this is Injective's anti-spam mechanism to deter frivolous or malicious governance proposals. GOV_DEPOSIT — Output exactly 3 bullet lines (• PROPOSAL, • MECHANICS, • RISK). PROPOSAL: explain what the proposal is about in plain English using the title and summary provided. MECHANICS: the deposited INJ is held in escrow by the governance module and returned to depositors if the proposal passes or is normally rejected; once cumulative deposits meet the minimum threshold, the proposal moves to the active voting period. RISK: if the proposal is vetoed by >33.4% NO WITH VETO votes, your deposit is burned along with all other depositors' funds — research the proposal's community reception before depositing. REVOKE — Output exactly 3 bullet lines separated by literal \\n, each starting with "• " then the label then ": ". Labels: AUTHORIZATION, SECURITY, IMPACT. AUTHORIZATION: state what permission was revoked (use the human-readable label provided, e.g. "delegation rights") and identify the grantee by name if known, otherwise truncate the address to first 8 + last 6 chars. SECURITY: authz grants persist indefinitely on-chain until explicitly revoked — this revocation is good key hygiene; if the grantee is an unknown address, suggest the user verify what originally prompted the grant (e.g. a bot, a DApp, or a portfolio manager). IMPACT: no token movement occurs — balances, staked positions, and pending rewards are entirely unaffected; the permission change takes effect immediately and is irreversible (a new MsgGrant would be required to restore it). GRANT — Output exactly 3 bullet lines separated by literal \\n, each starting with "• " then the label then ": ". Labels: PERMISSION, RISK, MANAGEMENT. PERMISSION: state what capability was granted and to whom (use the human-readable label from the backend). RISK: the grantee can now execute this action on your behalf without further confirmation — only grant to addresses you fully trust, such as your own automation bots or audited smart contracts. MANAGEMENT: this grant is active indefinitely until revoked with MsgRevoke; review your active grants periodically on any Injective explorer to avoid forgotten access. TRANSFER — fee paid and destination chain if IBC. FAILURE — root cause in plain English."
}

Rules:
- Never mention gas units or gas counts
- No filler phrases ("The transaction…", "This operation…", "Please note…")
- Return ONLY the JSON — no markdown fences, no preamble`;

const STAKING_MSG_TYPES = new Set([
  '/cosmos.staking.v1beta1.MsgDelegate',
  '/cosmos.staking.v1beta1.MsgUndelegate',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate',
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward',
]);

const MSG_TO_CATEGORY: Record<string, string> = {
  '/cosmos.staking.v1beta1.MsgDelegate': 'STAKE',
  '/cosmos.staking.v1beta1.MsgUndelegate': 'UNSTAKE',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'REDELEGATE',
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': 'CLAIM',
  '/cosmos.bank.v1beta1.MsgSend': 'SEND',
  '/cosmos.bank.v1beta1.MsgMultiSend': 'MULTISEND',
  '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgBatchUpdateOrders': 'TRADE',
  '/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder': 'TRADE',
  '/injective.exchange.v1beta1.MsgDeposit': 'DEPOSIT',
  '/injective.exchange.v1beta1.MsgWithdraw': 'WITHDRAW',
  '/injective.exchange.v1beta1.MsgPrivilegedExecuteContract': 'CONTRACT',
  // v2 exchange messages
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
  '/cosmos.gov.v1beta1.MsgDeposit': 'GOV_DEPOSIT',
  '/cosmos.gov.v1.MsgDeposit': 'GOV_DEPOSIT',
  '/cosmos.authz.v1beta1.MsgRevoke': 'REVOKE',
  '/cosmos.authz.v1beta1.MsgGrant': 'GRANT',
};

function detectTxCategory(messages: Array<{ '@type': string; [key: string]: any }>): string {
  let first = messages[0];
  if (!first) return 'OTHER';
  // Unwrap MsgExec (authz) to inspect the inner message type
  if (first['@type'] === '/cosmos.authz.v1beta1.MsgExec' && first.msgs?.[0]) {
    first = first.msgs[0];
  }
  const type = first['@type'] ?? '';
  // CosmWasm compat messages going to a known Helix router → TRADE
  if (
    (type === '/injective.wasmx.v1.MsgExecuteContractCompat' ||
     type === '/cosmwasm.wasm.v1.MsgExecuteContract') &&
    HELIX_ROUTER_CONTRACTS.has(first.contract ?? '')
  ) return 'TRADE';
  return MSG_TO_CATEGORY[type] ?? 'OTHER';
}



function extractValidatorData(rawMessages: any[]): {
  address: string | null;
  name: string | null;
  votingPower: number | null;
  commission: number | null;
} {
  for (const msg of rawMessages) {
    const type: string = msg['@type'] ?? '';
    if (!STAKING_MSG_TYPES.has(type)) continue;
    const addr: string | undefined =
      msg.validator_address ?? msg.validator_src_address ?? undefined;
    if (!addr) continue;
    const resolved = resolveAddress(addr);
    return {
      address: addr,
      name: resolved !== addr ? resolved : null,
      votingPower: VALIDATOR_VOTING_POWER[addr] ?? null,
      commission: VALIDATOR_COMMISSION[addr] ?? null,
    };
  }
  return { address: null, name: null, votingPower: null, commission: null };
}

function httpsGetJson(url: string) {
  return fetch(url, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(8_000),
  })
    .then(res => res.json())
    .catch(() => null);
}


function computeUnbondingData(
  rawMessages: any[],
  timestamp: string,
  txEvents?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>,
): UnbondingData | null {
  const msg = rawMessages.find(
    (m: any) => m['@type'] === '/cosmos.staking.v1beta1.MsgUndelegate'
  );
  if (!msg?.amount) return null;

  // Prefer completion_time from the chain's unbond event (authoritative)
  let availableDate: Date | null = null;
  if (txEvents) {
    const unbondEv = txEvents.find(e => e.type === 'unbond');
    const completionAttr = unbondEv?.attributes?.find(a => a.key === 'completion_time');
    if (completionAttr?.value) {
      const parsed = new Date(completionAttr.value);
      if (!isNaN(parsed.getTime())) availableDate = parsed;
    }
  }

  // Fallback: tx timestamp + 21 days
  if (!availableDate) {
    const txDate = new Date(timestamp);
    if (isNaN(txDate.getTime())) return null;
    availableDate = new Date(txDate.getTime() + 21 * 24 * 60 * 60 * 1000);
  }

  return {
    amount: formatAmount(msg.amount.amount as string, msg.amount.denom as string),
    humanDenom: getDisplayDenom(msg.amount.denom as string),
    availableDate: availableDate.toISOString(),
  };
}

const GOV_MSG_TYPES = new Set([
  '/cosmos.gov.v1beta1.MsgVote',
  '/cosmos.gov.v1.MsgVote',
  '/cosmos.gov.v1beta1.MsgSubmitProposal',
  '/cosmos.gov.v1.MsgSubmitProposal',
  '/cosmos.gov.v1beta1.MsgDeposit',
  '/cosmos.gov.v1.MsgDeposit',
]);

const VOTE_OPTION_MAP: Record<string, string> = {
  VOTE_OPTION_YES: 'YES',
  VOTE_OPTION_NO: 'NO',
  VOTE_OPTION_ABSTAIN: 'ABSTAIN',
  VOTE_OPTION_NO_WITH_VETO: 'NO WITH VETO',
  '1': 'YES',
  '2': 'ABSTAIN',
  '3': 'NO',
  '4': 'NO WITH VETO',
};

const PROPOSAL_STATUS_MAP: Record<string, string> = {
  PROPOSAL_STATUS_DEPOSIT_PERIOD: 'Deposit Period',
  PROPOSAL_STATUS_VOTING_PERIOD: 'Voting Period',
  PROPOSAL_STATUS_PASSED: 'Passed',
  PROPOSAL_STATUS_REJECTED: 'Rejected',
  PROPOSAL_STATUS_FAILED: 'Failed',
};

function formatProposalStatus(raw: string): string {
  return PROPOSAL_STATUS_MAP[raw] ?? raw;
}

function computeTallyPct(n: bigint, total: bigint): string {
  if (total === BigInt(0)) return '0.00%';
  const pct = (n * BigInt(10000)) / total;
  const whole = pct / BigInt(100);
  const frac = pct % BigInt(100);
  return `${whole}.${frac.toString().padStart(2, '0')}%`;
}

const GOV_LCD_ENDPOINTS = [
  'https://injective-api.polkachu.com',
  'https://injective-rest.publicnode.com',
  'https://lcd.injective.network',
];

async function fetchProposalDetails(proposalId: string): Promise<{
  title: string | null;
  summary: string | null;
  status: string | null;
  votingEndTime: string | null;
  tally: { yes: string; no: string; abstain: string; noWithVeto: string } | null;
} | null> {
  const parseV1 = (data: Awaited<ReturnType<typeof httpsGetJson>>) => {
    if (!data?.proposal) throw new Error('no data');
    const p = data.proposal;
    const tally = p.final_tally_result;
    let tallyFormatted = null;
    if (tally) {
      const yes = BigInt(tally.yes_count ?? '0');
      const no = BigInt(tally.no_count ?? '0');
      const abstain = BigInt(tally.abstain_count ?? '0');
      const veto = BigInt(tally.no_with_veto_count ?? '0');
      const total = yes + no + abstain + veto;
      if (total > BigInt(0)) {
        tallyFormatted = {
          yes: computeTallyPct(yes, total),
          no: computeTallyPct(no, total),
          abstain: computeTallyPct(abstain, total),
          noWithVeto: computeTallyPct(veto, total),
        };
      }
    }
    return {
      title: (p.title as string) ?? null,
      summary: ((p.summary as string) ?? '').slice(0, 600) || null,
      status: formatProposalStatus((p.status as string) ?? ''),
      votingEndTime: (p.voting_end_time as string) ?? null,
      tally: tallyFormatted,
    };
  };

  const v1Result = await Promise.any(
    GOV_LCD_ENDPOINTS.map(base =>
      httpsGetJson(`${base}/cosmos/gov/v1/proposals/${proposalId}`).then(parseV1)
    )
  ).catch(() => null);
  if (v1Result) return v1Result;

  const parseV1beta1 = (data: Awaited<ReturnType<typeof httpsGetJson>>) => {
    if (!data?.proposal) throw new Error('no data');
    const p = data.proposal;
    const content = (p.content ?? {}) as Record<string, any>;
    const tally = p.final_tally_result;
    let tallyFormatted = null;
    if (tally) {
      const yes = BigInt(tally.yes ?? '0');
      const no = BigInt(tally.no ?? '0');
      const abstain = BigInt(tally.abstain ?? '0');
      const veto = BigInt(tally.no_with_veto ?? '0');
      const total = yes + no + abstain + veto;
      if (total > BigInt(0)) {
        tallyFormatted = {
          yes: computeTallyPct(yes, total),
          no: computeTallyPct(no, total),
          abstain: computeTallyPct(abstain, total),
          noWithVeto: computeTallyPct(veto, total),
        };
      }
    }
    return {
      title: (content.title as string) ?? null,
      summary: ((content.description as string) ?? '').slice(0, 600) || null,
      status: formatProposalStatus((p.status as string) ?? ''),
      votingEndTime: (p.voting_end_time as string) ?? null,
      tally: tallyFormatted,
    };
  };

  return Promise.any(
    GOV_LCD_ENDPOINTS.map(base =>
      httpsGetJson(`${base}/cosmos/gov/v1beta1/proposals/${proposalId}`).then(parseV1beta1)
    )
  ).catch(() => null);
}

function extractGovernanceRaw(
  rawMessages: any[],
  txEvents?: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>,
): {
  proposalId: string | null;
  voteOption: string | null;
  depositAmount: string | null;
  depositDenom: string | null;
  msgType: string | null;
  submitTitle: string | null;
  submitSummary: string | null;
} {
  for (const msg of rawMessages) {
    const type = msg['@type'] as string;
    if (!GOV_MSG_TYPES.has(type)) continue;

    const proposalId = String(msg.proposal_id ?? '').replace(/^0+/, '') || null;

    if (type.includes('MsgVote')) {
      const rawOption = String(msg.option ?? '');
      const voteOption = VOTE_OPTION_MAP[rawOption] ?? rawOption;
      return { proposalId, voteOption, depositAmount: null, depositDenom: null, msgType: type, submitTitle: null, submitSummary: null };
    }

    if (type.includes('MsgSubmitProposal')) {
      // Proposal ID comes from the submit_proposal event, not the message
      let eventProposalId: string | null = null;
      if (txEvents) {
        const ev = txEvents.find(e => e.type === 'submit_proposal');
        const attr = ev?.attributes?.find(a => a.key === 'proposal_id');
        if (attr?.value) eventProposalId = attr.value;
      }
      // v1: title and summary are top-level fields
      const submitTitle = (msg.title as string) ?? (msg.content?.title as string) ?? null;
      const rawSummary = (msg.summary as string) ?? (msg.content?.description as string) ?? '';
      const submitSummary = rawSummary.slice(0, 600) || null;
      const deposits: any[] = msg.initial_deposit ?? [];
      const first = deposits[0];
      return {
        proposalId: eventProposalId ?? proposalId,
        voteOption: null,
        depositAmount: first ? formatAmount(first.amount as string, first.denom as string) : null,
        depositDenom: first ? getDisplayDenom(first.denom as string) : null,
        msgType: type,
        submitTitle,
        submitSummary,
      };
    }

    if (type.includes('MsgDeposit')) {
      const amounts: any[] = msg.amount ?? [];
      const first = amounts[0];
      return {
        proposalId,
        voteOption: null,
        depositAmount: first ? formatAmount(first.amount as string, first.denom as string) : null,
        depositDenom: first ? getDisplayDenom(first.denom as string) : null,
        msgType: type,
        submitTitle: null,
        submitSummary: null,
      };
    }
  }

  return { proposalId: null, voteOption: null, depositAmount: null, depositDenom: null, msgType: null, submitTitle: null, submitSummary: null };
}

const AUTHZ_MSG_LABELS: Record<string, string> = {
  '/cosmos.staking.v1beta1.MsgDelegate': 'delegation rights',
  '/cosmos.staking.v1beta1.MsgUndelegate': 'undelegation rights',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'redelegation rights',
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': 'reward-claiming rights',
  '/cosmos.bank.v1beta1.MsgSend': 'token-sending rights',
  '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder': 'spot market-order rights',
  '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder': 'spot limit-order rights',
  '/injective.exchange.v1beta1.MsgBatchUpdateOrders': 'order management rights',
};

function extractRevokeData(rawMessages: any[]): RevokeData | null {
  const msg = rawMessages.find(
    (m: any) =>
      m['@type'] === '/cosmos.authz.v1beta1.MsgRevoke' ||
      m['@type'] === '/cosmos.authz.v1beta1.MsgGrant',
  );
  if (!msg) return null;

  const grantee: string = msg.grantee ?? '';
  const msgTypeUrl: string =
    msg.msg_type_url ??
    msg.grant?.authorization?.msg ??
    msg.grant?.authorization?.['@type'] ??
    '';
  const resolvedGrantee = resolveAddress(grantee);

  return {
    grantee,
    granteeName: resolvedGrantee !== grantee ? resolvedGrantee : null,
    msgTypeUrl,
    msgTypeLabel: AUTHZ_MSG_LABELS[msgTypeUrl] ?? msgTypeUrl,
  };
}

interface ValidatorLiveInfo {
  moniker: string | null;
  commission: number | null;       // percent, e.g. 5.0
  votingPowerPct: number | null;   // percent of total bonded
  totalBondedHuman: string | null; // human-readable INJ
  status: string | null;
}

async function fetchValidatorLiveInfo(address: string): Promise<ValidatorLiveInfo | null> {
  const tryEndpoint = async (base: string): Promise<ValidatorLiveInfo> => {
    const [valData, poolData] = await Promise.all([
      httpsGetJson(`${base}/cosmos/staking/v1beta1/validators/${address}`),
      httpsGetJson(`${base}/cosmos/staking/v1beta1/pool`),
    ]);
    if (!valData?.validator) throw new Error('no data');
    const v = valData.validator;
    const moniker = (v.description?.moniker as string) ?? null;
    const commissionRate = v.commission?.commission_rates?.rate;
    const commissionPct = commissionRate != null ? parseFloat(commissionRate) * 100 : null;
    const tokens = v.tokens as string;
    const status = (v.status as string) ?? null;
    let vpPct: number | null = null;
    let totalBondedHuman: string | null = null;
    if (tokens && poolData?.pool?.bonded_tokens) {
      const bondedTokens = BigInt(poolData.pool.bonded_tokens);
      const validatorTokens = BigInt(tokens);
      if (bondedTokens > BigInt(0)) {
        const vpBp = (validatorTokens * BigInt(10000)) / bondedTokens;
        vpPct = Number(vpBp) / 100;
      }
      totalBondedHuman = formatAmount(tokens, 'inj');
    }
    return { moniker, commission: commissionPct, votingPowerPct: vpPct, totalBondedHuman, status };
  };
  return Promise.any(GOV_LCD_ENDPOINTS.map(tryEndpoint)).catch(() => null);
}

async function fetchNetworkAPR(): Promise<number | null> {
  const tryEndpoint = async (base: string): Promise<number> => {
    const [provData, poolData] = await Promise.all([
      httpsGetJson(`${base}/cosmos/mint/v1beta1/annual_provisions`),
      httpsGetJson(`${base}/cosmos/staking/v1beta1/pool`),
    ]);
    const provisions = parseFloat(provData?.annual_provisions);
    const bonded = parseFloat(poolData?.pool?.bonded_tokens);
    if (bonded > 0 && isFinite(provisions) && isFinite(bonded)) return (provisions / bonded) * 100;
    throw new Error('no data');
  };
  return Promise.any(GOV_LCD_ENDPOINTS.map(tryEndpoint)).catch(() => null);
}

interface MultiSendContext {
  aiSummary: string;
  recipients: MultiSendRecipient[];
}

function buildMultiSendContext(rawMessages: any[]): MultiSendContext | null {
  const msg = rawMessages.find((m: any) => m['@type'] === '/cosmos.bank.v1beta1.MsgMultiSend');
  if (!msg?.outputs?.length) return null;

  const recipients: MultiSendRecipient[] = (msg.outputs as any[]).map(out => {
    const resolved = resolveAddress(out.address as string);
    return {
      address: out.address as string,
      name: resolved !== out.address ? resolved : null,
      amounts: ((out.coins ?? []) as any[]).map(c => ({
        amount: formatAmount(c.amount as string, c.denom as string),
        humanDenom: getDisplayDenom(c.denom as string),
      })),
    };
  });

  // Aggregate totals from inputs
  const totals = new Map<string, bigint>();
  for (const input of (msg.inputs ?? []) as any[]) {
    for (const coin of (input.coins ?? []) as any[]) {
      totals.set(coin.denom, (totals.get(coin.denom) ?? BigInt(0)) + BigInt(coin.amount));
    }
  }
  const totalLine = Array.from(totals.entries())
    .map(([denom, amt]) => `${formatAmount(amt.toString(), denom)} ${getDisplayDenom(denom)}`)
    .join(' + ');

  const recipientLines = recipients.map((r, i) => {
    const displayName = r.name ?? `${r.address.slice(0, 10)}…${r.address.slice(-6)}`;
    const amtsStr = r.amounts.map(a => `${a.amount} ${a.humanDenom}`).join(', ');
    return `  ${i + 1}. ${displayName}: ${amtsStr}`;
  });

  const aiSummary = `Multi-Send breakdown (${recipients.length} recipients, total outflow: ${totalLine}):\n${recipientLines.join('\n')}`;

  return { aiSummary, recipients };
}

function buildUserPrompt(
  tx: NormalizedTransaction,
  prices: Record<string, number>,
  validatorVP?: number | null,
  validatorCommission?: number | null,
  multiSendSummary?: string | null,
  unbondingAvailableDate?: string | null,
  unbondingAmount?: string | null,
  governanceData?: GovernanceData | null,
  validatorLiveInfo?: ValidatorLiveInfo | null,
  networkAPR?: number | null,
  revokeData?: RevokeData | null,
  authzGrantee?: string | null,
): string {
  const protocolContext = tx.target_protocol
    ? (PROTOCOL_CONTEXTS as Record<string, { context: string }>)[tx.target_protocol]?.context ?? null
    : null;

  const injPrice = prices['INJ'] ?? null;

  const assetsLine =
    tx.assets.length > 0
      ? tx.assets
          .map(a => {
            const sign = a.direction === 'in' ? '+' : a.direction === 'out' ? '-' : '±';
            const base = `${sign}${a.amount} ${a.humanDenom}`;
            const price = prices[a.humanDenom];
            if (price) {
              const usd = (parseFloat(a.amount) * price).toFixed(2);
              return `${base} (~$${usd} USD)`;
            }
            return base;
          })
          .join(', ')
      : 'No direct token movement detected';

  const messagesBlock = tx.messages
    .map((m, i) => `Message ${i + 1}:\n  type: ${m.type}\n  content: ${JSON.stringify(m.content)}`)
    .join('\n\n');

  let prompt = `Transaction:

Hash: ${tx.hash}
Status: ${tx.status.toUpperCase()}
Action: ${tx.main_action}
Sender: ${tx.sender}
Protocol: ${tx.target_protocol ?? 'Direct Chain Interaction'}
Token movements: ${assetsLine}${injPrice ? ` (INJ = $${injPrice.toFixed(2)} USD)` : ''}
Timestamp: ${tx.timestamp}

Messages:
${messagesBlock}`;

  if (tx.error_log) {
    prompt += `\n\nError: ${tx.error_log.slice(0, 400)}`;
  }

  if (protocolContext) {
    prompt += `\n\nProtocol context: ${protocolContext}`;
  }

  const liveVP = validatorLiveInfo?.votingPowerPct ?? validatorVP ?? null;
  const liveCommission = validatorLiveInfo?.commission ?? validatorCommission ?? null;
  if (liveVP != null || liveCommission != null || validatorLiveInfo != null || networkAPR != null) {
    prompt += '\n\nValidator data:';
    if (validatorLiveInfo?.moniker) prompt += `\n  Name: ${validatorLiveInfo.moniker}`;
    if (validatorLiveInfo?.status) prompt += `\n  Status: ${validatorLiveInfo.status}`;
    if (liveVP != null) prompt += `\n  Voting power: ${liveVP.toFixed(2)}% of total network stake`;
    if (liveCommission != null) prompt += `\n  Commission: ${liveCommission.toFixed(1)}%`;
    if (validatorLiveInfo?.totalBondedHuman) prompt += `\n  Total staked: ${validatorLiveInfo.totalBondedHuman} INJ`;
    if (networkAPR != null && liveCommission != null) {
      const effectiveAPR = (networkAPR * (1 - liveCommission / 100)).toFixed(2);
      prompt += `\n  Note: effective delegator APR is ~${effectiveAPR}% (shown in UI — do not restate)`;
    }
  }

  if (multiSendSummary) {
    prompt += `\n\n${multiSendSummary}`;
  }

  if (unbondingAvailableDate) {
    const d = new Date(unbondingAvailableDate);
    const formatted = d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
    let yieldLine = '';
    if (injPrice && unbondingAmount) {
      const amt = parseFloat(unbondingAmount);
      if (amt > 0) {
        const missedUsd = (amt * injPrice * 0.15 / 365 * 21).toFixed(2);
        yieldLine = `\n  ⚠ Backend-computed missed yield (${unbondingAmount} INJ × $${injPrice} × 15% APY × 21/365): $${missedUsd} — copy this verbatim into WARNING bullet, do NOT recompute`;
      }
    }
    prompt += `\n\nUnbonding release date (backend-calculated from chain event): ${formatted}${yieldLine}`;
  }

  if (governanceData) {
    const g = governanceData;
    let govBlock = '\n\nGovernance context:';
    if (g.proposalId) govBlock += `\n  Proposal ID: #${g.proposalId}`;
    if (g.proposalTitle) govBlock += `\n  Proposal title: ${g.proposalTitle}`;
    if (g.proposalSummary) govBlock += `\n  Proposal summary: ${g.proposalSummary}`;
    if (g.proposalStatus) govBlock += `\n  Proposal status: ${g.proposalStatus}`;
    if (g.voteOption) govBlock += `\n  Vote cast: ${g.voteOption}`;
    if (g.depositAmount && g.depositDenom) govBlock += `\n  Deposited: ${g.depositAmount} ${g.depositDenom}`;
    if (g.votingEndTime) {
      const d = new Date(g.votingEndTime);
      if (!isNaN(d.getTime())) {
        govBlock += `\n  Voting deadline: ${d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;
      }
    }
    if (g.tally) {
      govBlock += `\n  Current tally: YES ${g.tally.yes} | NO ${g.tally.no} | ABSTAIN ${g.tally.abstain} | NO WITH VETO ${g.tally.noWithVeto}`;
    }
    prompt += govBlock;
  }

  if (revokeData) {
    const granteeDisplay = revokeData.granteeName ?? `${revokeData.grantee.slice(0, 10)}…${revokeData.grantee.slice(-6)}`;
    prompt += `\n\nRevoke context:
  Permission revoked: ${revokeData.msgTypeLabel} (${revokeData.msgTypeUrl})
  Grantee (who lost the permission): ${granteeDisplay}
  Granter (you): ${tx.sender}`;
  }

  if (authzGrantee) {
    const resolvedGrantee = resolveAddress(authzGrantee);
    const agentDisplay = resolvedGrantee !== authzGrantee
      ? resolvedGrantee
      : `${authzGrantee.slice(0, 10)}…${authzGrantee.slice(-6)}`;
    prompt += `\n\nNote: This transaction was executed via MsgAuthzExec by authorized agent "${agentDisplay}" on behalf of the wallet owner. In the 'action' field, append "(via authorized agent)" at the end. In 'details', include a "• AUTHZ:" bullet explaining this was executed by an authorized bot or portfolio manager using Injective's authz module — no private key was shared; delegation rights were pre-approved on-chain.`;
  }

  if (tx.tradeData) {
    const td = tx.tradeData;
    const dir = td.isBuy ? 'BUY' : 'SELL';
    const isPerp = td.isDerivative === true;
    const orderType = isPerp
      ? (td.isLimitOrder ? 'PERP LIMIT (maker)' : 'PERP MARKET (taker)')
      : (td.isLimitOrder ? 'LIMIT (maker)' : 'MARKET (taker)');
    const feeStr = td.feeAmount != null ? `${td.feeAmount} ${td.feeSymbol}` : 'N/A';
    const feeContext = isPerp ? '' : buildTradeFeeContext(td);
    prompt += `\n\n⚠ TRADE DATA — ALL NUMBERS BELOW ARE BACKEND-CALCULATED. USE THEM VERBATIM.
  Market: ${td.ticker ?? 'Unknown pair'}
  Order type: ${orderType}
  Direction: ${dir}
  Spent: ${td.spentAmount ?? '?'} ${td.spentSymbol ?? ''}
  Received: ${td.receivedAmount ?? 'pending (limit order not yet filled)'} ${td.receivedSymbol ?? ''}
  Execution price (backend-calculated): ${td.executionPrice ?? '?'} ${td.quoteSymbol ?? ''}/${td.baseSymbol ?? ''}
  Slippage: ${td.slippagePct != null ? `${td.slippagePct}%` : 'N/A'}
  Target/limit price: ${td.targetPrice ?? 'N/A'} ${td.quoteSymbol ?? ''}/${td.baseSymbol ?? ''}
  Fee (from chain events): ${feeStr}${feeContext}`;
    if (isPerp) {
      prompt += `\n  Margin posted: ${td.marginAmount ?? '?'} ${td.marginSymbol ?? ''}`;
      prompt += `\n  Leverage: ${td.leverage ?? 'N/A'}`;
      const filledNote = td.receivedAmount != null
        ? 'Order filled immediately at execution price.'
        : 'Order is RESTING in the order book — not yet filled. Margin is locked until filled or cancelled.';
      prompt += `\n  Fill status: ${filledNote}`;
    }
  }

  return prompt;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const hash = typeof body?.hash === 'string' ? body.hash.trim() : '';

    if (!hash || hash.length < 10) {
      return NextResponse.json({ error: 'A valid transaction hash is required.' }, { status: 400 });
    }

    const [rawTx, prices] = await Promise.all([
      fetchTransaction(hash),
      fetchTokenPrices(),
    ]);

    const normalized = normalizeTransaction(hash, rawTx);

    // Unwrap MsgExec so all enrichment functions see the inner messages
    const rawMsgs = rawTx.tx.body.messages;
    const firstMsg = rawMsgs[0];
    const isAuthzExec = firstMsg?.['@type'] === '/cosmos.authz.v1beta1.MsgExec';
    const authzGrantee: string | null = isAuthzExec ? ((firstMsg.grantee as string) ?? null) : null;
    const effectiveMsgs: any[] =
      isAuthzExec && Array.isArray(firstMsg.msgs) && firstMsg.msgs.length > 0
        ? firstMsg.msgs
        : rawMsgs;

    const validatorData = extractValidatorData(effectiveMsgs);
    const txCategory = detectTxCategory(rawMsgs);
    const multiSendCtx = buildMultiSendContext(effectiveMsgs);
    const unbondingData = txCategory === 'UNSTAKE'
      ? computeUnbondingData(effectiveMsgs, normalized.timestamp, rawTx.tx_response.events)
      : null;

    // Staking: fetch live validator info + network APR in parallel
    let validatorLiveInfo: ValidatorLiveInfo | null = null;
    let networkAPR: number | null = null;
    if (txCategory === 'STAKE' && validatorData.address) {
      [validatorLiveInfo, networkAPR] = await Promise.all([
        fetchValidatorLiveInfo(validatorData.address),
        fetchNetworkAPR(),
      ]);
    }

    // Authz revoke/grant
    const revokeData = (txCategory === 'REVOKE' || txCategory === 'GRANT')
      ? extractRevokeData(effectiveMsgs)
      : null;

    // Governance: extract raw context from messages, then fetch proposal details from chain
    let governanceData: GovernanceData | null = null;
    if (txCategory === 'VOTE' || txCategory === 'PROPOSE' || txCategory === 'GOV_DEPOSIT') {
      const govRaw = extractGovernanceRaw(effectiveMsgs, rawTx.tx_response.events);
      let fetchedProposal: Awaited<ReturnType<typeof fetchProposalDetails>> = null;
      if (govRaw.proposalId && txCategory !== 'PROPOSE') {
        // For VOTE and GOV_DEPOSIT, fetch proposal details from the chain
        fetchedProposal = await fetchProposalDetails(govRaw.proposalId);
      }
      // For PROPOSE, content comes directly from the message (submitTitle/submitSummary)
      const title = fetchedProposal?.title ?? govRaw.submitTitle ?? null;
      const summary = fetchedProposal?.summary ?? govRaw.submitSummary ?? null;
      governanceData = {
        proposalId: govRaw.proposalId,
        proposalTitle: title,
        proposalSummary: summary,
        proposalStatus: fetchedProposal?.status ?? null,
        voteOption: govRaw.voteOption,
        depositAmount: govRaw.depositAmount,
        depositDenom: govRaw.depositDenom,
        votingEndTime: fetchedProposal?.votingEndTime ?? null,
        tally: fetchedProposal?.tally ?? null,
      };
    }

    const liveCommissionForAPR = validatorLiveInfo?.commission ?? validatorData.commission ?? null;
    const effectiveAPR: number | null =
      networkAPR != null && liveCommissionForAPR != null
        ? parseFloat((networkAPR * (1 - liveCommissionForAPR / 100)).toFixed(2))
        : null;

    const userPrompt = buildUserPrompt(
      normalized,
      prices,
      validatorData.votingPower,
      validatorData.commission,
      multiSendCtx?.aiSummary ?? null,
      unbondingData?.availableDate ?? null,
      unbondingData?.amount ?? null,
      governanceData,
      validatorLiveInfo,
      networkAPR,
      revokeData,
      authzGrantee,
    );

    const message = await groq.chat.completions.create({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 512,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
    });

    const rawText = message.choices[0]?.message?.content ?? '';

    let translation: { action: string; impact: string; details: string };
    try {
      const jsonMatch = rawText.match(/\{[\s\S]*\}/);
      translation = JSON.parse(jsonMatch ? jsonMatch[0] : rawText);
    } catch {
      translation = {
        action: 'Translation unavailable.',
        impact: 'Could not parse AI response.',
        details: rawText.slice(0, 200),
      };
    }

    const coerceField = (v: unknown): string => {
      if (v == null) return '';
      if (typeof v === 'string') return v;
      // AI sometimes returns details as a nested object — flatten to bullets
      if (typeof v === 'object' && !Array.isArray(v)) {
        return Object.entries(v as Record<string, unknown>)
          .map(([k, val]) => `• ${k}: ${String(val ?? '')}`)
          .join('\n');
      }
      return String(v);
    };

    return NextResponse.json({
      action: coerceField(translation.action),
      impact: coerceField(translation.impact),
      details: coerceField(translation.details),
      hash: normalized.hash,
      status: normalized.status,
      protocol: normalized.target_protocol,
      txCategory,
      validatorAddress: validatorData.address,
      validatorName: validatorData.name,
      validatorVotingPower: validatorData.votingPower,
      effectiveAPR,
      multiSendRecipients: multiSendCtx?.recipients ?? null,
      tradeData: normalized.tradeData ?? null,
      unbondingData,
      governanceData,
      revokeData,
      prices,
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'An unexpected error occurred.';
    const status = msg.toLowerCase().includes('not found') ? 404 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
