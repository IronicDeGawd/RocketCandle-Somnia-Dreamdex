import type { Address, Hash, WalletClient } from "viem";

import { type MarketMeta } from "@/lib/dreamdex";
import {
  OrderError,
  alignToLot,
  fromRaw,
  toRaw,
  type TradingClients,
} from "@/lib/orders";

/**
 * The reading client the rest of the app already builds.
 *
 * Taken from the trading clients rather than declared independently, so this
 * module accepts exactly what callers have instead of a stricter shape they
 * would have to cast to.
 */
type ReadClient = TradingClients["publicClient"];

/**
 * A stop that lives on the exchange instead of in the browser tab.
 *
 * The game already watches the position and sells when it falls too far, but
 * that watching stops the moment the page closes. This puts the same
 * instruction on chain, where Somnia's own price feed fires it whether or not
 * anybody is looking.
 *
 * ## Why this interface is trustworthy
 *
 * The registry is a beacon proxy whose implementation is unverified, so none of
 * this was copied hopefully from a block explorer. Every selector below was
 * confirmed by hashing the documented signature and finding that exact four
 * bytes inside the deployed bytecode. That check also caught a public signature
 * database mislabelling `minStopDistanceBps()` as an unrelated function - a
 * reminder that guessed ABIs are how funds go missing quietly.
 *
 * ## The one thing that cannot be delegated
 *
 * Every other trade in this game is signed by a throwaway key held in the
 * browser, so play is never interrupted by a wallet prompt. A stop cannot work
 * that way: the registry requires the order's owner to be the account sending
 * the transaction, and rejects anything else with `InvalidOrderOwner`. Verified
 * by simulating both ways against the live contract. So arming a stop costs one
 * signature from the player's own wallet, and that is not a limitation worth
 * engineering around - a standing instruction to sell somebody's money should
 * carry their signature.
 */

/** LIMIT places at a price you choose; MARKET derives one from the mark price. */
export const STOP_ORDER_TYPE = { Limit: 0, Market: 1 } as const;

/** GTE fires when the price rises to the trigger, LTE when it falls to it. */
export const STOP_OPERATOR = { GreaterOrEqual: 0, LessOrEqual: 1 } as const;

/**
 * The creation event, identified from a real transaction rather than guessed.
 *
 * Its full signature resisted recovery, so the parameter names and types are
 * still unknown - but the first indexed value was observed to be the order id
 * and the second the owner, across two live creations. That is all this needs,
 * and the id is proven cancellable before it is ever trusted.
 */
const CREATED_TOPIC =
  "0x3c81b59a7f502c4c6f5b0cf5ed4520fd5f486e8f1668644df4ce47708f302df3";

/**
 * Topics of the registry's other known events.
 *
 * Kept as a fallback: if a future deployment changes the creation event, the
 * id can still be picked out as the log that is none of these, instead of the
 * feature failing outright.
 */
const KNOWN_EVENT_TOPICS = new Set<string>([
  // PendingOrderTriggered(uint128,bool,uint128)
  "0x1f6c55ddf148c254351e138eb9e5767174742b25eda5b9eb2166de5fa3f640aa",
  // PendingOrderCancelled(uint128)
  "0x225c2e0c029d6933d02c8279f566167a93c2523922013b852ba0e1ca860dcb8f",
  // InertOrderCancelled(uint128,address,uint256)
  "0xc83f4ce652582029f221328349ad59befaf3edb489060651ca5ee08693f4923c",
  // SomiRefundFailed(uint128,address,uint256)
  "0x877f1b210b51beb67979009e5d8138984e674d480839d829b7c0453e0bf1f55c",
]);

export const STOP_REGISTRY_ABI = [
  {
    type: "function",
    name: "createPendingOrder",
    stateMutability: "payable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          {
            name: "order",
            type: "tuple",
            components: [
              { name: "isBid", type: "bool" },
              { name: "owner", type: "address" },
              { name: "userData", type: "uint64" },
              { name: "quantity", type: "uint256" },
            ],
          },
          { name: "orderType", type: "uint8" },
          { name: "triggerPrice", type: "uint256" },
          { name: "triggerOperator", type: "uint8" },
          { name: "limitPrice", type: "uint256" },
          { name: "builder", type: "address" },
          { name: "builderFeeBpsTimes1k", type: "uint96" },
        ],
      },
    ],
    outputs: [{ name: "orderId", type: "uint128" }],
  },
  {
    type: "function",
    name: "cancelPendingOrder",
    stateMutability: "nonpayable",
    inputs: [{ name: "orderId", type: "uint128" }],
    outputs: [],
  },
  {
    type: "function",
    name: "claimSomi",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "somiPaymentPerOrder",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "minStopDistanceBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "slippageToleranceBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "unclaimedSomi",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ name: "", type: "uint256" }],
  },
  {
    type: "function",
    name: "spotPool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ name: "", type: "address" }],
  },
] as const;

export interface StopConfig {
  /** Native coin that must be sent with creation, exactly. */
  depositRaw: bigint;
  /** The same amount as a human number, for showing the player. */
  deposit: number;
  /** How far a trigger must sit from the current price. Zero means no limit. */
  minDistanceBps: number;
  /** How far a market-type stop is allowed to slip when it fires. */
  slippageBps: number;
}

export interface ArmedStop {
  registry: Address;
  orderId: bigint;
  /** Price at which the position sells itself. */
  triggerPrice: number;
  /** Base tokens the stop will sell. */
  quantity: number;
  /** Native coin locked up, returned when the stop is cancelled. */
  depositRaw: bigint;
  txHash: Hash;
}

/**
 * Read the registry's current terms before committing to them.
 *
 * The deposit is not a constant: the admin can change it between orders, and
 * paying anything other than the exact current amount is rejected. So it is
 * always read immediately before use rather than remembered.
 */
export async function readStopConfig(
  publicClient: ReadClient,
  registry: Address
): Promise<StopConfig> {
  const [depositRaw, minDistanceBps, slippageBps] = await Promise.all([
    publicClient.readContract({
      address: registry,
      abi: STOP_REGISTRY_ABI,
      functionName: "somiPaymentPerOrder",
    }),
    publicClient.readContract({
      address: registry,
      abi: STOP_REGISTRY_ABI,
      functionName: "minStopDistanceBps",
    }),
    publicClient.readContract({
      address: registry,
      abi: STOP_REGISTRY_ABI,
      functionName: "slippageToleranceBps",
    }),
  ]);

  return {
    depositRaw,
    deposit: fromRaw(depositRaw, 18),
    minDistanceBps: Number(minDistanceBps),
    slippageBps: Number(slippageBps),
  };
}

/**
 * Send a simulated request from whichever account this wallet actually holds.
 *
 * A browser wallet and a bare private key are signed for in different places -
 * the wallet signs in the extension, a private key signs locally. Simulation
 * only ever knows the address, so the account is reattached here rather than
 * assuming one of the two, which lets the same code path be exercised by a
 * real player and by a test that holds the key directly.
 */
async function writeAs(
  walletClient: WalletClient,
  request: Record<string, unknown>
): Promise<Hash> {
  const account = walletClient.account ?? request.account;
  return walletClient.writeContract({ ...request, account } as never);
}

export interface ArmStopParams {
  publicClient: ReadClient;
  /** The player's own wallet. A session key is refused by the registry. */
  walletClient: WalletClient;
  market: MarketMeta;
  owner: Address;
  /** Base tokens to sell if the trigger is hit. */
  quantity: number;
  /** Price at or below which the position should be sold. */
  triggerPrice: number;
}

/**
 * Put a stop-loss on the exchange.
 *
 * Sells the whole position at market if the price falls to the trigger. Market
 * type is deliberate: a limit stop can miss entirely on a thin book, and a stop
 * that fails to fill is worse than useless because the player believes they are
 * covered. Slipping a few percent is the price of actually getting out.
 *
 * The registry holds no tokens - it checks the vault balance once at creation
 * and again when the trigger fires. Selling the position by hand before then is
 * therefore safe, but leaves a stop that can no longer fill, so callers should
 * cancel rather than abandon it.
 *
 * Because nothing is reserved, the same tokens can back several stops at once:
 * arming a second identical stop was accepted on a live registry rather than
 * refused. Whichever fires first sells the tokens and the rest fail harmlessly,
 * but each still costs its own deposit, and a deposit is only returned on
 * cancel - never when a stop fires. So exactly one stop per position, cancelled
 * when the position closes.
 *
 * @throws OrderError if the market has no registry, or the deposit is unaffordable
 */
export async function armStopLoss({
  publicClient,
  walletClient,
  market,
  owner,
  quantity,
  triggerPrice,
}: ArmStopParams): Promise<ArmedStop> {
  const registry = market.stopRegistry;
  if (!registry) {
    throw new OrderError(
      "NO_STOP_REGISTRY",
      `${market.symbol} has no stop registry, so stops cannot rest on the exchange`
    );
  }

  const config = await readStopConfig(publicClient, registry);

  const lotRaw = toRaw(Number(market.lotSize), market.baseDecimals);
  const quantityRaw = alignToLot(
    toRaw(quantity, market.baseDecimals),
    lotRaw
  );
  if (quantityRaw <= 0n) {
    throw new OrderError(
      "BELOW_LOT",
      "The position is smaller than one lot, so it cannot be stopped out"
    );
  }

  const args = [
    {
      order: {
        isBid: false,
        owner,
        userData: 0n,
        quantity: quantityRaw,
      },
      orderType: STOP_ORDER_TYPE.Market,
      triggerPrice: toRaw(triggerPrice, market.quoteDecimals),
      triggerOperator: STOP_OPERATOR.LessOrEqual,
      // Must be exactly zero for a market stop; anything else is rejected.
      limitPrice: 0n,
      builder: "0x0000000000000000000000000000000000000000",
      builderFeeBpsTimes1k: 0n,
    },
  ] as const;

  // Simulate first. The registry rejects a wrong deposit, a trigger too close
  // to the current price, and a vault that cannot cover the sale - all of which
  // are cheaper to discover here than in a mined transaction.
  const { request, result } = await publicClient.simulateContract({
    address: registry,
    abi: STOP_REGISTRY_ABI,
    functionName: "createPendingOrder",
    args: args as never,
    value: config.depositRaw,
    account: owner,
  });

  const txHash = await writeAs(walletClient, request);
  const receipt = await publicClient.waitForTransactionReceipt({ hash: txHash });

  if (receipt.status !== "success") {
    throw new OrderError("STOP_REVERTED", "The stop order was rejected on chain");
  }

  const orderId = await resolveOrderId({
    publicClient,
    registry,
    owner,
    receipt,
    simulated: result as bigint,
  });

  return {
    registry,
    orderId,
    triggerPrice,
    quantity: fromRaw(quantityRaw, market.baseDecimals),
    depositRaw: config.depositRaw,
    txHash,
  };
}

/**
 * Work out which order was just created, and prove it before returning it.
 *
 * Two candidates are considered: the id the simulation predicted, and the id
 * carried by whichever log is not one of the registry's known events. Each is
 * accepted only if cancelling it simulates cleanly for this owner, which is the
 * exact property the id is needed for. A predicted id is not trusted on its own
 * because another player creating an order in the same block would shift it.
 */
async function resolveOrderId({
  publicClient,
  registry,
  owner,
  receipt,
  simulated,
}: {
  publicClient: ReadClient;
  registry: Address;
  owner: Address;
  receipt: { logs: readonly { address: string; topics: readonly string[] }[] };
  simulated: bigint;
}): Promise<bigint> {
  const named: bigint[] = [];
  const byElimination: bigint[] = [];

  for (const log of receipt.logs) {
    if (log.address.toLowerCase() !== registry.toLowerCase()) continue;
    const [topic0, topic1] = log.topics;
    if (!topic0 || !topic1) continue;

    const topic = topic0.toLowerCase();
    if (topic === CREATED_TOPIC) named.push(BigInt(topic1));
    else if (!KNOWN_EVENT_TOPICS.has(topic)) byElimination.push(BigInt(topic1));
  }

  // The predicted id goes last. It is only ever right by luck: ids are not a
  // simple counter, and two live creations minutes apart came back as
  // (1 << 64) | 43 and (3 << 64) | 44, so the upper half is not a constant and
  // cannot be extrapolated. Reading the log is the only reliable route.
  const candidates = [...named, ...byElimination];
  if (!candidates.includes(simulated)) candidates.push(simulated);

  for (const candidate of candidates) {
    if (await canCancel(publicClient, registry, owner, candidate)) {
      return candidate;
    }
  }

  throw new OrderError(
    "STOP_ID_UNKNOWN",
    "The stop was created but its id could not be confirmed, so it cannot be cancelled from here"
  );
}

/** Does this account own a cancellable order under this id? */
async function canCancel(
  publicClient: ReadClient,
  registry: Address,
  owner: Address,
  orderId: bigint
): Promise<boolean> {
  try {
    await publicClient.simulateContract({
      address: registry,
      abi: STOP_REGISTRY_ABI,
      functionName: "cancelPendingOrder",
      args: [orderId],
      account: owner,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Take the stop back off the exchange and get the deposit back.
 *
 * Called whenever a run ends normally, because a stop left behind outlives the
 * position it was protecting: it can no longer fill, but it still holds the
 * deposit until something clears it.
 *
 * If the refund transfer itself fails the cancellation still succeeds and the
 * amount is credited for later collection, so a failed refund is never a
 * reason to treat the cancel as failed.
 */
export async function cancelStop(
  publicClient: ReadClient,
  walletClient: WalletClient,
  stop: ArmedStop,
  owner: Address
): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    address: stop.registry,
    abi: STOP_REGISTRY_ABI,
    functionName: "cancelPendingOrder",
    args: [stop.orderId],
    account: owner,
  });

  const txHash = await writeAs(walletClient, request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}

/** Deposits owed back to this account because a refund transfer failed. */
export async function readUnclaimedDeposit(
  publicClient: ReadClient,
  registry: Address,
  owner: Address
): Promise<number> {
  const raw = await publicClient.readContract({
    address: registry,
    abi: STOP_REGISTRY_ABI,
    functionName: "unclaimedSomi",
    args: [owner],
  });
  return fromRaw(raw, 18);
}

/** Collect any deposits the registry could not return automatically. */
export async function claimUnclaimedDeposit(
  publicClient: ReadClient,
  walletClient: WalletClient,
  registry: Address,
  owner: Address
): Promise<Hash> {
  const { request } = await publicClient.simulateContract({
    address: registry,
    abi: STOP_REGISTRY_ABI,
    functionName: "claimSomi",
    account: owner,
  });

  const txHash = await writeAs(walletClient, request);
  await publicClient.waitForTransactionReceipt({ hash: txHash });
  return txHash;
}
