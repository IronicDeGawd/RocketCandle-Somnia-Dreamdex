/**
 * Deciding whether a pool is holding money that should be told to the player.
 *
 * A floor or target can fire while nobody is watching, so a run can finish
 * with the commitment (or a partial fill's leftover base tokens) still sitting
 * in the exchange's pool. The money is safe - only the owner can withdraw it -
 * but it is invisible unless something looks for it and says so. This is that
 * look: pure and separately testable, because it decides whether a player is
 * told about their own money.
 */

export interface RecoveryInput {
  /** USDso held on the quote side of the pool. */
  quote: number;
  /** Base-token units held on the pool's base side (a partial fill's leftover). */
  base: number;
  /** Whether a position is currently open for this market. */
  positionOpen: boolean;
  /**
   * The exchange's own minimum order size for the base token, as a decimal
   * string - `MarketMeta.minQuantity` is carried this way everywhere else in
   * the app, so this stays consistent with that rather than inventing a
   * second shape for the same number.
   */
  minQuantity: string;
}

export interface RecoveryResult {
  /** Whether there is money worth telling the player about. */
  strandable: boolean;
  /** USDso reportable on the quote side. */
  quote: number;
  /** Base-token units reportable on the base side. */
  base: number;
}

/**
 * Decide whether a market's pool is holding stranded money.
 *
 * A position being open means that money is working, not stranded - reporting
 * it there would tell a player their live position's own capital needs to be
 * "returned", which is false and would only confuse someone mid-run.
 *
 * Base-side dust below the exchange's own minimum order size is real money
 * and still fully withdrawable (a sweep pulls the whole balance, not an
 * order), but it is not SELLABLE at that size - the exchange itself would
 * refuse an order for it. Announcing it as "returnable" would read like
 * something actionable when the only action available is a plain withdrawal
 * of an amount too small to matter. So dust is excluded from `strandable`
 * and from the reported `base` figure: this function's job is to decide what
 * is worth *surfacing*, not to account for every wei the pool holds.
 */
export function detectStrandedFunds(input: RecoveryInput): RecoveryResult {
  const quote = finiteNonNegative(input.quote);
  const rawBase = finiteNonNegative(input.base);
  const minQuantity = Number(input.minQuantity);
  const minSellable =
    Number.isFinite(minQuantity) && minQuantity > 0 ? minQuantity : 0;

  // Working capital, not stranded capital - never report while a position is
  // open, no matter what the pool reads.
  if (input.positionOpen) {
    return { strandable: false, quote: 0, base: 0 };
  }

  const base = rawBase >= minSellable ? rawBase : 0;

  return {
    strandable: quote > 0 || base > 0,
    quote,
    base,
  };
}

function finiteNonNegative(value: number): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  return value;
}

/**
 * Deciding which markets an automatic sweep should fire for, right now.
 *
 * Pulled out on its own because the hook that used to inline this logic had
 * it silently rot: the attempt it dispatched looked itself up in state that
 * had not been committed yet, found nothing, and quietly did nothing. That
 * defect was invisible to every test because nothing exercised the dispatch
 * decision itself - only the pure detection above was covered. Keeping this
 * as a pure function on the just-detected list (never on state) means there
 * is no second, staler copy of the same data for the decision to disagree
 * with.
 */
export function selectAutoAttemptTargets<T extends { marketId: string }>(
  found: readonly T[],
  alreadyAttempted: ReadonlySet<string>
): T[] {
  return found.filter((entry) => !alreadyAttempted.has(entry.marketId));
}
