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
 * The owner-signed callbacks a bridge needs to fund and unwind a run.
 *
 * `useSessionKey` is the only place these are implemented, and it holds its
 * own `step`/`error` state - a second instance of that hook here just to get
 * these two functions would give the panel and this hook two disagreeing
 * views of the same setup flow. So the caller (`TradingSetup.tsx`, which
 * already holds the one `useSessionKey` instance) passes them in instead.
 */
export interface TradingSessionCallbacks {
  /** `useSessionKey().depositFor`, bound to this page's symbol. */
  depositCommitment?: (amountUsdso: number) => Promise<void>;
  /** `useSessionKey().sweepHome`, bound to this page's symbol. */
  sweepHome?: () => Promise<{ quote: number; base: number }>;
}

/**
 * Hands the game a way to trade, or doesn't.
 *
 * If the wallet is connected, a session key exists and the vault is funded,
 * the game gets a bridge and the run plays for real. Otherwise it gets nothing
 * and plays as practice. There is no half-state: a run either has a position or
 * it does not.
 */
export function useTradingSession(
  symbol: string,
  callbacks: TradingSessionCallbacks = {}
) {
  const { address } = useAccount();
  // Only ever used to rest a stop on the exchange. Every trade during a run is
  // signed by the session key instead, so no prompt interrupts play.
  const { data: ownerWallet } = useWalletClient();
  const [bridge, setBridge] = useState<TradingBridge | null>(null);
  const [snapshot, setSnapshot] = useState<TradingSnapshot | null>(null);
  const [market, setMarket] = useState<MarketMeta | null>(null);
  const [error, setError] = useState<string | null>(null);
  const buildingRef = useRef(false);
  const { depositCommitment, sweepHome } = callbacks;

  /*
   * `TradingSetup.tsx` builds a fresh `{ depositCommitment, sweepHome }`
   * object with fresh arrow functions on every render (it has to - they
   * close over `symbol` and the amount typed into the field). If `build`
   * depended on those functions directly, it would get a new identity on
   * every render, the effect below would refire, and each refire pays for
   * a `fetchMarket` request and an on-chain `recover()` read - an unbounded
   * loop of network and RPC calls for as long as this panel is mounted,
   * with a bridge identity that never settles under the game.
   *
   * Assigning through a ref on every render, the same way `useVaultReturn`
   * holds its `sweepHome`, keeps the callbacks out of `build`'s dependency
   * array entirely while still reading the latest ones: the assignment
   * below runs during render, before `build` is ever called, so a
   * genuinely new callback (say the wallet reconnects and `depositFor` is
   * rebuilt against a new wallet client) is picked up the next time a run
   * actually deposits or sweeps - it is never left holding a stale closure
   * over a dead wallet client.
   */
  const depositCommitmentRef = useRef(depositCommitment);
  depositCommitmentRef.current = depositCommitment;
  const sweepHomeRef = useRef(sweepHome);
  sweepHomeRef.current = sweepHome;

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
        depositCommitment: depositCommitmentRef.current,
        sweepHome: sweepHomeRef.current,
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
