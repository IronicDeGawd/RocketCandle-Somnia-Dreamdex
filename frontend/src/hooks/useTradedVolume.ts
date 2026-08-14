"use client";

import { useSyncExternalStore } from "react";
import { readStoredVolume } from "@/lib/tradingBridge";

/**
 * How much money this player has moved through the exchange.
 *
 * The running total lives in the trading bridge, which only the game page
 * builds - so this reads what the bridge parks on the window, and falls back
 * to what this browser last recorded for the wallet. That fallback is what
 * makes the readout survive a refresh and appear on pages that never trade.
 */

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("rc-hud", onChange);
  return () => window.removeEventListener("rc-hud", onChange);
}

export function useTradedVolume(address?: string | null): number {
  const live = useSyncExternalStore(
    subscribe,
    () => (typeof window === "undefined" ? null : window.rocketCandleGame?.tradedVolume ?? null),
    () => null
  );

  // Server render and first paint have no window, so the stored figure is read
  // lazily rather than as the store's snapshot - a value that differed between
  // server and client would tear on hydration.
  if (live !== null) return live;
  return typeof window === "undefined" ? 0 : readStoredVolume(address);
}
