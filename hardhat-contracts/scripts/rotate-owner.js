/**
 * Hand the contract to a new owner, and empty the old key.
 *
 * The deployer key was exposed. It owns the game, so whoever holds it can move
 * the WICK float, swap the attestation signer and pause play - which is why
 * this runs before anything else outstanding.
 *
 * Order matters. Ownership moves first and is read back from the chain before
 * any coin is swept, because the old key has to be able to pay for the
 * transfer. Sweeping first would strand the transfer with an account that
 * cannot afford it.
 */
const hre = require("hardhat");

const NEW_OWNER = process.env.NEW_OWNER_ADDRESS;
const GAME = process.env.ROCKET_CANDLE_GAME_ADDRESS;

async function main() {
  const { ethers } = hre;

  if (!NEW_OWNER || !ethers.isAddress(NEW_OWNER)) {
    throw new Error("Set NEW_OWNER_ADDRESS to the address printed by scripts/newkey.js");
  }
  if (!GAME) throw new Error("ROCKET_CANDLE_GAME_ADDRESS missing from .env");

  const [old] = await ethers.getSigners();
  const game = await ethers.getContractAt("RocketCandleGame", GAME);

  const currentOwner = await game.owner();
  console.log(`Contract    ${GAME}`);
  console.log(`Old owner   ${old.address}`);
  console.log(`New owner   ${NEW_OWNER}`);

  if (currentOwner.toLowerCase() === NEW_OWNER.toLowerCase()) {
    console.log("Ownership already transferred. Skipping to the sweep.");
  } else {
    if (currentOwner.toLowerCase() !== old.address.toLowerCase()) {
      throw new Error(
        `This key is not the owner - the contract says ${currentOwner}. Nothing done.`
      );
    }

    const tx = await game.transferOwnership(NEW_OWNER);
    console.log(`transferOwnership ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt.status !== 1) throw new Error("transferOwnership reverted");

    // Read it back rather than trusting the receipt. A reverted call produces a
    // receipt just the same, and this is the one fact the whole script exists
    // to establish.
    const now = await game.owner();
    if (now.toLowerCase() !== NEW_OWNER.toLowerCase()) {
      throw new Error(`Transfer mined but owner still reads ${now}`);
    }
    console.log("Owner confirmed on chain.");
  }

  // --- sweep -------------------------------------------------------------
  //
  // Only now, with ownership already moved, is it safe to leave the old key
  // unable to pay for anything.
  const provider = ethers.provider;
  const balance = await provider.getBalance(old.address);
  const fees = await provider.getFeeData();

  /*
   * Spell out every fee field, and leave exactly the postage.
   *
   * The first attempt subtracted an estimate and let the library fill the rest
   * in, which failed as "insufficient balance": the fee cap it chose at send
   * time was higher than the one the estimate had just quoted, so the amount
   * left behind no longer covered it. With the cap, the priority and the limit
   * all pinned here, what the network needs up front is value + limit x cap,
   * which is the balance to the wei.
   *
   * The limit is NOT 21,000. Somnia charges 400,000 for bringing a brand-new
   * account into existence, and the new owner is by definition an address
   * nothing has ever paid. Pinned at 21,000 this send mined with status 0 and
   * burned the lot. Anything unused comes back, so the only cost of the
   * headroom is a fraction of a coin left in the old key.
   */
  const cap = fees.maxFeePerGas ?? fees.gasPrice ?? ethers.parseUnits("6", "gwei");
  const GAS_LIMIT = 500000n;
  const cost = GAS_LIMIT * cap;

  if (balance <= cost) {
    console.log(
      `Old key holds ${ethers.formatEther(balance)} STT, which does not cover ` +
        `its own postage. Nothing to sweep.`
    );
    return;
  }

  const value = balance - cost;
  console.log(`Sweeping ${ethers.formatEther(value)} STT to the new owner...`);

  const sweep = await old.sendTransaction({
    to: NEW_OWNER,
    value,
    gasLimit: GAS_LIMIT,
    maxFeePerGas: cap,
    maxPriorityFeePerGas: cap,
  });
  const sweepReceipt = await sweep.wait();
  if (sweepReceipt.status !== 1) throw new Error("Sweep reverted");
  console.log(`Sweep ${sweep.hash}`);

  console.log("");
  console.log(`Old key now holds ${ethers.formatEther(await provider.getBalance(old.address))} STT`);
  console.log(`New owner holds   ${ethers.formatEther(await provider.getBalance(NEW_OWNER))} STT`);
  console.log("");
  console.log("Remaining by hand:");
  console.log("  1. Move NEW_OWNER_PRIVATE_KEY from .env.newowner into .env as PRIVATE_KEY,");
  console.log("     then delete .env.newowner.");
  console.log("  2. The exposed key is finished. Do not reuse it for anything.");
  console.log("  3. The attestation signer is a different key and was NOT exposed;");
  console.log("     rotate it only if you want to, with setRunAttestor.");
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
