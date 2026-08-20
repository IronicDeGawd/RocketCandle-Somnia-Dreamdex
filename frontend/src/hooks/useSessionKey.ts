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
import { encodeFunctionData, formatEther, parseEther, parseUnits } from "viem";

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
import { planSetupSteps, type Step } from "@/lib/setupSteps";
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

/**
 * One write, simulated first, and confirmed afterwards.
 *
 * Simulating names the contract's own reason before any gas is spent - the
 * difference between "the deposit was rejected on chain" and being told which
 * requirement failed. Confirming matters because a reverted call still returns
 * a receipt: awaiting the receipt alone once let a failed deposit report
 * success, and the panel announced trading was on over an empty vault.
 */
async function sendChecked(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  signer: NonNullable<Awaited<ReturnType<typeof getWalletClient>>>,
  account: `0x${string}`,
  step: Step
) {
  const { request } = await publicClient.simulateContract({
    address: step.address,
    abi: step.abi,
    functionName: step.functionName,
    args: step.args,
    account,
  } as never);

  const hash = await signer.writeContract(request as never);
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${step.label} was rejected on chain`);
  }
  return receipt;
}

/**
 * Run the steps, in one wallet prompt where the wallet allows it.
 *
 * Setting up trading and topping up the vault were several transactions each,
 * so a top-up cost four confirmations to do one thing. Wallets that support
 * batching can take them as a single approval; those that do not fall back to
 * signing them in order, which is what happened before.
 *
 * The fallback also carries the diagnosis: a failed batch reports only that the
 * batch failed, so it is replayed one step at a time, and simulation then names
 * the step and the reason.
 */
async function runSteps(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>,
  signer: NonNullable<Awaited<ReturnType<typeof getWalletClient>>>,
  account: `0x${string}`,
  steps: Step[]
) {
  if (steps.length === 0) return;

  const sequential = async () => {
    for (const step of steps) {
      await sendChecked(publicClient, signer, account, step);
    }
  };

  if (steps.length === 1) return sequential();

  try {
    const { id } = await signer.sendCalls({
      account: signer.account ?? account,
      chain: somniaNetwork,
      // Sequential is enough: these steps depend on each other in order, and
      // demanding all-or-nothing would refuse wallets that can still batch.
      forceAtomic: false,
      calls: steps.map((step) => ({
        to: step.address,
        data: encodeFunctionData({
          abi: step.abi,
          functionName: step.functionName,
          args: step.args,
        } as never),
      })),
    } as never);

    const result = await signer.waitForCallsStatus({ id });
    if (result.status !== "success") throw new Error("batch failed");
  } catch {
    // Either the wallet refused to batch, or the batch failed and the reason
    // is worth finding. Both end in the same place.
    await sequential();
  }
}

/*
 * Gas for the browser key, in native STT.
 *
 * The key signs and sends its own order transactions, so it pays their fees
 * itself - the player's wallet is nowhere in that path. Setup authorised the
 * key and funded the vault but never sent it a single coin, so the very first
 * buy-in died with "account does not exist": to the network, an address that
 * has never paid for anything does not exist at all.
 *
 * FUEL covers a run's worth of orders with room to spare; FLOOR is where a key
 * is close enough to empty that it needs topping up before the next run.
 */
const GAS_FUEL = parseEther("0.5");
const GAS_FLOOR = parseEther("0.15");

export type SessionStep =
  | "idle"
  | "switching-network"
  | "fuelling"
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
  /** Native STT held by the browser key, or null before it has been read. */
  keyGas: number | null;
  /** True when the key is too close to empty to pay for another run's orders. */
  keyOutOfGas: boolean;
  fuelKey: () => Promise<void>;
  /**
   * Set up trading, and top the vault up later through the same path.
   *
   * Every step is read first and skipped when already done, so this is one
   * transaction for a top-up and only as many as are genuinely missing for a
   * first-time setup.
   */
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
  const [keyGasRaw, setKeyGasRaw] = useState<bigint | null>(null);

  useEffect(() => {
    setSessionKey(peekSessionKey());
  }, []);

  /** Read what the browser key holds to pay its own transaction fees with. */
  const refreshKeyGas = useCallback(
    async (operator: `0x${string}`) => {
      if (!publicClient) return null;
      const balance = await publicClient.getBalance({ address: operator });
      setKeyGasRaw(balance);
      return balance;
    },
    [publicClient]
  );

  /**
   * Send the browser key enough native STT to pay for its own orders.
   *
   * Separate from enable() because a key can run dry long after setup is
   * finished, and re-walking four signatures to fix that would be absurd.
   */
  const sendGas = useCallback(
    async (
      signer: NonNullable<typeof walletClient>,
      operator: `0x${string}`
    ) => {
      const held = (await refreshKeyGas(operator)) ?? 0n;
      if (held >= GAS_FUEL) return;

      const owner = await publicClient!.getBalance({ address: address! });
      const shortfall = GAS_FUEL - held;

      if (owner < shortfall) {
        throw new Error(
          `Needs ${formatEther(shortfall)} STT for order fees but this ` +
            `wallet holds ${Number(formatEther(owner)).toFixed(3)}`
        );
      }

      setStep("fuelling");
      const hash = await signer.sendTransaction({
        to: operator,
        value: shortfall,
        account: signer.account!,
        chain: somniaNetwork,
      });
      await publicClient!.waitForTransactionReceipt({ hash });
      await refreshKeyGas(operator);
    },
    [publicClient, address, refreshKeyGas]
  );


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
      await refreshKeyGas(key.address);
    })();

    return () => {
      cancelled = true;
    };
  }, [symbol, address, publicClient, refreshAuthorization, refreshKeyGas]);

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

        // Fees for the key's own orders, before it is asked to place any.
        // Its own transfer, and it checks the key's balance first.
        await sendGas(signer, key.address);

        /*
         * Only what is actually missing.
         *
         * All four of these used to be fired every single call, so topping the
         * vault up cost four confirmations to do one thing - twice re-writing
         * state the chain already recorded. Each is now read first, and a step
         * already done contributes nothing to the prompt.
         */
        const [vaultModeOn, allowance, alreadyAuthorized] = await Promise.all([
          publicClient.readContract({
            address: meta.pool,
            abi: SPOT_POOL_ABI,
            functionName: "getManualVaultMode",
            args: [address],
          }) as Promise<boolean>,
          publicClient.readContract({
            address: USDSO_ADDRESS,
            abi: ERC20_ABI,
            functionName: "allowance",
            args: [address, meta.pool],
          }) as Promise<bigint>,
          refreshAuthorization(meta.pool, key.address),
        ]);

        const steps = planSetupSteps({
          pool: meta.pool,
          registry: operatorRegistryFor(chainId),
          operator: key.address,
          amount,
          vaultModeOn,
          allowance,
          alreadyAuthorized,
        });

        // The step names double as the progress label, so the panel says what
        // is happening rather than naming a step that was skipped.
        setStep(steps.length > 1 ? "depositing" : "approving");
        await runSteps(publicClient, signer, address, steps);

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
      sendGas,
    ]
  );

  /** Top up an already-authorised key that has spent its fees. */
  const fuelKey = useCallback(async () => {
    const key = peekSessionKey();
    if (!key || !publicClient || !address) return;

    setError(null);

    let signer = walletClient;
    if (chainId !== somniaNetwork.id || !signer) {
      try {
        setStep("switching-network");
        await switchChainAsync({ chainId: somniaNetwork.id });
        signer = await getWalletClient(wagmiConfig, {
          chainId: somniaNetwork.id,
        });
      } catch {
        setStep("idle");
        setError(`Approve the switch to ${somniaNetwork.name}, then try again`);
        return;
      }
    }
    if (!signer) {
      setStep("idle");
      setError(`Your wallet is not on ${somniaNetwork.name}`);
      return;
    }

    try {
      await sendGas(signer, key.address);
      setStep("ready");
    } catch (e) {
      setStep("idle");
      setError((e as Error).message?.split("\n")[0] ?? "Fuelling failed");
    }
  }, [walletClient, publicClient, address, chainId, switchChainAsync, sendGas]);

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

        /*
         * Checked, not merely awaited.
         *
         * This took the receipt as proof, and a reverted call produces one just
         * the same - so a refused revoke would have forgotten the key locally
         * while it stayed authorised on chain, which is exactly the outcome the
         * note below warns against.
         */
        await sendChecked(publicClient, walletClient, address, {
          label: "the revoke",
          address: operatorRegistryFor(chainId),
          abi: OPERATOR_REGISTRY_ABI,
          functionName: "setOperatorApprovalForPool",
          args: [
            meta.pool,
            key.address,
            [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.cancelOrderFor],
            false,
          ],
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
      if (!walletClient || !publicClient || !address) return;

      setError(null);

      try {
        const meta = market ?? (await fetchMarket(symbol));
        if (!meta) throw new Error(`Market ${symbol} not found`);

        // Same trap as the revoke: a refused withdrawal used to look like a
        // completed one, because only the receipt was awaited.
        await sendChecked(publicClient, walletClient, address, {
          label: "the withdrawal",
          address: meta.pool,
          abi: SPOT_POOL_ABI,
          functionName: "withdraw",
          args: [USDSO_ADDRESS, parseUnits(usdsoAmount, meta.quoteDecimals)],
        });
      } catch (e) {
        setError((e as Error).message?.split("\n")[0] ?? "Withdraw failed");
      }
    },
    [walletClient, publicClient, address, market]
  );

  return {
    sessionKey,
    authorized,
    step,
    error,
    market,
    keyGas: keyGasRaw === null ? null : Number(formatEther(keyGasRaw)),
    keyOutOfGas: keyGasRaw !== null && keyGasRaw < GAS_FLOOR,
    fuelKey,
    enable,
    revoke,
    withdrawAll,
  };
}
