/**
 * Make a fresh owner key.
 *
 * The point of this script is that the key is never printed. The last one was
 * exposed by a command that meant to filter it out of its own output and
 * misfired, so this writes straight to a file at mode 600 and puts only the
 * address on screen. Nothing here is safe to run with output being captured
 * anywhere - it does not need to be, because there is nothing secret in it.
 */
const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

const OUT = path.join(__dirname, "..", ".env.newowner");

if (fs.existsSync(OUT)) {
  console.error(
    `${OUT} already exists. Refusing to overwrite - an unused key here may ` +
      `already hold funds or ownership. Move it aside first.`
  );
  process.exit(1);
}

const wallet = ethers.Wallet.createRandom();

// Written with the mode set at creation, not chmod'ed after: for the moment
// between the two the file would be world-readable.
fs.writeFileSync(OUT, `NEW_OWNER_PRIVATE_KEY=${wallet.privateKey}\n`, {
  mode: 0o600,
});

console.log(`New owner address: ${wallet.address}`);
console.log(`Key written to     ${OUT} (mode 600, gitignored)`);
console.log("");
console.log("Next:");
console.log(`  NEW_OWNER_ADDRESS=${wallet.address} npx hardhat run scripts/rotate-owner.js --network somnia`);
