import assert from "node:assert/strict";
import { describe, test } from "node:test";

import { readVaultBalance } from "@/lib/orders";
import type { TradingClients } from "@/lib/orders";
import type { MarketMeta } from "@/lib/dreamdex";

/**
 * Reading what the vault actually holds.
 *
 * The vault keeps the two sides of a pair separately, and after a buy the
 * money is on the base side. Reading only the quote side made a funded account
 * look empty - the panel offered a fresh buy-in over a holding it could no
 * longer sell - and decoding the base side with the quote side's decimals gets
 * the number wrong by whole orders of magnitude on any pair whose sides
 * disagree. Neither mistake throws, so only a test catches them.
 */

const BASE = "0x28f34DeFd2b4CB48d9eE6d89f2Be4Bc601694c00" as const;
const QUOTE = "0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171" as const;

/** A pair whose two sides disagree, which is what exposes the bug. */
const LOPSIDED: MarketMeta = {
  symbol: "WBTC:USDso",
  pool: "0x259fD6559214dd5aD3752322426eA9F9fABEFff4",
  stopRegistry: null,
  base: BASE,
  baseIsNative: false,
  baseDecimals: 8,
  quoteDecimals: 18,
  minQuantity: "0.0001",
  lotSize: "0.0001",
  tickSize: "0.01",
};

/** Answers the one balance read, holding a different amount on each side. */
function clientsHolding(baseRaw: bigint, quoteRaw: bigint): TradingClients {
  return {
    publicClient: {
      readContract: async ({
        functionName,
        args,
      }: {
        functionName: string;
        args: readonly unknown[];
      }) => {
        if (functionName !== "getWithdrawableBalance") {
          throw new Error(`unexpected read: ${functionName}`);
        }
        return args[1] === BASE ? baseRaw : quoteRaw;
      },
    },
    walletClient: {},
    operator: "0x0000000000000000000000000000000000000001",
  } as unknown as TradingClients;
}

const OWNER = "0xff1661f01687E6e1c50282256CD23D79EADBFCa4" as const;

describe("readVaultBalance", () => {
  test("decodes the base side with the base side's decimals", async () => {
    // 1.5 tokens at 8 decimals. Decoded as 18 it reads as 0.0000000000015 -
    // dust, which is exactly how a real holding came to look like nothing.
    const clients = clientsHolding(150_000_000n, 0n);

    const held = await readVaultBalance(clients, LOPSIDED, OWNER, BASE, "base");

    assert.equal(held, 1.5);
  });

  test("still decodes the quote side as before", async () => {
    const clients = clientsHolding(0n, 2_000000000000000000n);

    const held = await readVaultBalance(clients, LOPSIDED, OWNER, QUOTE);

    assert.equal(held, 2);
  });

  test("the two sides are read independently", async () => {
    // The failure that started this: quote empty, base full. Anything that
    // reads only the quote side concludes the account has nothing.
    const clients = clientsHolding(1_120_000_000n, 3_200_000_000_000_000n);

    const base = await readVaultBalance(clients, LOPSIDED, OWNER, BASE, "base");
    const quote = await readVaultBalance(clients, LOPSIDED, OWNER, QUOTE);

    assert.equal(base, 11.2);
    assert.ok(quote < 0.01, "quote side is dust");
    assert.ok(base > 0, "but the holding is plainly there");
  });
});
