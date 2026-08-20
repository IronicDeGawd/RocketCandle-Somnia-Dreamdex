"use client";

import { useSyncExternalStore } from "react";

/**
 * What the wallet holds in USDso, right now.
 *
 * `vault-as-transit.md` §6: every gate compares against the WALLET balance
 * now, not a per-pool vault - "does your wallet hold enough" is one number a
 * player already knows, in place of "does this specific pool hold enough".
 * This used to read a market's own vault (`marketVaults`), which is why the
 * per-pool naming existed here; that reasoning is gone along with the read.
 */

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("rc-hud", onChange);
  return () => window.removeEventListener("rc-hud", onChange);
}

function read(): string {
  if (typeof window === "undefined") return "";
  const held = window.rocketCandleGame?.walletUsdso;
  // Serialised so useSyncExternalStore compares by value; returning a fresh
  // object every read would loop forever.
  return typeof held === "number" ? String(held) : "";
}

/** USDso in the connected wallet, or null before it has been read even once. */
export function useWalletUsdso(): number | null {
  const packed = useSyncExternalStore(subscribe, read, () => "");
  return packed === "" ? null : Number(packed);
}
