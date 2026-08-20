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
import { planDepositSteps, planSetupSteps, type Step } from "@/lib/setupSteps";
import {
  forgetSessionKey,
  getOrCreateSessionKey,
  peekSessionKey,
  type SessionKey,
} from "@/lib/sessionKey";
import {
  createTradingClients,
  fromRaw,
  GAS_FLOOR_NATIVE_BUY,
  MINIMUM_BASE_FEE_PER_GAS,
  TRADING_POOL_ABI,
} from "@/lib/orders";
import { sweepAmount } from "@/lib/gasSweep";
import { mapWalletError } from "@/lib/walletErrors";

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
 * FUEL covers a run's worth of orders with room to spare; the floor a key is
 * checked against is derived below, not fixed - mainnet fees are not
 * testnet's, and a constant is either too low to cover a real buy or too
 * high to stop nagging a key that holds plenty.
 */
const GAS_FUEL = parseEther("0.15");

/** The floor's headroom over the worst-case single-transaction cost. */
const GAS_FLOOR_MULTIPLIER = 3n;
const GAS_FLOOR_DIVISOR = 2n;

/**
 * The most a fee read can be trusted to say right now, or the fallback if
 * the chain gives nothing back.
 */
async function currentFeePerGas(
  publicClient: NonNullable<ReturnType<typeof usePublicClient>>
): Promise<bigint> {
  try {
    const fees = await publicClient.estimateFeesPerGas();
    return fees.maxFeePerGas ?? MINIMUM_BASE_FEE_PER_GAS;
  } catch {
    return MINIMUM_BASE_FEE_PER_GAS;
  }
}

/** x1.5 on the same limit a real native-base buy is sent with. */
function deriveGasFloor(feePerGas: bigint): bigint {
  return (GAS_FLOOR_NATIVE_BUY * feePerGas * GAS_FLOOR_MULTIPLIER) / GAS_FLOOR_DIVISOR;
}

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
  /** The derived floor `keyOutOfGas` is checked against, in native STT. */
  keyGasFloor: number;
  /** What revoking right now would hand back, in native STT. */
  keySweepPreview: number | null;
  /** Set once a sweep - inside revoke or on its own - actually lands. */
  sweptAmount: number | null;
  /** A sweep that failed during revoke, non-fatal: the revoke still went through. */
  sweepWarning: string | null;
  fuelKey: () => Promise<void>;
  sweepKey: () => Promise<void>;
  /**
   * Set up trading: the standing allowance, vault mode, and the key
   * authorisation. No money moves here any more - a run's own buy-in deposits
   * what it needs through `depositFor`.
   *
   * Every step is read first and skipped when already done, so a re-run
   * after the account is already set up costs no signature at all.
   */
  enable: (symbol: string) => Promise<void>;
  /**
   * Fund one run. Owner-signed, batched into a single wallet prompt with
   * `runSteps` where the wallet supports it - approve-if-needed and deposit
   * together, since setup's standing allowance may already cover it.
   */
  depositFor: (symbol: string, usdsoAmount: string) => Promise<void>;
  /**
   * Bring everything the pool holds home, on both sides, each decoded at its
   * own decimals.
   *
   * A base-side sweep that goes unnoticed strands tokens at the exchange
   * with nothing left in the app that knows to ask for them back - that
   * exact bug cost 11 SOMI on this project already. Returns what was
   * actually swept, so a caller can tell a player what came home.
   */
  sweepHome: (symbol: string) => Promise<{ quote: number; base: number }>;
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
  const [feePerGasRaw, setFeePerGasRaw] = useState<bigint>(
    MINIMUM_BASE_FEE_PER_GAS
  );
  const [keyGasFloorRaw, setKeyGasFloorRaw] = useState<bigint>(
    deriveGasFloor(MINIMUM_BASE_FEE_PER_GAS)
  );
  const [sweptAmount, setSweptAmount] = useState<number | null>(null);
  const [sweepWarning, setSweepWarning] = useState<string | null>(null);

  useEffect(() => {
    setSessionKey(peekSessionKey());
  }, []);

  /**
   * Read what the browser key holds to pay its own transaction fees with,
   * and re-derive the floor it is checked against - mainnet fees move, so
   * this is the one place that recomputes both together.
   */
  const refreshKeyGas = useCallback(
    async (operator: `0x${string}`) => {
      if (!publicClient) return null;
      const [balance, feePerGas] = await Promise.all([
        publicClient.getBalance({ address: operator }),
        currentFeePerGas(publicClient),
      ]);
      setKeyGasRaw(balance);
      setFeePerGasRaw(feePerGas);
      setKeyGasFloorRaw(deriveGasFloor(feePerGas));
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
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("The fuelling transaction reverted");
      }
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
    async (symbol: string) => {
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

        // Fees for the key's own orders, before it is asked to place any.
        // Its own transfer, and it checks the key's balance first.
        await sendGas(signer, key.address);

        /*
         * Only what is actually missing.
         *
         * These used to be fired every single call, so topping the vault up
         * cost several confirmations to do one thing - re-writing state the
         * chain already recorded. Each is now read first, and a step already
         * done contributes nothing to the prompt.
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
          vaultModeOn,
          allowance,
          alreadyAuthorized,
        });

        // The step names double as the progress label, so the panel says what
        // is happening rather than naming a step that was skipped. No step
        // here ever deposits any more, so "approving" covers all of them.
        setStep(steps.length > 0 ? "approving" : "ready");
        await runSteps(publicClient, signer, address, steps);

        await refreshAuthorization(meta.pool, key.address);
        setStep("ready");
      } catch (e) {
        console.error("Failed to set up trading:", e);
        setStep("idle");
        setError(mapWalletError(e).message);
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

  /**
   * Fund one run. Owner-signed, because the deposit moves the player's own
   * money - the session key can trade what is in the pool but can never put
   * anything into it.
   *
   * Reads the live allowance rather than assuming setup's standing one is
   * still enough, so a wallet that revoked or lowered it between runs still
   * gets a correct plan instead of a deposit that reverts on its own
   * allowance check.
   */
  const depositFor = useCallback(
    async (symbol: string, usdsoAmount: string) => {
      /*
       * This moves the player's own money. A wallet that is missing, or a
       * chain the config does not recognise, used to fall through here
       * silently - `open()` then awaited a deposit that had resolved having
       * done nothing, believed the commitment had reached the exchange, and
       * told a player their money was "still at the exchange and can be
       * returned" when it had in fact never left their wallet. Throwing is
       * what lets that message stay true.
       */
      if (!publicClient || !address) {
        throw new Error("Connect your wallet to fund this run");
      }

      setError(null);

      // Owner-signed, same as enable() and fuelKey() - a wallet parked on
      // another chain needs the same switch before it can sign a deposit.
      let signer = walletClient;
      if (chainId !== somniaNetwork.id || !signer) {
        try {
          setStep("switching-network");
          await switchChainAsync({ chainId: somniaNetwork.id });
          signer = await getWalletClient(wagmiConfig, {
            chainId: somniaNetwork.id,
          });
        } catch {
          setStep("ready");
          const message = `Approve the switch to ${somniaNetwork.name} in your wallet, then try again`;
          setError(message);
          throw new Error(message);
        }
      }
      if (!signer) {
        setStep("ready");
        const message = `Your wallet is not on ${somniaNetwork.name}`;
        setError(message);
        throw new Error(message);
      }

      try {
        const meta = market ?? (await fetchMarket(symbol));
        if (!meta) throw new Error(`Market ${symbol} not found`);

        const amount = parseUnits(usdsoAmount, meta.quoteDecimals);

        const allowance = (await publicClient.readContract({
          address: USDSO_ADDRESS,
          abi: ERC20_ABI,
          functionName: "allowance",
          args: [address, meta.pool],
        })) as bigint;

        const steps = planDepositSteps({ pool: meta.pool, amount, allowance });

        setStep("depositing");
        await runSteps(publicClient, signer, address, steps);
        setStep("ready");
      } catch (e) {
        console.error("Failed to deposit for a run:", e);
        setStep("ready");
        setError(mapWalletError(e).message);
        throw e;
      }
    },
    [walletClient, publicClient, address, market, chainId, switchChainAsync]
  );

  /**
   * Bring both sides of the pool home. Owner-signed, and reads the exact
   * amount held on each side rather than a remembered figure - the exchange
   * is the only source of truth for what is actually still there.
   */
  const sweepHome = useCallback(
    async (symbol: string): Promise<{ quote: number; base: number }> => {
      /*
       * A sweep that was never attempted must never look like a sweep that
       * ran and found nothing - `close()` records exactly the object this
       * returns as what came home, so a silent {quote: 0, base: 0} here
       * states the pool was checked and was empty, when in truth nothing
       * left at the exchange was ever asked for. That is the same
       * invisible-balance outcome an unswept base side already cost this
       * project once.
       */
      if (!publicClient || !address) {
        throw new Error("Connect your wallet to sweep the pool home");
      }

      // Owner-signed, same as enable() and fuelKey() - a wallet parked on
      // another chain needs the same switch before it can sign a sweep.
      let signer = walletClient;
      if (chainId !== somniaNetwork.id || !signer) {
        try {
          setStep("switching-network");
          await switchChainAsync({ chainId: somniaNetwork.id });
          signer = await getWalletClient(wagmiConfig, {
            chainId: somniaNetwork.id,
          });
        } catch {
          setStep("ready");
          throw new Error(
            `Approve the switch to ${somniaNetwork.name} in your wallet, then try again`
          );
        }
      }
      if (!signer) {
        setStep("ready");
        throw new Error(`Your wallet is not on ${somniaNetwork.name}`);
      }

      const meta = market ?? (await fetchMarket(symbol));
      if (!meta) throw new Error(`Market ${symbol} not found`);

      const [quoteRaw, baseRaw] = await Promise.all([
        publicClient.readContract({
          address: meta.pool,
          abi: TRADING_POOL_ABI,
          functionName: "getWithdrawableBalance",
          args: [address, USDSO_ADDRESS],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: meta.pool,
          abi: TRADING_POOL_ABI,
          functionName: "getWithdrawableBalance",
          args: [address, meta.base],
        }) as Promise<bigint>,
      ]);

      const steps: Step[] = [];
      if (quoteRaw > 0n) {
        steps.push({
          label: "the quote-side sweep",
          address: meta.pool,
          abi: SPOT_POOL_ABI,
          functionName: "withdraw",
          args: [USDSO_ADDRESS, quoteRaw],
        });
      }
      // The side a partial fill leaves behind - stranded for good if this is
      // ever skipped, since nothing else in the app knows to ask for it.
      if (baseRaw > 0n) {
        steps.push({
          label: "the base-side sweep",
          address: meta.pool,
          abi: SPOT_POOL_ABI,
          functionName: "withdraw",
          args: [meta.base, baseRaw],
        });
      }

      if (steps.length > 0) {
        await runSteps(publicClient, signer, address, steps);
      }

      return {
        quote: fromRaw(quoteRaw, meta.quoteDecimals),
        base: fromRaw(baseRaw, meta.baseDecimals),
      };
    },
    [walletClient, publicClient, address, market, chainId, switchChainAsync]
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
      console.error("Failed to fuel the session key:", e);
      setStep("idle");
      setError(mapWalletError(e).message);
    }
  }, [walletClient, publicClient, address, chainId, switchChainAsync, sendGas]);

  /**
   * Hand back what the key is not going to spend, straight from the key -
   * the key already has its own signer, so this needs no wallet popup and
   * no owner signature.
   */
  const sweepKey = useCallback(async () => {
    const key = peekSessionKey();
    if (!key || !publicClient || !address) return;

    const [balance, feePerGas] = await Promise.all([
      publicClient.getBalance({ address: key.address }),
      currentFeePerGas(publicClient),
    ]);
    const amount = sweepAmount(balance, feePerGas);
    if (amount === 0n) return;

    const { walletClient: keySigner } = createTradingClients(key.privateKey);
    const hash = await keySigner.sendTransaction({
      to: address,
      value: amount,
      account: keySigner.account!,
      chain: somniaNetwork,
    });
    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error("The sweep transaction reverted");
    }

    setSweptAmount(Number(formatEther(amount)));
    await refreshKeyGas(key.address);
  }, [publicClient, address, refreshKeyGas]);

  const revoke = useCallback(
    async (symbol: string) => {
      if (!walletClient || !publicClient || !address) return;

      const key = peekSessionKey();
      if (!key) return;

      setError(null);
      setSweepWarning(null);
      setStep("revoking");

      try {
        const meta = market ?? (await fetchMarket(symbol));
        if (!meta) throw new Error(`Market ${symbol} not found`);

        /*
         * Sweep, then revoke, then forget - in that order and no other.
         *
         * A failed sweep changes nothing and can be retried, so it must not
         * block the revoke: losing the ability to revoke is worse than
         * losing the key's leftover gas. Revoking first would be the
         * dangerous order - the leftover becomes unrecoverable the instant
         * the key is forgotten.
         */
        let sweepFailed = false;
        try {
          await sweepKey();
        } catch (e) {
          sweepFailed = true;
          console.error("Sweep before revoke failed", e);
          setSweepWarning(
            `Could not return the key's leftover gas: ${mapWalletError(e).message} ` +
              `The key stays in this browser so you can retry the return; it can no ` +
              `longer trade.`
          );
        }

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

        /*
         * Keep the key when its gas could not be returned.
         *
         * Forgetting it here is what makes the leftover unrecoverable - the
         * private key lives only in this browser, so discarding it discards the
         * money with it. The warning above promises a retry, and this is what
         * leaves something to retry with. The key is already revoked on chain by
         * this point, so keeping it grants no trading power.
         */
        if (!sweepFailed) {
          forgetSessionKey();
          setSessionKey(null);
        }
        setStep("idle");
      } catch (e) {
        console.error("Failed to revoke the session key:", e);
        setStep("ready");
        setError(mapWalletError(e).message);
      }
    },
    [
      walletClient,
      publicClient,
      address,
      chainId,
      market,
      refreshAuthorization,
      sweepKey,
    ]
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
        console.error("Failed to withdraw from the vault:", e);
        setError(mapWalletError(e).message);
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
    keyOutOfGas: keyGasRaw !== null && keyGasRaw < keyGasFloorRaw,
    keyGasFloor: Number(formatEther(keyGasFloorRaw)),
    keySweepPreview:
      keyGasRaw === null
        ? null
        : Number(formatEther(sweepAmount(keyGasRaw, feePerGasRaw))),
    sweptAmount,
    sweepWarning,
    fuelKey,
    sweepKey,
    enable,
    depositFor,
    sweepHome,
    revoke,
    withdrawAll,
  };
}
