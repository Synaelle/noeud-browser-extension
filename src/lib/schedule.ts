// SPDX-License-Identifier: GPL-3.0-or-later

import { notifyAt, type Reminder } from './reminder'

/** The one-minute safety net: catch-up and sync. */
export const SWEEP = 'sweep'
export const alarmPrefix = 'r:'

// Chromium refuses alarms past 500 per extension; the sweep covers the rest
const ALARM_LIMIT = 400

/** One alarm per reminder at the time it is due, and the sweep alarm. */
export async function reschedule(reminders: Record<string, Reminder>, now: number): Promise<void> {
  const upcoming = Object.values(reminders)
    .map((reminder) => [alarmPrefix + reminder.id, notifyAt(reminder)] as const)
    .filter((entry): entry is readonly [string, number] => entry[1] !== null && entry[1] > now)
    .sort((a, b) => a[1] - b[1])
    .slice(0, ALARM_LIMIT)
  const wanted = new Map(upcoming)
  const existing = await chrome.alarms.getAll()
  for (const alarm of existing) {
    if (alarm.name === SWEEP) continue
    if (wanted.get(alarm.name) === alarm.scheduledTime) wanted.delete(alarm.name)
    else if (!wanted.has(alarm.name)) await chrome.alarms.clear(alarm.name)
  }
  for (const [name, when] of wanted) await chrome.alarms.create(name, { when })
  if (!existing.some((alarm) => alarm.name === SWEEP)) {
    await chrome.alarms.create(SWEEP, { periodInMinutes: 1 })
  }
}
