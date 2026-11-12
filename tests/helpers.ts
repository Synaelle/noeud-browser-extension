// SPDX-License-Identifier: GPL-3.0-or-later

import { vi } from 'vitest'
import { timestamp, type Reminder } from '../src/lib/reminder'
import type { State } from '../src/lib/store'
import { uuidv7 } from '../src/lib/uuid'

export const T0 = Date.parse('2026-11-12T14:00:00Z')

/** Only Date is faked, so promises and fetch timeouts keep running. */
export function setNow(ms: number) {
  vi.useFakeTimers({ now: ms, toFake: ['Date'] })
}

export function makeReminder(fields: Partial<Reminder> = {}): Reminder {
  return {
    id: uuidv7(),
    title: 'Call the dentist',
    notes: null,
    due_at: timestamp(Date.now()),
    time_zone: 'Europe/Paris',
    repeat: null,
    snoozed_until: null,
    done_at: null,
    deleted: false,
    version: 0,
    created_at: timestamp(Date.now()),
    updated_at: timestamp(Date.now()),
    created_by: null,
    ...fields,
  }
}

/** Writes reminders straight into storage, as an earlier session of the browser would have. */
export async function seed(reminders: Reminder[], extra: Partial<State> = {}) {
  await chrome.storage.local.set({
    reminders: Object.fromEntries(reminders.map((reminder) => [reminder.id, reminder])),
    ...extra,
  })
}
