// SPDX-License-Identifier: GPL-3.0-or-later

import type { Reminder } from './reminder'
import type { TimeUse } from './usage'

export interface Server {
  /** The origin and optional base path, without a trailing slash. */
  url: string
  token: string
  /** The token's name, as the server reported it. */
  name: string
}

export interface SyncStatus {
  state: 'off' | 'syncing' | 'ok' | 'offline' | 'error'
  /** The last attempt. */
  at: string | null
  /** The last attempt that reached the server and went through. */
  ok_at: string | null
  message: string | null
}

/** A local change the server has not seen yet. */
export interface Pending {
  /** The server version the change was made on, 0 for a reminder the server does not have. */
  base: number
  /** Bumped on every local change, so a push can tell whether more came while it ran. */
  rev: number
  /** The reminder as the server last had it, to keep both sides' changes after a conflict. */
  before?: Reminder
  /** Why the server refused this change. It is not sent again until the reminder changes. */
  refused?: string
}

export interface State {
  reminders: Record<string, Reminder>
  /** The due time (notifyAt) last notified for each reminder, one record per occurrence. */
  fired: Record<string, number>
  /** The outbox. */
  pending: Record<string, Pending>
  cursor: number
  server: Server | null
  sync: SyncStatus
  /** The times chosen when adding and snoozing, for the quick picks. */
  times: TimeUse[]
}

const defaults: State = {
  reminders: {},
  fired: {},
  pending: {},
  cursor: 0,
  server: null,
  sync: { state: 'off', at: null, ok_at: null, message: null },
  times: [],
}

const keys = Object.keys(defaults) as (keyof State)[]

/** A stored value of the wrong shape, from a bug or a hand edit, reads as the default. */
function fits(value: unknown, fallback: unknown): boolean {
  if (fallback === null)
    return value === null || (typeof value === 'object' && !Array.isArray(value))
  if (Array.isArray(fallback)) return Array.isArray(value)
  return value !== null && typeof value === typeof fallback && !Array.isArray(value)
}

export async function readState(): Promise<State> {
  const stored = await chrome.storage.local.get(keys)
  const state = structuredClone(defaults) as unknown as Record<string, unknown>
  for (const key of keys) {
    if (key in stored && fits(stored[key], defaults[key])) state[key] = stored[key]
  }
  return state as unknown as State
}

let queue: Promise<unknown> = Promise.resolve()

/**
 * Reads the state, lets `change` edit it and writes back what changed. Calls run one after the
 * other, so the alarm, the sweep, a sync and the popup never overwrite each other's changes.
 */
export function withState<T>(change: (state: State) => T | Promise<T>): Promise<T> {
  const run = queue.then(async () => {
    const state = await readState()
    const before = Object.fromEntries(keys.map((key) => [key, JSON.stringify(state[key])]))
    const result = await change(state)
    const changed = keys.filter((key) => JSON.stringify(state[key]) !== before[key])
    if (changed.length > 0) {
      await chrome.storage.local.set(Object.fromEntries(changed.map((key) => [key, state[key]])))
    }
    return result
  })
  queue = run.catch(() => undefined)
  return run
}
