const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

describe("RocketCandleGame", function () {
  let rocketCandleGame;
  let owner;
  let player1;
  let player2;
  let attestor;

  const RUN_TYPES = {
    Run: [
      { name: "player", type: "address" },
      { name: "score", type: "uint256" },
      { name: "level", type: "uint256" },
      { name: "gameTime", type: "uint256" },
      { name: "enemiesDestroyed", type: "uint16" },
      { name: "rocketsUsed", type: "uint16" },
      { name: "nonce", type: "uint256" },
      { name: "deadline", type: "uint256" },
    ],
  };

  let nextNonce = 1;

  // Stands in for the attestation service: signs a run so the contract will
  // accept it, and returns the arguments submitScore expects.
  async function attest(
    player,
    score,
    level,
    gameTime,
    enemiesDestroyed,
    rocketsUsed,
    options = {}
  ) {
    const signer = options.signer || attestor;
    const nonce = options.nonce ?? nextNonce++;
    const deadline =
      options.deadline ?? (await time.latest()) + 600;

    const domain = {
      name: "RocketCandle",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await rocketCandleGame.getAddress(),
    };

    const run = {
      player: player.address,
      score,
      level,
      gameTime,
      enemiesDestroyed,
      rocketsUsed,
      nonce,
      deadline,
    };

    const signature = await signer.signTypedData(domain, RUN_TYPES, run);
    return [
      score,
      level,
      gameTime,
      enemiesDestroyed,
      rocketsUsed,
      nonce,
      deadline,
      signature,
    ];
  }

  beforeEach(async function () {
    [owner, player1, player2, attestor] = await ethers.getSigners();

    const RocketCandleGame = await ethers.getContractFactory(
      "RocketCandleGame"
    );
    rocketCandleGame = await RocketCandleGame.deploy(attestor.address);
    await rocketCandleGame.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right token details", async function () {
      expect(await rocketCandleGame.name()).to.equal("Rocket Candle Fuel");
      expect(await rocketCandleGame.symbol()).to.equal("RocketFUEL");
    });

    it("Should set the right owner", async function () {
      expect(await rocketCandleGame.owner()).to.equal(owner.address);
    });

    it("Should mint initial supply correctly", async function () {
      const expectedOwnerBalance = ethers.parseEther("1000000");
      const expectedTreasuryBalance = ethers.parseEther("9000000");

      expect(await rocketCandleGame.balanceOf(owner.address)).to.equal(
        expectedOwnerBalance
      );
      expect(
        await rocketCandleGame.balanceOf(await rocketCandleGame.getAddress())
      ).to.equal(expectedTreasuryBalance);
    });
  });

  describe("Game Mechanics", function () {
    it("Should allow submitting valid scores", async function () {
      const score = 5000;
      const level = 3;
      const gameTime = 120; // 2 minutes
      const enemiesDestroyed = 10;
      const rocketsUsed = 8;

      await expect(
        rocketCandleGame
          .connect(player1)
          .submitScore(
            ...(await attest(
              player1,
              score,
              level,
              gameTime,
              enemiesDestroyed,
              rocketsUsed
            ))
          )
      )
        .to.emit(rocketCandleGame, "GameCompleted")
        .withArgs(player1.address, score, level, gameTime, enemiesDestroyed);
    });

    it("Should calculate token rewards correctly", async function () {
      const score = 10000; // 10 tokens
      const level = 5; // 7.5 tokens

      const expectedReward = await rocketCandleGame.calculateTokenReward(
        score,
        level
      );
      expect(expectedReward).to.equal(ethers.parseEther("17.5"));
    });

    it("Should reject invalid scores", async function () {
      // Score too high for time
      await expect(
        rocketCandleGame
          .connect(player1)
          .submitScore(...(await attest(player1, 1000000, 1, 10, 5, 3)))
      ).to.be.revertedWith("Suspicious score");
    });

    it("Should reject games that are too short", async function () {
      await expect(
        rocketCandleGame
          .connect(player1)
          .submitScore(...(await attest(player1, 1000, 1, 3, 5, 3)))
      ).to.be.revertedWith("Game too short");
    });
  });

  describe("Run attestation", function () {
    it("Should reject a run nobody signed for", async function () {
      await expect(
        rocketCandleGame
          .connect(player1)
          .submitScore(5000, 3, 120, 10, 8, 1, (await time.latest()) + 600, "0x")
      ).to.be.reverted;
    });

    it("Should reject a run signed by the wrong key", async function () {
      const args = await attest(player1, 5000, 3, 120, 10, 8, {
        signer: player2,
      });
      await expect(
        rocketCandleGame.connect(player1).submitScore(...args)
      ).to.be.revertedWith("Bad attestation");
    });

    it("Should reject a run attested for somebody else", async function () {
      // Signed for player1, submitted by player2 - the digest binds the run to
      // the caller, so this must not pass.
      const args = await attest(player1, 5000, 3, 120, 10, 8);
      await expect(
        rocketCandleGame.connect(player2).submitScore(...args)
      ).to.be.revertedWith("Bad attestation");
    });

    it("Should reject altered numbers", async function () {
      const args = await attest(player1, 5000, 3, 120, 10, 8);
      args[0] = 500000; // inflate the score after signing
      await expect(
        rocketCandleGame.connect(player1).submitScore(...args)
      ).to.be.revertedWith("Bad attestation");
    });

    it("Should refuse to accept the same run twice", async function () {
      const args = await attest(player1, 5000, 3, 120, 10, 8);
      await rocketCandleGame.connect(player1).submitScore(...args);
      await expect(
        rocketCandleGame.connect(player1).submitScore(...args)
      ).to.be.revertedWith("Run already claimed");
    });

    it("Should reject an attestation past its deadline", async function () {
      const args = await attest(player1, 5000, 3, 120, 10, 8, {
        deadline: (await time.latest()) + 60,
      });
      await time.increase(120);
      await expect(
        rocketCandleGame.connect(player1).submitScore(...args)
      ).to.be.revertedWith("Attestation expired");
    });

    it("Should let the owner rotate a compromised signing key", async function () {
      await expect(rocketCandleGame.setRunAttestor(player2.address))
        .to.emit(rocketCandleGame, "RunAttestorUpdated")
        .withArgs(attestor.address, player2.address);

      // The old key stops working the moment it is replaced.
      const oldKeyArgs = await attest(player1, 5000, 3, 120, 10, 8);
      await expect(
        rocketCandleGame.connect(player1).submitScore(...oldKeyArgs)
      ).to.be.revertedWith("Bad attestation");

      const newKeyArgs = await attest(player1, 5000, 3, 120, 10, 8, {
        signer: player2,
      });
      await expect(rocketCandleGame.connect(player1).submitScore(...newKeyArgs))
        .to.emit(rocketCandleGame, "GameCompleted");
    });

    it("Should not let anyone else rotate the signing key", async function () {
      await expect(
        rocketCandleGame.connect(player1).setRunAttestor(player1.address)
      ).to.be.reverted;
    });
  });

  describe("Token Economics", function () {
    it("Should allow revive purchase", async function () {
      // First, player needs tokens
      await rocketCandleGame
        .connect(owner)
        .transfer(player1.address, ethers.parseEther("100"));

      const initialBalance = await rocketCandleGame.balanceOf(player1.address);

      await expect(rocketCandleGame.connect(player1).purchaseRevive())
        .to.emit(rocketCandleGame, "RevivePurchased")
        .withArgs(player1.address, ethers.parseEther("50"));

      const finalBalance = await rocketCandleGame.balanceOf(player1.address);
      expect(initialBalance - finalBalance).to.equal(ethers.parseEther("50"));
    });

    it("Should reject revive without enough tokens", async function () {
      await expect(
        rocketCandleGame.connect(player1).purchaseRevive()
      ).to.be.revertedWith("Insufficient RocketFUEL tokens");
    });
  });

  describe("Admin Functions", function () {
    it("Should allow owner to pause", async function () {
      await rocketCandleGame.connect(owner).setPaused(true);

      await expect(
        rocketCandleGame
          .connect(player1)
          .submitScore(...(await attest(player1, 1000, 1, 30, 5, 3)))
      ).to.be.revertedWith("Contract is paused");
    });

    it("Should allow owner to unpause", async function () {
      await rocketCandleGame.connect(owner).setPaused(true);
      await rocketCandleGame.connect(owner).setPaused(false);

      // Should work now
      await expect(
        rocketCandleGame
          .connect(player1)
          .submitScore(...(await attest(player1, 1000, 1, 30, 5, 3)))
      ).to.not.be.reverted;
    });

    it("Should not allow non-owner to pause", async function () {
      await expect(
        rocketCandleGame.connect(player1).setPaused(true)
      ).to.be.revertedWithCustomError(
        rocketCandleGame,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
