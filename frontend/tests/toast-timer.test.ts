import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { computeRemainingMs } from "@/lib/toastTimer";

/**
 * The countdown a paused toast should resume with.
 *
 * A toast holds `remainingMs` of life left as of `startedAt`. Asking how
 * much is left at some later `now` should subtract only the time that
 * actually passed, and never answer with less than zero.
 */

describe("computeRemainingMs", () => {
  test("no time passed leaves the full remaining duration", () => {
    assert.equal(computeRemainingMs(5000, 1000, 1000), 5000);
  });

  test("subtracts exactly the elapsed time", () => {
    assert.equal(computeRemainingMs(5000, 1000, 3000), 3000);
  });

  test("floors at zero rather than going negative", () => {
    assert.equal(computeRemainingMs(5000, 1000, 10000), 0);
  });

  test("elapsed time exactly equal to remaining lands on zero", () => {
    assert.equal(computeRemainingMs(4000, 0, 4000), 0);
  });

  test("a backward clock never inflates the remaining time", () => {
    const result = computeRemainingMs(5000, 10000, 1000);
    assert.ok(result <= 5000, `expected at most 5000, got ${result}`);
    assert.equal(result, 5000);
  });

  test("a non-finite remaining duration resolves to zero", () => {
    assert.equal(computeRemainingMs(Infinity, 0, 0), 0);
    assert.equal(computeRemainingMs(NaN, 0, 0), 0);
  });
});
