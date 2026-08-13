const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

/**
 * The whole point of a pot share is that it cannot be drained. These tests hold
 * that line: what goes out is never more than what went in, no matter how many
 * points anybody earns.
 */
describe("Token economics", function () {
  let game;
  let stake;
  let owner;
  let attestor;
  let alice;
  let bob;

  const WEEK = 7 * 24 * 60 * 60;

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

  async function playRun(player, score, level = 3) {
    const nonce = nextNonce++;
    const deadline = (await time.latest()) + 600;
    const domain = {
      name: "RocketCandle",
      version: "1",
      chainId: (await ethers.provider.getNetwork()).chainId,
      verifyingContract: await game.getAddress(),
    };
    const run = {
      player: player.address,
      score,
      level,
      gameTime: 120,
      enemiesDestroyed: 10,
      rocketsUsed: 8,
      nonce,
      deadline,
    };
    const signature = await attestor.signTypedData(domain, RUN_TYPES, run);
    await game
      .connect(player)
      .submitScore(score, level, 120, 10, 8, nonce, deadline, signature);
  }

  /** Play runs until this player holds at least `target` WICK. */
  async function earnAtLeast(player, target) {
    while ((await game.balanceOf(player.address)) < target) {
      await playRun(player, 100000, 5);
    }
  }

  beforeEach(async function () {
    [owner, attestor, alice, bob] = await ethers.getSigners();

    const Mock = await ethers.getContractFactory("MockStakeToken");
    stake = await Mock.deploy();
    await stake.waitForDeployment();

    const Game = await ethers.getContractFactory("RocketCandleGame");
    game = await Game.deploy(attestor.address, await stake.getAddress());
    await game.waitForDeployment();

    await stake.mint(owner.address, ethers.parseEther("10000"));
    await stake
      .connect(owner)
      .approve(await game.getAddress(), ethers.parseEther("10000"));
  });

  it("Should be named WICK", async function () {
    expect(await game.name()).to.equal("Rocket Candle Wick");
    expect(await game.symbol()).to.equal("WICK");
  });

  it("Should split a week's pot in proportion to points earned", async function () {
    // Alice grinds harder than Bob; both clear the claim threshold.
    await playRun(alice, 200000, 5);
    await playRun(alice, 200000, 5);
    await playRun(bob, 200000, 5);

    const week = await game.getCurrentWeek();
    const alicePoints = await game.weeklyPointsEarned(week, alice.address);
    const bobPoints = await game.weeklyPointsEarned(week, bob.address);
    const total = await game.weeklyPointsTotal(week);
    expect(total).to.equal(alicePoints + bobPoints);

    const pot = ethers.parseEther("900");
    await game.connect(owner).fundWeeklyPot(pot);
    await time.increase(WEEK);

    await game.connect(alice).claimWeeklyShare(week);
    await game.connect(bob).claimWeeklyShare(week);

    const aliceGot = await stake.balanceOf(alice.address);
    const bobGot = await stake.balanceOf(bob.address);

    // Each slice is exactly that player's share of the week's points.
    expect(aliceGot).to.equal((pot * alicePoints) / total);
    expect(bobGot).to.equal((pot * bobPoints) / total);
    expect(aliceGot).to.be.gt(bobGot);

    // The line that matters: never more out than in.
    expect(aliceGot + bobGot).to.be.lte(pot);
  });

  it("Should not pay more out than went in, however many points are earned", async function () {
    const pot = ethers.parseEther("100");
    await game.connect(owner).fundWeeklyPot(pot);

    // Alice grinds far harder than Bob. Her slice grows; the pot does not.
    for (let i = 0; i < 5; i++) await playRun(alice, 200000, 5);
    await playRun(bob, 200000, 5);

    const week = await game.getCurrentWeek();
    await time.increase(WEEK);

    await game.connect(alice).claimWeeklyShare(week);
    await game.connect(bob).claimWeeklyShare(week);

    const paid =
      (await stake.balanceOf(alice.address)) + (await stake.balanceOf(bob.address));
    expect(paid).to.be.lte(pot);
  });

  it("Should refuse a second claim for the same week", async function () {
    await playRun(alice, 200000, 5);
    await game.connect(owner).fundWeeklyPot(ethers.parseEther("100"));
    const week = await game.getCurrentWeek();
    await time.increase(WEEK);

    await game.connect(alice).claimWeeklyShare(week);
    await expect(
      game.connect(alice).claimWeeklyShare(week)
    ).to.be.revertedWith("Already claimed");
  });

  it("Should refuse to claim a week that is still running", async function () {
    await playRun(alice, 200000, 5);
    await game.connect(owner).fundWeeklyPot(ethers.parseEther("100"));
    const week = await game.getCurrentWeek();

    await expect(
      game.connect(alice).claimWeeklyShare(week)
    ).to.be.revertedWith("Week still running");
  });

  it("Should refuse a claim from below the threshold", async function () {
    // A tiny run earns far less than the threshold.
    await playRun(bob, 1000, 1);
    expect(await game.balanceOf(bob.address)).to.be.lt(await game.CLAIM_THRESHOLD());

    await game.connect(owner).fundWeeklyPot(ethers.parseEther("100"));
    const week = await game.getCurrentWeek();
    await time.increase(WEEK);

    await expect(
      game.connect(bob).claimWeeklyShare(week)
    ).to.be.revertedWith("Below claim threshold");
  });

  it("Should not pay somebody who earned nothing that week", async function () {
    await playRun(alice, 200000, 5);
    await game.connect(owner).fundWeeklyPot(ethers.parseEther("100"));
    const week = await game.getCurrentWeek();
    await time.increase(WEEK);

    await expect(
      game.connect(bob).claimWeeklyShare(week)
    ).to.be.revertedWith("Below claim threshold");
  });

  it("Should keep each week's pot separate", async function () {
    await playRun(alice, 200000, 5);
    const weekOne = await game.getCurrentWeek();
    await game.connect(owner).fundWeeklyPot(ethers.parseEther("100"));

    await time.increase(WEEK);

    // A later contribution belongs to the later week, so it cannot dilute or
    // inflate a week already finished.
    await game.connect(owner).fundWeeklyPot(ethers.parseEther("500"));
    expect(await game.weeklyPot(weekOne)).to.equal(ethers.parseEther("100"));

    await time.increase(WEEK);
    await game.connect(alice).claimWeeklyShare(weekOne);
    expect(await stake.balanceOf(alice.address)).to.equal(ethers.parseEther("100"));
  });

  describe("Sinks", function () {
    beforeEach(async function () {
      await earnAtLeast(alice, ethers.parseEther("400"));
    });

    it("Should burn points for firepower", async function () {
      const before = await game.balanceOf(alice.address);
      const supplyBefore = await game.totalSupply();

      await expect(game.connect(alice).purchaseFirepower())
        .to.emit(game, "FirepowerPurchased");

      const cost = await game.FIREPOWER_COST();
      expect(await game.balanceOf(alice.address)).to.equal(before - cost);
      // Burned, not recycled - the supply actually falls.
      expect(await game.totalSupply()).to.equal(supplyBefore - cost);
    });

    it("Should burn points for a market pass and grant access", async function () {
      expect(await game.hasMarketPass(alice.address)).to.equal(false);

      await game.connect(alice).purchaseMarketPass();

      expect(await game.hasMarketPass(alice.address)).to.equal(true);
    });

    it("Should extend a pass from its existing expiry, not from now", async function () {
      await game.connect(alice).purchaseMarketPass();
      const first = await game.marketPassExpiry(alice.address);

      await game.connect(alice).purchaseMarketPass();
      const second = await game.marketPassExpiry(alice.address);

      const duration = await game.MARKET_PASS_DURATION();
      expect(second).to.equal(first + duration);
    });

    it("Should let a pass lapse", async function () {
      await game.connect(alice).purchaseMarketPass();
      await time.increase(8 * 24 * 60 * 60);
      expect(await game.hasMarketPass(alice.address)).to.equal(false);
    });

    it("Should refuse a purchase without enough points", async function () {
      await expect(
        game.connect(bob).purchaseFirepower()
      ).to.be.revertedWith("Insufficient WICK");
    });
  });
});
