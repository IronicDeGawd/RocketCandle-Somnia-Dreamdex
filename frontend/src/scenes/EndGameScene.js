import { UIComponents } from "@/components/UIComponents.js";

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
    this.cameras.main.setBackgroundColor("#1a1a2e");

    // Initialize sounds
    this.sounds = {
      menu: this.sound.add("menu-sound", { volume: 0.3, loop: true }),
    };

    // Create animated starry background
    this.createStarryBackground();
    
    // Start background music for end game menu (delay to ensure no overlap)
    this.time.delayedCall(100, () => {
      if (this.sounds.menu && !this.sounds.menu.isPlaying) {
        this.sounds.menu.play();
      }
    });

    // Notify parent about game completion for blockchain submission
    this.notifyGameCompletion();

    // Determine if this is a win or loss
    const isVictory = this.reason === "completed";
    const titleText = isVictory ? "🏆 VICTORY!" : "💥 GAME OVER";
    const titleColor = isVictory ? "#00ff00" : "#ff6666";

    // Create title
    this.add
      .text(600, 120, titleText, {
        fontSize: "64px", // Increased from 56px
        fill: titleColor,
        fontStyle: "bold",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    // Create score display
    this.add
      .text(600, 200, `Final Score: ${this.finalScore}`, {
        fontSize: "36px", // Increased from 32px
        fill: "#ffffff",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    // Create stats
    this.add
      .text(600, 250, `Levels Completed: ${this.levelsCompleted}`, {
        fontSize: "28px", // Increased from 24px
        fill: "#87ceeb",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    this.add
      .text(600, 280, `Total Attempts Used: ${this.totalAttempts}`, {
        fontSize: "28px", // Increased from 24px
        fill: "#ffaa00",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    // Show efficiency rating
    const efficiency = this.calculateEfficiency();
    this.add
      .text(600, 310, `Efficiency: ${efficiency}`, {
        fontSize: "22px", // Increased from 20px
        fill: "#ff6b6b",
        fontFamily: "Pixelify Sans, Arial",
      })
      .setOrigin(0.5);

    // Show best score comparison (async)
    this.displayBestScoreComparison();

    // Create restart button with purple accent
    UIComponents.createButton(
      this,
      500,
      420,
      "PLAY AGAIN",
      () => this.restartGame(),
      {
        width: 180,
        height: 60,
        fontSize: "24px",
        fill: 0x8b5cf6, // Purple
        hoverFill: 0x7c3aed, // Darker purple
        textColor: "#ffffff",
        strokeColor: "#a855f7",
        strokeWidth: 2,
      }
    );

    // Create menu button with purple accent
    UIComponents.createButton(
      this,
      700,
      420,
      "MAIN MENU",
      () => this.goToMenu(),
      {
        width: 180,
        height: 60,
        fontSize: "24px",
        fill: 0x6366f1, // Indigo purple
        hoverFill: 0x4f46e5, // Darker indigo purple
        textColor: "#ffffff",
        strokeColor: "#818cf8",
        strokeWidth: 2,
      }
    );

    // Add celebratory particles for victory
    if (isVictory) {
      this.createCelebrationEffect();
    }
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
    // Create multiple particle emitters for celebration
    const colors = [0xff0000, 0x00ff00, 0x0000ff, 0xffff00, 0xff00ff, 0x00ffff];

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
      const bestScore = await this.getBestScoreFromBlockchain();

      if (this.finalScore >= bestScore && this.finalScore > 0) {
        this.add
          .text(600, 350, "🎉 NEW BEST SCORE! 🎉", {
            fontSize: "28px", // Increased from 24px
            fill: "#ffd700",
            fontStyle: "bold",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);
      } else if (bestScore > 0) {
        this.add
          .text(600, 350, `Best Score: ${bestScore}`, {
            fontSize: "22px", // Increased from 20px
            fill: "#aaaaaa",
            fontFamily: "Pixelify Sans, Arial",
          })
          .setOrigin(0.5);
      }
    } catch (error) {
      console.warn("Failed to display best score comparison:", error);
    }
  }

  /**
   * Save score to blockchain with error handling and user feedback
   * @param {number} score - Score to save
   */
  notifyGameCompletion() {
    // Use the global callback provided by the parent component
    if (typeof window !== 'undefined' && window.rocketCandleGame) {
      const { onGameComplete } = window.rocketCandleGame;
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

  async saveScoreToBlockchain(score) {
    try {
      // Enhanced wallet connection checking with detailed logging
      console.log("🔍 Checking wallet connection for blockchain save...");
      console.log("Global objects check:", {
        hasWeb3Service: !!window.web3Service,
        hasWalletManager: !!window.walletManager,
        walletManagerIsConnected: window.walletManager?.isConnected,
        walletAddress: window.walletManager?.address,
      });

      // Check if Web3 service is available
      if (!window.web3Service) {
        console.error("❌ Web3 service not available globally");
        this.showNotification(
          "⚠️ Game services not initialized - please refresh and try again",
          "error"
        );
        return;
      }

      if (!window.walletManager) {
        console.error("❌ Wallet manager not available globally");
        this.showNotification(
          "⚠️ Wallet services not initialized - please refresh and try again",
          "error"
        );
        return;
      }

      if (!window.walletManager.isConnected) {
        console.error("❌ Wallet not connected according to global state");
        this.showNotification(
          "⚠️ Wallet not connected - score not saved to blockchain",
          "warning"
        );
        return;
      }

      console.log(
        "✅ Wallet connection validated, proceeding with blockchain save"
      );

      //console.log("📝 Saving score to blockchain...");

      // Calculate WICK rewards
      const baseReward = Math.max(20, Math.floor(score / 50));
      const completionBonus = this.reason === "completed" ? 50 : 10;
      const finalReward = baseReward + completionBonus;
      const efficiencyMultiplier = this.getEfficiencyMultiplier();
      const efficiencyBonus = Math.floor(baseReward * efficiencyMultiplier);
      const totalReward = finalReward + efficiencyBonus;

      // Submit score to blockchain
      const result = await window.web3Service.submitScore(
        "game-complete",
        score
      );

      if (result && result.success) {
        //console.log("✅ Score saved to blockchain:", result.transactionHash);
        this.showNotification("✅ Score saved to blockchain!", "success");

        // Reward WICK tokens
        try {
          const rocketFuelResult = await window.web3Service.rewardFuel(
            totalReward
          );

          if (rocketFuelResult && rocketFuelResult.success) {
            // //console.log(
            //   "🎁 WICK reward:",
            //   rocketFuelResult.transactionHash
            // );

            // Show the special Wick reward notification with transaction hash
            this.showWickRewardsWithTx(
              score,
              rocketFuelResult.transactionHash
            );
          } else {
            // Show reward notification without transaction hash
            this.showWickRewards(score);
          }
        } catch (rewardError) {
          console.error("❌ Error rewarding WICK:", rewardError);
          // Still show reward notification without transaction hash
          this.showWickRewards(score);
        }

        // Verify blockchain storage
        this.verifyBlockchainStorage(score);
      } else {
        throw new Error("Failed to save score to blockchain");
      }
    } catch (error) {
      console.error("❌ Error saving score to blockchain:", error);

      // Provide more specific error messages based on the error type
      let errorMessage = "❌ Failed to save score to blockchain";
      if (
        error.message.includes("network") ||
        error.message.includes("Network")
      ) {
        errorMessage = "❌ Network error - check your connection and try again";
      } else if (
        error.message.includes("rejected") ||
        error.message.includes("denied")
      ) {
        errorMessage = "❌ Transaction rejected by user";
      } else if (error.message.includes("insufficient")) {
        errorMessage = "❌ Insufficient funds for transaction";
      }

      this.showNotification(errorMessage, "error");
    }
  }

  /**
   * Verify blockchain storage and attempt retry if needed
   * @param {number} score - Score to verify
   */
  async verifyBlockchainStorage(score) {
    try {
      if (!window.web3Service || !window.walletManager?.isConnected) {
        return false;
      }

      //console.log("🔍 Verifying blockchain storage...");

      // Wait a moment for the transaction to be processed
      await new Promise((resolve) => setTimeout(resolve, 2000));

      // Fetch recent player scores to verify storage
      const playerScores = await window.web3Service.getPlayerScores();

      if (
        playerScores &&
        playerScores.results &&
        playerScores.results.length > 0
      ) {
        // Check if our score appears in the recent scores
        const recentScores = playerScores.results.slice(0, 5); // Check last 5 games
        const foundScore = recentScores.find(
          (result) =>
            Math.abs(result.score - score) < 10 && // Allow small variance
            Date.now() - new Date(result.timestamp).getTime() < 60000 // Within last minute
        );

        if (foundScore) {
          //console.log("✅ Blockchain storage verified successfully");
          this.showNotification(
            "✅ Game data verified on blockchain",
            "success"
          );
          return true;
        } else {
          console.warn("⚠️ Score not found in recent blockchain data");
          this.showNotification("⚠️ Retrying blockchain storage...", "warning");

          // Attempt retry
          return await this.retryBlockchainSubmission(score);
        }
      } else {
        console.warn("⚠️ No player scores found");
        return await this.retryBlockchainSubmission(score);
      }
    } catch (error) {
      console.error("❌ Error verifying blockchain storage:", error);
      return await this.retryBlockchainSubmission(score);
    }
  }

  /**
   * Retry blockchain submission with exponential backoff
   * @param {number} score - Score to retry
   * @param {number} attempt - Current attempt number
   */
  async retryBlockchainSubmission(score, attempt = 1) {
    const maxRetries = 3;

    if (attempt > maxRetries) {
      this.showNotification(
        "❌ Failed to verify blockchain storage after retries",
        "error"
      );
      return false;
    }

    try {
      //console.log(`🔄 Retry attempt ${attempt}/${maxRetries}`);

      // Exponential backoff: 2^attempt seconds
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry submission
      const result = await window.web3Service.submitScore(
        "game-complete-retry",
        score
      );

      if (result && result.success) {
        //console.log(`✅ Retry ${attempt} successful:`, result.transactionHash);
        this.showNotification(
          `✅ Game saved to blockchain (attempt ${attempt})`,
          "success"
        );
        return true;
      } else {
        throw new Error(`Retry ${attempt} failed`);
      }
    } catch (error) {
      console.error(`❌ Retry ${attempt} failed:`, error);
      return await this.retryBlockchainSubmission(score, attempt + 1);
    }
  }

  /**
   * Get best score from blockchain
   * @returns {number} Best score or 0 if none
   */
  async getBestScoreFromBlockchain() {
    try {
      if (!window.web3Service) {
        console.warn("Web3 service not available for best score retrieval");
        return 0;
      }

      if (!window.walletManager?.isConnected) {
        console.warn("Wallet not connected for best score retrieval");
        return 0;
      }

      const playerScores = await window.web3Service.getPlayerScores();
      if (
        playerScores &&
        playerScores.results &&
        playerScores.results.length > 0
      ) {
        const bestScore = Math.max(
          ...playerScores.results.map((result) => result.score)
        );
        console.log("📊 Best score retrieved from blockchain:", bestScore);
        return bestScore;
      }
      return 0;
    } catch (error) {
      console.warn("Error reading best score from blockchain:", error);
      return 0;
    }
  }

  /**
   * Calculate and show WICK rewards to the user
   * @param {number} score - Final game score
   */
  showWickRewards(score) {
    try {
      // Calculate rewards based on the same logic as GameScene
      const baseReward = Math.max(20, Math.floor(score / 50));
      const completionBonus = this.reason === "completed" ? 50 : 10;
      const finalReward = baseReward + completionBonus;

      // Calculate efficiency bonus
      const efficiencyMultiplier = this.getEfficiencyMultiplier();
      const efficiencyBonus = Math.floor(baseReward * efficiencyMultiplier);

      // Total reward
      const totalReward = finalReward + efficiencyBonus;

      // Create detailed reward breakdown
      const rewardBreakdown = [
        `🎯 Base Reward: ${baseReward} FUEL`,
        `${this.reason === "completed" ? "🏆" : "💪"} ${
          this.reason === "completed" ? "Completion" : "Participation"
        } Bonus: ${completionBonus} FUEL`,
      ];

      if (efficiencyBonus > 0) {
        rewardBreakdown.push(`⚡ Efficiency Bonus: ${efficiencyBonus} FUEL`);
      }

      // Show the special Wick reward notification
      if (window.gameNotifications) {
        window.gameNotifications.showWickReward(
          totalReward,
          rewardBreakdown,
          null
        );
      }

      //console.log(`🪙 WICK reward calculated: ${totalReward} tokens`);

      return totalReward;
    } catch (error) {
      console.error("Error calculating WICK rewards:", error);
      return 0;
    }
  }

  /**
   * Calculate and show WICK rewards with transaction hash
   * @param {number} score - Final game score
   * @param {string} txHash - Transaction hash for the reward
   */
  showWickRewardsWithTx(score, txHash) {
    try {
      // Calculate rewards based on the same logic as GameScene
      const baseReward = Math.max(20, Math.floor(score / 50));
      const completionBonus = this.reason === "completed" ? 50 : 10;
      const finalReward = baseReward + completionBonus;

      // Calculate efficiency bonus
      const efficiencyMultiplier = this.getEfficiencyMultiplier();
      const efficiencyBonus = Math.floor(baseReward * efficiencyMultiplier);

      // Total reward
      const totalReward = finalReward + efficiencyBonus;

      // Create detailed reward breakdown
      const rewardBreakdown = [
        `🎯 Base Reward: ${baseReward} FUEL`,
        `${this.reason === "completed" ? "🏆" : "💪"} ${
          this.reason === "completed" ? "Completion" : "Participation"
        } Bonus: ${completionBonus} FUEL`,
      ];

      if (efficiencyBonus > 0) {
        rewardBreakdown.push(`⚡ Efficiency Bonus: ${efficiencyBonus} FUEL`);
      }

      // Show the special Wick reward notification with transaction hash
      if (window.gameNotifications) {
        window.gameNotifications.showWickReward(
          totalReward,
          rewardBreakdown,
          txHash
        );
      }

      return totalReward;
    } catch (error) {
      console.error("Error calculating WICK rewards:", error);
      return 0;
    }
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

  /**
   * Create animated starry background
   */
  createStarryBackground() {
    // Create container for stars
    const starContainer = this.add.container(0, 0);

    // Generate random stars
    for (let i = 0; i < 100; i++) {
      const x = Math.random() * 1200;
      const y = Math.random() * 600;
      const size = Math.random() * 2 + 0.5;
      const alpha = Math.random() * 0.8 + 0.2;

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
    for (let i = 0; i < 15; i++) {
      const x = Math.random() * 1200;
      const y = Math.random() * 600;
      const size = Math.random() * 3 + 2;

      const glowStar = this.add.circle(x, y, size, 0x87ceeb, 0.6);
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

    // Add floating rocket icons in the background
    this.createFloatingRockets();

    //console.log("✨ Starry background created for end game scene");
  }

  /**
   * Create floating rocket icons in the background
   */
  createFloatingRockets() {
    // Create 5 floating rocket emojis
    for (let i = 0; i < 5; i++) {
      const x = Math.random() * 1200;
      const y = Math.random() * 600;

      const rocket = this.add
        .text(x, y, "🚀", {
          fontSize: "24px",
          fill: "#ffffff",
          alpha: 0.3,
        })
        .setOrigin(0.5);

      // Add floating animation
      this.tweens.add({
        targets: rocket,
        y: y - 50,
        duration: Math.random() * 4000 + 3000,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });

      // Add rotation animation
      this.tweens.add({
        targets: rocket,
        rotation: Math.PI * 2,
        duration: Math.random() * 6000 + 4000,
        repeat: -1,
        ease: "Linear",
      });
    }
  }
}
