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
  /**
   * Whether there is anything in the pool worth withdrawing.
   *
   * Drives whether a sweep is attempted, so it counts dust too: a sweep is a
   * withdrawal and can always bring dust home, even when it is too small to
   * sell.
   */
  strandable: boolean;
  /** USDso reportable on the quote side. */
  quote: number;
  /** Base-token units large enough for the exchange to accept an order for. */
  base: number;
  /**
   * Base-token units below the exchange's minimum order size.
   *
   * Withdrawable but not sellable. Kept apart so a caller can sweep it without
   * announcing it as something the player can act on.
   */
  dust: number;
}

/**
 * Decide whether a market's pool is holding stranded money.
 *
 * A position being open means that money is working, not stranded - reporting
 * it there would tell a player their live position's own capital needs to be
 * "returned", which is false and would only confuse someone mid-run.
 *
 * Too small to SELL is not the same as too small to RETURN, and conflating the
 * two used to lose the money. Base-side dust below the exchange's minimum order
 * size cannot be sold - the exchange would refuse the order - but a sweep is a
 * withdrawal, not an order, so it comes home perfectly well. Excluding dust
 * from `strandable` meant a pool holding nothing but dust got no sweep attempt
 * and no notice: real, withdrawable money with no route back except as a
 * by-product of some future run on that same market.
 *
 * So `strandable` now means "there is something to withdraw". `base` stays the
 * SELLABLE figure, for anything deciding what to say, and `dust` carries the
 * remainder so a caller can bring it home without announcing it as though the
 * player could act on it.
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
    return { strandable: false, quote: 0, base: 0, dust: 0 };
  }

  const sellable = rawBase >= minSellable;
  const base = sellable ? rawBase : 0;
  const dust = sellable ? 0 : rawBase;

  return {
    // Anything withdrawable at all, dust included - this decides whether a
    // sweep is attempted, and a sweep can always bring dust home.
    strandable: quote > 0 || rawBase > 0,
    quote,
    base,
    dust,
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
