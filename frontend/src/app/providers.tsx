"use client";

import {
  createContext,
  useContext,
  ReactNode,
  useState,
  useEffect,
  useCallback,
} from "react";
import { GAME_CONTRACT_ABI, getGameContractAddress, type PlayerStats } from "@/lib/blockchain";
import { WagmiProvider } from "wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useAccount, useConnect, useDisconnect, useReadContract } from "wagmi";
import { wagmiConfig } from "@/lib/wagmi";

interface User {
  address: string;
  displayName: string;
  fid?: number;
  username?: string;
}

interface AppContextType {
  user: User | null;
  isLoading: boolean;
  gameContract: unknown | null;
  isAuthenticated: boolean;
  playerStats: PlayerStats | null;
  walletAddress: string | null;
  connectWallet: () => Promise<void>;
  /**
   * Why the last connection attempt failed, or null if nothing has failed.
   *
   * A wallet refusing is an ordinary outcome, not an exception - people dismiss
   * the prompt all the time. Previously it was only written to the console, so
   * the page sat there with no explanation and no way to retry.
   */
  connectError: string | null;
  signOut: () => void;
  refreshPlayerStats: () => Promise<void>;
  setWalletAddress: (address: string | null) => void;
  invalidateLeaderboardCache: () => void;
}

const AppContext = createContext<AppContextType>({
  user: null,
  isLoading: true,
  gameContract: null,
  isAuthenticated: false,
  playerStats: null,
  walletAddress: null,
  connectWallet: async () => {},
  connectError: null,
  signOut: () => {},
  refreshPlayerStats: async () => {},
  setWalletAddress: () => {},
  invalidateLeaderboardCache: () => {},
});

// Create a client for react-query
const queryClient = new QueryClient();

function InnerProviders({ children }: { children: ReactNode }) {
  const { address: wagmiAddress, isConnected } = useAccount();
  const { connect, connectors, error: connectFailure } = useConnect();
  const { disconnect } = useDisconnect();

  const contractAddress = getGameContractAddress();

  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Only failures raised before a wallet is even reached. Anything the wallet
  // itself rejects surfaces through wagmi instead; the two are merged below.
  const [localConnectError, setLocalConnectError] = useState<string | null>(
    null
  );
  const [gameContract] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);

  // Get player stats from blockchain using wagmi
  const { data: playerStatsData } = useReadContract({
    address: contractAddress as `0x${string}`,
    abi: GAME_CONTRACT_ABI,
    functionName: 'getPlayerStats',
    args: wagmiAddress ? [wagmiAddress] : undefined,
    query: { 
      enabled: !!contractAddress && !!wagmiAddress,
      refetchInterval: 15000, // Refresh every 15 seconds
    }
  });

  useEffect(() => {
    setIsLoading(false);
  }, []);

  // Sync wagmi wallet state with local state
  useEffect(() => {
    if (isConnected && wagmiAddress && wagmiAddress !== walletAddress) {
      setWalletAddress(wagmiAddress);
      console.log("Wallet connected via wagmi:", wagmiAddress);
    } else if (!isConnected && walletAddress) {
      setWalletAddress(null);
      console.log("Wallet disconnected");
    }
  }, [isConnected, wagmiAddress, walletAddress]);

  // Update player stats when blockchain data changes
  useEffect(() => {
    if (playerStatsData && wagmiAddress) {
      const [totalGames, bestScore, totalTokens] = playerStatsData as [bigint, bigint, bigint];
      
      // Convert totalTokens from wei (18 decimals) to readable format
      const tokensInEther = Number(totalTokens) / Math.pow(10, 18);
      
      console.log("📊 Provider - Player stats from blockchain:", {
        contractAddress,
        walletAddress: wagmiAddress,
        totalGames: Number(totalGames),
        bestScore: Number(bestScore), 
        totalTokensRaw: Number(totalTokens),
        totalTokensFormatted: tokensInEther,
      });
      
      setPlayerStats({
        totalGames: Number(totalGames),
        bestScore: Number(bestScore),
        totalTokens: tokensInEther, // Store the formatted value
      });
    } else {
      setPlayerStats(null);
    }
  }, [playerStatsData, wagmiAddress, contractAddress]);

  /*
   * Hand the stats to the canvas.
   *
   * The menu drew "CONNECT WALLET TO SEE YOUR STATS" against
   * `window.web3Service` and `window.walletManager` - two globals inherited
   * from an earlier version of this game that nothing here ever creates. So it
   * said that to every player, connected or not, and the stats it would have
   * shown came from a call that no longer exists either. These are the real
   * figures, read from the contract above.
   */
  useEffect(() => {
    if (typeof window === "undefined" || !window.rocketCandleGame) return;
    window.rocketCandleGame.playerStats = playerStats ?? undefined;
    window.dispatchEvent(new CustomEvent("rc-hud"));
  }, [playerStats]);

  const refreshPlayerStats = useCallback(async () => {
    // This is now handled automatically by wagmi useReadContract
    console.log("📊 Provider - Player stats will auto-refresh via wagmi");
  }, []);

  // Sync authentication state with wallet address
  useEffect(() => {
    if (walletAddress) {
      // Player stats are now auto-loaded via wagmi hook

      // Set authentication state when wallet is connected via wagmi
      const displayName = `${walletAddress.slice(0, 6)}...${walletAddress.slice(
        -4
      )}`;

      setUser({
        address: walletAddress,
        displayName,
      });
      setIsAuthenticated(true);
      
      console.log("User authenticated:", {
        address: walletAddress,
        displayName,
        isAuthenticated: true,
      });
    } else {
      // Clear authentication when wallet is disconnected
      setUser(null);
      setIsAuthenticated(false);
      setPlayerStats(null);
      console.log("User disconnected");
    }
  }, [walletAddress]);

  const connectWallet = useCallback(async () => {
    try {
      setLocalConnectError(null);
      if (!isLoading) setIsLoading(true);

      // Try to connect using wagmi first
      const injectedConnector = connectors.find((c) => c.name === "Injected");

      if (injectedConnector) {
        console.log("Connecting with injected connector");
        connect({ connector: injectedConnector });
      } else {
        console.warn("No wallet connectors available");
        throw new Error("No wallet connectors found. Please try refreshing the page.");
      }
    } catch (error) {
      console.error("Failed to connect wallet:", error);
      setLocalConnectError(
        error instanceof Error ? error.message : "Could not reach a wallet"
      );
    } finally {
      if (isLoading) setIsLoading(false);
    }
  }, [connect, connectors, isLoading]);

  const signOut = () => {
    disconnect();
    setUser(null);
    setIsAuthenticated(false);
    setPlayerStats(null);
    setWalletAddress(null);
  };
  
  const invalidateLeaderboardCache = useCallback(() => {
    console.log("🧹 Invalidating leaderboard cache after game completion");
    // leaderboardCache.invalidateAll();
  }, []);

  const value = {
    user,
    isLoading,
    gameContract,
    isAuthenticated,
    playerStats,
    walletAddress,
    connectWallet,
    // A live connection clears any earlier failure, so a successful retry does
    // not leave the previous refusal on screen.
    connectError: isConnected
      ? null
      : localConnectError ?? connectFailure?.message ?? null,
    signOut,
    refreshPlayerStats,
    setWalletAddress,
    invalidateLeaderboardCache,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <InnerProviders>{children}</InnerProviders>
      </QueryClientProvider>
    </WagmiProvider>
  );
}

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error("useApp must be used within Providers");
  }
  return context;
};