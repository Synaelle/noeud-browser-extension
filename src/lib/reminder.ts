// SPDX-License-Identifier: GPL-3.0-or-later

/** A reminder as the server sends it, see docs/api.md. */
export interface Reminder {
  id: string
  title: string
  notes: string | null
  due_at: string
  time_zone: string
  repeat: Repeat | null
  snoozed_until: string | null
  done_at: string | null
  deleted: boolean
  /** 0 until the server has seen the reminder. */
  version: number
  created_at: string
  updated_at: string
  created_by: string | null
}

export type RepeatUnit = 'day' | 'week' | 'month' | 'year'

export interface Repeat {
  every: RepeatUnit
  interval: number
  start: string
}

export const TITLE_MAX = 500

/** When the reminder is next due, in milliseconds, or null when it never will. */
export function notifyAt(reminder: Reminder): number | null {
  if (reminder.deleted || reminder.done_at !== null) return null
  return Date.parse(reminder.snoozed_until ?? reminder.due_at)
}

/** A time the way the server writes it, UTC to the second. */
export function timestamp(ms: number): string {
  return Temporal.Instant.fromEpochMilliseconds(Math.floor(ms / 1000) * 1000).toString()
}

/** The fields a client can change, compared to tell whether the server has the local state. */
export function sameContent(a: Reminder, b: Reminder): boolean {
  const time = (value: string | null) => (value === null ? null : Date.parse(value))
  return (
    a.title === b.title &&
    a.notes === b.notes &&
    time(a.due_at) === time(b.due_at) &&
    a.time_zone === b.time_zone &&
    time(a.snoozed_until) === time(b.snoozed_until) &&
    time(a.done_at) === time(b.done_at) &&
    (a.repeat === null || b.repeat === null
      ? a.repeat === b.repeat
      : a.repeat.every === b.repeat.every &&
        a.repeat.interval === b.repeat.interval &&
        time(a.repeat.start) === time(b.repeat.start))
  )
}
