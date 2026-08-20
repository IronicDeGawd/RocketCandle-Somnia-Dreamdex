/**
 * Turning one committed number into what actually opens the position.
 *
 * `F` adds to a live position mid-run and draws straight from the pool
 * (`GameScene.js`'s `exposureStep`, unlimited presses). If a buy-in spent the
 * whole commitment, the pool would be empty the moment a player first pressed
 * `F` - killing a core mechanic the instant it is used - and topping it up
 * mid-run would mean a wallet popup while a rocket is in the air. So part of
 * the commitment is held back in the pool as headroom, and only the rest
 * opens the position.
 *
 * Pure and exported because a mistake here is a mistake in real money, not a
 * pixel: this is the one place that decides how much of a player's stated
 * commitment is actually put at risk.
 */

/**
 * The USDso a single `F` press adds to a live position.
 *
 * Exported once and imported everywhere it is needed - `GameScene.js` for the
 * actual top-up, `RunSetupScene.js` for the headroom this reserves - so the
 * two never drift apart. A silent mismatch here does not error or fail a
 * test: it either starves the top-up mechanic mid-run (reserve too small) or
 * stakes less than a player asked for (reserve too large).
 */
export const EXPOSURE_STEP = 0.5;

export interface OpeningStake {
  /** What actually buys the position, key-signed, no wallet popup. */
  openingStake: number;
  /** What stays behind in the pool as headroom for `F`. */
  reserve: number;
}

/**
 * @param commitment total USDso the player is committing to this run
 * @param minSafeUsdso the smallest stake the market will actually accept
 * @param exposureStep what one `F` press adds to the position
 */
export function deriveOpeningStake(
  commitment: number,
  minSafeUsdso: number,
  exposureStep: number
): OpeningStake {
  if (!Number.isFinite(commitment) || commitment <= 0) {
    return { openingStake: 0, reserve: 0 };
  }

  const safeMinimum =
    Number.isFinite(minSafeUsdso) && minSafeUsdso > 0 ? minSafeUsdso : 0;
  const safeStep =
    Number.isFinite(exposureStep) && exposureStep > 0 ? exposureStep : 0;

  // Four top-ups' worth of headroom, capped at a quarter of the commitment so
  // a large commitment is not throttled by a fixed reserve that barely
  // matters at that scale.
  const desiredReserve = Math.min(4 * safeStep, commitment * 0.25);
  const openingStake = commitment - desiredReserve;

  /*
   * The reserve must never push the stake below what the market will accept.
   * When it would, there is no room for headroom at all: the whole
   * commitment opens the position instead, and `F` fails later with the
   * message it already has ("Could not add to your position") rather than
   * this function silently proposing a buy-in the market would refuse.
   */
  if (openingStake < safeMinimum) {
    return { openingStake: commitment, reserve: 0 };
  }

  return { openingStake, reserve: desiredReserve };
}
