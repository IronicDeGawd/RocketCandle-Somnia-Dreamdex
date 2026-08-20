/**
 * Turning a wallet or RPC failure into one line a player can read.
 *
 * viem/wagmi errors arrive as a chain of nested causes - a top-level
 * "ContractFunctionExecutionError" wrapping an "InsufficientFundsError",
 * say - with the useful sentence often two or three `.cause` levels down.
 * Every failure a player can hit, whatever variant threw it, has to end up
 * as exactly one of the four categories below. Nothing here ever surfaces
 * a raw message, a stack, or an error object.
 */

export type WalletErrorCategory =
  | "cancelled"
  | "insufficient-funds"
  | "wrong-network"
  | "reverted"
  | "unknown";

/** Walk an error's cause chain, collecting every name and message it carries. */
function collectErrorText(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  const seen = new Set<unknown>();

  // Five hops is already deeper than any real viem error chain goes; the
  // cap exists only to rule out a cyclical `cause` sending this loop forever.
  for (let hop = 0; hop < 5 && current && !seen.has(current); hop += 1) {
    seen.add(current);

    if (typeof current === "string") {
      parts.push(current);
      break;
    }

    if (current instanceof Error || typeof current === "object") {
      // `current` is untrusted `unknown` - it can be a hostile object (or a
      // Proxy) with a throwing getter on any of these four fields. A throw
      // here must not escape and crash the caller's catch block; degrade to
      // whatever text was already collected instead.
      try {
        const withFields = current as {
          name?: unknown;
          message?: unknown;
          shortMessage?: unknown;
          cause?: unknown;
        };
        if (typeof withFields.name === "string") parts.push(withFields.name);
        if (typeof withFields.message === "string") parts.push(withFields.message);
        if (typeof withFields.shortMessage === "string") parts.push(withFields.shortMessage);
        current = withFields.cause;
      } catch {
        break;
      }
      continue;
    }

    break;
  }

  return parts.join(" ").toLowerCase();
}

export function categorizeWalletError(error: unknown): WalletErrorCategory {
  const text = collectErrorText(error);

  if (
    /user rejected|rejected the request|user denied|denied transaction|denied message signature|actionrejected/.test(
      text
    )
  ) {
    return "cancelled";
  }

  if (/insufficient funds|insufficient balance|exceeds balance/.test(text)) {
    return "insufficient-funds";
  }

  if (/chain mismatch|does not match the target chain|wrong network|unsupported chain/.test(text)) {
    return "wrong-network";
  }

  if (/execution reverted|contractfunctionreverted|contract function.*reverted/.test(text)) {
    return "reverted";
  }

  return "unknown";
}

/** One title/message pair, safe to hand straight to a notification. */
export function mapWalletError(error: unknown): { title: string; message: string } {
  switch (categorizeWalletError(error)) {
    case "cancelled":
      return {
        title: "Signature Cancelled",
        message: "You cancelled the wallet request, so nothing was sent.",
      };
    case "insufficient-funds":
      return {
        title: "Insufficient Funds",
        message: "Your wallet does not have enough funds to cover gas for this transaction.",
      };
    case "wrong-network":
      return {
        title: "Wrong Network",
        message: "Switch to the Somnia network and try again.",
      };
    case "reverted":
      return {
        title: "Transaction Reverted",
        message: "The contract rejected this transaction. Please try again.",
      };
    default:
      return {
        title: "Transaction Failed",
        message: "Something went wrong submitting your transaction. Please try again.",
      };
  }
}
