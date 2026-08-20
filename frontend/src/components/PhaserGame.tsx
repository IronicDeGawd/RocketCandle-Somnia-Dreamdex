"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Phaser from "phaser";
import { PreloadScene } from "@/scenes/PreloadScene.js";
import { MenuScene } from "@/scenes/MenuScene.js";
import { RunSetupScene } from "@/scenes/RunSetupScene.js";
import { GameScene } from "@/scenes/GameScene.js";
import { EndGameScene } from "@/scenes/EndGameScene.js";
import { useApp } from "@/app/providers";
import { useGameControls, useGameHud } from "@/hooks/useGameHud";
import GameCabinet from "@/components/game/GameCabinet";

export interface PhaserGameProps {
  onGameComplete?: (score: number, level: number) => void;
  /** Rendered where the 1A mock puts the trading door - the right rail. */
  tradingSlot?: ReactNode;
}

export default function PhaserGame({
  onGameComplete,
  tradingSlot,
}: PhaserGameProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Hold the completion callback in a ref so the game is built once.
   *
   * The page passes a fresh function on every render, and the game's setup
   * effect used to depend on it - so any re-render of the page tore the whole
   * Phaser instance down and built a new one. That is fatal rather than
   * wasteful: textures are destroyed while the renderer is still drawing them,
   * which surfaces as a null canvas deep inside Phaser. Reading through a ref
   * keeps the callback current without the identity ever being a dependency.
   */
  const onCompleteRef = useRef(onGameComplete);
  onCompleteRef.current = onGameComplete;

  // Whether a run has anywhere to report to genuinely changes what the game
  // is - practice mode derives from it - so this, unlike the identity, is a
  // real reason to rebuild.
  const canSubmitRuns = Boolean(onGameComplete);
  const [isLoading, setIsLoading] = useState(true);
  const { walletAddress, isAuthenticated, playerStats } = useApp();
  const hud = useGameHud();
  const controls = useGameControls();

  useEffect(() => {
    if (!containerRef.current) return;

    // Game configuration
    const config: Phaser.Types.Core.GameConfig = {
      type: Phaser.AUTO,
      width: 1200,
      height: 600,
      parent: containerRef.current,
      backgroundColor: "#0a0a0f",
      physics: {
        default: "arcade",
        arcade: {
          gravity: { y: 300, x: 0 },
          debug: false,
        },
      },
      scene: [PreloadScene, MenuScene, RunSetupScene, GameScene, EndGameScene],
      scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        min: {
          width: 800,
          height: 400,
        },
        max: {
          width: 1200,
          height: 600,
        },
      },
    };

    // Create game instance
    gameRef.current = new Phaser.Game(config);
    setIsLoading(false);

    // Set up global wallet state for game scenes
    if (typeof window !== "undefined") {
      window.rocketCandleGame = {
        isConnected: isAuthenticated,
        address: walletAddress,
        // Left undefined in practice mode. A no-op stub here would let the
        // game announce it was submitting a score that goes nowhere.
        onGameComplete: canSubmitRuns
          ? (score: number, level: number) =>
              onCompleteRef.current?.(score, level)
          : undefined,
        practiceMode: !canSubmitRuns,
      };
    }

    // Cleanup function
    return () => {
      if (gameRef.current) {
        gameRef.current.destroy(true);
        gameRef.current = null;
      }
      if (typeof window !== "undefined") {
        delete window.rocketCandleGame;
      }
    };
    // Wallet details are deliberately absent from these dependencies: the
    // effect below keeps them current on the window handle, so connecting a
    // wallet no longer restarts the game underneath the player.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canSubmitRuns]);

  // Update global wallet state when authentication changes
  useEffect(() => {
    if (typeof window !== "undefined" && window.rocketCandleGame) {
      window.rocketCandleGame.isConnected = isAuthenticated;
      window.rocketCandleGame.address = walletAddress;
    }
  }, [isAuthenticated, walletAddress]);

  return (
    <GameCabinet
      containerRef={containerRef}
      isLoading={isLoading}
      isConnected={isAuthenticated}
      address={walletAddress}
      hud={hud}
      controls={controls}
      tradingSlot={tradingSlot}
      wickBalance={playerStats?.totalTokens ?? null}
    />
  );
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    rocketCandleGame?: {
      isConnected: boolean;
      address: string | null;
      // Absent in practice mode, where a finished run has nowhere to go.
      onGameComplete?: (score: number, level: number) => void;
      practiceMode: boolean;
      /** Present only when the player is trading. Absent in practice mode. */
      trading?: import("@/lib/tradingBridge").TradingBridge;
      /** Published by GameScene.js on every change - see publishHud(). */
      hud?: import("@/hooks/useGameHud").GameHud;
      /** Registered by GameScene.js once it has booted. */
      controls?: import("@/hooks/useGameHud").GameControls;
      /**
       * Which pair the player picked on the menu.
       *
       * The picker is drawn in the canvas but the trading panel is in the
       * page, and the panel must buy the pair that becomes the terrain.
       */
      selectedMarket?: import("@/hooks/useGameHud").SelectedMarket;
      /**
       * USDso this wallet has moved through the exchange, buys and sells
       * added together. Kept here so the navbar can show it from any page.
       */
      tradedVolume?: number;
      /**
       * Games played, best score and WICK earned, read from the contract.
       *
       * Published because the canvas cannot see React state, and the menu's
       * own source for this was a global that never existed.
       */
      playerStats?: import("@/lib/blockchain").PlayerStats;
      /**
       * The smallest buy each market accepts, in USDso, keyed by market id.
       *
       * Set in the token being bought rather than in money, so it depends on
       * the token's price - a market can be unaffordable with a funded vault.
       */
      marketMinimums?: import("@/hooks/useMarketMinimums").MarketMinimums;
      /** The exits chosen on the menu, which GameScene enforces. */
      exitPlan?: import("@/hooks/useGameHud").ExitPlan;
    };
  }
}
