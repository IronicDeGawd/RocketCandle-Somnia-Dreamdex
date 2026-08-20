import assert from "node:assert/strict";
import { describe, mock, test } from "node:test";

import { buildTradingBridge, BuyInError } from "@/lib/tradingBridge";
import type { TradingClients } from "@/lib/orders";
import type { MarketMeta } from "@/lib/dreamdex";

/**
 * The vault as transit: money arrives at buy-in and leaves at run end.
 *
 * A buy-in now needs a wallet to fund it - refusing plainly when there is
 * none beats the pool-was-pre-funded assumption failing silently. A deposit
 * that lands with a failed buy has to say the money is still recoverable,
 * not that nothing happened. And a run's end has to sweep both sides: a
 * quote-only sweep is exactly the mistake that stranded 11 SOMI on this
 * project - the base side left behind after a partial fill.
 */

/** Emitted when an order is really accepted - copied from `orders.ts`. */
const ORDER_PLACED_TOPIC =
  "0xd90f62f61ee2f606b132cfdfd883ddd079228b6fd6bffd9d7cf848daf824639d";

const OWNER = "0xff1661f01687E6e1c50282256CD23D79EADBFCa4" as const;
const BASE = "0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00" as const;

const MARKET: MarketMeta = {
  symbol: "SOMI:USDso",
  pool: "0x259fD6559214dd5aD3752322426eA9F9fABEFff4",
  stopRegistry: null,
  base: BASE,
  baseIsNative: false,
  baseDecimals: 18,
  quoteDecimals: 18,
  minQuantity: "0.001",
  lotSize: "0.001",
  tickSize: "0.01",
};

/** A book with a flat 1.00 price on both sides - enough to fill any order. */
const FLAT_LEVEL = [
  { price: 1_000000000000000000n, quantity: 1_000000000000000000n },
];

/**
 * Trading clients that answer every real chain call an open-then-close does,
 * with the quote-side balance walking through a scripted ledger.
 *
 * @param quoteLedger successive answers to "what does the quote side hold",
 *   consumed one per call and holding at the last value once exhausted
 * @param orderAccepted whether the exchange accepts the next order placed -
 *   false reproduces "the deposit landed, the buy did not"
 */
function buildClients(
  quoteLedger: bigint[],
  orderAccepted = true
): TradingClients {
  const ledger = [...quoteLedger];
  const nextQuote = () => (ledger.length > 1 ? ledger.shift()! : ledger[0]);

  const publicClient = {
    readContract: async ({
      functionName,
    }: {
      functionName: string;
    }) => {
      if (functionName === "getBookLevels") return FLAT_LEVEL;
      if (functionName === "getWithdrawableBalance") return nextQuote();
      throw new Error(`unexpected read: ${functionName}`);
    },
    simulateContract: async () => ({
      result: [orderAccepted, 1n],
      request: {},
    }),
    estimateContractGas: async () => {
      throw new Error("estimation unsupported in this test - floor is used");
    },
    waitForTransactionReceipt: async () => ({
      status: "success",
      logs: [{ topics: [ORDER_PLACED_TOPIC, "0x1"] }],
    }),
  };

  const walletClient = {
    account: { address: OWNER },
    writeContract: async () => "0xorder" as const,
  };

  return {
    publicClient,
    walletClient,
    operator: OWNER,
  } as unknown as TradingClients;
}

describe("buildTradingBridge - funding a buy-in", () => {
  test("canBuyIn is false, and open() refuses, without an owner wallet", async () => {
    const untouchable = new Proxy(
      {},
      {
        get() {
          throw new Error("the bridge must not touch the chain without a wallet");
        },
      }
    ) as unknown as TradingClients;

    const bridge = buildTradingBridge({
      clients: untouchable,
      market: MARKET,
      owner: OWNER,
      ownerWallet: null,
    });

    assert.equal(bridge.canBuyIn, false);
    await assert.rejects(() => bridge.open(10, 8), BuyInError);
  });

  test("a landed deposit and a successful buy open the position", async () => {
    let deposited = 0;
    const clients = buildClients([
      10_000000000000000000n, // vaultBefore, right after the deposit
      2_000000000000000000n, // vaultAfter, having spent 8
    ]);

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: {} as never,
      depositCommitment: async (amount) => {
        deposited = amount;
      },
    });

    const snapshot = await bridge.open(10, 8);

    assert.equal(deposited, 10);
    assert.ok(snapshot);
    assert.equal(snapshot?.open, true);
    assert.ok(bridge.isOpen());
  });

  test("a landed deposit with a failed buy says the money is recoverable", async () => {
    const clients = buildClients([10_000000000000000000n], false);

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: {} as never,
      depositCommitment: async () => {
        // The deposit itself succeeds; only the buy is made to fail.
      },
    });

    await assert.rejects(
      () => bridge.open(10, 8),
      (err: unknown) => {
        assert.ok(err instanceof BuyInError);
        assert.equal(err.fundsAtExchange, true);
        return true;
      }
    );

    // Nothing opened - a failed buy must not leave a phantom position.
    assert.equal(bridge.isOpen(), false);
  });

  test("a deposit that never lands never claims funds are at the exchange", async () => {
    const clients = buildClients([10_000000000000000000n]);

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: {} as never,
      depositCommitment: async () => {
        throw new Error("the wallet rejected the deposit");
      },
    });

    await assert.rejects(() => bridge.open(10, 8), /rejected the deposit/);
    assert.equal(bridge.isOpen(), false);
  });

  test("a deposit that could not even be attempted is not mistaken for one that landed", async () => {
    // Stands in for the browser wallet's own deposit step refusing outright -
    // no wallet, wrong chain - before it ever reaches the exchange. That case
    // used to resolve quietly instead of throwing, so `open()` believed the
    // commitment had arrived and, once the buy failed, told a player their
    // money was "still at the exchange and can be returned" - a claim about
    // money that had never left their wallet.
    const clients = buildClients([10_000000000000000000n]);

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: {} as never,
      depositCommitment: async () => {
        throw new Error("Connect your wallet to fund this run");
      },
    });

    await assert.rejects(
      () => bridge.open(10, 8),
      (err: unknown) => {
        assert.ok(err instanceof BuyInError);
        assert.equal(err.fundsAtExchange, false);
        return true;
      }
    );

    assert.equal(bridge.isOpen(), false);
  });
});

describe("buildTradingBridge - close() sweeps both sides home", () => {
  test("close() reports what a working sweep actually returned", async () => {
    const clients = buildClients([
      10_000000000000000000n,
      2_000000000000000000n, // open: spent 8
      2_000000000000000000n,
      5_000000000000000000n, // close: sold for 3
    ]);

    let sweptCalled = false;
    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: {} as never,
      depositCommitment: async () => {},
      sweepHome: async () => {
        sweptCalled = true;
        return { quote: 0.5, base: 1.25 };
      },
    });

    await bridge.open(10, 8);
    const result = await bridge.close();

    assert.ok(sweptCalled);
    assert.ok(result);
    assert.equal(result?.sweepError, null);
    // Both sides come back, each already at its own decimals - a base
    // reading is never mistaken for dust or for the quote side.
    assert.deepEqual(result?.swept, { quote: 0.5, base: 1.25 });
    assert.equal(result?.pnl, 3 - 8);
  });

  test("a sweep failure is reported, not thrown - the P&L must still land", async () => {
    const clients = buildClients([
      10_000000000000000000n,
      2_000000000000000000n,
      2_000000000000000000n,
      5_000000000000000000n,
    ]);

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: {} as never,
      depositCommitment: async () => {},
      sweepHome: async () => {
        throw new Error("the base-side withdrawal reverted");
      },
    });

    await bridge.open(10, 8);
    const result = await bridge.close();

    assert.ok(result);
    assert.equal(result?.swept, null);
    assert.match(result?.sweepError ?? "", /base-side withdrawal reverted/);
    // The whole point: a broken sweep does not erase the run's result.
    assert.equal(result?.pnl, 3 - 8);
  });

  test("a sweep that could not even be attempted is not mistaken for one that ran and found nothing", async () => {
    const clients = buildClients([
      10_000000000000000000n,
      2_000000000000000000n,
      2_000000000000000000n,
      5_000000000000000000n,
    ]);

    // Stands in for the browser wallet's own sweep step refusing outright -
    // no wallet, wrong chain - before it ever asked the exchange for a
    // balance. That case used to resolve quietly with {quote: 0, base: 0}
    // instead of throwing, so close() reported the pool as swept and empty
    // when nothing had ever actually been asked for.
    const errorSpy = mock.method(console, "error", () => {});
    try {
      const bridge = buildTradingBridge({
        clients,
        market: MARKET,
        owner: OWNER,
        ownerWallet: {} as never,
        depositCommitment: async () => {},
        sweepHome: async () => {
          throw new Error("Connect your wallet to sweep the pool home");
        },
      });

      await bridge.open(10, 8);
      const result = await bridge.close();

      assert.ok(result);
      assert.notDeepEqual(result?.swept, { quote: 0, base: 0 });
      assert.equal(result?.swept, null);
      assert.match(
        result?.sweepError ?? "",
        /Connect your wallet to sweep the pool home/
      );
      // A sweep that could not even be attempted must leave a trace, not
      // vanish into a silent, successful-looking result.
      assert.equal(errorSpy.mock.calls.length, 1);
    } finally {
      errorSpy.mock.restore();
    }
  });
});

describe("buildTradingBridge - recovery: pool holds money, no position", () => {
  test("a base-side holding above the exchange's minimum is adopted", async () => {
    const clients = {
      publicClient: {
        readContract: async ({
          functionName,
          args,
        }: {
          functionName: string;
          args: readonly unknown[];
        }) => {
          if (functionName === "getBookLevels") return FLAT_LEVEL;
          if (functionName === "getWithdrawableBalance") {
            // Base side holds a real, sellable amount; quote is empty - the
            // exact shape a floor firing unattended leaves behind.
            return args[1] === BASE ? 2_000000000000000000n : 0n;
          }
          throw new Error(`unexpected read: ${functionName}`);
        },
      },
      walletClient: {},
      operator: OWNER,
    } as unknown as TradingClients;

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: null,
    });

    assert.equal(bridge.isOpen(), false);
    const snapshot = await bridge.recover();

    assert.ok(snapshot);
    assert.equal(snapshot?.open, true);
    assert.ok(bridge.isOpen());
  });

  test("dust below the minimum quantity is not mistaken for a position", async () => {
    const clients = {
      publicClient: {
        readContract: async ({
          functionName,
          args,
        }: {
          functionName: string;
          args: readonly unknown[];
        }) => {
          if (functionName === "getBookLevels") return FLAT_LEVEL;
          if (functionName === "getWithdrawableBalance") {
            return args[1] === BASE ? 1n : 0n; // far below minQuantity
          }
          throw new Error(`unexpected read: ${functionName}`);
        },
      },
      walletClient: {},
      operator: OWNER,
    } as unknown as TradingClients;

    const bridge = buildTradingBridge({
      clients,
      market: MARKET,
      owner: OWNER,
      ownerWallet: null,
    });

    const snapshot = await bridge.recover();
    assert.equal(snapshot, null);
    assert.equal(bridge.isOpen(), false);
  });
});
