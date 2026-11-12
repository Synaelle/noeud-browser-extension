// SPDX-License-Identifier: GPL-3.0-or-later

import { notificationIcon } from '../brand'
import { formatAt, loadClock } from './format'
import { notifyAt, type Reminder } from './reminder'
import type { State } from './store'

/** A notification shown this much after its time says it was missed. */
export const MISSED_AFTER_MS = 60_000
/** More reminders than this at once become one summary notification. */
export const SUMMARY_ABOVE = 3
export const SNOOZE_MINUTES = 10
export const SUMMARY_ID = 'summary'
const notificationPrefix = 'r:'
// alarms can fire a moment before their time
const EARLY_MS = 1000

export function notificationId(reminderId: string): string {
  return notificationPrefix + reminderId
}

/** The reminder a notification is about, or null for the summary. */
export function reminderOf(notificationId: string): string | null {
  return notificationId.startsWith(notificationPrefix)
    ? notificationId.slice(notificationPrefix.length)
    : null
}

function isMissed(reminder: Reminder, now: number): boolean {
  return now - (notifyAt(reminder) ?? now) > MISSED_AFTER_MS
}

/** "Due at 14:00", "Missed, due at 14:00" or "Snoozed, due at 14:00", then the notes. */
export function notificationText(reminder: Reminder, now: number): string {
  const at = formatAt(Date.parse(reminder.due_at), now)
  const line = isMissed(reminder, now)
    ? `Missed, due ${at}`
    : reminder.snoozed_until
      ? `Snoozed, due ${at}`
      : `Due ${at}`
  return reminder.notes ? `${line}\n${reminder.notes.slice(0, 200)}` : line
}

export function notificationOptions(
  reminder: Reminder,
  now: number,
  browser: typeof __BROWSER__,
): chrome.notifications.Options {
  const options: chrome.notifications.Options = {
    type: 'basic',
    iconUrl: chrome.runtime.getURL(notificationIcon),
    title: reminder.title,
    message: notificationText(reminder, now),
  }
  // Firefox refuses buttons and requireInteraction, a click there opens the reminder
  if (browser === 'chromium') {
    options.buttons = [{ title: 'Done' }, { title: `Snooze ${SNOOZE_MINUTES} min` }]
    options.requireInteraction = true
    options.priority = 2
  }
  return options
}

function summaryOptions(due: Reminder[], now: number): chrome.notifications.Options {
  const missed = due.every((reminder) => isMissed(reminder, now))
  const titles = due.slice(0, SUMMARY_ABOVE).map((reminder) => reminder.title)
  const rest = due.length - titles.length
  return {
    type: 'basic',
    iconUrl: chrome.runtime.getURL(notificationIcon),
    title: missed ? `${due.length} missed reminders` : `${due.length} reminders are due`,
    message: titles.join(', ') + (rest > 0 ? `, and ${rest} more` : ''),
  }
}

/**
 * Notifies every reminder whose time has come and that was not notified for this occurrence,
 * whether its alarm fired on time or the browser was closed when it came due.
 */
export async function notifyDue(
  state: State,
  now: number,
  browser: typeof __BROWSER__ = __BROWSER__,
): Promise<void> {
  // the worker may have just woken: read the clock before writing any time
  await loadClock()
  const due = Object.values(state.reminders)
    .filter((reminder) => {
      const at = notifyAt(reminder)
      return at !== null && at <= now + EARLY_MS && state.fired[reminder.id] !== at
    })
    .sort((a, b) => (notifyAt(a) ?? 0) - (notifyAt(b) ?? 0))
  if (due.length > SUMMARY_ABOVE) {
    await chrome.notifications.create(SUMMARY_ID, summaryOptions(due, now))
  } else {
    for (const reminder of due) {
      await chrome.notifications.create(
        notificationId(reminder.id),
        notificationOptions(reminder, now, browser),
      )
    }
  }
  for (const reminder of due) state.fired[reminder.id] = notifyAt(reminder) ?? now
}

/** Takes down notifications of reminders that were done, snoozed or deleted since. */
export async function clearStale(reminders: Record<string, Reminder>, now: number): Promise<void> {
  for (const id of Object.keys(await chrome.notifications.getAll())) {
    const reminderId = reminderOf(id)
    if (reminderId === null) continue
    const reminder = reminders[reminderId]
    const at = reminder ? notifyAt(reminder) : null
    if (at === null || at > now + EARLY_MS) await chrome.notifications.clear(id)
  }
}
