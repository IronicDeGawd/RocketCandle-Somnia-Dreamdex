import WalletSection from "../wallet/WalletSection";

interface HeroSectionProps {
  onDashboard?: () => void;
  onStartGame?: () => void;
}

const HeroSection = ({ onDashboard, onStartGame }: HeroSectionProps) => {
  return (
    <section className="lp-hero">
      <div className="lp-hero-content">
        <h1 className="rc-title lp-hero-title">
          AIM A ROCKET
          <br />
          ACROSS A <span className="lp-accent-yellow">MARKET</span>
        </h1>
        <p className="lp-hero-copy">
          Every barrier in the level is one candlestick from real trading.
          Seven levels, three attempts each. Clear the enemies on top before
          you run out.
        </p>

        {/* Wallet Connection Section */}
        <WalletSection onDashboard={onDashboard} onStartGame={onStartGame} />
      </div>

      {/* Decorative game preview — not the live game, just shows what one
          screen looks like: a rocket on a market floor made of candles. */}
      <div className="lp-hero-art" aria-hidden="true">
        <div className="lp-preview">
          <div className="lp-preview-ground" />

          <div className="lp-preview-rocket">
            <div className="lp-preview-rocket-fin" />
            <div className="lp-preview-rocket-body" />
          </div>

          <div className="lp-preview-trail" style={{ left: 112, top: 104 }} />
          <div
            className="lp-preview-trail"
            style={{ left: 164, top: 76, opacity: 0.75 }}
          />
          <div
            className="lp-preview-trail"
            style={{ left: 216, top: 62, opacity: 0.5 }}
          />
          <div
            className="lp-preview-trail"
            style={{ left: 268, top: 68, opacity: 0.3 }}
          />

          <div className="lp-preview-candles">
            <div className="lp-preview-candle-group">
              <div className="lp-preview-enemy">
                <span />
                <span />
              </div>
              <div className="lp-preview-body lp-preview-body--yellow" style={{ height: 46 }} />
            </div>
            <div className="lp-preview-candle-group">
              <div className="lp-preview-enemy">
                <span />
                <span />
              </div>
              <div className="lp-preview-cap" />
              <div className="lp-preview-body lp-preview-body--blue" style={{ height: 92 }} />
            </div>
            <div className="lp-preview-candle-group">
              <div className="lp-preview-cap" />
              <div className="lp-preview-body lp-preview-body--yellow" style={{ height: 138 }} />
            </div>
          </div>

          <div className="lp-preview-hud lp-preview-hud--score rc-pixel">
            SCORE 1240
          </div>
          <div className="lp-preview-hud lp-preview-hud--enemies rc-pixel">
            ENEMIES 09
          </div>
        </div>
      </div>
    </section>
  );
};

export default HeroSection;
