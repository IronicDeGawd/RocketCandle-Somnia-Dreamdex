import { MarketDataProvider } from "@/data/MarketDataProvider.js";
import { DreamdexLiveFeed } from "@/data/DreamdexLiveFeed.js";
import { KeyboardTimerController } from "@/utils/KeyboardTimerController.js";

// The design's three faces, named once so no text in this scene can quietly
// fall back to a system font. Pixel for labels and numbers, mono for data,
// prose for sentences.
const PIXEL_FONT = '"Press Start 2P", monospace';
const MONO_FONT = '"Geist Mono", monospace';

// Palette, matching design-system.css. Canvas cannot read CSS variables.
/* Where the machine stands. The terrain generator already assumed 160, so
   naming it keeps the art and the level layout from drifting apart. */
const LAUNCHER_X = 160;

const RC_INK = 0x14161a;
const RC_BASE = 0x2a2d34;
const RC_WELL = 0x1b1e23;
const RC_RED = 0xe94f37;
const RC_YELLOW = 0xf6f740;
const RC_BLUE = 0x3f88c5;


/**
 * GameScene - Main gameplay scene for Rocket Candle
 * Handles all game mechanics, physics, and player interactions
 */
export class GameScene extends Phaser.Scene {
  constructor() {
    super({ key: "GameScene" });

    // Game state variables
    this.currentLevel = 0;
    this.score = 0;
    this.enemiesRemaining = 0;
    this.totalEnemiesInLevel = 0; // Track total enemies generated
    this.maxLevels = MarketDataProvider.getTotalLevels(); // Total number of levels from data provider
    this.launchAttempts = 0; // Track total number of rockets launched across all levels

    // Level attempt system
    this.maxAttemptsPerLevel = 3; // Maximum attempts allowed per level
    this.currentLevelAttempts = 0; // Attempts used in current level
    this.gameOver = false; // Flag for game over state

    // Candlestick barriers. Real market terrain is fetched during preload and
    // picked up in init(); this generated set is the fallback until then.
    this.marketRun = null;
    this.candlestickData = MarketDataProvider.generateGameLevels();
    this.candlestickSprites = []; // Store generated candlestick sprites

    // Rocket launcher properties
    this.launcher = null;
    this.launchAngle = 45; // degrees (15-75 range)
    this.launchPower = 50; // percentage (0-100 range)
    this.maxLaunchSpeed = 800; // pixels per second
    this.canLaunch = true;

    // Rocket physics properties
    this.airResistance = 0.998; // Slight air resistance (0.1% drag per frame) for realistic trajectory
    this.explosionSize = 70; // Explosion radius in pixels - increased from 120 for even better area coverage
    this.baseExplosionSize = 70; // Radius on a healthy book, before market conditions
    this.maxFragilityBonus = 0.5; // A vanished book reaches half again as far
    this.maxExposureBonus = 0.6; // A tripled position reaches 60% further
    this.maxTotalReach = 2.0; // Both bonuses together still stop here
    this.exposureStep = 0.5; // USDso added per top-up
    this.stopLossPct = 10; // Sell automatically if the position falls this far
    this.rocketTrail = []; // Store trail points for visual effect

    // Trajectory prediction properties
    this.trajectoryGraphics = null;
    this.showTrajectory = true;
    this.trajectoryPoints = [];
    this.gravity = 300; // matches physics world gravity
    this.trajectoryTimer = null; // For temporary trajectory display
    this.trajectoryDisplayTime = 1500; // milliseconds to show trajectory after adjustment

    // Physics groups
    this.rockets = null;
    this.candlesticks = null;
    this.blocks = null;
    this.enemies = null;

    // Keyboard and timer controller
    this.keyboardTimerController = null;
    this.angleStepSize = 2; // degrees per key press
    this.powerStepSize = 5; // percentage per key press

    // Legacy timer properties (kept for compatibility)
    this.launchTimer = null;
    this.timerBar = null;
    this.timerDuration = 8000; // 8 seconds in milliseconds
    this.isTimerActive = false;
    this.timerStartTime = 0;

    // The HUD used to be Phaser text drawn on the canvas. It is now a plain
    // object the React cabinet reads through `window.rocketCandleGame.hud` -
    // see publishHud(). Only world-anchored art (score popups, wall-collapse
    // notices, the trajectory preview, the level-transition banner) is still
    // drawn inside the scene.
    this.hudState = {
      score: 0,
      totalAttempts: 0,
      levelAttempts: 0,
      maxAttempts: this.maxAttemptsPerLevel,
      level: 1,
      totalLevels: this.maxLevels,
      levelName: "",
      enemiesLeft: 0,
      terrainCaption: "",
      marketTicker: "",
      angle: this.launchAngle,
      power: this.launchPower,
      autoLaunchSeconds: null,
      canLaunch: true,
      position: null,
      orders: null,
      fees: null,
      marketSeries: null,
      currentPrice: null,
      marketFeedStatus: "connecting",
    };
  }

  /**
   * Pick up the terrain fetched during preload.
   *
   * Runs before create() on every scene start, including restarts, so a replay
   * uses the same market the run began with rather than silently reverting to
   * generated terrain.
   */
  init() {
    const run = this.registry.get("marketRun");

    if (run && Array.isArray(run.levels) && run.levels.length) {
      this.marketRun = run;
      this.candlestickData = run.levels;
    } else {
      this.marketRun = null;
      this.candlestickData = MarketDataProvider.generateGameLevels();
    }

    this.maxLevels = this.candlestickData.length;

    // A restart reuses the scene object, so anything left over from the last
    // run would otherwise leak into this one.
    this.stopLiveMarketFeed();
    this.lastTrade = null;
    this.marketBook = null;
    this.breakout = null;
    this.position = null;
    this.openingStake = 0;
    this.ejected = false;
    this.ejecting = false;
    this.buyingFirepower = false;
    this.stopTriggered = false;
    this.targetTriggered = false;

    /*
     * The exits the player chose on the menu, for the pair they picked. The
     * floor used to be a constant nobody could change and there was no target
     * at all, so the only way out of a position was the E key.
     */
    const plan =
      typeof window !== "undefined"
        ? window.rocketCandleGame?.exitPlan
        : null;
    this.stopLossPct = plan?.floorPct ?? this.stopLossPct;
    this.takeProfitPct = plan?.targetPct ?? 0;
    if (this.positionTimer) {
      this.positionTimer.remove();
      this.positionTimer = null;
    }
    this.marketFeedStatus = "connecting";
    this.explosionSize = this.baseExplosionSize;
    // Forget which level the published price line was built for, or a replay
    // would keep showing the previous run's line.
    this.hudSeriesLevel = null;
  }

  create() {
    // Listen to the market this run is being played on
    this.startLiveMarketFeed();
    this.startTrading();

    // Set world bounds (1200x600 as updated)
    this.physics.world.setBounds(0, 0, 1200, 600);

    // Set world gravity for proper physics
    this.physics.world.gravity.y = this.gravity;

    // Initialize sounds
    this.sounds = {
      enemyDestroy: this.oneSound("enemy-destroy", { volume: 0.5 }),
      gameOver: this.oneSound("game-over", { volume: 0.7 }),
      gameLevel: this.oneSound("level-complete", { volume: 0.3, loop: true }),
    };

    // Set camera bounds
    this.cameras.main.setBounds(0, 0, 1200, 600);

    // Add background image
    this.backgroundImage = this.add
      .image(600, 300, "game-background")
      .setOrigin(0.5, 0.5)
      .setDisplaySize(1200, 600);

    // Set the background image as the deepest layer
    this.backgroundImage.setDepth(-1000);

    // Initialize wallet and Web3 services
    this.initializeWeb3();

    // Create ground/floor collision boundary
    this.createGround();

    // Initialize physics groups
    this.initializePhysicsGroups();

    // Set up HUD
    this.createHUD();

    // Create rocket launcher system
    this.createLauncher();

    // Reset the run's counters BEFORE the level is built.
    //
    // This used to run last, after the barriers and enemies existed, and it
    // wiped the enemy count they had just set - so the readout said 00 with a
    // field full of enemies until the first kill reconciled it. Worse, the
    // level number is reset here too, and a replay reuses the scene object:
    // building first meant a restart generated the previous run's terrain and
    // then labelled it level one.
    this.initializeScene();

    // Generate candlestick barriers for current level
    this.generateCandlestickBarriers();

    // Start background music for game level (delay to ensure no overlap)
    // Check if game music is already playing globally to prevent multiple instances
    this.time.delayedCall(100, () => {
      if (this.sounds.gameLevel && !this.sounds.gameLevel.isPlaying) {
        this.sounds.gameLevel.play();
      }
    });

    // Create trajectory prediction system
    this.createTrajectorySystem();

    // Create graphics object for rocket trails
    this.trailGraphics = this.add.graphics();

    // Set up keyboard controls
    this.setupKeyboardControls();
  }

  /**
   * Initialize Web3 and wallet services
   */
  initializeWeb3() {
    // Get global wallet manager and web3 service from main.js
    this.walletManager = window.walletManager;
    this.web3Service = window.web3Service;

    // Set wallet connection status
    this.walletConnected = this.walletManager?.isConnected || false;

    //console.log("🔗 GameScene: Web3 services initialized");

    if (this.walletConnected) {
      this.loadWickBalance();
    }
  }

  /**
   * Load WICK balance for display
   */
  async loadWickBalance() {
    if (!this.walletConnected || !this.web3Service) return;

    try {
      const _balance = await this.web3Service.getFuelBalance();
      //console.log(`💰 Current WICK balance: ${balance}`);
    } catch (error) {
      console.error("Failed to load WICK balance in GameScene:", error);
    }
  }

  /**
   * Set up keyboard controls with timer lock system
   */
  setupKeyboardControls() {
    // Initialize the keyboard timer controller
    this.keyboardTimerController = new KeyboardTimerController(this, {
      angleMin: 15,
      angleMax: 75,
      powerMin: 0,
      powerMax: 100,
      angleStepSize: this.angleStepSize,
      powerStepSize: this.powerStepSize,
      timerDuration: this.timerDuration,
      onAngleChange: (_angle) => {
        this.updateLauncherRotation();
        this.updateControlDisplay();
        this.showTemporaryTrajectory();
      },
      onPowerChange: (_power) => {
        this.updateControlDisplay();
        this.showTemporaryTrajectory();
      },
      onAutoLaunch: () => {
        this.launchRocket();
      },
    });

    //console.log("✅ Keyboard controls and timer lock system initialized");
  }

  /**
   * Create ground/floor collision boundary
   */
  createGround() {
    // Ground height at y=550 (50px from bottom)
    this.groundY = 550;

    // Create tiled ground using brown candle blocks (50px each)
    const blockSize = 50;
    const screenWidth = 1200;
    const numBlocks = Math.ceil(screenWidth / blockSize);

    // Create container for ground blocks
    this.groundBlocks = this.add.container(0, 0);

    // Create tiled ground blocks
    for (let i = 0; i < numBlocks; i++) {
      const x = i * blockSize + blockSize / 2; // Center each block
      const groundBlock = this.add.image(
        x,
        this.groundY + blockSize / 2,
        "ground-block"
      );
      groundBlock.setDisplaySize(blockSize, blockSize);
      this.groundBlocks.add(groundBlock);
    }

    // Create physics body for ground collision
    this.groundBody = this.physics.add.staticGroup();
    const groundCollider = this.groundBody.create(600, this.groundY, null); // Updated x center
    groundCollider.setSize(1200, 50); // Updated width
    groundCollider.setVisible(false);

    //console.log("✅ Ground created with collision detection");
  }

  /**
   * Initialize all physics groups for game objects
   */
  initializePhysicsGroups() {
    // Create physics groups for different object types
    this.rockets = this.physics.add.group({
      defaultKey: "rocket",
      maxSize: 1, // Only one rocket at a time
    });

    this.candlesticks = this.physics.add.staticGroup();
    this.blocks = this.physics.add.staticGroup(); // Make blocks static
    this.enemies = this.physics.add.group();

    // Set up collision detection between groups
    this.setupCollisions();

    //console.log("✅ Physics groups initialized");
  }

  /**
   * Set up collision detection between different physics groups
   */
  setupCollisions() {
    // Rocket collisions with ground
    this.physics.add.collider(
      this.rockets,
      this.groundBody,
      this.onRocketHitGround,
      null,
      this
    );

    // Rocket collisions with candlesticks
    this.physics.add.collider(
      this.rockets,
      this.candlesticks,
      this.onRocketHitCandlestick,
      null,
      this
    );

    // Rocket collisions with blocks
    this.physics.add.collider(
      this.rockets,
      this.blocks,
      this.onRocketHitBlock,
      null,
      this
    );

    // Rocket collisions with enemies
    this.physics.add.overlap(
      this.rockets,
      this.enemies,
      this.onRocketHitEnemy,
      null,
      this
    );

    // Block collisions with ground (not needed for static blocks)
    // this.physics.add.collider(this.blocks, this.groundBody);

    // Block collisions with candlesticks (not needed for static blocks)
    // this.physics.add.collider(this.blocks, this.candlesticks);

    // Block to block collisions (not needed for static blocks)
    // this.physics.add.collider(this.blocks, this.blocks);

    // Enemy collisions with ground
    this.physics.add.collider(this.enemies, this.groundBody);

    // Enemy collisions with candlesticks
    this.physics.add.collider(this.enemies, this.candlesticks);

    // Enemy collisions with blocks (so they can walk on them)
    this.physics.add.collider(this.enemies, this.blocks);
  }

  /**
   * Set up the HUD bridge.
   *
   * The readouts (score, attempts, level, terrain, ticker, enemy count,
   * position, fees) used to be Phaser text objects drawn over the play field.
   * They are now HTML rendered by the React cabinet, fed through
   * `window.rocketCandleGame.hud` - see publishHud(). This only wires the
   * bridge and pushes the first snapshot.
   */
  createHUD() {
    this.registerControls();
    this.updateMarketTicker();
    this.updateHUD();
  }

  /**
   * Publish the current HUD snapshot for the React cabinet to read.
   *
   * A plain object rather than individual events, so a component mounting
   * mid-run (or a React re-render) can always read a consistent whole rather
   * than assembling one from a history of partial updates.
   */
  publishHud() {
    this.hudState.active = true;
    if (typeof window === "undefined" || !window.rocketCandleGame) return;
    window.rocketCandleGame.hud = { ...this.hudState };
    window.dispatchEvent(new CustomEvent("rc-hud"));
  }

  /**
   * Hand React a way to drive the launcher.
   *
   * The scene owns the actual state (angle, power, launch, eject...); these
   * are just the doors in. If React never calls them - practice mode with no
   * cabinet mounted, or a page that hasn't hydrated yet - the keyboard path
   * still works untouched.
   */
  /**
   * Tell the overlay the run is over.
   *
   * Phaser reuses the scene object, so without this the last run's score and
   * enemy count stay published and hang over the menu that replaces it.
   */
  clearHud() {
    this.hudState.active = false;
    if (typeof window !== "undefined" && window.rocketCandleGame) {
      window.rocketCandleGame.hud = { ...this.hudState };
      window.dispatchEvent(new CustomEvent("rc-hud"));
    }
  }

  /**
   * One sound per key, however many times this scene is entered.
   *
   * Phaser keeps every sound ever added on the game-wide manager, and create()
   * runs again on every replay. Adding without removing first left one more
   * copy of the same loop playing after each round, so the music thickened as
   * you played instead of repeating.
   */
  oneSound(key, config) {
    this.sound.removeByKey(key);
    return this.sound.add(key, config);
  }

  registerControls() {
    if (typeof window === "undefined" || !window.rocketCandleGame) return;

    window.rocketCandleGame.controls = {
      setAngle: (value) => this.setAngleFromControls(value),
      setPower: (value) => this.setPowerFromControls(value),
      launch: () => this.launchRocket(),
      endGame: () => this.endGameManually(),
      eject: () => this.ejectPosition(),
      addFirepower: () => this.buyFirepower(),
    };
  }

  /** @param {number} value */
  setAngleFromControls(value) {
    const clamped = Phaser.Math.Clamp(Math.round(value), 15, 75);
    if (clamped === this.launchAngle) return;

    this.launchAngle = clamped;
    this.updateLauncherRotation();
    this.updateControlDisplay();
    this.showTemporaryTrajectory();
    if (this.keyboardTimerController) {
      this.keyboardTimerController.startTimer();
    }
  }

  /** @param {number} value */
  setPowerFromControls(value) {
    const clamped = Phaser.Math.Clamp(Math.round(value), 0, 100);
    if (clamped === this.launchPower) return;

    this.launchPower = clamped;
    this.updateControlDisplay();
    this.showTemporaryTrajectory();
    if (this.keyboardTimerController) {
      this.keyboardTimerController.startTimer();
    }
  }

  /**
   * Update HUD displays
   */
  /**
   * Take up the run's position and keep it in view.
   *
   * The game never touches a key. It asks the bridge, which lives on the React
   * side with the wallet, and shows what comes back.
   */
  startTrading() {
    const bridge = this.getTradingBridge();
    if (!bridge) return;

    // Refresh slowly. Each check is a call to the chain, and the number moving
    // twice a second would only make the player watch it instead of playing.
    this.positionTimer = this.time.addEvent({
      delay: 4000,
      loop: true,
      callback: () => this.refreshPosition(),
    });

    this.refreshPosition();
    this.setUpEjectKey();
    this.setUpFirepowerKey();
  }

  /** The trading bridge, if this run has one. Practice runs do not. */
  getTradingBridge() {
    if (typeof window === "undefined") return null;
    const bridge = window.rocketCandleGame?.trading;
    return bridge && bridge.enabled ? bridge : null;
  }

  /** Ask what the position is worth and put it on screen. */
  async refreshPosition() {
    const bridge = this.getTradingBridge();
    if (!bridge) return;

    try {
      this.position = await bridge.snapshot();
      if (this.position?.open && !this.openingStake) {
        this.openingStake = this.position.stake;
      }
      this.recalculateBlastRadius();
    } catch {
      // A missed price check is not worth interrupting a run over; the next
      // one is four seconds away.
      return;
    }

    this.updatePositionText();
    this.updateFeeCounter();
    this.checkStopLoss();
    this.checkTarget();
  }

  /**
   * Sell automatically if the position rises far enough.
   *
   * The mirror of the floor, and deliberately the same shape: watched by this
   * page while the run is on screen, and it does NOT end the run. The rocket
   * drops back to base strength and the game carries on, because taking a
   * profit and finishing a game are different decisions.
   */
  async checkTarget() {
    if (!this.position?.open || this.targetTriggered || this.ejecting) return;
    if (!this.takeProfitPct) return;
    if (this.position.pnlPct < this.takeProfitPct) return;

    const bridge = this.getTradingBridge();
    if (!bridge) return;

    this.targetTriggered = true;
    this.showEjectNotice(
      `Target hit at +${this.takeProfitPct}% - selling your position`
    );

    try {
      const result = await bridge.close();
      this.position = await bridge.snapshot();
      this.updatePositionText();
      this.updateFeeCounter();

      if (result) {
        this.showEjectNotice(
          `Took profit - ${result.proceeds.toFixed(4)} USDso back. Play on.`
        );
      }
    } catch {
      this.targetTriggered = false;
      this.showEjectNotice("Could not sell at the target - still holding");
    }
  }

  /**
   * Sell automatically if the position falls too far.
   *
   * This is a floor the game watches, which means it only works while this
   * page is open. It is NOT an order resting on the exchange - that would fire
   * even with the browser closed. Each market publishes its own stop registry
   * for exactly that, but the contract is unverified and no client library
   * covers it, so guessing at its interface would risk sending money into a
   * call nobody can check. Said plainly on screen rather than implied away.
   */
  async checkStopLoss() {
    if (!this.position?.open || this.stopTriggered || this.ejecting) return;

    // Off means off: a player who set no floor rides it out.
    if (!this.stopLossPct) return;
    if (this.position.pnlPct > -this.stopLossPct) return;

    const bridge = this.getTradingBridge();
    if (!bridge) return;

    this.stopTriggered = true;
    this.showEjectNotice(
      `Floor broken at -${this.stopLossPct}% - selling your position`
    );

    try {
      const result = await bridge.close();
      this.position = await bridge.snapshot();
      this.updatePositionText();
      this.updateFeeCounter();

      if (result) {
        this.showEjectNotice(
          `Stopped out - ${result.proceeds.toFixed(4)} USDso back. Play on.`
        );
      }
    } catch {
      this.stopTriggered = false;
      this.showEjectNotice("Could not sell at the floor - still holding");
    }
  }

  /**
   * E ejects: sell the position, keep playing.
   *
   * Deliberately does not end the run. The money decision and the game
   * decision are different decisions, and keeping them apart is what teaches
   * a first-timer what holding a position actually means.
   *
   * Shared by the E key and the cabinet's EJECT button - both are just doors
   * into the same action.
   */
  async ejectPosition() {
    const bridge = this.getTradingBridge();
    if (!bridge || !this.position?.open || this.ejecting) return;

    this.ejecting = true;
    this.showEjectNotice("Selling your position...");

    try {
      const result = await bridge.close();
      this.ejected = true;
      this.position = await bridge.snapshot();
      this.updatePositionText();
      this.updateFeeCounter();

      if (result) {
        const sign = result.pnl >= 0 ? "+" : "";
        this.showEjectNotice(
          `Ejected - you keep ${result.proceeds.toFixed(4)} USDso (${sign}${result.pnl.toFixed(4)})`
        );
      }
    } catch {
      this.showEjectNotice("Could not sell right now - still holding");
    } finally {
      this.ejecting = false;
    }
  }

  setUpEjectKey() {
    this.input.keyboard.on("keydown-E", () => this.ejectPosition());
  }

  /**
   * F buys firepower: add to the position, and the rocket hits harder.
   *
   * Opt-in, never automatic. Tying exposure to aim was rejected early on -
   * aim is dictated by where the enemies are, so the trade would be noise the
   * player cannot control, and a payout swinging on noise is a slot machine.
   *
   * Shared by the F key and the cabinet's firepower control.
   */
  async buyFirepower() {
    const bridge = this.getTradingBridge();
    if (!bridge || !this.position?.open || this.buyingFirepower) return;

    this.buyingFirepower = true;
    this.showEjectNotice(`Buying firepower - staking ${this.exposureStep} more...`);

    try {
      this.position = await bridge.addExposure(this.exposureStep);
      this.recalculateBlastRadius();
      this.updatePositionText();
      this.updateFeeCounter();
      this.updateMarketTicker();
      this.showEjectNotice(
        `Bigger position, bigger blast - radius now ${this.explosionSize}px`
      );
    } catch {
      this.showEjectNotice("Could not add to your position");
    } finally {
      this.buyingFirepower = false;
    }
  }

  setUpFirepowerKey() {
    this.input.keyboard.on("keydown-F", () => this.buyFirepower());
  }

  /** @param {string} message */
  showEjectNotice(message) {
    const notice = this.add
      .text(600, 150, message, {
        fontSize: "18px",
        fill: "#ffd166",
        fontFamily: PIXEL_FONT,
        stroke: "#000000",
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(1000);

    this.tweens.add({
      targets: notice,
      alpha: 0,
      y: 120,
      duration: 3000,
      ease: "Quad.easeOut",
      onComplete: () => notice.destroy(),
    });
  }

  /**
   * Orders placed this run, and what they cost in fees.
   *
   * The fee figure is not a placeholder waiting to be filled in. It is zero
   * because the exchange charges nothing, on either side, on every pair.
   */
  updateFeeCounter() {
    const bridge = this.getTradingBridge();
    if (!bridge) {
      this.hudState.orders = null;
      this.hudState.fees = null;
      this.publishHud();
      return;
    }

    const orders = bridge.ordersPlaced();
    this.hudState.orders = orders || null;
    // Not a placeholder waiting to be filled in - the exchange charges
    // nothing, on either side, on every pair, so this is always zero.
    this.hudState.fees = orders ? 0 : null;
    this.publishHud();
  }

  /** Show the stake, what it is worth now, and the way out. */
  updatePositionText() {
    if (!this.position || !this.position.open) {
      this.hudState.position = null;
      this.publishHud();
      return;
    }

    const { stake, value, pnl, pnlPct } = this.position;
    this.hudState.position = {
      stake,
      value,
      pnl,
      pnlPct,
      floorPct: this.stopLossPct,
      targetPct: this.takeProfitPct,
    };
    this.publishHud();
  }

  /**
   * Start listening to the market the player is standing on.
   *
   * The ground is history; this is the present. Somebody else's trade, landing
   * right now on the same market, shakes the level the player is aiming at.
   * Read-only - nothing here spends or places anything.
   */
  startLiveMarketFeed() {
    if (!this.marketRun || !this.marketRun.live || !this.marketRun.source) {
      return;
    }

    this.liveFeed = new DreamdexLiveFeed({
      symbol: this.marketRun.market.symbol,
      source: this.marketRun.source,
      onTrade: (trade) => this.onMarketTrade(trade),
      onBook: (book) => this.onMarketBook(book),
      onStatus: (status) => this.onMarketStatus(status),
    });

    this.liveFeed.connect();

    // A scene can end in several ways - finishing, dying, quitting - and every
    // one of them must drop the socket, or a finished run keeps listening.
    this.events.once("shutdown", () => this.stopLiveMarketFeed());
    this.events.once("destroy", () => this.stopLiveMarketFeed());
  }

  /** Drop the connection. Safe to call more than once. */
  stopLiveMarketFeed() {
    if (this.liveFeed) {
      this.liveFeed.close();
      this.liveFeed = null;
    }
  }

  /**
   * Somebody just traded. Make the player feel it.
   *
   * Effects scale with how large the trade was for this market, not with its
   * raw value, so a market priced in cents and one priced in tens of thousands
   * both behave sensibly. Ordinary trades give a small tick; a genuinely big
   * one rattles the whole screen.
   *
   * @param {object} trade - normalized trade from the live feed
   */
  onMarketTrade(trade) {
    const firstTrade = !this.lastTrade;
    this.lastTrade = trade;
    this.updateMarketTicker();

    // The range can only be armed once a live price is known, which is the
    // first trade to arrive rather than the moment the level was built.
    if (firstTrade) {
      this.armBreakout();
    } else {
      this.checkBreakout(trade.price);
    }

    // Never interrupt a rocket in flight. The shot is the one moment where the
    // player's aim has to be the only thing that decided the outcome.
    if (!this.canLaunch || this.gameOver) return;

    const strength = Math.max(0.4, Math.min(4, trade.magnitude));
    // Intensity is a fraction of the viewport, so the old 0.001 moved the
    // camera by well under a pixel - the tremor fired on every trade and was
    // invisible. Enough travel to be felt, not enough to spoil an aim.
    this.cameras.main.shake(120 + strength * 60, 0.004 * strength);
  }

  /**
   * Show the wind before the shot, never after.
   *
   * @returns {string} suffix for the ticker, empty when the air is still
   */
  describeWind() {
    const wind = this.marketWindAcceleration();
    if (!wind) return "";

    // A single glyph, not an ASCII arrow. Two hyphens and an angle bracket
    // wrap onto the next line as loose punctuation when the ticker is narrow.
    const arrow = wind > 0 ? "\u2192" : "\u2190";
    const force = Math.abs(wind) > 40 ? "strong" : "light";
    return `  ·  wide spread, ${force} drift ${arrow}`;
  }

  /**
   * Arm the breakout for this level.
   *
   * The highest high and the lowest low of the level's own candles are the
   * walls the market built. If the live price later breaks through one of
   * them, that barrier comes down.
   *
   * Only armed when the current price starts *inside* the range. Levels are
   * built from a historical window, so today's price is often nowhere near it -
   * and a wall that shatters the instant play begins teaches nothing.
   */
  armBreakout() {
    this.breakout = null;

    const level = this.candlestickData[this.currentLevel];
    if (!level || !level.live || !this.lastTrade) return;

    const highs = level.candlesticks.map((c) => c.high);
    const lows = level.candlesticks.map((c) => c.low);
    const resistance = Math.max(...highs);
    const support = Math.min(...lows);

    const price = this.lastTrade.price;
    if (!(price > support && price < resistance)) return;

    this.breakout = { support, resistance, broken: false };
  }

  /**
   * Has the price just broken out of the level's range?
   *
   * @param {number} price - the price of the trade that just landed
   */
  checkBreakout(price) {
    if (!this.breakout || this.breakout.broken) return;

    const above = price > this.breakout.resistance;
    const below = price < this.breakout.support;
    if (!above && !below) return;

    this.breakout.broken = true;
    this.shatterBarrier(above);
  }

  /**
   * Bring down the barrier that set the level's high or low.
   *
   * @param {boolean} wasResistance - true if the price broke upwards
   */
  shatterBarrier(wasResistance) {
    if (!this.candlestickSprites.length) return;

    // The tallest barrier is the one that set the ceiling; the shortest set the
    // floor. Whichever the price broke through is the one that gives way.
    let target = null;
    let best = wasResistance ? -Infinity : Infinity;

    this.candlestickSprites.forEach((entry) => {
      const value = wasResistance ? entry.data.high : entry.data.low;
      if (wasResistance ? value > best : value < best) {
        best = value;
        target = entry;
      }
    });

    if (!target || !target.blocks || !target.blocks.length) return;

    this.cameras.main.shake(400, 0.008);

    // Where the notice goes: at the wall that is coming down, not floating in
    // the middle of the screen. Read before the blocks are cleared.
    const topBlock = target.blocks[target.blocks.length - 1];
    const noticeX = topBlock.x;
    const noticeY = Math.max(60, topBlock.y - 60);

    target.blocks.forEach((block, index) => {
      this.tweens.add({
        targets: block,
        alpha: 0,
        y: block.y + 40,
        angle: (index % 2 ? 1 : -1) * 45,
        duration: 500,
        delay: index * 40,
        ease: "Quad.easeIn",
        onComplete: () => block.destroy(),
      });
    });
    target.blocks = [];

    this.showBreakoutNotice(wasResistance, noticeX, noticeY);
  }

  /**
   * Say what just happened, at the wall it happened to.
   *
   * A red plate with the event on the first line and the market cause on the
   * second. It appears at the barrier rather than in the middle of the screen,
   * so there is never any doubt which wall the message is about, and only one
   * exists at a time - a second collapse replaces the first rather than
   * stacking a second banner on top of it.
   *
   * @param {boolean} wasResistance
   * @param {number} x world x of the barrier
   * @param {number} y world y above the barrier
   */
  showBreakoutNotice(wasResistance, x, y) {
    if (this.breakoutNotice) {
      this.tweens.killTweensOf(this.breakoutNotice);
      this.breakoutNotice.destroy();
      this.breakoutNotice = null;
    }

    const cause = wasResistance ? "BUY PRESSURE" : "SELL PRESSURE";

    const plate = this.add.container(x, y).setDepth(1000);

    const label = this.add
      .text(0, -8, "WALL DOWN", {
        fontSize: "14px",
        fill: "#ffffff",
        fontFamily: PIXEL_FONT,
      })
      .setOrigin(0.5);

    const reason = this.add
      .text(0, 12, cause, {
        fontSize: "10px",
        fill: "#ffffff",
        fontFamily: PIXEL_FONT,
      })
      .setOrigin(0.5)
      .setAlpha(0.75);

    // The plate is sized to whichever line is wider, so the border never
    // clips the text at any message length.
    const width = Math.max(label.width, reason.width) + 32;
    const height = 60;

    const face = this.add.graphics();
    face.fillStyle(RC_INK, 1);
    face.fillRect(-width / 2 + 5, -height / 2 + 5, width, height);
    face.fillStyle(RC_INK, 1);
    face.fillRect(-width / 2, -height / 2, width, height);
    face.fillStyle(RC_RED, 1);
    face.fillRect(-width / 2 + 4, -height / 2 + 4, width - 8, height - 8);

    plate.add([face, label, reason]);

    this.breakoutNotice = plate;

    // Held for 700ms, then gone. Long enough to read two short lines, short
    // enough that it is never still there when the next shot is aimed.
    this.tweens.add({
      targets: plate,
      alpha: 0,
      duration: 700,
      delay: 700,
      ease: "Quad.easeOut",
      onComplete: () => {
        plate.destroy();
        if (this.breakoutNotice === plate) this.breakoutNotice = null;
      },
    });
  }

  /**
   * Sideways push on a rocket, in pixels per second squared.
   *
   * Scales with how wide the buy/sell gap is compared with a normal market.
   * Deliberately gentle: it should be felt as weather, not as the game taking
   * the shot away from the player.
   *
   * @returns {number} positive pushes right, negative pushes left
   */
  marketWindAcceleration() {
    if (!this.marketBook) return 0;

    // Below this the market is behaving normally and there is no wind at all.
    const CALM_SPREAD_PCT = 0.15;
    const MAX_WIND = 60;

    const excess = this.marketBook.spreadPct - CALM_SPREAD_PCT;
    if (excess <= 0) return 0;

    const strength = Math.min(1, excess / 0.6) * MAX_WIND;

    // Blow towards whichever side is dearer: an expensive ask pushes right.
    return this.lastTrade && this.lastTrade.side === "sell" ? -strength : strength;
  }

  /**
   * A short phrase for how healthy the book is, only when it matters.
   *
   * Said in plain terms - a player who has never seen an order book still
   * understands "thin market, bigger blast".
   *
   * @returns {string} suffix for the ticker, empty when the book looks normal
   */
  describeBookHealth() {
    if (!this.marketBook) return "";
    if (this.marketBook.fragility < 0.25) return "";

    return this.marketBook.fragility > 0.6
      ? "  ·  thin market, blasts reach much further"
      : "  ·  thinning market, blasts reach further";
  }

  /**
   * The order book moved. Adjust how destructive a rocket is.
   *
   * When the money resting at the best prices thins out, the market is
   * fragile: a modest trade can shove the price a long way. The game makes
   * that felt rather than explained - on a thin book, blasts reach further and
   * take more of the level with them. On a deep book, the same rocket does
   * ordinary damage.
   *
   * @param {object} book - current state of the order book
   */
  onMarketBook(book) {
    this.marketBook = book;
    this.recalculateBlastRadius();
    this.updateMarketTicker();
  }

  /**
   * How far a rocket reaches.
   *
   * Two things widen it: a thin market, because a fragile book means things
   * break easily, and a bigger position, because that is what the player paid
   * for. Capped together, so stacking both cannot trivialise a level.
   */
  recalculateBlastRadius() {
    const fragility = this.marketBook ? this.marketBook.fragility : 0;
    const fragilityReach = 1 + fragility * this.maxFragilityBonus;

    // Exposure is measured against the stake the run opened with, so buying
    // firepower means genuinely putting more at risk than you started with.
    let exposureReach = 1;
    if (this.position?.open && this.openingStake > 0) {
      const multiple = this.position.stake / this.openingStake;
      exposureReach =
        1 + Math.min(1, (multiple - 1) / 2) * this.maxExposureBonus;
    }

    const reach = Math.min(this.maxTotalReach, fragilityReach * exposureReach);
    this.explosionSize = Math.round(this.baseExplosionSize * reach);
  }

  /**
   * @param {string} status - "live" | "connecting" | "offline"
   */
  onMarketStatus(status) {
    this.marketFeedStatus = status;
    this.updateMarketTicker();
  }

  /**
   * Show the market's heartbeat: the last trade somebody else made.
   *
   * This is the line that makes the connection undeniable - a spectator can
   * place an order on their phone and watch it appear on the player's screen.
   */
  updateMarketTicker() {
    this.hudState.marketTicker = this.describeMarketTicker();
    this.publishHud();
  }

  /** @returns {string} the market's heartbeat line, for the HUD well */
  describeMarketTicker() {
    if (this.marketFeedStatus !== "live") {
      return this.marketFeedStatus === "connecting" ? "market: connecting" : "";
    }

    if (!this.lastTrade) {
      return "market: live, waiting for a trade";
    }

    const { side, quantity, price } = this.lastTrade;
    const book = this.describeBookHealth();
    const wind = this.describeWind();

    // Say whose trade this is. It belongs to somebody else on the exchange,
    // not to the player - worded as a bare "SOLD 25" it reads as though they
    // had just sold something, which in practice mode they cannot have done
    // because they hold nothing at all.
    const direction = side === "buy" ? "bought" : "sold";
    return `someone ${direction} ${quantity} @ ${price}${book}${wind}`;
  }

  /**
   * One line saying where this terrain came from.
   *
   * The point of the whole feature is that the ground is real, so the run has
   * to be able to prove it: which market, which timeframe, which moment. A
   * mirrored market says so outright rather than passing itself off as live
   * trading on this network.
   *
   * @returns {string} caption for the HUD
   */
  /**
   * The whole run's price line, and where the current level sits on it.
   *
   * Built once per level rather than per frame: the closes never change, and
   * the only thing that moves is which slice is marked. Practice runs get
   * nothing, so the strip stays hidden there.
   *
   * @returns {object|null} series, the current level's span, and provenance
   */
  describeMarketSeries() {
    if (!this.marketRun || !Array.isArray(this.candlestickData)) return null;
    if (typeof window !== "undefined" && window.rocketCandleGame?.practiceMode) {
      return null;
    }

    const series = [];
    let from = 0;
    let to = 0;

    this.candlestickData.forEach((level, index) => {
      if (index === this.currentLevel) from = series.length;
      (level.candlesticks || []).forEach((candle) => series.push(candle.close));
      if (index === this.currentLevel) to = series.length - 1;
    });

    if (series.length < 2) return null;

    const level = this.candlestickData[this.currentLevel];

    return {
      series,
      from,
      to,
      symbol: this.marketRun.market.symbol,
      label: this.marketRun.market.label,
      interval: level?.interval ?? "",
      windowFrom: level?.window?.from ?? null,
      mirrored: Boolean(this.marketRun.mirrored),
    };
  }

  describeCurrentTerrain() {
    const level = this.candlestickData[this.currentLevel];
    if (!level) return "";

    if (!this.marketRun || !level.live) {
      return "Simulated market";
    }

    const parts = [this.marketRun.market.label, level.interval];

    if (level.window) {
      parts.push(
        new Date(level.window.from).toLocaleString([], {
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      );
    }

    if (this.marketRun.mirrored) {
      parts.push("mirrored from mainnet");
    }

    return parts.join(" · ");
  }

  updateHUD() {
    const levelData = this.candlestickData[this.currentLevel];

    this.hudState.score = this.score;
    this.hudState.totalAttempts = this.launchAttempts;
    this.hudState.levelAttempts = this.currentLevelAttempts;
    this.hudState.maxAttempts = this.maxAttemptsPerLevel;
    this.hudState.level = this.currentLevel + 1;
    this.hudState.totalLevels = this.maxLevels;
    this.hudState.levelName = levelData?.name ?? "";
    this.hudState.enemiesLeft = this.enemiesRemaining;
    this.hudState.terrainCaption = this.describeCurrentTerrain();
    this.hudState.canLaunch = this.canLaunch;

    // The price line is rebuilt only when the level changes - it is the same
    // closes every frame otherwise, and the strip memoises on the level.
    if (this.hudSeriesLevel !== this.currentLevel) {
      this.hudState.marketSeries = this.describeMarketSeries();
      this.hudSeriesLevel = this.currentLevel;
    }

    this.hudState.currentPrice = this.lastTrade ? this.lastTrade.price : null;
    this.hudState.marketFeedStatus = this.marketFeedStatus;

    this.publishHud();
  }

  /**
   * Initialize scene state and start first level
   */
  initializeScene() {
    // Reset game state
    this.currentLevel = 0;
    this.score = 0;
    this.enemiesRemaining = 0;
    this.launchAttempts = 0;
    this.currentLevelAttempts = 0;
    this.gameOver = false;

    // Update HUD
    this.updateHUD();

    //console.log("✅ Scene state initialized");
  }

  /**
   * Clear existing candlesticks, blocks, and enemies for level transitions
   */
  clearCandlesticks() {
    // Clear all candlestick barriers (containers and their blocks)
    this.candlestickSprites.forEach((candlestickData) => {
      if (candlestickData.container) {
        candlestickData.container.destroy();
      }
      if (candlestickData.blocks) {
        candlestickData.blocks.forEach((block) => {
          if (block.body) {
            block.body.destroy();
          }
          block.destroy();
        });
      }
    });

    // Clear physics groups
    this.candlesticks.clear(true, true);
    this.blocks.clear(true, true);
    this.enemies.clear(true, true);

    // Clear candlestick sprites array
    this.candlestickSprites = [];

    //console.log("🧹 Cleared existing candlesticks, blocks, and enemies");
  }

  /**
   * Generate candlestick barriers for the current level
   */
  generateCandlestickBarriers() {
    // Clear existing candlesticks
    this.clearCandlesticks();

    // Reset enemy counters and level attempts (but keep cumulative launch attempts)
    this.enemiesRemaining = 0;
    this.totalEnemiesInLevel = 0;
    this.currentLevelAttempts = 0; // Reset attempts for new level
    // Note: launchAttempts is NOT reset - it's cumulative across all levels

    const levelData = this.candlestickData[this.currentLevel];
    if (!levelData) {
      console.warn(`⚠️ No data found for level ${this.currentLevel}`);
      return;
    }

    const candlesticks = levelData.candlesticks;
    const startX = 350; // Start position closer to launcher (reduced from 400)
    const barWidth = 30; // Thinner candlestick barriers (reduced from 40)
    const spacing = 80; // Reduced spacing between barriers (reduced from 100)

    //console.log(`📊 Generating ${candlesticks.length} candlestick barriers for level ${this.currentLevel}: ${levelData.name}` );

    candlesticks.forEach((candle, index) => {
      const x = startX + index * spacing;

      // Create candlestick barrier (replaces fixed-height platform)
      const {
        barrier: _barrier,
        topY,
        height,
      } = this.createCandlestickBarrier(x, this.groundY, candle, barWidth);

      // Calculate distance from launcher to determine if structures should be built
      const launcherX = LAUNCHER_X;
      const distanceFromLauncher = Math.abs(x - launcherX);

      // Build structures with higher probability for distant candlesticks
      // Near launcher: 40% chance, far from launcher: 80% chance
      const distanceFactor = Math.min(distanceFromLauncher / 800, 1);
      const structureProbability = 0.4 + distanceFactor * 0.4; // 40%-80%

      // Always build on some candlesticks, more likely on distant ones
      const shouldBuildStructure =
        index % 3 === 0 || Math.random() < structureProbability;

      if (shouldBuildStructure) {
        this.generateBlocksOnCandlestickTop(
          x,
          topY, // Top of the candlestick barrier
          barWidth, // Width for block placement
          candle, // Candle data for structure variation
          height // Barrier height for difficulty scaling
        );
      }

      // Removed: displayMinimalPriceIndicator call (cleaner UI)
    });

    // Each level has its own walls, so the breakout is armed afresh.
    this.armBreakout();

    // Update total enemies count
    this.totalEnemiesInLevel = this.enemiesRemaining;

    // Update HUD with new enemy count
    this.updateHUD();

    //console.log(`✅ Generated ${candlesticks.length} candlestick barriers with variable heights and ${this.enemiesRemaining} enemies`);
  }

  /**
   * Create a candlestick barrier with height based on price volatility
   * @param {number} x - X position
   * @param {number} groundY - Ground Y position
   * @param {object} candle - OHLC candle data
   * @param {number} barWidth - Width of the barrier
   * @returns {object} Barrier data with sprite and topY position
   */
  createCandlestickBarrier(x, groundY, candle, barWidth) {
    // Calculate height based on high-low range
    const priceRange = candle.high - candle.low;
    const maxRange = this.getMaxPriceRangeForLevel();
    // Six steps of 50px, not three. Barrier height is the one place a
    // player can see that one level's market differed from another's, and
    // with only three possible heights every level looked alike. Six doubles
    // the vocabulary without changing the block size the whole level is
    // built on.
    const MIN_HEIGHT = 50; // one block
    const MAX_HEIGHT = 300; // six blocks

    const scaledHeight = Math.max(
      MIN_HEIGHT,
      Math.min(MAX_HEIGHT, (priceRange / maxRange) * MAX_HEIGHT)
    );

    // Determine color based on bull/bear market
    const candleType =
      candle.close >= candle.open ? "green-candle" : "red-candle";

    // Calculate number of blocks needed (each block is 50px)
    const blockSize = 50;
    const numBlocks = Math.ceil(scaledHeight / blockSize);

    // Create container for candlestick blocks
    const candlestickContainer = this.add.container(x, 0);

    // Create stacked blocks
    const candlestickBlocks = [];
    for (let i = 0; i < numBlocks; i++) {
      const blockY = groundY - i * blockSize - blockSize / 2;
      const block = this.add.image(x, blockY, candleType); // Use absolute position for physics
      block.setDisplaySize(barWidth, blockSize);

      // Add to candlesticks physics group for collision detection
      this.candlesticks.add(block);
      block.body.setSize(barWidth, blockSize);

      candlestickBlocks.push(block);
    }

    // Store references for cleanup
    this.candlestickSprites.push({
      container: candlestickContainer,
      blocks: candlestickBlocks,
      data: candle,
      height: numBlocks * blockSize,
    });

    // Return barrier info and top position for block placement
    return {
      barrier: candlestickContainer,
      topY: groundY - numBlocks * blockSize,
      height: numBlocks * blockSize,
    };
  }

  /**
   * Get maximum price range for the current level (for height scaling)
   * @returns {number} Maximum price range in the current level
   */
  getMaxPriceRangeForLevel() {
    const levelData = this.candlestickData[this.currentLevel];
    if (!levelData || !levelData.candlesticks.length) return 1;

    return Math.max(...levelData.candlesticks.map((c) => c.high - c.low));
  }

  /**
   * Generate blocks on top of a candlestick barrier with distance-based enemy stacking
   * @param {number} x - X position
   * @param {number} topY - Top Y position of the candlestick barrier
   * @param {number} width - Width for block placement
   * @param {object} candle - Candle data for structure variation
   * @param {number} barrierHeight - Height of the barrier for difficulty scaling
   */
  generateBlocksOnCandlestickTop(x, topY, width, candle, _barrierHeight) {
    // Determine structure complexity based on barrier height and candle volatility
    const priceRange = candle.high - candle.low;
    const maxRange = this.getMaxPriceRangeForLevel();
    const volatilityFactor = priceRange / maxRange;

    // Use the same width as barrier blocks for consistency (passed as 'width' parameter = 30px)
    const blockWidth = width; // Use barrier width (30px) instead of fixed 25px
    const blockHeight = 20;

    // Calculate distance from launcher for difficulty scaling
    const launcherX = LAUNCHER_X; // Launcher position
    const distanceFromLauncher = Math.abs(x - launcherX);
    const maxDistance = 1000; // Maximum expected distance across level
    const distanceFactor = Math.min(distanceFromLauncher / maxDistance, 1);

    // Determine stack height based on volatility AND distance from launcher
    // Near launcher: 2-3 elements, farther: 4-7 elements
    const baseStackHeight = Math.floor(2 + volatilityFactor * 2); // 2-4 base
    const distanceBonus = Math.floor(distanceFactor * 3); // 0-3 additional elements
    const stackHeight = Math.min(baseStackHeight + distanceBonus, 7); // Cap at 7 elements

    // Calculate enemy density - significantly more enemies farther from launcher
    const baseEnemyChance = 0.3; // 30% base chance
    const distanceEnemyBonus = distanceFactor * 0.4; // Up to 40% additional chance
    const enemyDensity = Math.min(baseEnemyChance + distanceEnemyBonus, 0.8); // Cap at 80%

    let _enemiesCreated = 0;
    let _blocksCreated = 0;

    // Create stack with smart enemy/block distribution
    for (let layer = 0; layer < stackHeight; layer++) {
      const elementY = topY - layer * blockHeight - blockHeight / 2;

      // Layer 0 (bottom) is always a block for stability
      if (layer === 0) {
        this.createDestructibleBlock(
          x,
          elementY,
          blockWidth,
          blockHeight,
          layer
        );
        _blocksCreated++;
        continue;
      }

      // For other layers, decide based on distance and random chance
      const shouldCreateEnemy = Math.random() < enemyDensity;

      if (shouldCreateEnemy) {
        // Create enemy
        this.createEnemy(x, elementY);
        _enemiesCreated++;
      } else {
        // Create block
        this.createDestructibleBlock(
          x,
          elementY,
          blockWidth,
          blockHeight,
          layer
        );
        _blocksCreated++;
      }
    }
  }

  /**
   * Create a destructible block sprite with physics
   * @param {number} x - X position
   * @param {number} y - Y position
   * @param {number} width - Block width
   * @param {number} height - Block height
   * @param {number} layer - Layer index for color variation
   */
  createDestructibleBlock(x, y, width, height, _layer) {
    // Randomly select between dest and dest2 sprites
    const blockSprites = ["dest-block", "dest2-block"];
    const randomSprite =
      blockSprites[Math.floor(Math.random() * blockSprites.length)];

    // Create block sprite using the randomly selected sprite
    const block = this.add.image(x, y, randomSprite);

    // Scale to match the barrier width (use width parameter instead of fixed 50px)
    // This ensures destructible blocks match the candlestick barrier size (30px)
    block.setDisplaySize(width, height);

    // Add to physics group manually
    this.physics.add.existing(block, true); // true makes it static/immovable
    this.blocks.add(block);

    // Set physics body size to match the scaled sprite
    block.body.setSize(width, height);

    return block;
  }

  /**
   * Create an enemy sprite with basic properties
   * @param {number} x - X position
   * @param {number} y - Y position
   */
  createEnemy(x, y) {
    // Randomly select one of the 4 enemy variants
    const enemyVariants = [
      "enemy-var1",
      "enemy-var2",
      "enemy-var3",
      "enemy-var4",
    ];
    const randomVariant =
      enemyVariants[Math.floor(Math.random() * enemyVariants.length)];

    // Create enemy sprite using the randomly selected variant
    const enemy = this.add.sprite(x, y, randomVariant);

    // Scale the enemy sprite to appropriate size
    enemy.setScale(0.8); // Increased from 0.6 to 0.8 for better visibility

    // Add to physics group manually
    this.physics.add.existing(enemy);
    this.enemies.add(enemy);

    // Set collision body size to match the scaled sprite dimensions
    // Since the sprite is scaled to 0.8, the effective size is 40x40px
    enemy.body.setSize(40, 40);
    enemy.body.setOffset(5, 5); // Center the collision body on the sprite

    // Make enemies immovable so they don't fall or move around
    enemy.body.setImmovable(true);
    enemy.body.moves = false; // Completely disable physics movement

    // Add basic AI properties
    enemy.shouldMove = false; // Static positioning - no movement
    enemy.moveDirection = Math.random() > 0.5 ? 1 : -1; // Random initial direction (unused)
    enemy.moveSpeed = 0; // No movement speed

    // Remove physics properties that would cause movement
    // enemy.body.setBounce(0.2); // Removed - don't want bouncing
    // enemy.body.setCollideWorldBounds(true); // Removed - not needed for static enemies

    // Store the variant type for potential future use
    enemy.variantType = randomVariant;

    // Increment enemy counter
    this.enemiesRemaining++;

    return enemy;
  }

  /**
   * Create rocket launcher system
   */
  createLauncher() {
    /*
     * Two pieces, per the design: a chassis that stays put and a barrel that
     * turns. It used to be one sprite rotated whole, so aiming tipped the
     * wheels off the ground - and the barrel's angle, which the design calls
     * the primary aim feedback, was buried in a rotating machine.
     */
    const BASE_W = 132;
    const BASE_H = 92;

    // Where the barrel pivots, measured in the base art: 64 across, 42 up.
    const PIVOT_X = 64;
    const PIVOT_Y = BASE_H - 42;

    this.launcherBase = this.add
      .image(LAUNCHER_X, this.groundY, "launcher-base")
      .setOrigin(0.5, 1);

    const left = LAUNCHER_X - BASE_W / 2;

    this.launcher = this.add
      .image(left + PIVOT_X, this.groundY - BASE_H + PIVOT_Y, "launcher-barrel")
      // Pivot at the barrel's own back end, which is what sits on the mount.
      .setOrigin(0, 1);

    // Behind the barrel, so the muzzle reads as coming out of the machine.
    this.launcherBase.setDepth(4);
    this.launcher.setDepth(5);

    this.updateLauncherRotation();
  }

  /**
   * Update launcher rotation based on launch angle
   */
  updateLauncherRotation() {
    // (45 - 20 = 25 degrees, adding 20 degrees clockwise from previous position)
    // The art points along positive x, so the aim angle is the rotation with
    // no correction: no sprite-orientation offset to keep in step any more.
    this.launcher.setRotation(Phaser.Math.DegToRad(-this.launchAngle));
  }

  /**
   * Push the current angle/power out to the HUD bridge.
   */
  updateControlDisplay() {
    this.hudState.angle = this.launchAngle;
    this.hudState.power = this.launchPower;
    this.publishHud();
  }

  /**
   * Launch rocket with current angle and power settings
   */
  launchRocket() {
    // Validate launch conditions
    if (!this.canLaunch) {
      //console.log("⚠️ Cannot launch - rocket already in flight");
      return;
    }

    if (this.launchPower <= 0) {
      //console.log("⚠️ Cannot launch - power must be greater than 0");
      return;
    }

    // Clear trajectory preview during flight
    this.trajectoryGraphics.clear();

    // Calculate launch velocity components
    const angleRad = Phaser.Math.DegToRad(this.launchAngle);
    const speed = (this.launchPower / 100) * this.maxLaunchSpeed;

    const velocityX = Math.cos(angleRad) * speed;
    const velocityY = -Math.sin(angleRad) * speed; // Negative for upward movement

    // Create rocket sprite at launcher position
    const rocket = this.rockets.create(
      // Out of the muzzle, not out of the pivot: the barrel is 58 long, and
      // spawning at 30 put the rocket inside the machine that fired it.
      this.launcher.x + Math.cos(angleRad) * 58,
      this.launcher.y - Math.sin(angleRad) * 58,
      "rocket"
    );

    // Set rocket physics properties
    rocket.setVelocity(velocityX, velocityY);

    // A wide spread means an expensive, unsettled market, and the rocket feels
    // it as a sideways push. Signalled on the HUD before the shot is taken -
    // an unseen force acting on your aim reads as the game cheating.
    rocket.setAccelerationX(this.marketWindAcceleration());
    // No quarter-turn correction: the art points right and atan2 measures from
    // the positive x axis, so the velocity angle is the rotation.
    rocket.setRotation(angleRad);
    rocket.setBounce(0.1); // Reduced bounce for more realistic physics
    // Note: No setDrag() here - air resistance is handled in updateRocketPhysics()
    rocket.setScale(1.0); // Use actual rocket image size (50px)

    // Fix rocket hitbox - reduce size and center it to match actual texture
    rocket.body.setSize(35, 35); // Reduce from default 50x50 to 35x35 to match actual texture
    rocket.body.setOffset(7.5, 7.5); // Center the smaller hitbox on the 50x50 sprite

    // Add custom properties for enhanced physics
    rocket.initialVelocityX = velocityX;
    rocket.initialVelocityY = velocityY;
    rocket.trailPoints = [];
    rocket.explosionTriggered = false;

    // Disable launching until rocket is destroyed
    this.canLaunch = false;

    // Reset timer when rocket is launched
    if (this.keyboardTimerController) {
      this.keyboardTimerController.stopTimer();
    }

    // Increment both total attempts and current level attempts
    this.launchAttempts++;
    this.currentLevelAttempts++;

    // Update HUD to reflect new attempt counts
    this.updateHUD();
  }

  /**
   * Create trajectory prediction system
   */
  createTrajectorySystem() {
    // Create graphics object for trajectory line
    this.trajectoryGraphics = this.add.graphics();

    // Initial trajectory calculation
    this.updateTrajectory();

    //console.log("📈 Trajectory prediction system created");
  }

  /**
   * Calculate and update trajectory preview
   */
  updateTrajectory() {
    if (!this.trajectoryGraphics || !this.showTrajectory) {
      return;
    }

    // Clear previous trajectory
    this.trajectoryGraphics.clear();

    // Calculate trajectory physics
    const trajectoryPoints = this.calculateTrajectoryPoints();

    if (trajectoryPoints.length > 0) {
      this.renderTrajectoryLine(trajectoryPoints);
    }
  }

  /**
   * Show trajectory temporarily when adjusting sliders
   */
  showTemporaryTrajectory() {
    // Clear any existing timer
    if (this.trajectoryTimer) {
      this.trajectoryTimer.destroy();
    }

    // Show trajectory immediately
    this.updateTrajectory();

    // Set timer to hide trajectory after delay
    this.trajectoryTimer = this.time.delayedCall(
      this.trajectoryDisplayTime,
      () => {
        this.trajectoryGraphics.clear();
        this.trajectoryTimer = null;
      }
    );
  }

  /**
   * Calculate parabolic trajectory points (limited to 75% of full path)
   */
  calculateTrajectoryPoints() {
    const points = [];

    // Initial conditions
    const angleRad = Phaser.Math.DegToRad(this.launchAngle);
    const speed = (this.launchPower / 100) * this.maxLaunchSpeed;

    // Initial velocity components
    const v0x = Math.cos(angleRad) * speed;
    const v0y = -Math.sin(angleRad) * speed; // Negative for upward movement

    // Starting position (from launcher)
    const startX = this.launcher.x + Math.cos(angleRad) * 30;
    const startY = this.launcher.y - Math.sin(angleRad) * 30;

    // Calculate trajectory points over time
    const timeStep = 0.05; // 50ms intervals
    const maxTime = 5.0; // 5 seconds maximum

    for (let t = 0; t <= maxTime; t += timeStep) {
      // Physics equations: x = x0 + v0x*t, y = y0 + v0y*t + 0.5*g*t^2
      const x = startX + v0x * t;
      const y = startY + v0y * t + 0.5 * this.gravity * t * t;

      // Stop calculating if trajectory goes below ground or off screen
      if (y >= this.groundY || x > 1200 || x < 0) {
        break;
      }

      // The preview shows the first arc only - where the shot first meets
      // something solid. It deliberately does not predict the bounce that
      // follows, because working that out is the game.
      if (this.trajectoryHitsBarrier(x, y)) {
        break;
      }

      points.push({ x, y });
    }

    this.trajectoryPoints = points;
    return points;
  }

  /**
   * Is this point inside a standing candle barrier?
   *
   * Used only by the aim preview, so it tests the drawn rectangles directly
   * rather than going through the physics engine - the preview runs while
   * nothing is moving and has no body of its own to collide with.
   *
   * @param {number} x world x
   * @param {number} y world y
   * @returns {boolean}
   */
  trajectoryHitsBarrier(x, y) {
    if (!this.candlesticks) return false;

    return this.candlesticks.getChildren().some((block) => {
      if (!block.active) return false;
      const halfWidth = block.displayWidth / 2;
      const halfHeight = block.displayHeight / 2;
      return (
        x >= block.x - halfWidth &&
        x <= block.x + halfWidth &&
        y >= block.y - halfHeight &&
        y <= block.y + halfHeight
      );
    });
  }

  /**
   * Render trajectory preview line
   */
  renderTrajectoryLine(points) {
    if (points.length < 2) return;

    // A dotted arc, spaced by distance rather than by time.
    //
    // Sampling every simulation step bunches marks up where the shot is slow
    // and spreads them where it is fast, so the guide is densest exactly where
    // it says least. Stepping a fixed number of pixels along the path gives an
    // even row of marks that reads as one arc.
    //
    // The design card showed five dots as a sample of the treatment, not as a
    // count: five is too sparse to show the curve.
    const SPACING = 26;
    const NEAR_SIZE = 9;
    const FAR_SIZE = 4;

    // Total path length, so size and fade can be a fraction of the whole
    // rather than of an arbitrary point count.
    let total = 0;
    for (let i = 1; i < points.length; i++) {
      total += Phaser.Math.Distance.BetweenPoints(points[i - 1], points[i]);
    }
    if (total <= 0) return;

    let walked = 0;
    let sinceLast = SPACING; // draw one at the launcher end straight away

    for (let i = 1; i < points.length; i++) {
      const step = Phaser.Math.Distance.BetweenPoints(points[i - 1], points[i]);
      walked += step;
      sinceLast += step;

      if (sinceLast < SPACING) continue;
      sinceLast = 0;

      // Nearest marks are biggest and brightest; the tail thins out so the
      // eye follows the arc outward instead of reading it as a wall.
      const t = walked / total;
      const size = Phaser.Math.Linear(NEAR_SIZE, FAR_SIZE, t);
      const alpha = Phaser.Math.Linear(0.95, 0.18, t);

      const point = points[i];
      this.trajectoryGraphics.fillStyle(RC_YELLOW, alpha);
      this.trajectoryGraphics.fillRect(
        point.x - size / 2,
        point.y - size / 2,
        size,
        size
      );
    }
  }

  // Collision callback functions
  onRocketHitGround(rocket, _ground) {
    //console.log("💥 Rocket hit ground");
    this.triggerExplosion(rocket.x, rocket.y);

    // Clean up rocket trail graphics
    if (rocket.trailGraphics) {
      rocket.trailGraphics.destroy();
      rocket.trailGraphics = null;
    }
    rocket.trailPoints = []; // Clear trail points

    rocket.setActive(false).setVisible(false);
    rocket.destroy();
    this.canLaunch = true;
    this.updateHUD(); // Re-enable the LAUNCH control on the bezel
    this.checkLevelEndConditions(); // Check if this was the last attempt
  }

  /**
   * Handle rocket collision with candlestick barrier
   * @param {Phaser.GameObjects.Sprite} rocket
   * @param {Phaser.GameObjects.Sprite} candlestick
   */
  onRocketHitCandlestick(rocket, _candlestick) {
    //console.log("💥 Rocket hit candlestick");
    this.triggerExplosion(rocket.x, rocket.y);
    // candlestick.destroy(); // Make candlesticks destructible if desired

    // Clean up rocket trail graphics
    if (rocket.trailGraphics) {
      rocket.trailGraphics.destroy();
      rocket.trailGraphics = null;
    }
    rocket.trailPoints = []; // Clear trail points

    rocket.setActive(false).setVisible(false);
    rocket.destroy();
    this.canLaunch = true;
    this.updateHUD(); // Re-enable the LAUNCH control on the bezel
    this.checkLevelEndConditions();
  }

  /**
   * Handle rocket collision with a block
   * @param {Phaser.GameObjects.Sprite} rocket
   * @param {Phaser.GameObjects.Sprite} block
   */
  onRocketHitBlock(rocket, block) {
    //console.log("💥 Rocket hit block");
    this.triggerExplosion(rocket.x, rocket.y);
    block.destroy(); // Blocks are destructible
    this.score += 5; // Score for destroying a block
    this.updateHUD();

    // Clean up rocket trail graphics
    if (rocket.trailGraphics) {
      rocket.trailGraphics.destroy();
      rocket.trailGraphics = null;
    }
    rocket.trailPoints = []; // Clear trail points

    rocket.setActive(false).setVisible(false);
    rocket.destroy();
    this.canLaunch = true;
    this.checkLevelEndConditions();
  }

  /**
   * Handle rocket collision with an enemy
   * @param {Phaser.GameObjects.Sprite} rocket
   * @param {Phaser.GameObjects.Sprite} enemy
   */
  onRocketHitEnemy(rocket, enemy) {
    //console.log("💥 Rocket hit enemy");
    this.triggerExplosion(enemy.x, enemy.y); // Explode at enemy's position
    enemy.destroy();
    this.enemiesRemaining--;
    this.score += 10; // Score for hitting an enemy
    this.updateHUD();

    // Clean up rocket trail graphics
    if (rocket.trailGraphics) {
      rocket.trailGraphics.destroy();
      rocket.trailGraphics = null;
    }
    rocket.trailPoints = []; // Clear trail points

    rocket.setActive(false).setVisible(false);
    rocket.destroy();
    this.canLaunch = true;
    this.checkLevelEndConditions();
  }

  /**
   * Trigger explosion effect with damage calculation
   * @param {number} x
   * @param {number} y
   */
  triggerExplosion(x, y) {
    // Use the comprehensive explosion system
    this.createExplosion(x, y);
    this.handleExplosionDamage(x, y);
  }

  /**
   * Check level end conditions (all enemies defeated or out of attempts)
   */
  checkLevelEndConditions() {
    if (this.gameOver) return;

    if (this.enemiesRemaining <= 0) {
      this.completeLevel();
    } else if (
      this.currentLevelAttempts >= this.maxAttemptsPerLevel &&
      this.canLaunch
    ) {
      // Only fail level if player can launch again (meaning previous rocket finished)
      // and there are still enemies.
      this.levelFailed();
    }
  }

  /**
   * Destroy rocket with explosion effect
   */
  destroyRocket(rocket) {
    // Create explosion at rocket position
    this.createExplosion(rocket.x, rocket.y);

    // Check for explosion damage to nearby objects
    this.handleExplosionDamage(rocket.x, rocket.y);

    // Clean up rocket trail graphics
    if (rocket.trailGraphics) {
      rocket.trailGraphics.destroy();
      rocket.trailGraphics = null;
    }

    // Clear trail points
    rocket.trailPoints = [];

    // Destroy the rocket
    rocket.destroy();

    // Re-enable launching
    this.canLaunch = true;

    // Reset timer when rocket is destroyed
    if (this.keyboardTimerController) {
      this.keyboardTimerController.reset();
    }

    // Check if level failed after using all attempts
    if (this.currentLevelAttempts >= this.maxAttemptsPerLevel) {
      // Check if there are still enemies remaining
      const actualEnemiesRemaining = this.enemies.children.entries.length;
      if (this.enemiesRemaining > 0 || actualEnemiesRemaining > 0) {
        this.levelFailed();
        return;
      }
    }

    //console.log("💥 Rocket exploded - ready for next launch");
  }

  /**
   * Create visual explosion effect with particles
   */
  createExplosion(x, y) {
    // Create explosion circle that expands and fades
    // Yellow, not the purple this used to be: purple is not one of the five
    // colours this game is allowed to use, and it read as a different game.
    const explosionCircle = this.add.circle(x, y, 5, RC_YELLOW, 0.8);

    // Animate explosion expansion
    this.tweens.add({
      targets: explosionCircle,
      radius: this.explosionSize,
      alpha: 0,
      duration: 400,
      ease: "Power2",
      onComplete: () => {
        explosionCircle.destroy();
      },
    });

    // Create particle explosion effect
    const particles = this.add.particles(x, y, "rocket", {
      speed: { min: 80, max: 200 }, // Increased speed for larger explosion
      scale: { start: 0.4, end: 0 }, // Slightly larger particles
      tint: [RC_YELLOW, RC_RED, 0xffffff],
      lifespan: 500, // Longer lifespan for more impact
      quantity: 18, // More particles for better coverage
    });

    // Clean up particles after explosion
    this.time.delayedCall(500, () => {
      particles.destroy();
    });

    // Add stronger screen shake effect for larger explosion
    this.cameras.main.shake(300, 0.015);
  }

  /**
   * Handle explosion damage to nearby objects
   */
  handleExplosionDamage(explosionX, explosionY) {
    const explosionRadius = this.explosionSize;
    let enemiesDestroyed = 0;

    // Check damage to blocks
    this.blocks.children.entries.forEach((block) => {
      const distance = Phaser.Math.Distance.Between(
        explosionX,
        explosionY,
        block.x,
        block.y
      );

      if (distance <= explosionRadius) {
        this.destroyBlock(block);
      }
    });

    // Check damage to enemies
    this.enemies.children.entries.forEach((enemy) => {
      const distance = Phaser.Math.Distance.Between(
        explosionX,
        explosionY,
        enemy.x,
        enemy.y
      );

      if (distance <= explosionRadius) {
        this.destroyEnemy(enemy);
        this.score += 10;
        this.enemiesRemaining--;
        enemiesDestroyed++;
      }
    });

    // Update HUD if enemies were destroyed
    if (enemiesDestroyed > 0) {
      this.updateHUD();

      // Check if level is complete after explosion damage (verify both counters)
      const actualEnemiesRemaining = this.enemies.children.entries.length;
      if (this.enemiesRemaining <= 0 && actualEnemiesRemaining <= 0) {
        this.completeLevel();
      }
    }
  }

  /**
   * Destroy block with breaking effect
   */
  destroyBlock(block) {
    // Create breaking effect with small particles
    const particles = this.add.particles(block.x, block.y, "dest-block", {
      speed: { min: 30, max: 80 },
      scale: { start: 0.5, end: 0.1 },
      tint: RC_BLUE,
      lifespan: 200,
      quantity: 4,
    });

    // Clean up particles
    this.time.delayedCall(300, () => {
      particles.destroy();
    });

    block.destroy();
    //console.log("🧱 Block destroyed with breaking effect");
  }

  /**
   * Destroy enemy and update score
   */
  destroyEnemy(enemy) {
    // Play enemy destroy sound
    if (this.sounds.enemyDestroy) {
      this.sounds.enemyDestroy.play();
    }

    const x = enemy.x;
    const y = enemy.y;

    // Two frames of white where the enemy was, so a kill is unmistakable even
    // when several go at once. The flash is a separate sprite and the enemy
    // itself is removed immediately: the level-complete check counts live
    // enemies on the same frame, and holding one back to animate it would
    // make the last kill of a level fail to end it.
    const flash = this.add.image(x, y, "enemy-var1").setDepth(800);
    flash.setDisplaySize(enemy.displayWidth, enemy.displayHeight);
    flash.setTintFill(0xffffff);
    // Guarded: killing the last enemy of a level ends it, and the level
    // teardown can destroy this sprite before these fire.
    this.time.delayedCall(60, () => {
      if (flash.active) flash.clearTint();
    });
    this.time.delayedCall(120, () => {
      if (flash.active) flash.destroy();
    });

    enemy.destroy();

    const deathEffect = this.add.circle(x, y, 15, RC_RED, 0.6);

    this.tweens.add({
      targets: deathEffect,
      radius: 30,
      alpha: 0,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        deathEffect.destroy();
      },
    });

    this.showScorePopup(x, y, "+10");
  }

  /**
   * A number that rises from where it was earned and fades out.
   *
   * Anchored to a point in the world rather than to the frame, which is why
   * it stays drawn in the canvas while the rest of the readouts moved to
   * HTML. Yellow for a gain, red for anything taken away.
   *
   * @param {number} x world x
   * @param {number} y world y
   * @param {string} label e.g. "+10"
   */
  showScorePopup(x, y, label) {
    const gain = !label.startsWith("-");

    const text = this.add
      .text(x, y - 20, label, {
        fontFamily: PIXEL_FONT,
        fontSize: "18px",
        color: gain ? "#F6F740" : "#E94F37",
      })
      .setOrigin(0.5)
      .setDepth(900);

    // The hard offset shadow every surface in this design has, done as a
    // stroke because canvas text has no box to cast one from.
    text.setShadow(4, 4, "#14161A", 0, false, true);

    this.tweens.add({
      targets: text,
      y: y - 60,
      alpha: 0,
      duration: 700,
      ease: "Power2",
      onComplete: () => text.destroy(),
    });
  }

  /**
   * Handle level completion
   */
  completeLevel() {
    // Play level complete sound
    // No sting here. What used to play was the background track itself, a
    // second copy layered over the one already looping.

    // Double-check enemy count from actual enemies still in the scene
    const actualEnemiesRemaining = this.enemies.children.entries.length;

    // Don't complete if there were no enemies generated
    if (this.totalEnemiesInLevel === 0) {
      //console.log("⚠️ Level has no enemies - progressing to next level");
      this.nextLevel();
      return;
    }

    // Ensure all enemies are actually destroyed before completing (check both counters)
    if (this.enemiesRemaining > 0 || actualEnemiesRemaining > 0) {
      // Sync counters if they're out of sync
      if (this.enemiesRemaining !== actualEnemiesRemaining) {
        this.enemiesRemaining = actualEnemiesRemaining;
        this.updateHUD();
      }
      return;
    }

    // Add bonus score for level completion
    this.score += 50;

    // Add efficiency bonus for completing with fewer attempts
    const maxAttempts = 10;
    if (this.launchAttempts <= maxAttempts) {
      const efficiencyBonus = Math.max(
        0,
        (maxAttempts - this.launchAttempts) * 5
      );
      this.score += efficiencyBonus;
      //console.log(`✨ Efficiency bonus: +${efficiencyBonus} points`);
    }

    this.updateHUD();

    // Submit score to blockchain with verification
    this.submitScoreToBlockchainWithVerification();

    // Check if this was the final level
    if (this.currentLevel >= this.maxLevels - 1) {
      this.gameComplete();
      return;
    }

    // Progress to next level automatically
    this.nextLevel();
  }

  /**
   * Get total number of enemies that should be in the current level
   */
  getTotalEnemiesInLevel() {
    // Count enemies that were generated (this should be called after generation)
    return this.enemies.children.entries.length + this.enemiesRemaining;
  }

  /**
   * Progress to the next level
   */
  nextLevel() {
    this.currentLevel++;

    // Reset level attempts for new level
    this.currentLevelAttempts = 0;

    // Clear current level
    this.clearCandlesticks();

    // Generate new candlestick barriers for next level
    this.generateCandlestickBarriers();

    // Reset level state (will be set during generation)
    this.updateHUD();

    // Show level transition message
    this.showLevelTransition();
    
    // Continue background music (already playing)
  }

  /**
   * Show level transition message
   */
  showLevelTransition() {
    const levelData = this.candlestickData[this.currentLevel];

    // Create level transition overlay
    const overlay = this.add.rectangle(600, 300, 1200, 600, 0x000000, 0.7);

    // Level title
    const titleText = this.add
      .text(600, 250, `LEVEL ${this.currentLevel + 1}`, {
        fontSize: "54px", // Increased from 48px
        fill: "#ffffff",
        fontStyle: "bold",
        fontFamily: PIXEL_FONT,
      })
      .setOrigin(0.5);

    // Level name
    const nameText = this.add
      .text(600, 310, levelData.name, {
        fontSize: "28px", // Increased from 24px
        fill: "#ffaa00",
        fontFamily: PIXEL_FONT,
      })
      .setOrigin(0.5);

    // Difficulty
    const difficultyText = this.add
      .text(600, 350, `Difficulty: ${levelData.difficulty}`, {
        fontSize: "20px", // Increased from 18px
        fill: "#aaaaaa",
        fontFamily: PIXEL_FONT,
      })
      .setOrigin(0.5);

    // Fade out transition after 2 seconds
    this.time.delayedCall(2000, () => {
      this.tweens.add({
        targets: [overlay, titleText, nameText, difficultyText],
        alpha: 0,
        duration: 500,
        onComplete: () => {
          overlay.destroy();
          titleText.destroy();
          nameText.destroy();
          difficultyText.destroy();
        },
      });
    });
  }

  /**
   * Handle level failure when max attempts are exceeded
   */
  levelFailed() {
    // Check if this is the final level (level 7, index 6)
    if (this.currentLevel >= this.maxLevels - 1) {
      // Play game over sound
      if (this.sounds.gameOver) {
        this.sounds.gameOver.play();
      }

      // Final level failed - end the game
      this.gameOver = true;
      this.canLaunch = false;
      this.updateHUD();

      // Submit final score to blockchain before ending
      this.submitFinalScoreToBlockchain("game-failed");

      // Stop all sounds before transitioning
      this.sound.stopAll();
      
      // Transition to EndGameScene with failure data
      this.clearHud();
      this.scene.start("EndGameScene", {
        score: this.score,
        totalAttempts: this.launchAttempts,
        levelsCompleted: this.currentLevel, // Levels completed before failure
        reason: "failed",
      });
    } else {
      // Not final level - progress to next level despite failure
      // Add small penalty for failing a level (optional)
      // this.score = Math.max(0, this.score - 10);

      // Progress to next level
      this.nextLevel();
    }
  }

  /**
   * Handle game completion
   */
  gameComplete() {
    //console.log("🏆 GAME COMPLETED! All levels finished!");

    this.gameOver = true;
    this.canLaunch = false;
    this.updateHUD();

    // Play game over sound for victory
    if (this.sounds.gameOver) {
      this.sounds.gameOver.play();
    }

    // Submit final score to blockchain before ending
    this.submitFinalScoreToBlockchain("game-complete");

    // Stop all sounds before transitioning
    this.sound.stopAll();
    
    // Transition to EndGameScene with victory data
    this.clearHud();
      this.scene.start("EndGameScene", {
      score: this.score,
      totalAttempts: this.launchAttempts,
      levelsCompleted: this.maxLevels, // All levels completed
      reason: "completed",
    });
  }

  /**
   * Submit final score to blockchain with game completion status
   * @param {string} gameResult - "game-complete" or "game-failed"
   */
  async submitFinalScoreToBlockchain(gameResult) {
    if (!this.walletConnected || !this.web3Service) {
      //console.log("⚠️ Wallet not connected, skipping final score submission");
      return;
    }

    try {
      //console.log(`📝 Submitting FINAL score to blockchain: ${gameResult}...`);

      // Submit final score with game result indicator
      const _scoreResult = await this.web3Service.submitScore(
        `final-${gameResult}`, // Use special level identifier for final scores
        this.score
      );

      //console.log("✅ Final score submitted:", scoreResult.transactionHash);

      // Calculate final WICK reward based on total score and completion status
      const baseReward = Math.max(20, Math.floor(this.score / 50)); // Higher reward for final score
      const completionBonus = gameResult === "game-complete" ? 50 : 10; // Bonus for completing all levels
      const finalReward = baseReward + completionBonus;

      // Reward WICK tokens for final score
      const _rocketFuelResult = await this.web3Service.rewardFuel(finalReward);

      // Update balance
      this.loadWickBalance();

      // Show success message
      this.showBlockchainSuccessMessage(finalReward, "Final Score Saved!");
    } catch (error) {
      console.error("Failed to submit final score to blockchain:", error);
      this.showBlockchainErrorMessage(`Final score error: ${error.message}`);
    }
  }

  /**
   * Submit score to blockchain
   */
  async submitScoreToBlockchain() {
    // Enhanced wallet validation
    if (
      !this.walletConnected ||
      !this.web3Service ||
      !this.walletManager?.isReadyForGame()
    ) {
      //console.log("⚠️ Wallet not ready, skipping blockchain submission");
      this.showWalletNotReadyMessage();
      return;
    }

    try {
      //console.log("📝 Submitting score to blockchain...");

      // Submit score
      const _scoreResult = await this.web3Service.submitScore(
        this.currentLevel + 1,
        this.score
      );

      //console.log("✅ Score submitted:", scoreResult.transactionHash);

      // Calculate FUEL reward based on level and score
      const fuelReward = Math.max(
        10,
        (this.currentLevel + 1) * 5 + Math.floor(this.score / 100)
      );

      // Reward FUEL tokens
      const _fuelResult = await this.web3Service.rewardFuel(fuelReward);

      //console.log("🎁 FUEL reward:", fuelResult.transactionHash);

      // Update balance
      this.loadFuelBalance();

      // Refresh the game leaderboard if it's visible
      if (window.refreshGameLeaderboard) {
        window.refreshGameLeaderboard();
      }

      // Show success message
      this.showBlockchainSuccessMessage(fuelReward);
    } catch (error) {
      console.error("Failed to submit to blockchain:", error);
      this.showBlockchainErrorMessage(error.message);
    }
  }

  /**
   * Comprehensive blockchain storage verification system
   */
  async verifyGameStoredOnBlockchain() {
    if (!this.walletConnected || !this.web3Service) {
      //console.log("⚠️ Cannot verify blockchain storage - wallet not connected");
      return false;
    }

    try {
      //console.log("🔍 Verifying all game data stored on blockchain...");

      // Check recent transactions for this player
      const playerScores = await this.web3Service.getPlayerScores();

      if (
        !playerScores ||
        !playerScores.results ||
        playerScores.results.length === 0
      ) {
        console.warn("⚠️ No game data found on blockchain for this player");
        return false;
      }

      // Check if recent games are present (last 5 minutes)
      const fiveMinutesAgo = Date.now() - 5 * 60 * 1000;
      const recentGames = playerScores.results.filter(
        (result) => new Date(result.timestamp).getTime() > fiveMinutesAgo
      );

      if (recentGames.length === 0) {
        console.warn("⚠️ No recent games found on blockchain");
        return false;
      }

      //console.log(`✅ Found ${recentGames.length} recent games on blockchain`);
      return true;
    } catch (error) {
      console.error("❌ Error verifying blockchain storage:", error);
      return false;
    }
  }

  /**
   * Enhanced blockchain submission with verification
   */
  async submitScoreToBlockchainWithVerification() {
    if (!this.walletConnected || !this.web3Service) {
      //console.log("⚠️ Wallet not connected, skipping blockchain submission");
      return;
    }

    try {
      //console.log("📝 Submitting score to blockchain with verification...");

      // Submit score first
      await this.submitScoreToBlockchain();

      // Wait for transaction to process
      await new Promise((resolve) => setTimeout(resolve, 3000));

      // Verify storage
      const verified = await this.verifyGameStoredOnBlockchain();

      if (verified) {
        //console.log("✅ Blockchain storage verified successfully");
        this.showBlockchainSuccessMessage(
          0,
          "Game data verified on blockchain!"
        );
      } else {
        console.warn("⚠️ Blockchain verification failed - attempting retry");
        await this.retryBlockchainSubmission();
      }
    } catch (error) {
      console.error("❌ Error in verified blockchain submission:", error);
      this.showBlockchainErrorMessage("Verification failed: " + error.message);
    }
  }

  /**
   * Retry blockchain submission with improved error handling
   */
  async retryBlockchainSubmission(attempt = 1) {
    const maxRetries = 3;

    if (attempt > maxRetries) {
      console.error("❌ Max retries exceeded for blockchain submission");
      this.showBlockchainErrorMessage(
        "Failed to store game data after multiple attempts"
      );
      return;
    }

    try {
      //console.log(`🔄 Blockchain retry attempt ${attempt}/${maxRetries}`);

      // Exponential backoff
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise((resolve) => setTimeout(resolve, delay));

      // Retry submission
      await this.submitScoreToBlockchain();

      // Verify the retry
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const verified = await this.verifyGameStoredOnBlockchain();

      if (verified) {
        //console.log(`✅ Blockchain retry ${attempt} successful`);
        this.showBlockchainSuccessMessage(
          0,
          `Game saved on attempt ${attempt}`
        );
      } else {
        throw new Error(`Retry ${attempt} verification failed`);
      }
    } catch (error) {
      console.error(`❌ Blockchain retry ${attempt} failed:`, error);
      return await this.retryBlockchainSubmission(attempt + 1);
    }
  }

  /**
   * Show wallet not ready message
   */
  showWalletNotReadyMessage() {
    // Determine the specific issue
    let message = "⚠️ Score Not Saved";
    let details = "";

    if (!this.walletConnected) {
      details = "Wallet not connected";
    } else if (!this.walletManager?.isCorrectNetwork) {
      details = "Wrong network";
    } else if (!this.walletConnected) {
      details = "Wallet not authenticated";
    } else {
      details = "Wallet not ready";
    }

    const messageText = this.add
      .text(600, 300, `${message}\n${details}`, {
        fontFamily: PIXEL_FONT,
        fontSize: "13px",
        color: "#E94F37",
        align: "center",
        lineSpacing: 10,
      })
      .setOrigin(0.5)
      .setAlpha(0);

    // Animate message
    this.tweens.add({
      targets: messageText,
      alpha: 1,
      duration: 500,
      yoyo: true,
      hold: 2000,
      onComplete: () => messageText.destroy(),
    });
  }

  /**
   * Load FUEL balance from blockchain
   */
  async loadFuelBalance() {
    if (!this.walletConnected || !this.web3Service) return;

    try {
      this.fuelBalance = await this.web3Service.getFuelBalance();
      //console.log("💰 FUEL balance loaded:", this.fuelBalance);
    } catch (error) {
      console.error("Failed to load FUEL balance:", error);
    }
  }

  /**
   * Cleanup method called when scene shuts down
   */
  shutdown() {
    // Clean up keyboard timer controller
    if (this.keyboardTimerController) {
      this.keyboardTimerController.cleanup();
      this.keyboardTimerController = null;
    }

    // Clean up any remaining timers
    if (this.trajectoryTimer) {
      this.trajectoryTimer.destroy();
      this.trajectoryTimer = null;
    }

    //console.log("✅ GameScene shutdown - cleanup completed");
  }

  /**
   * Main game loop update method
   * @param {number} time - Current time
   * @param {number} delta - Time since last frame (ms)
   */
  update(time, delta) {
    if (this.gameOver) {
      return;
    }

    // Update keyboard timer controller (if it needs per-frame updates)
    if (this.keyboardTimerController && this.keyboardTimerController.update) {
      this.keyboardTimerController.update(delta);
    }

    // Push the auto-launch countdown to the HUD bridge, but only when the
    // number on screen would actually change - the timer itself still ticks
    // every frame, publishing every frame would not.
    const remaining = this.keyboardTimerController
      ? this.keyboardTimerController.getRemainingSeconds()
      : null;
    if (remaining !== this.hudState.autoLaunchSeconds) {
      this.hudState.autoLaunchSeconds = remaining;
      this.publishHud();
    }

    // Update rocket trail effects and enhanced physics
    this.rockets.children.entries.forEach((rocket) => {
      if (rocket.active) {
        this.updateRocketTrail(rocket);
        this.updateRocketPhysics(rocket);

        // Check if rocket has left the game bounds and destroy it
        // Allow more vertical space for steep angles, but strict horizontal bounds
        if (
          rocket.x < -100 ||
          rocket.x > 1300 ||
          rocket.y < -200 ||
          rocket.y > 750
        ) {
          this.destroyRocket(rocket);
        }
      }
    });

    // Update enemy AI
    this.updateEnemyAI();
  }

  /**
   * Update simple enemy AI movement
   */
  updateEnemyAI() {
    this.enemies.children.entries.forEach((enemy) => {
      // Skip AI movement if enemy shouldn't move (static positioning)
      if (!enemy.shouldMove || !enemy.body || enemy.body.moves === false) {
        return;
      }

      // Simple left-right movement (only when enabled)
      if (enemy.moveDirection) {
        enemy.body.setVelocityX(enemy.moveDirection * enemy.moveSpeed);

        // Change direction if hitting world bounds or randomly
        if (enemy.x <= 50 || enemy.x >= 1150 || Math.random() < 0.01) {
          enemy.moveDirection *= -1;
        }
      }
    });
  }

  /**
   * Update rocket trail visual effect
   */
  updateRocketTrail(rocket) {
    // Calculate the rocket's tail position (opposite to the nose direction)
    // The rocket sprite is 20x60px.
    // The rocket's visual rotation is set in updateRocketPhysics.
    const rocketLength = 30; // Half the rocket height (60px / 2)

    // Determine the angle of the rocket's tail based on its current velocity.
    // This is 180 degrees (Math.PI) opposite to the direction of movement.
    const angleOfVelocity = Math.atan2(
      rocket.body.velocity.y,
      rocket.body.velocity.x
    );
    const tailAngle = angleOfVelocity + Math.PI; // Pointing directly opposite to velocity

    const tailX = rocket.x + Math.cos(tailAngle) * rocketLength;
    const tailY = rocket.y + Math.sin(tailAngle) * rocketLength;

    // Add tail position to trail (not center position)
    if (!rocket.trailPoints) {
      rocket.trailPoints = [];
    }
    rocket.trailPoints.push({ x: tailX, y: tailY, time: this.time.now });

    // Remove old trail points (keep last 20 points or 1 second)
    const maxTrailTime = 1000; // 1 second
    rocket.trailPoints = rocket.trailPoints.filter((point) => {
      return this.time.now - point.time < maxTrailTime;
    });

    // Limit trail length
    if (rocket.trailPoints.length > 20) {
      rocket.trailPoints.shift();
    }

    // Draw trail if we have at least 2 points
    if (rocket.trailPoints.length >= 2 && !rocket.trailGraphics) {
      rocket.trailGraphics = this.add.graphics();
    }

    if (rocket.trailGraphics && rocket.trailPoints.length >= 2) {
      rocket.trailGraphics.clear();

      // Draw trail as connected line segments with fading alpha
      for (let i = 1; i < rocket.trailPoints.length; i++) {
        const point1 = rocket.trailPoints[i - 1];
        const point2 = rocket.trailPoints[i];

        // Calculate alpha based on age (newer = brighter)
        const age = (this.time.now - point2.time) / 1000; // age in seconds
        const alpha = Math.max(0, 1 - age);

        // Set line style with fading effect
        rocket.trailGraphics.lineStyle(3, RC_YELLOW, alpha * 0.85);
        rocket.trailGraphics.beginPath();
        rocket.trailGraphics.moveTo(point1.x, point1.y);
        rocket.trailGraphics.lineTo(point2.x, point2.y);
        rocket.trailGraphics.strokePath();
      }
    }
  }

  /**
   * Update rocket physics with enhanced air resistance
   */
  updateRocketPhysics(rocket) {
    // Apply air resistance to rocket velocity
    rocket.body.velocity.x *= this.airResistance;
    rocket.body.velocity.y *= this.airResistance;

    // No need to apply gravity manually - world gravity handles this

    // Update rocket rotation to match velocity direction
    // Add π/2 (90 degrees)     because the rocket sprite is created vertically
    // and we want it to point in the direction of travel
    const angle =
      Math.atan2(rocket.body.velocity.y, rocket.body.velocity.x);
    rocket.setRotation(angle);

    // Add slight scaling effect based on speed for visual enhancement
    const speed = Math.sqrt(
      rocket.body.velocity.x ** 2 + rocket.body.velocity.y ** 2
    );
    const scale = Math.max(0.8, Math.min(1.4, 1 + speed / 1000));
    rocket.setScale(scale);
  }

  /**
   * Handle manual game ending by player
   */
  endGameManually() {
    console.log("🔚 Player manually ended the game");

    // Play game over sound
    if (this.sounds.gameOver) {
      this.sounds.gameOver.play();
    }

    // Set game over state
    this.gameOver = true;
    this.canLaunch = false;
    this.updateHUD();

    // Submit final score to blockchain before ending
    this.submitFinalScoreToBlockchain("game-ended-manually");

    // Stop all sounds before transitioning
    this.sound.stopAll();
    
    // Transition to EndGameScene with manual end data
    this.clearHud();
      this.scene.start("EndGameScene", {
      score: this.score,
      totalAttempts: this.launchAttempts,
      levelsCompleted: this.currentLevel, // Levels completed before manual end
      reason: "ended-manually",
    });
  }
} // End of GameScene class
