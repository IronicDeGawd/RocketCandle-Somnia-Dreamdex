"use client";

import type { GameHud as GameHudState } from "@/hooks/useGameHud";

/**
 * The readouts that used to be drawn inside the Phaser canvas - score,
 * level, the market ticker, enemy count, the auto-launch countdown, and the
 * open position - now sitting in HTML over the frame instead. Nothing here
 * computes anything: every value comes straight from the HUD bridge that
 * GameScene.js publishes.
 *
 * The auto-launch countdown starts at 8 seconds - GameScene's own
 * `timerDuration` - which is why the progress fill below is measured
 * against 8 rather than a value read from the bridge.
 */
const AUTO_LAUNCH_SECONDS = 8;

export interface GameHudProps {
  hud: GameHudState;
}

export default function GameHud({ hud }: GameHudProps) {
  // Nothing to overlay until a run is actually on screen. Otherwise the
  // loading and menu scenes get a score of zero and an empty enemy count
  // sitting on top of them.
  if (!hud.active) return null;

  const autoLaunchPct =
    hud.autoLaunchSeconds === null
      ? 0
      : Math.max(
          0,
          Math.min(100, (hud.autoLaunchSeconds / AUTO_LAUNCH_SECONDS) * 100)
        );

  return (
    <div className="gc-hud">
      <div className="gc-hud-score">
        <span className="gc-hud-label rc-pixel">SCORE</span>
        <span className="gc-hud-score-value rc-pixel">{hud.score}</span>
        <span className="gc-hud-label rc-pixel">{hud.totalAttempts} SHOTS</span>
      </div>

      <div className="gc-hud-center">
        <div className="gc-hud-level rc-pixel">
          LEVEL {hud.level} / {hud.totalLevels}
          {hud.levelName ? (
            <>
              <br />
              {hud.levelName.toUpperCase()}
            </>
          ) : null}
        </div>
        {hud.marketTicker ? (
          <div className="gc-hud-ticker rc-mono">
            <span className="gc-hud-ticker-dot rc-blink" aria-hidden="true" />
            <span>{hud.marketTicker}</span>
          </div>
        ) : null}
      </div>

      <div className="gc-hud-enemies">
        <span className="gc-hud-label rc-pixel">ENEMIES</span>
        <span className="gc-hud-enemies-value rc-pixel">
          {String(hud.enemiesLeft).padStart(2, "0")}
        </span>
      </div>

      {hud.autoLaunchSeconds !== null ? (
        <div className="gc-hud-autolaunch">
          <span className="rc-pixel">AUTO-LAUNCH {hud.autoLaunchSeconds}</span>
          <div className="gc-hud-autolaunch-track">
            <div
              className="gc-hud-autolaunch-fill"
              style={{ width: `${autoLaunchPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {hud.position ? (
        <div className="gc-hud-position">
          <div className="gc-hud-position-head rc-pixel">POSITION OPEN</div>
          <div className="gc-hud-position-body rc-mono">
            <div className="gc-hud-row">
              <span className="gc-hud-row-label">STAKED</span>
              <span>{hud.position.stake.toFixed(3)}</span>
            </div>
            <div className="gc-hud-row">
              <span className="gc-hud-row-label">NOW</span>
              <span>
                {hud.position.value.toFixed(3)}{" "}
                <span
                  className={hud.position.pnl >= 0 ? "gc-gain" : "gc-loss"}
                >
                  {hud.position.pnl >= 0 ? "+" : ""}
                  {hud.position.pnlPct.toFixed(2)}%
                </span>
              </span>
            </div>
            <div className="gc-hud-row">
              <span className="gc-hud-row-label">FLOOR</span>
              <span>-{hud.position.floorPct}%</span>
            </div>
            <div className="gc-hud-keys rc-pixel">
              <span>
                <span className="gc-key-red">E</span> EJECT
              </span>
              <span>
                <span className="gc-key-red">F</span> POWER
              </span>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
