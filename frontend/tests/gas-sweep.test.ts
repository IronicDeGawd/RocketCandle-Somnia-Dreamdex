import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { sweepAmount } from "@/lib/gasSweep";

/**
 * What a session key can hand back to its owner.
 *
 * The key has to keep enough behind to pay for the very transfer that sends
 * the rest home - a native send costs 21,000 gas - so anything at or below
 * that postage has nothing spare to give back.
 */

const FEE_PER_GAS = 6_000_000_000n;
const POSTAGE = 21_000n * FEE_PER_GAS;

describe("sweepAmount", () => {
  test("a balance of exactly the postage sweeps to zero", () => {
    assert.equal(sweepAmount(POSTAGE, FEE_PER_GAS), 0n);
  });

  test("a balance below the postage sweeps to zero, never negative", () => {
    assert.equal(sweepAmount(POSTAGE - 1n, FEE_PER_GAS), 0n);
  });

  test("a normal balance sweeps the balance minus postage", () => {
    const balance = POSTAGE + 150_000_000_000_000n;
    assert.equal(sweepAmount(balance, FEE_PER_GAS), 150_000_000_000_000n);
  });

  test("a zero balance sweeps to zero", () => {
    assert.equal(sweepAmount(0n, FEE_PER_GAS), 0n);
  });
});
