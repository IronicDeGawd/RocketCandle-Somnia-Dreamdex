/**
 * Order arithmetic.
 *
 * Every one of these guards a failure that is SILENT: the transaction mines,
 * gas is spent, and nothing happens - or worse, the order fills at a price
 * nobody intended. None of it throws on its own, which is exactly why it needs
 * tests rather than a green build.
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  toRaw,
  fromRaw,
  alignToTick,
  alignToLot,
  buildExpireNs,
  ORDER_TYPE,
  OrderError,
} from "@/lib/orders";

describe("toRaw / fromRaw", () => {
  test("round-trips a plain amount", () => {
    assert.equal(fromRaw(toRaw(2, 18), 18), 2);
    assert.equal(fromRaw(toRaw(0.5, 18), 18), 0.5);
  });

  test("scales by the token's own decimals, not a fixed 18", () => {
    // USDC-style 6-decimal tokens exist on this exchange. Assuming 18 here
    // would overstate a balance by a factor of a million.
    assert.equal(toRaw(1, 6), 1_000_000n);
    assert.equal(toRaw(1, 18), 10n ** 18n);
  });

  test("truncates below the token's precision instead of throwing", () => {
    // parseUnits rejects more decimals than the token has, so toRaw rounds
    // first. Without that, a price like 0.0917333... crashes the order.
    assert.equal(toRaw(1.23456789, 6), 1_234_568n);
  });

  test("handles a price with many significant figures", () => {
    // Real ask seen on SOMI:USDso, at the precision the exchange quotes.
    //
    // It does NOT land on an exact 91718340000000000n: a JavaScript number
    // cannot hold 0.09171834 exactly, so toFixed(18) writes the float's true
    // value and the result is a handful of wei short. That is fine - the error
    // is around 1 part in 10^16, far below one unit of anything tradeable -
    // but it is real, and it is why nothing here compares raw amounts for
    // equality after a round trip through a float.
    const raw = toRaw(0.09171834, 18);
    const ideal = 91_718_340_000_000_000n;
    const drift = raw > ideal ? raw - ideal : ideal - raw;

    assert.ok(drift < 1000n, `drift of ${drift} wei is larger than expected`);
    // What actually matters: it survives the trip back to a human number.
    assert.equal(fromRaw(raw, 18), 0.09171834);
  });

  test("zero and very small values do not become negative or NaN", () => {
    assert.equal(toRaw(0, 18), 0n);
    assert.equal(fromRaw(0n, 18), 0);
    // Below one unit of precision, this legitimately rounds to nothing - the
    // caller's job is to reject it, which placeOrder does via BELOW_MIN.
    assert.equal(toRaw(0.0000001, 6), 0n);
  });
});

describe("alignToTick", () => {
  const tick = 100n;

  test("leaves a price that is already a whole number of ticks", () => {
    assert.equal(alignToTick(500n, tick, "bid"), 500n);
    assert.equal(alignToTick(500n, tick, "ask"), 500n);
  });

  test("rounds a bid DOWN and an ask UP", () => {
    // The direction is the whole point: rounding the wrong way nudges an
    // order into crossing the spread when it was meant to rest.
    assert.equal(alignToTick(550n, tick, "bid"), 500n);
    assert.equal(alignToTick(550n, tick, "ask"), 600n);
  });

  test("rounds by a single unit correctly in both directions", () => {
    assert.equal(alignToTick(501n, tick, "bid"), 500n);
    assert.equal(alignToTick(599n, tick, "ask"), 600n);
  });

  test("a sub-tick bid collapses to zero rather than to one tick", () => {
    // A zero price is read literally by the exchange, not as "market", so it
    // would rest forever. placeOrder relies on this to raise ZERO_PRICE.
    assert.equal(alignToTick(99n, tick, "bid"), 0n);
  });

  test("refuses a non-positive tick", () => {
    assert.throws(() => alignToTick(500n, 0n, "bid"), OrderError);
    assert.throws(() => alignToTick(500n, -1n, "bid"), OrderError);
  });
});

describe("alignToLot", () => {
  test("snaps DOWN so an order never overspends", () => {
    assert.equal(alignToLot(1_050n, 100n), 1_000n);
    assert.equal(alignToLot(1_000n, 100n), 1_000n);
    assert.equal(alignToLot(99n, 100n), 0n);
  });

  test("refuses a non-positive lot", () => {
    assert.throws(() => alignToLot(100n, 0n), OrderError);
  });

  test("matches the real SOMI lot of 0.01 on an 18-decimal token", () => {
    const lot = toRaw(0.01, 18);
    const requested = toRaw(5.437, 18);
    const aligned = alignToLot(requested, lot);

    // The contract, stated as properties rather than as a magic literal:
    // a whole number of lots, never more than was asked for, and within one
    // lot of it. Comparing against toRaw(5.43) would fail on float drift
    // alone, which says nothing about whether alignment works.
    assert.equal(aligned % lot, 0n, "must be a whole number of lots");
    assert.ok(aligned <= requested, "must never round up into overspending");
    assert.ok(requested - aligned < lot, "must not lose a whole lot");
    assert.equal(fromRaw(aligned, 18), 5.43);
  });
});

describe("buildExpireNs", () => {
  test("is always a real moment in the future, in nanoseconds", () => {
    // Zero is not "never expires" - the exchange silently rejects it, and
    // rejects any time already past.
    const nowNs = BigInt(Date.now()) * 1_000_000n;
    const expiry = buildExpireNs(60_000);

    assert.ok(expiry > nowNs, "expiry must be in the future");
    assert.ok(expiry > 0n, "expiry must never be zero");
  });

  test("scales milliseconds to nanoseconds, not microseconds", () => {
    // A factor-of-1000 slip here yields an expiry ~1ms away, so every order
    // expires before it can fill.
    const a = buildExpireNs(0);
    const b = buildExpireNs(60_000);
    assert.ok(b - a >= 59_000n * 1_000_000n, "one minute must be 6e13 ns apart");
  });
});

describe("ORDER_TYPE", () => {
  test("immediate-or-cancel is distinct from every resting type", () => {
    // The game only ever wants to fill now. Sending Normal or PostOnly would
    // leave an order resting, so the position never opens and the run never
    // starts - with no error anywhere to say why.
    assert.equal(ORDER_TYPE.ImmediateOrCancel, 2);
    assert.notEqual(ORDER_TYPE.ImmediateOrCancel, ORDER_TYPE.Normal);
    assert.notEqual(ORDER_TYPE.ImmediateOrCancel, ORDER_TYPE.PostOnly);
  });
});
