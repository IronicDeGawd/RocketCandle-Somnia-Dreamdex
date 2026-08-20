import {
  DEFAULT_MARKET_ID,
  GAME_MARKETS,
} from "@/data/DreamdexMarketFeed.js";

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

/** Below this a buy is not worth making, and the exchange may refuse it. */
const MIN_STAKE = 0.5;

/** What the stake steps by when the player nudges it. */
const STAKE_STEP = 0.5;

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
     * Null until the chain answers. Not zero: treating an unread balance as
     * empty would refuse a funded player for as long as the read took.
     */
    this.vault = null;
    this.stake = null;

    this.exitPlan = {
      floorPct: this.registry.get("floorPct") ?? FLOOR_CHOICES[1],
      targetPct: this.registry.get("targetPct") ?? TARGET_CHOICES[2],
    };

    this.buildHeader();
    this.buildStakeRow();
    this.buildExitRow();
    this.buildActions();
    this.setUpKeys();

    this.readVault();
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

  /** A framed row: the stake, with nudges either side of it. */
  buildStakeRow() {
    const y = 216;
    this.panel(600, y, 660, 96);

    this.add
      .text(600, y - 32, "YOUR STAKE", {
        fontFamily: PIXEL_FONT,
        fontSize: "9px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    this.stakeText = this.add
      .text(600, y + 2, "reading the vault...", {
        fontFamily: MONO_FONT,
        fontSize: "24px",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    this.nudge(600 - 250, y, "-", () => this.stepStake(-STAKE_STEP));
    this.nudge(600 + 250, y, "+", () => this.stepStake(STAKE_STEP));

    this.vaultNote = this.add
      .text(600, y + 34, "", {
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
    this.input.keyboard.on("keydown-LEFT", () => this.stepStake(-STAKE_STEP));
    this.input.keyboard.on("keydown-RIGHT", () => this.stepStake(STAKE_STEP));
  }

  // --- money ---------------------------------------------------------------

  /**
   * What is actually available to stake.
   *
   * Practice has no bridge at all, and that is not an error - it is the taster,
   * and it plays without buying anything.
   */
  async readVault() {
    const trading = window.rocketCandleGame?.trading;

    if (!trading) {
      this.vault = 0;
      this.stake = 0;
      this.refreshStake();
      return;
    }

    try {
      const held = await trading.vaultUsdso();
      this.vault = held ?? 0;
      // Default to everything in there, which is what PLAY used to do without
      // asking. The difference is that it can now be turned down.
      this.stake = this.vault;
    } catch {
      this.vault = 0;
      this.stake = 0;
    }

    this.refreshStake();
  }

  stepStake(delta) {
    if (this.vault === null || this.buyingIn) return;

    const next = Math.round((this.stake + delta) * 100) / 100;
    // Never more than is there, and never below what the exchange will take.
    this.stake = Math.max(0, Math.min(this.vault, next));
    this.refreshStake();
    this.publishPlan();
  }

  refreshStake() {
    if (this.practice()) {
      this.stakeText.setText("PRACTICE");
      this.vaultNote.setText("no money at stake in the taster");
      return;
    }

    if (this.vault === null) {
      this.stakeText.setText("reading the vault...");
      return;
    }

    this.stakeText.setText(`${this.stake.toFixed(2)} USDso`);
    this.stakeText.setColor(this.stake >= MIN_STAKE ? "#F6F740" : "#E94F37");

    this.vaultNote.setText(
      this.vault > 0
        ? `of ${this.vault.toFixed(2)} USDso in your vault`
        : "your vault is empty - add some from the panel on the right"
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

    if (this.vault === null) {
      this.say("still reading your vault - one moment", "#3F88C5");
      return;
    }

    if (this.stake < MIN_STAKE) {
      this.say(
        `stake at least ${MIN_STAKE} USDso - your vault holds ${this.vault.toFixed(2)}`,
        "#E94F37"
      );
      return;
    }

    this.buyingIn = true;
    this.playButton.text.setText("BUYING IN...");
    this.say(`buying ${this.stake.toFixed(2)} USDso of ${this.market?.symbol}`, "#3F88C5");

    try {
      const opened = await trading.open(this.stake);
      if (!opened) {
        this.say("the exchange refused the order", "#E94F37");
        return;
      }

      this.sound.stopAll();
      this.scene.start("GameScene");
    } catch (e) {
      this.say(`could not buy in: ${e?.message ?? "no reason given"}`, "#E94F37");
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
