import { USDSO_ADDRESS, type MarketMeta } from "@/lib/dreamdex";
import {
  ORDER_TYPE,
  fromRaw,
  placeOrder,
  readTopOfBook,
  readVaultBalance,
  OrderError,
  type TradingClients,
} from "@/lib/orders";

/**
 * The stake, as a real position.
 *
 * Starting a run buys the token you chose. Finishing it - or ejecting - sells
 * back. What you get is decided by the exchange, not by the game, which is the
 * whole point: there is no score to fake, only a price that moved.
 */

/** How far to cross the touch so a taker order actually fills. */
const CROSS_BPS = 20;

export interface Position {
  symbol: string;
  /** Base tokens actually held. */
  quantity: number;
  /** USDso the vault gave up to open it. */
  costUsdso: number;
  /** Price paid per token, cost divided by quantity. */
  entryPrice: number;
  openedAt: number;
  openTxHash: `0x${string}`;
}

export interface CloseResult {
  proceedsUsdso: number;
  pnlUsdso: number;
  exitPrice: number;
  txHash: `0x${string}`;
}

export interface RoundTripCost {
  spreadPct: number;
  /** What crossing the gap twice costs on this stake, in USDso. */
  estimatedUsdso: number;
}

/**
 * What a round trip costs before it is taken.
 *
 * Fees are genuinely zero. The cost is the gap between the buy and sell prices,
 * crossed once on the way in and once on the way out. Shown rather than hidden:
 * a demo that claims free trading and quietly loses the spread deserves to be
 * caught.
 */
export async function estimateRoundTripCost(
  clients: TradingClients,
  market: MarketMeta,
  stakeUsdso: number
): Promise<RoundTripCost | null> {
  const { spreadPct } = await readTopOfBook(clients, market);
  if (spreadPct === null) return null;

  return {
    spreadPct,
    estimatedUsdso: stakeUsdso * (spreadPct / 100),
  };
}

/**
 * Buy into the market with the run's stake.
 *
 * The quantity is worked out from the current ask, then the order crosses it so
 * it fills now rather than resting. The cost is measured from what the vault
 * actually lost, not from what the order asked for - partial fills are real,
 * and assuming otherwise would misreport every position.
 *
 * @param stakeUsdso how much of the vault to put at risk
 */
export async function openPosition(
  clients: TradingClients,
  market: MarketMeta,
  owner: `0x${string}`,
  stakeUsdso: number
): Promise<Position> {
  const { bestAsk } = await readTopOfBook(clients, market);
  if (!bestAsk) throw new OrderError("EMPTY_BOOK", "Nobody is selling right now");

  const vaultBefore = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);
  if (vaultBefore < stakeUsdso) {
    throw new OrderError(
      "INSUFFICIENT_VAULT",
      `Only ${vaultBefore.toFixed(2)} USDso available, ${stakeUsdso} needed`
    );
  }

  const price = bestAsk * (1 + CROSS_BPS / 10_000);
  const quantity = stakeUsdso / price;

  const result = await placeOrder(clients, {
    market,
    owner,
    isBid: true,
    price,
    quantity,
    orderType: ORDER_TYPE.ImmediateOrCancel,
  });

  const vaultAfter = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);
  const costUsdso = vaultBefore - vaultAfter;

  if (costUsdso <= 0) {
    throw new OrderError(
      "NO_FILL",
      "The order did not fill - the market moved away before it landed"
    );
  }

  const filledQuantity = fromRaw(result.quantityRaw, market.baseDecimals);

  return {
    symbol: market.symbol,
    quantity: filledQuantity,
    costUsdso,
    entryPrice: costUsdso / filledQuantity,
    openedAt: Date.now(),
    openTxHash: result.txHash,
  };
}

/**
 * Buy more of the same, adding to an open position.
 *
 * The new average entry is worked out from total cost over total quantity, so
 * a top-up at a worse price honestly drags the entry up rather than being
 * quietly ignored.
 */
export async function addToPosition(
  clients: TradingClients,
  market: MarketMeta,
  owner: `0x${string}`,
  position: Position,
  extraUsdso: number
): Promise<Position> {
  const added = await openPosition(clients, market, owner, extraUsdso);

  const quantity = position.quantity + added.quantity;
  const costUsdso = position.costUsdso + added.costUsdso;

  return {
    ...position,
    quantity,
    costUsdso,
    entryPrice: costUsdso / quantity,
  };
}

/**
 * Sell the position back.
 *
 * Used both when a run ends and when the player ejects early - they are the
 * same action, and keeping them the same means the ejection path is exercised
 * every single run rather than only in an emergency.
 */
export async function closePosition(
  clients: TradingClients,
  market: MarketMeta,
  owner: `0x${string}`,
  position: Position
): Promise<CloseResult> {
  const { bestBid } = await readTopOfBook(clients, market);
  if (!bestBid) throw new OrderError("EMPTY_BOOK", "Nobody is buying right now");

  const vaultBefore = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);

  const price = bestBid * (1 - CROSS_BPS / 10_000);
  const result = await placeOrder(clients, {
    market,
    owner,
    isBid: false,
    price,
    quantity: position.quantity,
    orderType: ORDER_TYPE.ImmediateOrCancel,
  });

  const vaultAfter = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);
  const proceedsUsdso = vaultAfter - vaultBefore;

  return {
    proceedsUsdso,
    pnlUsdso: proceedsUsdso - position.costUsdso,
    exitPrice: proceedsUsdso / position.quantity,
    txHash: result.txHash,
  };
}

/**
 * What the position is worth right now, without selling it.
 *
 * Valued at the price somebody would actually pay - the best bid - rather than
 * the midpoint, because the midpoint is a number nobody can trade at.
 */
export async function markToMarket(
  clients: TradingClients,
  market: MarketMeta,
  position: Position
): Promise<{ value: number; pnlUsdso: number; pnlPct: number } | null> {
  const { bestBid } = await readTopOfBook(clients, market);
  if (!bestBid) return null;

  const value = position.quantity * bestBid;
  const pnlUsdso = value - position.costUsdso;

  return {
    value,
    pnlUsdso,
    pnlPct: (pnlUsdso / position.costUsdso) * 100,
  };
}

/**
 * Has the price fallen through the floor the player set?
 *
 * This is a stop watched by the game, so it only works while the page is open.
 * It is not the same as an order resting on the exchange, which would fire even
 * with the browser closed - each market exposes its own stop registry for that,
 * and moving to it is the honest upgrade.
 *
 * @param floorPrice the price below which the position should be sold
 */
export function hasBrokenFloor(currentPrice: number, floorPrice: number): boolean {
  return floorPrice > 0 && currentPrice < floorPrice;
}
