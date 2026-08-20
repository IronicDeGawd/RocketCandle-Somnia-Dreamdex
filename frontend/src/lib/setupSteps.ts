import {
  ERC20_ABI,
  OPERATOR_REGISTRY_ABI,
  OPERATOR_SELECTORS,
  SPOT_POOL_ABI,
  USDSO_ADDRESS,
} from "@/lib/dreamdex";

/**
 * Deciding what still has to happen on chain before a player can trade.
 *
 * Setting up trading and topping up the vault were the same four transactions
 * every time - switch the pool to vault mode, approve, deposit, authorise the
 * key - with only the approve conditional. So adding money cost four wallet
 * confirmations to do one thing, twice re-writing state the chain already
 * recorded.
 *
 * Kept apart from the hook that sends them because this is the part worth
 * testing: it is pure, and every bug here costs a real signature.
 */

/** One thing that has to happen on chain, with a name for when it does not. */
export interface Step {
  label: string;
  address: `0x${string}`;
  // Wider than any single contract; each call site is typed where it builds.
  abi: readonly unknown[];
  functionName: string;
  args: readonly unknown[];
}

export interface SetupState {
  pool: `0x${string}`;
  registry: `0x${string}`;
  /** The browser key being authorised to trade. */
  operator: `0x${string}`;
  /** Do fills already settle to the vault for this account? */
  vaultModeOn: boolean;
  /** What the pool may already take from the wallet. */
  allowance: bigint;
  /** Is the browser key already allowed to place and cancel orders? */
  alreadyAuthorized: boolean;
}

/**
 * The standing allowance granted once, at setup.
 *
 * Setup no longer knows any run's amount - that is asked for later, at
 * buy-in - so it cannot approve an exact figure the way a deposit-carrying
 * setup could. Large enough that ordinary play across many runs never comes
 * close to spending it back down to the threshold below.
 */
export const STANDING_ALLOWANCE_USDSO = 1_000_000_000000000000000000n;

/**
 * Re-approve only once the allowance has actually run low.
 *
 * Without a threshold, a re-run of setup on an already-approved account would
 * ask for a signature that changes nothing - the allowance read back would
 * already be the standing amount. Set far below the standing amount itself so
 * this essentially never fires again after the first approval.
 */
export const STANDING_ALLOWANCE_THRESHOLD_USDSO = 100_000_000000000000000000n;

/**
 * @returns only the steps that are genuinely missing, in the order they must
 *   run.
 */
export function planSetupSteps(state: SetupState): Step[] {
  const steps: Step[] = [];

  // Fills have to settle to the vault rather than the wallet, or the session
  // key would have nothing to trade against.
  if (!state.vaultModeOn) {
    steps.push({
      label: "vault mode",
      address: state.pool,
      abi: SPOT_POOL_ABI,
      functionName: "setManualVaultMode",
      args: [true],
    });
  }

  /*
   * A standing allowance, not an exact one.
   *
   * This used to be consumed to the last unit by the deposit that followed it
   * in the same setup, which is why the allowance read zero between top-ups -
   * the pool never held a claim on money the player had not just handed it.
   * That property is gone now: a run's buy-in deposits an amount setup never
   * sees, so it cannot be pre-approved exactly. Approving a large standing
   * amount once means a run's own deposit needs no approval of its own, at
   * the cost of the pool holding a claim on money still sitting in the
   * wallet between runs - traded away for one owner transaction per run
   * instead of two.
   */
  if (state.allowance < STANDING_ALLOWANCE_THRESHOLD_USDSO) {
    steps.push({
      label: "the USDso allowance",
      address: USDSO_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [state.pool, STANDING_ALLOWANCE_USDSO],
    });
  }

  // Place and cancel only. Never withdraw.
  if (!state.alreadyAuthorized) {
    steps.push({
      label: "the key authorisation",
      address: state.registry,
      abi: OPERATOR_REGISTRY_ABI,
      functionName: "setOperatorApprovalForPool",
      args: [
        state.pool,
        state.operator,
        [OPERATOR_SELECTORS.placeOrderFor, OPERATOR_SELECTORS.cancelOrderFor],
        true,
      ],
    });
  }

  return steps;
}

export interface DepositState {
  pool: `0x${string}`;
  /** How much USDso this run is committing. Zero is a valid ask: none. */
  amount: bigint;
  /** What the pool may already take from the wallet. */
  allowance: bigint;
}

/**
 * One run's buy-in: approve if the standing allowance from setup somehow is
 * not enough, then deposit. Shares the `Step` shape with `planSetupSteps` so
 * a wallet that can batch signs this as a single prompt through `runSteps`.
 */
export function planDepositSteps(state: DepositState): Step[] {
  const steps: Step[] = [];

  if (state.amount > 0n && state.allowance < state.amount) {
    steps.push({
      label: "the USDso allowance",
      address: USDSO_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [state.pool, state.amount],
    });
  }

  if (state.amount > 0n) {
    steps.push({
      label: "the deposit",
      address: state.pool,
      abi: SPOT_POOL_ABI,
      functionName: "deposit",
      args: [USDSO_ADDRESS, state.amount],
    });
  }

  return steps;
}
