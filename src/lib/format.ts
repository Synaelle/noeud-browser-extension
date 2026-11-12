// SPDX-License-Identifier: GPL-3.0-or-later

import type { Repeat } from './reminder'

/** How times are written: 24-hour unless 12-hour is chosen in the options. */
export type Clock = '24h' | '12h'

let hourCycle: 'h23' | 'h12' = 'h23'
let timeFormat = makeTimeFormat()

function makeTimeFormat(): Intl.DateTimeFormat {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', hourCycle })
}

export function setClock(clock: Clock): void {
  hourCycle = clock === '12h' ? 'h12' : 'h23'
  timeFormat = makeTimeFormat()
}

/** The hour cycle of the chosen clock, for other date formats. */
export function clockOptions(): { hourCycle: 'h23' | 'h12' } {
  return { hourCycle }
}

/** Applies the stored choice, 24-hour when there is none. */
export async function loadClock(): Promise<Clock> {
  const { clock } = await chrome.storage.local.get('clock')
  const chosen: Clock = clock === '12h' ? '12h' : '24h'
  setClock(chosen)
  return chosen
}

export async function chooseClock(clock: Clock): Promise<void> {
  setClock(clock)
  await chrome.storage.local.set({ clock })
}
const dayFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})
const dayYearFormat = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
})

/** The browser's time zone, the one reminders made here are set in. */
export function localZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone
}

function localDate(ms: number): Temporal.PlainDate {
  return Temporal.Instant.fromEpochMilliseconds(ms).toZonedDateTimeISO(localZone()).toPlainDate()
}

/** "Today", "Tomorrow", "Yesterday" or a short date, in the browser's time zone. */
export function formatDay(ms: number, now: number): string {
  const day = localDate(ms)
  const today = localDate(now)
  const offset = today.until(day).days
  if (offset === 0) return 'Today'
  if (offset === 1) return 'Tomorrow'
  if (offset === -1) return 'Yesterday'
  return (day.year === today.year ? dayFormat : dayYearFormat).format(ms)
}

export function formatTime(ms: number): string {
  return timeFormat.format(ms)
}

/** A time of day in the chosen clock, "18:00" or "6:00 PM", for button labels. */
export function formatHour(hour: number, minute = 0): string {
  return timeFormat.format(new Date(2000, 0, 1, hour, minute))
}

/** "Today, 14:00" for lists. */
export function formatWhen(ms: number, now: number): string {
  return `${formatDay(ms, now)}, ${formatTime(ms)}`
}

/** "at 14:00" today, "yesterday at 14:00" or "Tue 10 Nov at 14:00" otherwise, for sentences. */
export function formatAt(ms: number, now: number): string {
  const day = formatDay(ms, now)
  if (day === 'Today') return `at ${formatTime(ms)}`
  const lower = day === 'Tomorrow' || day === 'Yesterday' ? day.toLowerCase() : day
  return `${lower} at ${formatTime(ms)}`
}

export function formatRepeat(repeat: Repeat): string {
  return repeat.interval === 1
    ? `Every ${repeat.every}`
    : `Every ${repeat.interval} ${repeat.every}s`
}
