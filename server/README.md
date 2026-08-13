# Attestation service

Signs finished runs so the game contract can tell a real one from a made-up one.

## What problem this solves

The contract used to take the player's word for their own score. It checked the
numbers were plausible — long enough game, not too many points per second — and
then minted tokens. Anyone able to call the contract could therefore mint
themselves whatever a plausible-looking run was worth.

Now the numbers have to arrive countersigned by this service.

## What the signature does and does not promise

**It does not promise the run was played honestly.** The game runs in the
player's own browser and nothing here can see inside it.

What it does promise is narrower, and still worth having:

- the run came through this service,
- for a wallet that proved it owns itself,
- inside the service's limits,
- and has not been claimed before.

That turns minting from something anyone can do into something only this service
can authorise — so it can be rate limited, tightened, or switched off without
touching the deployed contract. If the signing key leaks, `setRunAttestor`
invalidates every forged signature immediately.

Closing the remaining gap — proving the run itself — needs the game to become
server-authoritative, which is a much larger change.

## How a run gets claimed

1. Player asks for a challenge and signs it, proving the wallet is theirs.
2. Service returns a session cookie.
3. Player finishes a run; the game posts the result here.
4. Service checks the limits and signs the run as EIP-712 typed data, bound to
   one chain and one contract, with a random nonce and a deadline.
5. Player submits the run **and** the signature to the contract themselves.
6. Contract recovers the signer, checks it is the attestor, spends the nonce.

The signing key never needs funds — players pay their own gas.

## Running it

```bash
cp .env.example .env     # fill in JWT_SECRET, ATTESTATION_PRIVATE_KEY, GAME_CONTRACT_ADDRESS
npm install
npm start                # or: npm run dev
```

The service refuses to start without those three, rather than falling back to
defaults and handing out signatures the contract would reject.

At startup it prints the signer address. **That address must match the
contract's `runAttestor`**, set at deploy time via `RUN_ATTESTOR_ADDRESS` or
changed later with `setRunAttestor`.

## Endpoints

| Method | Path | Notes |
| --- | --- | --- |
| `POST` | `/api/auth/challenge` | `{walletAddress}` → message to sign |
| `POST` | `/api/auth/verify` | `{walletAddress, signature, nonce}` → session cookie |
| `POST` | `/api/auth/logout` | clears the session |
| `GET` | `/api/auth/status` | is this session still good |
| `POST` | `/api/runs/attest` | authenticated; run result → signed attestation |
| `GET` | `/health` | signer address, chain and contract it is signing for |

## Known limits

- Sessions, challenges and the per-wallet cooldown are held in memory, so a
  restart forgets them and a second instance would not share them. Redis is the
  obvious next step.
- The cooldown is per wallet, and wallets are free to create. It slows bulk
  claiming; it does not prevent it.
