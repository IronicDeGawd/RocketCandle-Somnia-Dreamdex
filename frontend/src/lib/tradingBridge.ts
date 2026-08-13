import type { MarketMeta } from "@/lib/dreamdex";
import type { TradingClients } from "@/lib/orders";
import {
  addToPosition,
  closePosition,
  estimateRoundTripCost,
  markToMarket,
  openPosition,
  type Position,
} from "@/lib/position";

/**
 * How the game talks to the market.
 *
 * The game runs inside Phaser and knows nothing about wallets; React owns the
 * keys and the connection. This is the narrow surface between them, so trading
 * never leaks into the game loop and the game never touches a key.
 */

export interface TradingSnapshot {
  /** Is there a live position right now? */
  open: boolean;
  /** USDso put at risk. */
  stake: number;
  /** What it is worth at the price somebody would actually pay. */
  value: number;
  /** Gain or loss so far, in USDso. */
  pnl: number;
  pnlPct: number;
  /** How many real orders this run has placed. */
  orderCount: number;
}

export interface TradingBridge {
  /** Ready to trade: a funded vault and an authorised session key. */
  enabled: boolean;
  symbol: string;
  /** Buy in. Resolves once the position is really open. */
  open: (stakeUsdso: number) => Promise<TradingSnapshot | null>;
  /** Add to the position. More exposure, more firepower, more risk. */
  addExposure: (extraUsdso: number) => Promise<TradingSnapshot | null>;
  /** Sell back. Used both by ejecting and by finishing a run. */
  close: () => Promise<{ pnl: number; proceeds: number } | null>;
  /** Value the position without touching it. */
  snapshot: () => Promise<TradingSnapshot | null>;
  /** What a round trip will cost in spread, before committing. */
  quoteCost: (stakeUsdso: number) => Promise<number | null>;
  /** Orders placed this run, and what they cost in fees. Always zero. */
  ordersPlaced: () => number;
  feesPaid: () => number;
}

export interface BuildBridgeOptions {
  clients: TradingClients;
  market: MarketMeta;
  owner: `0x${string}`;
  onChange?: (snapshot: TradingSnapshot | null) => void;
}

const emptySnapshot = (orderCount: number): TradingSnapshot => ({
  open: false,
  stake: 0,
  value: 0,
  pnl: 0,
  pnlPct: 0,
  orderCount,
});

/**
 * Build the bridge for one run.
 *
 * Position state lives here rather than in the game, so a scene restart cannot
 * lose track of real money that is still on the exchange.
 */
export function buildTradingBridge({
  clients,
  market,
  owner,
  onChange,
}: BuildBridgeOptions): TradingBridge {
  let position: Position | null = null;
  let orderCount = 0;

  const publish = (snapshot: TradingSnapshot | null) => {
    onChange?.(snapshot);
    return snapshot;
  };

  return {
    enabled: true,
    symbol: market.symbol,

    async open(stakeUsdso) {
      if (position) return null;

      position = await openPosition(clients, market, owner, stakeUsdso);
      orderCount += 1;

      return publish({
        open: true,
        stake: position.costUsdso,
        value: position.costUsdso,
        pnl: 0,
        pnlPct: 0,
        orderCount,
      });
    },

    async addExposure(extraUsdso) {
      if (!position) return null;

      position = await addToPosition(
        clients,
        market,
        owner,
        position,
        extraUsdso
      );
      orderCount += 1;

      const marked = await markToMarket(clients, market, position);

      return publish({
        open: true,
        stake: position.costUsdso,
        value: marked?.value ?? position.costUsdso,
        pnl: marked?.pnlUsdso ?? 0,
        pnlPct: marked?.pnlPct ?? 0,
        orderCount,
      });
    },

    async close() {
      if (!position) return null;

      const result = await closePosition(clients, market, owner, position);
      orderCount += 1;
      position = null;

      publish(emptySnapshot(orderCount));
      return { pnl: result.pnlUsdso, proceeds: result.proceedsUsdso };
    },

    async snapshot() {
      if (!position) return emptySnapshot(orderCount);

      const marked = await markToMarket(clients, market, position);
      if (!marked) return null;

      return publish({
        open: true,
        stake: position.costUsdso,
        value: marked.value,
        pnl: marked.pnlUsdso,
        pnlPct: marked.pnlPct,
        orderCount,
      });
    },

    async quoteCost(stakeUsdso) {
      const cost = await estimateRoundTripCost(clients, market, stakeUsdso);
      return cost ? cost.estimatedUsdso : null;
    },

    ordersPlaced: () => orderCount,

    // Not a placeholder. The exchange charges nothing on either side, which is
    // the whole reason a game can afford to fire orders like this.
    feesPaid: () => 0,
  };
}
