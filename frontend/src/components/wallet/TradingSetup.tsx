"use client";

import { useCallback, useEffect, useState } from "react";
import { useSessionKey } from "@/hooks/useSessionKey";
import { useTradingSession } from "@/hooks/useTradingSession";

/**
 * Turning real trading on, and taking it back off.
 *
 * Everything the player agrees to is stated before they agree to it: what the
 * key can do, what it cannot, what a round trip costs, and how to get the money
 * out again.
 */

const STEP_LABELS: Record<string, string> = {
  "vault-mode": "Moving fills to the exchange vault...",
  approving: "Approving USDso...",
  depositing: "Depositing your stake...",
  granting: "Authorising this browser to trade...",
  revoking: "Revoking...",
};

export interface TradingSetupProps {
  symbol: string;
}

export default function TradingSetup({ symbol }: TradingSetupProps) {
  const { sessionKey, authorized, step, error, enable, revoke, withdrawAll } =
    useSessionKey();
  const { bridge, snapshot, refresh } = useTradingSession(symbol);
  const [amount, setAmount] = useState("2");
  const [roundTripCost, setRoundTripCost] = useState<number | null>(null);
  const [stopTerms, setStopTerms] = useState<{
    deposit: number;
    slippageBps: number;
  } | null>(null);
  const [stopBusy, setStopBusy] = useState(false);
  const [stopError, setStopError] = useState<string | null>(null);
  const [stopResting, setStopResting] = useState(false);

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

  const handleEnable = useCallback(async () => {
    await enable(symbol, amount);
    await refresh();
  }, [enable, refresh, symbol, amount]);

  const busy = step !== "idle" && step !== "ready";

  return (
    <section className="trading-setup">
      <h3>Play for keeps</h3>

      <p className="trading-setup-blurb">
        Your stake buys the token you are playing, for real, on DreamDEX. It
        sells back when the run ends, and you can eject at any time with{" "}
        <kbd>E</kbd> without ending your game.
      </p>

      {!authorized ? (
        <>
          <label className="trading-setup-field">
            <span>Stake (USDso)</span>
            <input
              type="number"
              min="0.5"
              step="0.5"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={busy}
            />
          </label>

          <ul className="trading-setup-facts">
            <li>
              This browser gets its own trading key. It can place and cancel
              orders and <strong>can never withdraw your money</strong>.
            </li>
            <li>
              Three signatures now, then none — no wallet popups between shots.
            </li>
            <li>
              If your position falls {FLOOR_DROP_PCT}%, it sells and you play
              on. This page watches that floor while it is open, and once a
              position exists you can also rest the same floor on the exchange
              so it holds even with the tab closed.
            </li>
            <li>
              Trading fees are zero. The only cost is the gap between the buy
              and sell price, crossed twice
              {roundTripCost !== null
                ? ` — about ${roundTripCost.toFixed(4)} USDso on this stake.`
                : "."}
            </li>
          </ul>

          <button onClick={handleEnable} disabled={busy}>
            {busy ? STEP_LABELS[step] ?? "Working..." : "Enable trading"}
          </button>
        </>
      ) : (
        <>
          <p className="trading-setup-ready">
            Trading is on. This browser&apos;s key{" "}
            <code>{sessionKey?.address.slice(0, 10)}…</code> can trade for you,
            and nothing else.
          </p>

          {bridge?.canRestStop && snapshot?.open ? (
            <div className="trading-setup-stop">
              {stopResting ? (
                <>
                  <p className="trading-setup-ready">
                    A stop is resting on the exchange. If the price falls{" "}
                    {FLOOR_DROP_PCT}% below what you paid, your position sells
                    itself — whether or not this page is open.
                  </p>
                  <button onClick={handleLiftStop} disabled={stopBusy}>
                    {stopBusy ? "Lifting..." : "Lift the stop"}
                  </button>
                </>
              ) : (
                <>
                  <p className="trading-setup-note">
                    Rest your {FLOOR_DROP_PCT}% floor on the exchange itself and
                    it keeps working with the tab closed. Costs one wallet
                    signature
                    {stopTerms
                      ? ` and a ${stopTerms.deposit} STT deposit, refunded when you lift it`
                      : ""}
                    . It sells at whatever the book offers, within{" "}
                    {stopTerms ? stopTerms.slippageBps / 100 : 5}% of the
                    trigger.
                  </p>
                  <button onClick={handleRestStop} disabled={stopBusy}>
                    {stopBusy ? "Resting the stop..." : "Rest my stop on chain"}
                  </button>
                </>
              )}
              {stopError ? (
                <p className="trading-setup-error">{stopError}</p>
              ) : null}
            </div>
          ) : null}

          <div className="trading-setup-actions">
            <button onClick={() => withdrawAll(symbol, amount)} disabled={busy}>

              Withdraw {amount} USDso
            </button>
            <button onClick={() => revoke(symbol)} disabled={busy}>
              {step === "revoking" ? "Revoking..." : "Revoke this key"}
            </button>
          </div>

          <p className="trading-setup-note">
            Revoking stops the key immediately, on chain. Withdraw first — the
            money is yours and only your wallet can move it.
          </p>
        </>
      )}

      {error ? <p className="trading-setup-error">{error}</p> : null}
    </section>
  );
}
