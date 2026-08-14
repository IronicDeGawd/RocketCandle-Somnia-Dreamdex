/**
 * The practice taster.
 *
 * Practice is two levels, not the whole game - it exists to show what the game
 * is before someone buys into a pair, rather than being a complete free
 * alternative to doing so. The rest of the game derives its level count from
 * this array's length, so a slip here silently changes how much of the product
 * is given away.
 */

import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";

import { MarketDataProvider } from "@/data/MarketDataProvider.js";

/** The part of a run this cap touches. */
interface TestRun {
  market: { symbol: string; label: string };
  live: boolean;
  mirrored: boolean;
  levels: unknown[];
}

/**
 * capForPractice comes from an untyped JS module, so its return type is only
 * `object | null` here. This narrows it once rather than casting at every
 * assertion.
 */
function cap(run: object): TestRun {
  return MarketDataProvider.capForPractice(run) as TestRun;
}

/** A run shaped like the real thing, with `count` levels. */
function runWith(count: number) {
  return {
    market: { symbol: "SOMI:USDso", label: "Somnia" },
    live: true,
    mirrored: false,
    levels: Array.from({ length: count }, (_, i) => ({
      levelIndex: i,
      name: `LEVEL ${i + 1}`,
      candlesticks: [{ open: 1, high: 2, low: 0.5, close: 1.5 }],
    })),
  };
}

/** Pretend to be a practice run, or a real one. */
function setPracticeMode(practiceMode: boolean) {
  (globalThis as { window?: unknown }).window = globalThis;
  (globalThis as { rocketCandleGame?: unknown }).rocketCandleGame = {
    practiceMode,
  };
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
  delete (globalThis as { rocketCandleGame?: unknown }).rocketCandleGame;
});

describe("capForPractice", () => {
  test("cuts a practice run to the taster length", () => {
    setPracticeMode(true);
    const capped = cap(runWith(7));

    assert.equal(capped.levels.length, MarketDataProvider.TASTER_LEVELS);
    assert.equal(capped.levels.length, 2);
  });

  test("leaves a real run at full length", () => {
    setPracticeMode(false);
    assert.equal(cap(runWith(7)).levels.length, 7);
  });

  test("keeps the run's provenance intact when capping", () => {
    // The taster still has to be able to say which market it came from - that
    // is the whole argument it exists to make.
    setPracticeMode(true);
    const capped = cap(runWith(7));

    assert.equal(capped.market.symbol, "SOMI:USDso");
    assert.equal(capped.live, true);
  });

  test("does not mutate the run it was given", () => {
    // The same object is handed to the Phaser registry; trimming it in place
    // would shorten a real run that happened to pass through here.
    setPracticeMode(true);
    const original = runWith(7);
    MarketDataProvider.capForPractice(original);

    assert.equal(original.levels.length, 7);
  });

  test("survives a run that is already shorter than the taster", () => {
    setPracticeMode(true);
    assert.equal(cap(runWith(1)).levels.length, 1);
  });

  test("passes a failed fetch straight through", () => {
    // A null run means the exchange was unreachable and the game falls back to
    // generated terrain. Reaching into it would crash the loading screen.
    setPracticeMode(true);
    assert.equal(MarketDataProvider.capForPractice(null), null);
    assert.deepEqual(MarketDataProvider.capForPractice({}), {});
  });

  test("leaves the run alone when there is no window at all", () => {
    // Server-side rendering has no window, and must not be treated as
    // practice - that would cap a real run to two levels.
    assert.equal(cap(runWith(7)).levels.length, 7);
  });
});
