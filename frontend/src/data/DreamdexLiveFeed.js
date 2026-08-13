/**
 * DreamdexLiveFeed - the market's pulse, pushed in while you play.
 *
 * The terrain a player shoots across is history. This is the present: every
 * trade somebody else lands on the same market arrives here within a moment of
 * happening, and the game turns it into something the player can feel.
 *
 * Read-only. Nothing here places an order or spends anything.
 */

export const DREAMDEX_WS_ENDPOINTS = {
  testnet: "wss://stg.api.dreamdex.io/v0/ws/public",
  mainnet: "wss://api.dreamdex.io/v0/ws/public",
};

/** Wait between reconnect attempts, growing up to a ceiling. */
const RECONNECT_BASE_MS = 1000;
const RECONNECT_MAX_MS = 15000;

export class DreamdexLiveFeed {
  /**
   * @param {object} options
   * @param {string} options.symbol - e.g. "SOMI:USDso"
   * @param {string} options.source - "testnet" | "mainnet"
   * @param {Function} [options.onTrade] - called with a normalized trade
   * @param {Function} [options.onCandle] - called when a candle updates
   * @param {Function} [options.onStatus] - called with "live" | "connecting" | "offline"
   */
  constructor({ symbol, source, onTrade, onCandle, onStatus }) {
    this.symbol = symbol;
    this.source = source;
    this.onTrade = onTrade || (() => {});
    this.onCandle = onCandle || (() => {});
    this.onStatus = onStatus || (() => {});

    this.socket = null;
    this.closed = false;
    this.attempt = 0;
    this.reconnectTimer = null;

    // Trade sizes only mean something next to other trades on the same market:
    // a quarter of a bitcoin is enormous, a quarter of a SOMI is nothing. So
    // "big" is judged against what this market has actually been doing.
    this.recentNotionals = [];
  }

  /** Open the connection and start listening. */
  connect() {
    if (this.closed) return;

    const url = DREAMDEX_WS_ENDPOINTS[this.source] || DREAMDEX_WS_ENDPOINTS.testnet;
    this.onStatus("connecting");

    try {
      this.socket = new WebSocket(url);
    } catch {
      this.scheduleReconnect();
      return;
    }

    this.socket.onopen = () => {
      this.attempt = 0;
      this.onStatus("live");
      this.send({
        operation: "subscribe",
        channel: "trades",
        params: { symbols: [this.symbol], limit: 20 },
      });
      this.send({
        operation: "subscribe",
        channel: "ohlcv",
        params: { symbol: this.symbol, timeframe: "1m" },
      });
    };

    this.socket.onmessage = (event) => this.handleMessage(event.data);

    this.socket.onerror = () => {
      // onclose always follows, and that is where reconnection is handled.
    };

    this.socket.onclose = () => {
      if (this.closed) return;
      this.onStatus("offline");
      this.scheduleReconnect();
    };
  }

  /**
   * @param {object} payload
   */
  send(payload) {
    if (this.socket && this.socket.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload));
    }
  }

  /**
   * @param {string} raw - a frame from the exchange
   */
  handleMessage(raw) {
    let message;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }

    if (message.operation === "ping") {
      this.send({ operation: "pong" });
      return;
    }

    if (message.channel === "trades") {
      if (message.type === "update" && message.trade) {
        this.emitTrade(message.trade);
      } else if (message.type === "snapshot" && Array.isArray(message.trades)) {
        // The snapshot is history, not news - it seeds the sense of what a
        // normal trade looks like here without firing effects for trades that
        // happened before the player arrived.
        message.trades.forEach((trade) => this.recordNotional(trade));
      }
      return;
    }

    if (message.channel === "ohlcv" && message.type === "update" && message.candle) {
      const candle = message.candle;
      this.onCandle({
        open: Number(candle.open),
        high: Number(candle.high),
        low: Number(candle.low),
        close: Number(candle.close),
        volume: Number(candle.volume) || 0,
        timestamp: Number(candle.timestamp) || 0,
      });
    }
  }

  /**
   * Remember how big a trade was, keeping only a recent window.
   * @param {object} trade - raw trade from the exchange
   * @returns {number} the trade's value in quote currency
   */
  recordNotional(trade) {
    const notional = Number(trade.price) * Number(trade.quantity);
    if (!Number.isFinite(notional) || notional <= 0) return 0;

    this.recentNotionals.push(notional);
    if (this.recentNotionals.length > 40) this.recentNotionals.shift();
    return notional;
  }

  /**
   * Turn a raw trade into something the game can react to.
   *
   * `magnitude` is the useful part: 1 means an ordinary trade for this market,
   * above 1 means unusually large. Effects scale off that rather than off a
   * raw amount, so the same code works for a market priced in cents and one
   * priced in tens of thousands.
   *
   * @param {object} trade
   */
  emitTrade(trade) {
    const notional = this.recordNotional(trade);
    if (!notional) return;

    const sorted = [...this.recentNotionals].sort((a, b) => a - b);
    const typical = sorted[Math.floor(sorted.length / 2)] || notional;

    this.onTrade({
      price: Number(trade.price),
      quantity: Number(trade.quantity),
      side: trade.side === "buy" ? "buy" : "sell",
      notional,
      magnitude: notional / typical,
      timestamp: Number(trade.timestamp) || 0,
    });
  }

  /** Reconnect after a growing pause, so a flaky network is not hammered. */
  scheduleReconnect() {
    if (this.closed || this.reconnectTimer) return;

    const wait = Math.min(
      RECONNECT_MAX_MS,
      RECONNECT_BASE_MS * Math.pow(2, this.attempt)
    );
    this.attempt += 1;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, wait);
  }

  /** Stop listening for good. */
  close() {
    this.closed = true;

    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.socket) {
      // Drop the handlers first so closing does not trigger a reconnect.
      this.socket.onclose = null;
      this.socket.onerror = null;
      this.socket.onmessage = null;
      try {
        this.socket.close();
      } catch {
        // Already gone - nothing to do.
      }
      this.socket = null;
    }
  }
}
