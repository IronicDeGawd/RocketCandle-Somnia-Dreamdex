import {
  createPublicClient,
  createWalletClient,
  http,
  parseUnits,
  formatUnits,
  zeroAddress,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaNetwork } from "@/lib/wagmi";
import type { MarketMeta } from "@/lib/dreamdex";

/**
 * Placing orders from the browser with the session key.
 *
 * Every guard here exists because breaking it fails *silently*: the
 * transaction mines, gas is spent, and nothing happens. Those are the worst
 * bugs to chase, so each one is checked before anything is broadcast.
 */

export const ORDER_TYPE = {
  Normal: 0,
  FillOrKill: 1,
  /** Fill what you can now, cancel the rest. What a game wants. */
  ImmediateOrCancel: 2,
  PostOnly: 3,
} as const;

const SELF_MATCH_CANCEL_TAKER = 0;

/** Emitted when an order is really accepted. No log means it was rejected. */
const ORDER_PLACED_TOPIC =
  "0xd90f62f61ee2f606b132cfdfd883ddd079228b6fd6bffd9d7cf848daf824639d";

/**
 * Gas floors, and why they are this high.
 *
 * Buying a market whose base side is the chain's own coin has to pay the coin
 * out to the buyer, and that path reverts unless it is given a lot of room.
 * Learned the hard way: a simulation said the order was fine, the transaction
 * mined anyway with status 0, and the receipt showed it had used every unit of
 * an 887k limit. Estimation cannot be trusted here either, because it can
 * revert on the same guard.
 */
const GAS_FLOOR_TOKEN = 700_000n;
const GAS_FLOOR_NATIVE_SELL = 2_000_000n;
const GAS_FLOOR_NATIVE_BUY = 5_000_000n;

function gasFloorFor(baseIsNative: boolean, isBid: boolean): bigint {
  if (!baseIsNative) return GAS_FLOOR_TOKEN;
  return isBid ? GAS_FLOOR_NATIVE_BUY : GAS_FLOOR_NATIVE_SELL;
}

export const TRADING_POOL_ABI = [
  {
    type: "function",
    name: "placeOrderFor",
    stateMutability: "payable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "isBid", type: "bool" },
      { name: "userData", type: "uint64" },
      { name: "price", type: "uint256" },
      { name: "quantity", type: "uint256" },
      { name: "expireTimestampNs", type: "uint64" },
      { name: "orderType", type: "uint8" },
      { name: "selfMatchingOption", type: "uint8" },
      { name: "builder", type: "address" },
      { name: "builderFeeBpsTimes1k", type: "uint96" },
    ],
    outputs: [
      { name: "success", type: "bool" },
      { name: "orderId", type: "uint128" },
    ],
  },
  {
    type: "function",
    name: "cancelOrderFor",
    stateMutability: "nonpayable",
    inputs: [
      { name: "owner", type: "address" },
      { name: "orderId", type: "uint128" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "getBookLevels",
    stateMutability: "view",
    inputs: [
      { name: "isBid", type: "bool" },
      { name: "numLevels", type: "uint64" },
    ],
    outputs: [
      {
        name: "",
        type: "tuple[]",
        components: [
          { name: "price", type: "uint256" },
          { name: "quantity", type: "uint256" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "getWithdrawableBalance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "token", type: "address" },
    ],
    outputs: [{ name: "", type: "uint256" }],
  },
] as const;

export class OrderError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "OrderError";
    this.code = code;
  }
}

/** Human value to on-chain integer, without float artifacts reaching the chain. */
export function toRaw(value: number, decimals: number): bigint {
  return parseUnits(value.toFixed(decimals), decimals);
}

export function fromRaw(raw: bigint, decimals: number): number {
  return Number(formatUnits(raw, decimals));
}

/**
 * Snap a price to a whole number of ticks.
 *
 * Bids round down and asks round up, so rounding never nudges an order into
 * crossing when it was not meant to.
 */
export function alignToTick(
  priceRaw: bigint,
  tickRaw: bigint,
  side: "bid" | "ask"
): bigint {
  if (tickRaw <= 0n) throw new OrderError("BAD_TICK", "tick must be positive");

  const remainder = priceRaw % tickRaw;
  if (remainder === 0n) return priceRaw;

  return side === "bid" ? priceRaw - remainder : priceRaw - remainder + tickRaw;
}

/** Snap a quantity down to whole lots, so an order never overspends. */
export function alignToLot(qtyRaw: bigint, lotRaw: bigint): bigint {
  if (lotRaw <= 0n) throw new OrderError("BAD_LOT", "lot must be positive");
  return qtyRaw - (qtyRaw % lotRaw);
}

/**
 * An expiry the exchange will accept.
 *
 * Zero is NOT "never expires" - it is silently rejected, and so is any time
 * already past. Always a real moment in the future, in nanoseconds.
 */
export function buildExpireNs(lifetimeMs = 60_000): bigint {
  return BigInt(Date.now() + lifetimeMs) * 1_000_000n;
}

export interface TradingClients {
  publicClient: ReturnType<typeof createPublicClient>;
  walletClient: ReturnType<typeof createWalletClient>;
  operator: `0x${string}`;
}

/**
 * Clients that sign with the session key rather than the player's wallet.
 *
 * @param sessionPrivateKey the browser's throwaway trading key
 */
export function createTradingClients(
  sessionPrivateKey: `0x${string}`
): TradingClients {
  const account = privateKeyToAccount(sessionPrivateKey);
  const transport = http(somniaNetwork.rpcUrls.default.http[0]);

  return {
    publicClient: createPublicClient({ chain: somniaNetwork, transport }),
    walletClient: createWalletClient({
      account,
      chain: somniaNetwork,
      transport,
    }),
    operator: account.address,
  };
}

export interface TopOfBook {
  bestBid: number | null;
  bestAsk: number | null;
  spreadPct: number | null;
}

/** Best price on each side, straight from the pool. */
export async function readTopOfBook(
  clients: TradingClients,
  market: MarketMeta
): Promise<TopOfBook> {
  const [bids, asks] = await Promise.all([
    clients.publicClient.readContract({
      address: market.pool,
      abi: TRADING_POOL_ABI,
      functionName: "getBookLevels",
      args: [true, 1n],
    }),
    clients.publicClient.readContract({
      address: market.pool,
      abi: TRADING_POOL_ABI,
      functionName: "getBookLevels",
      args: [false, 1n],
    }),
  ]);

  const bestBid = bids.length
    ? fromRaw(bids[0].price, market.quoteDecimals)
    : null;
  const bestAsk = asks.length
    ? fromRaw(asks[0].price, market.quoteDecimals)
    : null;

  const spreadPct =
    bestBid && bestAsk ? ((bestAsk - bestBid) / ((bestAsk + bestBid) / 2)) * 100 : null;

  return { bestBid, bestAsk, spreadPct };
}

export interface PlaceParams {
  market: MarketMeta;
  owner: `0x${string}`;
  isBid: boolean;
  /** Human price, before it is snapped to a tick. */
  price: number;
  /** Human quantity of the base token, before it is snapped to a lot. */
  quantity: number;
  orderType?: number;
}

export interface PlaceResult {
  txHash: `0x${string}`;
  orderId: bigint | null;
  gasUsed: bigint;
  priceRaw: bigint;
  quantityRaw: bigint;
}

/**
 * Place an order for the player, signed by the session key.
 *
 * Simulated before it is broadcast, because a rejected order still mines and
 * still costs gas - it just does nothing. And after broadcasting, the receipt
 * has to actually contain the accepted event: a mined transaction with no such
 * log is a silent rejection, which is the failure everybody trips over first.
 */
export async function placeOrder(
  clients: TradingClients,
  params: PlaceParams
): Promise<PlaceResult> {
  const { market, owner, isBid, price, quantity } = params;
  const orderType = params.orderType ?? ORDER_TYPE.ImmediateOrCancel;

  const tickRaw = toRaw(Number(market.tickSize), market.quoteDecimals);
  const lotRaw = toRaw(Number(market.lotSize), market.baseDecimals);
  const minQtyRaw = toRaw(Number(market.minQuantity), market.baseDecimals);

  const priceRaw = alignToTick(
    toRaw(price, market.quoteDecimals),
    tickRaw,
    isBid ? "bid" : "ask"
  );
  const quantityRaw = alignToLot(
    toRaw(quantity, market.baseDecimals),
    lotRaw
  );

  if (priceRaw <= 0n) {
    // A zero price is read literally, not as "whatever the market is", so it
    // would rest forever without ever crossing.
    throw new OrderError("ZERO_PRICE", "Price rounded to zero");
  }
  if (quantityRaw < minQtyRaw) {
    throw new OrderError(
      "BELOW_MIN",
      `Below this market's minimum trade of ${market.minQuantity}`
    );
  }

  const args = [
    owner,
    isBid,
    0n,
    priceRaw,
    quantityRaw,
    buildExpireNs(),
    orderType,
    SELF_MATCH_CANCEL_TAKER,
    zeroAddress,
    0n,
  ] as const;

  const simulation = await clients.publicClient.simulateContract({
    address: market.pool,
    abi: TRADING_POOL_ABI,
    functionName: "placeOrderFor",
    args,
    account: clients.walletClient.account,
    value: 0n,
  });

  if (!simulation.result[0]) {
    throw new OrderError(
      "WOULD_BE_REJECTED",
      "The exchange would reject this order. Is the vault funded and the session key still authorised?"
    );
  }

  const floor = gasFloorFor(market.baseIsNative, isBid);
  let gas = floor;
  try {
    const estimate = await clients.publicClient.estimateContractGas({
      address: market.pool,
      abi: TRADING_POOL_ABI,
      functionName: "placeOrderFor",
      args,
      account: clients.walletClient.account,
      value: 0n,
    });
    const withHeadroom = (estimate * 13n) / 10n;
    gas = withHeadroom > floor ? withHeadroom : floor;
  } catch {
    // Estimation can revert on the payout guard even when the order is fine,
    // so fall back to the floor rather than refusing to trade.
  }

  const txHash = await clients.walletClient.writeContract({
    ...simulation.request,
    gas,
  });

  const receipt = await clients.publicClient.waitForTransactionReceipt({
    hash: txHash,
  });

  if (receipt.status !== "success") {
    throw new OrderError("REVERTED", `Order transaction reverted: ${txHash}`);
  }

  const placed = receipt.logs.find(
    (log) => log.topics[0]?.toLowerCase() === ORDER_PLACED_TOPIC
  );

  if (!placed) {
    throw new OrderError(
      "SILENT_REJECTION",
      `Transaction mined but the order was rejected: ${txHash}`
    );
  }

  return {
    txHash,
    orderId: placed.topics[1] ? BigInt(placed.topics[1]) : null,
    gasUsed: receipt.gasUsed,
    priceRaw,
    quantityRaw,
  };
}

/** What the player can still take out of the vault. */
export async function readVaultBalance(
  clients: TradingClients,
  market: MarketMeta,
  owner: `0x${string}`,
  token: `0x${string}`
): Promise<number> {
  const raw = await clients.publicClient.readContract({
    address: market.pool,
    abi: TRADING_POOL_ABI,
    functionName: "getWithdrawableBalance",
    args: [owner, token],
  });

  return fromRaw(raw, market.quoteDecimals);
}
