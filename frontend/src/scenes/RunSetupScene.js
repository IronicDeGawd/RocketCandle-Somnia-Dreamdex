import {
  DEFAULT_MARKET_ID,
  GAME_MARKETS,
} from "@/data/DreamdexMarketFeed.js";
import { deriveOpeningStake, EXPOSURE_STEP } from "@/lib/commitment";

/**
 * The second screen: how much, and when to get out.
 *
 * Picking a pair and deciding what to risk on it are two different decisions,
 * and they were crammed onto the menu - the exits as two chips the same width
 * as the market cards, so they read as a fifth and sixth market, and the stake
 * not asked about at all because PLAY silently staked the whole vault.
 *
 * This screen asks both, about the pair already chosen, and is the only place
 * that opens a position. The menu goes back to being a picker.
 */

const INK = 0x14161a;
const WELL = 0x1b1e23;
const RED = 0xe94f37;
const YELLOW = 0xf6f740;
const BLUE = 0x3f88c5;

const PIXEL_FONT = '"Press Start 2P", monospace';
const MONO_FONT = '"Geist Mono", monospace';

const SHADOW_OFFSET = 5;

/**
 * Fallback floor, used only until the market's own minimum is known.
 *
 * Every spot market states its smallest trade in the token being bought, so the
 * real floor is that quantity at the current price and differs per market by
 * orders of magnitude. A flat figure here refused stakes the exchange would
 * have taken, and accepted stakes it would have refused.
 */
const FALLBACK_MIN_STAKE = 0.5;

/** What the commitment steps by when the player nudges it. */
const COMMITMENT_STEP = 0.5;

/*
 * What the two exits may be set to. Zero means off - a player who wants to
 * ride it out should be able to say so, rather than being given a floor they
 * did not ask for.
 */
const FLOOR_CHOICES = [0, 5, 10, 20];
const TARGET_CHOICES = [0, 5, 10, 20];

export class RunSetupScene extends Phaser.Scene {
  constructor() {
    super({ key: "RunSetupScene" });
  }

  create() {
    this.cameras.main.setBackgroundColor("#2a2d34");

    /*
     * The menu reads its default without writing it, so arriving here with the
     * registry empty is the normal first-run case rather than an error - and
     * without the same fallback this screen titled itself "THIS PAIR" and
     * showed no symbol at all.
     */
    this.marketId = this.registry.get("selectedMarketId") ?? DEFAULT_MARKET_ID;
    this.market = GAME_MARKETS.find((m) => m.id === this.marketId);
    this.buyingIn = false;

    /*
     * Null until the wallet answers. Not zero: treating an unread balance as
     * empty would refuse a funded player for as long as the read took.
     */
    this.walletBalance = null;
    this.commitment = null;
    this.openingStake = 0;

    this.exitPlan = {
      floorPct: this.registry.get("floorPct") ?? FLOOR_CHOICES[1],
      targetPct: this.registry.get("targetPct") ?? TARGET_CHOICES[2],
    };

    this.buildHeader();
    this.buildStakeRow();
    this.buildExitRow();
    this.buildActions();
    this.setUpKeys();

    this.readWalletBalance();

    /*
     * Follow the wallet while this screen is open.
     *
     * It used to be read once, on arrival. After a buy-in where the deposit
     * landed and only the buy failed, the figure on screen was the one from
     * before the money left - so the player could commit again against a
     * balance that no longer existed. The page republishes on its own poll;
     * this listens for that instead of trusting a snapshot.
     */
    this.onWalletChange = () => this.readWalletBalance();
    window.addEventListener("rc-hud", this.onWalletChange);
    this.events.once("shutdown", () => {
      window.removeEventListener("rc-hud", this.onWalletChange);
    });
    this.publishPlan();
  }

  buildHeader() {
    this.add
      .text(600, 60, (this.market?.label ?? "THIS PAIR").toUpperCase(), {
        fontFamily: PIXEL_FONT,
        fontSize: "26px",
        color: "#F6F740",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 100, this.market?.symbol ?? "", {
        fontFamily: MONO_FONT,
        fontSize: "15px",
        color: "#3F88C5",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 138, "HOW MUCH, AND WHEN TO GET OUT", {
        fontFamily: PIXEL_FONT,
        fontSize: "11px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);
  }

  /** A framed row: the commitment, with nudges either side of it. */
  buildStakeRow() {
    const y = 216;
    this.panel(600, y, 660, 112);

    this.add
      .text(600, y - 40, "COMMIT TO THIS RUN", {
        fontFamily: PIXEL_FONT,
        fontSize: "9px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    this.commitmentText = this.add
      .text(600, y - 6, "reading your wallet...", {
        fontFamily: MONO_FONT,
        fontSize: "24px",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    this.nudge(600 - 250, y - 8, "-", () => this.stepCommitment(-COMMITMENT_STEP));
    this.nudge(600 + 250, y - 8, "+", () => this.stepCommitment(COMMITMENT_STEP));

    // Read-only: the opening stake is derived, never edited directly. Showing
    // it is what tells a player the rest of their commitment is headroom for
    // `F` rather than money that went missing.
    this.openingStakeText = this.add
      .text(600, y + 26, "", {
        fontFamily: MONO_FONT,
        fontSize: "13px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    this.walletNote = this.add
      .text(600, y + 46, "", {
        fontFamily: MONO_FONT,
        fontSize: "13px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);
  }

  buildExitRow() {
    const y = 352;
    this.panel(600, y, 660, 96);

    this.add
      .text(600, y - 34, "SELL ITSELF WHEN", {
        fontFamily: PIXEL_FONT,
        fontSize: "9px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    this.floorValue = this.exitControl(
      600 - 160,
      y - 2,
      "IT FALLS",
      RED,
      () => this.cycleExit("floorPct", FLOOR_CHOICES)
    );

    this.targetValue = this.exitControl(
      600 + 160,
      y - 2,
      "IT RISES",
      YELLOW,
      () => this.cycleExit("targetPct", TARGET_CHOICES)
    );

    this.add
      .text(
        600,
        y + 34,
        "watched while this page is open - neither ends your run",
        {
          fontFamily: MONO_FONT,
          fontSize: "12px",
          color: "rgba(255,255,255,0.4)",
        }
      )
      .setOrigin(0.5);
  }

  buildActions() {
    this.statusText = this.add
      .text(600, 434, "", {
        fontFamily: MONO_FONT,
        fontSize: "14px",
        color: "#3F88C5",
        align: "center",
        wordWrap: { width: 900 },
      })
      .setOrigin(0.5);

    this.playButton = this.button(
      600 + 120,
      492,
      380,
      66,
      "PLAY GAME",
      { fill: YELLOW, textColor: "#14161A", fontSize: "18px" },
      () => this.startRun()
    );

    this.button(
      600 - 250,
      492,
      240,
      66,
      "BACK",
      { fill: WELL, textColor: "#FFFFFF", fontSize: "14px" },
      () => this.goBack()
    );

    this.add
      .text(600, 556, "ENTER TO PLAY  ·  ESC TO GO BACK", {
        fontFamily: PIXEL_FONT,
        fontSize: "10px",
        color: "rgba(255,255,255,0.4)",
      })
      .setOrigin(0.5);
  }

  setUpKeys() {
    this.input.keyboard.on("keydown-ENTER", () => this.startRun());
    this.input.keyboard.on("keydown-SPACE", () => this.startRun());
    this.input.keyboard.on("keydown-ESC", () => this.goBack());
    this.input.keyboard.on("keydown-LEFT", () =>
      this.stepCommitment(-COMMITMENT_STEP)
    );
    this.input.keyboard.on("keydown-RIGHT", () =>
      this.stepCommitment(COMMITMENT_STEP)
    );
  }

  // --- money ---------------------------------------------------------------

  /**
   * What is actually available to commit.
   *
   * Practice has no bridge at all, and that is not an error - it is the taster,
   * and it plays without buying anything. Otherwise the pool between runs is
   * empty by design (§4 of the transit plan sweeps it home at the end of
   * every run), so the number this screen reads and clamps against is the
   * wallet's own balance, not the pool's.
   */
  readWalletBalance() {
    const held = window.rocketCandleGame?.walletUsdso;

    if (typeof held !== "number") {
      // Undefined, not zero - the wallet just has not been read yet, and
      // treating that as "you have nothing" would refuse a funded player for
      // as long as the read takes.
      this.walletBalance = null;
      this.refreshCommitment();
      return;
    }

    this.walletBalance = held;
    // Default to everything in there, which is what PLAY used to do without
    // asking. The difference is that it can now be turned down.
    this.commitment = held;
    this.refreshCommitment();
  }

  /** The smallest opening stake this market will actually accept. */
  minStake() {
    const min = window.rocketCandleGame?.marketMinimums?.[this.marketId];
    return min ? min.safeUsdso : FALLBACK_MIN_STAKE;
  }

  stepCommitment(delta) {
    if (this.walletBalance === null || this.buyingIn) return;

    const next = Math.round((this.commitment + delta) * 100) / 100;
    // Never more than is in the wallet. Below the market's minimum is allowed
    // to be shown - in red, with the figure - rather than silently clamped,
    // so the player can see what the market wants of them.
    this.commitment = Math.max(0, Math.min(this.walletBalance, next));
    this.refreshCommitment();
    this.publishPlan();
  }

  refreshCommitment() {
    if (this.practice()) {
      this.commitmentText.setText("PRACTICE");
      this.openingStakeText.setText("");
      this.walletNote.setText("no money at stake in the taster");
      return;
    }

    if (this.walletBalance === null) {
      this.commitmentText.setText("reading your wallet...");
      this.openingStakeText.setText("");
      this.walletNote.setText("");
      return;
    }

    const min = this.minStake();
    const enough = this.commitment >= min;

    this.commitmentText.setText(`${this.commitment.toFixed(2)} USDso`);
    this.commitmentText.setColor(enough ? "#F6F740" : "#E94F37");

    // Derived, never edited directly - the opening stake is what actually
    // buys the position; the reserve stays behind as headroom for `F`. A
    // commitment too small to hold back anything without breaking the
    // market's minimum gets a zero reserve - the whole commitment opens the
    // position, and there is no "rest" to promise. Saying "headroom for F"
    // regardless was a lie in that case: `F` would then have nothing to draw
    // from and fail on the first press.
    const { openingStake, reserve } = deriveOpeningStake(
      this.commitment,
      min,
      EXPOSURE_STEP
    );
    this.openingStake = openingStake;
    this.openingStakeText.setText(
      !enough
        ? ""
        : reserve > 0
          ? `opens at ${openingStake.toFixed(2)} USDso · ${reserve.toFixed(2)} held back as headroom for F`
          : `opens at ${openingStake.toFixed(2)} USDso · no headroom left for F`
    );

    // The market's own floor, stated rather than discovered when the exchange
    // refuses the order.
    this.walletNote.setText(
      this.walletBalance <= 0
        ? "your wallet is empty - fund it to play for real"
        : enough
          ? `of ${this.walletBalance.toFixed(2)} USDso in your wallet · min ${min.toFixed(2)}`
          : `this market needs at least ${min.toFixed(2)} USDso`
    );
    this.walletNote.setColor(
      enough ? "rgba(255,255,255,0.55)" : "rgba(233,79,55,0.85)"
    );
  }

  practice() {
    return Boolean(window.rocketCandleGame?.practiceMode);
  }

  // --- exits ---------------------------------------------------------------

  cycleExit(key, choices) {
    const index = choices.indexOf(this.exitPlan[key]);
    this.exitPlan[key] = choices[(index + 1) % choices.length];
    this.registry.set(key, this.exitPlan[key]);
    this.publishPlan();
  }

  publishPlan() {
    const { floorPct, targetPct } = this.exitPlan;

    this.floorValue.setText(floorPct ? `-${floorPct}%` : "never");
    this.targetValue.setText(targetPct ? `+${targetPct}%` : "never");

    if (typeof window !== "undefined" && window.rocketCandleGame) {
      window.rocketCandleGame.exitPlan = { floorPct, targetPct };
      window.dispatchEvent(new CustomEvent("rc-hud"));
    }
  }

  // --- going ---------------------------------------------------------------

  goBack() {
    /*
     * Refused while money is moving.
     *
     * Leaving this screen did not cancel the purchase - the buy carried on and,
     * on success, started the game regardless, dropping the player into a live
     * funded position for a screen they had deliberately left. Refusing is the
     * honest answer: the deposit is already signed and there is nothing to
     * cancel, so say so and let it finish. It takes one transaction.
     */
    if (this.buyingIn) {
      this.say("your money is already moving - one moment", "#F6F740");
      return;
    }

    this.sound.stopAll();
    this.scene.start("MenuScene");
  }

  /**
   * Buy in with the chosen stake, then start the run.
   *
   * The only place a position is opened. Practice skips it entirely, which is
   * the whole point of the taster.
   */
  async startRun() {
    if (this.buyingIn) return;

    if (this.practice()) {
      this.sound.stopAll();
      this.scene.start("GameScene");
      return;
    }

    const trading = window.rocketCandleGame?.trading;
    if (!trading) {
      this.say("set trading up on the right to play for real", "#F6F740");
      return;
    }

    if (trading.isOpen()) {
      this.sound.stopAll();
      this.scene.start("GameScene");
      return;
    }

    if (trading.canBuyIn === false) {
      this.say(
        "no wallet is available to fund this run - reconnect and try again",
        "#E94F37"
      );
      return;
    }

    if (this.walletBalance === null) {
      this.say("still reading your wallet - one moment", "#3F88C5");
      return;
    }

    const min = this.minStake();
    if (this.commitment < min) {
      this.say(
        `${this.market?.symbol ?? "this market"} needs at least ` +
          `${min.toFixed(2)} USDso - your wallet holds ${this.walletBalance.toFixed(2)}`,
        "#E94F37"
      );
      return;
    }

    this.buyingIn = true;
    this.playButton.text.setText("BUYING IN...");
    this.say(
      `committing ${this.commitment.toFixed(2)} USDso to ${this.market?.symbol}`,
      "#3F88C5"
    );

    try {
      const opened = await trading.open(this.commitment, this.openingStake);
      if (!opened) {
        this.say("the exchange refused the order", "#E94F37");
        return;
      }

      this.sound.stopAll();
      this.scene.start("GameScene");
    } catch (e) {
      // `BuyInError.message` already carries the right words for both
      // outcomes - once `fundsAtExchange` the wording says the money is safe
      // at the exchange and coming back, otherwise it says nothing left the
      // wallet - so this shows the message as given rather than re-wording
      // it and risking the two getting swapped.
      this.say(e?.message ?? "could not buy in: no reason given", "#E94F37");

      /*
       * Re-read the wallet before the player can commit again.
       *
       * When the deposit landed and only the buy failed, the money has already
       * left the wallet - but this screen was still showing the figures from
       * before it went, so a second attempt could sign a second, genuine
       * deposit against money that was no longer there. The default commitment
       * spends the whole balance, which is the only reason this was not hit
       * every time.
       */
      /*
       * Treated as unknown, not merely re-read: the number this screen holds
       * was taken before the deposit and the page may not have republished yet.
       * `startRun` refuses while it is null, which is exactly the pause needed
       * for a fresh figure to arrive.
       */
      this.walletBalance = null;
      this.refreshCommitment();
    } finally {
      this.buyingIn = false;
      if (this.scene.isActive("RunSetupScene")) {
        this.playButton.text.setText("PLAY GAME");
      }
    }
  }

  say(message, colour) {
    this.statusText.setText(message);
    this.statusText.setColor(colour);
  }

  // --- furniture -----------------------------------------------------------

  /** A well with the hard offset shadow every surface in this design has. */
  panel(x, y, w, h) {
    this.add.rectangle(x + SHADOW_OFFSET, y + SHADOW_OFFSET, w, h, INK);
    this.add.rectangle(x, y, w, h, WELL).setStrokeStyle(3, INK);
  }

  /** A small square control that changes a number. */
  nudge(x, y, glyph, onClick) {
    const size = 44;
    this.add.rectangle(x + 4, y + 4, size, size, INK);
    const bg = this.add
      .rectangle(x, y, size, size, WELL)
      .setStrokeStyle(3, INK)
      .setInteractive({ useHandCursor: true });

    this.add
      .text(x, y, glyph, {
        fontFamily: PIXEL_FONT,
        fontSize: "16px",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    bg.on("pointerdown", onClick);
    bg.on("pointerover", () => bg.setFillStyle(BLUE));
    bg.on("pointerout", () => bg.setFillStyle(WELL));
  }

  /**
   * One exit: a faint label and the value it changes.
   *
   * The value carries the colour, because the value is the thing being chosen.
   */
  exitControl(x, y, label, colour, onClick) {
    this.add
      .text(x, y - 14, label, {
        fontFamily: PIXEL_FONT,
        fontSize: "9px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    const value = this.add
      .text(x, y + 12, "", {
        fontFamily: MONO_FONT,
        fontSize: "20px",
        color: Phaser.Display.Color.IntegerToColor(colour).rgba,
      })
      .setOrigin(0.5);

    // The whole area is the target: a 20px number is a small thing to ask
    // anyone to hit.
    this.add
      .rectangle(x, y, 280, 60, INK, 0)
      .setInteractive({ useHandCursor: true })
      .on("pointerdown", onClick);

    return value;
  }

  /** The menu's button, repeated here rather than shared across scenes. */
  button(x, y, width, height, label, colors, onClick) {
    const container = this.add.container(x, y);

    const shadow = this.add.rectangle(
      SHADOW_OFFSET,
      SHADOW_OFFSET,
      width,
      height,
      INK
    );
    const bg = this.add
      .rectangle(0, 0, width, height, colors.fill)
      .setStrokeStyle(4, INK);
    const text = this.add
      .text(0, 0, label, {
        fontFamily: PIXEL_FONT,
        fontSize: colors.fontSize || "12px",
        color: colors.textColor || "#FFFFFF",
        align: "center",
      })
      .setOrigin(0.5);

    container.add([shadow, bg, text]);
    container.setInteractive(
      new Phaser.Geom.Rectangle(-width / 2, -height / 2, width, height),
      Phaser.Geom.Rectangle.Contains
    );

    const rest = () => {
      bg.setPosition(0, 0);
      text.setPosition(0, 0);
    };

    container.on("pointerover", () => bg.setAlpha(0.92));
    container.on("pointerout", () => {
      bg.setAlpha(1);
      rest();
    });
    container.on("pointerdown", () => {
      bg.setPosition(SHADOW_OFFSET, SHADOW_OFFSET);
      text.setPosition(SHADOW_OFFSET, SHADOW_OFFSET);
    });
    container.on("pointerup", () => {
      rest();
      onClick();
    });

    return { container, text };
  }
}
