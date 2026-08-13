import SomniaLogo from "../ui/SomniaLogo";
import WalletSection from "../wallet/WalletSection";

interface HeroSectionProps {
  onDashboard?: () => void;
  onStartGame?: () => void;
  onHowToPlay?: () => void;
}

const HeroSection = ({ onDashboard, onStartGame, onHowToPlay }: HeroSectionProps) => {
  const scrollToHowToPlay = () => {
    const howToPlaySection = document.querySelector(".how-to-play-section");
    if (howToPlaySection) {
      howToPlaySection.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  };

  return (
    <section className="hero-section">
      {/* Somnia Logo */}
      <SomniaLogo size="large" className="mb-8" />

      <h1 className="hero-title">🚀 Rocket Candle</h1>
      <p className="hero-subtitle">
        Blast through candlestick barriers and earn WICK tokens on the
        Somnia blockchain! Master physics-based gameplay in this revolutionary
        Web3 gaming experience.
      </p>

      {/* Wallet Connection Section */}
      <WalletSection 
        onDashboard={onDashboard} 
        onStartGame={onStartGame}
        onHowToPlay={onHowToPlay || scrollToHowToPlay}
      />

      {/* A way in for anyone without a wallet. Asking for one before the first
          shot loses most people who were only ever going to try it once. */}
      <p className="hero-practice">
        No wallet? <a href="/practice">Play a practice run</a> — real markets,
        nothing recorded.
      </p>
    </section>
  );
};

export default HeroSection;
