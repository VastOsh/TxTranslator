export type ProtocolName =
  | 'Helix'
  | 'Mito Finance'
  | 'Hydro Protocol'
  | 'IBC Transfer'
  | 'Staking'
  | 'Governance'
  | 'Unknown';

export interface Protocol {
  name: ProtocolName;
  description: string;
  context: string;
}

// Native exchange module message types → Helix DEX
export const MESSAGE_TYPE_PROTOCOLS: Record<string, ProtocolName> = {
  '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder': 'Helix',
  '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder': 'Helix',
  '/injective.exchange.v1beta1.MsgBatchUpdateOrders': 'Helix',
  '/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder': 'Helix',
  '/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder': 'Helix',
  '/injective.exchange.v1beta1.MsgCancelSpotOrder': 'Helix',
  '/injective.exchange.v1beta1.MsgCancelDerivativeOrder': 'Helix',
  '/injective.exchange.v1beta1.MsgBatchCancelSpotOrders': 'Helix',
  '/injective.exchange.v1beta1.MsgBatchCancelDerivativeOrders': 'Helix',
  '/injective.exchange.v1beta1.MsgDeposit': 'Helix',
  '/injective.exchange.v1beta1.MsgWithdraw': 'Helix',
  '/ibc.applications.transfer.v1.MsgTransfer': 'IBC Transfer',
  '/cosmos.staking.v1beta1.MsgDelegate': 'Staking',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'Staking',
  '/cosmos.staking.v1beta1.MsgUndelegate': 'Staking',
  '/cosmos.gov.v1beta1.MsgVote': 'Governance',
  '/cosmos.gov.v1.MsgVote': 'Governance',
  '/cosmos.gov.v1beta1.MsgSubmitProposal': 'Governance',
  '/cosmos.gov.v1.MsgSubmitProposal': 'Governance',
  '/cosmos.gov.v1beta1.MsgDeposit': 'Governance',
  '/cosmos.gov.v1.MsgDeposit': 'Governance',
};

// Known CosmWasm contract addresses on Injective Mainnet.
// These can be extended via the Firecrawl skill by scraping the Injective explorer.
export const CONTRACT_PROTOCOLS: Record<string, ProtocolName> = {
  // Mito Finance vault contracts (MsgExecuteContract / MsgExecuteContractCompat paths)
  'inj1jtw5c4ef2nlxnfnlrqas2z6q37emxn8n95tlkz': 'Mito Finance',
  'inj1gkh79s63k9ql69qwx7w4wjlq3m43qfhulq3nt': 'Mito Finance',
  'inj1qg5ega6dykkxc307y25pecuufrjkxkaggkkxh': 'Mito Finance',
  // Mito Finance vault contracts (MsgPrivilegedExecuteContract path — contract_address field)
  'inj1vcqkkvqs7prqu70dpddfj7kqeqfdz5gg662qs3': 'Mito Finance',
  // Mito Finance LP staking / incentive contracts
  'inj1gtze7qm07nky47n7mwgj4zatf2s77xqvh3k2n8': 'Mito Finance',
  // Hydro Protocol (hINJ liquid staking)
  'inj1dxp690rd86nehmqj8r8fe3lj9ns9f5t04hnqe': 'Hydro Protocol',
  'inj16mwjqkl0q57c2qpkgf5xjw8mqqd6ewdq3k3pk': 'Hydro Protocol',
  // Helix atomic swap router (MsgExecuteContractCompat path)
  'inj12yj3mtjarujkhcp6lg3klxjjfrx2v7v8yswgp9': 'Helix',
};

export const PROTOCOL_CONTEXTS: Record<ProtocolName, Protocol> = {
  Helix: {
    name: 'Helix',
    description: 'On-chain DEX with native orderbook',
    context:
      'Helix is the premier on-chain orderbook DEX on Injective. When a user "swaps", they are technically placing a market order that is instantly matched on the native orderbook. Interactions also include limit orders, order cancellations, and perpetuals trading.',
  },
  'Mito Finance': {
    name: 'Mito Finance',
    description: 'Automated yield vaults',
    context:
      'Mito Finance is an automated trading vault platform on Injective. When a user deposits, they are providing liquidity to an algorithmic strategy and receive LP tokens representing their share. These LP tokens earn real yield from trading fees.',
  },
  'Hydro Protocol': {
    name: 'Hydro Protocol',
    description: 'Liquid staking (hINJ)',
    context:
      'Hydro Protocol is the liquid staking protocol on Injective. Users stake INJ and receive hINJ (liquid staking tokens) at a 1:1 ratio. hINJ earns staking rewards while remaining usable as collateral in DeFi.',
  },
  'IBC Transfer': {
    name: 'IBC Transfer',
    description: 'Cross-chain asset transfer',
    context:
      'This is an Inter-Blockchain Communication (IBC) transfer — the standard protocol for moving assets between Cosmos-compatible blockchains. The user is bridging assets to or from Injective.',
  },
  Staking: {
    name: 'Staking',
    description: 'Native INJ staking',
    context:
      'This is a native Cosmos staking operation. The user is delegating INJ tokens to a validator node to earn staking rewards and participate in Injective governance. Staked tokens have an unbonding period of 21 days.',
  },
  Governance: {
    name: 'Governance',
    description: 'On-chain governance',
    context:
      'Injective uses on-chain governance for protocol upgrades and parameter changes. INJ holders vote on proposals, with voting power proportional to their staked INJ. Proposals require a minimum deposit to enter voting, and can be vetoed (burning deposits) if >33.4% of votes are NO WITH VETO.',
  },
  Unknown: {
    name: 'Unknown',
    description: 'Unknown protocol',
    context:
      'This interaction is with an unidentified smart contract on the Injective blockchain. The user is calling a contract function and may be providing funds.',
  },
};

// Decimal places per token denom
export const TOKEN_DECIMALS: Record<string, number> = {
  inj: 18,
  // Mito Finance vault LP / subscribed tokens
  'factory/inj1ng84mfnq4z4tuh0cd7a28x0hxw75vxcm70ls9q/HPNJ': 18,
  'factory/inj1vcqkkvqs7prqu70dpddfj7kqeqfdz5gg662qs3/lpinj1t2s9v7k55pkpjcqkm5ljdy5fmru3leur0u379q': 18,
  // Stablecoins
  'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7': 6,   // USDT
  'peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 6,   // USDC (legacy Peggy)
  'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a': 6,   // USDC (native)
  'peggy0x4c9EDD5852cd905f086C759E8383e09bff1E68B3': 18,   // USDe
  // ERC-20 bridged via Peggy (18 decimals unless noted)
  'peggy0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 18,  // WETH
  'peggy0x514910771AF9Ca656af840dff83E8264EcF986CA': 18,  // LINK
  'peggy0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': 18,  // AAVE
  'peggy0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1': 9,   // TON
  'peggy0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0': 18,  // MATIC
  'peggy0xc944E90C64B2c07662A292be6244BDf05Cda44a7': 18,  // GRT
  'peggy0x6B3595068778DD592e39A122f4f5a5cF09C90fE2': 18,  // SUSHI
  // IBC tokens
  'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9': 6,  // ATOM
  'ibc/A8B0B746B5AB736C2D8577259B510D56B8AF598008F68041E3D634BCDE72BE97': 9,   // SOL
  'ibc/8CF0E4184CA3105798EDB18CAA3981ADB16A9951FE9B05C6D830C746202747E1': 18,  // ARB
  'ibc/F51BB221BAA275F2EBF654F70B005627D7E713AFFD6D86AFD1E43CAA886149F4': 6,   // TIA
  'ibc/AC87717EA002B0123B10A05063E69BCA274BA2C44D842AEEB41558D2856DCE93': 18,  // stINJ
};

// Human-readable display names per denom
export const DENOM_DISPLAY: Record<string, string> = {
  inj: 'INJ',
  // Mito Finance vault LP / subscribed tokens
  'factory/inj1ng84mfnq4z4tuh0cd7a28x0hxw75vxcm70ls9q/HPNJ': 'HPNJ',
  'factory/inj1vcqkkvqs7prqu70dpddfj7kqeqfdz5gg662qs3/lpinj1t2s9v7k55pkpjcqkm5ljdy5fmru3leur0u379q': 'Mito-LP',
  'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7': 'USDT',
  'peggy0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48': 'USDC',
  'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a': 'USDC',
  'peggy0x4c9EDD5852cd905f086C759E8383e09bff1E68B3': 'USDe',
  'peggy0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2': 'WETH',
  'peggy0x514910771AF9Ca656af840dff83E8264EcF986CA': 'LINK',
  'peggy0x7Fc66500c84A76Ad7e9c93437bFc5Ac33E2DDaE9': 'AAVE',
  'peggy0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1': 'TON',
  'peggy0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0': 'MATIC',
  'peggy0xc944E90C64B2c07662A292be6244BDf05Cda44a7': 'GRT',
  'peggy0x6B3595068778DD592e39A122f4f5a5cF09C90fE2': 'SUSHI',
  'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9': 'ATOM',
  'ibc/A8B0B746B5AB736C2D8577259B510D56B8AF598008F68041E3D634BCDE72BE97': 'SOL',
  'ibc/8CF0E4184CA3105798EDB18CAA3981ADB16A9951FE9B05C6D830C746202747E1': 'ARB',
  'ibc/F51BB221BAA275F2EBF654F70B005627D7E713AFFD6D86AFD1E43CAA886149F4': 'TIA',
  'ibc/AC87717EA002B0123B10A05063E69BCA274BA2C44D842AEEB41558D2856DCE93': 'stINJ',
};

export const ACTION_LABELS: Record<string, string> = {
  '/injective.exchange.v1beta1.MsgPrivilegedExecuteContract': 'Vault Interaction',
  '/cosmos.bank.v1beta1.MsgSend': 'Token Transfer',
  '/cosmos.bank.v1beta1.MsgMultiSend': 'Multi-Send',
  '/injective.exchange.v1beta1.MsgCreateSpotLimitOrder': 'Spot Limit Order',
  '/injective.exchange.v1beta1.MsgCreateSpotMarketOrder': 'Spot Swap',
  '/injective.exchange.v1beta1.MsgBatchUpdateOrders': 'Batch Order Update',
  '/injective.exchange.v1beta1.MsgCreateDerivativeLimitOrder': 'Open Derivatives Position',
  '/injective.exchange.v1beta1.MsgCreateDerivativeMarketOrder': 'Market Derivatives Trade',
  '/injective.exchange.v1beta1.MsgCancelSpotOrder': 'Cancel Spot Order',
  '/injective.exchange.v1beta1.MsgCancelDerivativeOrder': 'Cancel Derivatives Order',
  '/injective.exchange.v1beta1.MsgBatchCancelSpotOrders': 'Batch Cancel Orders',
  '/injective.exchange.v1beta1.MsgDeposit': 'Exchange Deposit',
  '/injective.exchange.v1beta1.MsgWithdraw': 'Exchange Withdrawal',
  '/cosmos.staking.v1beta1.MsgDelegate': 'Stake INJ',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'Redelegate Stake',
  '/cosmos.staking.v1beta1.MsgUndelegate': 'Unstake INJ',
  '/ibc.applications.transfer.v1.MsgTransfer': 'IBC Transfer',
  '/cosmwasm.wasm.v1.MsgExecuteContract': 'Smart Contract Call',
  '/injective.wasmx.v1.MsgExecuteContractCompat': 'Smart Contract Call',
  '/cosmos.gov.v1beta1.MsgVote': 'Governance Vote',
  '/cosmos.gov.v1.MsgVote': 'Governance Vote',
  '/cosmos.gov.v1beta1.MsgSubmitProposal': 'Submit Governance Proposal',
  '/cosmos.gov.v1.MsgSubmitProposal': 'Submit Governance Proposal',
  '/cosmos.gov.v1beta1.MsgDeposit': 'Governance Deposit',
  '/cosmos.gov.v1.MsgDeposit': 'Governance Deposit',
};
