import type { WalletClient } from "viem";

import type { MarketMeta } from "@/lib/dreamdex";
import type { TradingClients } from "@/lib/orders";
import {
  armStopLoss,
  cancelStop,
  readStopConfig,
  type ArmedStop,
} from "@/lib/stopOrder";
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

  /**
   * Can a stop be rested on the exchange at all?
   *
   * False when the market has no registry, or when the player's own wallet is
   * unavailable - the session key is not allowed to arm one.
   */
  canRestStop: boolean;
  /** What resting a stop costs up front, and how far it may slip when it fires. */
  stopTerms: () => Promise<{ deposit: number; slippageBps: number } | null>;
  /**
   * Rest a stop on the exchange. Costs one signature from the player's wallet
   * and a refundable deposit, and then survives the tab closing.
   *
   * @param dropPct how far below the entry price the position should sell, as
   *   a percentage - the same number the in-page floor uses
   */
  restStop: (dropPct: number) => Promise<ArmedStop | null>;
  /** Take the resting stop back off and reclaim its deposit. */
  liftStop: () => Promise<boolean>;
  /** The stop currently resting on the exchange, if any. */
  restingStop: () => ArmedStop | null;
}

export interface BuildBridgeOptions {
  clients: TradingClients;
  market: MarketMeta;
  owner: `0x${string}`;
  /**
   * The player's own wallet, used only for stops.
   *
   * Deliberately separate from the session key. Everything the game does during
   * a run is signed by the session key so play is never interrupted, but the
   * exchange refuses to let anyone but the owner rest a stop, so this is the
   * one action that reaches for the real wallet.
   */
  ownerWallet?: WalletClient | null;
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
  ownerWallet,
  onChange,
}: BuildBridgeOptions): TradingBridge {
  let position: Position | null = null;
  let orderCount = 0;
  let stop: ArmedStop | null = null;

  const canRestStop = Boolean(market.stopRegistry && ownerWallet);

  /**
   * Take any resting stop off the exchange.
   *
   * Always attempted when a position closes. A stop left behind cannot fill
   * any more - the tokens are gone - but it still holds its deposit until
   * something clears it, and the deposit is only refunded on cancel.
   */
  const liftStop = async (): Promise<boolean> => {
    if (!stop || !ownerWallet) return false;
    try {
      await cancelStop(clients.publicClient, ownerWallet, stop, owner);
      stop = null;
      return true;
    } catch {
      // Worth surfacing, not worth failing a run over: the position is already
      // closed and the only thing still at stake is the deposit.
      return false;
    }
  };

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

      // Lift the stop first. Selling while a stop still rests would leave a
      // standing instruction against tokens that no longer exist.
      await liftStop();

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

    canRestStop,

    async stopTerms() {
      if (!market.stopRegistry) return null;
      const config = await readStopConfig(
        clients.publicClient,
        market.stopRegistry
      );
      return { deposit: config.deposit, slippageBps: config.slippageBps };
    },

    async restStop(dropPct) {
      if (!position || !ownerWallet || !market.stopRegistry) return null;

      // Measured from what was actually paid, so topping up a position at a
      // worse price moves the floor with it rather than leaving it stranded.
      const triggerPrice = position.entryPrice * (1 - dropPct / 100);

      // One stop per position. A second would cost a second deposit while
      // protecting nothing extra, since neither reserves the tokens.
      if (stop) await liftStop();

      stop = await armStopLoss({
        publicClient: clients.publicClient,
        walletClient: ownerWallet,
        market,
        owner,
        quantity: position.quantity,
        triggerPrice,
      });
      return stop;
    },

    liftStop,
    restingStop: () => stop,

    ordersPlaced: () => orderCount,

    // Not a placeholder. The exchange charges nothing on either side, which is
    // the whole reason a game can afford to fire orders like this.
    feesPaid: () => 0,
  };
}
