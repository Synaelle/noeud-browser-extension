// SPDX-License-Identifier: GPL-3.0-or-later

import {
  addReminder,
  editReminder,
  markDone,
  remove,
  reopen,
  restoreReminder,
  snooze,
} from './actions'
import type { Message } from './messages'
import { TITLE_MAX } from './reminder'
import { clearStale, notifyDue, reminderOf, SNOOZE_MINUTES } from './notify'
import { reschedule, SWEEP } from './schedule'
import { readState, withState } from './store'
import { connect, disconnect, sync } from './sync'
import { noteTimeUse } from './usage'

/** Notifies what came due, then sets the alarms and takes down notifications that are stale. */
export async function catchUp(): Promise<void> {
  await withState((state) => notifyDue(state, Date.now()))
  const state = await readState()
  const now = Date.now()
  await reschedule(state.reminders, now)
  await clearStale(state.reminders, now)
}

async function syncThenCatchUp(): Promise<void> {
  if (!(await readState()).server) return
  await sync()
  await catchUp()
}

/** Browser start, install and update: whatever came due while the browser was closed notifies you now. */
export async function wake(): Promise<void> {
  await catchUp()
  await syncThenCatchUp()
}

export async function alarmFired(name: string): Promise<void> {
  await catchUp()
  if (name === SWEEP) await syncThenCatchUp()
}

async function apply(message: Message): Promise<unknown> {
  const now = Date.now()
  switch (message.type) {
    case 'add':
      return withState((state) => {
        const { id } = addReminder(state, message.reminder, now)
        noteTimeUse(state, message.when, now)
        return id
      })
    case 'done':
      return withState((state) => markDone(state, message.id, now))
    case 'reopen':
      return withState((state) => reopen(state, message.id, now))
    case 'snooze':
      return withState((state) => {
        snooze(state, message.id, message.until, now)
        noteTimeUse(state, message.when, now)
      })
    case 'delete':
      return withState((state) => remove(state, message.id, now))
    case 'edit':
      return withState((state) => editReminder(state, message.id, message.changes, now))
    case 'restore':
      return withState((state) => restoreReminder(state, message.reminder, now))
    case 'connect':
      return withState((state) => connect(state, message.server))
    case 'disconnect':
      return withState(disconnect)
    case 'sync':
      return undefined
  }
}

/**
 * Applies a change from the popup or the options page. The answer comes once the change is
 * stored and scheduled; the sync with the server follows on its own.
 */
export async function handle(message: Message): Promise<unknown> {
  const value = await apply(message)
  await catchUp()
  const following = syncThenCatchUp()
  if (message.type === 'sync' || message.type === 'connect') await following
  return value
}

/** Opens the reminder in a small window, the way to act on it where notifications have no buttons. */
export async function notificationClicked(notificationId: string): Promise<void> {
  const reminderId = reminderOf(notificationId)
  await chrome.notifications.clear(notificationId)
  await chrome.windows.create({
    url: chrome.runtime.getURL(reminderId ? `popup.html#${reminderId}` : 'popup.html'),
    type: 'popup',
    width: 380,
    height: 600,
  })
}

export async function notificationButton(notificationId: string, index: number): Promise<void> {
  const reminderId = reminderOf(notificationId)
  if (reminderId === null) return
  await chrome.notifications.clear(notificationId)
  await handle(
    index === 0
      ? { type: 'done', id: reminderId }
      : { type: 'snooze', id: reminderId, until: Date.now() + SNOOZE_MINUTES * 60_000 },
  )
}

export const MENU_ID = 'remind'

/** The page, link and selection menu item. Menus survive restarts, so this runs on install. */
export async function addMenu(): Promise<void> {
  await chrome.contextMenus.removeAll()
  chrome.contextMenus.create({
    id: MENU_ID,
    title: 'Remind me about this',
    contexts: ['page', 'link', 'selection'],
  })
}

/** What the popup opens with after "Remind me about this". */
export interface Draft {
  title: string
  notes: string | null
}

export async function menuClicked(
  info: chrome.contextMenus.OnClickData,
  tab?: { title?: string; url?: string },
): Promise<void> {
  if (info.menuItemId !== MENU_ID) return
  const title = (info.selectionText ?? info.linkText ?? tab?.title ?? '').trim().slice(0, TITLE_MAX)
  const draft: Draft = { title, notes: info.linkUrl ?? info.pageUrl ?? tab?.url ?? null }
  await chrome.storage.session.set({ draft })
  try {
    await chrome.action.openPopup()
  } catch (error) {
    // Chromium refuses when no browser window has focus, Firefox outside a user action
    if (!(error instanceof Error)) throw error
    await chrome.windows.create({
      url: chrome.runtime.getURL('popup.html'),
      type: 'popup',
      width: 380,
      height: 600,
    })
  }
}
