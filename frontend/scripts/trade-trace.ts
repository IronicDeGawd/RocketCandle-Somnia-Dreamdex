/**
 * Drive the real trading library end to end, against the live testnet.
 *
 * Why this exists: `TradingBridge.open()` shipped with no caller anywhere in
 * the frontend, so the buy path had never once executed. Everything the game
 * claims about playing for keeps rests on it. This walks the whole sequence a
 * player takes - buy, top up, arm a floor, cancel it, sell out - printing the
 * vault balance between each step, so a silent failure has nowhere to hide.
 *
 * It imports the shipping modules directly. A reimplementation here would
 * prove nothing.
 *
 * Run from frontend/:
 *   node --experimental-strip-types --import ./scripts/register-hook.mjs \
 *        scripts/trade-trace.ts [SYMBOL] [STAKE]
 *
 * Spends real testnet funds. Small amounts, and every step is reversed.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { privateKeyToAccount } from "viem/accounts";

import {
  fetchMarket,
  USDSO_ADDRESS,
  SPOT_POOL_ABI,
  ERC20_ABI,
  OPERATOR_SELECTORS,
  OPERATOR_REGISTRY_ABI,
  operatorRegistryFor,
} from "@/lib/dreamdex";
import { createTradingClients, readVaultBalance, readTopOfBook } from "@/lib/orders";
import {
  openPosition,
  addToPosition,
  closePosition,
  markToMarket,
  estimateRoundTripCost,
} from "@/lib/position";
import { armStopLoss, cancelStop, readStopConfig } from "@/lib/stopOrder";

const SYMBOL = process.argv[2] ?? "SOMI:USDso";
const STAKE = Number(process.argv[3] ?? 0.5);
const TOP_UP = 0.5;
const FLOOR_DROP_PCT = 10;

/** Read PRIVATE_KEY out of the hardhat env without pulling in dotenv. */
function loadKey(): `0x${string}` {
  const envPath = path.resolve(
    import.meta.dirname,
    "..",
    "..",
    "hardhat-contracts",
    ".env"
  );
  const line = readFileSync(envPath, "utf8")
    .split("\n")
    .find((l) => l.trim().startsWith("PRIVATE_KEY="));

  if (!line) throw new Error(`No PRIVATE_KEY in ${envPath}`);

  const raw = line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  return (raw.startsWith("0x") ? raw : `0x${raw}`) as `0x${string}`;
}

let step = 0;
function say(what: string, detail?: unknown) {
  step += 1;
  console.log(`\n[${String(step).padStart(2, "0")}] ${what}`);
  if (detail !== undefined) console.log("     ", detail);
}

function fail(what: string, error: unknown): never {
  console.error(`\n  ✗ FAILED AT: ${what}`);
  console.error("   ", error instanceof Error ? error.message : error);
  if (error instanceof Error && error.stack) {
    console.error(error.stack.split("\n").slice(1, 5).join("\n"));
  }
  process.exit(1);
}

/**
 * Mirror the four on-chain steps of useSessionKey.enable(), idempotently.
 *
 * Here one account is both the player and the session key, so it approves
 * itself as its own operator. In the app these differ, but the calls and the
 * order are the same.
 */
async function ensureTradingEnabled(
  clients: ReturnType<typeof createTradingClients>,
  market: NonNullable<Awaited<ReturnType<typeof fetchMarket>>>,
  owner: `0x${string}`
) {
  const { publicClient, walletClient } = clients;
  const wait = (hash: `0x${string}`) =>
    publicClient.waitForTransactionReceipt({ hash });
  const NEEDED = 10n ** 18n * 2n; // 2 USDso of working capital

  const authorized = await publicClient.readContract({
    address: market.pool,
    abi: SPOT_POOL_ABI,
    functionName: "isOperatorAuthorized",
    args: [owner, owner, OPERATOR_SELECTORS.placeOrderFor],
  });

  const vault = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);

  if (authorized && vault >= STAKE + TOP_UP) {
    say("trading already enabled", `operator approved, vault ${vault} USDso`);
    return;
  }

  // Fills must settle to the vault, or there is nothing to trade against.
  await wait(
    await walletClient.writeContract({
      address: market.pool,
      abi: SPOT_POOL_ABI,
      functionName: "setManualVaultMode",
      args: [true],
      chain: walletClient.chain,
      account: walletClient.account!,
    })
  );
  say("manual vault mode on");

  if (vault < STAKE + TOP_UP) {
    const allowance = (await publicClient.readContract({
      address: USDSO_ADDRESS,
      abi: ERC20_ABI,
      functionName: "allowance",
      args: [owner, market.pool],
    })) as bigint;

    if (allowance < NEEDED) {
      await wait(
        await walletClient.writeContract({
          address: USDSO_ADDRESS,
          abi: ERC20_ABI,
          functionName: "approve",
          args: [market.pool, NEEDED],
          chain: walletClient.chain,
          account: walletClient.account!,
        })
      );
      say("allowance granted", `${Number(NEEDED) / 1e18} USDso`);
    }

    await wait(
      await walletClient.writeContract({
        address: market.pool,
        abi: SPOT_POOL_ABI,
        functionName: "deposit",
        args: [USDSO_ADDRESS, NEEDED],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
    );
    say("deposited into vault", `${Number(NEEDED) / 1e18} USDso`);
  }

  if (!authorized) {
    const chainId = await publicClient.getChainId();
    await wait(
      await walletClient.writeContract({
        address: operatorRegistryFor(chainId),
        abi: OPERATOR_REGISTRY_ABI,
        functionName: "setOperatorApprovalForPool",
        args: [
          market.pool,
          owner,
          [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.cancelOrderFor],
          true,
        ],
        chain: walletClient.chain,
        account: walletClient.account!,
      })
    );
    say("operator approved", "placeOrderFor + cancelOrderFor");
  }
}

async function main() {
  const key = loadKey();
  const owner = privateKeyToAccount(key).address;

  console.log(`\n=== TRADE TRACE — ${SYMBOL} — stake ${STAKE} USDso ===`);
  console.log(`owner/operator: ${owner}`);

  // The deployer key stands in for both the player's wallet and the browser's
  // session key. In the app these are two different keys; here one account
  // plays both parts, which is enough to prove the call path works.
  const clients = createTradingClients(key);

  const market = await fetchMarket(SYMBOL, "testnet");
  if (!market) fail("fetchMarket", new Error(`${SYMBOL} not listed`));
  say("market found", {
    pool: market.pool,
    stopRegistry: market.stopRegistry ?? "(none - stops unavailable)",
    lotSize: market.lotSize,
    minQuantity: market.minQuantity,
    tickSize: market.tickSize,
  });

  const book = await readTopOfBook(clients, market).catch((e) =>
    fail("readTopOfBook", e)
  );
  say("top of book", book);

  // ---- the setup the app calls "enable trading" ----
  //
  // Skipping this is what made the first run of this trace revert: an order is
  // refused unless an operator has been approved for the pool, even when the
  // operator and the owner are the same account. Each step is checked before
  // it is sent, so re-running the trace costs nothing.
  await ensureTradingEnabled(clients, market, owner);

  const vaultStart = await readVaultBalance(
    clients,
    market,
    owner,
    USDSO_ADDRESS
  ).catch((e) => fail("readVaultBalance", e));
  say("vault before", `${vaultStart} USDso`);

  if (vaultStart < STAKE + TOP_UP) {
    fail(
      "vault funding",
      new Error(
        `Vault holds ${vaultStart} USDso but the trace needs ${STAKE + TOP_UP}.`
      )
    );
  }

  const cost = await estimateRoundTripCost(clients, market, STAKE).catch((e) =>
    fail("estimateRoundTripCost", e)
  );
  say("round trip cost", cost);

  // ---- the step that has never run ----
  const position = await openPosition(clients, market, owner, STAKE).catch((e) =>
    fail("openPosition  <<< THE UNPROVEN STEP", e)
  );
  say("POSITION OPENED", {
    quantity: position.quantity,
    costUsdso: position.costUsdso,
    entryPrice: position.entryPrice,
    tx: position.openTxHash,
  });

  const marked = await markToMarket(clients, market, position).catch((e) =>
    fail("markToMarket", e)
  );
  say("marked to market", marked);

  const grown = await addToPosition(clients, market, owner, position, TOP_UP)
    .catch((e) => fail("addToPosition (the F key)", e));
  say("topped up", {
    quantity: grown.quantity,
    costUsdso: grown.costUsdso,
    entryPrice: grown.entryPrice,
  });

  // ---- the floor ----
  if (!market.stopRegistry) {
    say("stop skipped", "this market has no registry");
  } else {
    const config = await readStopConfig(
      clients.publicClient,
      market.stopRegistry
    ).catch((e) => fail("readStopConfig", e));
    say("stop terms", config);

    const triggerPrice = grown.entryPrice * (1 - FLOOR_DROP_PCT / 100);

    const stop = await armStopLoss({
      publicClient: clients.publicClient,
      walletClient: clients.walletClient,
      market,
      owner,
      quantity: grown.quantity,
      triggerPrice,
    }).catch((e) => fail("armStopLoss", e));
    say("STOP ARMED", {
      orderId: stop.orderId.toString(),
      triggerPrice,
      deposit: config.deposit,
    });

    const cancelTx = await cancelStop(
      clients.publicClient,
      clients.walletClient,
      stop,
      owner
    ).catch((e) => fail("cancelStop  <<< DEPOSIT AT RISK IF THIS FAILS", e));
    say("stop cancelled, deposit refunded", cancelTx);
  }

  const closed = await closePosition(clients, market, owner, grown).catch((e) =>
    fail("closePosition (the E key)", e)
  );
  say("POSITION CLOSED", closed);

  const vaultEnd = await readVaultBalance(clients, market, owner, USDSO_ADDRESS);
  say("vault after", `${vaultEnd} USDso`);

  const bled = vaultStart - vaultEnd;
  // The estimate is quoted per STAKE, but the trace buys twice - stake plus
  // the top-up - so it has to be scaled before the two can be compared.
  const traded = STAKE + TOP_UP;
  const predicted = (cost?.estimatedUsdso ?? 0) * (traded / STAKE);

  console.log(`\n=== TRACE COMPLETE ===`);
  console.log(`traded          ${traded} USDso`);
  console.log(`actually cost   ${bled.toFixed(6)} USDso`);
  console.log(`estimate said   ${predicted.toFixed(6)} USDso`);
}

main().catch((e) => fail("unexpected", e));
