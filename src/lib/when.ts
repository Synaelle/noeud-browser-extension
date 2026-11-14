// SPDX-License-Identifier: GPL-3.0-or-later

// What people type for "when": a duration ("2h", "8h52", "7w1h3s"), a time ("18:00", "6pm"),
// a day ("tomorrow 9:00", "next monday"), or the date picker's "2026-11-13 14:30". English only.

import { clockOptions } from './format'

/** `delay` is set when the time was given as a duration from now. */
export type When = { ok: true; at: number; delay?: number } | { ok: false; error: string }

const unitMs = { s: 1_000, m: 60_000, h: 3_600_000, d: 86_400_000, w: 604_800_000 } as const
export const MAX_AHEAD_MS = 10 * 365 * unitMs.d

const weekdays = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']

// a leading "in" is the Discord bot's way and is let through quietly
const DURATION = /^(?:in\s*)?((?:\d+\s*[wdhms]\s*)+)(\d+)?$/
const smaller = { w: 'd', d: 'h', h: 'm', m: 's' } as const
const DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})[t ](\d{1,2}):(\d{2})$/
const TIME = String.raw`(\d{1,2})(?::(\d{2}))?\s*(am|pm)?`
const DAY_TIME = new RegExp(
  String.raw`^(?:(today|tonight|tomorrow|(next\s+)?(${weekdays.join('|')}))\s*)?(?:at\s*)?(?:${TIME})?$`,
)
// unit words as the popup writes them ("10 min", "2 hours", "1 wk") and as people type them
const UNIT_WORDS =
  /(\d)\s*(weeks?|wks?|w|days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s)(?![a-z])/g

/** "8 h 52 min" and "2 hours" written the short way, "8h52m" and "2h". */
function shortUnits(input: string): string {
  return input.replace(UNIT_WORDS, (_, digit: string, unit: string) => `${digit}${unit[0]}`)
}

const fail = (error: string): When => ({ ok: false, error })

export const ENTER_A_TIME = 'Enter a time, like 2h, 18:00 or tomorrow 9:00'

function ahead(at: number, now: number): When {
  if (at <= now) return fail('That time has passed')
  if (at - now > MAX_AHEAD_MS) return fail('Keep it under 10 years')
  return { ok: true, at }
}

/**
 * A duration in any unit order, each unit once: "2h", "1h 30m", "7w1h3s". A bare number at the
 * end takes the unit below the one before it, so "8h52" is 8 h 52 min and "1d6" is 1 day 6 h.
 * Null when the text is not written as a duration at all.
 */
export function parseDuration(text: string): { ms: number } | { error: string } | null {
  const found = DURATION.exec(shortUnits(text.trim().toLowerCase().replace(/\s+/g, ' ')))
  if (!found?.[1]) return null
  const seen = new Set<keyof typeof unitMs>()
  let total = 0
  let last: keyof typeof unitMs = 's'
  for (const [, amount, unit] of found[1].matchAll(/(\d+)\s*([wdhms])/g)) {
    const key = unit as keyof typeof unitMs
    if (seen.has(key)) return { error: 'Use each unit once, like 1h30m' }
    seen.add(key)
    total += Number(amount) * unitMs[key]
    last = key
  }
  if (found[2] !== undefined) {
    const unit = last === 's' ? undefined : smaller[last]
    if (unit === undefined || seen.has(unit)) return { error: 'Add a unit to the last number' }
    total += Number(found[2]) * unitMs[unit]
  }
  if (total === 0) return { error: 'Enter a time after now, like 10m' }
  if (total > MAX_AHEAD_MS) return { error: 'Keep it under 10 years' }
  return { ms: total }
}

function clock(hourText: string, minuteText?: string, half?: string): Temporal.PlainTime | null {
  // a bare number is too ambiguous: "9" could be a count
  if (minuteText === undefined && half === undefined) return null
  let hour = Number(hourText)
  const minute = Number(minuteText ?? 0)
  if (half) {
    if (hour < 1 || hour > 12) return null
    hour = (hour % 12) + (half === 'pm' ? 12 : 0)
  }
  if (hour > 23 || minute > 59) return null
  return new Temporal.PlainTime(hour, minute)
}

/** A duration is shown to the second when it has seconds or is under an hour, else to the minute. */
function showsSeconds(delay: number): boolean {
  return delay % unitMs.m !== 0 || delay < unitMs.h
}

/** Resolves what was typed to a time in milliseconds, or says what is wrong in a few words. */
export function parseWhen(text: string, now: number, timeZone: string): When {
  const input = text.trim().toLowerCase().replace(/\s+/g, ' ')
  if (!input) return fail(ENTER_A_TIME)

  const duration = parseDuration(input)
  if (duration) {
    return 'error' in duration
      ? fail(duration.error)
      : {
          ok: true,
          // shown to the minute, it is due on that minute, not seconds after it
          at: showsSeconds(duration.ms)
            ? now + duration.ms
            : Math.floor((now + duration.ms) / unitMs.m) * unitMs.m,
          delay: duration.ms,
        }
  }

  const asDateTime = DATE_TIME.exec(input)
  if (asDateTime) {
    const [year, month, day, hour, minute] = asDateTime.slice(1).map(Number) as [
      number,
      number,
      number,
      number,
      number,
    ]
    try {
      const at = Temporal.PlainDateTime.from(
        { year, month, day, hour, minute },
        { overflow: 'reject' },
      ).toZonedDateTime(timeZone)
      return ahead(at.epochMilliseconds, now)
    } catch (error) {
      if (error instanceof RangeError) return fail('That date does not exist')
      throw error
    }
  }

  const asDay = DAY_TIME.exec(input)
  if (!asDay) return fail(ENTER_A_TIME)
  const [, dayText, next, weekday, hourText, minuteText, half] = asDay
  // "tonight 21:00" is how the quick picks write a late time today
  const day = dayText === 'tonight' ? 'today' : dayText
  if (day === undefined && hourText === undefined) return fail(ENTER_A_TIME)
  const time =
    hourText === undefined ? new Temporal.PlainTime(9, 0) : clock(hourText, minuteText, half)
  if (time === null) return fail('Enter the time like 18:00 or 6pm')
  if (day === 'today' && hourText === undefined) return fail('Add a time, like today 18:00')

  const today = Temporal.Instant.fromEpochMilliseconds(now)
    .toZonedDateTimeISO(timeZone)
    .toPlainDate()
  const on = (date: Temporal.PlainDate) =>
    date.toZonedDateTime({ timeZone, plainTime: time }).epochMilliseconds
  // the night the clocks go back has some times twice: the second one counts once the first
  // has gone by
  const onToday = () => {
    const first = on(today)
    if (first > now) return first
    return today.toPlainDateTime(time).toZonedDateTime(timeZone, { disambiguation: 'later' })
      .epochMilliseconds
  }
  if (day === undefined) {
    // a time alone is today, or tomorrow once it has passed
    const at = onToday()
    return ahead(at > now ? at : on(today.add({ days: 1 })), now)
  }
  if (day === 'today') return ahead(onToday(), now)
  if (day === 'tomorrow') return ahead(on(today.add({ days: 1 })), now)
  // a weekday is today while its time is still ahead, else the coming one; "next" skips today
  const target = weekdays.indexOf(weekday ?? '') + 1
  const days = (target - today.dayOfWeek + 7) % 7
  if (days === 0 && next === undefined && onToday() > now) return ahead(onToday(), now)
  return ahead(on(today.add({ days: days || 7 })), now)
}

function split(ms: number): [keyof typeof unitMs, number][] {
  let rest = Math.max(0, ms)
  const parts: [keyof typeof unitMs, number][] = []
  for (const unit of ['w', 'd', 'h', 'm', 's'] as const) {
    const amount = Math.floor(rest / unitMs[unit])
    if (amount > 0) parts.push([unit, amount])
    rest -= amount * unitMs[unit]
  }
  return parts
}

/** A duration written from the largest unit down: 120m is "2h", 90m is "1h30m". */
export function durationText(ms: number): string {
  return split(ms)
    .map(([unit, amount]) => `${amount}${unit}`)
    .join('')
}

const unitWords = { w: 'wk', d: 'd', h: 'h', m: 'min', s: 's' } as const

/** "8 h 52 min 3 s", to the second or, without `seconds`, to the minute. */
export function durationWords(ms: number, seconds = true): string {
  const parts = split(seconds ? ms : Math.floor(ms / unitMs.m) * unitMs.m)
  if (parts.length === 0) return seconds ? '0 s' : 'under a minute'
  return parts.map(([unit, amount]) => `${amount} ${unitWords[unit]}`).join(' ')
}

/**
 * One way to write each time that can be used again: "2h", "18:00", "tomorrow 9:00" or
 * "monday 9:00", so that "2h", "1h60m" and "120m" count as the same choice. Null for a one-off
 * date from the picker and for anything that does not read as a time.
 */
export function normalizeWhen(text: string): string | null {
  const input = text.trim().toLowerCase().replace(/\s+/g, ' ')
  const duration = parseDuration(input)
  if (duration) return 'ms' in duration ? durationText(duration.ms) : null
  const asDay = DAY_TIME.exec(input)
  if (!asDay) return null
  const [, dayText, , weekday, hourText, minuteText, half] = asDay
  const day = dayText === 'tonight' ? 'today' : dayText
  if (day === undefined && hourText === undefined) return null
  if (day === 'today' && hourText === undefined) return null
  const time =
    hourText === undefined ? new Temporal.PlainTime(9, 0) : clock(hourText, minuteText, half)
  if (time === null) return null
  const hhmm = `${time.hour}:${String(time.minute).padStart(2, '0')}`
  if (day === undefined || day === 'today') return hhmm
  return `${day === 'tomorrow' ? 'tomorrow' : weekday} ${hhmm}`
}

function previewFormat(year: boolean, seconds: boolean): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    ...(year ? { year: 'numeric' } : {}),
    hour: 'numeric',
    minute: '2-digit',
    ...(seconds ? { second: '2-digit' } : {}),
    ...clockOptions(),
  })
}

/**
 * Exactly when it notifies you, then how long until then: "Thursday, November 12 at 22:33:12 ·
 * in 8 h 52 min 3 s". Seconds show for a duration that has them or is under an hour.
 */
export function formatPreview(when: { at: number; delay?: number }, now: number): string {
  const seconds = when.delay !== undefined && showsSeconds(when.delay)
  const year = new Date(when.at).getFullYear() !== new Date(now).getFullYear()
  const format = previewFormat(year, seconds)
  if (when.delay === undefined && when.at <= now) {
    return `${format.format(when.at)} · ${durationWords(now - when.at, false)} ago`
  }
  // a duration reads as typed, even when it is due on the minute just before
  return `${format.format(when.at)} · in ${durationWords(when.delay ?? when.at - now, seconds)}`
}

/** The picker's value written back as text the field understands. */
export function pickerText(value: string): string {
  return value.replace('T', ' ')
}

/** A time as the date picker wants it, in the given zone. */
export function pickerValue(at: number, timeZone: string): string {
  return Temporal.Instant.fromEpochMilliseconds(at)
    .toZonedDateTimeISO(timeZone)
    .toPlainDateTime()
    .toString({ smallestUnit: 'minute' })
}
