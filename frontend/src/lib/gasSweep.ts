/**
 * What a session key can hand back without leaving itself unable to send
 * the transfer that hands it back.
 *
 * A plain native transfer costs 21,000 gas, so that much - at the current
 * fee - has to stay behind to pay for its own send. Never negative: a key
 * holding less than its own postage has nothing to sweep.
 */
export function sweepAmount(balance: bigint, feePerGas: bigint): bigint {
  const postage = 21_000n * feePerGas;
  const spendable = balance - postage;
  return spendable > 0n ? spendable : 0n;
}
