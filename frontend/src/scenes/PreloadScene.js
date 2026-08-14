import { AssetGenerator } from "@/utils/AssetGenerator.js";
import { MarketDataProvider } from "@/data/MarketDataProvider.js";
import { DEFAULT_MARKET_ID } from "@/data/DreamdexMarketFeed.js";
import { DesignTextures } from "@/utils/DesignTextures.js";

// Redesign palette - flat, no gradients, no blur. See context/redesign board,
// section "scenes" (LOADING / MENU / END OF RUN).
const INK = 0x14161a;
const WELL = 0x1b1e23;
const RED = 0xe94f37;
const BLUE = 0x3f88c5;
const WHITE = 0xffffff;

const PIXEL_FONT = '"Press Start 2P", monospace';
const PROSE_FONT = '"Instrument Sans", sans-serif';

/**
 * PreloadScene - Handles loading of all game assets
 * Generates placeholder sprites and prepares the game for the main scene
 */
export class PreloadScene extends Phaser.Scene {
  constructor() {
    super({ key: "PreloadScene" });
  }

  preload() {
    // Set theme background
    this.cameras.main.setBackgroundColor("#2A2D34");

    // Make sure the faces are ready before anything is drawn.
    //
    // The page already declares them, so there is nothing to fetch from a
    // third party here - this only waits for what the document is loading
    // anyway. It matters because canvas text is painted once at its measured
    // size: a label drawn before its face arrives is drawn in a fallback and
    // stays that way, where HTML would simply reflow when the font landed.
    if (typeof document !== "undefined" && document.fonts) {
      document.fonts.load('16px "Press Start 2P"').catch(() => {});
      document.fonts.load('16px "Geist Mono"').catch(() => {});
    }

    // Decorative ink-bordered blips instead of a star field - flat dots,
    // no glow, no drift, matching the frame's fixed, non-reflowing layout.
    this.createBlips();

    // Title, drawn with a hard offset shadow instead of a soft glow.
    this.createHardShadowText(600, 190, "ROCKET\nCANDLE", {
      fontFamily: PIXEL_FONT,
      fontSize: "40px",
      color: "#F6F740",
      align: "center",
      lineSpacing: 10,
    });

    // Blinking status label - a stepped on/off blink, not a fade.
    const readingLabel = this.add
      .text(600, 270, "READING THE MARKET", {
        fontFamily: PIXEL_FONT,
        fontSize: "13px",
        color: "#3F88C5",
      })
      .setOrigin(0.5);

    this.time.addEvent({
      delay: 500,
      loop: true,
      callback: () => readingLabel.setVisible(!readingLabel.visible),
    });

    // Progress bar frame: ink border, well background, no radius.
    const barX = 600 - 170;
    const barY = 310;
    const barWidth = 340;
    const barHeight = 26;
    const border = 4;

    this.add
      .rectangle(600, barY + barHeight / 2, barWidth, barHeight, WELL)
      .setStrokeStyle(border, INK);

    // Progress bar fill
    const progressBar = this.add.graphics();

    // Loading percentage text
    const percentText = this.add
      .text(600, barY + barHeight + 26, "0%", {
        fontFamily: PIXEL_FONT,
        fontSize: "14px",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    // Loading tips - prose face, not the pixel face
    const tips = [
      "Use angle and power sliders to aim your rockets.",
      "Each level has only 3 attempts - make them count.",
      "Destroy all enemies to complete each level.",
      "Watch the trajectory preview to plan your shots.",
      "Green candlesticks mean a bull market, red means a bear market.",
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    this.add
      .text(600, barY + barHeight + 70, `TIP: ${randomTip}`, {
        fontFamily: PROSE_FONT,
        fontSize: "17px",
        color: "rgba(255,255,255,0.65)",
        wordWrap: { width: 620 },
        align: "center",
      })
      .setOrigin(0.5);

    // Update loading bar with the fill only - no glow, hard edges.
    this.load.on("progress", (value) => {
      progressBar.clear();
      progressBar.fillStyle(RED);
      progressBar.fillRect(
        barX + border,
        barY + border,
        (barWidth - border * 2) * value,
        barHeight - border * 2
      );

      percentText.setText(`${Math.round(value * 100)}%`);
    });

    // Bottom candlestick-strip footer - a flat blue bar with ink notches,
    // the canvas equivalent of the design's dashed strip.
    this.createFooterStrip();

    // Load background image
    this.load.image("game-background", "assets/background.png");

    // Load actual game assets (50px each)
    this.load.image("rocket", "assets/rocket.png");
    this.load.image("launcher", "assets/launcher.png");
    this.load.image("ground-block", "assets/blocks/bnrowncandle.png");
    this.load.image("green-candle", "assets/blocks/greencandle.png");
    this.load.image("red-candle", "assets/blocks/redcandle.png");

    // Load destructible block sprites (50px each)
    this.load.image("dest-block", "assets/blocks/dest.png");
    this.load.image("dest2-block", "assets/blocks/dest2.png");

    // Load enemy sprite variants
    this.load.image("enemy-var1", "assets/enemies/var1.png");
    this.load.image("enemy-var2", "assets/enemies/var2.png");
    this.load.image("enemy-var3", "assets/enemies/var3.png");
    this.load.image("enemy-var4", "assets/enemies/var4.png");

    // Load sound effects
    this.load.audio("menu-sound", "game-menu.wav");
    this.load.audio("enemy-destroy", "enemy-destroy.mp3");
    this.load.audio("level-complete", "game-level.mp3");
    this.load.audio("game-over", "game-over.mp3");

    // Generate only fallback assets that we still need (blocks, particles, etc.)
    AssetGenerator.generateAssets(this);

  }

  /**
   * Draw text with a hard, un-blurred offset shadow instead of a stroke
   * glow - the canvas equivalent of the design's `text-shadow:6px 6px 0`.
   */
  createHardShadowText(x, y, text, style) {
    this.add
      .text(x + 4, y + 4, text, { ...style, color: "#14161A" })
      .setOrigin(0.5);
    return this.add.text(x, y, text, style).setOrigin(0.5);
  }

  /**
   * A handful of flat, static ink-and-white blips standing in for the old
   * twinkling star field. Fixed positions, no animation, so the loading
   * frame never reflows or redraws while it holds.
   */
  createBlips() {
    const positions = [
      { x: 120, y: 90, a: 0.6 },
      { x: 1060, y: 110, a: 0.5 },
      { x: 200, y: 480, a: 0.35 },
      { x: 980, y: 460, a: 0.45 },
      { x: 600, y: 60, a: 0.3 },
    ];

    positions.forEach(({ x, y, a }) => {
      this.add.rectangle(x, y, 6, 6, WHITE, a);
    });
  }

  /**
   * Flat footer strip with a repeating ink notch pattern, matching the
   * dashed bottom edge on the loading screen mock.
   */
  createFooterStrip() {
    const height = 14;
    const notch = 14;
    const strip = this.add.graphics();
    strip.fillStyle(BLUE, 1);
    strip.fillRect(0, 600 - height, 1200, height);
    strip.fillStyle(INK, 1);
    for (let x = 0; x < 1200; x += notch) {
      strip.fillRect(x, 600 - height, notch / 2, height);
    }
  }

  /**
   * Pull the run's terrain from the exchange while the loading screen is up.
   *
   * This is deliberately fire-and-continue: the menu appears on schedule
   * whether or not the market answered. If it did not, the run falls back to
   * generated terrain and says so, rather than making the player wait on a
   * network that may never reply.
   */
  loadMarketRun() {
    const marketId = this.registry.get("selectedMarketId") || DEFAULT_MARKET_ID;

    // The menu can appear before this resolves, so the pending state is shared
    // rather than kept here - otherwise the menu reports the exchange as
    // unreachable while the request is still in flight.
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

  create() {
    // Repaint the loaded art in the design language. Deliberately here rather
    // than in preload: the images are only in the cache once loading finishes,
    // and anything painted earlier would be overwritten by the loader.
    DesignTextures.paintAll(this);

    this.loadMarketRun();

    // Wait a moment to show the loading screen, then transition with fade
    this.time.delayedCall(1500, () => {
      // Fade out current scene
      this.cameras.main.fadeOut(800, 42, 45, 52); // Fade to menu background color (#2A2D34)

      // Start menu scene after fade
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("MenuScene");
      });
    });
  }
}
