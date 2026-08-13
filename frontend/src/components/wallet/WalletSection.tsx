"use client";

import { useApp } from "@/app/providers";

interface WalletSectionProps {
  onDashboard?: () => void;
  onStartGame?: () => void;
  onHowToPlay?: () => void;
}

const WalletSection = ({
  onDashboard,
  onStartGame,
  onHowToPlay,
}: WalletSectionProps) => {
  const { connectWallet, isLoading, isAuthenticated, user, playerStats } =
    useApp();

  if (!isAuthenticated) {
    return (
      <div className="wallet-section mt-8">
        <div className="text-center">
          <h2 className="text-3xl font-bold mb-6">Ready to Play?</h2>
          <button
            onClick={connectWallet}
            disabled={isLoading}
            className="btn btn-success btn-large"
          >
            {isLoading ? (
              <span className="flex items-center gap-2">
                <div className="loading-spinner-small"></div>
                Connecting...
              </span>
            ) : (
              "🔗 Connect Wallet"
            )}
          </button>
          <p className="text-gray-400 text-base">
            Connect your wallet to start earning WICK tokens
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-section mt-8">
      <div className="text-center">
        <div className="auth-text mb-6">
          <div className="auth-title text-2xl font-bold mb-2">
            ✅ Wallet Connected
          </div>
          <div className="auth-subtitle text-lg text-gray-400">
            {user?.displayName}
          </div>
        </div>

        <div className="flex flex-row gap-4">
          <button
            onClick={onStartGame}
            className="btn btn-success btn-large play-button"
          >
            🎮 Start Game
          </button>

          <button onClick={onHowToPlay} className="btn btn-glass btn-large">
            📖 How to Play
          </button>
        </div>
      </div>
    </div>
  );
};

export default WalletSection;
