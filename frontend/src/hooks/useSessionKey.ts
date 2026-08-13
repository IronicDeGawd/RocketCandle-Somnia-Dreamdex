"use client";

import { useCallback, useEffect, useState } from "react";
import { useAccount, usePublicClient, useWalletClient } from "wagmi";
import { parseUnits } from "viem";

import {
  ERC20_ABI,
  OPERATOR_REGISTRY_ABI,
  OPERATOR_REGISTRY_ADDRESS,
  OPERATOR_SELECTORS,
  SPOT_POOL_ABI,
  USDSO_ADDRESS,
  fetchMarket,
  type MarketMeta,
} from "@/lib/dreamdex";
import {
  forgetSessionKey,
  getOrCreateSessionKey,
  peekSessionKey,
  type SessionKey,
} from "@/lib/sessionKey";

/**
 * Setting up trading without popups, and taking it back.
 *
 * Three signatures once, then none. The player moves working capital into the
 * exchange's vault and authorises this browser's throwaway key to place and
 * cancel orders against it. The key can never move the money out.
 */

export type SessionStep =
  | "idle"
  | "vault-mode"
  | "approving"
  | "depositing"
  | "granting"
  | "ready"
  | "revoking";

export interface UseSessionKey {
  sessionKey: SessionKey | null;
  authorized: boolean;
  step: SessionStep;
  error: string | null;
  market: MarketMeta | null;
  enable: (symbol: string, usdsoAmount: string) => Promise<void>;
  revoke: (symbol: string) => Promise<void>;
  withdrawAll: (symbol: string, usdsoAmount: string) => Promise<void>;
}

export function useSessionKey(): UseSessionKey {
  const { address } = useAccount();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();

  const [sessionKey, setSessionKey] = useState<SessionKey | null>(null);
  const [authorized, setAuthorized] = useState(false);
  const [step, setStep] = useState<SessionStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [market, setMarket] = useState<MarketMeta | null>(null);

  useEffect(() => {
    setSessionKey(peekSessionKey());
  }, []);

  /**
   * Ask the pool itself whether the key is authorised.
   *
   * Local state can be stale - the player may have revoked from another device,
   * or cleared this browser - so the contract is the only answer worth trusting.
   */
  const refreshAuthorization = useCallback(
    async (pool: `0x${string}`, operator: `0x${string}`) => {
      if (!publicClient || !address) return false;

      const ok = await publicClient.readContract({
        address: pool,
        abi: SPOT_POOL_ABI,
        functionName: "isOperatorAuthorized",
        args: [address, operator, OPERATOR_SELECTORS.placeOrderFor],
      });

      setAuthorized(Boolean(ok));
      return Boolean(ok);
    },
    [publicClient, address]
  );

  const enable = useCallback(
    async (symbol: string, usdsoAmount: string) => {
      if (!walletClient || !publicClient || !address) {
        setError("Connect a wallet first");
        return;
      }

      setError(null);

      try {
        const meta = await fetchMarket(symbol);
        if (!meta) throw new Error(`Market ${symbol} not found`);
        setMarket(meta);

        const key = getOrCreateSessionKey();
        if (!key) throw new Error("No browser storage available");
        setSessionKey(key);

        const amount = parseUnits(usdsoAmount, meta.quoteDecimals);
        const wait = (hash: `0x${string}`) =>
          publicClient.waitForTransactionReceipt({ hash });

        // 1. Fills have to settle to the vault rather than the wallet, or the
        //    session key would have nothing to trade against.
        setStep("vault-mode");
        await wait(
          await walletClient.writeContract({
            address: meta.pool,
            abi: SPOT_POOL_ABI,
            functionName: "setManualVaultMode",
            args: [true],
          })
        );

        // 2. Allowance, but only if the pool does not already have enough.
        const allowance = await publicClient.readContract({
          address: USDSO_ADDRESS,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, meta.pool],
        });

        if (allowance < amount) {
          setStep("approving");
          await wait(
            await walletClient.writeContract({
              address: USDSO_ADDRESS,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [meta.pool, amount],
            })
          );
        }

        // 3. The working capital the game trades with.
        setStep("depositing");
        await wait(
          await walletClient.writeContract({
            address: meta.pool,
            abi: SPOT_POOL_ABI,
            functionName: "deposit",
            args: [USDSO_ADDRESS, amount],
          })
        );

        // 4. Place and cancel only. Never withdraw.
        setStep("granting");
        await wait(
          await walletClient.writeContract({
            address: OPERATOR_REGISTRY_ADDRESS,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: "setOperatorApprovalForPool",
            args: [
              meta.pool,
              key.address,
              [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.cancelOrderFor],
              true,
            ],
          })
        );

        await refreshAuthorization(meta.pool, key.address);
        setStep("ready");
      } catch (e) {
        setStep("idle");
        setError((e as Error).message?.split("\n")[0] ?? "Setup failed");
      }
    },
    [walletClient, publicClient, address, refreshAuthorization]
  );

  const revoke = useCallback(
    async (symbol: string) => {
      if (!walletClient || !publicClient || !address) return;

      const key = peekSessionKey();
      if (!key) return;

      setError(null);
      setStep("revoking");

      try {
        const meta = market ?? (await fetchMarket(symbol));
        if (!meta) throw new Error(`Market ${symbol} not found`);

        await publicClient.waitForTransactionReceipt({
          hash: await walletClient.writeContract({
            address: OPERATOR_REGISTRY_ADDRESS,
            abi: OPERATOR_REGISTRY_ABI,
            functionName: "setOperatorApprovalForPool",
            args: [
              meta.pool,
              key.address,
              [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.cancelOrderFor],
              false,
            ],
          }),
        });

        // Revoke on chain first, forget locally second. A key that is forgotten
        // while still authorised is a key nobody can see and nobody can stop.
        await refreshAuthorization(meta.pool, key.address);
        forgetSessionKey();
        setSessionKey(null);
        setStep("idle");
      } catch (e) {
        setStep("ready");
        setError((e as Error).message?.split("\n")[0] ?? "Revoke failed");
      }
    },
    [walletClient, publicClient, address, market, refreshAuthorization]
  );

  /** Take the working capital back out of the vault. Owner only, by design. */
  const withdrawAll = useCallback(
    async (symbol: string, usdsoAmount: string) => {
      if (!walletClient || !publicClient) return;

      setError(null);

      try {
        const meta = market ?? (await fetchMarket(symbol));
        if (!meta) throw new Error(`Market ${symbol} not found`);

        await publicClient.waitForTransactionReceipt({
          hash: await walletClient.writeContract({
            address: meta.pool,
            abi: SPOT_POOL_ABI,
            functionName: "withdraw",
            args: [USDSO_ADDRESS, parseUnits(usdsoAmount, meta.quoteDecimals)],
          }),
        });
      } catch (e) {
        setError((e as Error).message?.split("\n")[0] ?? "Withdraw failed");
      }
    },
    [walletClient, publicClient, market]
  );

  return {
    sessionKey,
    authorized,
    step,
    error,
    market,
    enable,
    revoke,
    withdrawAll,
  };
}
