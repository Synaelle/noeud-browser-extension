// SPDX-License-Identifier: GPL-3.0-or-later

import type { Changes, NewReminder } from './actions'
import type { Reminder } from './reminder'
import type { Server } from './store'

/** What the popup and the options page ask the background to do. */
export type Message =
  /** `when` is the time as chosen, counted for the quick picks. */
  | { type: 'add'; reminder: NewReminder; when?: string }
  | { type: 'done' | 'reopen' | 'delete'; id: string }
  | { type: 'snooze'; id: string; until: number; when?: string }
  | { type: 'edit'; id: string; changes: Changes }
  | { type: 'restore'; reminder: Reminder }
  | { type: 'sync' }
  | { type: 'connect'; server: Server }
  | { type: 'disconnect' }

export type Reply = { ok: true; value: unknown } | { ok: false; error: string }

export async function send(message: Message): Promise<unknown> {
  const reply = (await chrome.runtime.sendMessage(message)) as Reply
  if (!reply.ok) throw new Error(reply.error)
  return reply.value
}
