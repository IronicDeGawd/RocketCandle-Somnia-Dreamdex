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
  const { bridge, refresh } = useTradingSession(symbol);
  const [amount, setAmount] = useState("2");
  const [roundTripCost, setRoundTripCost] = useState<number | null>(null);

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
