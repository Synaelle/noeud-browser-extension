// SPDX-License-Identifier: GPL-3.0-or-later

import type { Repeat, RepeatUnit } from './reminder'

const plural = { day: 'days', week: 'weeks', month: 'months', year: 'years' } as const

// average lengths, only used to guess how many occurrences have passed
const approximateMs: Record<RepeatUnit, number> = {
  day: 86_400_000,
  week: 604_800_000,
  month: 2_629_746_000,
  year: 31_556_952_000,
}

/**
 * Occurrence n, counted from the start on the calendar of the time zone. Temporal clamps
 * the 31st to the end of shorter months and moves a time inside a clock change forward,
 * as docs/api.md asks.
 */
export function occurrence(repeat: Repeat, timeZone: string, n: number): Temporal.Instant {
  return Temporal.Instant.from(repeat.start)
    .toZonedDateTimeISO(timeZone)
    .add({ [plural[repeat.every]]: n * repeat.interval })
    .toInstant()
}

/** The first occurrence strictly after `after`. */
export function nextOccurrence(
  repeat: Repeat,
  timeZone: string,
  after: Temporal.Instant,
): Temporal.Instant {
  const elapsed = after.epochMilliseconds - Date.parse(repeat.start)
  let n = Math.max(0, Math.floor(elapsed / (approximateMs[repeat.every] * repeat.interval)) - 1)
  while (n > 0 && Temporal.Instant.compare(occurrence(repeat, timeZone, n - 1), after) > 0) n--
  while (Temporal.Instant.compare(occurrence(repeat, timeZone, n), after) <= 0) n++
  return occurrence(repeat, timeZone, n)
}
