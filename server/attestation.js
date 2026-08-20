import { ethers } from "ethers";

/**
 * What the signing key is actually promising.
 *
 * It is NOT promising the run was played honestly - the game runs in the
 * player's own browser, and nothing here can see inside it. What it promises is
 * narrower and still worth having: this run came through the service, for a
 * wallet that proved it owns itself, within the service's limits, and has not
 * been claimed before.
 *
 * That turns minting points from something anyone can do into something only
 * this service can authorise - which means it can be rate limited, tightened,
 * or shut off entirely without touching the deployed contract.
 */

/** Matches the EIP-712 domain the contract verifies against. */
export const DOMAIN_NAME = "RocketCandle";
export const DOMAIN_VERSION = "1";

/** Field order here must match the contract's struct exactly. */
export const RUN_TYPES = {
  Run: [
    { name: "player", type: "address" },
    { name: "score", type: "uint256" },
    { name: "level", type: "uint256" },
    { name: "gameTime", type: "uint256" },
    { name: "enemiesDestroyed", type: "uint16" },
    { name: "rocketsUsed", type: "uint16" },
    // The trade that paid for the run. Signed, because a P&L the player simply
    // asserts is a P&L they can choose.
    { name: "stakeUsdso", type: "uint128" },
    { name: "pnlUsdso", type: "int128" },
    { name: "nonce", type: "uint256" },
    { name: "deadline", type: "uint256" },
  ],
};

/**
 * Limits a run has to sit inside before it will be signed.
 *
 * These mirror the contract's own checks. Keeping them here as well means an
 * implausible run is turned away before it costs anybody gas, and the numbers
 * can be tightened here without redeploying anything.
 */
export const RUN_LIMITS = {
  maxLevel: 7,
  minGameTimeSeconds: 5,
  maxGameTimeSeconds: 60 * 60,
  /** uint128, the width the contract stores a stake in. */
  maxStakeRaw: (1n << 128n) - 1n,
  /** int128's positive half, for the same reason. */
  maxPnlRaw: (1n << 127n) - 1n,
  maxScorePerSecond: 2000,
  maxScore: 1_000_000,
  maxRocketsPerLevel: 3,
};

/**
 * Check a claimed run against the limits.
 *
 * @param {object} run - the run as reported by the game
 * @returns {string|null} why it was rejected, or null when it is acceptable
 */
export function rejectionReason(run) {
  const { score, level, gameTime, enemiesDestroyed, rocketsUsed } = run;

  const whole = (value) => Number.isInteger(value) && value >= 0;

  if (![score, level, gameTime, enemiesDestroyed, rocketsUsed].every(whole)) {
    return "run values must be whole numbers";
  }

  /*
   * The trade, in raw USDso.
   *
   * Both are strings from the client because they are 128-bit and JSON numbers
   * are not. Range-checked rather than truncated: a stake that does not fit is
   * refused, because silently wrapping it would store a number nobody reported.
   */
  let stake;
  let pnl;
  try {
    stake = BigInt(run.stakeUsdso ?? 0);
    pnl = BigInt(run.pnlUsdso ?? 0);
  } catch {
    return "the trade figures are not whole numbers";
  }

  if (stake < 0n) return "a stake cannot be negative";
  if (stake > RUN_LIMITS.maxStakeRaw) return "stake out of range";
  if (pnl > RUN_LIMITS.maxPnlRaw || pnl < -RUN_LIMITS.maxPnlRaw) {
    return "profit or loss out of range";
  }

  /*
   * A loss cannot exceed the stake: selling a holding returns something, even
   * if it is little. A profit far above the stake is not impossible in theory
   * but is not reachable in a run of this length, so the ceiling is the stake
   * itself - generous, and still a ceiling.
   */
  if (stake > 0n && (pnl > stake || -pnl > stake)) {
    return "profit or loss larger than the stake";
  }
  if (score <= 0 || score > RUN_LIMITS.maxScore) return "score out of range";
  if (level <= 0 || level > RUN_LIMITS.maxLevel) return "level out of range";
  if (gameTime < RUN_LIMITS.minGameTimeSeconds) return "run too short to be real";
  if (gameTime > RUN_LIMITS.maxGameTimeSeconds) return "run too long to be real";
  if (enemiesDestroyed <= 0) return "a run must destroy something";
  if (rocketsUsed <= 0) return "a run must fire something";
  if (rocketsUsed > level * RUN_LIMITS.maxRocketsPerLevel) {
    return "more rockets fired than the levels allow";
  }
  if (score / gameTime > RUN_LIMITS.maxScorePerSecond) {
    return "scored faster than the game allows";
  }

  return null;
}

/**
 * Sign a run so the contract will accept it.
 *
 * Signed as EIP-712 typed data, which binds the signature to one chain and one
 * contract. The same attestation therefore cannot be replayed against a
 * different deployment.
 *
 * @param {object} options
 * @param {import("ethers").Wallet} options.signer
 * @param {number} options.chainId
 * @param {string} options.verifyingContract
 * @param {object} options.run - player, score, level, gameTime, enemiesDestroyed, rocketsUsed, nonce, deadline
 * @returns {Promise<string>} the signature
 */
export function signRun({ signer, chainId, verifyingContract, run }) {
  const domain = {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };

  return signer.signTypedData(domain, RUN_TYPES, run);
}

/**
 * Recover who signed a run. Used by the tests and useful for debugging.
 *
 * @param {object} options - same shape as signRun, plus the signature
 * @returns {string} the signing address
 */
export function recoverRunSigner({ chainId, verifyingContract, run, signature }) {
  const domain = {
    name: DOMAIN_NAME,
    version: DOMAIN_VERSION,
    chainId,
    verifyingContract,
  };

  return ethers.verifyTypedData(domain, RUN_TYPES, run, signature);
}
