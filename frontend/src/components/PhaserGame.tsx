"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import * as Phaser from "phaser";
import { PreloadScene } from "@/scenes/PreloadScene.js";
import { MenuScene } from "@/scenes/MenuScene.js";
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
      scene: [PreloadScene, MenuScene, GameScene, EndGameScene],
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
        onGameComplete,
        practiceMode: !onGameComplete,
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
  }, [isAuthenticated, walletAddress, onGameComplete]);

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
    };
  }
}
