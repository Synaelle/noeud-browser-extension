// SPDX-License-Identifier: GPL-3.0-or-later

// The times this person uses, so the quick picks and the snooze menu offer theirs first.

import { formatHour } from './format'
import type { State } from './store'
import { durationWords, normalizeWhen, parseDuration } from './when'

/** One reusable time (see normalizeWhen), how often it was chosen and when last. */
export interface TimeUse {
  when: string
  count: number
  last: number
}

export const KEEP_TIMES = 50
export const SHOWN_TIMES = 5

export const addDefaults = ['10m', '1h', '18:00', 'tomorrow 9:00', 'monday 9:00']
export const snoozeDefaults = ['10m', '1h', '1d', 'tomorrow 9:00', '1w']

/** Counts a time chosen for a new reminder or a snooze. A one-off date counts for nothing. */
export function noteTimeUse(state: State, text: string | undefined, now: number): void {
  const when = text === undefined ? null : normalizeWhen(text)
  if (when === null) return
  const used = state.times.find((entry) => entry.when === when)
  if (used) {
    used.count += 1
    used.last = now
  } else {
    state.times.push({ when, count: 1, last: now })
  }
  if (state.times.length > KEEP_TIMES) state.times = byUse(state.times).slice(0, KEEP_TIMES)
}

function byUse(times: TimeUse[]): TimeUse[] {
  return [...times].sort((a, b) => b.count - a.count || b.last - a.last)
}

const TIME_OF_DAY =
  /^(?:(tomorrow|monday|tuesday|wednesday|thursday|friday|saturday|sunday) )?(\d{1,2}):(\d{2})$/

/** A time of day ("18:00") that has already gone by today, so it is not worth offering. */
function passed(when: string, now: number, timeZone: string): boolean {
  const found = TIME_OF_DAY.exec(when)
  if (!found || found[1] !== undefined) return false
  const today = Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(timeZone)
  const at = today.with({
    hour: Number(found[2]),
    minute: Number(found[3]),
    second: 0,
    millisecond: 0,
  })
  return at.epochMilliseconds <= now
}

/** The most used times first, ties to the most recent, then the defaults in their order. */
export function rankTimes(
  times: TimeUse[],
  defaults: string[],
  now: number,
  timeZone: string,
): string[] {
  const shown: string[] = []
  for (const when of [...byUse(times).map((entry) => entry.when), ...defaults]) {
    if (shown.length === SHOWN_TIMES) break
    if (!shown.includes(when) && !passed(when, now, timeZone)) shown.push(when)
  }
  return shown
}

/** Before any history, the add form starts here, as it always did. */
export const FIRST_ADD_TIME = '1h'

/** Where the add form's When starts: the most used time still ahead, else in an hour. */
export function startingTime(times: TimeUse[], now: number, timeZone: string): string {
  return rankTimes(times, [], now, timeZone)[0] ?? FIRST_ADD_TIME
}

const plural = (amount: number, word: string) => `${amount} ${word}${amount === 1 ? '' : 's'}`

/** "10 min", "2 hours", "3 days", "1 week", or "8 h 52 min" when it does not fit one unit. */
export function durationLabel(when: string): string {
  const parsed = parseDuration(when)
  if (!parsed || 'error' in parsed) return when
  const { ms } = parsed
  const hours = ms / 3_600_000
  const days = ms / 86_400_000
  if (ms < 3_600_000 && ms % 60_000 === 0) return `${ms / 60_000} min`
  if (Number.isInteger(hours) && hours < 48) return plural(hours, 'hour')
  if (Number.isInteger(days) && days % 7 === 0) return plural(days / 7, 'week')
  if (Number.isInteger(days)) return plural(days, 'day')
  return durationWords(ms)
}

/** The button text for a normalized time: "2 hours", "Today 6:00 PM", "Friday 9:00 AM". */
export function timeLabel(when: string): string {
  if (parseDuration(when)) return durationLabel(when)
  const found = TIME_OF_DAY.exec(when)
  if (!found) return when
  const [, day, hour, minute] = found
  const clock = formatHour(Number(hour), Number(minute))
  if (day === undefined) return `${Number(hour) >= 20 ? 'Tonight' : 'Today'} ${clock}`
  return `${day.charAt(0).toUpperCase()}${day.slice(1)} ${clock}`
}
