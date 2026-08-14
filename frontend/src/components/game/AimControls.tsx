"use client";

import type { GameControls, GameHud } from "@/hooks/useGameHud";

/**
 * The aim bezel beneath the frame: angle, power, and the single LAUNCH
 * action. These used to be drawn inside the canvas as 8px drag dots; here
 * they are real HTML controls - 44px keycap handles on a 14px track - wired
 * to the scene through window.rocketCandleGame.controls. Nothing here reads
 * or writes game state directly; every value comes from the HUD bridge and
 * every action goes through it.
 */

export interface AimControlsProps {
  hud: GameHud;
  controls: GameControls | null;
}

export default function AimControls({ hud, controls }: AimControlsProps) {
  return (
    <div className="gc-bezel">
      <SliderField
        label="ANGLE"
        value={hud.angle}
        min={15}
        max={75}
        onChange={(value) => controls?.setAngle(value)}
        disabled={!controls}
      />
      <SliderField
        label="POWER"
        value={hud.power}
        min={0}
        max={100}
        unit="%"
        onChange={(value) => controls?.setPower(value)}
        disabled={!controls}
      />
      <button
        type="button"
        className="gc-launch-btn rc-pixel"
        onClick={() => controls?.launch()}
        disabled={!controls || !hud.canLaunch}
      >
        LAUNCH
      </button>
    </div>
  );
}

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  unit?: string;
  disabled: boolean;
  onChange: (value: number) => void;
}

function SliderField({
  label,
  value,
  min,
  max,
  unit = "",
  disabled,
  onChange,
}: SliderFieldProps) {
  return (
    <label className="gc-slider-field">
      <span className="gc-slider-row rc-pixel">
        <span className="gc-slider-label">{label}</span>
        <span className="gc-slider-value">
          {value}
          {unit}
        </span>
      </span>
      <span className="gc-slider-track-wrap">
        <input
          type="range"
          className="gc-slider-input"
          min={min}
          max={max}
          value={value}
          disabled={disabled}
          onChange={(event) => onChange(Number(event.target.value))}
          aria-label={label}
        />
      </span>
    </label>
  );
}
