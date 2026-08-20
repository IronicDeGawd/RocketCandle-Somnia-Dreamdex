/**
 * Whether a live-market tremor should actually fire right now.
 *
 * A single shake runs 120-360ms, but trades on a busy market arrive faster
 * than that. Without a gate, every trade restarted the shake before the
 * last one finished, so the camera never settled - the "permanent wobble"
 * players reported. This refuses a new tremor while one is still running,
 * and again for a minimum gap afterwards, so a busy market still feels
 * busy without the jolts ever overlapping into a constant shudder.
 *
 * @param {object} state
 * @param {number} state.now - current time, ms
 * @param {number} state.lastTremorAt - when the last tremor STARTED, ms (0 if none yet)
 * @param {number} state.tremorActiveUntil - when the last tremor's shake finishes, ms (0 if none yet)
 * @param {number} [state.minGapMs] - minimum time between the start of one tremor and the next
 * @returns {boolean} true if a new tremor is allowed to start
 */
export function shouldStartTremor({
  now,
  lastTremorAt,
  tremorActiveUntil,
  minGapMs = 500,
}) {
  if (!Number.isFinite(now)) return false; // a broken clock must never allow a tremor
  if (now < tremorActiveUntil) return false; // a tremor is still running
  if (lastTremorAt > 0 && now - lastTremorAt < minGapMs) return false; // too soon after the last one
  return true;
}
