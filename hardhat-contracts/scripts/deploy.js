const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  console.log("🚀 Deploying RocketCandleGame to Somnia Network...");

  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // Check balance
  const balance = await deployer.provider.getBalance(deployer.address);
  console.log("Account balance:", hre.ethers.formatEther(balance), "SOM");

  // Deploy RocketCandleGame
  console.log("Deploying RocketCandleGame contract...");
  const RocketCandleGame = await hre.ethers.getContractFactory(
    "RocketCandleGame"
  );

  // The attestation service's signing address. Runs are only accepted when
  // countersigned by this key, so it has to be known at deploy time. It can be
  // rotated later with setRunAttestor if the key is ever compromised.
  const attestor = process.env.RUN_ATTESTOR_ADDRESS;
  if (!attestor || !hre.ethers.isAddress(attestor)) {
    // Deploying without this would produce a contract nobody can submit a
    // score to, and the mistake would only surface when a player tried.
    throw new Error(
      "RUN_ATTESTOR_ADDRESS must be set to the attestation service's signer " +
        "address (printed by the service at startup)."
    );
  }
  console.log("Run attestor:", attestor);

  // The currency the weekly pot pays out in - USDso, which is also what runs
  // will be staked in once the trading loop lands.
  const stakeToken = process.env.STAKE_TOKEN_ADDRESS;
  if (!stakeToken || !hre.ethers.isAddress(stakeToken)) {
    throw new Error(
      "STAKE_TOKEN_ADDRESS must be set to the USDso token address for this network."
    );
  }
  console.log("Stake token:", stakeToken);

  const rocketCandleGame = await RocketCandleGame.deploy(attestor, stakeToken);

  console.log("Waiting for deployment...");
  await rocketCandleGame.waitForDeployment();

  const contractAddress = await rocketCandleGame.getAddress();
  console.log("✅ RocketCandleGame deployed to:", contractAddress);

  // Get contract details
  const name = await rocketCandleGame.name();
  const symbol = await rocketCandleGame.symbol();
  const totalSupply = await rocketCandleGame.totalSupply();
  const maxSupply = await rocketCandleGame.MAX_TOTAL_SUPPLY();
  const owner = await rocketCandleGame.owner();

  console.log("📊 Contract Details:");
  console.log("  Token name:", name);
  console.log("  Token symbol:", symbol);
  console.log("  Total supply:", hre.ethers.formatEther(totalSupply));
  console.log("  Max supply:", hre.ethers.formatEther(maxSupply));
  console.log("  Owner:", owner);
  console.log("  Run attestor:", await rocketCandleGame.runAttestor());

  console.log("");
  console.log("Next steps:");
  console.log(`  1. server/.env      GAME_CONTRACT_ADDRESS=${contractAddress}`);
  console.log(`  2. frontend/.env    NEXT_PUBLIC_GAME_CONTRACT_ADDRESS=${contractAddress}`);
  console.log("  3. Restart the attestation service so it signs for this address.");

  // Save deployment info
  const deploymentInfo = {
    network: hre.network.name,
    contractAddress: contractAddress,
    deployer: deployer.address,
    timestamp: new Date().toISOString(),
    transactionHash: rocketCandleGame.deploymentTransaction().hash,
    blockNumber: rocketCandleGame.deploymentTransaction().blockNumber,
    gasUsed: rocketCandleGame.deploymentTransaction().gasLimit?.toString(),
    tokenDetails: {
      name: name,
      symbol: symbol,
      totalSupply: totalSupply.toString(),
      maxSupply: maxSupply.toString(),
      owner: owner,
    },
  };

  // Write to deployments.json
  const deploymentsPath = path.join(__dirname, "..", "deployments.json");
  let deployments = {};

  if (fs.existsSync(deploymentsPath)) {
    try {
      deployments = JSON.parse(fs.readFileSync(deploymentsPath, "utf8"));
    } catch (error) {
      console.log("Warning: Could not read existing deployments.json");
      deployments = {};
    }
  }

  deployments[hre.network.name] = deploymentInfo;
  fs.writeFileSync(deploymentsPath, JSON.stringify(deployments, null, 2));
  console.log("💾 Deployment info saved to deployments.json");

  // Update .env file
  const envPath = path.join(__dirname, "..", ".env");
  if (fs.existsSync(envPath)) {
    let envContent = fs.readFileSync(envPath, "utf8");
    envContent = envContent.replace(
      /ROCKET_CANDLE_GAME_ADDRESS=.*/,
      `ROCKET_CANDLE_GAME_ADDRESS=${contractAddress}`
    );
    fs.writeFileSync(envPath, envContent);
    console.log("🔧 Updated .env file with contract address");
  }

  // Verify contract on block explorer
  if (hre.network.name !== "hardhat" && hre.network.name !== "localhost") {
    console.log("⏳ Waiting for block confirmations...");
    await rocketCandleGame.deploymentTransaction().wait(6);

    console.log("🔍 Verifying contract on block explorer...");
    try {
      await hre.run("verify:verify", {
        address: contractAddress,
        constructorArguments: [attestor, stakeToken],
      });
      console.log("✅ Contract verified successfully");
    } catch (error) {
      console.log("❌ Contract verification failed:", error.message);
      console.log("You can manually verify the contract later using:");
      console.log(
        `npx hardhat verify --network ${hre.network.name} ${contractAddress} ${attestor} ${stakeToken}`
      );
    }
  }

  console.log("\n🎮 Deployment Summary:");
  console.log("======================");
  console.log(`Network: ${hre.network.name}`);
  console.log(`Contract: ${contractAddress}`);
  console.log(
    `Explorer: https://shannon-explorer.somnia.network/address/${contractAddress}`
  );
  console.log(`Token: ${name} (${symbol})`);
  console.log(`Total Supply: ${hre.ethers.formatEther(totalSupply)} ${symbol}`);
  console.log("\n🚀 Ready to play Rocket Candle!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Deployment failed:");
    console.error(error);
    process.exit(1);
  });
