/**
 * DreamdexMarketFeed - Real market data from DreamDEX, shaped for the game.
 *
 * The game's level generator already speaks OHLC. This module's only job is to
 * fetch real candles and hand them over in exactly that shape, so MarketAnalyzer
 * and GameplayModifiers keep working untouched.
 *
 * Docs: https://docs.dreamdex.io
 */

export const DREAMDEX_ENDPOINTS = {
  testnet: "https://stg.api.dreamdex.io/v0",
  mainnet: "https://api.dreamdex.io/v0",
};

/**
 * Markets a player can pick.
 *
 * `source` is the preferred network for terrain. Testnet has no stable market at
 * all, so easy mode is always a mainnet mirror; the rest prefer testnet and fall
 * back to a mirror only when testnet is too quiet to build levels from (see
 * resolveMarketSource). Anything resolved as mirrored must say so in the UI - a
 * demo that quietly fakes a market is a demo that gets caught.
 */
export const GAME_MARKETS = [
  {
    id: "stable",
    symbol: "USDC.e:USDso",
    source: "mainnet",
    alwaysMirrored: true,
    /*
     * There is no USDC.e market on the testnet - the exchange lists only
     * WBTC, WETH and SOMI there. Its price history still makes the flattest,
     * gentlest terrain in the game, so it stays as something to play in the
     * practice taster, where nothing is bought; buying it for real is only
     * possible on mainnet.
     */
    tradesOn: "mainnet",
    label: "Stablecoin (USDC.e)",
    blurb: "Barely moves. Flat ground, gentle ride - start here.",
  },
  {
    id: "somi",
    symbol: "SOMI:USDso",
    source: "testnet",
    label: "SOMI",
    blurb: "Choppy and cheap. The everyday market.",
  },
  {
    id: "weth",
    symbol: "WETH:USDso",
    source: "testnet",
    label: "Ether (WETH)",
    blurb: "Real trends, real swings. The middle road.",
  },
  {
    id: "wbtc",
    symbol: "WBTC:USDso",
    source: "testnet",
    label: "Bitcoin (WBTC)",
    blurb: "Jagged cliffs and a high entry price. High roller.",
  },
];

/**
 * Difficulty comes from the timeframe, not from a slider.
 *
 * Short timeframes are noisy but small; long ones carry real structure. This
 * ordering lines up with the difficulty table MarketAnalyzer already holds, so
 * later levels get tougher blocks and smarter enemies for free.
 */
/**
 * Market a run uses when the player has not picked one yet.
 *
 * Somnia's own market rather than the stablecoin: the tutorial pair is
 * deliberately flat, which makes a poor first impression for someone who just
 * pressed play.
 */
export const DEFAULT_MARKET_ID = "somi";

/**
 * The default market's trading pair, derived rather than repeated.
 *
 * The trading panel needs a symbol before the menu has published a choice.
 * Writing "SOMI:USDso" there by hand is how the panel ended up buying one
 * market while the player played another, so it is looked up here instead.
 */
export const DEFAULT_MARKET_SYMBOL = GAME_MARKETS.find(
  (market) => market.id === DEFAULT_MARKET_ID
).symbol;

export const LEVEL_TIMEFRAMES = [
  { interval: "1m", windowsBack: 0 },
  { interval: "5m", windowsBack: 0 },
  { interval: "15m", windowsBack: 0 },
  { interval: "1h", windowsBack: 0 },
  { interval: "4h", windowsBack: 0 },
  { interval: "1d", windowsBack: 0 },
  // Same timeframe as level 6, but the window before it - otherwise the last
  // two levels would be the exact same terrain twice.
  { interval: "1d", windowsBack: 1 },
];

/** Every timeframe the exchange serves, shortest first. */
export const INTERVAL_LADDER = ["1m", "5m", "15m", "1h", "4h", "1d"];

const INTERVAL_MS = {
  "1m": 60 * 1000,
  "5m": 5 * 60 * 1000,
  "15m": 15 * 60 * 1000,
  "1h": 60 * 60 * 1000,
  "4h": 4 * 60 * 60 * 1000,
  "1d": 24 * 60 * 60 * 1000,
};

const REQUEST_TIMEOUT_MS = 10000;

/**
 * Fewest candles that still make a level worth playing. Below this there isn't
 * enough terrain to shoot across.
 */
const MIN_CANDLES = 5;

export class DreamdexMarketFeed {
  /**
   * Look up a market definition by its id.
   * @param {string} marketId
   * @returns {object} market definition (falls back to the stable pair)
   */
  static getMarket(marketId) {
    return (
      GAME_MARKETS.find((market) => market.id === marketId) || GAME_MARKETS[0]
    );
  }

  /**
   * Fetch raw candles for one market and timeframe.
   * @param {object} options
   * @param {string} options.symbol - e.g. "SOMI:USDso"
   * @param {string} options.source - "testnet" | "mainnet"
   * @param {string} options.interval - 1m | 5m | 15m | 1h | 4h | 1d
   * @param {number} options.limit - how many candles
   * @param {number} [options.endTime] - epoch ms; fetch the window ending here
   * @returns {Promise<Array>} normalized candles, oldest first
   */
  static async fetchCandles({ symbol, source, interval, limit, endTime }) {
    const base = DREAMDEX_ENDPOINTS[source] || DREAMDEX_ENDPOINTS.testnet;
    const params = new URLSearchParams({ interval, limit: String(limit) });
    if (endTime) params.set("endTime", String(endTime));
    const url = `${base}/markets/${encodeURIComponent(
      symbol
    )}/candles?${params.toString()}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`DreamDEX ${response.status} for ${symbol} ${interval}`);
      }
      const payload = await response.json();
      return this.normalizeCandles(payload.candles || []);
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Turn the API's string-valued OHLC into the numeric shape the game expects.
   *
   * Candles that break OHLC invariants (a high below the body, say) are dropped
   * rather than repaired - the level generator's own validator would reject them
   * later anyway, and a silently corrected candle is a silently wrong level.
   *
   * @param {Array} rawCandles
   * @returns {Array} candles the game can build terrain from
   */
  static normalizeCandles(rawCandles) {
    return rawCandles
      .map((candle) => {
        const open = Number(candle.open);
        const high = Number(candle.high);
        const low = Number(candle.low);
        const close = Number(candle.close);

        return {
          open,
          high,
          low,
          close,
          isBullish: close > open,
          volume: Number(candle.volume) || 0,
          timestamp: Number(candle.timestamp) || 0,
        };
      })
      .filter(
        (candle) =>
          Number.isFinite(candle.open) &&
          Number.isFinite(candle.high) &&
          Number.isFinite(candle.low) &&
          Number.isFinite(candle.close) &&
          candle.low > 0 &&
          candle.high >= Math.max(candle.open, candle.close) &&
          candle.low <= Math.min(candle.open, candle.close)
      );
  }

  /**
   * Decide where a market's terrain should be read from.
   *
   * Testnet liquidity comes and goes. A market that is busy today can be silent
   * next week, and a silent market yields the same zoomed-out window for every
   * level - seven identical stages. So instead of trusting a hard-coded flag
   * that will go stale, probe the preferred network once and mirror from
   * mainnet only when the preferred one genuinely cannot supply a level.
   *
   * A market resolved to `mirrored` must be labelled as such in the UI.
   *
   * @param {object} market - entry from GAME_MARKETS
   * @returns {Promise<object>} {source, mirrored}
   */
  static async resolveMarketSource(market) {
    if (market.alwaysMirrored) {
      return { source: "mainnet", mirrored: true };
    }

    // Probe the middle of the ladder rather than the shortest timeframe. A
    // one-minute gap is normal even on a healthy market - nobody traded for a
    // minute - and treating that as death would bounce a market in and out of
    // mirroring between runs. Failing at fifteen minutes is the real signal
    // that there is not enough trading here to build a run from.
    const probe = await this.fetchLevelCandles({
      symbol: market.symbol,
      source: market.source,
      interval: "15m",
      limit: 11,
    });

    if (probe && !probe.zoomedOut) {
      return { source: market.source, mirrored: false };
    }

    return { source: "mainnet", mirrored: true };
  }

  /**
   * Fetch enough candles to build one level, climbing to longer timeframes when
   * a short one comes back empty.
   *
   * Thin markets genuinely have nothing to show on a one-minute view - if nobody
   * traded, there are no candles, and the exchange rightly returns none rather
   * than inventing them. Asking for a longer timeframe covers more time and so
   * usually finds trades. The level is still real, just zoomed out.
   *
   * @param {object} options
   * @param {string} options.symbol
   * @param {string} options.source
   * @param {string} options.interval - preferred timeframe
   * @param {number} options.limit - how many candles the level wants
   * @param {number} [options.windowsBack] - 0 = most recent window, 1 = the one
   *   before it, and so on
   * @returns {Promise<object|null>} {candles, interval, requestedInterval, zoomedOut}
   *   or null when even the longest timeframe has too little history
   */
  static async fetchLevelCandles({
    symbol,
    source,
    interval,
    limit,
    windowsBack = 0,
  }) {
    const startAt = Math.max(0, INTERVAL_LADDER.indexOf(interval));
    const attempts = INTERVAL_LADDER.slice(startAt);

    for (const [zoomSteps, attempt] of attempts.entries()) {
      // Levels that start at different timeframes can zoom out onto the same
      // one. Stepping the window back by how far we zoomed keeps their terrain
      // distinct instead of serving the same stage twice.
      const offsetWindows = windowsBack + zoomSteps;
      let candles = [];
      try {
        candles = await this.fetchCandles({
          symbol,
          source,
          interval: attempt,
          limit,
          endTime: offsetWindows
            ? Date.now() - offsetWindows * limit * INTERVAL_MS[attempt]
            : undefined,
        });
      } catch {
        // Network or API failure on this timeframe - try a longer one before
        // giving up on the market entirely.
        continue;
      }

      if (candles.length >= MIN_CANDLES) {
        return {
          candles,
          interval: attempt,
          requestedInterval: interval,
          zoomedOut: attempt !== interval,
        };
      }
    }

    return null;
  }

  /**
   * Describe the window a set of candles covers, so a run can be named,
   * shared and replayed: "Ether, 14:00-17:30 today".
   * @param {Array} candles - normalized candles
   * @returns {object|null} {from, to} as epoch milliseconds
   */
  static describeWindow(candles) {
    if (!candles.length) return null;
    return {
      from: candles[0].timestamp,
      to: candles[candles.length - 1].timestamp,
    };
  }
}
