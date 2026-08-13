const FeaturesSection = () => {
  return (
    <div className="features">
      <div className="feature-card">
        <div className="feature-icon">🎯</div>
        <div className="feature-title">Physics Puzzle Game</div>
        <p>
          Master trajectory and timing to destroy enemies hidden in market data
          structures.
        </p>
      </div>

      <div className="feature-card">
        <div className="feature-icon">📈</div>
        <div className="feature-title">Market-Based Levels</div>
        <p>
          Navigate through 7 procedurally generated levels based on candlestick
          patterns.
        </p>
      </div>

      <div className="feature-card">
        <div className="feature-icon">🔗</div>
        <div className="feature-title">Blockchain Integration</div>
        <p>
          Scores stored on Somnia blockchain with WICK token rewards for
          achievements.
        </p>
      </div>

      <div className="feature-card">
        <div className="feature-icon">🏆</div>
        <div className="feature-title">Compete & Earn</div>
        <p>Climb the leaderboard and earn rewards for your gameplay skills.</p>
      </div>
    </div>
  );
};

export default FeaturesSection;