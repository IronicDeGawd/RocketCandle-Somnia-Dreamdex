"use client";

import { useApp } from "@/app/providers";

interface WalletSectionProps {
  onDashboard?: () => void;
  onStartGame?: () => void;
}

const WalletSection = ({ onStartGame }: WalletSectionProps) => {
  const { connectWallet, isLoading, isAuthenticated, user, connectError } =
    useApp();

  // A refusal is worth saying out loud, but only once the attempt has settled -
  // showing it while a retry is still in flight would contradict the button.
  const refused = Boolean(connectError) && !isLoading;

  if (isAuthenticated) {
    return (
      <div className="lp-cta">
        <h2 className="lp-sr-only">Wallet connected</h2>
        <div className="lp-cta-row">
          <button
            onClick={onStartGame}
            className="rc-btn rc-btn--danger"
          >
            PLAY
          </button>
          <a href="/practice" className="rc-btn">
            PRACTICE RUN
          </a>
        </div>
        <div className="lp-cta-note rc-mono">{user?.displayName}</div>
      </div>
    );
  }

  return (
    <div className="lp-cta">
      <h2 className="lp-sr-only">Play Rocket Candle</h2>
      <div className="lp-cta-row">
        {/* Practice keeps its slot whatever happens to the wallet. The free
            route is never blocked by the paid one failing. */}
        <a href="/practice" className="rc-btn rc-btn--danger">
          PRACTICE RUN
        </a>
        {/* On a refusal the retry moves down into the message line, so there is
            one way to try again rather than two competing ones. */}
        {!refused && (
          <button
            onClick={connectWallet}
            disabled={isLoading}
            className="rc-btn"
          >
            {isLoading ? (
              <span className="lp-connecting rc-blink">CONNECTING</span>
            ) : (
              "CONNECT WALLET"
            )}
          </button>
        )}
      </div>
      {refused ? (
        <div className="lp-cta-note lp-cta-note--failed rc-mono" role="alert">
          Wallet did not connect.{" "}
          <button onClick={connectWallet} className="lp-cta-retry rc-mono">
            TRY AGAIN
          </button>
        </div>
      ) : (
        <div className="lp-cta-note rc-mono">
          Practice is two levels and costs nothing. A full run means buying in.
        </div>
      )}
    </div>
  );
};

export default WalletSection;
