"use client";

import { useEffect } from "react";

import { GAME_MARKETS } from "@/data/DreamdexMarketFeed.js";
import { fetchMarket } from "@/lib/dreamdex";
import { minStakeFor, type MarketMinimum } from "@/lib/minimums";
import { createReadClients, readTopOfBook } from "@/lib/orders";

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

export function useMarketMinimums() {
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
            return min ? ([game.id, min] as const) : null;
          } catch {
            // One market being unreadable must not gate the other three.
            return null;
          }
        })
      );

      if (cancelled || typeof window === "undefined") return;
      if (!window.rocketCandleGame) return;

      window.rocketCandleGame.marketMinimums = Object.fromEntries(
        found.filter((entry): entry is [string, MarketMinimum] => Boolean(entry))
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
  }, []);
}
