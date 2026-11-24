// SPDX-License-Identifier: GPL-3.0-or-later

// The red number on the toolbar icon: how many reminders are overdue.

import { EARLY_MS } from './notify'
import { notifyAt, type Reminder } from './reminder'

// Ficelle's red with its dark text, as on the Add button
const BADGE_COLOR = '#e44c3e'
const BADGE_TEXT_COLOR = '#140b09'

/** Reminders whose time, or snoozed time, has come and that are neither done nor deleted. */
export function overdueCount(reminders: Record<string, Reminder>, now: number): number {
  return Object.values(reminders).filter((reminder) => {
    const at = notifyAt(reminder)
    return at !== null && at <= now + EARLY_MS
  }).length
}

/** Nothing when none are overdue, so there is no badge; "99+" past 99 to fit the icon. */
export function badgeText(count: number): string {
  if (count === 0) return ''
  return count > 99 ? '99+' : String(count)
}

export async function showOverdue(reminders: Record<string, Reminder>, now: number): Promise<void> {
  await chrome.action.setBadgeBackgroundColor({ color: BADGE_COLOR })
  await chrome.action.setBadgeTextColor({ color: BADGE_TEXT_COLOR })
  await chrome.action.setBadgeText({ text: badgeText(overdueCount(reminders, now)) })
}
