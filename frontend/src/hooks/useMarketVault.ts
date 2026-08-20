"use client";

import { useSyncExternalStore } from "react";

import { DEFAULT_MARKET_ID, GAME_MARKETS } from "@/data/DreamdexMarketFeed.js";

/**
 * The vault for the market actually in play.
 *
 * There is no single "the vault": a balance read is a call on the pool, so each
 * market keeps its own and money deposited for one pair cannot buy another.
 * This reports the one the player is about to spend, which is the only figure
 * that answers "can I play right now".
 */

export interface MarketVaultView {
  marketId: string;
  /** The nickname the picker shows, e.g. "SOMI". */
  label: string;
  /** USDso in that market's vault, or null before it has been read. */
  usdso: number | null;
}

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("rc-hud", onChange);
  return () => window.removeEventListener("rc-hud", onChange);
}

function read(): string {
  if (typeof window === "undefined") return "";
  const game = window.rocketCandleGame;
  const id = game?.selectedMarket?.id ?? DEFAULT_MARKET_ID;
  const held = game?.marketVaults?.[id];
  // Serialised so useSyncExternalStore compares by value; returning a fresh
  // object every read would loop forever.
  return `${id}|${typeof held === "number" ? held : ""}`;
}

export function useMarketVault(): MarketVaultView {
  const packed = useSyncExternalStore(subscribe, read, () => "");

  const [id, held] = packed.split("|");
  const marketId = id || DEFAULT_MARKET_ID;
  const market = GAME_MARKETS.find(
    (m: { id: string; label: string }) => m.id === marketId
  );

  return {
    marketId,
    // The picker's own nickname, minus the ticker in brackets - the bar has no
    // room for "Stablecoin (USDC.e)".
    label: (market?.label ?? marketId).replace(/\s*\(.*\)$/, ""),
    usdso: held === "" || held === undefined ? null : Number(held),
  };
}
