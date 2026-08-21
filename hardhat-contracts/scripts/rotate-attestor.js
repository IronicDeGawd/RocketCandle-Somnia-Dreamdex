/**
 * Replace the run-signing key, on chain.
 *
 * The old one lived in `server/.env` on a box that was compromised, so it is
 * stolen: whoever holds it can countersign runs that were never played and
 * mint WICK from them. This is the whole reason the attestor is a variable
 * rather than a constant - one call invalidates every forged signature at
 * once, with no redeploy and no migration.
 *
 * Two steps, deliberately separate. `newattestor.js` makes the key and never
 * prints it; this points the contract at its address. The key itself never
 * needs funds - it signs messages, it does not send transactions.
 */
const hre = require("hardhat");

const NEW_ATTESTOR = process.env.NEW_ATTESTOR_ADDRESS;
const GAME = process.env.ROCKET_CANDLE_GAME_ADDRESS;

async function main() {
  const { ethers } = hre;

  if (!NEW_ATTESTOR || !ethers.isAddress(NEW_ATTESTOR)) {
    throw new Error(
      "Set NEW_ATTESTOR_ADDRESS to the address printed by scripts/newattestor.js"
    );
  }
  if (!GAME) throw new Error("ROCKET_CANDLE_GAME_ADDRESS missing from .env");

  const [owner] = await ethers.getSigners();
  const game = await ethers.getContractAt("RocketCandleGame", GAME);

  const current = await game.runAttestor();
  const onChainOwner = await game.owner();

  console.log(`Contract      ${GAME}`);
  console.log(`Signing as    ${owner.address}`);
  console.log(`Contract owner${" ".repeat(0)} ${onChainOwner}`);
  console.log(`Old attestor  ${current}`);
  console.log(`New attestor  ${NEW_ATTESTOR}`);

  if (onChainOwner.toLowerCase() !== owner.address.toLowerCase()) {
    throw new Error(
      `This key does not own the contract - it says ${onChainOwner}. Nothing done.`
    );
  }

  if (current.toLowerCase() === NEW_ATTESTOR.toLowerCase()) {
    console.log("Already rotated. Nothing to do.");
    return;
  }

  const tx = await game.setRunAttestor(NEW_ATTESTOR);
  console.log(`setRunAttestor ${tx.hash}`);
  const receipt = await tx.wait();
  if (receipt.status !== 1) throw new Error("setRunAttestor reverted");

  // Read it back rather than trusting the receipt. A reverted call produces a
  // receipt just the same, and this is the one fact that matters here.
  const now = await game.runAttestor();
  if (now.toLowerCase() !== NEW_ATTESTOR.toLowerCase()) {
    throw new Error(`Mined but the attestor still reads ${now}`);
  }

  console.log("");
  console.log("Attestor confirmed on chain. Every signature from the old key is");
  console.log("now refused by the contract.");
  console.log("");
  console.log("Remaining by hand:");
  console.log("  1. Put NEW_ATTESTOR_PRIVATE_KEY into the new box's server/.env");
  console.log("     as ATTESTATION_PRIVATE_KEY, then delete .env.newattestor.");
  console.log("  2. Generate a fresh JWT_SECRET for that box too - the old one was");
  console.log("     on the compromised host and every session it signed is suspect.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
