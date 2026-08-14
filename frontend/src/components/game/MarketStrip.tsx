"use client";

import { useMemo } from "react";

import type { GameHud } from "@/hooks/useGameHud";

/**
 * The price line the run was cut from, with this level marked on it.
 *
 * The terrain already argues that the game is built from a real market; this
 * corroborates it, by showing the line the walls came from and pointing at the
 * part you are standing in. It is the only chart in the whole product.
 *
 * Deliberately quiet: one stroke, no fill, no gradient, no axes. It redraws
 * only when the level changes, so nothing here animates while a shot is in the
 * air. When the feed drops it holds the last line and dims the price rather
 * than blanking - a chart that empties itself looks broken, and the history it
 * is drawing did not stop being true.
 */

const VIEW_WIDTH = 1000;
const VIEW_HEIGHT = 90;

export interface MarketStripProps {
  hud: GameHud;
}

export default function MarketStrip({ hud }: MarketStripProps) {
  const market = hud.marketSeries;

  // Memoised on the series and the level, so a shot in flight - which
  // republishes the HUD many times a second - never recomputes the geometry.
  const geometry = useMemo(() => {
    if (!market || market.series.length < 2) return null;

    const { series, from, to } = market;
    const low = Math.min(...series);
    const high = Math.max(...series);
    const span = high - low || 1;
    const step = VIEW_WIDTH / (series.length - 1);

    // Two pixels of headroom top and bottom so the stroke is never clipped.
    const y = (value: number) =>
      VIEW_HEIGHT - 3 - ((value - low) / span) * (VIEW_HEIGHT - 6);

    return {
      points: series.map((value, i) => `${i * step},${y(value)}`).join(" "),
      markerX: from * step,
      markerWidth: Math.max(step, (to - from) * step),
      low,
      high,
    };
  }, [market]);

  // Practice runs publish no series at all, and neither does a simulated one.
  if (!market || !geometry) return null;

  const stale = hud.marketFeedStatus !== "live";

  const when = market.windowFrom
    ? new Date(market.windowFrom).toLocaleDateString([], {
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "";

  return (
    <section className="gc-market" aria-label="Where this level came from">
      <div className="gc-market-head">
        <span className="gc-market-pair rc-mono">
          {market.symbol} {market.interval}
        </span>
        <span
          className={`gc-market-price rc-mono${stale ? " gc-market-price--stale" : ""}`}
        >
          {hud.currentPrice !== null ? hud.currentPrice.toPrecision(6) : "—"}
        </span>
      </div>

      <div className="gc-market-well">
        <svg
          viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
          width="100%"
          height={VIEW_HEIGHT}
          preserveAspectRatio="none"
          className="gc-market-chart"
          role="img"
          aria-label={`${market.label} price, level ${hud.level} highlighted`}
        >
          {/* This level's slice, behind the line so the stroke stays legible. */}
          <rect
            x={geometry.markerX}
            y={0}
            width={geometry.markerWidth}
            height={VIEW_HEIGHT}
            className="gc-market-marker"
          />
          <polyline points={geometry.points} className="gc-market-line" />
        </svg>
      </div>

      <div className="gc-market-foot rc-mono">
        <span>{when}</span>
        <span className="gc-market-legend">
          <span className="gc-market-swatch" aria-hidden="true" />
          this level
        </span>
        <span>
          {market.mirrored ? "mirrored from mainnet" : "live on this network"}
        </span>
      </div>
    </section>
  );
}
