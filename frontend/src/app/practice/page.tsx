"use client";

import dynamic from "next/dynamic";
import Link from "next/link";

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
 */
export default function PracticePage() {
  return (
    <main className="practice-page">
      <div className="practice-banner">
        <span>
          <strong>Practice</strong> — real markets, real interruptions. Nothing
          is recorded and no WICK is earned.
        </span>
        <Link href="/" className="practice-banner-link">
          Connect a wallet to play for keeps
        </Link>
      </div>

      {/* No callback is passed, so a finished run has nothing to submit to. */}
      <PhaserGame />
    </main>
  );
}
