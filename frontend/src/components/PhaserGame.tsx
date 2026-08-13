"use client";

import { useEffect, useRef, useState } from "react";
import * as Phaser from "phaser";
import { PreloadScene } from "@/scenes/PreloadScene.js";
import { MenuScene } from "@/scenes/MenuScene.js";
import { GameScene } from "@/scenes/GameScene.js";
import { EndGameScene } from "@/scenes/EndGameScene.js";
import { useApp } from "@/app/providers";

export interface PhaserGameProps {
  onGameComplete?: (score: number, level: number) => void;
}

export default function PhaserGame({ onGameComplete }: PhaserGameProps) {
  const gameRef = useRef<Phaser.Game | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const { walletAddress, isAuthenticated } = useApp();

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
    <div className="w-full flex flex-col items-center space-y-4">
      {/* Game Status */}
      <div className="flex items-center space-x-4 text-sm text-gray-400">
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isLoading ? "bg-yellow-500" : "bg-green-500"
            }`}
          ></div>
          <span>{isLoading ? "Loading..." : "Game Ready"}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div
            className={`w-2 h-2 rounded-full ${
              isAuthenticated ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          <span>
            {isAuthenticated ? "Wallet Connected" : "Wallet Disconnected"}
          </span>
        </div>
      </div>

      {/* Game Container */}
      <div
        ref={containerRef}
        className="border-2 border-gray-700 rounded-lg bg-black shadow-2xl"
        style={{
          width: "1200px",
          height: "600px",
          maxWidth: "100%",
          maxHeight: "80vh",
        }}
      />
    </div>
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
    };
  }
}
