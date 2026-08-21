"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { GAME_MARKETS } from "@/data/DreamdexMarketFeed.js";
import { fetchMarket, USDSO_ADDRESS } from "@/lib/dreamdex";
import { createReadClients, readVaultBalance } from "@/lib/orders";
import { detectStrandedFunds, selectAutoAttemptTargets } from "@/lib/recovery";

/**
 * Bringing home money a finished run left behind, without a player watching.
 *
 * A floor or target can fire while the tab is closed, so a run can end with
 * the commitment (or a partial fill's leftover base tokens) still sitting in
 * the exchange's pool. This hook is the recovery half of `vault-as-transit.md`
 * §5: on load, and whenever a wallet connects, it checks every market for
 * exactly that and tries to sweep it home on its own. It does NOT render
 * anything - it only decides and reports, so the panel (a later phase) can
 * show the notice.
 */

export interface VaultReturnEntry {
  marketId: string;
  symbol: string;
  /** USDso still held on the quote side, as last confirmed on chain. */
  quote: number;
  /** Base-token units still held, as last confirmed on chain. */
  base: number;
  /** An automatic or retried sweep is currently signing/broadcasting. */
  attempting: boolean;
  /** Set when the most recent attempt failed. Cleared by a fresh attempt. */
  error: string | null;
}

/**
 * The market currently being played, if any.
 *
 * Only one bridge exists at a time (see `useTradingSession`), and a
 * position's state lives purely in that bridge's memory - nothing else in
 * the app can know a position is open for a market that is not this one.
 * Passing it in keeps this hook from having to know about the bridge at all.
 */
export interface ActiveMarket {
  symbol: string;
  positionOpen: boolean;
}

export function useVaultReturn(
  owner: `0x${string}` | null | undefined,
  sweepHome:
    | ((symbol: string) => Promise<{ quote: number; base: number }>)
    | null
    | undefined,
  active?: ActiveMarket
) {
  const [entries, setEntries] = useState<VaultReturnEntry[]>([]);
  /**
   * Markets whose balance could not be read this pass.
   *
   * A failed read and an empty pool must never look the same to the player -
   * `TradingSetup` already learned this the hard way for the session vault,
   * and the exchange's pool is no different. Kept as a separate list rather
   * than folded into `entries` because "there is nothing here" and "we could
   * not tell" call for different copy in the panel that reads this.
   */
  const [unreadable, setUnreadable] = useState<string[]>([]);
  /**
   * Which markets have already had an automatic attempt this connection.
   *
   * An attempt needs an owner signature, so it can be refused. Without this
   * guard a refusal would be retried on every re-render, which reads as a
   * wallet stuck spamming prompts rather than a notice waiting for the
   * player to act - the brief is explicit that this must never loop.
   */
  const attemptedRef = useRef<Set<string>>(new Set());
  const activeRef = useRef<ActiveMarket | undefined>(active);
  activeRef.current = active;
  // sweepHome comes from a caller that may not memoize it. `runAttempt` below
  // reads it through this ref instead of closing over it directly, so its
  // own identity stays stable across renders - depending on it directly
  // would recreate `runAttempt` (and re-run the reconnect effect) on every
  // render whose caller passed a fresh inline function.
  const sweepHomeRef = useRef(sweepHome);
  sweepHomeRef.current = sweepHome;

  const detect = useCallback(async (): Promise<{
    entries: VaultReturnEntry[];
    unreadable: string[];
  }> => {
    if (!owner) return { entries: [], unreadable: [] };

    const clients = createReadClients();

    const found = await Promise.all(
      GAME_MARKETS.map(async (game) => {
        try {
          const meta = await fetchMarket(
            game.symbol,
            game.source === "mainnet" ? "mainnet" : "testnet"
          );
          if (!meta) return null;

          let quote: number;
          let base: number;
          try {
            [quote, base] = await Promise.all([
              readVaultBalance(clients, meta, owner, USDSO_ADDRESS),
              readVaultBalance(clients, meta, owner, meta.base, "base"),
            ]);
          } catch {
            // Do NOT convert this into "0 held" - that is indistinguishable
            // from an actually empty pool and would tell a player there is
            // nothing to return when the truth is the read simply failed.
            return { kind: "unreadable" as const, marketId: game.id };
          }

          const positionOpen = activeRef.current?.symbol === game.symbol
            ? activeRef.current.positionOpen
            : false;

          const result = detectStrandedFunds({
            quote,
            base,
            positionOpen,
            minQuantity: meta.minQuantity,
          });

          if (!result.strandable) return null;

          return {
            kind: "found" as const,
            marketId: game.id,
            symbol: game.symbol,
            quote: result.quote,
            /*
             * Sellable and dust added back together.
             *
             * The split matters when deciding whether an ORDER can be placed;
             * this notice is about what comes home, and a sweep withdraws the
             * whole balance. Reporting only the sellable part would announce
             * "0.00 is still at the exchange" for a pool holding nothing but
             * dust - which is how that money became invisible in the first
             * place.
             */
            base: result.base + result.dust,
          };
        } catch {
          // One market being unreadable must not gate the other three - the
          // same invariant `useMarketMinimums` keeps.
          return null;
        }
      })
    );

    const entries: VaultReturnEntry[] = [];
    const unreadable: string[] = [];
    for (const outcome of found) {
      if (!outcome) continue;
      if (outcome.kind === "unreadable") {
        unreadable.push(outcome.marketId);
      } else {
        entries.push({
          marketId: outcome.marketId,
          symbol: outcome.symbol,
          quote: outcome.quote,
          base: outcome.base,
          attempting: false,
          error: null,
        });
      }
    }

    return { entries, unreadable };
  }, [owner]);

  /**
   * Sweeps a single entry home. Takes the entry itself rather than a
   * `marketId` to look up - that lookup is exactly what went silently inert
   * before: state set moments earlier by the caller is not guaranteed to be
   * the state this closure sees, so a lookup against it can miss even though
   * the caller is holding the right data already.
   */
  const runAttempt = useCallback(
    async (target: VaultReturnEntry) => {
      const sweep = sweepHomeRef.current;
      if (!sweep) return;

      setEntries((prev) =>
        prev.map((e) =>
          e.marketId === target.marketId
            ? { ...e, attempting: true, error: null }
            : e
        )
      );

      try {
        await sweep(target.symbol);

        /*
         * Trust the chain, not the promise. Phase 1's lesson applies here
         * directly: a sweep call resolving is not proof the money actually
         * left - re-reading the balances is what tells a player the truth,
         * rather than a guard that reports success just because nothing
         * threw.
         */
        const clients = createReadClients();
        const meta = await fetchMarket(target.symbol);

        /*
         * A failed confirmation read is "don't know", not "unchanged".
         *
         * These used to fall back to the PRE-SWEEP figures, so one flaky read
         * after a sweep that genuinely succeeded redisplayed the same amount as
         * still stranded - telling a player their money was stuck when it had
         * already come home. That is the exact inversion of the safeguard the
         * note above describes. Unreadable is carried as unreadable, which this
         * file already has a state for.
         */
        // null means "could not read", which balances themselves never are.
        const readOrUnknown = (p: Promise<number>): Promise<number | null> =>
          p.then((v) => v).catch(() => null);

        const [quoteRead, baseRead]: (number | null)[] = meta
          ? await Promise.all([
              readOrUnknown(
                readVaultBalance(clients, meta, owner!, USDSO_ADDRESS)
              ),
              readOrUnknown(
                readVaultBalance(clients, meta, owner!, meta.base, "base")
              ),
            ])
          : [null, null];

        if (quoteRead === null || baseRead === null) {
          // Drop it from the list and let the next load re-read: claiming
          // either outcome here would be a guess about the player's money.
          setEntries((prev) => prev.filter((e) => e.marketId !== target.marketId));
          setUnreadable((prev) =>
            prev.includes(target.marketId) ? prev : [...prev, target.marketId]
          );
          return;
        }

        const quote = quoteRead;
        const base = baseRead;

        const result = meta
          ? detectStrandedFunds({
              quote,
              base,
              positionOpen: false,
              minQuantity: meta.minQuantity,
            })
          : { strandable: true, quote, base, dust: 0 };

        setEntries((prev) => {
          if (!result.strandable) {
            return prev.filter((e) => e.marketId !== target.marketId);
          }
          return prev.map((e) =>
            e.marketId === target.marketId
              ? {
                  ...e,
                  quote: result.quote,
                  // Same reason as the first read: this figure is what is left
                  // to come home, not what could be sold.
                  base: result.base + result.dust,
                  attempting: false,
                  error: null,
                }
              : e
          );
        });
      } catch (e) {
        setEntries((prev) =>
          prev.map((entry) =>
            entry.marketId === target.marketId
              ? {
                  ...entry,
                  attempting: false,
                  error:
                    (e as Error).message ?? "Could not return this pool's balance",
                }
              : entry
          )
        );
      }
    },
    // Stable regardless of `sweepHome`'s identity - read through the ref
    // above instead. `owner` is kept because it is only used to re-check the
    // balance after a sweep, guarded by `owner!` below; it changing here is
    // harmless since the reconnect effect already re-runs on that change.
    [owner]
  );

  useEffect(() => {
    if (!owner) {
      setEntries([]);
      setUnreadable([]);
      attemptedRef.current = new Set();
      return;
    }

    let cancelled = false;

    detect().then((found) => {
      if (cancelled) return;
      setEntries(found.entries);
      setUnreadable(found.unreadable);

      // One automatic attempt per market per connection - a refusal or
      // failure leaves the notice standing rather than retrying it. Fed
      // straight from `found.entries` (never from `entries` state) so the
      // symbol each attempt sweeps is the one just detected, not whatever a
      // stale closure over state happens to still be holding.
      const targets = selectAutoAttemptTargets(
        found.entries,
        attemptedRef.current
      );
      targets.forEach((entry) => {
        attemptedRef.current.add(entry.marketId);
        runAttempt(entry);
      });
    });

    return () => {
      cancelled = true;
    };
    // Keyed on `owner` (plus the now-stable `detect`/`runAttempt`) - "on
    // load and on reconnect". Neither callback closes over `entries`
    // anymore, so there is nothing here that would turn one sweep attempt
    // per market into a loop.
  }, [owner, detect, runAttempt]);

  const attempt = useCallback(
    (marketId: string) => {
      const target = entries.find((e) => e.marketId === marketId);
      if (!target) return;
      runAttempt(target);
    },
    [entries, runAttempt]
  );

  const retry = useCallback(
    (marketId: string) => {
      attempt(marketId);
    },
    [attempt]
  );

  return { entries, unreadable, retry };
}
