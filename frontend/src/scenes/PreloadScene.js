import { AssetGenerator } from "@/utils/AssetGenerator.js";
import { MarketDataProvider } from "@/data/MarketDataProvider.js";

/** Market a run uses when the player has not picked one yet. */
const DEFAULT_MARKET_ID = "somi";

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
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Load Pixelify Sans font
    this.load.script(
      "webfont",
      "https://ajax.googleapis.com/ajax/libs/webfont/1.6.26/webfont.js"
    );

    // Load the font when WebFont script is loaded
    this.load.on("filecomplete-script-webfont", () => {
      WebFont.load({
        google: {
          families: ["Pixelify Sans:400,500,600,700"],
        },
      });
    });

    // Create animated background stars
    this.createStarField();

    // Create main title with glow effect
    const title = this.add
      .text(600, 200, "🚀 ROCKET CANDLE", {
        fontSize: "64px", // Increased from 56px
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Pixelify Sans, Arial",
        stroke: "#87ceeb",
        strokeThickness: 2,
      })
      .setOrigin(0.5);

    // Add title glow animation
    this.tweens.add({
      targets: title,
      alpha: 0.7,
      duration: 1000,
      yoyo: true,
      repeat: -1,
      ease: "Power2",
    });

    // Create subtitle
    this.add
      .text(600, 260, "Loading Market Data...", {
        fontSize: "22px", // Increased from 20px
        fill: "#87ceeb",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    // Create progress bar container with themed styling
    const progressContainer = this.add.graphics();
    progressContainer.lineStyle(2, 0x87ceeb);
    progressContainer.strokeRoundedRect(450, 320, 300, 30, 15);
    progressContainer.fillStyle(0x2c3e50);
    progressContainer.fillRoundedRect(450, 320, 300, 30, 15);

    // Create progress bar fill
    const progressBar = this.add.graphics();

    // Create loading percentage text
    const percentText = this.add
      .text(600, 335, "0%", {
        fontSize: "18px", // Increased from 16px
        fill: "#ffffff",
        fontFamily: "Pixelify Sans, Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5);

    // Create loading tips
    const tips = [
      "💡 Use angle and power sliders to aim your rockets",
      "💡 Each level has only 3 attempts - make them count!",
      "💡 Destroy all enemies to complete each level",
      "💡 Watch the trajectory preview to plan your shots",
      "💡 Green candlesticks = Bull market, Red = Bear market",
    ];

    const randomTip = tips[Math.floor(Math.random() * tips.length)];
    const _tipText = this.add
      .text(600, 420, randomTip, {
        fontSize: "16px", // Increased from 14px
        fill: "#ffaa00",
        fontFamily: "Pixelify Sans, Arial",
        wordWrap: { width: 500 },
        align: "center",
      })
      .setOrigin(0.5);

    // Add floating rocket animation
    this.createFloatingRocket();

    // Update loading bar with smooth animation
    this.load.on("progress", (value) => {
      // Update progress bar
      progressBar.clear();
      progressBar.fillStyle(0x00ff00);
      progressBar.fillRoundedRect(452, 322, (300 - 4) * value, 26, 13);

      // Add progress bar glow
      if (value > 0) {
        progressBar.lineStyle(1, 0x00ff00, 0.5);
        progressBar.strokeRoundedRect(450, 320, 300 * value, 30, 15);
      }

      // Update percentage
      percentText.setText(`${Math.round(value * 100)}%`);
    });

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

    //console.log("📦 Assets preloaded successfully");
  }

  /**
   * Create animated star field background
   */
  createStarField() {
    // Create multiple layers of stars for depth effect
    for (let layer = 0; layer < 3; layer++) {
      const starCount = 20 - layer * 5; // Fewer stars in each layer
      const alpha = 0.8 - layer * 0.2; // Dimmer stars in background
      const _speed = (layer + 1) * 0.5; // Different speeds for parallax

      for (let i = 0; i < starCount; i++) {
        const star = this.add.circle(
          Math.random() * 1200,
          Math.random() * 600,
          Math.random() * 2 + 1,
          0xffffff,
          alpha
        );

        // Add twinkling animation
        this.tweens.add({
          targets: star,
          alpha: alpha * 0.3,
          duration: Math.random() * 2000 + 1000,
          yoyo: true,
          repeat: -1,
          ease: "Power2",
        });

        // Add slow drift animation
        this.tweens.add({
          targets: star,
          x: star.x + (Math.random() - 0.5) * 100,
          y: star.y + (Math.random() - 0.5) * 100,
          duration: Math.random() * 10000 + 5000,
          yoyo: true,
          repeat: -1,
          ease: "Sine.easeInOut",
        });
      }
    }

    //console.log("✨ Star field created");
  }

  /**
   * Create floating rocket animation
   */
  createFloatingRocket() {
    // Create rocket emoji as floating element
    const rocket = this.add
      .text(200, 400, "🚀", {
        fontSize: "32px",
      })
      .setOrigin(0.5);

    // Add floating animation
    this.tweens.add({
      targets: rocket,
      y: 380,
      duration: 2000,
      yoyo: true,
      repeat: -1,
      ease: "Sine.easeInOut",
    });

    // Add subtle rotation
    this.tweens.add({
      targets: rocket,
      rotation: 0.1,
      duration: 3000,
      yoyo: true,
      repeat: -1,
      ease: "Power1",
    });

    // Add trail effect
    const _trail = this.add.graphics();
    this.time.addEvent({
      delay: 100,
      callback: () => {
        // Add small trail dots behind rocket
        const dot = this.add.circle(
          rocket.x - 20,
          rocket.y + Math.random() * 10 - 5,
          2,
          0xffaa00,
          0.6
        );

        // Fade out trail dot
        this.tweens.add({
          targets: dot,
          alpha: 0,
          scale: 0,
          duration: 1000,
          ease: "Power2",
          onComplete: () => dot.destroy(),
        });
      },
      loop: true,
    });

    //console.log("🚀 Floating rocket animation created");
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

    MarketDataProvider.generateLiveGameLevels(marketId)
      .then((run) => {
        this.registry.set("marketRun", run);
      })
      .catch(() => {
        this.registry.set("marketRun", null);
      });
  }

  create() {
    this.loadMarketRun();

    // Create completion message
    const completeText = this.add
      .text(600, 480, "Ready to Launch! 🎯", {
        fontSize: "18px",
        fill: "#00ff00",
        fontFamily: "Pixelify Sans, Arial",
        fontStyle: "bold",
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // Fade in completion message
    this.tweens.add({
      targets: completeText,
      alpha: 1,
      duration: 500,
      ease: "Power2",
    });

    // Wait a moment to show the loading screen, then transition with fade
    this.time.delayedCall(1500, () => {
      // Fade out current scene
      this.cameras.main.fadeOut(800, 26, 26, 46); // Fade to menu background color

      // Start menu scene after fade
      this.cameras.main.once("camerafadeoutcomplete", () => {
        this.scene.start("MenuScene");
      });
    });

    //console.log("✅ Loading complete - transitioning to menu");
  }
}
