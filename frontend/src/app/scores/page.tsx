"use client";

import { useApp } from "../providers";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useReadContract } from "wagmi";
import {
  GAME_CONTRACT_ABI,
  getGameContractAddress,
  formatAddress,
  type LeaderboardEntry,
} from "@/lib/blockchain";

// Types for blockchain data
interface RawLeaderboardEntry {
  player: string;
  score: bigint;
  timestamp: bigint;
}

interface RawPlayerHistoryEntry {
  score: bigint;
  level: bigint;
  gameTime: bigint;
  timestamp: bigint;
  player: string;
  enemiesDestroyed: bigint;
  rocketsUsed: bigint;
}
import Navbar from "@/components/layout/Navbar";

export default function ScoresPage() {
  const { isAuthenticated, user, playerStats } = useApp();
  const router = useRouter();
  const [currentWeek, setCurrentWeek] = useState<number>(0);

  const handleNavigation = (page: "home" | "game" | "leaderboard") => {
    switch (page) {
      case "home":
        router.push("/");
        break;
      case "game":
        router.push("/game");
        break;
      case "leaderboard":
        router.push("/scores");
        break;
    }
  };

  const contractAddress = getGameContractAddress();

  // Get current week from contract
  const { data: weekData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GAME_CONTRACT_ABI,
    functionName: "getCurrentWeek",
    query: {
      enabled: !!contractAddress,
    },
  });

  // Get weekly leaderboard
  const { data: leaderboardData, refetch: refetchLeaderboard } =
    useReadContract({
      address: contractAddress as `0x${string}`,
      abi: GAME_CONTRACT_ABI,
      functionName: "getWeeklyTopScores",
      args: [BigInt(currentWeek), BigInt(10)], // Get top 10 scores
      query: {
        enabled: !!contractAddress && currentWeek > 0,
      },
    });

  // Get player history
  const { data: playerHistoryData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GAME_CONTRACT_ABI,
    functionName: "getPlayerHistory",
    args: user?.address ? [user.address as `0x${string}`] : undefined,
    query: {
      enabled: !!contractAddress && !!user?.address,
    },
  });

  useEffect(() => {
    if (weekData) {
      setCurrentWeek(Number(weekData));
    }
  }, [weekData]);

  useEffect(() => {
    if (!isAuthenticated) {
      router.push("/");
      return;
    }
  }, [isAuthenticated, router]);

  const formatLeaderboardData = (data: unknown[]): LeaderboardEntry[] => {
    if (!data) return [];
    return data.map((entry: unknown) => {
      const typedEntry = entry as RawLeaderboardEntry;
      return {
        player: typedEntry.player,
        score: Number(typedEntry.score),
        timestamp: Number(typedEntry.timestamp),
      };
    });
  };

  const formatPlayerHistory = (data: unknown[]) => {
    if (!data) return [];
    return data.map((entry: unknown) => {
      const typedEntry = entry as RawPlayerHistoryEntry;
      return {
        score: Number(typedEntry.score),
        level: Number(typedEntry.level),
        gameTime: Number(typedEntry.gameTime),
        timestamp: Number(typedEntry.timestamp),
        player: typedEntry.player,
        enemiesDestroyed: Number(typedEntry.enemiesDestroyed),
        rocketsUsed: Number(typedEntry.rocketsUsed),
      };
    });
  };

  const leaderboard = formatLeaderboardData(leaderboardData as unknown[]);
  const playerHistory = formatPlayerHistory(playerHistoryData as unknown[]);

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center">
        <div className="text-center text-white">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <p className="text-gray-400">Redirecting to home page...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Navigation Bar */}
      <Navbar onNavigate={handleNavigation} />

      <div
        className="min-h-screen text-white p-4"
        style={{ paddingTop: "100px" }}
      >
        {/* Header */}
        <header className="game-header">
          <div className="game-header-content">
            <div className="game-title-section">
              <h1 className="game-title">🏆 Leaderboard & Scores</h1>
              <p className="game-subtitle">
                Weekly rankings and your game history
              </p>
            </div>

            <div className="game-header-stats">
              {/* Player Info */}
              <div className="stat-card">
                <div className="stat-label">Player</div>
                <div className="stat-value">{user?.displayName}</div>
              </div>

              {/* Player Stats */}
              {playerStats && (
                <>
                  <div className="stat-card">
                    <div className="stat-label">Best Score</div>
                    <div className="stat-value highlight">
                      {playerStats.bestScore.toLocaleString()}
                    </div>
                  </div>
                  <div className="stat-card">
                    <div className="stat-label">WICK Tokens</div>
                    <div className="stat-value highlight">
                      {playerStats.totalTokens.toFixed(2)}
                    </div>
                  </div>
                </>
              )}

              {/* Back Button */}
              <button onClick={() => router.push("/")} className="btn btn-back">
                ← Back
              </button>
            </div>
          </div>
        </header>

        {/* Main Content */}
        <div className="dashboard-container">
          <div className="dashboard-games-section">
            {/* Weekly Leaderboard */}
            <div className="dashboard-card">
              <h2 className="text-2xl font-bold mb-6 text-center">
                🏆 Weekly Leaderboard
                {currentWeek > 0 && (
                  <span className="text-sm text-gray-400 block">
                    Week {currentWeek}
                  </span>
                )}
              </h2>

              <div className="leaderboard-container">
                {leaderboard.length > 0 ? (
                  leaderboard.map((entry, index) => (
                    <div
                      key={`${entry.player}-${entry.timestamp}`}
                      className={`leaderboard-item ${
                        entry.player.toLowerCase() ===
                        user?.address?.toLowerCase()
                          ? "current-player"
                          : ""
                      }`}
                    >
                      <div className="leaderboard-info">
                        <div className="leaderboard-rank">#{index + 1}</div>
                        <div className="leaderboard-address">
                          {entry.player.toLowerCase() ===
                          user?.address?.toLowerCase()
                            ? "You"
                            : formatAddress(entry.player)}
                        </div>
                      </div>
                      <div className="leaderboard-score">
                        {entry.score.toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <p>No scores yet this week!</p>
                    <p className="text-sm text-gray-400">
                      Be the first to play and earn tokens!
                    </p>
                  </div>
                )}
              </div>

              <button
                onClick={() => refetchLeaderboard()}
                className="btn btn-glass mt-6 w-full"
                style={{ marginTop: "10px" }}
              >
                🔄 Refresh
              </button>
            </div>

            {/* Player History */}
            <div className="dashboard-card">
              <h2 className="text-2xl font-bold mb-6 text-center">
                📊 Your Game History
              </h2>

              <div className="leaderboard-container">
                {playerHistory.length > 0 ? (
                  playerHistory.slice(0, 10).map((game, index) => (
                    <div
                      key={`${game.timestamp}-${index}`}
                      className="leaderboard-item"
                    >
                      <div className="leaderboard-info">
                        <div className="leaderboard-rank">L{game.level}</div>
                        <div className="text-xs text-gray-400">
                          {new Date(game.timestamp * 1000).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="leaderboard-score">
                        {game.score.toLocaleString()}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <p>No games played yet!</p>
                    <p className="text-sm text-gray-400">
                      Start playing to see your history here.
                    </p>
                  </div>
                )}
              </div>

              {playerHistory.length > 10 && (
                <div className="text-center mt-4 text-sm text-gray-400">
                  Showing latest 10 games
                </div>
              )}
            </div>
          </div>

          {/* Player Stats Grid */}
          {playerStats && (
            <div className="stats-grid mt-8">
              <div className="stat-item">
                <div className="stat-value">{playerStats.totalGames}</div>
                <div className="stat-label">Total Games</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">
                  {playerStats.bestScore.toLocaleString()}
                </div>
                <div className="stat-label">Best Score</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">
                  {playerStats.totalTokens.toFixed(2)}
                </div>
                <div className="stat-label">Total WICK</div>
              </div>
              <div className="stat-item">
                <div className="stat-value">
                  {playerStats.totalGames > 0
                    ? Math.round(
                        (playerStats.totalTokens / playerStats.totalGames) * 100
                      ) / 100
                    : 0}
                </div>
                <div className="stat-label">Avg Tokens/Game</div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
