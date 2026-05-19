export interface NormalizedAsset {
  denom: string;
  humanDenom: string;
  amount: string;
  direction: 'in' | 'out' | 'neutral';
}

export interface ParsedMessage {
  type: string;
  content: Record<string, any>;
}

export interface TradeData {
  ticker: string | null;
  baseSymbol: string | null;
  quoteSymbol: string | null;
  isBuy: boolean | null;
  isLimitOrder: boolean | null;
  spentAmount: string | null;
  spentSymbol: string | null;
  receivedAmount: string | null;
  receivedSymbol: string | null;
  executionPrice: string | null;
  targetPrice: string | null;
  slippagePct: string | null;
  feeAmount: string | null;
  feeSymbol: string | null;
}

export interface NormalizedTransaction {
  hash: string;
  main_action: string;
  sender: string;
  target_protocol: string | null;
  assets: NormalizedAsset[];
  status: 'success' | 'failed';
  error_log: string | null;
  messages: ParsedMessage[];
  gas_used: string;
  timestamp: string;
  tradeData: TradeData | null;
}

export interface MultiSendRecipient {
  address: string;
  name: string | null;
  amounts: Array<{ amount: string; humanDenom: string }>;
}

export interface UnbondingData {
  amount: string;
  humanDenom: string;
  availableDate: string; // ISO date string = tx timestamp + 21 days
}

export interface GovernanceData {
  proposalId: string | null;
  proposalTitle: string | null;
  proposalSummary: string | null;
  proposalStatus: string | null;
  voteOption: string | null;
  depositAmount: string | null;
  depositDenom: string | null;
  votingEndTime: string | null;
  tally: {
    yes: string;
    no: string;
    abstain: string;
    noWithVeto: string;
  } | null;
}

export interface RevokeData {
  grantee: string;
  granteeName: string | null;
  msgTypeUrl: string;
  msgTypeLabel: string;
}

export interface TranslationResponse {
  action: string;
  impact: string;
  details: string;
  hash: string;
  status: 'success' | 'failed';
  protocol: string | null;
  txCategory: string;
  validatorAddress: string | null;
  validatorName: string | null;
  validatorVotingPower: number | null;
  multiSendRecipients: MultiSendRecipient[] | null;
  tradeData: TradeData | null;
  unbondingData: UnbondingData | null;
  governanceData: GovernanceData | null;
  revokeData: RevokeData | null;
}
