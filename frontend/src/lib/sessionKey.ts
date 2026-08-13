import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

/**
 * The key that lets the game trade without interrupting you.
 *
 * A wallet popup between shots would destroy this game, so the browser holds
 * its own throwaway key and the exchange is told, once, that this key may place
 * and cancel orders on your behalf. It can do nothing else: depositing,
 * withdrawing and approving are owner-only at the contract level, and every
 * fill settles to your vault, never to the key. Proven on chain before this was
 * written - the key traded successfully and was refused when it tried to
 * withdraw.
 *
 * It lives in this browser and nowhere else. Losing it costs nothing: generate
 * another, grant that one, and revoke the old.
 */

const STORAGE_KEY = "rocketcandle.sessionKey.v1";

export interface SessionKey {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

/**
 * The session key for this browser, making one if there isn't one yet.
 *
 * @returns the key, or null when there is no browser to store it in
 */
export function getOrCreateSessionKey(): SessionKey | null {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (stored && /^0x[0-9a-fA-F]{64}$/.test(stored)) {
    return {
      privateKey: stored as `0x${string}`,
      address: privateKeyToAccount(stored as `0x${string}`).address,
    };
  }

  const privateKey = generatePrivateKey();
  window.localStorage.setItem(STORAGE_KEY, privateKey);

  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

/** The existing key, without creating one. */
export function peekSessionKey(): SessionKey | null {
  if (typeof window === "undefined") return null;

  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored || !/^0x[0-9a-fA-F]{64}$/.test(stored)) return null;

  return {
    privateKey: stored as `0x${string}`,
    address: privateKeyToAccount(stored as `0x${string}`).address,
  };
}

/**
 * Forget the key held here.
 *
 * Only removes it from this browser. The exchange still believes the key is
 * authorised until it is revoked on chain, so revoke first and forget second -
 * otherwise a key nobody can see keeps its permission.
 */
export function forgetSessionKey(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(STORAGE_KEY);
}
