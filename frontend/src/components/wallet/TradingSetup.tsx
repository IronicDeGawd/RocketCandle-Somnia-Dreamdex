"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useAccount } from "wagmi";
import { GAME_MARKETS } from "@/data/DreamdexMarketFeed.js";
import { useExitPlan } from "@/hooks/useGameHud";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useTradingSession } from "@/hooks/useTradingSession";
import { useVaultReturn } from "@/hooks/useVaultReturn";
import { mapWalletError } from "@/lib/walletErrors";
import "@/app/trading.css";

/**
 * Turning real trading on, and taking it back off.
 *
 * Buying in - and the amount - happens on the run-setup screen, and PLAY is
 * what deposits and opens (`vault-as-transit.md` §1-§4). This panel's job is
 * narrower than it used to be: turn trading on once, watch the live position
 * while a run is on, revoke, and say plainly if a past run left money at the
 * exchange that has not come home yet.
 *
 * Gamers first: this panel is a door, not a wall. It starts closed and a
 * player who never opens it never sees a form.
 */

const STEP_LABELS: Record<string, string> = {
  "switching-network": "Switching to Somnia...",
  fuelling: "Sending the browser key its order fees...",
  approving: "Authorising this browser to trade...",
  depositing: "Depositing your commitment...",
  revoking: "Revoking...",
};

export interface TradingSetupProps {
  symbol: string;
  /**
   * Lift the panel out over the game while it is still the way in.
   *
   * Buying in is how a run starts, so before a position exists this cannot be
   * a box in a 212px side rail that a player has to go looking for. Once they
   * are in the market it drops back into the rail, because from then on it is
   * a readout to glance at rather than a step to take - and covering the game
   * with it would be in the way.
   */
  overlayUntilOpen?: boolean;
}

export default function TradingSetup({
  symbol,
  overlayUntilOpen = false,
}: TradingSetupProps) {
  const { address } = useAccount();
  const {
    sessionKey,
    authorized,
    step,
    error,
    keyGas,
    keyOutOfGas,
    keyGasFloor,
    keySweepPreview,
    sweepWarning,
    fuelKey,
    enable,
    revoke,
    depositFor,
    sweepHome,
  } = useSessionKey(symbol);
  const { bridge, snapshot, refresh } = useTradingSession(symbol, {
    // Adapting to what the bridge expects: no symbol (this hook is already
    // scoped to one). PLAY hands the bridge a number for the run's
    // commitment; this is the seam where that number reaches the owner-signed
    // deposit.
    depositCommitment: (amountUsdso) => depositFor(symbol, String(amountUsdso)),
    sweepHome: () => sweepHome(symbol),
  });
  const exits = useExitPlan();
  // Starts closed. This panel used to be a door the player could ignore; it is
  // now the start button, so folding it away would hide the only way into a
  // run behind a control captioned "Open".
  const [open, setOpen] = useState(false);
  const [stopTerms, setStopTerms] = useState<{
    deposit: number;
    slippageBps: number;
  } | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopResting, setStopResting] = useState(false);
  const [sellBusy, setSellBusy] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);

  /** How far the position may fall before it sells itself. */
  const FLOOR_DROP_PCT = 10;

  /*
   * The return notice, §5 of `vault-as-transit.md` - the ONLY place the
   * exchange's holding is ever shown, and only ever framed as "return", never
   * as a balance to manage. `useVaultReturn` already attempts the sweep on
   * its own on reconnect; this just reads what it found.
   */
  const {
    entries: strandedEntries,
    unreadable: strandedUnreadable,
    retry: retryReturn,
  } = useVaultReturn(address, sweepHome, {
    symbol,
    positionOpen: Boolean(snapshot?.open),
  });
  /*
   * Money actually seen at the exchange, kept apart from a market that could
   * not be read.
   *
   * These were one flag, so a market whose balance failed to read announced
   * "money from a past run is waiting to come home" - a claim about money to a
   * player whose pools were all empty. Unreadable means unknown, not stranded,
   * and the loud version of that message is the kind of false alarm that
   * teaches people to ignore the true one.
   */
  const hasStrandedMoney = strandedEntries.length > 0;
  const hasUnreadableMarket = strandedUnreadable.length > 0;
  const hasReturnNotice = hasStrandedMoney || hasUnreadableMarket;

  // What a resting stop costs, read from the exchange rather than assumed - the
  // deposit is set by the registry admin and can change between runs.
  useEffect(() => {
    let cancelled = false;
    if (!bridge?.canRestStop) return;

    bridge.stopTerms().then((terms) => {
      if (!cancelled) setStopTerms(terms);
    });

    return () => {
      cancelled = true;
    };
  }, [bridge]);

  // A stop only makes sense while there is a position to protect, and the
  // exchange clears it as soon as the position closes.
  useEffect(() => {
    if (!snapshot?.open) setStopResting(false);
  }, [snapshot?.open]);

  const handleRestStop = useCallback(async () => {
    if (!bridge) return;
    setStopBusy(true);
    setStopError(null);

    try {
      const armed = await bridge.restStop(FLOOR_DROP_PCT);
      setStopResting(Boolean(armed));
      if (!armed) setStopError("There is no open position to protect yet.");
    } catch (e) {
      console.error("Failed to rest stop:", e);
      setStopError(mapWalletError(e).message);
    } finally {
      setStopBusy(false);
    }
  }, [bridge]);

  const handleLiftStop = useCallback(async () => {
    if (!bridge) return;
    setStopBusy(true);
    setStopError(null);

    try {
      const lifted = await bridge.liftStop();
      if (lifted) setStopResting(false);
      else setStopError("The stop could not be lifted — try again.");
    } catch (e) {
      // A failed lift must never look like a successful one: `stopResting`
      // stays true, so the player keeps seeing "a stop is resting" rather
      // than being told, wrongly, that their floor is gone.
      console.error("Failed to lift stop:", e);
      setStopError(mapWalletError(e).message);
    } finally {
      setStopBusy(false);
    }
  }, [bridge]);

  const handleEnable = useCallback(async () => {
    await enable(symbol);
    await refresh();
  }, [enable, refresh, symbol]);

  /**
   * Sell the holding back to USDso, at any time.
   *
   * Selling only ever happened when a run ended, so a purchase made outside a
   * game had no exit at all. Ejecting mid-run does the same thing, but a
   * player who has not started a run cannot reach it.
   */
  const handleSellBack = useCallback(async () => {
    if (!bridge) return;
    setSellBusy(true);
    setSellError(null);

    try {
      const result = await bridge.close();
      if (!result) {
        setSellError("There was nothing open to sell.");
      } else if (result.sweepError) {
        // The P&L above is real and must not be held back for this - only the
        // pool-to-wallet sweep failed, and the money is recoverable rather
        // than lost. Same wording GameScene uses at run end.
        setSellError(
          `Sold back. Your money is still at the exchange and will be offered ` +
            `back - ${result.sweepError}`
        );
      }
      await refresh();
    } catch (e) {
      console.error("Failed to sell back position:", e);
      setSellError(mapWalletError(e).message);
    } finally {
      setSellBusy(false);
    }
  }, [bridge, refresh]);

  const busy = step !== "idle" && step !== "ready";
  const hasOpenStop = Boolean(bridge?.canRestStop && snapshot?.open);

  const enableLabel = busy
    ? STEP_LABELS[step] ?? "Working..."
    : error
      ? "Try again"
      : "Enable trading";

  /**
   * Once there is anything real here, the panel stops being collapsible.
   *
   * A player may fold it away before they have committed anything. Once a key
   * is authorised - and certainly once a position is open - folding it would
   * hide the stop controls and the running profit and loss while the market
   * kept moving, so from that point the toggle disappears.
   */
  const holdsSomethingReal = authorized || Boolean(snapshot?.open);
  const positionOpen = Boolean(snapshot?.open);

  /*
   * In the rail: a button. Everything else: in the modal it opens.
   *
   * This panel is a place you go, not a thing that watches you. Every previous
   * arrangement tried to be both - a readout that was also a form, folded and
   * unfolded by rules about what was authorised and what was open - and each
   * one ended up parked in a 212px column with a page of setup prose in it.
   * The rail now holds one control, and the sheet appears only when the player
   * asks for it.
   */
  const expanded = overlayUntilOpen ? true : open;
  const asOverlay = overlayUntilOpen && open;

  // Buying in is the answer to whatever the player opened this for, so the
  // sheet gets out of the way by itself once a position exists.
  useEffect(() => {
    if (snapshot?.open) setOpen(false);
  }, [snapshot?.open]);

  /*
   * Ask for setup once, unprompted, when a run cannot be bought yet.
   *
   * A connected player who has never set trading up arrives at a picker where
   * every market is unaffordable and the only clue is a button in the rail.
   * Opening the sheet the first time says what is missing instead of leaving
   * them to find it.
   *
   * Once only, tracked in a ref: a player who closes this has answered, and
   * reopening it on the next render would be an argument rather than a prompt.
   * Never while a position is open - that money is already working.
   */
  const askedForSetup = useRef(false);
  useEffect(() => {
    if (!overlayUntilOpen) return;
    if (askedForSetup.current) return;
    // `authorized` is false before the chain has been asked, so wait for a
    // wallet AND for the key state to have been read at least once.
    if (!address || authorized || snapshot?.open) return;
    if (!sessionKey) return;

    askedForSetup.current = true;
    setOpen(true);
  }, [overlayUntilOpen, address, authorized, snapshot?.open, sessionKey]);

  const returnNotice = hasReturnNotice ? (
    <>
      {strandedEntries.map((entry) => {
        const pair = entry.symbol.split(":")[0];
        const held: string[] = [];
        if (entry.quote > 0) held.push(`${entry.quote.toFixed(2)} USDso`);
        if (entry.base > 0) held.push(`${entry.base.toFixed(4)} ${pair}`);
        return (
          <div key={entry.marketId} className="ts-stop">
            <p className="ts-ready">
              <span className="rc-mono">{held.join(" and ")}</span> is still
              at the exchange from your last run on {pair}.{" "}
              {entry.attempting
                ? "Returning it now..."
                : "It will be offered back."}
            </p>
            {entry.error ? (
              <>
                <p className="ts-error" role="alert">
                  {entry.error}
                </p>
                <button
                  type="button"
                  className="rc-btn ts-btn-full"
                  onClick={() => retryReturn(entry.marketId)}
                  disabled={entry.attempting}
                >
                  Retry the return
                </button>
              </>
            ) : null}
          </div>
        );
      })}
      {strandedUnreadable.map((marketId) => {
        const market = GAME_MARKETS.find(
          (m: { id: string; label: string }) => m.id === marketId
        );
        const label = (market?.label ?? marketId).replace(/\s*\(.*\)$/, "");
        return (
          /*
           * A note, not an error.
           *
           * `ts-error` carries the red rule reserved for something that went
           * wrong with the player's money, and role="alert" interrupts a screen
           * reader. Not being able to reach one market is neither: it says
           * "unknown", which is worth stating and not worth alarming over. The
           * loud style is what makes a real warning ignorable.
           */
          <p key={marketId} className="ts-note" role="status">
            Could not check {label} for money left behind from a past run -
            this is not the same as there being nothing there.
          </p>
        );
      })}
    </>
  ) : null;

  const panel = (
    <section className={`ts-root${asOverlay ? " ts-root--overlay" : ""}`}>
      <div className="rc-panel ts-toggle-row">
        <div className="ts-toggle-copy">
          <h2 className="rc-pixel ts-heading">
            {snapshot?.open ? "Your position" : "Buy in to play"}
          </h2>
          <p className="ts-toggle-note">
            {hasStrandedMoney
              ? "Money from a past run is waiting to come home - open for details."
              : hasUnreadableMarket
                ? "One market could not be checked - open for details."
                : snapshot?.open
                  ? "Open in the market. It sells back when the run ends."
                  : holdsSomethingReal
                    ? "Trading is on. Buy in to start a run."
                    : "Buying into this pair is how a run starts."}
          </p>
        </div>
        {/* Always dismissible. Every previous version of this rule hid the
            control in some state, and each time that state turned out to be
            one a player could reach and then not leave. */}
        <button
          type="button"
          className="rc-btn rc-btn--primary"
          aria-expanded={expanded}
          aria-controls="trading-panel-body"
          onClick={() => setOpen((o) => !o)}
        >
          Close
        </button>
      </div>

      {expanded ? (
        <div id="trading-panel-body" className="rc-panel ts-panel">
          <div
            className={`rc-panel-head ${
              (!authorized && error) || step === "revoking"
                ? "rc-panel-head--warn"
                : authorized
                  ? "rc-panel-head--gain"
                  : ""
            }`}
          >
            {!authorized
              ? error && !busy
                ? "Setup failed"
                : busy
                  ? "Setting up trading"
                  : "Set up trading"
              : step === "revoking"
                ? "Revoking"
                : stopResting
                  ? "Stop resting"
                  : hasOpenStop
                    ? "Position open"
                    : "Trading on"}
          </div>

          <div className="ts-body">
            <p className="ts-blurb">
              Your stake buys the pair you are about to play, for real, on
              DreamDEX. That purchase is how a run starts, and how much you
              hold is how far your rocket reaches. It sells back when the run
              ends, and <span className="ts-key">E</span> ejects at any time
              without ending your game.
            </p>

            {returnNotice}

            {!authorized ? (
              <>
                {error ? (
                  <div className="ts-error" role="alert">
                    {error}
                  </div>
                ) : (
                  <ul className="ts-facts">
                    {/* One collapsed action, so the only facts worth stating
                        are the ones that decide whether to press it. */}
                    <li>
                      This browser gets its own trading key. It can place and
                      cancel orders and <strong>can never withdraw your
                      money</strong>.
                    </li>
                    <li>
                      This only turns trading on - buying in happens when you
                      pick a pair and press PLAY.
                    </li>
                  </ul>
                )}

                <button
                  onClick={handleEnable}
                  disabled={busy}
                  className="rc-btn rc-btn--primary ts-btn-full"
                >
                  {enableLabel}
                </button>
              </>
            ) : (
              <>
                <p className="ts-ready">
                  Trading is on. This browser&apos;s key{" "}
                  <span className="rc-mono">
                    {sessionKey?.address.slice(0, 10)}…
                  </span>{" "}
                  can trade for you, and nothing else.
                </p>

                {!snapshot?.open && keyOutOfGas ? (
                  /*
                   * Authorised but the key cannot pay for a transaction.
                   *
                   * The key sends its own orders, so it needs native STT of
                   * its own. An address that has never paid a fee does not
                   * exist as far as the network is concerned, so without this
                   * the first order fails with "account does not exist".
                   */
                  <div className="ts-stop">
                    <p className="ts-note">
                      The browser key holds{" "}
                      <span className="rc-mono">
                        {keyGas !== null ? keyGas.toFixed(3) : "…"} STT
                      </span>
                      , under the{" "}
                      <span className="rc-mono">{keyGasFloor.toFixed(3)} STT</span>{" "}
                      it needs to pay for its own orders right now. Top it up
                      and PLAY works again. Revoking hands back whatever it
                      is not going to spend - nothing stays behind.
                    </p>
                    <button
                      onClick={fuelKey}
                      disabled={busy}
                      className="rc-btn rc-btn--primary ts-btn-full"
                    >
                      {busy
                        ? STEP_LABELS[step] ?? "Working..."
                        : "Fund the key's order fees"}
                    </button>
                    {error ? (
                      <p className="ts-error" role="alert">
                        {error}
                      </p>
                    ) : null}
                  </div>
                ) : hasOpenStop ? (
                  <div className="ts-stop">
                    {stopResting ? (
                      <>
                        <p className="ts-ready">
                          A stop is resting on the exchange. If the price
                          falls <span className="rc-mono">
                            {FLOOR_DROP_PCT}%
                          </span>{" "}
                          below what you paid, your position sells itself —
                          whether or not this page is open.
                        </p>
                        <button
                          onClick={handleLiftStop}
                          disabled={stopBusy}
                          className="rc-btn ts-btn-full"
                        >
                          {stopBusy ? "Lifting..." : "Lift the stop"}
                        </button>
                      </>
                    ) : (
                      <>
                        <p className="ts-note">
                          Rest your <span className="rc-mono">
                            {FLOOR_DROP_PCT}%
                          </span>{" "}
                          floor on the exchange itself and it keeps working
                          with the tab closed. Costs one wallet signature
                          {stopTerms ? (
                            <>
                              {" and a "}
                              <span className="rc-mono">
                                {stopTerms.deposit} STT
                              </span>
                              {" deposit, refunded when you lift it"}
                            </>
                          ) : (
                            ""
                          )}
                          . It sells at whatever the book offers, within{" "}
                          <span className="rc-mono">
                            {stopTerms ? stopTerms.slippageBps / 100 : 5}%
                          </span>{" "}
                          of the trigger.
                        </p>
                        <button
                          onClick={handleRestStop}
                          disabled={stopBusy}
                          className="rc-btn ts-btn-blue ts-btn-full"
                        >
                          {stopBusy ? "Resting the stop..." : "Rest my stop on chain"}
                        </button>
                      </>
                    )}
                    {stopError ? (
                      <p className="ts-error" role="alert">
                        {stopError}
                      </p>
                    ) : null}
                  </div>
                ) : snapshot?.open ? (
                  <p className="ts-note">
                    A position is open. This market has no stop registry, so
                    the floor is watched by this page only — it will not hold
                    with the tab closed.
                  </p>
                ) : null}

                {snapshot?.open ? (
                  <div className="ts-stop">
                    {/* The exits chosen on the menu. They were shown in the
                        folded rail readout, and that readout is gone - so
                        without this the two prices that can sell your position
                        are stated nowhere on the screen. */}
                    <p className="ts-note">
                      Selling itself at{" "}
                      <span className="rc-mono">
                        {exits.floorPct ? `-${exits.floorPct}%` : "no floor"}
                      </span>{" "}
                      and{" "}
                      <span className="rc-mono">
                        {exits.targetPct ? `+${exits.targetPct}%` : "no target"}
                      </span>
                      , watched by this page while the run is on screen.
                    </p>
                    <button
                      onClick={handleSellBack}
                      disabled={sellBusy}
                      className="rc-btn rc-btn--primary ts-btn-full"
                    >
                      {sellBusy
                        ? "Selling back..."
                        : "Sell back to USDso"}
                    </button>
                    <p className="ts-note">
                      Closes the holding and returns the money to your wallet,
                      at whatever it is worth now. A run does this for you
                      when it ends; this is the way out when you are not
                      playing.
                    </p>
                    {sellError ? (
                      <p className="ts-error" role="alert">
                        {sellError}
                      </p>
                    ) : null}
                  </div>
                ) : null}

                <div className="ts-actions">
                  <button
                    onClick={() => revoke(symbol)}
                    disabled={busy}
                    className="rc-btn"
                  >
                    {step === "revoking"
                      ? "Revoking..."
                      : keySweepPreview
                        ? `Revoke and return ${keySweepPreview.toFixed(3)} STT`
                        : "Revoke this key"}
                  </button>
                </div>

                {sweepWarning ? (
                  <p className="ts-error" role="status" aria-live="polite">
                    {sweepWarning}
                  </p>
                ) : null}

                <p className="ts-note">
                  Revoking stops the key immediately, on chain. It never
                  touches money already at the exchange - that comes home on
                  its own when a run ends, or through the notice above if one
                  is waiting.
                </p>

                {error ? (
                  <p className="ts-error" role="alert">
                    {error}
                  </p>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );

  if (!overlayUntilOpen) return panel;

  if (!asOverlay) {
    /*
     * The whole of the rail. One button, labelled with the only thing worth
     * knowing at a glance: whether trading is on and whether money is at work.
     */
    return (
      <div className="ts-rail-slot">
        <button
          type="button"
          className="rc-btn rc-btn--primary ts-btn-full"
          onClick={() => setOpen(true)}
        >
          {positionOpen
            ? "POSITION OPEN"
            : authorized
              ? "TRADING ON"
              : "SET UP TRADING"}
        </button>
        {/* One line, because nothing else on the screen shows this now: the
            readout that used to sit over the canvas is gone, and the rest of
            the panel is behind the button. */}
        {positionOpen && snapshot ? (
          <p className="ts-rail-hint rc-mono">
            {snapshot.stake.toFixed(2)} USDso{" "}
            <span className={snapshot.pnl < 0 ? "gc-loss" : "gc-gain"}>
              {snapshot.pnl >= 0 ? "+" : ""}
              {snapshot.pnlPct.toFixed(1)}%
            </span>
          </p>
        ) : hasStrandedMoney ? (
          <p className="ts-rail-hint rc-mono">Money to return - open</p>
        ) : hasUnreadableMarket ? (
          // Same distinction the open panel makes. This collapsed line was
          // missed when that was fixed, so a market that merely failed to read
          // still promised money here.
          <p className="ts-rail-hint rc-mono">One market unchecked - open</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="ts-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={positionOpen ? "Your position" : "Trading"}
    >
      <div className="ts-overlay-inner">
        <p className="rc-pixel ts-overlay-lead">
          {positionOpen
            ? "YOUR POSITION"
            : authorized
              ? "TRADING ON"
              : "SET UP TRADING TO PLAY"}
        </p>
        {panel}
      </div>
    </div>
  );
}
