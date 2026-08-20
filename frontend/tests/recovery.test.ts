import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { detectStrandedFunds, selectAutoAttemptTargets } from "@/lib/recovery";

/**
 * Whether a pool is holding money the player should be told about.
 *
 * Covers both sides separately because a partial fill leaves base tokens
 * behind - the exact case that has already cost real money on this project -
 * and covers the "position open" suppression, since that money is working,
 * not stranded.
 */

const MIN_QUANTITY = "0.001";

describe("detectStrandedFunds", () => {
  test("money on the quote side only is reported", () => {
    const result = detectStrandedFunds({
      quote: 6.999,
      base: 0,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(result.strandable, true);
    assert.equal(result.quote, 6.999);
    assert.equal(result.base, 0);
  });

  test("money on the base side only is reported", () => {
    const result = detectStrandedFunds({
      quote: 0,
      base: 0.5,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(result.strandable, true);
    assert.equal(result.base, 0.5);
    assert.equal(result.quote, 0);
  });

  test("money on both sides is reported together", () => {
    const result = detectStrandedFunds({
      quote: 3.2,
      base: 0.2,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(result.strandable, true);
    assert.equal(result.quote, 3.2);
    assert.equal(result.base, 0.2);
  });

  test("nothing held is not reported", () => {
    const result = detectStrandedFunds({
      quote: 0,
      base: 0,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(result.strandable, false);
    assert.equal(result.quote, 0);
    assert.equal(result.base, 0);
  });

  test("an open position suppresses detection even with a funded pool", () => {
    const result = detectStrandedFunds({
      quote: 10,
      base: 1,
      positionOpen: true,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(result.strandable, false);
    assert.equal(result.quote, 0);
    assert.equal(result.base, 0);
  });

  test("base dust below the exchange's minimum is not reported, quote still is", () => {
    const result = detectStrandedFunds({
      quote: 1,
      base: 0.0001,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(result.strandable, true);
    assert.equal(result.quote, 1);
    assert.equal(result.base, 0, "dust below minQuantity is not sellable, so it is not surfaced");
  });

  test("base dust alone is still swept home, reported as dust rather than sellable", () => {
    const result = detectStrandedFunds({
      quote: 0,
      base: 0.0001,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    // Too small to SELL is not too small to RETURN: a sweep is a withdrawal,
    // not an order. Excluding it here left real money with no route back
    // except a future run on the same market.
    assert.equal(result.strandable, true);
    assert.equal(result.base, 0, "not sellable, so not reported as sellable");
    assert.equal(result.dust, 0.0001, "but still withdrawable, so still known");
  });

  test("dust is kept apart from a sellable balance", () => {
    const sellable = detectStrandedFunds({
      quote: 0,
      base: Number(MIN_QUANTITY),
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(sellable.base, Number(MIN_QUANTITY));
    assert.equal(sellable.dust, 0);
  });

  test("an open position reports nothing, dust included", () => {
    const working = detectStrandedFunds({
      quote: 5,
      base: 0.0001,
      positionOpen: true,
      minQuantity: MIN_QUANTITY,
    });

    assert.equal(working.strandable, false);
    assert.equal(working.dust, 0);
  });

  test("non-finite and negative inputs are treated as nothing held", () => {
    const nan = detectStrandedFunds({
      quote: NaN,
      base: NaN,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });
    assert.equal(nan.strandable, false);

    const infinite = detectStrandedFunds({
      quote: Infinity,
      base: 0,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });
    assert.equal(infinite.strandable, false);

    const negative = detectStrandedFunds({
      quote: -5,
      base: -1,
      positionOpen: false,
      minQuantity: MIN_QUANTITY,
    });
    assert.equal(negative.strandable, false);
    assert.equal(negative.quote, 0);
    assert.equal(negative.base, 0);
  });

  test("a malformed minQuantity does not crash and treats any base amount as sellable", () => {
    const result = detectStrandedFunds({
      quote: 0,
      base: 0.0001,
      positionOpen: false,
      minQuantity: "not-a-number",
    });

    assert.equal(result.strandable, true);
    assert.equal(result.base, 0.0001);
  });
});

/**
 * Which just-detected markets should get an automatic sweep attempt.
 *
 * This is the exact decision that used to be inlined against React state and
 * silently missed everything, because the state it looked up had not been
 * committed yet when the lookup ran. Testing it as a pure function over the
 * detected list (never over any state snapshot) is what proves that failure
 * mode cannot recur: there is nothing here to go stale.
 */
describe("selectAutoAttemptTargets", () => {
  test("a freshly detected market with no prior attempt is selected", () => {
    const found = [{ marketId: "eth-usd" }];

    const targets = selectAutoAttemptTargets(found, new Set());

    assert.deepEqual(targets, [{ marketId: "eth-usd" }]);
  });

  test("a market already attempted this connection is not selected again", () => {
    const found = [{ marketId: "eth-usd" }, { marketId: "btc-usd" }];

    const targets = selectAutoAttemptTargets(
      found,
      new Set(["eth-usd"])
    );

    assert.deepEqual(targets, [{ marketId: "btc-usd" }]);
  });

  test("nothing detected means nothing is selected", () => {
    const targets = selectAutoAttemptTargets([], new Set(["eth-usd"]));

    assert.deepEqual(targets, []);
  });

  test("every detected market already attempted yields an empty list", () => {
    const found = [{ marketId: "eth-usd" }, { marketId: "btc-usd" }];

    const targets = selectAutoAttemptTargets(
      found,
      new Set(["eth-usd", "btc-usd"])
    );

    assert.deepEqual(targets, []);
  });

  test("selected entries are the same objects from `found`, not copies", () => {
    const entry = { marketId: "eth-usd", symbol: "ETHUSD", quote: 5, base: 0 };

    const targets = selectAutoAttemptTargets([entry], new Set());

    assert.equal(targets[0], entry);
  });
});
