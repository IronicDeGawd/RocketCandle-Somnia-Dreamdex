"use client";

import { useEffect, useRef } from "react";

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
  /**
   * Holds the most recent computed result so it can be republished the
   * moment the canvas exists, without refetching.
   *
   * The Phaser bundle is loaded with `ssr: false`, so PhaserGame.tsx sets
   * `window.rocketCandleGame` well after this hook's first read can finish.
   * A read that lands before that global exists used to be thrown away
   * outright, leaving the picker stuck on nothing (or stale data) for up to
   * the full 60s until the next interval tick.
   */
  const latestRef = useRef<{
    minimums: MarketMinimums;
    vaults: MarketVaults;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    const publish = () => {
      if (typeof window === "undefined") return;
      if (!window.rocketCandleGame) return;
      const latest = latestRef.current;
      if (!latest) return;

      window.rocketCandleGame.marketMinimums = latest.minimums;
      window.rocketCandleGame.marketVaults = latest.vaults;
      window.dispatchEvent(new CustomEvent("rc-hud"));
    };

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

      const readable = found.filter(
        (entry): entry is readonly [string, MarketMinimum | null, number | null] =>
          Boolean(entry)
      );

      latestRef.current = {
        minimums: Object.fromEntries(
          readable
            .filter((e): e is readonly [string, MarketMinimum, number | null] =>
              Boolean(e[1])
            )
            .map(([id, min]) => [id, min])
        ),
        vaults: Object.fromEntries(
          readable
            .filter((e): e is readonly [string, MarketMinimum | null, number] =>
              typeof e[2] === "number"
            )
            .map(([id, , vault]) => [id, vault])
        ),
      };

      publish();
    };

    // PhaserGame.tsx fires this the instant it sets `window.rocketCandleGame`,
    // which can land after a read here has already finished and been
    // dropped. Republishing the cached result (no refetch) closes that gap
    // without a duplicate-read storm.
    window.addEventListener("rc-game-ready", publish);

    const safeRead = () =>
      read().catch((err) => {
        console.error("useMarketMinimums: read cycle failed", err);
      });

    safeRead();

    // Prices move, so a minimum read once at load goes stale. Slow on purpose:
    // this gates a choice, it is not a ticker.
    const timer = setInterval(safeRead, 60_000);

    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener("rc-game-ready", publish);
    };
  }, [owner]);
}
