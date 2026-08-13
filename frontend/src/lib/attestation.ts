/**
 * Talking to the attestation service.
 *
 * A finished run is no longer something the game can submit on its own. The
 * service has to countersign it first, and the contract will not accept a run
 * without that signature.
 */

const ATTESTATION_BASE_URL =
  process.env.NEXT_PUBLIC_ATTESTATION_URL || "http://localhost:4000";

export interface AttestedRun {
  player: `0x${string}`;
  score: number;
  level: number;
  gameTime: number;
  enemiesDestroyed: number;
  rocketsUsed: number;
  nonce: string;
  deadline: number;
}

export interface Attestation {
  run: AttestedRun;
  signature: `0x${string}`;
}

/** Anything the service refused, with the reason it gave. */
export class AttestationError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "AttestationError";
    this.status = status;
  }
}

const request = async (path: string, body?: unknown) => {
  const response = await fetch(`${ATTESTATION_BASE_URL}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json" },
    // The session lives in a cookie the service sets, so it has to travel.
    credentials: "include",
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const data = await response.json().catch(() => null);

  if (!response.ok) {
    throw new AttestationError(
      data?.error || `Attestation service returned ${response.status}`,
      response.status
    );
  }

  return data;
};

/** Is there already a usable session for this wallet? */
export async function getAttestationSession(): Promise<string | null> {
  try {
    const data = await request("/api/auth/status");
    return data?.authenticated ? (data.walletAddress as string) : null;
  } catch {
    return null;
  }
}

/**
 * Prove the wallet is ours, and get a session back.
 *
 * The player signs a one-off challenge. This is the only wallet signature the
 * service ever asks for; the run itself is signed by the service, not the
 * player.
 *
 * @param walletAddress the connected wallet
 * @param signMessage signs a message with that wallet
 */
export async function openAttestationSession(
  walletAddress: string,
  signMessage: (message: string) => Promise<string>
): Promise<void> {
  const challenge = await request("/api/auth/challenge", { walletAddress });
  const signature = await signMessage(challenge.message);

  await request("/api/auth/verify", {
    walletAddress,
    signature,
    nonce: challenge.nonce,
  });
}

/**
 * Ask the service to countersign a finished run.
 *
 * The service signs for whichever wallet owns the session, so the run comes
 * back bound to that address whatever the caller claims.
 */
export async function attestRun(run: {
  score: number;
  level: number;
  gameTime: number;
  enemiesDestroyed: number;
  rocketsUsed: number;
}): Promise<Attestation> {
  return request("/api/runs/attest", run);
}
