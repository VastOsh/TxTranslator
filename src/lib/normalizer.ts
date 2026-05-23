import type { CosmosTxResponse } from './injective';
import type { NormalizedTransaction, NormalizedAsset, ParsedMessage, TradeData } from '@/types';
import {
  MESSAGE_TYPE_PROTOCOLS,
  CONTRACT_PROTOCOLS,
  TOKEN_DECIMALS,
  DENOM_DISPLAY,
  ACTION_LABELS,
  type ProtocolName,
} from '@/constants/contracts';
import { HELIX_MARKETS, HELIX_ROUTER_CONTRACTS, HELIX_DERIVATIVE_MARKETS } from '@/constants/markets';
import { resolveAddress } from '@/constants/registry';

const COSMWASM_COMPAT_TYPES = new Set([
  '/cosmwasm.wasm.v1.MsgExecuteContract',
  '/injective.wasmx.v1.MsgExecuteContractCompat',
]);

const PRIVILEGED_CONTRACT_TYPE = '/injective.exchange.v1beta1.MsgPrivilegedExecuteContract';

export function formatAmount(amount: string, denom: string): string {
  const decimals = TOKEN_DECIMALS[denom] ?? 6;
  try {
    const raw = BigInt(amount);
    const divisor = BigInt(10 ** decimals);
    const whole = raw / divisor;
    const remainder = raw % divisor;
    const fracStr = remainder.toString().padStart(decimals, '0').slice(0, 4).replace(/0+$/, '');
    return fracStr ? `${whole}.${fracStr}` : whole.toString();
  } catch {
    return amount;
  }
}

export function getDisplayDenom(denom: string): string {
  if (DENOM_DISPLAY[denom]) return DENOM_DISPLAY[denom];
  if (denom.startsWith('factory/')) {
    const parts = denom.split('/');
    return parts[parts.length - 1].toUpperCase();
  }
  if (denom.startsWith('ibc/')) return `IBC-${denom.slice(4, 10)}`;
  if (denom.startsWith('peggy')) return `ERC20-${denom.slice(-6)}`;
  return denom.toUpperCase();
}

function tryDecodeBase64(value: string): any {
  try {
    const decoded = Buffer.from(value, 'base64').toString('utf-8');
    return JSON.parse(decoded);
  } catch {
    // Not base64 — try parsing as a plain JSON string (some LCD nodes return msg pre-decoded)
    try { return JSON.parse(value); } catch { return value; }
  }
}

// Parse MsgPrivilegedExecuteContract funds string: "212400000000 factory/.../HPNJ, 7456200000000000 inj"
function parseMsgPrivilegedFunds(funds: string): Array<{ amount: string; denom: string }> {
  return funds.split(',').flatMap(part => {
    const trimmed = part.trim();
    const spaceIdx = trimmed.indexOf(' ');
    if (spaceIdx < 0) return [];
    const amount = trimmed.slice(0, spaceIdx).trim();
    const denom = trimmed.slice(spaceIdx + 1).trim();
    if (!amount || !denom || !/^\d+$/.test(amount)) return [];
    return [{ amount, denom }];
  });
}

// Parse a raw coin string like "4520000000000000000inj" → {amount, denom}
function parseCoinStr(s: string): { amount: string; denom: string } | null {
  const match = s.trim().match(/^(\d+)(.+)$/);
  if (!match) return null;
  return { amount: match[1], denom: match[2].trim() };
}

// Extract reward assets from an event list (handles both log-nested and top-level formats)
function extractRewardsFromEvents(
  events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }>,
): NormalizedAsset[] {
  const assets: NormalizedAsset[] = [];
  for (const event of events) {
    if (event.type === 'withdraw_rewards' || event.type === 'withdraw_delegator_reward') {
      const amountAttr = event.attributes.find(a => a.key === 'amount');
      if (amountAttr?.value) {
        for (const part of amountAttr.value.split(',')) {
          const coin = parseCoinStr(part);
          if (coin && BigInt(coin.amount) > BigInt(0)) {
            assets.push({
              denom: coin.denom,
              humanDenom: getDisplayDenom(coin.denom),
              amount: formatAmount(coin.amount, coin.denom),
              direction: 'in',
            });
          }
        }
      }
    }
    // coinbase event = newly minted / distributed tokens
    if (event.type === 'coinbase') {
      const amountAttr = event.attributes.find(a => a.key === 'amount');
      if (amountAttr?.value) {
        for (const part of amountAttr.value.split(',')) {
          const coin = parseCoinStr(part);
          if (coin && BigInt(coin.amount) > BigInt(0)) {
            assets.push({
              denom: coin.denom,
              humanDenom: getDisplayDenom(coin.denom),
              amount: formatAmount(coin.amount, coin.denom),
              direction: 'in',
            });
          }
        }
      }
    }
  }
  return assets;
}

// Extract actual received amounts from tx_response logs/events (authoritative result).
// Newer Injective txs have empty logs[] with all events at the top level — the caller
// should supplement with extractRewardsFromEvents(tx_response.events) when logs is empty.
function extractAssetsFromLogs(logs: any[]): NormalizedAsset[] {
  const assets: NormalizedAsset[] = [];
  for (const log of logs) {
    const events: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> =
      log.events ?? [];
    assets.push(...extractRewardsFromEvents(events));
  }
  return assets;
}

function identifyProtocol(messages: ParsedMessage[]): ProtocolName {
  for (const msg of messages) {
    const byType = MESSAGE_TYPE_PROTOCOLS[msg.type];
    if (byType) return byType;

    if (COSMWASM_COMPAT_TYPES.has(msg.type)) {
      const contract = msg.content.contract as string | undefined;
      if (contract && CONTRACT_PROTOCOLS[contract]) return CONTRACT_PROTOCOLS[contract];
    }

    // MsgPrivilegedExecuteContract uses `contract_address`, not `contract`
    if (msg.type === PRIVILEGED_CONTRACT_TYPE) {
      const contract = msg.content.contract_address as string | undefined;
      if (contract && CONTRACT_PROTOCOLS[contract]) return CONTRACT_PROTOCOLS[contract];
    }
  }
  return 'Unknown';
}

function extractSender(messages: ParsedMessage[]): string {
  for (const msg of messages) {
    const c = msg.content;
    if (c.sender) return c.sender as string;
    if (c.from_address) return c.from_address as string;
    if (c.delegator_address) return c.delegator_address as string;
    if (Array.isArray(c.inputs) && c.inputs[0]?.address) return c.inputs[0].address as string;
    if (c.voter) return c.voter as string;
    if (c.proposer) return c.proposer as string;
    if (c.depositor) return c.depositor as string;
  }
  return 'Unknown';
}

function inferMainAction(messages: ParsedMessage[], protocol: ProtocolName): string {
  if (messages.length === 0) return 'Transaction';
  const primaryType = messages[0].type;

  if (COSMWASM_COMPAT_TYPES.has(primaryType) && protocol !== 'Unknown') {
    const innerMsg = messages[0].content.msg;
    if (innerMsg && typeof innerMsg === 'object') {
      const action = Object.keys(innerMsg)[0];
      if (action) {
        const readable = action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
        return `${protocol}: ${readable}`;
      }
    }
    return `${protocol} Interaction`;
  }

  // MsgPrivilegedExecuteContract: action name comes from the `data.name` field
  if (primaryType === PRIVILEGED_CONTRACT_TYPE && protocol !== 'Unknown') {
    const dataRaw = messages[0].content.data;
    if (typeof dataRaw === 'string') {
      try {
        const data = JSON.parse(dataRaw);
        const name = data?.name as string | undefined;
        if (name) {
          const readable = name.replace(/([A-Z])/g, ' $1').trim();
          return `${protocol}: ${readable}`;
        }
      } catch { /* ignore */ }
    }
    return `${protocol} Interaction`;
  }

  return ACTION_LABELS[primaryType] ?? 'Transaction';
}

function extractAssetsFromMessages(messages: ParsedMessage[]): NormalizedAsset[] {
  const assets: NormalizedAsset[] = [];

  for (const msg of messages) {
    const c = msg.content;

    if (msg.type === '/cosmos.bank.v1beta1.MsgSend' && Array.isArray(c.amount)) {
      for (const coin of c.amount) {
        assets.push({
          denom: coin.denom,
          humanDenom: getDisplayDenom(coin.denom),
          amount: formatAmount(coin.amount, coin.denom),
          direction: 'out',
        });
      }
    }

    if (msg.type === '/cosmos.bank.v1beta1.MsgMultiSend' && Array.isArray(c.inputs)) {
      const totals = new Map<string, bigint>();
      for (const input of c.inputs) {
        for (const coin of (input.coins ?? [])) {
          totals.set(coin.denom, (totals.get(coin.denom) ?? BigInt(0)) + BigInt(coin.amount));
        }
      }
      for (const [denom, total] of totals) {
        assets.push({
          denom,
          humanDenom: getDisplayDenom(denom),
          amount: formatAmount(total.toString(), denom),
          direction: 'out',
        });
      }
    }

    if (msg.type === '/injective.exchange.v1beta1.MsgDeposit' && c.amount) {
      assets.push({
        denom: c.amount.denom,
        humanDenom: getDisplayDenom(c.amount.denom),
        amount: formatAmount(c.amount.amount, c.amount.denom),
        direction: 'out',
      });
    }
    if (msg.type === '/injective.exchange.v1beta1.MsgWithdraw' && c.amount) {
      assets.push({
        denom: c.amount.denom,
        humanDenom: getDisplayDenom(c.amount.denom),
        amount: formatAmount(c.amount.amount, c.amount.denom),
        direction: 'in',
      });
    }

    if (
      (msg.type === '/cosmos.staking.v1beta1.MsgDelegate' ||
        msg.type === '/cosmos.staking.v1beta1.MsgUndelegate') &&
      c.amount
    ) {
      assets.push({
        denom: c.amount.denom,
        humanDenom: getDisplayDenom(c.amount.denom),
        amount: formatAmount(c.amount.amount, c.amount.denom),
        direction: msg.type.includes('Undelegate') ? 'in' : 'out',
      });
    }

    if (msg.type === '/ibc.applications.transfer.v1.MsgTransfer' && c.token) {
      assets.push({
        denom: c.token.denom,
        humanDenom: getDisplayDenom(c.token.denom),
        amount: formatAmount(c.token.amount, c.token.denom),
        direction: 'out',
      });
    }

    if (
      (msg.type === '/cosmos.gov.v1beta1.MsgDeposit' ||
        msg.type === '/cosmos.gov.v1.MsgDeposit') &&
      Array.isArray(c.amount)
    ) {
      for (const coin of c.amount) {
        assets.push({
          denom: coin.denom,
          humanDenom: getDisplayDenom(coin.denom),
          amount: formatAmount(coin.amount, coin.denom),
          direction: 'out',
        });
      }
    }

    if (
      (msg.type === '/cosmos.gov.v1beta1.MsgSubmitProposal' ||
        msg.type === '/cosmos.gov.v1.MsgSubmitProposal') &&
      Array.isArray(c.initial_deposit)
    ) {
      for (const coin of c.initial_deposit) {
        assets.push({
          denom: coin.denom,
          humanDenom: getDisplayDenom(coin.denom),
          amount: formatAmount(coin.amount, coin.denom),
          direction: 'out',
        });
      }
    }

    if (DERIVATIVE_TRADE_TYPES.has(msg.type)) {
      const order = c.order;
      if (order?.order_info?.margin) {
        const marketId = (order.market_id ?? '').toLowerCase();
        const derivMarket = HELIX_DERIVATIVE_MARKETS[marketId];
        const quoteDenom = derivMarket?.quoteDenom ?? '';
        if (quoteDenom) {
          assets.push({
            denom: quoteDenom,
            humanDenom: getDisplayDenom(quoteDenom),
            amount: formatAmount(order.order_info.margin, quoteDenom),
            direction: 'out',
          });
        }
      }
    }

    if (msg.type === '/cosmwasm.wasm.v1.MsgExecuteContract' && Array.isArray(c.funds)) {
      const contract = c.contract as string | undefined;
      if (!contract || !HELIX_ROUTER_CONTRACTS.has(contract)) {
        for (const coin of c.funds) {
          assets.push({
            denom: coin.denom,
            humanDenom: getDisplayDenom(coin.denom),
            amount: formatAmount(coin.amount, coin.denom),
            direction: 'out',
          });
        }
      }
    }

    // MsgPrivilegedExecuteContract funds is a space+comma-separated string: "amt denom, amt denom"
    if (msg.type === PRIVILEGED_CONTRACT_TYPE && typeof c.funds === 'string' && c.funds) {
      for (const coin of parseMsgPrivilegedFunds(c.funds)) {
        assets.push({
          denom: coin.denom,
          humanDenom: getDisplayDenom(coin.denom),
          amount: formatAmount(coin.amount, coin.denom),
          direction: 'out',
        });
      }
    }

    // MsgExecuteContractCompat funds is a raw coin string like "500000000000000000inj"
    if (msg.type === '/injective.wasmx.v1.MsgExecuteContractCompat' && typeof c.funds === 'string' && c.funds) {
      const contract = c.contract as string | undefined;
      if (!contract || !HELIX_ROUTER_CONTRACTS.has(contract)) {
        const coin = parseCoinStr(c.funds);
        if (coin) {
          assets.push({
            denom: coin.denom,
            humanDenom: getDisplayDenom(coin.denom),
            amount: formatAmount(coin.amount, coin.denom),
            direction: 'out',
          });
        }
      }
    }
  }

  return assets;
}

const SPOT_TRADE_TYPES = new Set([
  '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder',
  '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder',
  '/injective.exchange.v1beta1.MsgBatchUpdateOrders',
]);

const DERIVATIVE_TRADE_TYPES = new Set([
  '/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder',
  '/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder',
]);

// Parse a Helix swap that went through the CosmWasm atomic swap router
// (MsgExecuteContractCompat → inj12yj3...)
function parseWasmHelixTrade(raw: CosmosTxResponse): TradeData | null {
  const allEvents: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> = [
    ...(raw.tx_response.events ?? []),
    ...(raw.tx_response.logs?.flatMap((l: any) => l.events ?? []) ?? []),
  ];

  // Primary source: wasm-atomic_swap_execution event
  const swapEvent = allEvents.find(e => e.type === 'wasm-atomic_swap_execution');
  if (!swapEvent) return null;

  const attr: Record<string, string> = {};
  for (const a of swapEvent.attributes) attr[a.key] = a.value;

  const inputAmountRaw = attr['swap_input_amount'] ?? attr['_swap_input_amount'];
  const inputDenom = attr['swap_input_denom'] ?? attr['_swap_input_denom'];
  const finalAmountRaw = attr['swap_final_amount'] ?? attr['_swap_final_amount'];
  const finalDenom = attr['swap_final_denom'] ?? attr['_swap_final_denom'];

  if (!inputAmountRaw || !inputDenom || !finalAmountRaw || !finalDenom) return null;

  const inputDecimals = TOKEN_DECIMALS[inputDenom] ?? 18;
  const finalDecimals = TOKEN_DECIMALS[finalDenom] ?? 6;
  const inputAmountHuman = parseFloat(inputAmountRaw) / Math.pow(10, inputDecimals);
  const finalAmountHuman = parseFloat(finalAmountRaw) / Math.pow(10, finalDecimals);

  const inputSymbol = getDisplayDenom(inputDenom);
  const finalSymbol = getDisplayDenom(finalDenom);

  // Determine isBuy and order-book fill price from EventBatchSpotExecution
  let isBuy: boolean | null = null;
  let marketId: string | null = null;
  let orderBookPrice: number | null = null;  // price from order book (for slippage baseline)
  let slippagePct: string | null = null;

  const batchExecEvent = allEvents.find(e => e.type === 'injective.exchange.v2.EventBatchSpotExecution');
  if (batchExecEvent) {
    const bAttr: Record<string, string> = {};
    for (const a of batchExecEvent.attributes) bAttr[a.key] = a.value;
    isBuy = bAttr['is_buy'] === 'true' || bAttr['_is_buy'] === 'true';
    marketId = (bAttr['market_id'] ?? bAttr['_market_id'] ?? '').toLowerCase() || null;

    const tradesRaw = bAttr['trades'] ?? bAttr['_trades'];
    if (tradesRaw) {
      try {
        const trades = JSON.parse(tradesRaw);
        if (Array.isArray(trades) && trades.length > 0) {
          const p = parseFloat(trades[0].price ?? '0');
          if (p > 0) orderBookPrice = p;
        }
      } catch { /* ignore */ }
    }
  }

  // Derive isBuy from denom roles if not from event
  if (isBuy === null && marketId) {
    const market = HELIX_MARKETS[marketId];
    if (market) isBuy = inputDenom === market.quoteDenom;
  }

  // Actual execution price = received / spent (authoritative — what user actually got)
  // sell: received_quote / spent_base   buy: spent_quote / received_base
  const actualExecPrice =
    inputAmountHuman > 0 && finalAmountHuman > 0
      ? (isBuy === false
          ? finalAmountHuman / inputAmountHuman
          : inputAmountHuman / finalAmountHuman)
      : null;

  const executionPrice = actualExecPrice != null ? actualExecPrice.toFixed(4) : null;

  // Slippage = deviation of actual execution price from order-book fill price
  if (actualExecPrice != null && orderBookPrice && orderBookPrice > 0) {
    const slip = Math.abs(actualExecPrice - orderBookPrice) / orderBookPrice * 100;
    slippagePct = slip.toFixed(4);
  }

  // Target price from swap_min_output (user's minimum acceptable price)
  let targetPrice: string | null = null;
  const wasmMsg = raw.tx.body.messages.find(m =>
    m['@type'] === '/injective.wasmx.v1.MsgExecuteContractCompat'
  );
  if (wasmMsg) {
    let innerMsg: any = wasmMsg.msg;
    if (typeof innerMsg === 'string') {
      try { innerMsg = JSON.parse(Buffer.from(innerMsg, 'base64').toString('utf-8')); } catch { /* ignore */ }
    }
    const minQty = innerMsg?.swap_min_output?.min_output_quantity;
    if (minQty && finalDecimals != null) {
      const minOutHuman = parseFloat(minQty) / Math.pow(10, finalDecimals);
      if (minOutHuman > 0 && inputAmountHuman > 0) {
        const tPrice = isBuy === false
          ? minOutHuman / inputAmountHuman
          : inputAmountHuman / minOutHuman;
        targetPrice = tPrice.toFixed(6);
      }
    }
  }

  const market = marketId ? (HELIX_MARKETS[marketId] ?? null) : null;

  // Extract actual fee from EventBatchSpotExecution (in quote currency)
  let feeAmount: string | null = null;
  const quoteSym = isBuy === false ? finalSymbol : inputSymbol;
  if (batchExecEvent) {
    const bAttr2: Record<string, string> = {};
    for (const a of batchExecEvent.attributes) bAttr2[a.key] = a.value;
    const tradesRaw2 = bAttr2['trades'] ?? bAttr2['_trades'];
    if (tradesRaw2) {
      try {
        const trades2 = JSON.parse(tradesRaw2);
        if (Array.isArray(trades2) && trades2.length > 0) {
          const fee = parseFloat(trades2[0].fee ?? '-1');
          if (fee >= 0) feeAmount = fee.toFixed(4).replace(/\.?0+$/, '') || '0';
        }
      } catch { /* ignore */ }
    }
  }
  if (feeAmount === null && inputAmountHuman > 0) {
    feeAmount = (inputAmountHuman * 0.002).toFixed(4).replace(/\.?0+$/, '');
  }

  return {
    ticker: market?.ticker ?? null,
    baseSymbol: isBuy === false ? inputSymbol : finalSymbol,
    quoteSymbol: isBuy === false ? finalSymbol : inputSymbol,
    isBuy: isBuy ?? false,
    isLimitOrder: false,
    spentAmount: inputAmountHuman.toFixed(4).replace(/\.?0+$/, ''),
    spentSymbol: inputSymbol,
    receivedAmount: finalAmountHuman.toFixed(4).replace(/\.?0+$/, ''),
    receivedSymbol: finalSymbol,
    executionPrice,
    targetPrice,
    slippagePct,
    feeAmount,
    feeSymbol: quoteSym,
  };
}

function parseDerivativeTradeData(raw: CosmosTxResponse): TradeData | null {
  const msgs = raw.tx.body.messages;
  const derivMsg = msgs.find(m => DERIVATIVE_TRADE_TYPES.has(m['@type'] ?? ''));
  if (!derivMsg) return null;

  const isLimitOrder = derivMsg['@type'] === '/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder';
  const order = derivMsg.order;
  if (!order) return null;

  const marketId: string = (order.market_id ?? '').toLowerCase();
  const market = HELIX_DERIVATIVE_MARKETS[marketId] ?? null;
  const isBuy: boolean = (order.order_type ?? '').toUpperCase().includes('BUY');

  const quoteDenom = market?.quoteDenom ?? '';
  const quoteDecimals = TOKEN_DECIMALS[quoteDenom] ?? 6;
  const quoteSymbol = market?.quoteSymbol ?? getDisplayDenom(quoteDenom);

  const exchangePrice = parseFloat(order.order_info?.price ?? '0');
  const humanPrice = exchangePrice / Math.pow(10, quoteDecimals);

  const quantity = parseFloat(order.order_info?.quantity ?? '0');

  const exchangeMargin = parseFloat(order.order_info?.margin ?? '0');
  const humanMargin = exchangeMargin / Math.pow(10, quoteDecimals);

  const notional = quantity * humanPrice;
  const leverage = humanMargin > 0 && notional > 0
    ? `${(notional / humanMargin).toFixed(2)}x`
    : null;

  // Check for immediate fill via EventBatchDerivativeExecution
  const topEvents: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> =
    raw.tx_response.events ?? [];
  let actualFillPrice: number | null = null;
  let isFilled = false;
  for (const ev of topEvents) {
    if (ev.type !== 'injective.exchange.v2.EventBatchDerivativeExecution') continue;
    const bAttr: Record<string, string> = {};
    for (const a of ev.attributes) bAttr[a.key] = a.value;
    const tradesRaw = bAttr['trades'] ?? bAttr['_trades'];
    if (tradesRaw) {
      try {
        const trades = JSON.parse(tradesRaw);
        if (Array.isArray(trades) && trades.length > 0) {
          const p = parseFloat(trades[0].price ?? '0');
          if (p > 0) { actualFillPrice = p / Math.pow(10, quoteDecimals); isFilled = true; }
        }
      } catch { /* ignore */ }
    }
    break;
  }

  const executionPrice = isFilled && actualFillPrice != null
    ? actualFillPrice.toFixed(4)
    : humanPrice > 0 ? humanPrice.toFixed(4) : null;

  return {
    ticker: market?.ticker ?? null,
    baseSymbol: market?.baseSymbol ?? null,
    quoteSymbol,
    isBuy,
    isLimitOrder,
    isDerivative: true,
    spentAmount: humanMargin > 0 ? humanMargin.toFixed(4).replace(/\.?0+$/, '') : null,
    spentSymbol: quoteSymbol,
    receivedAmount: isFilled && quantity > 0 ? quantity.toFixed(6).replace(/\.?0+$/, '') : null,
    receivedSymbol: isFilled ? (market?.baseSymbol ?? null) : null,
    executionPrice,
    targetPrice: humanPrice > 0 ? humanPrice.toFixed(4) : null,
    slippagePct: isLimitOrder ? '0.0000' : null,
    feeAmount: isLimitOrder && !isFilled ? '0' : null,
    feeSymbol: quoteSymbol,
    marginAmount: humanMargin > 0 ? humanMargin.toFixed(4).replace(/\.?0+$/, '') : null,
    marginSymbol: quoteSymbol,
    leverage,
  };
}

function parseTradeData(raw: CosmosTxResponse, senderAddress: string): TradeData | null {
  const msgs = raw.tx.body.messages;

  // Derivative (PERP/futures) orders
  if (msgs.some(m => DERIVATIVE_TRADE_TYPES.has(m['@type'] ?? ''))) {
    return parseDerivativeTradeData(raw);
  }

  // CosmWasm atomic swap router path
  const wasmMsg = msgs.find(m =>
    (m['@type'] === '/injective.wasmx.v1.MsgExecuteContractCompat' ||
     m['@type'] === '/cosmwasm.wasm.v1.MsgExecuteContract') &&
    HELIX_ROUTER_CONTRACTS.has(m.contract ?? '')
  );
  if (wasmMsg) return parseWasmHelixTrade(raw);

  const tradeMsg = msgs.find(m => SPOT_TRADE_TYPES.has(m['@type'] ?? ''));
  if (!tradeMsg) return null;

  const isLimitOrder = tradeMsg['@type'] === '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder';

  // Extract the first spot order from the message
  let order: any = null;
  if (tradeMsg['@type'] === '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder' ||
      tradeMsg['@type'] === '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder') {
    order = tradeMsg.order;
  } else {
    // MsgBatchUpdateOrders — take the first spot order being created
    const created: any[] = tradeMsg.spot_orders_to_create ?? tradeMsg.spot_market_orders_to_create ?? [];
    order = created[0] ?? null;
  }
  if (!order) return null;

  const marketId: string = (order.market_id ?? '').toLowerCase();
  const market = HELIX_MARKETS[marketId] ?? null;
  const isBuy: boolean = (order.order_type ?? '').toUpperCase().includes('BUY');

  // Decode exchange price → human-readable price
  const exchangePrice: number = parseFloat(order.order_info?.price ?? '0');
  const exchangeQuantity: number = parseFloat(order.order_info?.quantity ?? '0');

  const baseDenom = market?.baseDenom ?? '';
  const quoteDenom = market?.quoteDenom ?? '';
  const baseDecimals = TOKEN_DECIMALS[baseDenom] ?? 18;
  const quoteDecimals = TOKEN_DECIMALS[quoteDenom] ?? 6;

  // human_price = exchange_price × 10^(base_decimals − quote_decimals)
  const humanTargetPrice = exchangePrice * Math.pow(10, baseDecimals - quoteDecimals);
  // human_quantity = exchange_quantity / 10^base_decimals
  const humanQuantity = exchangeQuantity / Math.pow(10, baseDecimals);

  const topEvents: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> =
    raw.tx_response.events ?? [];

  // Spent amount: read from coin_spent with msg_index (trade cost, not gas fee)
  let spentRaw: string | null = null;
  let spentDenom: string | null = null;
  for (const ev of topEvents) {
    if (ev.type !== 'coin_spent') continue;
    const attrs: Record<string, string> = {};
    for (const a of ev.attributes) attrs[a.key] = a.value;
    if (attrs.spender === senderAddress && attrs.msg_index !== undefined && attrs.amount) {
      const coin = parseCoinStr(attrs.amount);
      if (coin) { spentRaw = coin.amount; spentDenom = coin.denom; break; }
    }
  }

  // Actual fee + fill price from EventBatchSpotExecution
  let feeAmount: string | null = null;
  let actualFillPriceRaw: number | null = null;
  const feeSymbol: string = getDisplayDenom(quoteDenom || 'inj');
  for (const ev of topEvents) {
    if (ev.type !== 'injective.exchange.v2.EventBatchSpotExecution') continue;
    const bAttr: Record<string, string> = {};
    for (const a of ev.attributes) bAttr[a.key] = a.value;
    const tradesRaw = bAttr['trades'] ?? bAttr['_trades'];
    if (tradesRaw) {
      try {
        const trades = JSON.parse(tradesRaw);
        if (Array.isArray(trades) && trades.length > 0) {
          const fee = parseFloat(trades[0].fee ?? '-1');
          if (fee >= 0) feeAmount = fee.toFixed(4).replace(/\.?0+$/, '') || '0';
          const p = parseFloat(trades[0].price ?? '0');
          if (p > 0) actualFillPriceRaw = p;
        }
      } catch { /* ignore */ }
    }
    break;
  }
  const actualFillPriceHuman =
    actualFillPriceRaw != null
      ? actualFillPriceRaw * Math.pow(10, baseDecimals - quoteDecimals)
      : null;

  const effectiveSpentDenom = spentDenom ?? (isBuy ? quoteDenom : baseDenom);
  const effectiveSpentDecimals = TOKEN_DECIMALS[effectiveSpentDenom] ?? 6;
  const spentAmountHuman = spentRaw
    ? parseFloat(spentRaw) / Math.pow(10, effectiveSpentDecimals)
    : null;
  const spentAmountStr = spentAmountHuman !== null
    ? spentAmountHuman.toFixed(4).replace(/\.?0+$/, '')
    : null;
  const spentSymbol = getDisplayDenom(effectiveSpentDenom);

  // Received side (approximate from order quantity)
  let receivedAmountStr: string | null = null;
  let receivedSymbol: string | null = null;

  if (isBuy && humanQuantity > 0) {
    receivedAmountStr = humanQuantity.toFixed(4).replace(/\.?0+$/, '');
    receivedSymbol = market?.baseSymbol ?? getDisplayDenom(baseDenom);
  } else if (!isBuy && humanTargetPrice > 0 && humanQuantity > 0) {
    const approxReceived = humanQuantity * humanTargetPrice;
    receivedAmountStr = approxReceived.toFixed(4).replace(/\.?0+$/, '');
    receivedSymbol = market?.quoteSymbol ?? getDisplayDenom(quoteDenom);
  }

  // Execution price: spent / quantity for BUY; target price for SELL
  let executionPrice: string | null = null;
  let slippagePct: string | null = null;

  if (actualFillPriceHuman != null) {
    executionPrice = actualFillPriceHuman.toFixed(4);
    if (humanTargetPrice > 0) {
      const slip = Math.abs(actualFillPriceHuman - humanTargetPrice) / humanTargetPrice * 100;
      slippagePct = slip.toFixed(4);
    }
    if (isLimitOrder) slippagePct = '0.0000';
  } else if (spentAmountHuman !== null && humanQuantity > 0 && isBuy) {
    const execPrice = spentAmountHuman / humanQuantity;
    executionPrice = execPrice.toFixed(4);
    if (humanTargetPrice > 0) {
      const slip = Math.abs(execPrice - humanTargetPrice) / humanTargetPrice * 100;
      slippagePct = slip.toFixed(4);
    }
  } else if (humanTargetPrice > 0) {
    executionPrice = humanTargetPrice.toFixed(4);
    if (isLimitOrder) slippagePct = '0.0000';
  }

  // Fall back to estimated fee if event data unavailable
  if (feeAmount === null && spentAmountHuman !== null) {
    feeAmount = (spentAmountHuman * 0.002).toFixed(4).replace(/\.?0+$/, '');
  }

  return {
    ticker: market?.ticker ?? null,
    baseSymbol: market?.baseSymbol ?? null,
    quoteSymbol: market?.quoteSymbol ?? null,
    isBuy,
    isLimitOrder,
    spentAmount: spentAmountStr,
    spentSymbol,
    receivedAmount: receivedAmountStr,
    receivedSymbol,
    executionPrice,
    targetPrice: humanTargetPrice > 0 ? humanTargetPrice.toFixed(4) : null,
    slippagePct,
    feeAmount,
    feeSymbol,
  };
}

// Replace known raw addresses with human names inside message content
function resolveAddressesInContent(content: Record<string, any>): Record<string, any> {
  const resolved = { ...content };
  const addressFields = ['validator_address', 'contract', 'contract_address', 'to_address', 'receiver', 'dst_validator'];
  for (const field of addressFields) {
    if (typeof resolved[field] === 'string') {
      resolved[field] = resolveAddress(resolved[field]);
    }
  }
  return resolved;
}

export function normalizeTransaction(hash: string, raw: CosmosTxResponse): NormalizedTransaction {
  const txr = raw.tx_response;
  const status: 'success' | 'failed' = txr.code === 0 ? 'success' : 'failed';

  const parsedMessages: ParsedMessage[] = raw.tx.body.messages.map(msg => {
    const { '@type': type, ...content } = msg;
    if (COSMWASM_COMPAT_TYPES.has(type) && typeof content.msg === 'string') {
      content.msg = tryDecodeBase64(content.msg);
    }
    return { type, content: resolveAddressesInContent(content) };
  });

  const protocol = identifyProtocol(parsedMessages);

  // Prefer event-derived assets (actual result) over message-derived (intent)
  const logs = txr.logs ?? [];
  const eventAssets = extractAssetsFromLogs(logs);

  // For CosmWasm Helix swaps, supplement with coin_received from top-level events
  const isHelixWasmSwap = parsedMessages.some(m =>
    COSMWASM_COMPAT_TYPES.has(m.type) &&
    HELIX_ROUTER_CONTRACTS.has((m.content.contract ?? '') as string)
  );

  let assets: NormalizedAsset[];
  if (isHelixWasmSwap) {
    // Build from wasm-atomic_swap_execution event for accuracy
    const topEvents: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> =
      txr.events ?? [];
    const swapEv = topEvents.find(e => e.type === 'wasm-atomic_swap_execution');
    if (swapEv) {
      const attr: Record<string, string> = {};
      for (const a of swapEv.attributes) attr[a.key] = a.value;
      const swapAssets: NormalizedAsset[] = [];
      const inAmt = attr['swap_input_amount'] ?? attr['_swap_input_amount'];
      const inDenom = attr['swap_input_denom'] ?? attr['_swap_input_denom'];
      const outAmt = attr['swap_final_amount'] ?? attr['_swap_final_amount'];
      const outDenom = attr['swap_final_denom'] ?? attr['_swap_final_denom'];
      if (inAmt && inDenom) swapAssets.push({
        denom: inDenom, humanDenom: getDisplayDenom(inDenom),
        amount: formatAmount(inAmt, inDenom), direction: 'out',
      });
      if (outAmt && outDenom) swapAssets.push({
        denom: outDenom, humanDenom: getDisplayDenom(outDenom),
        amount: formatAmount(outAmt, outDenom), direction: 'in',
      });
      assets = swapAssets.length > 0 ? swapAssets : extractAssetsFromMessages(parsedMessages);
    } else {
      assets = extractAssetsFromMessages(parsedMessages);
    }
  } else {
    assets = eventAssets.length > 0 ? eventAssets : extractAssetsFromMessages(parsedMessages);
    // Newer Injective txs have empty logs[]; supplement with rewards from top-level events
    if (logs.length === 0) {
      const topEvents: Array<{ type: string; attributes: Array<{ key: string; value: string }> }> =
        txr.events ?? [];
      const topRewards = extractRewardsFromEvents(topEvents);
      if (topRewards.length > 0) assets = [...assets, ...topRewards];
    }
  }

  const rawSender = extractSender(parsedMessages);
  const tradeData = parseTradeData(raw, rawSender);

  return {
    hash: txr.txhash || hash,
    main_action: inferMainAction(parsedMessages, protocol),
    sender: resolveAddress(rawSender),
    target_protocol: protocol !== 'Unknown' ? protocol : null,
    assets,
    status,
    error_log: status === 'failed' ? txr.raw_log : null,
    messages: parsedMessages,
    gas_used: txr.gas_used,
    timestamp: txr.timestamp,
    tradeData,
  };
}
