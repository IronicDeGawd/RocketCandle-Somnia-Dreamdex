"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount, useWalletClient } from "wagmi";

import { fetchMarket, type MarketMeta } from "@/lib/dreamdex";
import { createTradingClients } from "@/lib/orders";
import { peekSessionKey } from "@/lib/sessionKey";
import {
  buildTradingBridge,
  type TradingBridge,
  type TradingSnapshot,
} from "@/lib/tradingBridge";

/**
 * Hands the game a way to trade, or doesn't.
 *
 * If the wallet is connected, a session key exists and the vault is funded,
 * the game gets a bridge and the run plays for real. Otherwise it gets nothing
 * and plays as practice. There is no half-state: a run either has a position or
 * it does not.
 */
export function useTradingSession(symbol: string) {
  const { address } = useAccount();
  // Only ever used to rest a stop on the exchange. Every trade during a run is
  // signed by the session key instead, so no prompt interrupts play.
  const { data: ownerWallet } = useWalletClient();
  const [bridge, setBridge] = useState<TradingBridge | null>(null);
  const [snapshot, setSnapshot] = useState<TradingSnapshot | null>(null);
  const [market, setMarket] = useState<MarketMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buildingRef = useRef(false);

  const build = useCallback(async () => {
    if (buildingRef.current) return;
    buildingRef.current = true;

    try {
      const key = peekSessionKey();
      if (!address || !key) {
        setBridge(null);
        return;
      }

      const meta = await fetchMarket(symbol);
      if (!meta) throw new Error(`Market ${symbol} not found`);
      setMarket(meta);

      const clients = createTradingClients(key.privateKey);
      const built = buildTradingBridge({
        clients,
        market: meta,
        owner: address,
        ownerWallet,
        onChange: setSnapshot,
      });
      setBridge(built);
      setError(null);

      /*
       * Pick up a holding this page has forgotten.
       *
       * The position lived only inside the bridge closure, so a refresh lost
       * it while the tokens stayed in the vault on chain. The panel then read
       * the quote side, saw the money gone, and offered to buy in again over a
       * holding it could no longer sell. The chain is the only honest answer,
       * so it is asked on every build.
       */
      await built.recover().catch(() => null);
    } catch (e) {
      setBridge(null);
      setError((e as Error).message ?? "Could not prepare trading");
    } finally {
      buildingRef.current = false;
    }
  }, [address, ownerWallet, symbol]);

  useEffect(() => {
    build();
  }, [build]);

  // Hand the bridge to the game, and take it away again when this unmounts.
  // A stale bridge left on the window would let a later practice run trade.
  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.rocketCandleGame) {
      window.rocketCandleGame.trading = bridge ?? undefined;
    }

    return () => {
      if (window.rocketCandleGame) {
        window.rocketCandleGame.trading = undefined;
      }
    };
  }, [bridge]);

  return { bridge, snapshot, market, error, refresh: build };
}
