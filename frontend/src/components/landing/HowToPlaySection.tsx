const HowToPlaySection = () => {
  return (
    <section className="lp-htp">
      <h2 className="lp-htp-title rc-pixel">HOW A RUN WORKS</h2>

      {/* The four steps in order. Numbered because this genuinely is a
          sequence - each step needs the one before it to have happened. */}
      <ol className="lp-run">
        <li className="lp-run-step">
          <span className="lp-run-num rc-pixel">01</span>
          <div className="lp-run-body">
            <h3 className="lp-run-title rc-pixel">PICK A PAIR</h3>
            <p className="lp-run-copy">
              This one choice decides everything: its real price history
              becomes the walls you shoot over, and its live order flow shakes
              the field while you aim. A stablecoin makes flat, gentle ground.
              Bitcoin throws up cliffs.
            </p>
          </div>
        </li>
        <li className="lp-run-step">
          <span className="lp-run-num rc-pixel">02</span>
          <div className="lp-run-body">
            <h3 className="lp-run-title rc-pixel">BUY IN</h3>
            <p className="lp-run-copy">
              Your stake buys that pair, for real, on DreamDEX. This is the
              start button — and how much you hold is how far your rocket
              reaches. A floor sits ten percent below what you paid, and you
              can rest it on the exchange so it holds even with the tab shut.
            </p>
          </div>
        </li>
        <li className="lp-run-step">
          <span className="lp-run-num rc-pixel">03</span>
          <div className="lp-run-body">
            <h3 className="lp-run-title rc-pixel">FIRE, AND FEEL THE MARKET</h3>
            <p className="lp-run-copy">
              A big trade prints and the whole field shudders. A widening
              spread pushes your rocket sideways. When the money resting at
              the best prices thins out, your blasts reach further. And if the
              price breaks the level&apos;s own high or low, a wall comes down
              in front of you.
            </p>
          </div>
        </li>
        <li className="lp-run-step">
          <span className="lp-run-num rc-pixel">04</span>
          <div className="lp-run-body">
            <h3 className="lp-run-title rc-pixel">CASH OUT OR PLAY ON</h3>
            <p className="lp-run-copy">
              <span className="lp-key rc-pixel">F</span> buys more of the same
              pair and hits harder.{" "}
              <span className="lp-key rc-pixel">E</span> sells out and you keep
              playing at base strength — cashing out never ends your run. Seven
              levels finished posts your score and earns WICK.
            </p>
          </div>
        </li>
      </ol>

      <h2 className="lp-htp-title rc-pixel">CONTROLS AND SCORING</h2>

      <div className="lp-htp-grid">
        {/* Controls */}
        <div className="rc-panel">
          <h3 className="rc-panel-head rc-panel-head--gain lp-htp-card-head">
            CONTROLS
          </h3>
          <div className="rc-panel-body lp-htp-card-body">
            <div className="lp-key-row">
              <span className="lp-key rc-pixel">W</span>
              <span className="lp-key rc-pixel">S</span>
              <span className="lp-key-label">Power, 5% steps</span>
            </div>
            <div className="lp-key-row">
              <span className="lp-key rc-pixel">A</span>
              <span className="lp-key rc-pixel">D</span>
              <span className="lp-key-label">Angle, 2&deg; steps</span>
            </div>
            <div className="lp-key-row">
              <span className="lp-key lp-key--wide rc-pixel">SPACE</span>
              <span className="lp-key-label">Fire now</span>
            </div>
            <div className="lp-key-row">
              <span className="lp-key lp-key--drag rc-pixel">DRAG</span>
              <span className="lp-key-label">Touch: pull back to aim</span>
            </div>
          </div>
        </div>

        {/* Scoring */}
        <div className="rc-panel">
          <h3 className="rc-panel-head rc-panel-head--gain lp-htp-card-head">
            SCORING
          </h3>
          <div className="rc-panel-body lp-htp-card-body lp-score-body rc-pixel">
            <div className="lp-score-row">
              <span className="lp-score-label">ENEMY</span>
              <span className="lp-gain">+100</span>
            </div>
            <div className="lp-score-row">
              <span className="lp-score-label">ACCURACY</span>
              <span className="lp-gain">+50</span>
            </div>
            <div className="lp-score-row">
              <span className="lp-score-label">LEVEL CLEAR</span>
              <span className="lp-gain">+200</span>
            </div>
            <div className="lp-score-row">
              <span className="lp-score-label">PERFECT</span>
              <span className="lp-gain">+500</span>
            </div>
            <div className="lp-score-row lp-score-row--miss">
              <span className="lp-score-label">MISS</span>
              <span className="lp-loss">-25</span>
            </div>
          </div>
        </div>

        {/* Modes */}
        <div className="rc-panel">
          <h3 className="rc-panel-head rc-panel-head--gain lp-htp-card-head">
            MODES
          </h3>
          <div className="rc-panel-body lp-htp-card-body">
            <div className="lp-mode">
              <div className="lp-mode-head rc-pixel">CLASSIC</div>
              <p className="lp-mode-copy">
                Seven levels, three attempts each.
              </p>
            </div>
            <div className="lp-mode lp-mode--soon">
              <div className="lp-mode-head rc-pixel">
                TIME ATTACK <span className="lp-soon rc-pixel">SOON</span>
              </div>
              <p className="lp-mode-copy">Clear as fast as you can.</p>
            </div>
            <div className="lp-mode lp-mode--soon">
              <div className="lp-mode-head rc-pixel">
                PRECISION <span className="lp-soon rc-pixel">SOON</span>
              </div>
              <p className="lp-mode-copy">Fewer shots, tighter margins.</p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HowToPlaySection;
