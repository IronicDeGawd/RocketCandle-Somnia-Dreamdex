import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { deriveOpeningStake } from "@/lib/commitment";

/**
 * Deriving what actually buys the position from what a player committed.
 *
 * `F` draws straight from whatever is left in the pool, unlimited times, so a
 * buy-in that spends the whole commitment kills that mechanic the instant a
 * player first reaches for it. This is the one place that decides how much
 * headroom survives the buy-in.
 */

const EXPOSURE_STEP = 0.5;
const MIN_SAFE = 1;

describe("deriveOpeningStake", () => {
  test("a generous commitment reserves four top-ups' worth", () => {
    const { openingStake, reserve } = deriveOpeningStake(
      20,
      MIN_SAFE,
      EXPOSURE_STEP
    );
    assert.equal(reserve, 2); // 4 * 0.5
    assert.equal(openingStake, 18);
  });

  test("a large commitment is capped at a quarter reserved, not throttled", () => {
    // 4 * 0.5 = 2 would ordinarily be reserved, but 25% of 4 is only 1 -
    // the cap should bite before the fixed headroom does.
    const { openingStake, reserve } = deriveOpeningStake(
      4,
      MIN_SAFE,
      EXPOSURE_STEP
    );
    assert.equal(reserve, 1);
    assert.equal(openingStake, 3);
  });

  test("a commitment that can only just cover the minimum collapses the reserve to zero", () => {
    // Reserving anything here would push the opening stake under the
    // minimum the market accepts - so the whole commitment opens instead.
    const { openingStake, reserve } = deriveOpeningStake(
      1.2,
      MIN_SAFE,
      EXPOSURE_STEP
    );
    assert.equal(reserve, 0);
    assert.equal(openingStake, 1.2);
  });

  test("a commitment right at the minimum still opens in full, no reserve", () => {
    const { openingStake, reserve } = deriveOpeningStake(
      MIN_SAFE,
      MIN_SAFE,
      EXPOSURE_STEP
    );
    assert.equal(reserve, 0);
    assert.equal(openingStake, MIN_SAFE);
  });

  test("a non-finite commitment opens nothing rather than throwing", () => {
    assert.deepEqual(deriveOpeningStake(NaN, MIN_SAFE, EXPOSURE_STEP), {
      openingStake: 0,
      reserve: 0,
    });
    assert.deepEqual(deriveOpeningStake(Infinity, MIN_SAFE, EXPOSURE_STEP), {
      openingStake: 0,
      reserve: 0,
    });
  });

  test("a zero or negative commitment opens nothing", () => {
    assert.deepEqual(deriveOpeningStake(0, MIN_SAFE, EXPOSURE_STEP), {
      openingStake: 0,
      reserve: 0,
    });
    assert.deepEqual(deriveOpeningStake(-5, MIN_SAFE, EXPOSURE_STEP), {
      openingStake: 0,
      reserve: 0,
    });
  });

  test("a missing minimum is treated as zero, not as a block on opening", () => {
    const { openingStake, reserve } = deriveOpeningStake(10, 0, EXPOSURE_STEP);
    assert.equal(reserve, 2);
    assert.equal(openingStake, 8);
  });

  test("a missing exposure step reserves nothing", () => {
    const { openingStake, reserve } = deriveOpeningStake(10, MIN_SAFE, 0);
    assert.equal(reserve, 0);
    assert.equal(openingStake, 10);
  });
});
