import crypto from "crypto";
import fs from "fs";
import path from "path";
import cookieParser from "cookie-parser";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import jwt from "jsonwebtoken";
import { ethers } from "ethers";

import { rejectionReason, signRun } from "./attestation.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 4000;
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || "6h";
const ATTESTATION_PRIVATE_KEY = process.env.ATTESTATION_PRIVATE_KEY;
const GAME_CONTRACT_ADDRESS = process.env.GAME_CONTRACT_ADDRESS;
const CHAIN_ID = Number(process.env.CHAIN_ID) || 50312;
const ATTESTATION_TTL_SECONDS = Number(process.env.ATTESTATION_TTL_SECONDS) || 600;
const CORS_ORIGINS = (process.env.CORS_ORIGINS || "http://localhost:3000")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

// Refuse to start rather than run on defaults. A signing service that quietly
// falls back to a throwaway key is worse than one that will not boot: every
// attestation it hands out would be rejected by the contract, and the reason
// would not surface until a player tried to claim.
for (const [name, value] of Object.entries({
  JWT_SECRET,
  ATTESTATION_PRIVATE_KEY,
  GAME_CONTRACT_ADDRESS,
})) {
  if (!value) {
    console.error(`Missing required environment variable: ${name}`);
    process.exit(1);
  }
}

const signer = new ethers.Wallet(ATTESTATION_PRIVATE_KEY);
console.log(`Attestation signer: ${signer.address}`);
console.log(`Signing for contract ${GAME_CONTRACT_ADDRESS} on chain ${CHAIN_ID}`);

const app = express();
app.use(express.json({ limit: "16kb" }));
app.use(cookieParser());
app.use(cors({ origin: CORS_ORIGINS, credentials: true }));

// --- Wallet authentication -------------------------------------------------

/** Outstanding login challenges, keyed by lowercase wallet address. */
const challenges = new Map();
const CHALLENGE_TTL_MS = 5 * 60 * 1000;

/**
 * How recently each wallet asked for an attestation.
 *
 * In-memory on purpose for now: this is one process, and losing the history on
 * restart costs a player nothing worse than one extra allowed claim. Moving to
 * Redis is the obvious step when a second instance appears.
 */
const lastAttestation = new Map();
const ATTESTATION_COOLDOWN_MS = 10 * 1000;

const challengeMessage = (walletAddress, nonce, timestamp) =>
  `Rocket Candle Authentication\n\nNonce: ${nonce}\nWallet: ${walletAddress}\nTimestamp: ${timestamp}`;

app.post("/api/auth/challenge", (req, res) => {
  const { walletAddress } = req.body || {};
  if (!walletAddress || !ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const nonce = crypto.randomBytes(32).toString("hex");
  const timestamp = Date.now();
  challenges.set(walletAddress.toLowerCase(), {
    nonce,
    timestamp,
    expires: timestamp + CHALLENGE_TTL_MS,
  });

  res.json({ message: challengeMessage(walletAddress, nonce, timestamp), nonce });
});

app.post("/api/auth/verify", (req, res) => {
  const { walletAddress, signature, nonce } = req.body || {};
  if (!walletAddress || !signature || !nonce) {
    return res.status(400).json({ error: "Missing required fields" });
  }
  if (!ethers.isAddress(walletAddress)) {
    return res.status(400).json({ error: "Invalid wallet address" });
  }

  const key = walletAddress.toLowerCase();
  const challenge = challenges.get(key);
  if (!challenge || challenge.nonce !== nonce) {
    return res.status(401).json({ error: "No matching challenge" });
  }
  if (Date.now() > challenge.expires) {
    challenges.delete(key);
    return res.status(401).json({ error: "Challenge expired" });
  }

  // Spend the challenge whatever the outcome, so a wrong signature cannot be
  // retried against the same nonce.
  challenges.delete(key);

  let recovered;
  try {
    recovered = ethers.verifyMessage(
      challengeMessage(walletAddress, nonce, challenge.timestamp),
      signature
    );
  } catch {
    return res.status(401).json({ error: "Signature verification failed" });
  }

  if (recovered.toLowerCase() !== key) {
    return res.status(401).json({ error: "Signature verification failed" });
  }

  const token = jwt.sign({ walletAddress: key }, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN,
  });

  res.cookie("authToken", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 6 * 60 * 60 * 1000,
  });

  res.json({ success: true, walletAddress: key });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("authToken");
  res.json({ success: true });
});

app.get("/api/auth/status", (req, res) => {
  const token = req.cookies?.authToken;
  if (!token) return res.json({ authenticated: false });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    res.json({ authenticated: true, walletAddress: decoded.walletAddress });
  } catch {
    res.json({ authenticated: false });
  }
});

/** Reject anything without a valid session. */
const requireAuth = (req, res, next) => {
  const token = req.cookies?.authToken;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    req.walletAddress = jwt.verify(token, JWT_SECRET).walletAddress;
    next();
  } catch {
    res.status(401).json({ error: "Session expired" });
  }
};

// --- Run attestation -------------------------------------------------------

app.post("/api/runs/attest", requireAuth, async (req, res) => {
  const player = req.walletAddress;

  // A run is only ever signed for the wallet that proved it owns itself, so a
  // session cannot be used to mint points into somebody else's account.
  const run = {
    score: Number(req.body?.score),
    level: Number(req.body?.level),
    gameTime: Number(req.body?.gameTime),
    enemiesDestroyed: Number(req.body?.enemiesDestroyed),
    rocketsUsed: Number(req.body?.rocketsUsed),
  };

  const reason = rejectionReason(run);
  if (reason) return res.status(422).json({ error: reason });

  const since = Date.now() - (lastAttestation.get(player) || 0);
  if (since < ATTESTATION_COOLDOWN_MS) {
    return res.status(429).json({
      error: "Too many runs too quickly",
      retryAfterMs: ATTESTATION_COOLDOWN_MS - since,
    });
  }

  // A random nonce, remembered by the contract, so one signed run cannot be
  // submitted twice.
  const nonce = BigInt("0x" + crypto.randomBytes(16).toString("hex")).toString();
  const deadline = Math.floor(Date.now() / 1000) + ATTESTATION_TTL_SECONDS;

  const attested = {
    player: ethers.getAddress(player),
    score: run.score,
    level: run.level,
    gameTime: run.gameTime,
    enemiesDestroyed: run.enemiesDestroyed,
    rocketsUsed: run.rocketsUsed,
    nonce,
    deadline,
  };

  try {
    const signature = await signRun({
      signer,
      chainId: CHAIN_ID,
      verifyingContract: GAME_CONTRACT_ADDRESS,
      run: attested,
    });

    lastAttestation.set(player, Date.now());
    res.json({ run: attested, signature });
  } catch (error) {
    console.error("Failed to sign run:", error);
    res.status(500).json({ error: "Could not sign this run" });
  }
});

// --- Traded volume ---------------------------------------------------------

/*
 * How much each wallet has moved through the exchange.
 *
 * On disk rather than in the browser: the browser copy dies with a cleared
 * cache and never existed on a second device, so the figure a player sees
 * would depend on where they happened to be sitting. On chain would be better
 * still, but the RPC caps log queries at 900 blocks - about ninety seconds of
 * history on this network - so rebuilding a running total that way is not
 * possible without an indexer.
 */
const VOLUME_STORE =
  process.env.VOLUME_STORE || path.join(process.cwd(), "data", "volume.json");

/** { [wallet]: { volumeUsdso, trades, seen: [txHash] } } */
let volumes = {};

try {
  volumes = JSON.parse(fs.readFileSync(VOLUME_STORE, "utf8"));
} catch {
  // No file yet is the normal first run, not an error.
}

const saveVolumes = () => {
  try {
    fs.mkdirSync(path.dirname(VOLUME_STORE), { recursive: true });
    // Write beside the file and rename, so a crash mid-write cannot leave a
    // truncated store that fails to parse on the next boot.
    const temp = `${VOLUME_STORE}.tmp`;
    fs.writeFileSync(temp, JSON.stringify(volumes));
    fs.renameSync(temp, VOLUME_STORE);
  } catch (error) {
    console.error("Could not persist volume:", error.message);
  }
};

const RPC_URL = process.env.RPC_URL || "https://dream-rpc.somnia.network";
const provider = new ethers.JsonRpcProvider(RPC_URL);

/** How many trades one wallet may have recorded. Bounds the stored history. */
const MAX_SEEN = 500;

app.get("/api/volume/:address", (req, res) => {
  const key = String(req.params.address || "").toLowerCase();
  const record = volumes[key];
  res.json({
    volumeUsdso: record?.volumeUsdso || 0,
    trades: record?.trades || 0,
  });
});

app.post("/api/volume", requireAuth, async (req, res) => {
  const wallet = req.walletAddress.toLowerCase();
  const txHash = String(req.body?.txHash || "");
  const amount = Number(req.body?.amountUsdso);

  if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    return res.status(422).json({ error: "Not a transaction hash" });
  }
  if (!Number.isFinite(amount) || amount <= 0) {
    return res.status(422).json({ error: "Amount must be above zero" });
  }

  const record = volumes[wallet] || { volumeUsdso: 0, trades: 0, seen: [] };

  // Counting the same trade twice is the easy way to inflate this, so a hash
  // already recorded is accepted quietly and changes nothing.
  if (record.seen.includes(txHash)) {
    return res.json({ volumeUsdso: record.volumeUsdso, trades: record.trades });
  }

  /*
   * The trade has to exist and have succeeded. Without this the figure is
   * whatever a page cares to claim, which makes it worth nothing - and a
   * reverted transaction produces a receipt just like a successful one, so
   * the status is what has to be checked rather than the receipt's presence.
   */
  try {
    const receipt = await provider.getTransactionReceipt(txHash);
    if (!receipt) {
      return res.status(422).json({ error: "No such transaction on chain" });
    }
    if (receipt.status !== 1) {
      return res.status(422).json({ error: "That transaction failed" });
    }
  } catch (error) {
    console.error("Could not verify trade:", error.message);
    return res.status(503).json({ error: "Could not reach the chain" });
  }

  record.volumeUsdso = Number((record.volumeUsdso + amount).toFixed(6));
  record.trades += 1;
  record.seen = [...record.seen, txHash].slice(-MAX_SEEN);
  volumes[wallet] = record;
  saveVolumes();

  res.json({ volumeUsdso: record.volumeUsdso, trades: record.trades });
});

app.get("/health", (req, res) => {
  res.json({
    ok: true,
    signer: signer.address,
    chainId: CHAIN_ID,
    contract: GAME_CONTRACT_ADDRESS,
  });
});

// Drop expired challenges rather than letting the map grow without bound.
setInterval(() => {
  const now = Date.now();
  for (const [key, challenge] of challenges) {
    if (now > challenge.expires) challenges.delete(key);
  }
  for (const [key, at] of lastAttestation) {
    if (now - at > 60 * 60 * 1000) lastAttestation.delete(key);
  }
}, 60 * 1000).unref();

app.listen(PORT, () => {
  console.log(`Attestation service listening on :${PORT}`);
});

export default app;
