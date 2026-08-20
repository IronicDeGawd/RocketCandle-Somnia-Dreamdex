import assert from "node:assert/strict";
import { describe, test } from "node:test";

import {
  planDepositSteps,
  planSetupSteps,
  STANDING_ALLOWANCE_THRESHOLD_USDSO,
  STANDING_ALLOWANCE_USDSO,
} from "@/lib/setupSteps";

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
  vaultModeOn: false,
  allowance: 0n,
  alreadyAuthorized: false,
};

/** The measured state of a set-up account, standing allowance already granted. */
const SETTLED = {
  ...FRESH,
  vaultModeOn: true,
  allowance: STANDING_ALLOWANCE_USDSO,
  alreadyAuthorized: true,
};

const labels = (state: Parameters<typeof planSetupSteps>[0]) =>
  planSetupSteps(state).map((s) => s.label);

describe("planSetupSteps", () => {
  test("a first-time setup does all three, in order", () => {
    assert.deepEqual(labels(FRESH), [
      "vault mode",
      "the USDso allowance",
      "the key authorisation",
    ]);
  });

  test("a set-up account with a healthy standing allowance needs nothing", () => {
    // The bug this locks down: vault mode and the key authorisation were sent
    // again every time, so a top-up cost several confirmations instead of
    // none - re-granting permissions the chain already recorded.
    assert.deepEqual(labels(SETTLED), []);
  });

  test("the allowance is not re-asked for until it actually runs low", () => {
    const steps = labels({
      ...SETTLED,
      allowance: STANDING_ALLOWANCE_THRESHOLD_USDSO,
    });
    assert.deepEqual(steps, []);
  });

  test("the allowance is asked for again once it drops below the threshold", () => {
    const steps = labels({
      ...SETTLED,
      allowance: STANDING_ALLOWANCE_THRESHOLD_USDSO - 1n,
    });
    assert.deepEqual(steps, ["the USDso allowance"]);
  });

  test("authorising the key needs no allowance step alongside it", () => {
    const steps = labels({ ...SETTLED, alreadyAuthorized: false });
    assert.deepEqual(steps, ["the key authorisation"]);
  });

  test("the allowance approves the standing amount, not any one run's", () => {
    const approve = planSetupSteps(FRESH).find(
      (s) => s.label === "the USDso allowance"
    );
    assert.equal(approve?.args[0], POOL);
    assert.equal(approve?.args[1], STANDING_ALLOWANCE_USDSO);
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

describe("planDepositSteps", () => {
  const DEPOSIT = { pool: POOL, amount: 5_000000000000000000n, allowance: 0n };

  test("a run with no existing allowance approves then deposits", () => {
    const steps = planDepositSteps(DEPOSIT).map((s) => s.label);
    assert.deepEqual(steps, ["the USDso allowance", "the deposit"]);
  });

  test("a standing allowance that already covers the run needs no approval", () => {
    const steps = planDepositSteps({
      ...DEPOSIT,
      allowance: 5_000000000000000000n,
    }).map((s) => s.label);
    assert.deepEqual(steps, ["the deposit"]);
  });

  test("an allowance short by one unit is still asked for", () => {
    const steps = planDepositSteps({
      ...DEPOSIT,
      allowance: 4_999999999999999999n,
    }).map((s) => s.label);
    assert.deepEqual(steps, ["the USDso allowance", "the deposit"]);
  });

  test("a zero-amount run asks for nothing", () => {
    // Reaching the wallet with an empty list would be a confirmation prompt
    // for no work, which reads as the app being broken.
    const steps = planDepositSteps({ ...DEPOSIT, amount: 0n });
    assert.deepEqual(steps, []);
  });

  test("the allowance always precedes the deposit that spends it", () => {
    const steps = planDepositSteps(DEPOSIT).map((s) => s.label);
    assert.ok(
      steps.indexOf("the USDso allowance") < steps.indexOf("the deposit"),
      "a deposit sent before its allowance reverts"
    );
  });

  test("the deposit is aimed at the pool, for the amount asked", () => {
    const deposit = planDepositSteps(DEPOSIT).find(
      (s) => s.label === "the deposit"
    );
    assert.equal(deposit?.address, POOL);
    assert.equal(deposit?.args[1], 5_000000000000000000n);
  });
});
