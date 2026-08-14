"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import "../practice.css";

// Phaser reaches for the browser window as it loads, so it can only be brought
// in on the client.
const PhaserGame = dynamic(() => import("@/components/PhaserGame"), {
  ssr: false,
});

/**
 * Practice mode — the whole game, no wallet.
 *
 * The terrain is real, the market still interrupts play, and nothing is
 * recorded. This exists so anyone can be handed the game and simply play it:
 * a judge at a demo, someone following a link, anybody without a wallet
 * installed. Asking for a wallet before the first shot loses most of them.
 *
 * The banner strip is the only navigation on this page - it doubles as the
 * way back to the wallet-connected app.
 */
export default function PracticePage() {
  return (
    <main className="pr-page">
      <div className="rc-panel pr-banner">
        <div className="pr-banner-head">
          <h1 className="pr-banner-title rc-pixel">PRACTICE MODE</h1>
          <span className="rc-chip rc-chip--alert">
            TWO LEVELS · NOTHING RECORDED · NO WICK EARNED
          </span>
        </div>
        <div className="pr-banner-body">
          <p>
            The first two levels, on real market terrain, with the market
            shaking the field exactly as it does in a full run. Nothing here
            is written to the chain. A full run means buying into a pair.
          </p>
          <Link href="/" className="pr-banner-link">
            Connect a wallet to buy in and play all seven
          </Link>
        </div>
      </div>

      {/* No callback is passed, so a finished run has nothing to submit to. */}
      <PhaserGame />
    </main>
  );
}
