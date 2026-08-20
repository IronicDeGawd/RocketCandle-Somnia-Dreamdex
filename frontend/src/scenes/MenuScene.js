import {
  DEFAULT_MARKET_ID,
  GAME_MARKETS,
} from "@/data/DreamdexMarketFeed.js";
import { MarketDataProvider } from "@/data/MarketDataProvider.js";

// Redesign palette - flat, no gradients, no blur. See context/redesign board,
// section "scenes" (LOADING / MENU / END OF RUN).
const INK = 0x14161a;
const WELL = 0x1b1e23;
const RED = 0xe94f37;
const YELLOW = 0xf6f740;

const PIXEL_FONT = '"Press Start 2P", monospace';
const MONO_FONT = '"Geist Mono", monospace';

const SHADOW_OFFSET = 5;

/**
 * MenuScene - Main menu with play button and last game score
 * Handles score persistence via localStorage
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
  }

  create() {
    // Vertical positions below are spread across the full 600px frame rather
    // than crowded into the top two thirds, which left a third of the screen
    // empty under the instructions.
    // Set background
    this.cameras.main.setBackgroundColor("#2A2D34");

    // Initialize sounds
    this.sounds = {
      menu: this.oneSound("menu-sound", { volume: 0.3, loop: true }),
    };


    // Start background music for menu (delay to ensure no overlap)
    this.time.delayedCall(100, () => {
      if (this.sounds.menu && !this.sounds.menu.isPlaying) {
        this.sounds.menu.play();
      }
    });

    // Create title
    this.createHardShadowText(600, 52, "ROCKET CANDLE", {
      fontFamily: PIXEL_FONT,
      fontSize: "38px",
      color: "#F6F740",
    });

    // Display player stats from blockchain
    this.displayPlayerStats();

    // Let the player choose which market they play
    this.createMarketPicker();
    this.setUpMenuKeys();
    this.watchForBuyIn();

    // Create play button
    this.playButton = this.createPixelButton(
      600,
      462,
      400,
      72,
      "NEXT",
      { fill: YELLOW, textColor: "#14161A", fontSize: "22px" },
      () => this.startGame()
    );

    // The picker is built before this button exists, so the refresh it fires
    // lands on nothing - without this the button keeps the literal it was
    // created with, and practice was offered a NEXT it does not have.
    this.refreshPlayButton();

    // Create instructions
    this.add
      .text(600, 528, "AIM WITH SLIDERS · LAUNCH TO FIRE", {
        fontFamily: PIXEL_FONT,
        fontSize: "12px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 554, "LIMITED ATTEMPTS PER LEVEL", {
        fontFamily: PIXEL_FONT,
        fontSize: "12px",
        color: "#E94F37",
      })
      .setOrigin(0.5);
  }

  /**
   * Draw text with a hard, un-blurred offset shadow instead of a stroke
   * glow - the canvas equivalent of the design's `text-shadow:4px 4px 0`.
   */
  /**
   * Let the keyboard start a run.
   *
   * Every other part of this game is played on the keyboard, but the menu
   * could only be got past with a pointer - so a keyboard-only player could
   * reach the game and never enter it. Enter or space starts; left and right
   * move between markets.
   */
  /**
   * Watch for the position opening, so the play button unlocks by itself.
   *
   * The buy happens in the page, outside this scene entirely. Without this the
   * player would buy in and still be looking at a button that says BUY IN TO
   * PLAY until they clicked something.
   */
  watchForBuyIn() {
    if (typeof window === "undefined") return;

    this.publishSelectedMarket();

    const onChange = () => this.refreshPlayButton();
    window.addEventListener("rc-hud", onChange);

    this.events.once("shutdown", () =>
      window.removeEventListener("rc-hud", onChange)
    );
    this.events.once("destroy", () =>
      window.removeEventListener("rc-hud", onChange)
    );
  }

  setUpMenuKeys() {
    this.input.keyboard.on("keydown-ENTER", () => this.startGame());
    this.input.keyboard.on("keydown-SPACE", () => this.startGame());

    const step = (delta) => {
      const ids = GAME_MARKETS.map((m) => m.id);
      const current = ids.indexOf(this.selectedMarketId);
      const next = (current + delta + ids.length) % ids.length;
      this.selectMarket(ids[next]);
    };
    this.input.keyboard.on("keydown-LEFT", () => step(-1));
    this.input.keyboard.on("keydown-RIGHT", () => step(1));
  }

  /**
   * One sound per key, however many times this scene is entered. Phaser keeps
   * every sound ever added on the game-wide manager, so re-entering a scene
   * without removing the previous instance layers another copy of the loop.
   */
  oneSound(key, config) {
    this.sound.removeByKey(key);
    return this.sound.add(key, config);
  }

  createHardShadowText(x, y, text, style) {
    this.add
      .text(x + 4, y + 4, text, { ...style, color: "#14161A" })
      .setOrigin(0.5);
    return this.add.text(x, y, text, style).setOrigin(0.5);
  }


  /**
   * A pixel-face button that follows the surface rule: 4px ink border, no
   * corner radius, hard offset shadow with no blur. Pressing moves the face
   * onto its own shadow so the depression is visible and cheap to draw.
   */
  createPixelButton(x, y, width, height, label, colors, onClick) {
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

    const hitArea = new Phaser.Geom.Rectangle(
      -width / 2,
      -height / 2,
      width,
      height
    );
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    const rest = () => {
      bg.setPosition(0, 0);
      text.setPosition(0, 0);
    };
    const press = () => {
      bg.setPosition(SHADOW_OFFSET, SHADOW_OFFSET);
      text.setPosition(SHADOW_OFFSET, SHADOW_OFFSET);
    };

    container.on("pointerover", () => bg.setAlpha(0.92));
    container.on("pointerout", () => {
      bg.setAlpha(1);
      rest();
    });
    container.on("pointerdown", press);
    container.on("pointerup", () => {
      rest();
      if (onClick) onClick();
    });

    return { container, bg, text };
  }

  /**
   * Build the row of markets a player can pick between.
   *
   * Choosing a market is the difficulty choice: a stablecoin barely moves and
   * makes flat, gentle ground, while bitcoin throws up cliffs. Nothing here
   * invents a difficulty setting - the market supplies it.
   */
  createMarketPicker() {
    this.add
      .text(600, 128, "CHOOSE YOUR MARKET", {
        fontFamily: PIXEL_FONT,
        fontSize: "15px",
        color: "#3F88C5",
      })
      .setOrigin(0.5);

    // The four chips wrap into a 2x2 grid rather than a single row fixed at
    // 220px spacing, so they always stay inside the 1200px stage.
    const chipWidth = 520;
    const chipHeight = 74;
    const gapX = 40;
    const gapY = 20;
    const columns = 2;
    const gridWidth = columns * chipWidth + (columns - 1) * gapX;
    const startX = 600 - gridWidth / 2 + chipWidth / 2;
    const rowY = [194, 194 + chipHeight + gapY];

    this.marketChips = [];

    GAME_MARKETS.forEach((market, index) => {
      const col = index % columns;
      const row = Math.floor(index / columns);
      const x = startX + col * (chipWidth + gapX);
      const y = rowY[row];

      // Hard offset shadow behind every chip, per the surface rule.
      this.add.rectangle(
        x + SHADOW_OFFSET,
        y + SHADOW_OFFSET,
        chipWidth,
        chipHeight,
        INK
      );

      const chip = this.add
        .rectangle(x, y, chipWidth, chipHeight, WELL)
        .setStrokeStyle(3, INK)
        .setInteractive({ useHandCursor: true })
        .on("pointerdown", () => this.selectMarket(market.id));

      const label = this.add
        .text(x, y - 16, market.label, {
          fontFamily: PIXEL_FONT,
          fontSize: "17px",
          color: "#FFFFFF",
        })
        .setOrigin(0.5);

      const blurb = this.add
        .text(x, y + 18, market.blurb, {
          fontFamily: MONO_FONT,
          fontSize: "13px",
          color: "rgba(255,255,255,0.55)",
          wordWrap: { width: chipWidth - 30 },
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      this.marketChips.push({ market, chip, label, blurb, x, y });
    });

    // The provenance line - one of the most important facts in the product,
    // so it gets its own bordered panel and the mono face, in blue.
    // Clear of the second chip row, which ends at y=280. At 300 the panel
    // started at 273 and sat on top of the Ether and Bitcoin chips.
    const panelY = 382;
    const panelHeight = 48;

    this.add.rectangle(
      600 + SHADOW_OFFSET,
      panelY + SHADOW_OFFSET,
      gridWidth,
      panelHeight,
      INK
    );
    this.add
      .rectangle(600, panelY, gridWidth, panelHeight, WELL)
      .setStrokeStyle(3, INK);

    this.marketStatusText = this.add
      .text(600, panelY, "", {
        fontFamily: MONO_FONT,
        fontSize: "16px",
        color: "#3F88C5",
        wordWrap: { width: gridWidth - 40 },
        align: "center",
      })
      .setOrigin(0.5);

    this.selectedMarketId =
      this.registry.get("selectedMarketId") || DEFAULT_MARKET_ID;

    // The preload fetch may still be running when this menu appears, so adopt
    // its pending state rather than assuming the exchange never answered.
    this.marketLoading = Boolean(this.registry.get("marketRunLoading"));

    const onRegistryChange = (parent, key) => {
      if (key !== "marketRun" && key !== "marketRunLoading") return;
      if (key === "marketRunLoading") {
        this.marketLoading = Boolean(this.registry.get("marketRunLoading"));
      }
      this.reportMarketStatus();
      this.refreshPlayButton();
    };

    this.registry.events.on("changedata", onRegistryChange);
    this.events.once("shutdown", () => {
      this.registry.events.off("changedata", onRegistryChange);
    });

    this.paintMarketChips();
    this.reportMarketStatus();
  }

  /**
   * Redraw the chips so the chosen one is obvious.
   */
  paintMarketChips() {
    this.marketChips.forEach(({ market, chip, blurb }) => {
      const chosen = market.id === this.selectedMarketId;
      chip.setFillStyle(chosen ? RED : WELL);
      chip.setStrokeStyle(chosen ? 4 : 3, INK);
      blurb.setColor(
        chosen ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.55)"
      );
    });
  }

  /**
   * Say where the current market's terrain comes from and whether it is live.
   *
   * A mirrored market is called out plainly. Passing a mainnet mirror off as
   * live trading on this network would be the one lie that discredits every
   * other claim the game makes.
   */
  reportMarketStatus() {
    if (!this.marketStatusText) return;

    // The temporary notices below this panel recolour the same line, so the
    // resting colour has to be restored here rather than assumed.
    this.marketStatusText.setColor("#3F88C5");

    if (this.marketLoading) {
      this.marketStatusText.setText("READING THE MARKET...");
      return;
    }

    const run = this.registry.get("marketRun");

    if (!run || !run.live) {
      this.marketStatusText.setText("SIMULATED MARKET - EXCHANGE UNREACHABLE");
      return;
    }

    const stages = run.levels.filter((level) => level.live).length;
    const origin = run.mirrored
      ? "mirrored from mainnet"
      : "live on this network";

    this.marketStatusText.setText(
      `${run.market.label} — ${stages} of ${run.levels.length} stages from real trading, ${origin}`
    );
  }

  /**
   * Switch markets and fetch that market's terrain.
   *
   * @param {string} marketId
   */
  selectMarket(marketId) {
    if (this.marketLoading || marketId === this.selectedMarketId) return;

    // Changing pairs while holding a position would leave the player owning
    // one token and shooting at another's price history - the exact thing the
    // whole design is built to avoid.
    if (this.hasOpenPosition()) {
      this.sayMarketLocked();
      return;
    }

    this.selectedMarketId = marketId;
    this.registry.set("selectedMarketId", marketId);
    this.publishSelectedMarket();
    this.paintMarketChips();
    // The exits step names the pair, so it has to follow the choice.

    this.registry.set("marketRunLoading", true);

    MarketDataProvider.generateLiveGameLevels(marketId)
      .then((run) => {
        this.registry.set("marketRun", MarketDataProvider.capForPractice(run));
      })
      .catch(() => {
        this.registry.set("marketRun", null);
      })
      .finally(() => {
        this.registry.set("marketRunLoading", false);
      });
  }

  /**
   * Tell the React side which pair the player chose.
   *
   * The picker lives in the canvas but the trading panel lives in the page,
   * and the panel has to buy the pair that is about to become the terrain.
   * Uses the same window handle and event the HUD bridge uses rather than
   * inventing a second channel.
   */
  publishSelectedMarket() {
    if (typeof window === "undefined" || !window.rocketCandleGame) return;

    const market = GAME_MARKETS.find((m) => m.id === this.selectedMarketId);
    if (!market) return;

    window.rocketCandleGame.selectedMarket = {
      id: market.id,
      symbol: market.symbol,
      label: market.label,
    };
    window.dispatchEvent(new CustomEvent("rc-hud"));
  }

  /** Is the player holding a position right now? Practice runs never are. */
  hasOpenPosition() {
    if (typeof window === "undefined") return false;
    const trading = window.rocketCandleGame?.trading;
    return Boolean(trading?.isOpen?.());
  }

  /** Say why the picker refused, without moving anything on screen. */
  sayMarketLocked() {
    if (!this.marketStatusText) return;
    this.marketStatusText.setText(
      "sell your position before switching markets"
    );
    this.marketStatusText.setColor("#E94F37");

    this.time.delayedCall(2600, () => this.reportMarketStatus());
  }

  /**
   * Keep the play button honest about whether a run is ready to start.
   */
  refreshPlayButton() {
    if (!this.playButton) return;

    /*
     * Practice has nothing to arrange, so it says what it does. Everywhere
     * else the next screen asks for the stake and the exits, and buying only
     * happens there.
     */
    const label = this.marketLoading
      ? "LOADING MARKET"
      : window.rocketCandleGame?.practiceMode
        ? "PLAY GAME"
        : "NEXT";

    this.playButton.text.setText(label);
  }

  /**
   * Start the game
   */
  /**
   * Hand off to the second screen.
   *
   * The menu is a picker again. Choosing a pair and deciding what to risk on
   * it are different decisions, and they were crammed together here - the
   * exits as two chips the same width as the market cards, so they read as a
   * fifth and sixth market, and the stake never asked about at all because
   * this silently staked the whole vault.
   */
  startGame() {
    // Moving on mid-fetch would carry the previous market's terrain forward,
    // which is worse than making the player wait a moment.
    if (this.marketLoading) return;

    this.sound.stopAll();

    if (window.rocketCandleGame?.practiceMode) {
      this.scene.start("GameScene");
      return;
    }

    this.scene.start("RunSetupScene");
  }

  /** Say something on the status line, then let it fall back. */
  saySomething(text, color = "#F6F740") {
    if (!this.marketStatusText) return;
    this.marketStatusText.setText(text);
    this.marketStatusText.setColor(color);
    this.time.delayedCall(3800, () => this.reportMarketStatus());
  }

  /**
   * What this player has done here before.
   *
   * This tested `window.web3Service` and `window.walletManager` - two globals
   * inherited from an earlier version of this game that nothing in this one
   * creates - so it told every player to connect a wallet, including the ones
   * who had. The figures now come from the contract read the page already
   * does, published onto the window because the canvas cannot see React state.
   */
  displayPlayerStats() {
    this.statsText = this.add
      .text(600, 98, "", {
        fontFamily: MONO_FONT,
        fontSize: "13px",
        color: "rgba(255,255,255,0.55)",
      })
      .setOrigin(0.5);

    this.refreshPlayerStats();

    // The contract read finishes after this scene is drawn, so the line has to
    // be able to change its mind.
    const onChange = () => this.refreshPlayerStats();
    window.addEventListener("rc-hud", onChange);
    this.events.once("shutdown", () =>
      window.removeEventListener("rc-hud", onChange)
    );
    this.events.once("destroy", () =>
      window.removeEventListener("rc-hud", onChange)
    );
  }

  refreshPlayerStats() {
    if (!this.statsText) return;

    const game = typeof window === "undefined" ? null : window.rocketCandleGame;

    if (!game?.isConnected) {
      this.statsText.setText("CONNECT WALLET TO SEE YOUR STATS");
      this.statsText.setColor("rgba(255,255,255,0.55)");
      return;
    }

    const stats = game.playerStats;

    // Connected, but the contract has not answered yet. Saying "no games" here
    // would be a guess dressed as a fact.
    if (!stats) {
      this.statsText.setText("READING YOUR STATS...");
      this.statsText.setColor("rgba(255,255,255,0.4)");
      return;
    }

    if (!stats.totalGames) {
      this.statsText.setText("PLAY YOUR FIRST GAME TO SEE STATS");
      this.statsText.setColor("rgba(255,255,255,0.55)");
      return;
    }

    this.statsText.setText(
      `BEST ${stats.bestScore} · GAMES ${stats.totalGames} · ` +
        `WICK ${stats.totalTokens.toFixed(0)}`
    );
    this.statsText.setColor("rgba(255,255,255,0.7)");
  }
}
