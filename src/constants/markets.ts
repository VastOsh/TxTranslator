// Helix spot market registry — sourced from /injective/exchange/v1beta1/spot/markets
// Key: lowercase market_id hex string

export interface HelixMarket {
  ticker: string;
  baseSymbol: string;
  quoteSymbol: string;
  baseDenom: string;
  quoteDenom: string;
}

// Helix CosmWasm router contracts — used to identify swaps via MsgExecuteContract(Compat)
export const HELIX_ROUTER_CONTRACTS = new Set<string>([
  'inj12yj3mtjarujkhcp6lg3klxjjfrx2v7v8yswgp9', // atomic swap router
]);

export const HELIX_MARKETS: Record<string, HelixMarket> = {
  // ── INJ pairs ──
  '0xa508cb32923323679f29a032c70342c147c17d0145625922b0ef22e955c844c0': {
    ticker: 'INJ/USDT', baseSymbol: 'INJ', quoteSymbol: 'USDT',
    baseDenom: 'inj',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  '0xa8c14f892f7f7d2516442220a05b652d5afee3f57a5495981dfad7c99ef78e84': {
    ticker: 'INJ/USDC', baseSymbol: 'INJ', quoteSymbol: 'USDC',
    baseDenom: 'inj',
    quoteDenom: 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
  },
  // ── WETH pairs ──
  '0xd1956e20d74eeb1febe31cd37060781ff1cb266f49e0512b446a5fafa9a16034': {
    ticker: 'WETH/USDT', baseSymbol: 'WETH', quoteSymbol: 'USDT',
    baseDenom: 'peggy0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  '0x3e99b4180237f552a793a6b973fafc655c386afebe5b254109c864b80e31abcb': {
    ticker: 'WETH/USDC', baseSymbol: 'WETH', quoteSymbol: 'USDC',
    baseDenom: 'peggy0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
    quoteDenom: 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
  },
  // ── SOL pairs ──
  '0xd9089235d2c1b07261cbb2071f4f5a7f92fa1eca940e3cad88bb671c288a972f': {
    ticker: 'SOL/USDT', baseSymbol: 'SOL', quoteSymbol: 'USDT',
    baseDenom: 'ibc/A8B0B746B5AB736C2D8577259B510D56B8AF598008F68041E3D634BCDE72BE97',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  '0x2b8d00cd254c8fbd16427301305dcfc03d6769f862ae8e150b52171d879fca98': {
    ticker: 'SOL/USDC', baseSymbol: 'SOL', quoteSymbol: 'USDC',
    baseDenom: 'ibc/A8B0B746B5AB736C2D8577259B510D56B8AF598008F68041E3D634BCDE72BE97',
    quoteDenom: 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
  },
  // ── ATOM pairs ──
  '0x0511ddc4e6586f3bfe1acb2dd905f8b8a82c97e1edaef654b12ca7e6031ca0fa': {
    ticker: 'ATOM/USDT', baseSymbol: 'ATOM', quoteSymbol: 'USDT',
    baseDenom: 'ibc/C4CFF46FD6DE35CA4CF4CE031E643C8FDC9BA4B99AE598E9B0ED98FE3A2319F9',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // ── TIA pairs ──
  '0x35fd4fa9291ea68ce5eef6e0ea8567c7744c1891c2059ef08580ba2e7a31f101': {
    ticker: 'TIA/USDT', baseSymbol: 'TIA', quoteSymbol: 'USDT',
    baseDenom: 'ibc/F51BB221BAA275F2EBF654F70B005627D7E713AFFD6D86AFD1E43CAA886149F4',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // ── ARB pairs ──
  '0x1c2e5b1b4b1269ff893b4817a478fba6095a89a3e5ce0cccfcafa72b3941eeb6': {
    ticker: 'ARB/USDT', baseSymbol: 'ARB', quoteSymbol: 'USDT',
    baseDenom: 'ibc/8CF0E4184CA3105798EDB18CAA3981ADB16A9951FE9B05C6D830C746202747E1',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // ── LINK pairs ──
  '0x26413a70c9b78a495023e5ab8003c9cf963ef963f6755f8b57255feb5744bf31': {
    ticker: 'LINK/USDT', baseSymbol: 'LINK', quoteSymbol: 'USDT',
    baseDenom: 'peggy0x514910771AF9Ca656af840dff83E8264EcF986CA',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // ── TON pairs ──
  '0x165b41ab4410c03514b4569b29dd3c4a829f6f11516a29cd31d6a53308cb4ed0': {
    ticker: 'TON/USDT', baseSymbol: 'TON', quoteSymbol: 'USDT',
    baseDenom: 'peggy0x582d872A1B094FC48F5DE31D3B73F2D9bE47def1',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // ── Stablecoin pairs ──
  '0x5efdcc4b3a949b3fc78c8c2055d1e46f8a6fe8130627012554047fb3a511345b': {
    ticker: 'USDC/USDT', baseSymbol: 'USDC', quoteSymbol: 'USDT',
    baseDenom: 'erc20:0xa00C59fF5a080D2b954d0c75e46E22a0c371235a',
    quoteDenom: 'peggy0xdAC17F958D2ee523a2206206994597C13D831ec7',
  },
  // ── Liquid staking pairs ──
  '0x1b1e062b3306f26ae3af3c354a10c1cf38b00dcb42917f038ba3fc14978b1dd8': {
    ticker: 'hINJ/INJ', baseSymbol: 'hINJ', quoteSymbol: 'INJ',
    baseDenom: 'factory/inj14ejqjyq8um4p3xfqj74yld5waqljf88f9eneuk/inj18luqttqyckgpddndh8hvaq25d5nfwjc78m56lc',
    quoteDenom: 'inj',
  },
  '0xce1829d4942ed939580e72e66fd8be3502396fc840b6d12b2d676bdb86542363': {
    ticker: 'stINJ/INJ', baseSymbol: 'stINJ', quoteSymbol: 'INJ',
    baseDenom: 'ibc/AC87717EA002B0123B10A05063E69BCA274BA2C44D842AEEB41558D2856DCE93',
    quoteDenom: 'inj',
  },
};
