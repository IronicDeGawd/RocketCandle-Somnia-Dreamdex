const HowToPlaySection = () => {
  return (
    <section className="how-to-play-section">
      <div className="how-to-play-container">
        <h2 className="how-to-play-title">🎮 How to Play Rocket Candle</h2>

        <div className="how-to-play-grid">
          {/* Controls Section */}
          <div className="how-to-play-card">
            <div className="card-header">
              <div className="card-icon">🚀</div>
              <h3>Game Controls</h3>
            </div>
            <div className="controls-list">
              <div className="control-item">
                <div className="key-combo">
                  <img
                    src="/assets/buttons/w.png"
                    alt="W key"
                    className="key-icon small-key"
                  />
                  <img
                    src="/assets/buttons/s.png"
                    alt="S key"
                    className="key-icon small-key"
                  />
                </div>
                <span>Adjust launch power up/down</span>
              </div>
              <div className="control-item">
                <div className="key-combo">
                  <img
                    src="/assets/buttons/a.png"
                    alt="A key"
                    className="key-icon small-key"
                  />
                  <img
                    src="/assets/buttons/d.png"
                    alt="D key"
                    className="key-icon small-key"
                  />
                </div>
                <span>Adjust rocket angle (A=right, D=left)</span>
              </div>
              <div className="control-item">
                <div className="key-combo">
                  <img
                    src="/assets/buttons/space.png"
                    alt="Space key"
                    className="key-icon space-key"
                  />
                </div>
                <span>Launch rocket</span>
              </div>
              <div className="control-item">
                <div className="key-combo">🖱️ Mouse</div>
                <span>Aim launcher direction</span>
              </div>
              <div className="control-item">
                <div className="key-combo">📊 Sliders</div>
                <span>Fine-tune angle & power</span>
              </div>
            </div>
          </div>

          {/* Objectives Section */}
          <div className="how-to-play-card">
            <div className="card-header">
              <div className="card-icon">🎯</div>
              <h3>Game Objectives</h3>
            </div>
            <div className="objectives-list">
              <div className="objective-item">
                <div className="objective-icon-group">
                  <img
                    src="/assets/enemies/var1.png"
                    alt="Enemy"
                    className="target-icon small-sprite"
                  />
                  <img
                    src="/assets/enemies/var2.png"
                    alt="Enemy"
                    className="target-icon small-sprite"
                  />
                </div>
                <div>
                  <strong>Destroy All Enemies</strong>
                  <p>Eliminate all enemy characters to complete the level</p>
                </div>
              </div>
              <div className="objective-item">
                <div className="objective-icon-group">
                  <img
                    src="/assets/blocks/greencandle.png"
                    alt="Green candlestick"
                    className="target-icon small-sprite"
                  />
                  <img
                    src="/assets/blocks/redcandle.png"
                    alt="Red candlestick"
                    className="target-icon small-sprite"
                  />
                </div>
                <div>
                  <strong>Navigate Barriers</strong>
                  <p>
                    Use candlestick barriers strategically or avoid them
                    entirely
                  </p>
                </div>
              </div>
              <div className="objective-item">
                <div className="objective-icon-group">
                  <img
                    src="/assets/rocket.png"
                    alt="Rocket"
                    className="target-icon small-sprite"
                  />
                  <span className="objective-icon">📊</span>
                </div>
                <div>
                  <strong>Beat Market Volatility</strong>
                  <p>Complete all 7 levels based on real market patterns</p>
                </div>
              </div>
            </div>
          </div>

          {/* Scoring System */}
          <div className="how-to-play-card">
            <div className="card-header">
              <div className="card-icon">⭐</div>
              <h3>Scoring System</h3>
            </div>
            <div className="scoring-details">
              <div className="score-item">
                <span className="score-points">+100</span>
                <span>Enemy destroyed</span>
              </div>
              <div className="score-item">
                <span className="score-points">+50</span>
                <span>Bonus for accuracy</span>
              </div>
              <div className="score-item">
                <span className="score-points">+200</span>
                <span>Level completed</span>
              </div>
              <div className="score-item">
                <span className="score-points">+500</span>
                <span>Perfect level (no missed shots)</span>
              </div>
              <div className="score-item negative">
                <span className="score-points">-25</span>
                <span>Each missed shot</span>
              </div>
            </div>
          </div>

          {/* WICK Tokens */}
          <div className="how-to-play-card">
            <div className="card-header">
              <div className="card-icon">🪙</div>
              <h3>WICK Tokens</h3>
            </div>
            <div className="token-details">
              <div className="token-item">
                <div className="token-header">
                  <span className="token-icon">🏆</span>
                  <strong>Earning Tokens</strong>
                </div>
                <p>
                  Complete levels and achieve high scores to earn WICK
                  tokens
                </p>
              </div>
              <div className="token-item">
                <div className="token-header">
                  <span className="token-icon">⚡</span>
                  <strong>Token Uses</strong>
                </div>
                <ul>
                  <li>Purchase power-ups and upgrades</li>
                  <li>Unlock special rocket designs</li>
                  <li>Buy extra attempts per level</li>
                  <li>Access premium game modes</li>
                </ul>
              </div>
              <div className="token-item">
                <div className="token-header">
                  <span className="token-icon">🔗</span>
                  <strong>Blockchain Integration</strong>
                </div>
                <p>
                  All WICK tokens are stored securely on the Somnia
                  blockchain
                </p>
              </div>
            </div>
          </div>

          {/* Strategy Tips */}
          <div className="how-to-play-card">
            <div className="card-header">
              <div className="card-icon">💡</div>
              <h3>Pro Tips & Strategy</h3>
            </div>
            <div className="tips-list">
              <div className="tip-item">
                <span className="tip-number">1</span>
                <div>
                  <strong>Plan Your Shots</strong>
                  <p>
                    Study the level layout before firing - you have limited
                    attempts!
                  </p>
                </div>
              </div>
              <div className="tip-item">
                <span className="tip-number">2</span>
                <div>
                  <strong>Use Physics</strong>
                  <p>
                    Rockets bounce off walls and barriers - use this to reach
                    hidden enemies
                  </p>
                </div>
              </div>
              <div className="tip-item">
                <span className="tip-number">3</span>
                <div>
                  <strong>Master the Sliders</strong>
                  <p>
                    Fine-tune your shots with the angle and power sliders for
                    precision
                  </p>
                </div>
              </div>
              <div className="tip-item">
                <span className="tip-number">4</span>
                <div>
                  <strong>Watch the Trail</strong>
                  <p>
                    Follow your rocket&apos;s trail to understand trajectory patterns
                  </p>
                </div>
              </div>
              <div className="tip-item">
                <span className="tip-number">5</span>
                <div>
                  <strong>Market Patterns</strong>
                  <p>
                    Each level represents different market volatility - adapt
                    your strategy!
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Game Modes */}
          <div className="how-to-play-card">
            <div className="card-header">
              <div className="card-icon">🎲</div>
              <h3>Game Modes</h3>
            </div>
            <div className="modes-list">
              <div className="mode-item">
                <div className="mode-header">
                  <span className="mode-icon">📈</span>
                  <strong>Classic Mode</strong>
                </div>
                <p>
                  Progress through 7 levels of increasing difficulty based on
                  market patterns
                </p>
              </div>
              <div className="mode-item">
                <div className="mode-header">
                  <span className="mode-icon">⏱️</span>
                  <strong>Time Attack</strong>{" "}
                  <span className="coming-soon">Coming Soon</span>
                </div>
                <p>
                  Race against the clock to destroy enemies as fast as possible
                </p>
              </div>
              <div className="mode-item">
                <div className="mode-header">
                  <span className="mode-icon">🎯</span>
                  <strong>Precision Mode</strong>{" "}
                  <span className="coming-soon">Coming Soon</span>
                </div>
                <p>Limited shots with maximum accuracy challenges</p>
              </div>
            </div>
          </div>
        </div>

        <div className="how-to-play-footer">
          <div className="footer-tip">
            <span className="tip-icon">💎</span>
            <p>
              <strong>Ready to start your journey?</strong>
              <br />
              Connect your wallet and begin earning WICK tokens while
              having fun!
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowToPlaySection;