export type ProtocolName =
  | 'Helix'
  | 'Mito Finance'
  | 'Hydro Protocol'
  | 'DojoSwap'
  | 'Neptune Finance'
  | 'Black Panther'
  | 'Choice Exchange'
  | 'Paradyze'
  | 'Talis Protocol'
  | 'SPACE ID'
  | 'SGT'
  | 'Skip'
  | 'Injective Hub'
  | 'IBC Transfer'
  | 'Staking'
  | 'Governance'
  | 'Unknown';

export interface Protocol {
  name: ProtocolName;
  description: string;
  context: string;
  /** Official app/site URL. Omitted for chain primitives and on-chain-only identified protocols. */
  website?: string;
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
  // v2 exchange module message types (same protocol mapping)
  '/injective.exchange.v2.MsgCreateSpotLimitOrder': 'Helix',
  '/injective.exchange.v2.MsgCreateSpotMarketOrder': 'Helix',
  '/injective.exchange.v2.MsgBatchUpdateOrders': 'Helix',
  '/injective.exchange.v2.MsgCreateDerivativeLimitOrder': 'Helix',
  '/injective.exchange.v2.MsgCreateDerivativeMarketOrder': 'Helix',
  '/injective.exchange.v2.MsgCancelSpotOrder': 'Helix',
  '/injective.exchange.v2.MsgCancelDerivativeOrder': 'Helix',
  '/injective.exchange.v2.MsgBatchCancelSpotOrders': 'Helix',
  '/injective.exchange.v2.MsgBatchCancelDerivativeOrders': 'Helix',
  '/injective.exchange.v2.MsgDeposit': 'Helix',
  '/injective.exchange.v2.MsgWithdraw': 'Helix',
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
  'inj1vswsdqx5clnxv9vvlv4kuvjwtqty92mtyarw4t': 'Mito Finance', // Mito Staking Allocator v1
  'inj1j5mr2hmv7y2z7trazganj75u8km8jvdfuxncsp': 'Mito Finance', // Mito Swap Contract
  // Mito Finance vault contracts (MsgPrivilegedExecuteContract path — contract_address field)
  'inj1vcqkkvqs7prqu70dpddfj7kqeqfdz5gg662qs3': 'Mito Finance', // Mito Master 1
  // Mito Finance LP staking / incentive contracts
  'inj1gtze7qm07nky47n7mwgj4zatf2s77xqvh3k2n8': 'Mito Finance',
  // Hydro Protocol (hINJ liquid staking)
  'inj18luqttqyckgpddndh8hvaq25d5nfwjc78m56lc': 'Hydro Protocol', // Hydro hINJ
  'inj1enyu3agzphq3k935lkxeynq6rq03d9ys0fehr9': 'Hydro Protocol', // Hydro price-manager
  'inj1nuw6ala2ra7t457tg4g04k67r94v55mdyq9klr': 'Hydro Protocol', // Hydro lending-vault
  // Hydro Protocol — additional live contracts (on-chain wasm labels)
  'inj1uq9spcnum8z2lz54tzrsx99e4hdywsqxvxwa4a': 'Hydro Protocol', // Hydro LSD reward
  'inj1cq3rfmdf3y498fchl237wgjarqs99tjf433phw': 'Hydro Protocol', // Hydro LSD
  'inj17w07xu2qqlsrjvupd8t6pwenuuvzrs8ymmqxqw': 'Hydro Protocol', // Hydro Farm
  'inj1j3w4490vv6y7eshfj3mt3wekmns4rz2m0scgnt': 'Hydro Protocol', // Hydro dojo-pair swap proxy
  'inj1a2klvlxa3ax0sh7ym9grv96ckmane89mkc4m37': 'Hydro Protocol', // Hydro lending-vault (core)
  'inj1tqugp3fmsccqunquuyf9sqgx703m48an9g549l': 'Hydro Protocol', // Hydro liquidator
  'inj1h9g2nf4sqdcnk3947w4tle6fmxwap5w70kzpj6': 'Hydro Protocol', // Hydro Governance
  'inj1s6cm7x5lwusj9yrkkxtkv304qqku4vng5ccule': 'Hydro Protocol', // Hydro xINJ vault-share token (label "campaign"; init names Hydro)
  'inj1yjmayxadndc90wfp3dr2qg5dm6zddsykkvjwc3': 'Hydro Protocol', // Hydro incentive
  'inj1uezlz9qmyznzcqps8zht6tswuh9nq2lhje96l9': 'Hydro Protocol', // Hydro lsd-proxy
  'inj1qc2tw477wwuvkad0h3g78xqgwx4k8knat6vz0h': 'Hydro Protocol', // xHDRO staking token
  'inj1r8lc3dfxqxs65rkng70ngvgdr8myvu9y7q2pru': 'Hydro Protocol', // Hydro Swap (admin = HDRO token-factory deployer)
  // Helix atomic swap router (MsgExecuteContractCompat path)
  'inj12yj3mtjarujkhcp6lg3klxjjfrx2v7v8yswgp9': 'Helix',
  // DojoSwap AMM DEX contracts (source: docs.dojo.trading/resources/contract-addresses)
  'inj1t6g03pmc0qcgr7z44qjzaen804f924xke6menl': 'DojoSwap', // Swap Router
  'inj1pc2vxcmnyzawnwkf03n2ggvt997avtuwagqngk': 'DojoSwap', // Factory
  'inj19rutrad95wzcw93gfnuranetmc570cvtj8j8cg': 'DojoSwap', // DOJO-INJ LP Staking
  'inj1yqtcds4gpvhcdlpjh9u45xjx9lxwame7fa265x': 'DojoSwap', // SUSHI-DOJO LP Staking
  'inj1ycnddgnj49lntk3z5ky8pj0rpvhkvggmyjsmv7': 'DojoSwap', // DOJO-dINJ LP Staking
  'inj1zdj9kqnknztl2xclm5ssv25yre09f8908d4923': 'DojoSwap', // Dojoswap Deployment (high-volume)
  'inj1p0vntlcq7t3uksx56dny7wn334vrtpuwcj884z': 'DojoSwap', // Dojoswap Deployment
  // Neptune Finance money market contracts (source: docs.nept.finance/develop/contracts)
  'inj1nc7gjkf2mhp34a6gquhurg8qahnw5kxs5u3s4u': 'Neptune Finance', // Red Bank (lending/borrowing)
  'inj1ftech0pdjrjawltgejlmpx57cyhsz6frdx2dhq': 'Neptune Finance', // Interest Rate Model
  'inj1kfjff5f0xjy7gece36watkqtscpycv666tqq7t': 'Neptune Finance', // Querier
  // Neptune nToken receipt contracts (issued to lenders)
  'inj1tkuemghm734h9qy8fh2eu0qp9hyfdlws0llt8g': 'Neptune Finance', // nAUSD
  'inj1rmzufd7h09sqfrre5dtvu5d09ta7c0t4jzkr2f': 'Neptune Finance', // nINJ
  'inj1zcwr03uqw57g88nqvgpwfkazwutpqz9kplny4s': 'Neptune Finance', // nSOL
  'inj1fzquxxxam59z6fzewy2hvvreeh3m04x83zg4vv': 'Neptune Finance', // nTIA
  'inj1dafy7fv7qczzatd98dv8hekx6ssckrflswpjaz': 'Neptune Finance', // nUSDC
  'inj1cy9hes20vww2yr6crvs75gxy5hpycya2hmjg9s': 'Neptune Finance', // nUSDT
  'inj1kehk5nvreklhylx22p3x0yjydfsz9fv3fvg5xt': 'Neptune Finance', // nWETH
  'inj16jf4qkcarp3lan4wl2qkrelf4kduvvujwg0780': 'Neptune Finance', // nATOM
  'inj1v3a4zznudwpukpr8y987pu5gnh4xuf7v36jhva': 'Neptune Finance', // neptune-token
  // Black Panther vault platform (source: defillama.com/protocol/black-panther)
  // Note: individual vault contracts are dynamically created; add here as discovered
  'inj16eckaf75gcu9uxdglyvmh63k9t0l7chd0qmu85': 'Black Panther', // BLACK governance token
  'inj1ja2z7lhtpq7myj9vv936euwepzw9hppd2fd5t0': 'Black Panther', // Black Panther Staking
  // Choice Exchange AMM DEX & aggregator (source: github.com/choice-exchange/choice_exchange README)
  'inj1k9lcqtn3y92h4t3tdsu7z8qx292mhxhgsssmxg': 'Choice Exchange', // Factory
  'inj1ne2durmsx2jurvy4wgnhegv3xt6789up8xgum3': 'Choice Exchange', // Router
  'inj1a4qvqym6ajewepa7v8y2rtxuz9f92kyq2zsg26': 'Choice Exchange', // Aggregation contract (multi-path routing)
  'inj14ejqjyq8um4p3xfqj74yld5waqljf88f9eneuk': 'Choice Exchange', // CW20 adapter
  'inj1yr7srge0lku4h3gd473qdlpdfw63ejdjwkh4c0': 'Choice Exchange', // Burn manager
  // Choice Exchange — additional live contracts (on-chain wasm labels)
  'inj1520rsss9aykhkfmuf89nh5hp2jww770z4u3eu0': 'Choice Exchange', // Choice DEX Aggregator v2.0
  'inj1eag2kjzs5ma5sflxvlhaacdxxpvdjg4ny7yg3g': 'Choice Exchange', // Choice CLMM Manager
  'inj1aqnqtuzh75de4egd06ep83g0udt7njxljznevc': 'Choice Exchange', // Choice Farm #5
  'inj1p8kx2gjatfvwkksx3afm7uapj4mja4vutuyj8m': 'Choice Exchange', // Choice Farm #3
  'inj1g4hlcmp4s0k0tm4tj07j87ela9u2qefzahcsns': 'Choice Exchange', // Choice Farm #1
  'inj16y888zlql6mdendn2qtzjdjg4wplycrjaqzcnr': 'Choice Exchange', // Choice Farm #6
  // SPACE ID — .inj naming service (source: on-chain wasm labels + init registry_address link)
  'inj1x9m0hceug9qylcyrrtwqtytslv2jrph433thgu': 'SPACE ID', // SPACEID Resolver
  'inj1hm8vs8sr2h9nk0x66vctfs528wrp6k3gtgg275': 'SPACE ID', // SPACEID Registry
  'inj1s65um0a0lt9u9w3xfqnqn3w9k97ykpacr3dd96': 'SPACE ID', // SPACEID Controller (register/renew)
  'inj1svrv85wmeryc6523kgwnmzttz93vj6ua3g29t8': 'SPACE ID', // SPACEID Base registrar
  // Paradyze: AI-powered trading terminal on Injective using native exchange module
  // No CosmWasm contracts — add here if on-chain vault/prediction contracts are deployed
  // Talis Protocol — NFT Marketplace (source: on-chain contract labels via Injective LCD)
  'inj1l9nh9wv24fktjvclc4zgrgyzees7rwdtx45f54': 'Talis Protocol', // Fixed-price marketplace (label: "Talis marketplace", code 1101)
  'inj16naevyffqm33znyf5aky86z8s09zvpyg8u8vtl': 'Talis Protocol', // English auction (label: "Talis english auction", code 1100)
  'inj1u2l88u94h056z7lz0vkksxgwkdwn35x23r5dg8': 'Talis Protocol', // P2P escrow (label: "Talis P2P escrow", code 1102)
  'inj1gwutptfmlxd7netk5jw58zcqux00jx2pas73p9': 'Talis Protocol', // Offers v1 (label: "Talis offers", code 79)
  'inj1u30yff9df5mu0rcp3jtr5wv5j8069asdl9ywl7': 'Talis Protocol', // Offers v2 (label: "Talis offers", code 79)
  'inj1v77y5ttah96dc9qkcpc88ad7rce8n88e99t3m5': 'Talis Protocol', // Talis offers (primary, high-volume)
  'inj1r6pvt7d3eqtc9e2h7mcv6l8smq3847jqd6sffn': 'Talis Protocol', // Talis revenue share
  // SGT — on-chain spot market-making pools (source: shared deployer inj1w64pxul…, market_id in init)
  'inj195l0hketpha2x2zahckfhlchlkrwckxd74030v': 'SGT', // SGT stINJ/INJ pool
  'inj1dxvlc5snn5y02nn82xdhnvwj3y09t9pnh6msf5': 'SGT', // SGT hINJ/INJ pool
  'inj1dx8kuevhq7m7g9a2e4es83ps62htr5g3y7azgr': 'SGT', // SGT SOL/USDC pool
  'inj1t4l7q6y7uzjjufxgcyr6hdugslphdqzqqt8u9x': 'SGT', // SGT referrals (same deployer)
  // Skip — cross-chain swap router (source: init swap_venues astroport/hallswap/native)
  'inj1l62elesw6lw9w5ctqpwv0apkeghppr5d2mdqwh': 'Skip', // Skip Swap Entry Point
  // Injective Hub — Community BuyBack program
  'inj10n78w79xhxmytnuhjcck633nj4e7hrqaglgnfz': 'Injective Hub',
};

// Injective Hub — Community BuyBack pool contract
export const BUYBACK_CONTRACTS = new Set<string>([
  'inj10n78w79xhxmytnuhjcck633nj4e7hrqaglgnfz',
]);

// Talis Protocol marketplace contracts — used to detect NFT listing via send_nft in normalizer
export const TALIS_MARKETPLACE_CONTRACTS = new Set<string>([
  'inj1l9nh9wv24fktjvclc4zgrgyzees7rwdtx45f54', // fixed-price marketplace
  'inj16naevyffqm33znyf5aky86z8s09zvpyg8u8vtl', // english auction
  'inj1u2l88u94h056z7lz0vkksxgwkdwn35x23r5dg8', // P2P escrow
]);

// Talis Protocol offers contracts
export const TALIS_OFFERS_CONTRACTS = new Set<string>([
  'inj1gwutptfmlxd7netk5jw58zcqux00jx2pas73p9',
  'inj1u30yff9df5mu0rcp3jtr5wv5j8069asdl9ywl7',
]);

export const PROTOCOL_CONTEXTS: Record<ProtocolName, Protocol> = {
  Helix: {
    name: 'Helix',
    website: 'https://helixapp.com',
    description: 'On-chain DEX with native orderbook',
    context:
      'Helix is the premier on-chain orderbook DEX on Injective. When a user "swaps", they are technically placing a market order that is instantly matched on the native orderbook. Interactions also include limit orders, order cancellations, and perpetuals trading.',
  },
  'Mito Finance': {
    name: 'Mito Finance',
    website: 'https://mito.fi',
    description: 'Automated yield vaults',
    context:
      'Mito Finance is an automated trading vault platform on Injective. When a user deposits, they are providing liquidity to an algorithmic strategy and receive LP tokens representing their share. These LP tokens earn real yield from trading fees.',
  },
  'Hydro Protocol': {
    name: 'Hydro Protocol',
    website: 'https://hydroprotocol.finance',
    description: 'Liquid staking (hINJ)',
    context:
      'Hydro Protocol is the liquid staking protocol on Injective. Users stake INJ and receive hINJ (liquid staking tokens) at a 1:1 ratio. hINJ earns staking rewards while remaining usable as collateral in DeFi.',
  },
  'DojoSwap': {
    name: 'DojoSwap',
    website: 'https://dojo.trading',
    description: 'AMM DEX on Injective',
    context:
      'DojoSwap is an automated market maker (AMM) DEX on Injective. Unlike Helix\'s native orderbook, DojoSwap uses constant-product liquidity pools where users swap tokens or provide liquidity to earn trading fees. DOJO is the protocol\'s governance and rewards token.',
  },
  'Neptune Finance': {
    name: 'Neptune Finance',
    website: 'https://nept.finance',
    description: 'Lending & borrowing protocol',
    context:
      'Neptune Finance is a decentralized money market on Injective. Users lend assets to earn yield and receive nTokens (receipt tokens such as nINJ, nUSDT) representing their deposit plus accrued interest. Borrowers post collateral and pay variable interest rates that adjust automatically with pool utilization. The Red Bank contract is the core lending and liquidation engine.',
  },
  'Black Panther': {
    name: 'Black Panther',
    website: 'https://blackpanther.fi',
    description: 'Algorithmic trading vaults',
    context:
      'Black Panther Finance offers automated trading vaults on Injective with strategies including grid trading, market-making, and trend-following — all executing on Helix\'s native orderbook. Users deposit assets into a vault and earn yield from the algorithmic strategy without managing orders manually. BLACK is the protocol\'s governance token.',
  },
  'Choice Exchange': {
    name: 'Choice Exchange',
    website: 'https://choice.exchange',
    description: 'AMM DEX and swap aggregator',
    context:
      'Choice Exchange is an AMM DEX and aggregation layer on Injective, forked from Terraswap. It routes swaps across multiple liquidity sources using a DAG-based multi-path algorithm to minimize slippage. Users can also provide liquidity to earn trading fees, stake LP tokens on farms, and deposit into auto-compounding vaults. The aggregation contract splits orders across parallel paths for optimal execution.',
  },
  'Paradyze': {
    name: 'Paradyze',
    website: 'https://paradyze.io',
    description: 'AI-powered trading terminal',
    context:
      'Paradyze is an AI-powered trading terminal on Injective — "Your On-Chain Wallstreet." Users execute spot and perpetuals trades through natural language commands ("Buy 10 INJ", "short BTC with 5x leverage"). The platform also features ranked head-to-head trading battles and autonomous AI agents for 24/7 strategy execution. Paradyze routes orders through Injective\'s native exchange module.',
  },
  'Talis Protocol': {
    name: 'Talis Protocol',
    website: 'https://talis.art',
    description: 'NFT Marketplace on Injective',
    context:
      'Talis Protocol is the leading NFT marketplace on Injective — the first to launch on mainnet (June 2023). Users can buy, sell, mint, and trade NFTs using INJ and other Injective-native tokens. NFT collections use the CW721 standard. Key actions: fixed-price listings (via send_nft to marketplace), direct purchases, collection and individual offers, and randomized mints (CandyMachine). TALIS is the protocol\'s governance and fee-distribution token. Over 140,000 wallets registered and 200,000+ INJ transacted.',
  },
  'SPACE ID': {
    name: 'SPACE ID',
    website: 'https://space.id',
    description: 'Web3 naming service (.inj domains)',
    context:
      'SPACE ID is the naming service on Injective — it maps human-readable .inj domains to wallet addresses. The registry contract stores ownership records and the resolver contract answers name lookups. Interactions typically mean registering, renewing, or updating a domain, or setting a primary name.',
  },
  SGT: {
    name: 'SGT',
    description: 'On-chain spot market-making pools',
    context:
      'SGT runs a set of on-chain spot liquidity pools on Injective (stINJ/INJ, hINJ/INJ, SOL/USDC and others), each bound to a native exchange market and quoting both sides as an automated market-maker vault. Interactions are typically deposits into or withdrawals from a pool, and the protocol also runs a referrals contract. Identified from a shared deployer and market-bound init parameters rather than a public brand page, so treat the naming as the on-chain label.',
  },
  Skip: {
    name: 'Skip',
    website: 'https://skip.build',
    description: 'Cross-chain swap router',
    context:
      'Skip (the Skip Go / Skip API swap entry point) is a routing layer that executes swaps across multiple venues from a single call — its on-chain configuration lists Astroport, Hallswap and Injective-native as swap venues. Interactions mean routing a swap through one of those venues via the entry-point contract.',
  },
  'Injective Hub': {
    name: 'Injective Hub',
    website: 'https://hub.injective.network',
    description: 'INJ Community BuyBack program',
    context:
      'Injective Hub hosts the INJ Community BuyBack — a monthly on-chain event where participants commit INJ tokens that are permanently burned (removed from circulating supply forever). In return, each participant receives a pro-rata share of Injective ecosystem revenue (trading fees, liquidations, oracle fees, etc.) proportional to their committed amount versus the total INJ committed in that round. Slot eligibility favors active stakers and on-chain participants and is randomized to prevent bots. Historically, completed rounds have distributed revenue equivalent to 20%+ APY on committed INJ. Rewards are distributed automatically on-chain after each round closes — no manual claiming required.',
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
  // v2 exchange module action labels (same human-readable names)
  '/injective.exchange.v2.MsgCreateSpotLimitOrder': 'Spot Limit Order',
  '/injective.exchange.v2.MsgCreateSpotMarketOrder': 'Spot Swap',
  '/injective.exchange.v2.MsgBatchUpdateOrders': 'Batch Order Update',
  '/injective.exchange.v2.MsgCreateDerivativeLimitOrder': 'Open Derivatives Position',
  '/injective.exchange.v2.MsgCreateDerivativeMarketOrder': 'Market Derivatives Trade',
  '/injective.exchange.v2.MsgCancelSpotOrder': 'Cancel Spot Order',
  '/injective.exchange.v2.MsgCancelDerivativeOrder': 'Cancel Derivatives Order',
  '/injective.exchange.v2.MsgBatchCancelSpotOrders': 'Batch Cancel Orders',
  '/injective.exchange.v2.MsgBatchCancelDerivativeOrders': 'Batch Cancel Orders',
  '/injective.exchange.v2.MsgDeposit': 'Exchange Deposit',
  '/injective.exchange.v2.MsgWithdraw': 'Exchange Withdrawal',
  '/cosmos.staking.v1beta1.MsgDelegate': 'Stake INJ',
  '/cosmos.staking.v1beta1.MsgBeginRedelegate': 'Redelegate Stake',
  '/cosmos.staking.v1beta1.MsgUndelegate': 'Unstake INJ',
  '/cosmos.staking.v1beta1.MsgCancelUnbondingDelegation': 'Cancel Unstake',
  '/ibc.applications.transfer.v1.MsgTransfer': 'IBC Transfer',
  '/cosmwasm.wasm.v1.MsgExecuteContract': 'Smart Contract Call',
  '/injective.wasmx.v1.MsgExecuteContractCompat': 'Smart Contract Call',
  '/cosmos.gov.v1beta1.MsgVote': 'Governance Vote',
  '/cosmos.gov.v1.MsgVote': 'Governance Vote',
  '/cosmos.gov.v1beta1.MsgSubmitProposal': 'Submit Governance Proposal',
  '/cosmos.gov.v1.MsgSubmitProposal': 'Submit Governance Proposal',
  '/cosmos.gov.v1beta1.MsgDeposit': 'Governance Deposit',
  '/cosmos.gov.v1.MsgDeposit': 'Governance Deposit',
  '/cosmos.distribution.v1beta1.MsgWithdrawDelegatorReward': 'Claim Staking Rewards',
  '/cosmos.distribution.v1beta1.MsgWithdrawValidatorCommission': 'Claim Validator Commission',
  '/cosmos.distribution.v1beta1.MsgSetWithdrawAddress': 'Set Reward Address',
  '/cosmos.authz.v1beta1.MsgExec': 'Authorized Action',
  '/cosmos.authz.v1beta1.MsgGrant': 'Grant Authorization',
  '/cosmos.authz.v1beta1.MsgRevoke': 'Revoke Authorization',
};
