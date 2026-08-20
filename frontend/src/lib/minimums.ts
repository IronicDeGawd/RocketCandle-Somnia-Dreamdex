import type { MarketMeta } from "@/lib/dreamdex";
import { alignToTick, fromRaw, toRaw } from "@/lib/orders";
import { CROSS_BPS } from "@/lib/position";

/**
 * The smallest buy each market will accept, in USDso.
 *
 * Every spot market sets its own minimum trade size in the token being bought,
 * not in money - so the same 1 USDso that buys a comfortable amount of a cheap
 * token is far below the minimum for an expensive one. A player with a funded
 * vault could therefore pick a market whose smallest possible order was worth
 * more than everything they had, and only find out when the exchange refused
 * the order.
 *
 * Kept pure and apart from the fetching so it can be tested: the numbers have
 * to match what the order actually does, and there is no way to see that from
 * the outside once the order has been refused.
 */

export interface MarketMinimum {
  /** The token quantity the exchange will not go below. */
  quantity: number;
  /** What a buy would really pay per token: crossed, then snapped to a tick. */
  price: number;
  /** That quantity at that price. */
  usdso: number;
  /**
   * What to actually require of a player.
   *
   * A stake is turned into a quantity by dividing by the price, and that
   * quantity is then rounded DOWN to a whole lot. So a stake worth exactly the
   * minimum can round to just under it and be refused - this carries one lot of
   * headroom so that cannot happen.
   */
  safeUsdso: number;
}

/**
 * @param bestAsk the cheapest price anyone is currently selling at
 */
export function minStakeFor(
  market: MarketMeta,
  bestAsk: number
): MarketMinimum | null {
  if (!bestAsk || bestAsk <= 0) return null;

  const tickRaw = toRaw(Number(market.tickSize), market.quoteDecimals);
  const lotRaw = toRaw(Number(market.lotSize), market.baseDecimals);
  const minQtyRaw = toRaw(Number(market.minQuantity), market.baseDecimals);

  if (tickRaw <= 0n || lotRaw <= 0n) return null;

  // Exactly what placeOrder does to a bid: cross the touch, then snap down to
  // a whole tick. Anything else here would quote a minimum the order misses.
  const crossed = bestAsk * (1 + CROSS_BPS / 10_000);
  const priceRaw = alignToTick(
    toRaw(crossed, market.quoteDecimals),
    tickRaw,
    "bid"
  );

  // The smallest whole number of lots at or above the market's minimum. A
  // minimum that is not itself a lot multiple rounds up, because rounding down
  // would land under the minimum.
  const remainder = minQtyRaw % lotRaw;
  const quantityRaw =
    remainder === 0n ? minQtyRaw : minQtyRaw - remainder + lotRaw;

  const price = fromRaw(priceRaw, market.quoteDecimals);
  const quantity = fromRaw(quantityRaw, market.baseDecimals);
  const lot = fromRaw(lotRaw, market.baseDecimals);

  return {
    quantity,
    price,
    usdso: quantity * price,
    safeUsdso: (quantity + lot) * price,
  };
}
