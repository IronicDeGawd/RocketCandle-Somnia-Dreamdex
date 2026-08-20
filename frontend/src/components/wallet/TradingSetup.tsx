"use client";

import { useCallback, useEffect, useState } from "react";
import { useExitPlan } from "@/hooks/useGameHud";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useTradingSession } from "@/hooks/useTradingSession";
import { mapWalletError } from "@/lib/walletErrors";
import "@/app/trading.css";

/**
 * Turning real trading on, and taking it back off.
 *
 * Everything the player agrees to is stated before they agree to it: what the
 * key can do, what it cannot, what a round trip costs, and how to get the money
 * out again.
 *
 * Gamers first: this panel is a door, not a wall. It starts closed and a
 * player who never opens it never sees a form.
 */

const STEP_LABELS: Record<string, string> = {
  "switching-network": "Switching to Somnia...",
  fuelling: "Sending the browser key its order fees...",
  "vault-mode": "Moving fills to the exchange vault...",
  approving: "Approving USDso...",
  depositing: "Depositing your stake...",
  granting: "Authorising this browser to trade...",
  revoking: "Revoking...",
};

// The order the four setup steps happen in, so progress can be drawn even
// though "approving" is skipped when the pool already has enough allowance.
const SETUP_STEPS: { key: string; label: string }[] = [
  { key: "switching-network", label: STEP_LABELS["switching-network"] },
  { key: "fuelling", label: STEP_LABELS.fuelling },
  { key: "vault-mode", label: STEP_LABELS["vault-mode"] },
  { key: "approving", label: STEP_LABELS.approving },
  { key: "depositing", label: STEP_LABELS.depositing },
  { key: "granting", label: STEP_LABELS.granting },
];

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
    withdrawAll,
  } = useSessionKey(symbol);
  const { bridge, snapshot, refresh } = useTradingSession(symbol);
  const exits = useExitPlan();
  // Starts closed. This panel used to be a door the player could ignore; it is
  // now the start button, so folding it away would hide the only way into a
  // run behind a control captioned "Open".
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("2");
  const [roundTripCost, setRoundTripCost] = useState<number | null>(null);
  const [stopTerms, setStopTerms] = useState<{
    deposit: number;
    slippageBps: number;
  } | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopResting, setStopResting] = useState(false);
  const [sellBusy, setSellBusy] = useState(false);
  const [sellError, setSellError] = useState<string | null>(null);
  const [vault, setVault] = useState<number | null>(null);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [vaultRetryTick, setVaultRetryTick] = useState(0);

  /** How far the position may fall before it sells itself. */
  const FLOOR_DROP_PCT = 10;

  // Show the spread cost before the player commits, not after.
  useEffect(() => {
    let cancelled = false;

    const quote = async () => {
      if (!bridge) return;
      const stake = Number(amount);
      if (!Number.isFinite(stake) || stake <= 0) return;

      const cost = await bridge.quoteCost(stake);
      if (!cancelled) setRoundTripCost(cost);
    };

    quote();
    return () => {
      cancelled = true;
    };
  }, [bridge, amount]);

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

  // What is actually in the vault, rather than what the stake field says.
  // The withdraw button used to echo the stake, so it offered to withdraw 2
  // USDso from a vault holding nothing.
  useEffect(() => {
    let cancelled = false;
    if (!bridge || !authorized) return;

    bridge
      .vaultUsdso()
      .then((n) => {
        if (!cancelled) {
          setVault(n);
          setVaultError(null);
        }
      })
      .catch((e) => {
        // Leave `vault` as null rather than guessing zero - a failed read
        // and an empty vault must never look the same to the player.
        console.error("Failed to read vault balance:", e);
        if (!cancelled) setVaultError(mapWalletError(e).message);
      });

    return () => {
      cancelled = true;
    };
  }, [bridge, authorized, snapshot?.open, vaultRetryTick]);

  const handleEnable = useCallback(async () => {
    await enable(symbol, amount);
    await refresh();
    // A top-up to an already-authorised vault changes neither `authorized`
    // nor `snapshot?.open`, so the vault-read effect above would otherwise
    // never see it and `vault` would go stale. Bumping the same tick the
    // retry button uses forces one honest re-read; on a failed deposit the
    // balance simply comes back unchanged, so this never misleads.
    setVaultRetryTick((t) => t + 1);
  }, [enable, refresh, symbol, amount]);

  /**
   * Withdraw whatever is actually in the vault, then re-read it.
   *
   * `withdrawAll` already reports a failed transaction through the hook's
   * own `error`. What it cannot report is a re-read that fails afterwards -
   * that used to throw silently, leaving the withdraw button still offering
   * money that may or may not have already left.
   */
  const handleWithdraw = useCallback(async () => {
    await withdrawAll(symbol, String(vault ?? 0));
    try {
      const left = await bridge?.vaultUsdso();
      if (typeof left === "number") {
        setVault(left);
        setVaultError(null);
      }
      await refresh();
    } catch (e) {
      console.error("Failed to re-read vault balance after withdraw:", e);
      setVaultError(
        `Withdraw sent, but the vault balance could not be re-read - ${mapWalletError(e).message}`
      );
    }
  }, [withdrawAll, symbol, vault, bridge, refresh]);

  /**
   * Sell the holding back to USDso, at any time.
   *
   * Selling only ever happened when a run ended, so a purchase made outside a
   * game had no exit at all: the money sat as tokens in the vault with nothing
   * in the interface able to turn it back. Ejecting mid-run does the same
   * thing, but a player who has not started a run cannot reach it.
   */
  const handleSellBack = useCallback(async () => {
    if (!bridge) return;
    setSellBusy(true);
    setSellError(null);

    try {
      const result = await bridge.close();
      if (!result) setSellError("There was nothing open to sell.");
      await refresh();
    } catch (e) {
      console.error("Failed to sell back position:", e);
      setSellError(mapWalletError(e).message);
    } finally {
      setSellBusy(false);
    }
  }, [bridge, refresh]);

  const busy = step !== "idle" && step !== "ready";
  const setupIndex = SETUP_STEPS.findIndex((s) => s.key === step);
  const showSetupProgress = !authorized && setupIndex !== -1;
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

  const panel = (
    <section className={`ts-root${asOverlay ? " ts-root--overlay" : ""}`}>
      <div className="rc-panel ts-toggle-row">
        <div className="ts-toggle-copy">
          <h2 className="rc-pixel ts-heading">
            {snapshot?.open ? "Your position" : "Buy in to play"}
          </h2>
          <p className="ts-toggle-note">
            {snapshot?.open
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

            {!authorized ? (
              <>
                <label className="ts-field">
                  <span className="rc-pixel ts-field-label">
                    Stake (USDso)
                  </span>
                  <div className="rc-well ts-stake-well">
                    <input
                      type="number"
                      min="0.5"
                      step="0.5"
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      disabled={busy}
                      className="ts-stake-input"
                    />
                    <span className="ts-stake-unit">USDso</span>
                  </div>
                </label>

                {showSetupProgress ? (
                  <>
                    <div className="ts-steps">
                      {SETUP_STEPS.map((s, idx) => (
                        <div
                          key={s.key}
                          className={`ts-step ${
                            idx < setupIndex
                              ? "ts-step--done"
                              : idx === setupIndex
                                ? "ts-step--current rc-blink"
                                : ""
                          }`}
                        >
                          <span className="ts-step-dot" />
                          <span>{s.label}</span>
                        </div>
                      ))}
                    </div>
                    <div className="ts-progress-track">
                      <div
                        className="ts-progress-fill"
                        style={{
                          width: `${((setupIndex + 1) / SETUP_STEPS.length) * 100}%`,
                        }}
                      />
                    </div>
                    <div className="rc-chip ts-progress-label">
                      Step {setupIndex + 1} of {SETUP_STEPS.length}
                    </div>
                  </>
                ) : error ? (
                  <div className="ts-error" role="alert">
                    {error}
                  </div>
                ) : (
                  <ul className="ts-facts">
                    {/* One fact, because only one of them changes whether a
                        player should sign. The rest described a flow that has
                        since changed - it promised "three or four signatures",
                        which is now wrong in both directions - and sat there
                        permanently in a 212px column. */}
                    <li>
                      This browser gets its own trading key. It can place and
                      cancel orders and <strong>can never withdraw your
                      money</strong>.
                    </li>
                    <li>
                      The only cost is the gap between the buy and sell price,
                      crossed twice
                      {roundTripCost !== null ? (
                        <>
                          {" — about "}
                          <span className="rc-mono">
                            {roundTripCost.toFixed(4)} USDso
                          </span>
                          {" on this stake."}
                        </>
                      ) : (
                        "."
                      )}
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
                ) : !snapshot?.open ? (
                  /*
                   * A deposit form, nothing more.
                   *
                   * This used to compare the field against the vault and
                   * declare the player short whenever the field was larger -
                   * a rule that made sense only while this panel did the
                   * buying. PLAY stakes whatever the vault holds, so the
                   * field means "add this much", and a vault with money in it
                   * is never short of anything.
                   */
                  <div className="ts-stop">
                    {vault !== null ? (
                      <p className="ts-ready">
                        The vault holds{" "}
                        <span className="rc-mono">{vault.toFixed(2)} USDso</span>
                        {vault > 0 ? ", ready to play with." : ". Add some to play."}
                      </p>
                    ) : vaultError ? (
                      <>
                        <p className="ts-error" role="alert">
                          Could not read the vault balance - {vaultError} This
                          is not the same as an empty vault; try again before
                          assuming there is nothing there.
                        </p>
                        <button
                          type="button"
                          onClick={() => setVaultRetryTick((t) => t + 1)}
                          className="rc-btn ts-btn-full"
                        >
                          Retry reading the vault
                        </button>
                      </>
                    ) : (
                      <p className="ts-ready">
                        The vault holds <span className="rc-mono">… USDso</span>
                      </p>
                    )}
                    <p className="ts-note">
                      Press PLAY on the cabinet to buy into {symbol} and start a
                      run, staking whatever is in the vault - so your rocket is
                      as strong as what you put in. It sells back when the run
                      ends, and <span className="ts-key">E</span> ejects early.
                    </p>
                    <label className="ts-field">
                      <span className="rc-pixel ts-field-label">
                        Add to the vault (USDso)
                      </span>
                      <div className="rc-well ts-stake-well">
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          disabled={busy}
                          className="ts-stake-input"
                        />
                        <span className="ts-stake-unit">USDso</span>
                      </div>
                    </label>
                    <button
                      onClick={handleEnable}
                      disabled={busy || !(Number(amount) > 0)}
                      className="rc-btn ts-btn-full"
                    >
                      {busy
                        ? STEP_LABELS[step] ?? "Working..."
                        : `Add ${amount || "0"} USDso`}
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
                ) : (
                  <p className="ts-note">
                    A position is open. This market has no stop registry, so
                    the floor is watched by this page only — it will not hold
                    with the tab closed.
                  </p>
                )}

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
                      Closes the holding and returns the money to the vault, at
                      whatever it is worth now. A run does this for you when it
                      ends; this is the way out when you are not playing.
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
                    // Withdraw what is actually there, not what the stake
                    // field happens to say - those differ the moment a
                    // position is opened or a deposit fails.
                    onClick={handleWithdraw}
                    disabled={busy || !vault}
                    className="rc-btn"
                  >
                    Withdraw{" "}
                    <span className="rc-mono">
                      {vault !== null ? vault.toFixed(2) : "…"}
                    </span>{" "}
                    USDso
                  </button>
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

                {/* The deposit-form branch above already shows this when a
                    position is not open; once one is, that branch is not
                    rendered, so the withdraw button's own row is the only
                    place left to say why the balance looks stuck. */}
                {vaultError && snapshot?.open ? (
                  <p className="ts-error" role="alert">
                    {vaultError}
                  </p>
                ) : null}

                {sweepWarning ? (
                  <p className="ts-error" role="status" aria-live="polite">
                    {sweepWarning}
                  </p>
                ) : null}

                <p className="ts-note">
                  Revoking stops the key immediately, on chain. Withdraw
                  first — the money is yours and only your wallet can move
                  it.
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
              ? "WALLET & VAULT"
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
        ) : authorized && vault !== null ? (
          <p className="ts-rail-hint rc-mono">{vault.toFixed(2)} USDso ready</p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className="ts-overlay"
      role="dialog"
      aria-modal="false"
      aria-label={positionOpen ? "Your position" : "Trading and vault"}
    >
      <div className="ts-overlay-inner">
        <p className="rc-pixel ts-overlay-lead">
          {positionOpen
            ? "YOUR POSITION"
            : authorized
              ? "WALLET & VAULT"
              : "SET UP TRADING TO PLAY"}
        </p>
        {panel}
      </div>
    </div>
  );
}
