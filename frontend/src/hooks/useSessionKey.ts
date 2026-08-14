"use client";

import { useCallback, useEffect, useState } from "react";
import {
  useAccount,
  useChainId,
  usePublicClient,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { getWalletClient } from "wagmi/actions";
import { somniaNetwork, wagmiConfig } from "@/lib/wagmi";
import { parseUnits } from "viem";

import {
  ERC20_ABI,
  OPERATOR_REGISTRY_ABI,
  OPERATOR_SELECTORS,
  operatorRegistryFor,
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
  | "switching-network"
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

/**
 * @param symbol the market to check existing setup against, if known
 */
export function useSessionKey(symbol?: string): UseSessionKey {
  const { address } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();
  const { data: walletClient } = useWalletClient();
  const { switchChainAsync } = useSwitchChain();

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

  /**
   * Ask the chain whether setup is already done, on load.
   *
   * Authorisation was only ever checked as the last step of enable(), so a
   * refresh forgot it entirely: a player who had already funded the vault and
   * authorised a key was shown "Set up trading" again and had to walk the whole
   * four-signature flow a second time to reach the buy-in.
   */
  useEffect(() => {
    if (!symbol || !address || !publicClient) return;

    let cancelled = false;

    (async () => {
      const key = peekSessionKey();
      if (!key) return;

      const meta = await fetchMarket(symbol).catch(() => null);
      if (!meta || cancelled) return;

      setMarket(meta);
      await refreshAuthorization(meta.pool, key.address);
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, address, publicClient, refreshAuthorization]);

  const enable = useCallback(
    async (symbol: string, usdsoAmount: string) => {
      if (!address) {
        setError("Connect a wallet first");
        return;
      }
      if (!publicClient) {
        setError("Could not reach the chain - try again in a moment");
        return;
      }

      setError(null);

      /*
       * Get onto Somnia before anything else.
       *
       * wagmi hands back no wallet client at all while the wallet sits on a
       * chain its config does not list - so a wallet connected to, say, Base
       * looked identical to no wallet, and this reported "Connect a wallet
       * first" to somebody who plainly had one connected.
       *
       * The switch used to be deferred to score submission, which is far too
       * late: every trade happens before that. It belongs here, at the first
       * step that needs to sign anything.
       */
      let signer = walletClient;

      if (chainId !== somniaNetwork.id || !signer) {
        try {
          setStep("switching-network");
          await switchChainAsync({ chainId: somniaNetwork.id });

          // Read the client straight from wagmi rather than waiting for the
          // hook to re-render, so this runs on without a second button press.
          signer = await getWalletClient(wagmiConfig, {
            chainId: somniaNetwork.id,
          });
        } catch {
          setStep("idle");
          setError(
            `Approve the switch to ${somniaNetwork.name} in your wallet, then try again`
          );
          return;
        }
      }

      if (!signer) {
        setStep("idle");
        setError(
          `Your wallet is not on ${somniaNetwork.name}. Switch network and try again`
        );
        return;
      }

      try {
        const meta = await fetchMarket(symbol);
        if (!meta) throw new Error(`Market ${symbol} not found`);
        setMarket(meta);

        const key = getOrCreateSessionKey();
        if (!key) throw new Error("No browser storage available");
        setSessionKey(key);

        const amount = parseUnits(usdsoAmount, meta.quoteDecimals);

        /*
         * A mined transaction is not a successful one.
         *
         * A reverted call still produces a receipt, and this only awaited the
         * receipt - so a deposit that reverted for want of balance sailed
         * through and the panel announced "Trading is on" over an empty vault.
         * The player then hit "Only 0.00 USDso available" at the buy-in, four
         * signatures and a pile of gas later, with nothing having said why.
         */
        const wait = async (hash: `0x${string}`, what: string) => {
          const receipt = await publicClient.waitForTransactionReceipt({ hash });
          if (receipt.status !== "success") {
            throw new Error(`${what} was rejected on chain`);
          }
          return receipt;
        };

        // Refuse before spending anything if the stake is not actually there.
        // Cheaper to read a balance than to sign four transactions and fail on
        // the third.
        const walletBalance = (await publicClient.readContract({
          address: USDSO_ADDRESS,
          abi: ERC20_ABI,
          functionName: "balanceOf",
          args: [address],
        })) as bigint;

        if (walletBalance < amount) {
          const held = Number(walletBalance) / 10 ** meta.quoteDecimals;
          setStep("idle");
          setError(
            `This wallet holds ${held.toFixed(2)} USDso but the stake is ` +
              `${usdsoAmount}. Lower the stake or top up.`
          );
          return;
        }

        // 1. Fills have to settle to the vault rather than the wallet, or the
        //    session key would have nothing to trade against.
        setStep("vault-mode");
        await wait(
          await signer.writeContract({
            address: meta.pool,
            abi: SPOT_POOL_ABI,
            functionName: "setManualVaultMode",
            args: [true],
          }),
          "vault mode"
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
            await signer.writeContract({
              address: USDSO_ADDRESS,
              abi: ERC20_ABI,
              functionName: "approve",
              args: [meta.pool, amount],
            }),
            "the USDso allowance"
          );
        }

        // 3. The working capital the game trades with.
        setStep("depositing");
        await wait(
          await signer.writeContract({
            address: meta.pool,
            abi: SPOT_POOL_ABI,
            functionName: "deposit",
            args: [USDSO_ADDRESS, amount],
          }),
          "the deposit"
        );

        // 4. Place and cancel only. Never withdraw.
        setStep("granting");
        await wait(
          await signer.writeContract({
            address: operatorRegistryFor(chainId),
            abi: OPERATOR_REGISTRY_ABI,
            functionName: "setOperatorApprovalForPool",
            args: [
              meta.pool,
              key.address,
              [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.cancelOrderFor],
              true,
            ],
          }),
          "the key authorisation"
        );

        await refreshAuthorization(meta.pool, key.address);
        setStep("ready");
      } catch (e) {
        setStep("idle");
        setError((e as Error).message?.split("\n")[0] ?? "Setup failed");
      }
    },
    [
      walletClient,
      publicClient,
      address,
      chainId,
      switchChainAsync,
      refreshAuthorization,
    ]
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
            address: operatorRegistryFor(chainId),
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
    [walletClient, publicClient, address, chainId, market, refreshAuthorization]
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
