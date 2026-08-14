"use client";

import type { ReactNode, RefObject } from "react";

import type { GameControls, GameHud as GameHudState } from "@/hooks/useGameHud";
import { somniaNetwork } from "@/lib/wagmi";
import GameHud from "./GameHud";
import AimControls from "./AimControls";
import MarketStrip from "./MarketStrip";
// Imported here rather than from the page: /practice mounts this cabinet too,
// and a stylesheet attached to one route left the other route unstyled.
import "@/app/game.css";

/**
 * The 1A cabinet: the strips of dead space around the old canvas become the
 * console itself - a level ladder and attempt pips on the left, market
 * provenance and the trading door on the right, aim controls on a bezel
 * beneath. The canvas in the middle keeps its 1200x600 resolution and never
 * has its play-field maths touched; everything here is chrome built around
 * it, fed by the HUD bridge in GameScene.js.
 *
 * Document order inside is fixed: status bar, frame (rails + canvas),
 * controls (bezel) - matching the brief's requirement for the page as a
 * whole.
 */

export interface GameCabinetProps {
  containerRef: RefObject<HTMLDivElement | null>;
  isLoading: boolean;
  isConnected: boolean;
  address?: string | null;
  hud: GameHudState;
  controls: GameControls | null;
  tradingSlot?: ReactNode;
  wickBalance?: number | null;
}

function shortAddress(address?: string | null): string {
  if (!address) return "NO WALLET";
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export default function GameCabinet({
  containerRef,
  isLoading,
  isConnected,
  address,
  hud,
  controls,
  tradingSlot,
  wickBalance,
}: GameCabinetProps) {
  return (
    <section className="gc-console">
      <div className="gc-statusbar">
        <div className="gc-statusbar-left">
          <span className="gc-status-chip gc-status-chip--yellow">
            <span className="gc-status-dot gc-status-dot--yellow" />
            {isLoading ? "LOADING" : "PLAYABLE"}
          </span>
          <span className="gc-status-chip gc-status-chip--faint">
            <span className="gc-status-dot gc-status-dot--blue" />
            <span className="rc-mono">
              {isConnected ? shortAddress(address) : "WALLET OFFLINE"}
            </span>
          </span>
          {/* Which chain the money is on. Read from the chain definition rather
              than written here, so it cannot claim testnet on a mainnet build. */}
          {somniaNetwork.testnet ? (
            <span className="gc-status-chip gc-status-chip--testnet">
              <span className="gc-status-dot gc-status-dot--red" />
              TESTNET
            </span>
          ) : null}
        </div>
        <div className="gc-statusbar-right rc-mono">
          {hud.terrainCaption || "reading the market"}
        </div>
      </div>

      <div className="gc-body">
        <LevelRail hud={hud} />

        <div className="gc-canvas-shell">
          <div ref={containerRef} className="gc-canvas-mount" />
          <div className="gc-scanlines" aria-hidden="true" />
          <GameHud hud={hud} />
        </div>

        <RightRail hud={hud} controls={controls} tradingSlot={tradingSlot} wickBalance={wickBalance} />
      </div>

      <AimControls hud={hud} controls={controls} />

      {/* Under the frame, not beside it: the cabinet already claims the full
          page width, and the design forbids a chart inside the play field. */}
      <MarketStrip hud={hud} />
    </section>
  );
}

function LevelRail({ hud }: { hud: GameHudState }) {
  const pips = Array.from({ length: hud.totalLevels }, (_, i) => i + 1);
  const attempts = Array.from({ length: hud.maxAttempts }, (_, i) => i);

  return (
    <div className="gc-rail gc-rail--left">
      <span className="gc-rail-tag rc-pixel">LVL</span>
      <div className="gc-level-ladder">
        {pips.map((n) => (
          <span
            key={n}
            className={
              "gc-level-pip rc-pixel " +
              (n === hud.level
                ? "gc-level-pip--current"
                : n < hud.level
                  ? "gc-level-pip--done"
                  : "gc-level-pip--future")
            }
          >
            {n}
          </span>
        ))}
      </div>
      <div className="gc-tries">
        <span className="gc-rail-tag rc-pixel">TRIES</span>
        <div className="gc-tries-pips">
          {attempts.map((i) => (
            <span
              key={i}
              className={
                "gc-tries-pip " +
                (i < hud.levelAttempts ? "gc-tries-pip--used" : "")
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function RightRail({
  hud,
  controls,
  tradingSlot,
  wickBalance,
}: {
  hud: GameHudState;
  controls: GameControls | null;
  tradingSlot?: ReactNode;
  wickBalance?: number | null;
}) {
  return (
    <div className="gc-rail gc-rail--right">
      <div className="gc-rail-block">
        <span className="gc-rail-block-label rc-pixel">THIS LEVEL IS</span>
        <p className="gc-rail-title">
          {hud.terrainCaption || "Reading the market..."}
        </p>
      </div>

      {hud.position ? (
        <div className="gc-rail-block">
          <span className="gc-rail-block-label rc-pixel">FOR KEEPS</span>
          <div className="gc-rail-pnl rc-pixel">
            <span className={hud.position.pnl >= 0 ? "gc-gain" : "gc-loss"}>
              {hud.position.pnl >= 0 ? "+" : ""}
              {hud.position.pnl.toFixed(2)}
            </span>
          </div>
          <div className="gc-rail-actions">
            <button
              type="button"
              className="gc-rail-btn rc-pixel"
              onClick={() => controls?.eject()}
              disabled={!controls}
            >
              EJECT
            </button>
            <button
              type="button"
              className="gc-rail-btn rc-pixel"
              onClick={() => controls?.addFirepower()}
              disabled={!controls}
            >
              +FIREPOWER
            </button>
          </div>
        </div>
      ) : null}

      {tradingSlot ? (
        <div className="gc-rail-block gc-rail-block--door">{tradingSlot}</div>
      ) : null}

      <div className="gc-rail-block gc-rail-block--stats">
        <p className="gc-rail-stats rc-mono">
          SHOTS {hud.totalAttempts}
          <br />
          WICK {(wickBalance ?? 0).toFixed(2)}
        </p>
        <button
          type="button"
          className="gc-rail-btn rc-pixel"
          onClick={() => controls?.endGame()}
          disabled={!controls}
        >
          END RUN
        </button>
      </div>
    </div>
  );
}
