"use client";

import { useSyncExternalStore } from "react";

/**
 * The game's HUD bridge.
 *
 * GameScene.js owns all of this state and pushes a fresh snapshot onto
 * `window.rocketCandleGame.hud` every time something changes, then fires a
 * "rc-hud" event. This file only reads that snapshot - it never computes
 * game state itself, so the scene stays the single source of truth even
 * while the cabinet keeps working with no scene mounted at all (loading,
 * SSR, practice mode before the game boots).
 */

export interface TradingPositionHud {
  /** USDso put at risk. */
  stake: number;
  /** What it is worth at the price somebody would actually pay. */
  value: number;
  /** Gain or loss so far, in USDso. */
  pnl: number;
  pnlPct: number;
  /** How far the position may fall before it sells itself, as a percentage. */
  floorPct: number;
}

export interface GameHud {
  score: number;
  totalAttempts: number;
  levelAttempts: number;
  maxAttempts: number;
  /** 1-based - matches the level pips on the cabinet's left rail. */
  level: number;
  totalLevels: number;
  levelName: string;
  enemiesLeft: number;
  terrainCaption: string;
  marketTicker: string;
  angle: number;
  power: number;
  /**
   * Is a run actually on screen?
   *
   * False while the loading and menu scenes are showing. Without this the
   * overlay drew a score of zero and an empty enemy count on top of the menu,
   * because "no game running" and "a game running with nothing in it" look
   * identical from a snapshot of numbers.
   */
  active: boolean;
  /** null when no auto-launch countdown is running. */
  autoLaunchSeconds: number | null;
  canLaunch: boolean;
  position: TradingPositionHud | null;
  /** Orders placed this run. null when there is no trading bridge at all. */
  orders: number | null;
  /** Fees paid this run. null when there is no trading bridge at all. */
  fees: number | null;
}

/** The pair chosen on the menu, which is both the terrain and what gets bought. */
export interface SelectedMarket {
  id: string;
  symbol: string;
  label: string;
}

export interface GameControls {
  setAngle: (value: number) => void;
  setPower: (value: number) => void;
  launch: () => void;
  endGame: () => void;
  eject: () => void;
  addFirepower: () => void;
}

export const EMPTY_HUD: GameHud = {
  score: 0,
  totalAttempts: 0,
  levelAttempts: 0,
  maxAttempts: 3,
  level: 1,
  totalLevels: 1,
  levelName: "",
  enemiesLeft: 0,
  terrainCaption: "",
  marketTicker: "",
  angle: 45,
  power: 50,
  active: false,
  autoLaunchSeconds: null,
  canLaunch: true,
  position: null,
  orders: null,
  fees: null,
};

function subscribe(callback: () => void) {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("rc-hud", callback);
  return () => window.removeEventListener("rc-hud", callback);
}

function getHudSnapshot(): GameHud {
  if (typeof window === "undefined") return EMPTY_HUD;
  return window.rocketCandleGame?.hud ?? EMPTY_HUD;
}

function getHudServerSnapshot(): GameHud {
  return EMPTY_HUD;
}

function getControlsSnapshot(): GameControls | null {
  if (typeof window === "undefined") return null;
  return window.rocketCandleGame?.controls ?? null;
}

function getControlsServerSnapshot(): GameControls | null {
  return null;
}

/** The current HUD snapshot, re-rendering whenever the scene publishes a new one. */
export function useGameHud(): GameHud {
  return useSyncExternalStore(subscribe, getHudSnapshot, getHudServerSnapshot);
}

function getMarketSnapshot(): SelectedMarket | null {
  if (typeof window === "undefined") return null;
  return window.rocketCandleGame?.selectedMarket ?? null;
}

function getMarketServerSnapshot(): SelectedMarket | null {
  return null;
}

/**
 * Which pair the menu is pointing at, or null before it has said.
 *
 * Shares the "rc-hud" subscription with the HUD rather than opening a second
 * channel, because the menu publishes on the same event.
 */
export function useSelectedMarket(): SelectedMarket | null {
  return useSyncExternalStore(
    subscribe,
    getMarketSnapshot,
    getMarketServerSnapshot
  );
}

/**
 * The scene's control surface, once it has registered one.
 *
 * null until a GameScene has booted and called registerControls() - callers
 * must treat every action as optional, exactly as the keyboard path does.
 */
export function useGameControls(): GameControls | null {
  return useSyncExternalStore(
    subscribe,
    getControlsSnapshot,
    getControlsServerSnapshot
  );
}
