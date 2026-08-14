"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useTradingSession } from "@/hooks/useTradingSession";
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
    fuelKey,
    enable,
    revoke,
    withdrawAll,
  } = useSessionKey(symbol);
  const { bridge, snapshot, refresh } = useTradingSession(symbol);
  // Starts open. This panel used to be a door the player could ignore; it is
  // now the start button, so folding it away would hide the only way into a
  // run behind a control captioned "Open".
  const [open, setOpen] = useState(true);
  const [amount, setAmount] = useState("2");
  const [roundTripCost, setRoundTripCost] = useState<number | null>(null);
  const [stopTerms, setStopTerms] = useState<{
    deposit: number;
    slippageBps: number;
  } | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopResting, setStopResting] = useState(false);
  const [buyBusy, setBuyBusy] = useState(false);
  const [buyError, setBuyError] = useState<string | null>(null);
  const [vault, setVault] = useState<number | null>(null);

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
      setStopError((e as Error).message ?? "Could not rest the stop");
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

    bridge.vaultUsdso().then((n) => {
      if (!cancelled) setVault(n);
    }).catch(() => {});

    return () => {
      cancelled = true;
    };
  }, [bridge, authorized, snapshot]);

  const handleEnable = useCallback(async () => {
    await enable(symbol, amount);
    await refresh();
  }, [enable, refresh, symbol, amount]);

  /**
   * Actually buy in.
   *
   * Enabling trading only funds the vault and authorises this browser's key -
   * it does not put the player in the market. Without this step the vault sits
   * funded, the stop control reports that there is nothing to protect, and the
   * eject and firepower keys have no position to act on. Everything downstream
   * of here needs a position to exist first.
   */
  const handleBuyIn = useCallback(async () => {
    if (!bridge) return;
    setBuyBusy(true);
    setBuyError(null);

    try {
      const stake = Number(amount);
      if (!Number.isFinite(stake) || stake <= 0) {
        setBuyError("Enter a stake above zero first.");
        return;
      }

      const opened = await bridge.open(stake);
      if (!opened) setBuyError("A position is already open.");
    } catch (e) {
      setBuyError((e as Error).message ?? "Could not take the position");
    } finally {
      setBuyBusy(false);
    }
  }, [bridge, amount]);

  const busy = step !== "idle" && step !== "ready";
  const setupIndex = SETUP_STEPS.findIndex((s) => s.key === step);
  const showSetupProgress = !authorized && setupIndex !== -1;
  const hasOpenStop = Boolean(bridge?.canRestStop && snapshot?.open);

  /*
   * Once, when the vault is first read: bring an oversized default stake down
   * to what is actually in there.
   *
   * The field defaults to 2, but a player who funded 1 was then shown the
   * "fund the vault" branch over money already sitting in the vault - being
   * asked to add more when the sensible move was to spend what was there.
   */
  const stakeClamped = useRef(false);
  useEffect(() => {
    if (stakeClamped.current || !authorized || vault === null || vault <= 0) {
      return;
    }
    stakeClamped.current = true;
    setAmount((current) =>
      Number(current) > vault ? String(vault) : current
    );
  }, [authorized, vault]);

  const stakeWanted = Number(amount);
  const stakeValid = amount.trim() !== "" && stakeWanted > 0;

  // Vault read back and genuinely short of the stake. Null means "not read
  // yet", which must not be mistaken for empty.
  const underfunded =
    vault !== null && Number.isFinite(stakeWanted) && vault < stakeWanted;

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
  const expanded = open || holdsSomethingReal;

  // Over the game until the player is actually in the market.
  const asOverlay = overlayUntilOpen && !snapshot?.open;

  const panel = (
    <section className={`ts-root${asOverlay ? " ts-root--overlay" : ""}`}>
      <div className="rc-panel ts-toggle-row">
        <div className="ts-toggle-copy">
          <h2 className="rc-pixel ts-heading">Buy in to play</h2>
          <p className="ts-toggle-note">
            {snapshot?.open
              ? "A position is open. This stays visible until it closes."
              : holdsSomethingReal
                ? "Trading is on. Buy in to start a run."
                : "Buying into this pair is how a run starts."}
          </p>
        </div>
        {/* No collapse control while this is the overlay: folding the panel
            away there would leave a stub over the game and no way into a run. */}
        {!holdsSomethingReal && !asOverlay && (
          <button
            type="button"
            className="rc-btn rc-btn--primary"
            aria-expanded={expanded}
            aria-controls="trading-panel-body"
            onClick={() => setOpen((o) => !o)}
          >
            {expanded ? "Close" : "Open"}
          </button>
        )}
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
                  <div className="ts-error-box">{error}</div>
                ) : (
                  <ul className="ts-facts">
                    <li>
                      This browser gets its own trading key. It can place and
                      cancel orders and <strong>can never withdraw your
                      money</strong>.
                    </li>
                    <li>
                      Three or four signatures now, then none — no wallet
                      popups between shots. The fourth is only needed the
                      first time you allow this market to take USDso.
                    </li>
                    <li>
                      If your position falls{" "}
                      <span className="rc-mono">{FLOOR_DROP_PCT}%</span>, it
                      sells and you play on. This page watches that floor
                      while it is open, and once a position exists you can
                      also rest the same floor on the exchange so it holds
                      even with the tab closed.
                    </li>
                    <li>
                      Trading fees are zero. The only cost is the gap between
                      the buy and sell price, crossed twice
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
                   * The key sends its own orders, so it needs native STT of its
                   * own. Setup never gave it any, and an address that has never
                   * paid a fee does not exist as far as the network is
                   * concerned - so the buy-in failed with "account does not
                   * exist", which explains nothing to anybody.
                   */
                  <div className="ts-stop">
                    <p className="ts-note">
                      The browser key holds{" "}
                      <span className="rc-mono">
                        {keyGas !== null ? keyGas.toFixed(3) : "…"} STT
                      </span>
                      , which is not enough to pay for its own orders. Top it up
                      and the buy-in opens up. Anything unspent stays in the
                      key, and revoking is unaffected.
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
                    {error ? <p className="ts-error">{error}</p> : null}
                  </div>
                ) : !snapshot?.open && underfunded ? (
                  /*
                   * Authorised but the vault cannot cover the stake.
                   *
                   * Reachable whenever the deposit failed while the other three
                   * setup steps succeeded - and there was no way out of it,
                   * because funding the vault only happened in a step that is
                   * hidden once the key is authorised. The buy-in button was
                   * the only thing on offer and it could not possibly work.
                   */
                  <div className="ts-stop">
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
                    <p className="ts-note">
                      The vault holds{" "}
                      <span className="rc-mono">
                        {vault !== null ? vault.toFixed(2) : "…"} USDso
                      </span>
                      , which is short of this stake. Fund it and the buy-in
                      opens up.
                    </p>
                    <button
                      onClick={handleEnable}
                      disabled={busy}
                      className="rc-btn rc-btn--primary ts-btn-full"
                    >
                      {busy
                        ? STEP_LABELS[step] ?? "Working..."
                        : `Fund the vault with ${amount} USDso`}
                    </button>
                    {error ? <p className="ts-error">{error}</p> : null}
                  </div>
                ) : !snapshot?.open ? (
                  <div className="ts-stop">
                    {/*
                     * The stake field belongs here, not only in the funding
                     * branch. It used to live there alone, so clearing it left
                     * a player staring at "Buy in with  USDso" and "Enter a
                     * stake above zero first" with nowhere on the panel to
                     * enter one.
                     */}
                    <label className="ts-field">
                      <span className="rc-pixel ts-field-label">
                        Stake (USDso)
                      </span>
                      <div className="rc-well ts-stake-well">
                        <input
                          type="number"
                          min="0.5"
                          step="0.5"
                          max={vault ?? undefined}
                          value={amount}
                          onChange={(e) => setAmount(e.target.value)}
                          disabled={buyBusy}
                          className="ts-stake-input"
                        />
                        <span className="ts-stake-unit">USDso</span>
                      </div>
                    </label>
                    <p className="ts-note">
                      The vault holds{" "}
                      <span className="rc-mono">
                        {vault !== null ? vault.toFixed(2) : "…"} USDso
                      </span>
                      . Buying in puts this stake into {symbol} for real — after
                      that your rocket hits harder, the floor can be armed, and{" "}
                      <span className="ts-key">E</span> ejects.
                    </p>
                    <button
                      onClick={handleBuyIn}
                      disabled={buyBusy || !stakeValid}
                      className="rc-btn rc-btn--primary ts-btn-full"
                    >
                      {buyBusy
                        ? "Buying in..."
                        : stakeValid
                          ? `Buy in with ${amount} USDso`
                          : "Enter a stake"}
                    </button>
                    {buyError ? <p className="ts-error">{buyError}</p> : null}
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
                      <p className="ts-error">{stopError}</p>
                    ) : null}
                  </div>
                ) : (
                  <p className="ts-note">
                    A position is open. This market has no stop registry, so
                    the floor is watched by this page only — it will not hold
                    with the tab closed.
                  </p>
                )}

                <div className="ts-actions">
                  <button
                    // Withdraw what is actually there, not what the stake
                    // field happens to say - those differ the moment a
                    // position is opened or a deposit fails.
                    onClick={() =>
                      withdrawAll(symbol, String(vault ?? 0))
                    }
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
                    {step === "revoking" ? "Revoking..." : "Revoke this key"}
                  </button>
                </div>

                <p className="ts-note">
                  Revoking stops the key immediately, on chain. Withdraw
                  first — the money is yours and only your wallet can move
                  it.
                </p>

                {error ? <p className="ts-error">{error}</p> : null}
              </>
            )}
          </div>
        </div>
      ) : null}
    </section>
  );

  if (!asOverlay) return panel;

  return (
    <div className="ts-overlay" role="dialog" aria-modal="false" aria-label="Buy in to play">
      <div className="ts-overlay-inner">
        <p className="rc-pixel ts-overlay-lead">BUY IN TO START A RUN</p>
        {panel}
      </div>
    </div>
  );
}
