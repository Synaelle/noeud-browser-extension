// SPDX-License-Identifier: GPL-3.0-or-later

import {
  addMenu,
  alarmFired,
  handle,
  menuClicked,
  notificationButton,
  notificationClicked,
  wake,
} from '../lib/engine'
import type { Message, Reply } from '../lib/messages'

// Listeners are added at the top level so that the browser finds them when it wakes the worker.

chrome.runtime.onStartup.addListener(() => void wake())
chrome.runtime.onInstalled.addListener(() => {
  void addMenu()
  void wake()
})
chrome.contextMenus.onClicked.addListener((info, tab) => void menuClicked(info, tab))
chrome.alarms.onAlarm.addListener((alarm) => void alarmFired(alarm.name))
chrome.notifications.onClicked.addListener((id) => void notificationClicked(id))
chrome.notifications.onButtonClicked.addListener((id, index) => void notificationButton(id, index))

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  handle(message as Message).then(
    (value): void => sendResponse({ ok: true, value } satisfies Reply),
    (error: unknown): void =>
      sendResponse({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      } satisfies Reply),
  )
  return true
})
