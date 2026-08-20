const { expect } = require("chai");
const { ethers } = require("hardhat");
const path = require("path");
const { pathToFileURL } = require("url");

/**
 * The service and the contract have to agree exactly on what a signed run is:
 * the domain name, the version, the field names, their types, and their order.
 * Any drift in either file silently breaks every attestation, and the only
 * symptom is a "Bad attestation" revert with nothing to point at.
 *
 * So this test signs with the service's own code and submits to the real
 * contract. If the two ever drift apart, this fails immediately.
 */
describe("Attestation service <-> contract", function () {
  let attestation;
  let game;
  let owner;
  let player;
  let signerWallet;

  before(async function () {
    const modulePath = path.join(__dirname, "..", "..", "server", "attestation.js");
    attestation = await import(pathToFileURL(modulePath).href);
  });

  beforeEach(async function () {
    [owner, player] = await ethers.getSigners();
    signerWallet = ethers.Wallet.createRandom();

    const Mock = await ethers.getContractFactory("MockStakeToken");
    const stake = await Mock.deploy();
    await stake.waitForDeployment();

    const RocketCandleGame = await ethers.getContractFactory("RocketCandleGame");
    game = await RocketCandleGame.deploy(
      signerWallet.address,
      await stake.getAddress()
    );
    await game.waitForDeployment();
  });

  /** The struct submitScore takes: the signed run, without the player. */
  function claimOf(run) {
    const { player: _player, ...claim } = run;
    return claim;
  }

  /** Build and sign a run exactly the way the service does. */
  async function signWithService(overrides = {}) {
    const latest = await ethers.provider.getBlock("latest");
    const run = {
      player: player.address,
      score: 5000,
      level: 3,
      gameTime: 120,
      enemiesDestroyed: 10,
      rocketsUsed: 8,
      // The trade the run was played on, raw USDso. Signed like everything
      // else, so the service and the contract must agree on it too.
      stakeUsdso: "5000000000000000000",
      pnlUsdso: "-120000000000000000",
      nonce: "42",
      deadline: latest.timestamp + 600,
      ...overrides,
    };

    const signature = await attestation.signRun({
      signer: signerWallet,
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await game.getAddress(),
      run,
    });

    return { run, signature };
  }

  it("Should accept a run signed by the service's own code", async function () {
    const { run, signature } = await signWithService();

    await expect(
      game
        .connect(player)
        .submitScore(claimOf(run), signature)
    ).to.emit(game, "GameCompleted");
  });

  it("Should recover the same signer the contract checks against", async function () {
    const { run, signature } = await signWithService();

    const recovered = attestation.recoverRunSigner({
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await game.getAddress(),
      run,
      signature,
    });

    expect(recovered).to.equal(signerWallet.address);
    expect(await game.runAttestor()).to.equal(signerWallet.address);
  });

  it("Should not accept a run signed for a different contract", async function () {
    const latest = await ethers.provider.getBlock("latest");
    const run = {
      player: player.address,
      score: 5000,
      level: 3,
      gameTime: 120,
      enemiesDestroyed: 10,
      rocketsUsed: 8,
      stakeUsdso: "5000000000000000000",
      pnlUsdso: "0",
      nonce: "7",
      deadline: latest.timestamp + 600,
    };

    // Signed against some other deployment - the domain binds it there, so it
    // must be worthless here.
    const signature = await attestation.signRun({
      signer: signerWallet,
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: ethers.Wallet.createRandom().address,
      run,
    });

    await expect(
      game
        .connect(player)
        .submitScore(claimOf(run), signature)
    ).to.be.revertedWith("Bad attestation");
  });

  describe("Run limits", function () {
    it("Should turn away runs the contract would reject anyway", function () {
      const good = {
        score: 5000,
        level: 3,
        gameTime: 120,
        enemiesDestroyed: 10,
        rocketsUsed: 8,
      };
      expect(attestation.rejectionReason(good)).to.equal(null);

      expect(attestation.rejectionReason({ ...good, gameTime: 3 })).to.match(
        /too short/
      );
      expect(
        attestation.rejectionReason({ ...good, score: 1000000, gameTime: 10 })
      ).to.match(/faster than/);
      expect(attestation.rejectionReason({ ...good, level: 99 })).to.match(
        /level out of range/
      );
      expect(attestation.rejectionReason({ ...good, rocketsUsed: 999 })).to.match(
        /more rockets/
      );
      expect(attestation.rejectionReason({ ...good, score: 1.5 })).to.match(
        /whole numbers/
      );
      expect(attestation.rejectionReason({ ...good, enemiesDestroyed: 0 })).to.match(
        /destroy something/
      );
    });
  });
});
