/**
 * The position: what a round trip costs, and when the floor breaks.
 *
 * These are the numbers shown to a player before they commit money and the
 * predicate that decides whether to sell them out. Both were wrong at some
 * point and neither failure was visible: the cost was understated by about
 * half, and a zero floor would have sold every position instantly.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { estimateRoundTripCost, hasBrokenFloor } from "@/lib/position";
import type { MarketMeta } from "@/lib/dreamdex";
import type { TradingClients } from "@/lib/orders";

/**
 * A market shaped like the real SOMI:USDso pool.
 *
 * The tick matters: at 0.0001 on a price near 0.0917 it is as wide as the
 * whole spread, which is precisely what the cost estimate used to miss.
 */
const SOMI_MARKET: MarketMeta = {
  symbol: "SOMI:USDso",
  pool: "0x259fD6559214dd5aD3752322426eA9F9fABEFff4",
  stopRegistry: "0xEb97349Aa62A68507c0bE535eD88B0d028a47E1e",
  baseIsNative: false,
  baseDecimals: 18,
  quoteDecimals: 18,
  minQuantity: "1",
  lotSize: "0.01",
  tickSize: "0.0001",
};

/**
 * Stand in for the exchange with a fixed book.
 *
 * estimateRoundTripCost only reads the top of book, so a client that answers
 * that one call is enough - and keeps the test off the network, which is what
 * makes it worth running on every change.
 */
function clientsWithBook(bestBid: number, bestAsk: number): TradingClients {
  const toRaw18 = (v: number) => BigInt(Math.round(v * 1e18));

  return {
    publicClient: {
      // readTopOfBook calls getBookLevels once per side, with `true` for bids.
      readContract: async ({
        functionName,
        args,
      }: {
        functionName: string;
        args: readonly unknown[];
      }) => {
        if (functionName !== "getBookLevels") {
          throw new Error(`unexpected read: ${functionName}`);
        }
        const isBid = args[0] === true;
        return [{ price: toRaw18(isBid ? bestBid : bestAsk) }];
      },
    },
    walletClient: {},
    operator: "0x0000000000000000000000000000000000000001",
  } as unknown as TradingClients;
}

describe("estimateRoundTripCost", () => {
  test("charges more than the raw spread", async () => {
    // The bug this locks down: the panel promised "the gap between the buy and
    // sell price" and quoted 0.109%, while a real round trip cost 0.196%.
    // Orders cross the touch to fill now, then snap to a whole tick - and on
    // this market one tick is the whole spread, so it is paid twice.
    const clients = clientsWithBook(0.0916, 0.0917);
    const stake = 1;

    const cost = await estimateRoundTripCost(clients, SOMI_MARKET, stake);
    assert.ok(cost, "expected a quote");

    const quotedPct = (cost.estimatedUsdso / stake) * 100;

    assert.ok(
      quotedPct > cost.spreadPct,
      `expected more than the ${cost.spreadPct}% spread, got ${quotedPct}%`
    );
  });

  test("lands near the 0.196% actually measured on chain", async () => {
    // Measured by scripts/trade-trace.ts against the live testnet. Being a
    // little cautious is correct for a number shown before someone commits;
    // being under is not.
    const clients = clientsWithBook(0.0916, 0.0917);
    const cost = await estimateRoundTripCost(clients, SOMI_MARKET, 1);
    assert.ok(cost);

    const pct = cost.estimatedUsdso * 100;
    assert.ok(pct >= 0.196, `must not understate the real cost, got ${pct}%`);
    assert.ok(pct < 0.35, `must not scare the player either, got ${pct}%`);
  });

  test("scales with the stake", async () => {
    const clients = clientsWithBook(0.0916, 0.0917);

    const one = await estimateRoundTripCost(clients, SOMI_MARKET, 1);
    const ten = await estimateRoundTripCost(clients, SOMI_MARKET, 10);
    assert.ok(one && ten);

    // Same fraction of a ten-times bigger stake.
    assert.ok(
      Math.abs(ten.estimatedUsdso - one.estimatedUsdso * 10) < 1e-9,
      "cost must be proportional to the stake"
    );
  });

  test("is never negative, even on a crossed book", async () => {
    // A bid above the ask should never be reported as free money.
    const clients = clientsWithBook(0.0920, 0.0917);
    const cost = await estimateRoundTripCost(clients, SOMI_MARKET, 1);
    assert.ok(cost);
    assert.ok(cost.estimatedUsdso >= 0, "cost cannot be negative");
  });

  test("returns null rather than a wrong number on an empty book", async () => {
    const empty = {
      publicClient: { readContract: async () => [] },
      walletClient: {},
      operator: "0x0000000000000000000000000000000000000001",
    } as unknown as TradingClients;

    assert.equal(await estimateRoundTripCost(empty, SOMI_MARKET, 1), null);
  });
});

describe("hasBrokenFloor", () => {
  test("breaks only strictly below the floor", () => {
    assert.equal(hasBrokenFloor(0.9, 1), true);
    assert.equal(hasBrokenFloor(1.1, 1), false);
    // Exactly at the floor is not through it. Selling here would eject a
    // player whose position has not actually fallen.
    assert.equal(hasBrokenFloor(1, 1), false);
  });

  test("a zero floor never triggers", () => {
    // This is the guard that matters most. Before a floor is set the value is
    // zero, and "current < 0" would be false, but "current < floor" with an
    // unguarded zero floor is a trap for any later refactor - a position at
    // any price would look broken the moment the comparison flipped.
    assert.equal(hasBrokenFloor(0.0001, 0), false);
    assert.equal(hasBrokenFloor(0, 0), false);
  });

  test("a negative floor never triggers", () => {
    assert.equal(hasBrokenFloor(1, -1), false);
  });
});
