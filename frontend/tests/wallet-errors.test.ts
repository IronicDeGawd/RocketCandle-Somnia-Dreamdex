import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { mapWalletError } from "@/lib/walletErrors";

/**
 * What a player sees when the wallet or the chain says no.
 *
 * Every case below is a real shape a viem/wagmi error takes - a rejected
 * signature nested inside a wrapper error, a plain RPC message, or a
 * contract revert - and each has to land in its own bucket rather than all
 * falling through to the same JSON-RPC wall of text.
 */

describe("mapWalletError", () => {
  test("a rejected signature reads as a cancellation, not a failure", () => {
    const error = new Error("User rejected the request.");
    error.name = "UserRejectedRequestError";
    const { title, message } = mapWalletError(error);
    assert.equal(title, "Signature Cancelled");
    assert.match(message, /cancelled/i);
    assert.doesNotMatch(message, /rejected the request/i);
  });

  test("a rejection nested inside a wrapping error is still found", () => {
    const cause = new Error("User rejected the request.");
    cause.name = "UserRejectedRequestError";
    const wrapper = new Error("An unknown error occurred while executing the contract function.");
    wrapper.name = "ContractFunctionExecutionError";
    (wrapper as Error & { cause?: unknown }).cause = cause;

    const { title } = mapWalletError(wrapper);
    assert.equal(title, "Signature Cancelled");
  });

  test("insufficient gas funds gets its own message", () => {
    const error = new Error("insufficient funds for gas * price + value");
    const { title, message } = mapWalletError(error);
    assert.equal(title, "Insufficient Funds");
    assert.match(message, /enough funds/i);
  });

  test("a chain mismatch reads as a wrong-network problem", () => {
    const error = new Error("Chain mismatch: request was sent on a chain that does not match the target chain.");
    const { title, message } = mapWalletError(error);
    assert.equal(title, "Wrong Network");
    assert.match(message, /somnia network/i);
  });

  test("a contract revert is named as a revert", () => {
    const error = new Error("execution reverted: run already submitted");
    const { title, message } = mapWalletError(error);
    assert.equal(title, "Transaction Reverted");
    assert.doesNotMatch(message, /run already submitted/i);
  });

  test("anything unrecognised falls back to a calm generic message", () => {
    const error = new Error("some obscure JSON-RPC internal error 0x1a2b3c");
    const { title, message } = mapWalletError(error);
    assert.equal(title, "Transaction Failed");
    assert.doesNotMatch(message, /0x1a2b3c/);
  });

  test("a non-error value never leaks into the message", () => {
    const { title, message } = mapWalletError("just a raw string, not an Error");
    assert.equal(title, "Transaction Failed");
    assert.doesNotMatch(message, /just a raw string/);
  });

  test("a throwing message getter degrades to the generic fallback instead of crashing the handler", () => {
    const hostile = {
      name: "Weird",
      get message(): string {
        throw new Error("boom - reading .message itself throws");
      },
    };
    assert.doesNotThrow(() => mapWalletError(hostile));
    const { title } = mapWalletError(hostile);
    assert.equal(title, "Transaction Failed");
  });

  test("a throwing shortMessage getter degrades to the generic fallback instead of crashing the handler", () => {
    const hostile = {
      name: "Weird",
      message: "some real text",
      get shortMessage(): string {
        throw new Error("boom - reading .shortMessage itself throws");
      },
    };
    assert.doesNotThrow(() => mapWalletError(hostile));
  });

  test("a Proxy with a throwing get trap degrades to the generic fallback instead of crashing the handler", () => {
    const hostile = new Proxy(
      {},
      {
        get() {
          throw new Error("boom - every property read throws");
        },
      }
    );
    assert.doesNotThrow(() => mapWalletError(hostile));
    const { title } = mapWalletError(hostile);
    assert.equal(title, "Transaction Failed");
  });
});
