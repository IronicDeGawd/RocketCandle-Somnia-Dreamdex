"use client";

import { useEffect } from "react";

import { GAME_MARKETS } from "@/data/DreamdexMarketFeed.js";
import { fetchMarket } from "@/lib/dreamdex";
import { minStakeFor, type MarketMinimum } from "@/lib/minimums";
import {
  createReadClients,
  readTopOfBook,
  readVaultBalance,
} from "@/lib/orders";
import { USDSO_ADDRESS } from "@/lib/dreamdex";

/**
 * What each market's smallest possible buy costs, right now.
 *
 * Every spot market sets its minimum in the token being bought, so the money it
 * takes to reach that minimum depends on the token's price and changes with it.
 * Without this a player could pick a market whose smallest order was worth more
 * than their whole vault, and only learn that when the exchange refused it.
 *
 * Published onto the window because the picker is drawn in the canvas and
 * cannot see React state - the same route the HUD and the exits plan take.
 */

export type MarketMinimums = Record<string, MarketMinimum>;

/** USDso sitting in each market's own vault, keyed by market id. */
export type MarketVaults = Record<string, number>;

/**
 * @param owner the connected wallet, or nothing when there is none
 */
export function useMarketMinimums(owner?: `0x${string}` | null) {
  useEffect(() => {
    let cancelled = false;

    const read = async () => {
      const clients = createReadClients();

      const found = await Promise.all(
        GAME_MARKETS.map(async (game) => {
          try {
            const meta = await fetchMarket(
              game.symbol,
              // The feed's own field, typed loosely because it comes from a
              // plain JS module.
              game.source === "mainnet" ? "mainnet" : "testnet"
            );
            if (!meta) return null;

            const { bestAsk } = await readTopOfBook(clients, meta);
            const min = minStakeFor(meta, bestAsk ?? 0);

            /*
             * Each market keeps its own vault.
             *
             * getWithdrawableBalance is a call on the pool, so money deposited
             * for one pair is not spendable on another. Reading one balance and
             * comparing it against every market's minimum showed a market with
             * an empty pool as affordable, and the buy then failed for want of
             * funds it was never going to find.
             */
            const vault = owner
              ? await readVaultBalance(clients, meta, owner, USDSO_ADDRESS).catch(
                  () => null
                )
              : null;

            return [game.id, min, vault] as const;
          } catch {
            // One market being unreadable must not gate the other three.
            return null;
          }
        })
      );

      if (cancelled || typeof window === "undefined") return;
      if (!window.rocketCandleGame) return;

      const readable = found.filter(
        (entry): entry is readonly [string, MarketMinimum | null, number | null] =>
          Boolean(entry)
      );

      window.rocketCandleGame.marketMinimums = Object.fromEntries(
        readable
          .filter((e): e is readonly [string, MarketMinimum, number | null] =>
            Boolean(e[1])
          )
          .map(([id, min]) => [id, min])
      );

      window.rocketCandleGame.marketVaults = Object.fromEntries(
        readable
          .filter((e): e is readonly [string, MarketMinimum | null, number] =>
            typeof e[2] === "number"
          )
          .map(([id, , vault]) => [id, vault])
      );

      window.dispatchEvent(new CustomEvent("rc-hud"));
    };

    read();

    // Prices move, so a minimum read once at load goes stale. Slow on purpose:
    // this gates a choice, it is not a ticker.
    const timer = setInterval(read, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [owner]);
}
