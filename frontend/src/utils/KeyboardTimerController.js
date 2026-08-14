/**
 * KeyboardTimerController - Handles keyboard controls and timer lock system
 * Provides abstracted keyboard input handling and launch timer management
 */
export class KeyboardTimerController {
  constructor(scene, config = {}) {
    this.scene = scene;

    // Configuration
    this.angleMin = config.angleMin || 15;
    this.angleMax = config.angleMax || 75;
    this.powerMin = config.powerMin || 0;
    this.powerMax = config.powerMax || 100;
    this.angleStepSize = config.angleStepSize || 2;
    this.powerStepSize = config.powerStepSize || 5;
    this.timerDuration = config.timerDuration || 8000; // 8 seconds

    // State
    this.isTimerActive = false;
    this.timerStartTime = 0;
    this.hasInteracted = false;

    // Callbacks
    this.onAngleChange = config.onAngleChange || (() => {});
    this.onPowerChange = config.onPowerChange || (() => {});
    this.onAutoLaunch = config.onAutoLaunch || (() => {});

    // Initialize
    this.setupKeyboardControls();

    //console.log("✅ KeyboardTimerController initialized");
  }

  /**
   * Set up keyboard input handling
   */
  setupKeyboardControls() {
    // Create keyboard input cursors for arrow keys and WASD
    this.keys = this.scene.input.keyboard.addKeys({
      W: Phaser.Input.Keyboard.KeyCodes.W,
      A: Phaser.Input.Keyboard.KeyCodes.A,
      S: Phaser.Input.Keyboard.KeyCodes.S,
      D: Phaser.Input.Keyboard.KeyCodes.D,
      SPACE: Phaser.Input.Keyboard.KeyCodes.SPACE,
    });

    // Set up key press events with rate limiting
    this.setupKeyPressEvents();

    //console.log( "⌨️ Keyboard controls configured: W/S for power, A/D for angle (A=right, D=left), SPACE for launch");
  }

  /**
   * Set up key press events with proper rate limiting
   */
  setupKeyPressEvents() {
    // Rate limiting variables
    this.lastKeyPressTime = {
      W: 0,
      A: 0,
      S: 0,
      D: 0,
      SPACE: 0,
    };
    this.keyRepeatDelay = 150; // milliseconds between key repeats

    // Store original scene update if it exists
    this.originalUpdate = this.scene.update
      ? this.scene.update.bind(this.scene)
      : null;

    // Override scene update to handle our keyboard logic
    this.scene.update = (time, delta) => {
      // Call original update first
      if (this.originalUpdate) {
        this.originalUpdate(time, delta);
      }

      // Handle our keyboard input
      this.handleKeyboardInput(time);

      // Update timer
      this.updateTimer(time);
    };
  }

  /**
   * Handle keyboard input with rate limiting
   */
  handleKeyboardInput(time) {
    // Check if we can launch (not in timer or rocket not in flight)
    const canInteract = this.scene.canLaunch && !this.scene.gameOver;

    if (!canInteract) return;

    // Handle power controls (W/S) - W increases, S decreases
    if (
      this.keys.W.isDown &&
      time - this.lastKeyPressTime.W > this.keyRepeatDelay
    ) {
      this.adjustPower(this.powerStepSize);
      this.lastKeyPressTime.W = time;
      this.startTimer();
    }

    if (
      this.keys.S.isDown &&
      time - this.lastKeyPressTime.S > this.keyRepeatDelay
    ) {
      this.adjustPower(-this.powerStepSize);
      this.lastKeyPressTime.S = time;
      this.startTimer();
    }

    // Handle angle controls (A/D) - A increases (right), D decreases (left)
    if (
      this.keys.A.isDown &&
      time - this.lastKeyPressTime.A > this.keyRepeatDelay
    ) {
      this.adjustAngle(this.angleStepSize);
      this.lastKeyPressTime.A = time;
      this.startTimer();
    }

    if (
      this.keys.D.isDown &&
      time - this.lastKeyPressTime.D > this.keyRepeatDelay
    ) {
      this.adjustAngle(-this.angleStepSize);
      this.lastKeyPressTime.D = time;
      this.startTimer();
    }

    // Handle launch (SPACE)
    if (
      this.keys.SPACE.isDown &&
      time - this.lastKeyPressTime.SPACE > this.keyRepeatDelay
    ) {
      this.manualLaunch();
      this.lastKeyPressTime.SPACE = time;
    }
  }

  /**
   * Adjust angle value within bounds
   */
  adjustAngle(delta) {
    const currentAngle = this.scene.launchAngle;
    const newAngle = Phaser.Math.Clamp(
      currentAngle + delta,
      this.angleMin,
      this.angleMax
    );

    if (newAngle !== currentAngle) {
      this.scene.launchAngle = Math.round(newAngle);
      this.onAngleChange(this.scene.launchAngle);
      //console.log(`🎯 Angle adjusted to ${this.scene.launchAngle}°`);
    }
  }

  /**
   * Adjust power value within bounds
   */
  adjustPower(delta) {
    const currentPower = this.scene.launchPower;
    const newPower = Phaser.Math.Clamp(
      currentPower + delta,
      this.powerMin,
      this.powerMax
    );

    if (newPower !== currentPower) {
      this.scene.launchPower = Math.round(newPower);
      this.onPowerChange(this.scene.launchPower);
      //console.log(`⚡ Power adjusted to ${this.scene.launchPower}%`);
    }
  }

  /**
   * Start the launch timer
   */
  startTimer() {
    if (this.isTimerActive) return; // Timer already running

    this.isTimerActive = true;
    this.timerStartTime = this.scene.time.now;
    this.hasInteracted = true;

    //console.log( `⏱️ Launch timer started: ${this.timerDuration / 1000}s countdown`);
  }

  /**
   * Stop the timer
   */
  stopTimer() {
    this.isTimerActive = false;
    this.hasInteracted = false;

    console.log("⏹️ Launch timer stopped");
  }

  /**
   * Seconds left before auto-launch fires, for the HUD countdown.
   *
   * @returns {number|null} null when no countdown is running
   */
  getRemainingSeconds() {
    if (!this.isTimerActive || !this.hasInteracted) return null;

    const elapsed = this.scene.time.now - this.timerStartTime;
    const remaining = Math.max(0, this.timerDuration - elapsed);
    return Math.ceil(remaining / 1000);
  }

  /**
   * Update timer state and handle auto-launch
   */
  updateTimer(time) {
    if (!this.isTimerActive || !this.hasInteracted) return;

    const elapsed = time - this.timerStartTime;
    const remaining = Math.max(0, this.timerDuration - elapsed);

    // Auto-launch when timer expires
    if (remaining <= 0 && this.scene.canLaunch) {
      //console.log("🚀 Auto-launching rocket - timer expired!");
      this.stopTimer();
      this.onAutoLaunch();
    }
  }

  /**
   * Handle manual launch (SPACE key)
   */
  manualLaunch() {
    if (this.scene.canLaunch && !this.scene.gameOver) {
      //console.log("🚀 Manual launch triggered");
      this.stopTimer();
      this.onAutoLaunch(); // Use same callback
    }
  }

  /**
   * Reset the controller state
   */
  reset() {
    this.stopTimer();
    this.hasInteracted = false;
    //console.log("🔄 KeyboardTimerController reset");
  }

  /**
   * Clean up the controller
   */
  destroy() {
    // Restore original update method
    if (this.originalUpdate) {
      this.scene.update = this.originalUpdate;
    } else {
      delete this.scene.update;
    }

    // Clean up keyboard input
    if (this.keys) {
      Object.values(this.keys).forEach((key) => {
        if (key && key.destroy) {
          key.destroy();
        }
      });
    }

    //console.log("🧹 KeyboardTimerController destroyed");
  }

  /**
   * Get current timer state for debugging
   */
  getTimerState() {
    return {
      isActive: this.isTimerActive,
      hasInteracted: this.hasInteracted,
      elapsed: this.isTimerActive
        ? this.scene.time.now - this.timerStartTime
        : 0,
      remaining: this.isTimerActive
        ? Math.max(
            0,
            this.timerDuration - (this.scene.time.now - this.timerStartTime)
          )
        : 0,
    };
  }
}
