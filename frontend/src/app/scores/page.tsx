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
import "../scores.css";

// A stable stand-in for a stat that has not loaded yet. Same box, same
// border, so the tile it sits in never changes size once the real number
// arrives - nothing above or below it has to jump.
function StatPlaceholder({ label }: { label: string }) {
  return (
    <div className="sc-tile sc-tile--placeholder" aria-hidden="true">
      <span className="sc-tile-label rc-pixel">{label}</span>
      <span className="sc-tile-value rc-mono sc-placeholder-glyph">‑ ‑</span>
    </div>
  );
}

// Fixed-height rows that hold the list's shape while data is still on its
// way in, so the panel never pops taller or shorter once it lands.
function SkeletonRows({ count }: { count: number }) {
  return (
    <div className="sc-skeleton" role="presentation">
      {Array.from({ length: count }).map((_, index) => (
        <div key={index} className="sc-skeleton-row" />
      ))}
    </div>
  );
}

function ListError({
  onRetry,
}: {
  onRetry: () => void;
}) {
  return (
    <div className="sc-error">
      <p className="rc-mono sc-error-text">Could not reach the chain.</p>
      <button onClick={onRetry} className="rc-btn rc-btn--danger sc-error-retry">
        RETRY
      </button>
    </div>
  );
}

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
  const {
    data: leaderboardData,
    isLoading: isLeaderboardLoading,
    isError: isLeaderboardError,
    refetch: refetchLeaderboard,
  } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GAME_CONTRACT_ABI,
    functionName: "getWeeklyTopScores",
    args: [BigInt(currentWeek), BigInt(10)], // Get top 10 scores
    query: {
      enabled: !!contractAddress && currentWeek > 0,
    },
  });

  // Get player history
  const {
    data: playerHistoryData,
    isLoading: isPlayerHistoryLoading,
    isError: isPlayerHistoryError,
    refetch: refetchPlayerHistory,
  } = useReadContract({
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

  // The leaderboard query is deliberately held off until the current week is
  // known, so "still finding out which week we're on" reads as loading too -
  // otherwise the panel would flash an empty state for a moment first.
  const leaderboardLoading = currentWeek === 0 || isLeaderboardLoading;

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
      <Navbar onNavigate={handleNavigation} />

      <main className="sc-page">
        <header className="sc-header">
          <div className="sc-header-title">
            <h1 className="sc-title rc-title">LEADERBOARD</h1>
            <p className="sc-subtitle">
              Weekly rankings and your game history.
            </p>
          </div>

          <div className="sc-header-stats">
            <div className="sc-tile">
              <span className="sc-tile-label rc-pixel">PLAYER</span>
              <span className="sc-tile-value rc-mono">{user?.displayName}</span>
            </div>

            {playerStats ? (
              <div className="sc-tile">
                <span className="sc-tile-label rc-pixel">BEST SCORE</span>
                <span className="sc-tile-value rc-mono sc-accent-yellow">
                  {playerStats.bestScore.toLocaleString()}
                </span>
              </div>
            ) : (
              <StatPlaceholder label="BEST SCORE" />
            )}

            {playerStats ? (
              <div className="sc-tile">
                <span className="sc-tile-label rc-pixel">WICK TOKENS</span>
                <span className="sc-tile-value rc-mono sc-accent-yellow">
                  {playerStats.totalTokens.toFixed(2)}
                </span>
              </div>
            ) : (
              <StatPlaceholder label="WICK TOKENS" />
            )}

            <button onClick={() => router.push("/")} className="rc-btn sc-back-btn">
              ← BACK
            </button>
          </div>
        </header>

        <section className="sc-grid">
          {/* Weekly Leaderboard */}
          <div className="rc-panel sc-panel">
            <div className="rc-panel-head rc-panel-head--gain sc-panel-head-row">
              <span>WEEKLY LEADERBOARD</span>
              {currentWeek > 0 && <span>WEEK {currentWeek}</span>}
            </div>

            <div className="sc-list">
              {leaderboardLoading ? (
                <SkeletonRows count={5} />
              ) : isLeaderboardError ? (
                <ListError onRetry={() => refetchLeaderboard()} />
              ) : leaderboard.length > 0 ? (
                leaderboard.map((entry, index) => {
                  const isYou =
                    entry.player.toLowerCase() === user?.address?.toLowerCase();
                  return (
                    <div
                      key={`${entry.player}-${entry.timestamp}`}
                      className={`sc-row${isYou ? " sc-row--you" : ""}`}
                    >
                      <span className="sc-row-left rc-mono">
                        {String(index + 1).padStart(2, "0")}&nbsp;&nbsp;
                        {isYou ? "YOU" : formatAddress(entry.player)}
                      </span>
                      <span className="sc-row-right rc-mono">
                        {entry.score.toLocaleString()}
                      </span>
                    </div>
                  );
                })
              ) : (
                <div className="sc-empty">
                  <p className="rc-pixel sc-empty-title">
                    NO SCORES
                    <br />
                    THIS WEEK
                  </p>
                  <p className="sc-empty-copy">Be the first to play this week.</p>
                  <button
                    onClick={() => router.push("/practice")}
                    className="rc-btn rc-btn--primary"
                  >
                    PLAY
                  </button>
                </div>
              )}
            </div>

            <div className="sc-panel-footer">
              <button onClick={() => refetchLeaderboard()} className="rc-btn">
                REFRESH
              </button>
            </div>
          </div>

          {/* Player History + lifetime stats */}
          <div className="sc-side">
            <div className="rc-panel sc-panel">
              <div className="rc-panel-head">YOUR GAME HISTORY</div>

              <div className="sc-list">
                {isPlayerHistoryLoading ? (
                  <SkeletonRows count={3} />
                ) : isPlayerHistoryError ? (
                  <ListError onRetry={() => refetchPlayerHistory()} />
                ) : playerHistory.length > 0 ? (
                  playerHistory.slice(0, 10).map((game, index) => (
                    <div key={`${game.timestamp}-${index}`} className="sc-row">
                      <span className="sc-row-left rc-mono">
                        LVL {game.level} ·{" "}
                        {new Date(game.timestamp * 1000).toLocaleDateString(
                          "en-US",
                          { day: "2-digit", month: "short" }
                        )}
                      </span>
                      <span className="sc-row-right rc-mono">
                        {game.score.toLocaleString()}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="sc-empty">
                    <p className="rc-pixel sc-empty-title">NO GAMES YET</p>
                    <p className="sc-empty-copy">
                      Start playing to see your history here.
                    </p>
                    <button
                      onClick={() => router.push("/practice")}
                      className="rc-btn rc-btn--primary"
                    >
                      PLAY
                    </button>
                  </div>
                )}
              </div>

              {playerHistory.length > 10 && (
                <div className="sc-panel-footer sc-panel-footer--note">
                  Showing latest 10 games
                </div>
              )}
            </div>

            <div className="sc-tiles">
              {playerStats ? (
                <div className="sc-tile">
                  <span className="sc-tile-label rc-pixel">GAMES</span>
                  <span className="sc-tile-value rc-mono">
                    {playerStats.totalGames}
                  </span>
                </div>
              ) : (
                <StatPlaceholder label="GAMES" />
              )}

              {playerStats ? (
                <div className="sc-tile">
                  <span className="sc-tile-label rc-pixel">BEST</span>
                  <span className="sc-tile-value rc-mono sc-accent-yellow">
                    {playerStats.bestScore.toLocaleString()}
                  </span>
                </div>
              ) : (
                <StatPlaceholder label="BEST" />
              )}

              {playerStats ? (
                <div className="sc-tile">
                  <span className="sc-tile-label rc-pixel">WICK</span>
                  <span className="sc-tile-value rc-mono">
                    {playerStats.totalTokens.toFixed(2)}
                  </span>
                </div>
              ) : (
                <StatPlaceholder label="WICK" />
              )}

              {playerStats ? (
                <div className="sc-tile">
                  <span className="sc-tile-label rc-pixel">AVG</span>
                  <span className="sc-tile-value rc-mono">
                    {playerStats.totalGames > 0
                      ? Math.round(
                          (playerStats.totalTokens / playerStats.totalGames) *
                            100
                        ) / 100
                      : 0}
                  </span>
                </div>
              ) : (
                <StatPlaceholder label="AVG" />
              )}
            </div>
          </div>
        </section>
      </main>
    </>
  );
}
