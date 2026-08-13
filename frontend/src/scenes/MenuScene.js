import { UIComponents } from "@/components/UIComponents.js";
import {
  DEFAULT_MARKET_ID,
  GAME_MARKETS,
} from "@/data/DreamdexMarketFeed.js";
import { MarketDataProvider } from "@/data/MarketDataProvider.js";

/**
 * MenuScene - Main menu with play button and last game score
 * Handles score persistence via localStorage
 */
export class MenuScene extends Phaser.Scene {
  constructor() {
    super({ key: "MenuScene" });
  }

  create() {
    // Set background
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Initialize sounds
    this.sounds = {
      menu: this.sound.add("menu-sound", { volume: 0.3, loop: true }),
    };

    // Create animated starry background
    this.createStarryBackground();
    
    // Start background music for menu (delay to ensure no overlap)
    this.time.delayedCall(100, () => {
      if (this.sounds.menu && !this.sounds.menu.isPlaying) {
        this.sounds.menu.play();
      }
    });

    // Create title
    this.add
      .text(600, 150, "🚀 ROCKET CANDLE", {
        fontSize: "72px",
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: "Orbitron, Arial",
        stroke: "#00d4ff",
        strokeThickness: 3,
      })
      .setOrigin(0.5);

    // Create subtitle
    this.add
      .text(600, 220, "Destroy enemies in candlestick markets!", {
        fontSize: "28px", // Increased from 24px
        fill: "#87ceeb",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    // Display player stats from blockchain
    this.displayPlayerStats();

    // Let the player choose which market they play
    this.createMarketPicker();

    // Create play button - simplified without wallet checks
    const playButton = UIComponents.createButton(
      this,
      600,
      450,
      "PLAY GAME",
      () => this.startGame(),
      {
        width: 250,
        height: 60,
        fontSize: "22px", // Increased from 20px
        fill: 0x00cc00, // Green for play
        hoverFill: 0x00aa00, // Darker green on hover
        textColor: "#ffffff", // White text for better contrast
        borderRadius: 30, // Rounded corners
        fontFamily: "Pixelify Sans, Inter, sans-serif", // Consistent font
      }
    );

    // Store reference for potential updates
    this.playButton = playButton;

    // Create instructions
    this.add
      .text(600, 510, "Use sliders to aim, LAUNCH to fire!", {
        fontSize: "20px", // Increased from 18px
        fill: "#aaaaaa",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 540, "Limited attempts per level - make them count!", {
        fontSize: "18px", // Increased from 16px
        fill: "#ff6666",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    //console.log("🎮 Main menu created");
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
      .text(600, 300, "CHOOSE YOUR MARKET", {
        fontSize: "18px",
        fill: "#87ceeb",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    this.marketChips = [];
    const spacing = 220;
    const startX = 600 - ((GAME_MARKETS.length - 1) * spacing) / 2;

    GAME_MARKETS.forEach((market, index) => {
      const x = startX + index * spacing;
      const chip = this.add
        .graphics()
        .setInteractive(
          new Phaser.Geom.Rectangle(x - 100, 330, 200, 56),
          Phaser.Geom.Rectangle.Contains
        )
        .on("pointerdown", () => this.selectMarket(market.id));

      const label = this.add
        .text(x, 344, market.label, {
          fontSize: "20px",
          fill: "#ffffff",
          fontFamily: "Pixelify Sans, Arial",
        })
        .setOrigin(0.5);

      const blurb = this.add
        .text(x, 368, market.blurb, {
          fontSize: "12px",
          fill: "#9aa4c4",
          fontFamily: "Pixelify Sans, Arial",
          wordWrap: { width: 190 },
          align: "center",
        })
        .setOrigin(0.5, 0.5);

      this.marketChips.push({ market, chip, label, blurb, x });
    });

    // One line telling the player what the chosen market is actually doing.
    this.marketStatusText = this.add
      .text(600, 410, "", {
        fontSize: "14px",
        fill: "#9aa4c4",
        fontFamily: "Pixelify Sans, Arial",
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
    this.marketChips.forEach(({ market, chip, x }) => {
      const chosen = market.id === this.selectedMarketId;
      chip.clear();
      chip.fillStyle(chosen ? 0x1f6feb : 0x24263a);
      chip.fillRoundedRect(x - 100, 330, 200, 56, 10);
      chip.lineStyle(2, chosen ? 0x58a6ff : 0x3a3d55);
      chip.strokeRoundedRect(x - 100, 330, 200, 56, 10);
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

    if (this.marketLoading) {
      this.marketStatusText.setText("Reading the market...");
      return;
    }

    const run = this.registry.get("marketRun");

    if (!run || !run.live) {
      this.marketStatusText.setText("Simulated market - exchange unreachable");
      return;
    }

    const stages = run.levels.filter((level) => level.live).length;
    const origin = run.mirrored
      ? "mirrored from mainnet"
      : "live on this network";

    this.marketStatusText.setText(
      `${run.market.label} - ${stages} of ${run.levels.length} stages from real trading, ${origin}`
    );
  }

  /**
   * Switch markets and fetch that market's terrain.
   *
   * @param {string} marketId
   */
  selectMarket(marketId) {
    if (this.marketLoading || marketId === this.selectedMarketId) return;

    this.selectedMarketId = marketId;
    this.registry.set("selectedMarketId", marketId);
    this.paintMarketChips();

    this.registry.set("marketRunLoading", true);

    MarketDataProvider.generateLiveGameLevels(marketId)
      .then((run) => {
        this.registry.set("marketRun", run);
      })
      .catch(() => {
        this.registry.set("marketRun", null);
      })
      .finally(() => {
        this.registry.set("marketRunLoading", false);
      });
  }

  /**
   * Keep the play button honest about whether a run is ready to start.
   */
  refreshPlayButton() {
    if (!this.playButton) return;
    this.playButton.text.setText(
      this.marketLoading ? "LOADING MARKET" : "PLAY GAME"
    );
  }

  /**
   * Start the game
   */
  startGame() {
    // Starting mid-fetch would drop the player onto the previous market's
    // terrain, which is worse than making them wait a moment.
    if (this.marketLoading) return;

    //console.log("🚀 Starting new game...");
    
    // Stop all sounds before transitioning
    this.sound.stopAll();
    
    this.scene.start("GameScene");
  }

  /**
   * Display player stats from blockchain asynchronously
   */
  async displayPlayerStats() {
    try {
      if (!window.web3Service || !window.walletManager?.isConnected) {
        this.add
          .text(600, 280, "🔗 Connect wallet to see your stats", {
            fontSize: "20px",
            fill: "#aaaaaa",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);
        return;
      }

      // Get player scores from blockchain
      const playerScores = await window.web3Service.getPlayerScores();

      if (
        playerScores &&
        playerScores.results &&
        playerScores.results.length > 0
      ) {
        const scores = playerScores.results.map((result) => result.score);
        const lastScore = scores[scores.length - 1]; // Most recent score
        const bestScore = Math.max(...scores);
        const totalGames = scores.length;

        // Display last game score
        this.add
          .text(600, 280, `Last Game Score: ${lastScore}`, {
            fontSize: "22px",
            fill: "#ffaa00",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);

        // Display best score
        this.add
          .text(600, 310, `Best Score: ${bestScore}`, {
            fontSize: "22px",
            fill: "#00ff00",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);

        // Display total games played
        this.add
          .text(600, 340, `Games Played: ${totalGames}`, {
            fontSize: "18px",
            fill: "#87ceeb",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);
      } else {
        this.add
          .text(600, 280, "🎮 Play your first game to see stats!", {
            fontSize: "20px",
            fill: "#aaaaaa",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);
      }
    } catch (error) {
      console.warn("Failed to load player stats from blockchain:", error);
      this.add
        .text(600, 280, "❌ Failed to load stats", {
          fontSize: "20px",
          fill: "#ff6666",
          fontFamily: "Pixelify Sans, Arial",
        })
        .setOrigin(0.5);
    }
  }

  /**
   * Create animated starry background
   */
  createStarryBackground() {
    // Create container for stars
    const starContainer = this.add.container(0, 0);
    starContainer.setAlpha(0.4); // Set overall opacity for the star container

    // Generate random stars
    for (let i = 0; i < 70; i++) {
      // Reduced number of stars
      const x = Math.random() * 1200;
      const y = Math.random() * 600;
      const size = Math.random() * 1.5 + 0.3; // Smaller stars
      const alpha = Math.random() * 0.6 + 0.1; // Less bright stars

      const star = this.add.circle(x, y, size, 0xffffff, alpha);
      starContainer.add(star);

      // Add twinkling animation
      this.tweens.add({
        targets: star,
        alpha: Math.random() * 0.3 + 0.1,
        duration: Math.random() * 2000 + 1000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Add some larger glowing stars
    for (let i = 0; i < 10; i++) {
      // Reduced number of glowing stars
      const x = Math.random() * 1200;
      const y = Math.random() * 600;
      const size = Math.random() * 2.5 + 1.5; // Slightly smaller glowing stars

      const glowStar = this.add.circle(x, y, size, 0x87ceeb, 0.4); // Dimmer glow
      starContainer.add(glowStar);

      // Add pulsing animation
      this.tweens.add({
        targets: glowStar,
        scaleX: 1.5,
        scaleY: 1.5,
        alpha: 0.3,
        duration: Math.random() * 3000 + 2000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }

    // Add floating elements
    this.createFloatingElements();

    //console.log("✨ Starry background created for menu");
  }

  /**
   * Create floating elements in the background
   */
  createFloatingElements() {
    // Create floating rocket emojis
    for (let i = 0; i < 3; i++) {
      const x = Math.random() * 1200;
      const y = Math.random() * 600;

      const rocket = this.add
        .text(x, y, "🚀", {
          fontSize: "20px",
          fill: "#ffffff",
          alpha: 0.2,
        })
        .setOrigin(0.5);

      // Add floating animation
      this.tweens.add({
        targets: rocket,
        y: y - 40,
        duration: Math.random() * 5000 + 4000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      // Add slow rotation
      this.tweens.add({
        targets: rocket,
        rotation: Math.PI * 2,
        duration: Math.random() * 8000 + 6000,
        repeat: -1,
        ease: "Linear",
      });
    }

    // Create floating candlestick emojis
    for (let i = 0; i < 4; i++) {
      const x = Math.random() * 1200;
      const y = Math.random() * 600;

      const candle = this.add
        .text(x, y, "🕯️", {
          fontSize: "18px",
          fill: "#ffaa00",
          alpha: 0.15,
        })
        .setOrigin(0.5);

      // Add gentle floating animation
      this.tweens.add({
        targets: candle,
        y: y - 30,
        x: x + Math.random() * 40 - 20,
        duration: Math.random() * 6000 + 5000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    }
  }
}
