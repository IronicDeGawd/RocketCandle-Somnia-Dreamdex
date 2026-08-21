"use client";

import { useSyncExternalStore } from "react";
import { useAccount, useReadContract } from "wagmi";

import { ERC20_ABI, USDSO_ADDRESS } from "@/lib/dreamdex";

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

/**
 * The same figure, read straight from the chain.
 *
 * The bridge version above exists for the game canvas, which cannot use React
 * state. The navbar is not the canvas - it is page chrome that outlives every
 * scene - so hanging its balance off a global the canvas owns meant a canvas
 * remount blanked it, and the player saw a dash while holding money. This
 * reads the token directly through wagmi and does not care what the game is
 * doing.
 */
export function useWalletUsdsoLive(): number | null {
  const { address } = useAccount();

  const { data } = useReadContract({
    address: USDSO_ADDRESS,
    abi: ERC20_ABI,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    query: {
      enabled: Boolean(address),
      // Moves when a run opens or closes, so not a one-off read - but it
      // gates a choice rather than driving a ticker.
      refetchInterval: 15_000,
    },
  });

  if (!address) return null;
  return typeof data === "bigint" ? Number(data) / 1e18 : null;
}
