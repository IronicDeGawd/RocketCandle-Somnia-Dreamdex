import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { minStakeFor } from "@/lib/minimums";
import type { MarketMeta } from "@/lib/dreamdex";

/**
 * The smallest buy a market will take, in money.
 *
 * Each spot market states its minimum in the token being bought, so the same
 * stake that is generous for a cheap token is far below the minimum for an
 * expensive one. Getting this wrong does not throw here - it throws at the
 * exchange, after the player has committed.
 */

const base = {
  pool: "0x259fD6559214dd5aD3752322426eA9F9fABEFff4",
  stopRegistry: null,
  base: "0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00",
  baseIsNative: false,
  quoteDecimals: 18,
} as const;

/** Cheap token, minimum of one whole unit. */
const SOMI: MarketMeta = {
  ...base,
  symbol: "SOMI:USDso",
  baseDecimals: 18,
  minQuantity: "1",
  lotSize: "0.01",
  tickSize: "0.0001",
};

/** Expensive token, tiny minimum - where the money minimum bites. */
const WBTC: MarketMeta = {
  ...base,
  symbol: "WBTC:USDso",
  baseDecimals: 8,
  minQuantity: "0.0001",
  lotSize: "0.0001",
  tickSize: "0.01",
};

describe("minStakeFor", () => {
  test("prices the minimum quantity, not a fixed sum of money", () => {
    const somi = minStakeFor(SOMI, 0.0917);
    const wbtc = minStakeFor(WBTC, 60_000);

    assert.ok(somi && wbtc);
    // One SOMI is small change; the same 1 USDso cannot buy WBTC's minimum.
    assert.ok(somi.usdso < 0.2, `somi min was ${somi.usdso}`);
    assert.ok(wbtc.usdso > 5, `wbtc min was ${wbtc.usdso}`);
  });

  test("quotes the price a buy really pays, above the ask", () => {
    const min = minStakeFor(SOMI, 0.0917);
    assert.ok(min);
    // Orders cross the touch to fill now, so the minimum has to be priced at
    // what is actually paid rather than at the quoted ask.
    assert.ok(min.price >= 0.0917, `priced at ${min.price}`);
  });

  test("snaps the price to a whole tick", () => {
    const min = minStakeFor(SOMI, 0.0917);
    assert.ok(min);
    const ticks = min.price / 0.0001;
    assert.ok(
      Math.abs(ticks - Math.round(ticks)) < 1e-6,
      `${min.price} is not a whole number of ticks`
    );
  });

  test("rounds a minimum that is not a whole lot up, never down", () => {
    // A minimum of 1.5 lots must become 2 lots: rounding down would land
    // under the minimum and be refused.
    const odd: MarketMeta = { ...SOMI, minQuantity: "0.015", lotSize: "0.01" };
    const min = minStakeFor(odd, 1);
    assert.ok(min);
    assert.equal(min.quantity, 0.02);
  });

  test("the figure a player is held to carries a lot of headroom", () => {
    // A stake is divided by the price to get a quantity, and that quantity is
    // rounded DOWN to a lot - so the exact minimum can round to just under it.
    const min = minStakeFor(SOMI, 0.0917);
    assert.ok(min);
    assert.ok(
      min.safeUsdso > min.usdso,
      "the required stake must exceed the bare minimum"
    );
  });

  test("an empty book has no minimum to quote", () => {
    // Nobody selling means no price, and inventing one would gate players on
    // a number with nothing behind it.
    assert.equal(minStakeFor(SOMI, 0), null);
  });
});
