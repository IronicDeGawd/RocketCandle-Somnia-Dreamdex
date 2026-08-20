import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { encodeAbiParameters, encodeEventTopics, type Log } from "viem";

import { GAME_CONTRACT_ABI, getMintedReward } from "@/lib/blockchain";

/**
 * What a player is shown after a run settles has to come from what the
 * contract actually minted, not a client-side guess re-run against the same
 * formula. getMintedReward reads that figure off the TokensEarned event a
 * confirmed submitScore() transaction's receipt carries.
 */

const CONTRACT_ADDRESS = "0x1111111111111111111111111111111111111111";
const PLAYER_ADDRESS = "0x2222222222222222222222222222222222222222";

function tokensEarnedLog(amountWei: bigint): Log {
  const topics = encodeEventTopics({
    abi: GAME_CONTRACT_ABI,
    eventName: "TokensEarned",
    args: { player: PLAYER_ADDRESS as `0x${string}` },
  });
  const data = encodeAbiParameters(
    [{ type: "uint256" }],
    [amountWei]
  );

  return {
    address: CONTRACT_ADDRESS as `0x${string}`,
    blockHash: `0x${"0".repeat(64)}` as `0x${string}`,
    blockNumber: 1n,
    data,
    logIndex: 0,
    transactionHash: `0x${"1".repeat(64)}` as `0x${string}`,
    transactionIndex: 0,
    removed: false,
    topics,
  } as Log;
}

describe("getMintedReward", () => {
  test("reads the minted amount off a TokensEarned log", () => {
    // 12.5 WICK, 18 decimals.
    const minted = tokensEarnedLog(12_500_000_000_000_000_000n);
    assert.equal(getMintedReward([minted]), 12.5);
  });

  test("a receipt with no TokensEarned log means zero was minted", () => {
    assert.equal(getMintedReward([]), 0);
  });

  test("a log tagged TokensEarned but with truncated/malformed data returns null, not zero", () => {
    // The topic (topic0) says "this is a TokensEarned event", but the data
    // that should hold the minted amount is chopped down to a few bytes -
    // the shape a corrupted/incompatible log would take. viem's strict
    // decoder drops a log like this rather than throwing, so without the
    // topic0 cross-check it would look identical to "no event fired at
    // all" - a genuine zero. getMintedReward must tell those apart and
    // report "unknown" instead of a confident zero.
    const topics = encodeEventTopics({
      abi: GAME_CONTRACT_ABI,
      eventName: "TokensEarned",
      args: { player: PLAYER_ADDRESS as `0x${string}` },
    });
    const malformed = {
      address: CONTRACT_ADDRESS as `0x${string}`,
      blockHash: `0x${"0".repeat(64)}` as `0x${string}`,
      blockNumber: 1n,
      data: "0x1234" as `0x${string}`, // not a full 32-byte uint256
      logIndex: 0,
      transactionHash: `0x${"1".repeat(64)}` as `0x${string}`,
      transactionIndex: 0,
      removed: false,
      topics,
    } as Log;

    assert.equal(getMintedReward([malformed]), null);
  });

  test("logs from unrelated events are ignored", () => {
    const topics = encodeEventTopics({
      abi: GAME_CONTRACT_ABI,
      eventName: "RevivePurchased",
      args: { player: PLAYER_ADDRESS as `0x${string}` },
    });
    const data = encodeAbiParameters([{ type: "uint256" }], [999n]);
    const unrelated = {
      address: CONTRACT_ADDRESS as `0x${string}`,
      blockHash: `0x${"0".repeat(64)}` as `0x${string}`,
      blockNumber: 1n,
      data,
      logIndex: 0,
      transactionHash: `0x${"1".repeat(64)}` as `0x${string}`,
      transactionIndex: 0,
      removed: false,
      topics,
    } as Log;

    assert.equal(getMintedReward([unrelated]), 0);
  });
});
