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
  /** How much USDso to move into the vault. Zero is a valid ask: none. */
  amount: bigint;
  /** Do fills already settle to the vault for this account? */
  vaultModeOn: boolean;
  /** What the pool may already take from the wallet. */
  allowance: bigint;
  /** Is the browser key already allowed to place and cancel orders? */
  alreadyAuthorized: boolean;
}

/**
 * @returns only the steps that are genuinely missing, in the order they must
 *   run - the allowance always before the deposit that spends it.
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
   * Permission for exactly this deposit, and nothing left standing.
   *
   * Each approval is consumed to the last unit by the deposit that follows it,
   * which is why the allowance reads zero between top-ups. That is the intent:
   * the pool never holds a claim on money the player has not just handed it.
   */
  if (state.amount > 0n && state.allowance < state.amount) {
    steps.push({
      label: "the USDso allowance",
      address: USDSO_ADDRESS,
      abi: ERC20_ABI,
      functionName: "approve",
      args: [state.pool, state.amount],
    });
  }

  // The working capital the game trades with.
  if (state.amount > 0n) {
    steps.push({
      label: "the deposit",
      address: state.pool,
      abi: SPOT_POOL_ABI,
      functionName: "deposit",
      args: [USDSO_ADDRESS, state.amount],
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
