"use client";

import type { GameHud as GameHudState } from "@/hooks/useGameHud";

/**
 * Score, level and enemies - above the play field rather than on top of it.
 *
 * These readouts were drawn in the canvas, then lifted into HTML but still
 * positioned over it, which changed nothing about the real cost: the frame is
 * the smallest thing on the page and four corners of it were spent on chrome.
 * They now sit in a bar above the frame, where they take the cabinet's width
 * instead of the game's.
 *
 * The open-position block that used to live here is gone. The right rail
 * already carries stake, profit and floor, and printing the same three numbers
 * twice on one screen only invites them to disagree.
 *
 * The auto-launch countdown starts at 8 seconds - GameScene's own
 * `timerDuration` - which is why the bar below is measured against 8 rather
 * than a value read from the bridge.
 */
const AUTO_LAUNCH_SECONDS = 8;

export interface GameHudProps {
  hud: GameHudState;
}

export default function GameHud({ hud }: GameHudProps) {
  // Nothing to show until a run is actually on screen, or the loading and
  // menu scenes get a score of zero and an empty enemy count above them.
  if (!hud.active) return null;

  const autoLaunchPct =
    hud.autoLaunchSeconds === null
      ? 0
      : Math.max(
          0,
          Math.min(100, (hud.autoLaunchSeconds / AUTO_LAUNCH_SECONDS) * 100)
        );

  return (
    <div className="gc-topbar">
      <div className="gc-topbar-block">
        <span className="gc-hud-label rc-pixel">SCORE</span>
        <span className="gc-hud-score-value rc-pixel">{hud.score}</span>
        <span className="gc-hud-label rc-pixel">{hud.totalAttempts} SHOTS</span>
      </div>

      <div className="gc-topbar-center">
        <span className="gc-hud-level rc-pixel">
          LEVEL {hud.level} / {hud.totalLevels}
        </span>
        {hud.levelName ? (
          <span className="gc-topbar-levelname rc-mono">
            {hud.levelName.toUpperCase()}
          </span>
        ) : null}
      </div>

      {hud.autoLaunchSeconds !== null ? (
        <div className="gc-topbar-autolaunch">
          <span className="rc-pixel">AUTO {hud.autoLaunchSeconds}</span>
          <div className="gc-hud-autolaunch-track">
            <div
              className="gc-hud-autolaunch-fill"
              style={{ width: `${autoLaunchPct}%` }}
            />
          </div>
        </div>
      ) : null}

      <div className="gc-topbar-block gc-topbar-block--end">
        <span className="gc-hud-label rc-pixel">ENEMIES</span>
        <span className="gc-hud-enemies-value rc-pixel">
          {String(hud.enemiesLeft).padStart(2, "0")}
        </span>
      </div>
    </div>
  );
}
