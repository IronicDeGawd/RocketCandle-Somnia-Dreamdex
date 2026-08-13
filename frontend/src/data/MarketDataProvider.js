import {
  DreamdexMarketFeed,
  LEVEL_TIMEFRAMES,
} from "./DreamdexMarketFeed.js";

/**
 * MarketDataProvider - Provides candlestick market data for game levels
 *
 * Levels are built from real DreamDEX trading history when it is available, and
 * from the synthetic generator when it is not. The synthetic path is kept as a
 * fallback rather than deleted: a network blip must never leave a player staring
 * at an empty screen.
 */
export class MarketDataProvider {
  /**
   * Static configuration for game levels
   */
  static LEVEL_CONFIGURATIONS = [
    {
      name: "Bull Market Basics",
      difficulty: "Easy",
      candleCount: 8,
      marketParams: { trend: "up", volatility: "low" },
    },
    {
      name: "Bear Market Challenge",
      difficulty: "Easy",
      candleCount: 9,
      marketParams: { trend: "down", volatility: "low" },
    },
    {
      name: "Sideways Consolidation",
      difficulty: "Medium",
      candleCount: 10,
      marketParams: { trend: "sideways", volatility: "medium" },
    },
    {
      name: "Volatile Bull Run",
      difficulty: "Medium",
      candleCount: 11,
      marketParams: { trend: "up", volatility: "high" },
    },
    {
      name: "Crash and Burn",
      difficulty: "Hard",
      candleCount: 11,
      marketParams: { trend: "down", volatility: "high" },
    },
    {
      name: "Market Chaos",
      difficulty: "Hard",
      candleCount: 11,
      marketParams: { trend: "mixed", volatility: "high" },
    },
    {
      name: "Trading Apocalypse",
      difficulty: "Extreme",
      candleCount: 11,
      marketParams: { trend: "mixed", volatility: "extreme" },
    },
  ];

  /**
   * Generate all game levels from synthetic data.
   *
   * This is the offline fallback. For real market terrain use
   * generateLiveGameLevels, which is asynchronous because it has to ask the
   * exchange.
   *
   * @returns {Array} Array of level objects with candlestick data
   */
  static generateGameLevels() {
    return this.LEVEL_CONFIGURATIONS.map((config, index) => ({
      ...config,
      levelIndex: index,
      live: false,
      candlesticks: this.generateStaticOHLCData(
        config.candleCount,
        config.marketParams
      ),
    }));
  }

  /**
   * Generate static OHLC candlestick data for a level
   * @param {number} count - Number of candlesticks to generate
   * @param {object} params - Market parameters (trend, volatility)
   * @returns {Array} Array of OHLC candlestick objects
   */
  static generateStaticOHLCData(count, params) {
    const candlesticks = [];
    let basePrice = 100; // Starting price
    const { trend, volatility } = params;

    // Set volatility multipliers
    const volatilityMultiplier =
      {
        low: 0.5,
        medium: 1.0,
        high: 1.8,
        extreme: 2.5,
      }[volatility] || 1.0;

    // Set trend direction
    const trendMultiplier =
      {
        up: 0.3,
        down: -0.3,
        sideways: 0,
        mixed: 0,
      }[trend] || 0;

    for (let i = 0; i < count; i++) {
      // Calculate trend influence
      const trendInfluence =
        trend === "mixed"
          ? Math.sin(i * 0.5) * 0.4 // Sinusoidal for mixed
          : trendMultiplier;

      // Generate random price movement
      const priceChange =
        (Math.random() - 0.5) * 8 * volatilityMultiplier + trendInfluence;

      basePrice = Math.max(20, basePrice + priceChange); // Prevent prices below 20

      // Generate OHLC values
      const open = basePrice;
      const volatilityRange = Math.random() * 5 * volatilityMultiplier + 1;

      // Determine if candle is bullish or bearish
      const isBullish = Math.random() > 0.5;
      const direction = isBullish ? 1 : -1;

      const close = open + Math.random() * 4 * direction * volatilityMultiplier;
      const high = Math.max(open, close) + Math.random() * volatilityRange;
      const low = Math.min(open, close) - Math.random() * volatilityRange;

      candlesticks.push({
        open: Math.round(open * 100) / 100,
        high: Math.round(high * 100) / 100,
        low: Math.round(low * 100) / 100,
        close: Math.round(close * 100) / 100,
        isBullish: close > open,
        volume: Math.floor(Math.random() * 1000000) + 100000, // Fake volume
      });

      basePrice = close; // Next candle starts where this one ended
    }

    return candlesticks;
  }

  /**
   * Get level configuration by index
   * @param {number} levelIndex - Index of the level (0-based)
   * @returns {object} Level configuration object
   */
  static getLevelConfig(levelIndex) {
    if (levelIndex < 0 || levelIndex >= this.LEVEL_CONFIGURATIONS.length) {
      console.warn(`⚠️ Invalid level index: ${levelIndex}`);
      return this.LEVEL_CONFIGURATIONS[0]; // Return first level as fallback
    }
    return this.LEVEL_CONFIGURATIONS[levelIndex];
  }

  /**
   * Get total number of available levels
   * @returns {number} Total number of levels
   */
  static getTotalLevels() {
    return this.LEVEL_CONFIGURATIONS.length;
  }

  /**
   * Generate synthetic candlestick data for a specific level
   * @param {number} levelIndex - Index of the level
   * @returns {Array} Candlestick data for the level
   */
  static generateLevelData(levelIndex) {
    const config = this.getLevelConfig(levelIndex);
    return this.generateStaticOHLCData(config.candleCount, config.marketParams);
  }

  /**
   * Name a level after what the market actually did.
   *
   * The static names belong to the synthetic dials, where a level called "Crash
   * and Burn" was crashing by construction. Real history has its own opinion, so
   * the title is read off the candles instead - a flat market must never be
   * presented as a crash, or the whole "this is real trading" claim falls over.
   *
   * @param {object} analysis - output of getMarketAnalysis
   * @returns {object} {name, difficulty}
   */
  static describeLevel(analysis) {
    const { trend, volatilityLevel } = analysis;
    const wild = volatilityLevel === "high" || volatilityLevel === "extreme";

    let name;
    if (trend === "bullish") {
      name = wild ? "Volatile Bull Run" : "Bull Market Basics";
    } else if (trend === "bearish") {
      if (volatilityLevel === "extreme") name = "Trading Apocalypse";
      else if (volatilityLevel === "high") name = "Crash and Burn";
      else name = "Bear Market Challenge";
    } else {
      name = wild ? "Market Chaos" : "Sideways Consolidation";
    }

    const difficulty = {
      low: "Easy",
      medium: "Medium",
      high: "Hard",
      extreme: "Extreme",
    }[volatilityLevel];

    return { name, difficulty };
  }

  /**
   * Build every level for a run out of one market's real trading history.
   *
   * Each level takes a longer timeframe than the last, so difficulty rises with
   * the size of the moves rather than with an invented difficulty dial. Any
   * level the exchange cannot supply falls back to synthetic data on its own,
   * so one quiet stretch of the market cannot sink a whole run.
   *
   * @param {string} marketId - id from GAME_MARKETS
   * @returns {Promise<object>} {market, mirrored, source, levels}
   */
  static async generateLiveGameLevels(marketId) {
    const market = DreamdexMarketFeed.getMarket(marketId);
    let resolved;

    try {
      resolved = await DreamdexMarketFeed.resolveMarketSource(market);
    } catch {
      // Cannot reach the exchange at all - the whole run is synthetic, and the
      // caller is told so rather than being handed fake data as if it were real.
      return {
        market,
        source: null,
        mirrored: false,
        live: false,
        levels: this.generateGameLevels(),
      };
    }

    const levels = await Promise.all(
      this.LEVEL_CONFIGURATIONS.map(async (config, index) => {
        const timeframe = LEVEL_TIMEFRAMES[index] || LEVEL_TIMEFRAMES[0];
        let fetched = null;

        try {
          fetched = await DreamdexMarketFeed.fetchLevelCandles({
            symbol: market.symbol,
            source: resolved.source,
            interval: timeframe.interval,
            limit: config.candleCount,
            windowsBack: timeframe.windowsBack,
          });
        } catch {
          fetched = null;
        }

        if (!fetched) {
          return {
            ...config,
            levelIndex: index,
            live: false,
            interval: timeframe.interval,
            window: null,
            candlesticks: this.generateStaticOHLCData(
              config.candleCount,
              config.marketParams
            ),
          };
        }

        const analysis = this.getMarketAnalysis(fetched.candles);

        return {
          ...config,
          ...(analysis ? this.describeLevel(analysis) : {}),
          levelIndex: index,
          live: true,
          interval: fetched.interval,
          zoomedOut: fetched.zoomedOut,
          window: DreamdexMarketFeed.describeWindow(fetched.candles),
          candlesticks: fetched.candles,
        };
      })
    );

    return {
      market,
      source: resolved.source,
      mirrored: resolved.mirrored,
      live: levels.some((level) => level.live),
      levels,
    };
  }

  /**
   * Validate candlestick data format
   * @param {Array} candlesticks - Array of candlestick objects
   * @returns {boolean} Whether data is valid
   */
  static validateCandlestickData(candlesticks) {
    if (!Array.isArray(candlesticks) || candlesticks.length === 0) {
      return false;
    }

    return candlesticks.every(
      (candle) =>
        candle.hasOwnProperty("open") &&
        candle.hasOwnProperty("high") &&
        candle.hasOwnProperty("low") &&
        candle.hasOwnProperty("close") &&
        typeof candle.open === "number" &&
        typeof candle.high === "number" &&
        typeof candle.low === "number" &&
        typeof candle.close === "number" &&
        candle.high >= Math.max(candle.open, candle.close) &&
        candle.low <= Math.min(candle.open, candle.close)
    );
  }

  /**
   * Get market analysis for educational purposes
   * @param {Array} candlesticks - Candlestick data
   * @returns {object} Market analysis object
   */
  static getMarketAnalysis(candlesticks) {
    if (!this.validateCandlestickData(candlesticks)) {
      return null;
    }

    const first = candlesticks[0];
    const last = candlesticks[candlesticks.length - 1];
    const priceChange = ((last.close - first.open) / first.open) * 100;

    // Calculate average volatility
    const avgVolatility =
      candlesticks.reduce((sum, candle) => {
        return sum + (candle.high - candle.low) / candle.close;
      }, 0) / candlesticks.length;

    // Is this a trend, or just wandering?
    //
    // A fixed percentage cutoff cannot answer that across timeframes: 0.5% in a
    // minute is a stampede, 0.5% in a day is nothing. So compare the net move
    // against how far this market wanders anyway - a price bouncing randomly
    // drifts roughly with the square root of the number of steps, so anything
    // beyond that is real direction rather than noise.
    //
    // The step size is measured close-to-close, deliberately. A candle's full
    // high-to-low sweep counts motion in both directions, which overstates how
    // far the price actually travelled and buries genuine trends.
    let stepSum = 0;
    for (let i = 1; i < candlesticks.length; i++) {
      const previous = candlesticks[i - 1].close;
      stepSum += Math.abs(candlesticks[i].close - previous) / previous;
    }
    const meanStep = stepSum / Math.max(1, candlesticks.length - 1);

    const netMove = (last.close - first.open) / first.open;
    const expectedDrift =
      meanStep * Math.sqrt(candlesticks.length) || Number.EPSILON;
    const trendSignal = netMove / expectedDrift;

    // A market that has barely moved in absolute terms is flat no matter what
    // the ratio says - this keeps a stablecoin's rounding noise from being
    // reported as a trend.
    const FLAT_THRESHOLD = 0.0025; // 0.25%
    const TREND_THRESHOLD = 1;

    let trend = "sideways";
    if (Math.abs(netMove) >= FLAT_THRESHOLD) {
      if (trendSignal > TREND_THRESHOLD) trend = "bullish";
      else if (trendSignal < -TREND_THRESHOLD) trend = "bearish";
    }

    let volatilityLevel = "low";
    if (avgVolatility > 0.05) volatilityLevel = "extreme";
    else if (avgVolatility > 0.03) volatilityLevel = "high";
    else if (avgVolatility > 0.015) volatilityLevel = "medium";

    return {
      trend,
      priceChange: Math.round(priceChange * 100) / 100,
      volatilityLevel,
      avgVolatility: Math.round(avgVolatility * 10000) / 100, // Convert to percentage
      candleCount: candlesticks.length,
    };
  }
}
