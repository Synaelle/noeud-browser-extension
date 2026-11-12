// SPDX-License-Identifier: GPL-3.0-or-later

// The date math behind the popup's calendar: the month grid, moving the day with the keyboard
// and the time of day in either clock. The calendar fills When with the same text the browser's
// date picker gave, so parsing it stays in when.ts.

import type { Clock } from './format'
import { pickerText } from './when'

/** The first day of the week where the browser is set, 1 for Monday to 7 for Sunday. */
export function weekStart(locale: string): number {
  const info = new Intl.Locale(locale)
  // older Firefox has no week info, Monday is the most common start
  return 'getWeekInfo' in info ? info.getWeekInfo().firstDay : 1
}

/** Six weeks of seven days covering the month, so the grid keeps its height. */
export function monthWeeks(
  month: Temporal.PlainYearMonth,
  firstDay: number,
): Temporal.PlainDate[][] {
  const first = month.toPlainDate({ day: 1 })
  const start = first.subtract({ days: (first.dayOfWeek - firstDay + 7) % 7 })
  return Array.from({ length: 6 }, (_, week) =>
    Array.from({ length: 7 }, (_, day) => start.add({ days: week * 7 + day })),
  )
}

/**
 * The day a key moves to: arrows by a day or a week, Page Up and Page Down by a month (to the
 * month's last day when it is shorter), Home and End to the ends of the week. Null for other keys.
 */
export function moveDay(
  day: Temporal.PlainDate,
  key: string,
  firstDay: number,
): Temporal.PlainDate | null {
  switch (key) {
    case 'ArrowLeft':
      return day.subtract({ days: 1 })
    case 'ArrowRight':
      return day.add({ days: 1 })
    case 'ArrowUp':
      return day.subtract({ weeks: 1 })
    case 'ArrowDown':
      return day.add({ weeks: 1 })
    case 'PageUp':
      return day.subtract({ months: 1 })
    case 'PageDown':
      return day.add({ months: 1 })
    case 'Home':
      return day.subtract({ days: (day.dayOfWeek - firstDay + 7) % 7 })
    case 'End':
      return day.add({ days: (firstDay + 6 - day.dayOfWeek) % 7 })
    default:
      return null
  }
}

/** An hour as the time entry shows it: 0 to 23, or 1 to 12 with AM or PM. */
export function clockHour(hour: number, clock: Clock): { hour: number; pm: boolean } {
  if (clock === '24h') return { hour, pm: hour >= 12 }
  return { hour: hour % 12 || 12, pm: hour >= 12 }
}

/** The hour of the day from what was typed, or null when it is not an hour in that clock. */
export function dayHour(text: string, pm: boolean, clock: Clock): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const hour = Number(text)
  if (clock === '24h') return hour <= 23 ? hour : null
  if (hour < 1 || hour > 12) return null
  return (hour % 12) + (pm ? 12 : 0)
}

export function minuteOf(text: string): number | null {
  if (!/^\d{1,2}$/.test(text.trim())) return null
  const minute = Number(text)
  return minute <= 59 ? minute : null
}

/** What the calendar writes into When: "2026-11-13 14:30", as the date picker did. */
export function calendarText(day: Temporal.PlainDate, hour: number, minute: number): string {
  return pickerText(day.toPlainDateTime({ hour, minute }).toString({ smallestUnit: 'minute' }))
}
