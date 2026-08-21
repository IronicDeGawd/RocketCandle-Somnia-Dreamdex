// Redesign palette - flat, no gradients, no blur. See context/redesign board,
// section "scenes" (LOADING / MENU / END OF RUN).
const INK = 0x14161a;
const RED = 0xe94f37;
const YELLOW = 0xf6f740;
const SURFACE = 0x22252b;

const PIXEL_FONT = '"Press Start 2P", monospace';

const SHADOW_OFFSET = 5;

/**
 * EndGameScene - Game over screen with score and restart options
 * Handles score saving and game completion
 */
export class EndGameScene extends Phaser.Scene {
  constructor() {
    super({ key: "EndGameScene" });
  }

  init(data) {
    // Receive data from GameScene
    this.finalScore = data.score || 0;
    this.totalAttempts = data.totalAttempts || 0;
    this.levelsCompleted = data.levelsCompleted || 0;
    this.reason = data.reason || "completed"; // "completed" or "failed"
  }

  create() {
    // Set background
    this.cameras.main.setBackgroundColor("#2A2D34");

    // Initialize sounds
    this.sounds = {
      menu: this.oneSound("menu-sound", { volume: 0.3, loop: true }),
    };


    // Determine if this is a win or loss - drives the top notch strip color
    const isVictory = this.reason === "completed";
    this.createNotchStrip(isVictory ? YELLOW : RED);

    // Start background music for end game menu (delay to ensure no overlap)
    this.time.delayedCall(100, () => {
      if (this.sounds.menu && !this.sounds.menu.isPlaying) {
        this.sounds.menu.play();
      }
    });

    // Notify parent about game completion for blockchain submission
    this.notifyGameCompletion();

    const titleText = isVictory ? "VICTORY" : "GAME OVER";
    const titleColor = isVictory ? "#F6F740" : "#E94F37";

    // Create title
    this.createHardShadowText(600, 90, titleText, {
      fontFamily: PIXEL_FONT,
      fontSize: "36px",
      color: titleColor,
    });

    // Create stats column
    this.add
      .text(600, 165, `SCORE ${this.finalScore}`, {
        fontFamily: PIXEL_FONT,
        fontSize: "16px",
        color: "#FFFFFF",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 200, `LEVELS ${this.levelsCompleted} / 7`, {
        fontFamily: PIXEL_FONT,
        fontSize: "12px",
        color: "rgba(255,255,255,0.6)",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 228, `ATTEMPTS ${this.totalAttempts}`, {
        fontFamily: PIXEL_FONT,
        fontSize: "12px",
        color: "rgba(255,255,255,0.6)",
      })
      .setOrigin(0.5);

    // Show efficiency rating
    const efficiency = this.calculateEfficiency();
    this.add
      .text(600, 256, `EFFICIENCY: ${efficiency.toUpperCase()}`, {
        fontFamily: PIXEL_FONT,
        fontSize: "12px",
        color: "#3F88C5",
      })
      .setOrigin(0.5);

    // Show best score comparison (async)
    this.displayBestScoreComparison();

    // Create restart button - primary, yellow
    this.createPixelButton(
      480,
      440,
      210,
      66,
      "PLAY AGAIN",
      { fill: YELLOW, textColor: "#14161A", fontSize: "13px" },
      () => this.restartGame()
    );

    // Create menu button - secondary, surface
    this.createPixelButton(
      720,
      440,
      210,
      66,
      "MENU",
      { fill: SURFACE, textColor: "#FFFFFF", fontSize: "13px" },
      () => this.goToMenu()
    );

    // Add celebratory particles for victory
    if (isVictory) {
      this.createCelebrationEffect();
    }
  }

  /**
   * Draw text with a hard, un-blurred offset shadow instead of a stroke
   * glow - the canvas equivalent of the design's `text-shadow:5px 5px 0`.
   */
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
      .text(x + 5, y + 5, text, { ...style, color: "#14161A" })
      .setOrigin(0.5);
    return this.add.text(x, y, text, style).setOrigin(0.5);
  }


  /**
   * A flat top strip with a repeating ink notch pattern, matching the
   * dashed top edge on the end-of-run screen mock. Yellow on a win, red on
   * a loss, so the outcome reads before any text does.
   */
  createNotchStrip(color) {
    const height = 14;
    const notch = 14;
    const strip = this.add.graphics();
    strip.fillStyle(color, 1);
    strip.fillRect(0, 0, 1200, height);
    strip.fillStyle(INK, 1);
    for (let x = 0; x < 1200; x += notch) {
      strip.fillRect(x, 0, notch / 2, height);
    }
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
   * Calculate efficiency rating based on attempts and score
   * @returns {string} Efficiency rating
   */
  calculateEfficiency() {
    if (this.totalAttempts === 0) return "N/A";

    const scorePerAttempt = this.finalScore / this.totalAttempts;

    if (scorePerAttempt >= 50) return "Excellent";
    if (scorePerAttempt >= 30) return "Good";
    if (scorePerAttempt >= 20) return "Average";
    if (scorePerAttempt >= 10) return "Poor";
    return "Needs Improvement";
  }

  /**
   * Create celebration particle effect for victory
   */
  createCelebrationEffect() {
    // Create multiple particle emitters for celebration - palette colors
    // only, no rainbow, so this still reads as this game's language.
    const colors = [RED, YELLOW, 0x3f88c5, 0xffffff];

    for (let i = 0; i < 3; i++) {
      const x = 400 + i * 200;
      const particles = this.add.particles(x, 100, "rocket", {
        speed: { min: 100, max: 200 },
        scale: { start: 0.3, end: 0 },
        tint: colors,
        lifespan: 2000,
        frequency: 100,
        gravityY: 50,
      });

      // Stop particles after 3 seconds
      this.time.delayedCall(3000, () => {
        particles.destroy();
      });
    }
  }

  /**
   * Display best score comparison asynchronously
   */
  async displayBestScoreComparison() {
    try {
      const bestScore = this.bestScoreSoFar();

      if (this.finalScore >= bestScore && this.finalScore > 0) {
        const badgeWidth = 260;
        const badgeHeight = 40;
        this.add.rectangle(600, 298, badgeWidth, badgeHeight, RED).setStrokeStyle(3, INK);
        this.add
          .text(600, 298, "NEW BEST SCORE", {
            fontFamily: PIXEL_FONT,
            fontSize: "11px",
            color: "#FFFFFF",
          })
          .setOrigin(0.5);
      } else if (bestScore > 0) {
        this.add
          .text(600, 298, `BEST SCORE ${bestScore}`, {
            fontFamily: PIXEL_FONT,
            fontSize: "11px",
            color: "rgba(255,255,255,0.55)",
          })
          .setOrigin(0.5);
      }
    } catch (error) {
      console.warn("Failed to display best score comparison:", error);
    }
  }

  /*
   * The scene-side score submission that used to live here is gone.
   *
   * It was guarded on a `window.web3Service` that nothing in the app has ever
   * created, so it could not run - and it carried its own copy of the reward
   * formula, presenting a client-side guess as what the contract paid. Real
   * submission goes through React's completion callback, which reads the
   * minted amount off the receipt. Deleted rather than left dormant: the next
   * person to rewire that callback would have found a plausible-looking
   * alternative sitting here, armed.
   */

  /**
   * Close out the run's position, if it still has one.
   *
   * Ejecting mid-run already sold it, in which case there is nothing to do -
   * the bridge simply reports no position and this returns quietly.
   */
  async settlePosition() {
    const bridge =
      typeof window !== "undefined" ? window.rocketCandleGame?.trading : null;
    if (!bridge || !bridge.enabled) return;

    try {
      const result = await bridge.close();
      if (!result) return;

      const sign = result.pnl >= 0 ? "+" : "";

      /*
       * "USDso back" must not be said when it did not come back.
       *
       * Closing sells the position and then sweeps the pool home, and the
       * sweep can fail on its own - the sell still happened, so this used to
       * report the proceeds as returned while the money sat at the exchange
       * with nothing on this screen saying so. Every other place that closes a
       * position already carries this warning; this was the fifth, and the one
       * shown the instant a run ends.
       */
      const stillAtExchange = result.sweepError
        ? " Your money is still at the exchange and will be offered back."
        : "";

      this.showNotification(
        `💰 Position closed: ${result.proceeds.toFixed(4)} USDso back (${sign}${result.pnl.toFixed(4)})${stillAtExchange}`,
        result.sweepError || result.pnl < 0 ? "warning" : "success"
      );
    } catch {
      this.showNotification(
        "⚠️ Could not sell your position - it is still open on the exchange",
        "warning"
      );
    }
  }

  /**
   * Save score to blockchain with error handling and user feedback
   * @param {number} score - Score to save
   */
  notifyGameCompletion() {
    // Use the global callback provided by the parent component
    if (typeof window !== 'undefined' && window.rocketCandleGame) {
      const { onGameComplete, practiceMode } = window.rocketCandleGame;

      if (practiceMode) {
        this.showNotification(
          "🎯 Practice run - nothing recorded, no WICK earned",
          "info"
        );
        return;
      }

      // Sell the position back before anything else. Leaving a run holding a
      // position the player has stopped watching is the one outcome worth
      // avoiding at all costs.
      this.settlePosition();

      if (onGameComplete && typeof onGameComplete === 'function') {
        console.log('🚀 Notifying blockchain of game completion...', {
          score: this.finalScore,
          levels: this.levelsCompleted
        });
        onGameComplete(this.finalScore, this.levelsCompleted);
        
        // Show notification that blockchain submission is starting
        this.showNotification('📤 Submitting score to blockchain...', 'info');
      } else {
        console.warn('❌ No blockchain callback available');
        this.showNotification('⚠️ Cannot save to blockchain - wallet not connected', 'warning');
      }
    } else {
      console.warn('❌ No wallet connection available for blockchain save');
      this.showNotification('⚠️ Cannot save to blockchain - wallet not connected', 'warning');
    }
  }




  /**
   * The player's best score so far, or 0 when it is not known.
   *
   * This used to ask a `window.web3Service` that nothing in this app has ever
   * created, so it always returned 0 - and every run scoring above zero was
   * then crowned "NEW BEST SCORE". The real figure is read from the contract by
   * React and published on the bridge, alongside games played and tokens.
   */
  bestScoreSoFar() {
    const stats =
      typeof window !== "undefined"
        ? window.rocketCandleGame?.playerStats
        : null;
    const best = stats?.bestScore;
    return typeof best === "number" && Number.isFinite(best) ? best : 0;
  }



  /**
   * Get efficiency multiplier based on game performance
   * @returns {number} Multiplier for efficiency bonus (0.0 to 0.5)
   */
  getEfficiencyMultiplier() {
    if (this.totalAttempts === 0) return 0;

    const scorePerAttempt = this.finalScore / this.totalAttempts;

    // Efficiency bonus scale
    if (scorePerAttempt >= 50) return 0.5; // Excellent - 50% bonus
    if (scorePerAttempt >= 30) return 0.3; // Good - 30% bonus
    if (scorePerAttempt >= 20) return 0.2; // Average - 20% bonus
    if (scorePerAttempt >= 10) return 0.1; // Poor - 10% bonus

    return 0; // No bonus for very poor efficiency
  }

  /**
   * Show notification using React notification system
   * @param {string} message - Message to display
   * @param {string} type - Type of notification ("success", "error", "warning")
   */
  showNotification(message, type = "info") {
    // Use the global notification system from GamePage
    if (window.gameNotifications) {
      switch (type) {
        case "success":
          window.gameNotifications.showSuccess(message);
          break;
        case "error":
          window.gameNotifications.showError(message);
          break;
        case "warning":
          window.gameNotifications.showWarning(message);
          break;
        default:
          window.gameNotifications.showSuccess(message); // Default to success for info
      }
    } else {
      // Fallback to console if notification system not available
      //console.log(`${type.toUpperCase()}: ${message}`);
    }
  }

  /**
   * Restart the game
   */
  restartGame() {
    //console.log("🔄 Restarting game...");
    
    // Stop all sounds before transitioning
    this.sound.stopAll();
    
    this.scene.start("GameScene");
  }

  /**
   * Go to main menu
   */
  goToMenu() {
    //console.log("📋 Returning to main menu...");
    
    // Stop all sounds before transitioning
    this.sound.stopAll();
    
    this.scene.start("MenuScene");
  }
}
