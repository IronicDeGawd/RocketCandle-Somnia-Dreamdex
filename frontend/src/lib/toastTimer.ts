/**
 * How much longer a toast's auto-dismiss should wait once it resumes.
 *
 * A toast counts down for `remainingMs`. If it gets paused (hover or
 * keyboard focus) and later resumed, the clock should pick up where it left
 * off rather than restart at the full duration - otherwise a reader who
 * glances away twice could hold a toast open forever, or a fast in-and-out
 * could barely dent the countdown. Never negative: time already spent
 * can't be given back. A clock that runs backward (sleep/wake, an NTP
 * correction) must never look like MORE time is left than there was before
 * the pause, so a negative elapsed reading is treated as "no time passed".
 */
export function computeRemainingMs(
  remainingMs: number,
  startedAt: number,
  now: number
): number {
  if (!Number.isFinite(remainingMs)) return 0;
  const elapsed = Math.max(0, now - startedAt);
  const remaining = remainingMs - elapsed;
  return remaining > 0 ? remaining : 0;
}
