import type { WalletClient } from "viem";

import { recordTrade } from "@/lib/attestation";
import { USDSO_ADDRESS, type MarketMeta } from "@/lib/dreamdex";
import {
  readTopOfBook,
  readVaultBalance,
  type TradingClients,
} from "@/lib/orders";
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

/*
 * Stands in for the transaction that opened a recovered holding. That hash is
 * gone with the page that placed the order; nothing reads it back, and a
 * recognisable placeholder beats a plausible-looking wrong hash.
 */
const RECOVERED_TX =
  "0x0000000000000000000000000000000000000000000000000000000000000000" as const;

/**
 * A buy-in that could not complete, with the one fact that decides what a
 * player must be told: whether the commitment ever left the wallet.
 *
 * The deposit is owner-signed and the buy is key-signed, so they cannot land
 * as a single transaction - if the deposit lands and the buy then fails, the
 * commitment is sitting at the exchange with no position open. That is a
 * "your money is safe, go get it back" message, not a "the buy-in failed,
 * nothing happened" one, and confusing the two is worse than either alone.
 */
export class BuyInError extends Error {
  /** True once the commitment has actually reached the exchange. */
  readonly fundsAtExchange: boolean;

  constructor(message: string, fundsAtExchange: boolean) {
    super(message);
    this.name = "BuyInError";
    this.fundsAtExchange = fundsAtExchange;
  }
}

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
  /** USDso that has changed hands, buys and sells added together. */
  volumeUsdso: number;
}

export interface TradingBridge {
  /** Ready to trade: a funded vault and an authorised session key. */
  enabled: boolean;
  symbol: string;
  /**
   * Buy in. Deposits the full commitment to the exchange (owner-signed, one
   * prompt) and then opens at the derived opening stake (key-signed, no
   * prompt) - two signers, so this is honestly two steps rather than one
   * atomic transaction. Resolves once the position is really open.
   *
   * @param commitmentUsdso the whole amount this run is depositing, including
   *   the headroom `F` will draw from
   * @param openingStakeUsdso the part of the commitment that actually buys
   *   the position - `deriveOpeningStake`'s result, not the commitment itself
   */
  open: (
    commitmentUsdso: number,
    openingStakeUsdso: number
  ) => Promise<TradingSnapshot | null>;
  /** Add to the position. More exposure, more firepower, more risk. */
  addExposure: (extraUsdso: number) => Promise<TradingSnapshot | null>;
  /**
   * Sell back. Used both by ejecting and by finishing a run. Sweeps the pool
   * home on both sides afterwards - a partial fill can leave base tokens
   * behind - but a sweep failure is reported alongside the result rather than
   * thrown, so it never costs the caller the P&L it needs.
   */
  close: () => Promise<{
    pnl: number;
    proceeds: number;
    swept: { quote: number; base: number } | null;
    sweepError: string | null;
  } | null>;
  /** Value the position without touching it. */
  snapshot: () => Promise<TradingSnapshot | null>;
  /** What a round trip will cost in spread, before committing. */
  quoteCost: (stakeUsdso: number) => Promise<number | null>;
  /**
   * Is a position open right now, answered without a round trip?
   *
   * The menu has to know before it will start a run, and it asks from inside
   * the canvas where nothing can await a promise mid-frame. Reads the same
   * value the snapshot reports rather than keeping a second copy.
   */
  isOpen: () => boolean;
  /** USDso sitting in the exchange vault, ready to trade with. */
  vaultUsdso: () => Promise<number>;
  /** Base tokens sitting in the vault - a buy that this page has forgotten. */
  vaultBase: () => Promise<number>;
  /**
   * What the last closed position staked and made, or null before one has.
   *
   * Kept because the score is submitted after the run has ended and the
   * position has already been sold - so by then the live snapshot is empty, and
   * the numbers that belong in the run's record are gone unless something held
   * on to them.
   */
  lastRun: () => { stakeUsdso: number; pnlUsdso: number } | null;
  /**
   * Adopt a holding the vault already has.
   *
   * The position only ever lived in this closure, so a refresh forgot it while
   * the tokens stayed on chain: the panel offered to buy in again over a vault
   * that held no quote currency, and the holding could not be sold because
   * nothing in the app believed it existed. Returns the recovered snapshot, or
   * null when the vault genuinely holds nothing.
   */
  recover: () => Promise<TradingSnapshot | null>;
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
  /**
   * Can a buy-in even be attempted right now?
   *
   * The vault used to be pre-funded, so opening a position never needed the
   * player's own wallet. Now the commitment has to be deposited first, and
   * that deposit is owner-signed - so without a wallet there is no route to
   * fund a run at all. False when `ownerWallet` is missing, mirroring
   * `canRestStop` above.
   */
  canBuyIn: boolean;
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
  /**
   * The owner-signed route into the exchange, injected rather than
   * reimplemented here.
   *
   * `useSessionKey` already owns simulating, signing, and confirming an
   * owner transaction correctly - including the network switch and the
   * batched-prompt fallback - so the bridge calls back into that rather than
   * duplicating it against a raw `ownerWallet`. Both are expected to be
   * present together, since a caller that can sign one can sign the other;
   * `canBuyIn` is still keyed off `ownerWallet` alone, matching `canRestStop`.
   */
  depositCommitment?: (amountUsdso: number) => Promise<void>;
  /** Bring both sides of the pool home. See `useSessionKey.sweepHome`. */
  sweepHome?: () => Promise<{ quote: number; base: number }>;
  onChange?: (snapshot: TradingSnapshot | null) => void;
}

const emptySnapshot = (
  orderCount: number,
  volumeUsdso = 0
): TradingSnapshot => ({
  open: false,
  stake: 0,
  value: 0,
  pnl: 0,
  pnlPct: 0,
  orderCount,
  volumeUsdso,
});

/*
 * Volume outlives the page, because the player's total traded is a running
 * count and not a property of one visit. Kept per wallet: a different account
 * on the same browser has its own history and must not inherit this one's.
 */
export const VOLUME_KEY = "rc.volume.";

/** What this wallet has traded, as last recorded on this browser. */
export function readStoredVolume(owner: string | undefined | null): number {
  if (!owner) return 0;
  return restoreVolume(owner);
}

function restoreVolume(owner: string): number {
  if (typeof window === "undefined") return 0;
  const raw = window.localStorage?.getItem(VOLUME_KEY + owner.toLowerCase());
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function rememberVolume(owner: string, total: number) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(VOLUME_KEY + owner.toLowerCase(), String(total));
  } catch {
    // A browser refusing storage is not a reason to fail a trade.
  }
}

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
  depositCommitment,
  sweepHome,
  onChange,
}: BuildBridgeOptions): TradingBridge {
  let position: Position | null = null;
  let orderCount = 0;

  /*
   * One money operation at a time, enforced here rather than trusted to the
   * callers.
   *
   * Buying more and selling out both rewrite `position`, so if they overlap the
   * one that finishes last wins: either the tokens just bought drop out of
   * tracking and get swept home outside the reported P&L, or a position that
   * was already sold comes back to life and the game believes more is at risk
   * than really is. The scenes had flags for this, but each only checked its
   * own - and a lock that lives with the state it protects cannot be forgotten
   * by the next call site.
   *
   * Buying refuses while something else runs: a dropped top-up costs nothing,
   * the player presses F again. Selling WAITS instead of refusing, because a
   * floor or target that gets dropped is the one failure a player cannot
   * recover from - it is the instruction that limits their loss.
   */
  let inFlight: Promise<unknown> | null = null;

  let ticket = 0;

  function guard<T>(op: () => Promise<T>): Promise<T> {
    // A ticket rather than comparing promises: only the operation that still
    // holds the latest one may clear the slot, so a slow finisher cannot
    // release a lock that something newer has already taken.
    const mine = ++ticket;
    const running = (async () => {
      try {
        return await op();
      } finally {
        if (ticket === mine) inFlight = null;
      }
    })();
    inFlight = running;
    return running;
  }

  /** Let whatever is running finish. Its failure is the caller's business, not ours. */
  async function settleInFlight(): Promise<void> {
    while (inFlight) {
      try {
        await inFlight;
      } catch {
        // Swallowed on purpose: we are only waiting for the slot to free up.
      }
    }
  }

  /*
   * Money that has actually moved, buys and sells added together.
   *
   * Not the same as the stake: staking 1 USDso and selling it back is 2 USDso
   * of volume, which is what an exchange counts and what the navbar shows.
   */
  let volumeUsdso = restoreVolume(owner);

  /*
   * Counted locally so the readout moves the instant a trade lands, and
   * reported to the service so it survives a cleared cache and follows the
   * wallet to another browser. The service checks the transaction happened
   * before counting it, and its total wins when the two disagree.
   */
  const addVolume = (amount: number, txHash?: `0x${string}`) => {
    volumeUsdso += Math.abs(amount);
    rememberVolume(owner, volumeUsdso);

    if (!txHash) return;
    recordTrade(txHash, Math.abs(amount)).then((total) => {
      if (!total) return;
      volumeUsdso = total.volumeUsdso;
      rememberVolume(owner, volumeUsdso);
      if (typeof window !== "undefined") {
        if (window.rocketCandleGame) {
          window.rocketCandleGame.tradedVolume = volumeUsdso;
        }
        window.dispatchEvent(new CustomEvent("rc-hud"));
      }
    });
  };
  let stop: ArmedStop | null = null;
  let lastRun: { stakeUsdso: number; pnlUsdso: number } | null = null;

  const canRestStop = Boolean(market.stopRegistry && ownerWallet);
  const canBuyIn = Boolean(ownerWallet);

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

    // The menu scene lives in the canvas and cannot see React state, so it
    // listens for the same event the HUD uses. Without this the play button
    // would still read BUY IN TO PLAY after the position had opened.
    if (typeof window !== "undefined") {
      // Parked on the window so anything outside the game page - the navbar's
      // volume readout - can read it without holding a bridge of its own.
      if (window.rocketCandleGame) {
        window.rocketCandleGame.tradedVolume = volumeUsdso;
      }
      window.dispatchEvent(new CustomEvent("rc-hud"));
    }

    return snapshot;
  };

  /*
   * The buy-in itself, run under the lock.
   *
   * Extracted so `open` can hold `inFlight` for its whole duration rather than
   * merely refusing to start while something else runs: a sell that arrives
   * mid-purchase has to be able to WAIT for it, and it can only wait for an
   * operation that actually claimed the slot.
   */
  async function runBuyIn(
    commitmentUsdso: number,
    openingStakeUsdso: number
  ): Promise<TradingSnapshot | null> {
    if (!canBuyIn || !depositCommitment) {
      throw new BuyInError(
        "No wallet is available to fund this run",
        false
      );
    }

    try {
      // Owner-signed: the commitment leaves the wallet before anything is
      // bought. Nothing has been spent yet if this step itself fails, so
      // this is wrapped separately from the buy below - a deposit that
      // never lands must never be told apart as "funds are at the
      // exchange" the way a landed deposit with a failed buy is.
      await depositCommitment(commitmentUsdso);
    } catch (e) {
      throw new BuyInError(
        `Could not deposit ${commitmentUsdso} USDso (${
          e instanceof Error ? e.message : String(e)
        }). Nothing left your wallet.`,
        false
      );
    }

    try {
      // Key-signed, no prompt: buys only the derived opening stake, leaving
      // the rest of the commitment behind in the pool as `F`'s headroom.
      position = await openPosition(clients, market, owner, openingStakeUsdso);
    } catch (e) {
      // The deposit landed; the buy did not. The commitment is sitting at
      // the exchange with no position open - recoverable, not lost, and the
      // wrong words here would tell a player their money is gone.
      throw new BuyInError(
        `Deposited ${commitmentUsdso} USDso but the buy failed (${
          e instanceof Error ? e.message : String(e)
        }). That money is still at the exchange and can be returned.`,
        true
      );
    }

    orderCount += 1;
    addVolume(position.costUsdso, position.openTxHash);

    return publish({
      open: true,
      stake: position.costUsdso,
      value: position.costUsdso,
      pnl: 0,
      pnlPct: 0,
      orderCount,
      volumeUsdso,
    });
  }

  return {
    enabled: true,
    symbol: market.symbol,

    isOpen() {
      return Boolean(position);
    },

    async vaultUsdso() {
      return readVaultBalance(clients, market, owner, USDSO_ADDRESS);
    },

    async vaultBase() {
      return readVaultBalance(clients, market, owner, market.base, "base");
    },

    lastRun() {
      return lastRun;
    },

    async recover() {
      if (position) return null;

      const quantity = await readVaultBalance(
        clients,
        market,
        owner,
        market.base,
        "base"
      );

      // Below the exchange's own minimum there is nothing sellable there -
      // treating leftover dust as a position would offer a sale that reverts.
      if (quantity < Number(market.minQuantity)) return null;

      // What a seller would actually get, not a midpoint nobody trades at.
      const { bestBid } = await readTopOfBook(clients, market);
      if (!bestBid) return null;

      /*
       * The entry price is gone with the page that knew it, so this marks the
       * holding at what it is worth now. Profit therefore restarts from zero
       * on a recovered position - honest about being unknown rather than
       * inventing a number, and the holding becomes sellable either way.
       */
      position = {
        symbol: market.symbol,
        quantity,
        costUsdso: quantity * bestBid,
        entryPrice: bestBid,
        openedAt: Date.now(),
        openTxHash: RECOVERED_TX,
        lastTxHash: RECOVERED_TX,
      };

      return publish({
        open: true,
        stake: position.costUsdso,
        value: position.costUsdso,
        pnl: 0,
        pnlPct: 0,
        orderCount,
        volumeUsdso,
      });
    },

    async open(commitmentUsdso, openingStakeUsdso) {
      if (position || inFlight) return null;

      return guard(() => runBuyIn(commitmentUsdso, openingStakeUsdso));
    },

    async addExposure(extraUsdso) {
      // Refused, not queued: a top-up that arrives after the position closed
      // would buy tokens nothing is watching.
      if (!position || inFlight) return null;

      return guard(async () => {
        if (!position) return null;

        position = await addToPosition(
          clients,
          market,
          owner,
          position,
          extraUsdso
        );
        orderCount += 1;
        addVolume(extraUsdso, position.lastTxHash);

        const marked = await markToMarket(clients, market, position);

        return publish({
          open: true,
          stake: position.costUsdso,
          value: marked?.value ?? position.costUsdso,
          pnl: marked?.pnlUsdso ?? 0,
          pnlPct: marked?.pnlPct ?? 0,
          orderCount,
          volumeUsdso,
        });
      });
    },

    async close() {
      // Waits rather than refusing - see the note on `inFlight`. A top-up in
      // flight delays this sell by one transaction; dropping it would leave the
      // player's loss uncapped.
      await settleInFlight();

      // Re-checked after waiting: whatever we waited for may have closed it.
      if (!position) return null;

      // Lift the stop first. Selling while a stop still rests would leave a
      // standing instruction against tokens that no longer exist.
      await liftStop();

      const result = await closePosition(clients, market, owner, position);
      orderCount += 1;
      addVolume(result.proceedsUsdso, result.txHash);

      // Held for the score submission, which happens after this point and
      // therefore after the position it is describing has gone.
      lastRun = {
        stakeUsdso: position.costUsdso,
        pnlUsdso: result.pnlUsdso,
      };
      position = null;

      publish(emptySnapshot(orderCount, volumeUsdso));

      /*
       * Sweep home, both sides, but never at the cost of the P&L the caller
       * needs to record. The score attestation carries stake and P&L from
       * this exact result - throwing here over a sweep failure would throw
       * that away along with the sweep, and the position is already gone by
       * this point regardless.
       */
      let swept: { quote: number; base: number } | null = null;
      let sweepError: string | null = null;
      if (sweepHome) {
        try {
          swept = await sweepHome();
        } catch (e) {
          console.error("Failed to sweep the pool home:", e);
          sweepError = e instanceof Error ? e.message : String(e);
        }
      }

      return {
        pnl: result.pnlUsdso,
        proceeds: result.proceedsUsdso,
        swept,
        sweepError,
      };
    },

    async snapshot() {
      if (!position) return emptySnapshot(orderCount, volumeUsdso);

      const marked = await markToMarket(clients, market, position);
      if (!marked) return null;

      return publish({
        open: true,
        stake: position.costUsdso,
        value: marked.value,
        pnl: marked.pnlUsdso,
        pnlPct: marked.pnlPct,
        orderCount,
        volumeUsdso,
      });
    },

    async quoteCost(stakeUsdso) {
      const cost = await estimateRoundTripCost(clients, market, stakeUsdso);
      return cost ? cost.estimatedUsdso : null;
    },

    canRestStop,
    canBuyIn,

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
