const FeaturesSection = () => {
  return (
    <div className="lp-features">
      {/* The design gives this strip no visible title - the numbers carry it.
          Without a heading here the outline jumps from the page title straight
          to the card titles, so the level is stated for anyone navigating by
          structure and hidden from everyone else. */}
      <h2 className="lp-sr-only">What this game is</h2>
      <div className="lp-feature-col">
        <div className="lp-feature-num lp-feature-num--red rc-pixel">01</div>
        <h3 className="lp-feature-title rc-pixel">
          LEVELS COME
          <br />
          FROM PRICE
        </h3>
        <p className="lp-feature-copy">
          A barrier&apos;s height is how far that candle moved. Seven levels,
          seven slices of history.
        </p>
      </div>

      <div className="lp-feature-col">
        <div className="lp-feature-num lp-feature-num--yellow rc-pixel">
          02
        </div>
        <h3 className="lp-feature-title rc-pixel">
          PHYSICS,
          <br />
          NOT LUCK
        </h3>
        <p className="lp-feature-copy">
          Angle and power are the whole game. Rockets bounce, so hidden
          enemies are reachable.
        </p>
      </div>

      <div className="lp-feature-col">
        <div className="lp-feature-num lp-feature-num--blue rc-pixel">03</div>
        <h3 className="lp-feature-title rc-pixel">
          SCORES ARE
          <br />
          RECORDED
        </h3>
        <p className="lp-feature-copy">
          Connected runs post to the weekly board and earn WICK. Practice
          runs do not.
        </p>
      </div>
    </div>
  );
};

export default FeaturesSection;
