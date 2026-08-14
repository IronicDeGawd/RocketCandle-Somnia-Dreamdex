/**
 * The bits of DreamDEX the game talks to directly.
 *
 * Only what is actually used, with the addresses and selectors confirmed
 * against a live testnet run rather than copied hopefully from docs.
 */

/**
 * The address that stands in for the chain's own coin.
 *
 * On the SOMI pool the base side is native and has no token contract, so this
 * sentinel is used in its place. Knowing which markets are native matters:
 * their orders cost far more gas.
 */
export const NATIVE_SENTINEL =
  "0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00" as const;

/** Every market quotes in USDso, and it has 18 decimals on every pool. */
export const USDSO_ADDRESS =
  "0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171" as const;

/**
 * Where operator permissions are recorded, per network.
 *
 * The pool asks this registry, per function, whether a hot key may act for an
 * owner. Revoking here stops the key immediately - no waiting, no redeploy.
 *
 * Keyed by network deliberately. Pointing at the wrong one does not fail: the
 * transaction mines, costs gas, emits nothing and changes nothing, and the
 * first sign of trouble is orders being refused for no visible reason. Caught
 * exactly that way during testing, with the mainnet address used on testnet.
 */
export const OPERATOR_REGISTRY_BY_CHAIN: Record<number, `0x${string}`> = {
  5031: "0xE7a190736B6024a4DbafadC04E283075877005ce", // Somnia mainnet
  50312: "0x15C7e8CE38F021c5b45d098AaD788f63090bF20A", // Shannon testnet
};

/** The registry for the chain the game is configured against. */
export function operatorRegistryFor(chainId: number): `0x${string}` {
  const registry = OPERATOR_REGISTRY_BY_CHAIN[chainId];
  if (!registry) {
    throw new Error(`No operator registry known for chain ${chainId}`);
  }
  return registry;
}

/**
 * The two things a game's hot key is ever allowed to do.
 *
 * Placing and cancelling, and nothing else. Depositing, withdrawing and
 * approving are owner-only at the contract level, which is what makes handing
 * a browser a trading key safe.
 */
export const OPERATOR_SELECTORS = {
  placeOrderFor: "0x80054449",
  cancelOrderFor: "0xe37b444b",
} as const;

export const OPERATOR_REGISTRY_ABI = [
  {
    type: "function",
    name: "setOperatorApprovalForPool",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "operator", type: "address" },
      { name: "selectors", type: "bytes4[]" },
      { name: "approved", type: "bool" },
    ],
    outputs: [],
  },
] as const;

export const SPOT_POOL_ABI = [
  {
    type: "function",
    name: "setManualVaultMode",
    stateMutability: "nonpayable",
    inputs: [{ name: "enabled", type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isOperatorAuthorized",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "operator", type: "address" },
      { name: "selector", type: "bytes4" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
] as const;

export const ERC20_ABI = [
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

/** Where to ask for market metadata and prices. */
export const DREAMDEX_REST = {
  testnet: "https://stg.api.dreamdex.io/v0",
  mainnet: "https://api.dreamdex.io/v0",
} as const;

export interface MarketMeta {
  symbol: string;
  pool: `0x${string}`;
  /**
   * Where conditional orders for this market live.
   *
   * A separate contract per market, published by the API rather than assumed.
   * Absent on any market that has no registry deployed, so callers must treat
   * a missing one as "stops unavailable here" instead of a bug.
   */
  stopRegistry: `0x${string}` | null;
  /**
   * The base side's address, as the exchange records it.
   *
   * Kept because the vault holds base and quote separately: after a buy, the
   * money is base, and reading only the quote side makes a funded account look
   * empty. Native markets use the sentinel address, which is what the pool
   * itself keys the balance by.
   */
  base: `0x${string}`;
  /** True when the base side is the chain's own coin rather than a token. */
  baseIsNative: boolean;
  baseDecimals: number;
  quoteDecimals: number;
  minQuantity: string;
  lotSize: string;
  tickSize: string;
}

/**
 * Look up a market's pool address and trading limits.
 *
 * Always fetched, never hard-coded: pool addresses move between deployments,
 * and a stale one silently sends orders nowhere. The response has been seen in
 * two shapes, so both are handled.
 *
 * @param symbol e.g. "SOMI:USDso"
 * @param network which DreamDEX to ask
 */
export async function fetchMarket(
  symbol: string,
  network: keyof typeof DREAMDEX_REST = "testnet"
): Promise<MarketMeta | null> {
  const response = await fetch(`${DREAMDEX_REST[network]}/markets`);
  if (!response.ok) return null;

  const payload = await response.json();
  const markets = Array.isArray(payload) ? payload : payload?.markets;
  if (!Array.isArray(markets)) return null;

  const market = markets.find(
    (m: { symbol?: string }) => m.symbol === symbol
  );
  if (!market) return null;

  return {
    symbol: market.symbol,
    pool: market.contract,
    stopRegistry: market.stopRegistry ?? null,
    base: market.base as `0x${string}`,
    baseIsNative:
      String(market.base).toLowerCase() === NATIVE_SENTINEL.toLowerCase(),
    baseDecimals: Number(market.baseDecimals),
    quoteDecimals: Number(market.quoteDecimals),
    minQuantity: String(market.minQuantity),
    lotSize: String(market.lotSize),
    tickSize: String(market.tickSize),
  };
}
