// Manila is UTC+8 year-round (no DST), so wall-clock math can be done with a
// fixed offset instead of Intl calls in the hot simulation loops.
export const MANILA_OFFSET_MS = 8 * 60 * 60_000
export const DAY_MS = 24 * 60 * 60_000
export const HOUR_MS = 60 * 60_000
export const MINUTE_MS = 60_000

// Fractional hour of day (0-24) in Manila.
export function manilaHour(timeMs: number) {
  const local = (timeMs + MANILA_OFFSET_MS) % DAY_MS
  return (local < 0 ? local + DAY_MS : local) / HOUR_MS
}

// Integer day index (days since epoch, Manila calendar).
export function manilaDayIndex(timeMs: number) {
  return Math.floor((timeMs + MANILA_OFFSET_MS) / DAY_MS)
}

// UTC timestamp of Manila midnight for a day index.
export function manilaMidnight(dayIndex: number) {
  return dayIndex * DAY_MS - MANILA_OFFSET_MS
}
