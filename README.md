# Rocket Candle

A way into an on-chain order book that happens to be a game.

You pick a trading pair, buy a real position in it on [DreamDEX](https://dreamdex.io),
and that purchase is how a run starts. The pair's price history becomes the
terrain you shoot across, how much you hold decides how far your rocket reaches,
and the position sells back when the run ends. It is aimed at people for whom a
normal exchange screen is a wall of numbers with no way in.

Built on [Somnia](https://somnia.network). Live on Shannon testnet.

## How a run actually works

1. **Set trading up, once.** Your wallet authorises a throwaway key held in this
   browser to place and cancel orders for you, and moves working capital into
   the exchange's vault. The key can never withdraw. This is what buys you a run
   with no wallet popup between shots.
2. **Pick a pair.** Four markets, each with its own character — a stablecoin is
   flat, gentle ground; Bitcoin is jagged cliffs. Nothing invents a difficulty
   setting: the market supplies it. A market you cannot afford is greyed, with
   what it needs against what that pool holds.
3. **Choose your stake and your exits.** How much of the vault to put in, and
   the two prices that end the trade for you: a floor if it falls, a target if it
   rises. Either sells; neither ends your run.
4. **Play.** The level is that pair's real price history. Live order flow shakes
   the field while you aim.
5. **The run ends and the position sells back.** Your score is countersigned by
   the attestation service and submitted, carrying the stake and the profit or
   loss with it — so a run and its trade are one record.

`E` ejects your position at any time without ending the game. `F` adds to it,
which grows the blast. The money decision and the game decision are deliberately
kept apart.

## What is in here

| Path | What it is |
|---|---|
| `frontend/` | Next.js 15 app, Phaser 3 game, and the trading library |
| `hardhat-contracts/` | `RocketCandleGame.sol` — the WICK token, scores, weekly pot |
| `server/` | The attestation service: countersigns finished runs, records volume |

The game runs inside a React page rather than owning the screen: score, level
and enemies are HTML above the frame, the trading panel is a sheet the player
opens, and the canvas keeps the play field.

### Frontend

- **Next.js 15 / React 19**, TypeScript
- **Phaser 3** for the physics and the canvas art, which is drawn at runtime
  rather than loaded — see `src/utils/DesignTextures.js`
- **wagmi 2 + viem** for the chain. Not ethers
- **Hand-written CSS** against a design system in `src/app/design-system.css`.
  No Tailwind
- **`node:test`** for the trading maths — 49 tests, no test framework installed

### The trading library

`frontend/src/lib/` is the part worth reading. It talks to DreamDEX directly:

- `orders.ts` — tick and lot alignment, order placement, top of book
- `position.ts` — opening, adding to, marking and closing a position
- `minimums.ts` — the smallest buy each market will accept, priced the way an
  order really pays
- `stopOrder.ts` — a stop resting on the exchange, which survives a closed tab
- `tradingBridge.ts` — what the game is allowed to do with money
- `sessionKey.ts` / `hooks/useSessionKey.ts` — the browser key and its authority

## Running it

```bash
# 1. The contract
cd hardhat-contracts
npm install
cp .env.example .env          # PRIVATE_KEY and RUN_ATTESTOR_ADDRESS
npm run deploy:somnia         # prints the address and verifies the source

# 2. The attestation service
cd ../server
npm install
cp .env.example .env          # JWT_SECRET, ATTESTATION_PRIVATE_KEY, GAME_CONTRACT_ADDRESS
node index.js                 # :4000

# 3. The game
cd ../frontend
npm install
echo "NEXT_PUBLIC_GAME_CONTRACT_ADDRESS=<the address>" > .env.local
npm run dev                   # :3000
```

`npm test` in `frontend` needs **Node 22 or newer** — it runs TypeScript
directly through type stripping, which Node 20 refuses.

`/practice` plays without a wallet: a two-level taster on real price history,
buying nothing.

## The network

| | |
|---|---|
| Chain | Somnia Shannon testnet, id **50312** |
| RPC | `https://dream-rpc.somnia.network` |
| Explorer | `https://shannon-explorer.somnia.network` |
| Native coin | STT |
| Quote currency | USDso — `0x9c32F3827A1a99f0cf9B213de8b53eC3d57bb171` |
| Game contract | `0xd71B17e27BCF2efFa2169e43fEA3504E5B615011` |

Markets on testnet are WBTC, WETH and SOMI against USDso. USDC.e exists on
mainnet only, so its card is greyed there and playable in practice.

Two things that catch people out. The native side of a pair has no token
contract, so it is keyed by a sentinel address rather than `address(0)`. And the
exchange vault is **per pool** — a balance read is a call on the pool, so money
deposited for one pair cannot buy another.

## Anti-cheat

A player used to be able to report any score. Now a finished run has to be
countersigned by the attestation service before the contract will take it, each
signature spends a nonce so a run cannot be claimed twice, and the signed
payload includes the trade — because a profit a player merely asserts is a
profit they can choose.

The signing key can be rotated with `setRunAttestor`, which invalidates every
forged signature at once.

## WICK

WICK is points, not a promise of a fixed amount of money. A fixed rate — so many
points always buy so much — is a well with no bottom: anybody earning faster
than planned drains it, and the only way out is to break the rate, which players
never forgive.

So a week's pot is shared out instead. Your points that week divided by
everybody's points that week is your slice. A busy week pays a bigger pot, a
quiet one pays less, and the pot can never pay out more than went into it — so
somebody farming points mostly dilutes themselves. The pot is held in USDso and
the only way out of the contract is a player claiming their own share.

**Claim window.** A week's pot stays claimable for three weeks after it
closes. The grace period is counted as four weeks from when the scored week
began, not from when it closes, and one of those four weeks is spent waiting
for the week itself to end — so the real safety margin after closing is three
weeks, not four. Once a week is that old, `rollOverWeek` lets anybody push its
unclaimed remainder into the current week's pot — no owner privilege
involved, the money never leaves the contract, it just pays a later week's
players instead. A share you never claimed within that window is gone for
good, so claim it before it ages out.

**What the owner can and cannot do.** The owner can rotate the signing key with
`setRunAttestor`, pause player actions with `setPaused`, move WICK with
`emergencyTokenTransfer`, and — only while the redeploy migration window is
open — carry a player's score and treasury WICK over with `migratePlayer`
before closing that window for good with `sealMigration`. These five sit
behind `onlyOwner` and all touch WICK or contract state, never the USDso pot —
though the owner address itself can be transferred or permanently renounced
(standard OpenZeppelin `Ownable`), so who holds these five powers can change,
even though it still never gains access to the USDso pot.
`emergencyTokenTransfer` calls the WICK contract's own `_transfer`, not the
stake token, so it has no path to the prize pot at all — the only way USDso
leaves the contract is a player calling `claimWeeklyShare` for their own share.
The WICK side is a real power, not a token one: the contract launches holding a
9,000,000 WICK reserve, every score reward and migration is paid out of it, and
the owner can move it. Both claims are checkable against
`hardhat-contracts/contracts/RocketCandleGame.sol`.

## Building on Somnia

Somnia does not price gas the way Ethereum does, and the differences are
multiples rather than adjustments:

| | Somnia | Ethereum |
|---|---|---|
| Deployed bytecode, per byte | **3,125** | 200 |
| Touching a slot not recently accessed | **1,000,000** | 2,100 |
| Writing a fresh slot | 200,000 | 20,000 |

Two consequences shaped this contract. **Size is the deploy bill** — 89% of the
44.4M gas this deployment cost was the bytecode. And **a loop over storage is
not cheap**: the weekly leaderboard used to be scanned linearly inside the write
path, which would have charged the thousandth player of a week about 6 SOMI to
submit one score. It is keyed by player now, and costs the same whoever you are.

Figures measured, not quoted, against
[`somnia-primitives`](https://github.com/IronicDeGawd/somnia-primitives).

## Deploying

Runs on EC2 behind nginx: `rocket-candle-web` serves the built Next app and
`rocket-candle-attest` runs the attestation service. Sync `frontend/src`,
rebuild on the box, restart both. The 2GB swap is load-bearing — the build peaks
near the instance's memory.

## Licence

MIT.
