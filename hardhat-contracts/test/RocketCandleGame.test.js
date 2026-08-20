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
      { name: "stakeUsdso", type: "uint128" },
      { name: "pnlUsdso", type: "int128" },
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

    // A run with a stake of nothing is a practice run, which is what most of
    // these cases are about; the ones that care pass their own.
    const stakeUsdso = options.stakeUsdso ?? 0n;
    const pnlUsdso = options.pnlUsdso ?? 0n;

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
      stakeUsdso,
      pnlUsdso,
      nonce,
      deadline,
    };

    const signature = await signer.signTypedData(domain, RUN_TYPES, run);

    // submitScore takes the run as one struct: ten positional arguments pushed
    // it past what the compiler could hold on the stack.
    const { player: _player, ...claim } = run;
    return [claim, signature];
  }

  beforeEach(async function () {
    [owner, player1, player2, attestor] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockStakeToken");
    const stake = await Mock.deploy();
    await stake.waitForDeployment();

    const RocketCandleGame = await ethers.getContractFactory(
      "RocketCandleGame"
    );
    rocketCandleGame = await RocketCandleGame.deploy(
      attestor.address,
      await stake.getAddress()
    );
    await rocketCandleGame.waitForDeployment();
  });

  describe("Deployment", function () {
    it("Should set the right token details", async function () {
      expect(await rocketCandleGame.name()).to.equal("Rocket Candle Wick");
      expect(await rocketCandleGame.symbol()).to.equal("WICK");
    });

    it("Should set the right owner", async function () {
      expect(await rocketCandleGame.owner()).to.equal(owner.address);
    });

    it("Should mint the treasury reserve only, no deployer premint", async function () {
      const expectedTreasuryBalance = ethers.parseEther("9000000");

      expect(await rocketCandleGame.balanceOf(owner.address)).to.equal(0);
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
          .submitScore(
            {
              score: 5000,
              level: 3,
              gameTime: 120,
              enemiesDestroyed: 10,
              rocketsUsed: 8,
              stakeUsdso: 0n,
              pnlUsdso: 0n,
              nonce: 1,
              deadline: (await time.latest()) + 600,
            },
            "0x"
          )
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
      // Inflate the score after it was signed. The struct is the first
      // argument now, so the tampering goes inside it.
      args[0] = { ...args[0], score: 500000 };
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
      // First, player needs tokens - earned by playing a run, since there is
      // no premint to hand out anymore.
      await rocketCandleGame
        .connect(player1)
        .submitScore(
          ...(await attest(player1, 200000, 5, 120, 10, 8))
        );

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
      ).to.be.revertedWith("Insufficient WICK");
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

  describe("The trade the run was played on", function () {
    it("Should store the stake and a profit", async function () {
      const stake = 5_000000000000000000n;
      const pnl = 320000000000000000n;

      await rocketCandleGame
        .connect(player1)
        .submitScore(
          ...(await attest(player1, 5000, 3, 120, 10, 8, {
            stakeUsdso: stake,
            pnlUsdso: pnl,
          }))
        );

      const history = await rocketCandleGame.getPlayerHistory(player1.address);
      expect(history[0].stakeUsdso).to.equal(stake);
      expect(history[0].pnlUsdso).to.equal(pnl);
    });

    it("Should store a loss as a negative number", async function () {
      // The whole reason the field is signed: a player who could choose it
      // would never choose to record this one.
      const pnl = -450000000000000000n;

      await rocketCandleGame
        .connect(player1)
        .submitScore(
          ...(await attest(player1, 5000, 3, 120, 10, 8, {
            stakeUsdso: 2_000000000000000000n,
            pnlUsdso: pnl,
          }))
        );

      const history = await rocketCandleGame.getPlayerHistory(player1.address);
      expect(history[0].pnlUsdso).to.equal(pnl);
    });

    it("Should refuse a stake altered after signing", async function () {
      const args = await attest(player1, 5000, 3, 120, 10, 8, {
        stakeUsdso: 1_000000000000000000n,
      });
      args[0] = { ...args[0], stakeUsdso: 900_000000000000000000n };

      await expect(
        rocketCandleGame.connect(player1).submitScore(...args)
      ).to.be.revertedWith("Bad attestation");
    });

    it("Should refuse a profit altered after signing", async function () {
      const args = await attest(player1, 5000, 3, 120, 10, 8, {
        stakeUsdso: 1_000000000000000000n,
        pnlUsdso: -500000000000000000n,
      });
      args[0] = { ...args[0], pnlUsdso: 500000000000000000n };

      await expect(
        rocketCandleGame.connect(player1).submitScore(...args)
      ).to.be.revertedWith("Bad attestation");
    });
  });

  describe("The weekly board", function () {
    it("Should cost the same gas whoever you are in the queue", async function () {
      /*
       * The point of the whole change. This used to search the week's array for
       * the player, and Somnia charges 1,000,000 gas to touch a slot nobody has
       * reached lately - so the last arrivals of a busy week paid for everyone
       * before them.
       */
      const submit = async (player) => {
        const tx = await rocketCandleGame
          .connect(player)
          .submitScore(...(await attest(player, 4000, 3, 120, 10, 8)));
        return (await tx.wait()).gasUsed;
      };

      const fresh = async () => {
        const wallet = ethers.Wallet.createRandom().connect(ethers.provider);
        await owner.sendTransaction({
          to: wallet.address,
          value: ethers.parseEther("1"),
        });
        return wallet;
      };

      /*
       * The very first submitter of a week creates slots everyone after it
       * finds already warm - the week's player-list length, the week's points
       * total - so it is not comparable with anybody. Measure the second
       * arrival against a much later one, where the only difference left would
       * be the scan.
       */
      await submit(player1);
      const early = await submit(await fresh());

      for (let i = 0; i < 40; i++) await submit(await fresh());

      const late = await submit(await fresh());

      // Later must not cost materially more than earlier. Cheaper is fine;
      // growing with the crowd is the bug coming back.
      expect(late).to.be.lessThan(early + 5000n);
    });

    it("Should keep only a player's best score for the week", async function () {
      await rocketCandleGame
        .connect(player1)
        .submitScore(...(await attest(player1, 9000, 3, 120, 10, 8)));
      await rocketCandleGame
        .connect(player1)
        .submitScore(...(await attest(player1, 3000, 3, 120, 10, 8)));

      const week = await rocketCandleGame.getCurrentWeek();
      expect(await rocketCandleGame.weeklyBest(week, player1.address)).to.equal(
        9000
      );
      // Listed once, not twice: the array is appended to on a first run only.
      expect(await rocketCandleGame.getWeeklyPlayerCount(week)).to.equal(1);
    });

    it("Should page the board rather than return all of it", async function () {
      await rocketCandleGame
        .connect(player1)
        .submitScore(...(await attest(player1, 5000, 3, 120, 10, 8)));
      await rocketCandleGame
        .connect(player2)
        .submitScore(...(await attest(player2, 7000, 3, 120, 10, 8)));

      const week = await rocketCandleGame.getCurrentWeek();

      const firstPage = await rocketCandleGame.getWeeklyScores(week, 0, 1);
      expect(firstPage.length).to.equal(1);
      expect(firstPage[0].player).to.equal(player1.address);

      const secondPage = await rocketCandleGame.getWeeklyScores(week, 1, 10);
      expect(secondPage.length).to.equal(1);
      expect(secondPage[0].score).to.equal(7000);

      // Past the end is empty, not a revert.
      expect((await rocketCandleGame.getWeeklyScores(week, 99, 10)).length).to.equal(0);
    });
  });

  describe("Carrying players across a redeploy", function () {
    it("Should restore a best score and hand over WICK", async function () {
      await rocketCandleGame.migratePlayer(
        player1.address,
        12345,
        50_000000000000000000n
      );

      const stats = await rocketCandleGame.getPlayerStats(player1.address);
      expect(stats.bestScore).to.equal(12345);
      expect(await rocketCandleGame.balanceOf(player1.address)).to.equal(
        50_000000000000000000n
      );
    });

    it("Should never lower a score somebody already set here", async function () {
      await rocketCandleGame
        .connect(player1)
        .submitScore(...(await attest(player1, 20000, 5, 200, 10, 8)));

      await rocketCandleGame.migratePlayer(player1.address, 500, 0);

      const stats = await rocketCandleGame.getPlayerStats(player1.address);
      expect(stats.bestScore).to.equal(20000);
    });

    it("Should be sealable, and sealed for good", async function () {
      await rocketCandleGame.sealMigration();
      expect(await rocketCandleGame.migrationOpen).to.be.a("function");

      await expect(
        rocketCandleGame.migratePlayer(player1.address, 1, 0)
      ).to.be.revertedWith("Migration sealed");
      await expect(rocketCandleGame.sealMigration()).to.be.revertedWith(
        "Already sealed"
      );
    });

    it("Should be owner-only", async function () {
      await expect(
        rocketCandleGame.connect(player1).migratePlayer(player1.address, 1, 0)
      ).to.be.reverted;
    });
  });
});
