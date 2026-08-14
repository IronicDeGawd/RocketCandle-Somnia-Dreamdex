"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { fetchVolume } from "@/lib/attestation";
import { readStoredVolume } from "@/lib/tradingBridge";

/**
 * How much money this player has moved through the exchange.
 *
 * Three sources, most trustworthy last: what this browser remembers, what the
 * service has recorded, and what the live bridge has counted this session. The
 * service is the durable one - a cleared cache or a second device wipes the
 * browser's copy, and only the game page ever builds a bridge - so its figure
 * replaces the local guess as soon as it arrives.
 */

function subscribe(onChange: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("rc-hud", onChange);
  return () => window.removeEventListener("rc-hud", onChange);
}

export function useTradedVolume(address?: string | null): number {
  const live = useSyncExternalStore(
    subscribe,
    () =>
      typeof window === "undefined"
        ? null
        : window.rocketCandleGame?.tradedVolume ?? null,
    () => null
  );

  const [stored, setStored] = useState<number | null>(null);

  useEffect(() => {
    if (!address) {
      setStored(null);
      return;
    }

    // Show the browser's own figure immediately so the readout is never blank,
    // then correct it with the service's.
    setStored(readStoredVolume(address));

    let cancelled = false;
    fetchVolume(address).then((total) => {
      if (!cancelled && total) setStored(total.volumeUsdso);
    });

    return () => {
      cancelled = true;
    };
  }, [address]);

  return live ?? stored ?? 0;
}
