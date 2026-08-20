import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { planSetupSteps } from "@/lib/setupSteps";

/**
 * What still has to happen on chain, and what must not happen again.
 *
 * Every one of these steps costs the player a wallet confirmation, and the code
 * fired all four on every call - so topping the vault up asked for four
 * approvals to do one thing, twice re-writing state the chain already held.
 * None of that failed a build or a test, because nothing tested it.
 */

const POOL = "0x259fD6559214dd5aD3752322426eA9F9fABEFff4" as const;
const REGISTRY = "0xEb97349Aa62A68507c0bE535eD88B0d028a47E1e" as const;
const KEY = "0x5dFC973f9D1636C6d12c20Ba6d215ac618E70F65" as const;

/** A player who has never traded here: everything is still to do. */
const FRESH = {
  pool: POOL,
  registry: REGISTRY,
  operator: KEY,
  amount: 5_000000000000000000n,
  vaultModeOn: false,
  allowance: 0n,
  alreadyAuthorized: false,
};

/** The measured state of a set-up account between top-ups. */
const SETTLED = {
  ...FRESH,
  vaultModeOn: true,
  // Zero, always: each approval is consumed exactly by its deposit.
  allowance: 0n,
  alreadyAuthorized: true,
};

const labels = (state: Parameters<typeof planSetupSteps>[0]) =>
  planSetupSteps(state).map((s) => s.label);

describe("planSetupSteps", () => {
  test("a first-time setup does all four, in order", () => {
    assert.deepEqual(labels(FRESH), [
      "vault mode",
      "the USDso allowance",
      "the deposit",
      "the key authorisation",
    ]);
  });

  test("a top-up on a set-up account is an allowance and a deposit", () => {
    // The bug this locks down: vault mode and the key authorisation were sent
    // again every time, so this cost four confirmations instead of one batch
    // of two - and re-granted a permission the chain already recorded.
    assert.deepEqual(labels(SETTLED), ["the USDso allowance", "the deposit"]);
  });

  test("an allowance that already covers the deposit is not asked for again", () => {
    const steps = labels({ ...SETTLED, allowance: 5_000000000000000000n });
    assert.deepEqual(steps, ["the deposit"]);
  });

  test("an allowance short by one unit is still asked for", () => {
    const steps = labels({ ...SETTLED, allowance: 4_999999999999999999n });
    assert.deepEqual(steps, ["the USDso allowance", "the deposit"]);
  });

  test("nothing at all to do produces no steps", () => {
    // Reaching the wallet with an empty list would be a confirmation prompt
    // for no work, which reads as the app being broken.
    assert.deepEqual(labels({ ...SETTLED, amount: 0n }), []);
  });

  test("authorising the key needs no deposit", () => {
    const steps = labels({ ...SETTLED, amount: 0n, alreadyAuthorized: false });
    assert.deepEqual(steps, ["the key authorisation"]);
  });

  test("the allowance always precedes the deposit that spends it", () => {
    const steps = labels(FRESH);
    assert.ok(
      steps.indexOf("the USDso allowance") < steps.indexOf("the deposit"),
      "a deposit sent before its allowance reverts"
    );
  });

  test("the deposit is aimed at the pool, for the amount asked", () => {
    const deposit = planSetupSteps(SETTLED).find(
      (s) => s.label === "the deposit"
    );
    assert.equal(deposit?.address, POOL);
    assert.equal(deposit?.args[1], 5_000000000000000000n);
  });

  test("the key is authorised on the registry, not the pool", () => {
    // Pointing this at the wrong contract does not fail: the transaction
    // mines, costs gas, emits nothing, and orders are refused later for no
    // visible reason.
    const grant = planSetupSteps(FRESH).find(
      (s) => s.label === "the key authorisation"
    );
    assert.equal(grant?.address, REGISTRY);
    assert.equal(grant?.args[0], POOL);
    assert.equal(grant?.args[1], KEY);
  });
});
