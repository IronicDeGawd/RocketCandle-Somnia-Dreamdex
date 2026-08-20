import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { shouldStartTremor } from "@/utils/tremorCooldown";

/**
 * The gate that stops overlapping camera tremors on a live-trade feed.
 *
 * Trades can arrive faster than a single shake can finish, so firing on
 * every trade never let the view settle. A new tremor is only allowed once
 * the previous one has finished AND a minimum gap has passed since the
 * previous one started.
 */

describe("shouldStartTremor", () => {
  test("allows the very first tremor", () => {
    assert.equal(
      shouldStartTremor({ now: 1000, lastTremorAt: 0, tremorActiveUntil: 0 }),
      true
    );
  });

  test("refuses while a previous tremor is still running", () => {
    assert.equal(
      shouldStartTremor({
        now: 1100,
        lastTremorAt: 1000,
        tremorActiveUntil: 1300,
      }),
      false
    );
  });

  test("refuses inside the minimum gap even after the shake finished", () => {
    // Shake finished at 1300, but only 350ms have passed since it started.
    assert.equal(
      shouldStartTremor({
        now: 1350,
        lastTremorAt: 1000,
        tremorActiveUntil: 1300,
        minGapMs: 500,
      }),
      false
    );
  });

  test("allows a new tremor once the shake finished and the gap has elapsed", () => {
    assert.equal(
      shouldStartTremor({
        now: 1500,
        lastTremorAt: 1000,
        tremorActiveUntil: 1300,
        minGapMs: 500,
      }),
      true
    );
  });

  test("lands exactly on the minimum gap boundary as allowed", () => {
    assert.equal(
      shouldStartTremor({
        now: 1500,
        lastTremorAt: 1000,
        tremorActiveUntil: 1200,
        minGapMs: 500,
      }),
      true
    );
  });

  test("respects a custom minimum gap", () => {
    assert.equal(
      shouldStartTremor({
        now: 1100,
        lastTremorAt: 1000,
        tremorActiveUntil: 1050,
        minGapMs: 200,
      }),
      false
    );
  });

  test("a market too quiet to have ever tremored is never blocked by the gap", () => {
    assert.equal(
      shouldStartTremor({ now: 50, lastTremorAt: 0, tremorActiveUntil: 0 }),
      true
    );
  });

  test("a non-finite clock refuses the tremor instead of getting stuck allowed", () => {
    assert.equal(
      shouldStartTremor({ now: NaN, lastTremorAt: 1000, tremorActiveUntil: 1300 }),
      false
    );
  });
});
