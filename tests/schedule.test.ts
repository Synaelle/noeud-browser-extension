// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import { timestamp } from '../src/lib/reminder'
import { reschedule, SWEEP } from '../src/lib/schedule'
import { installFakeChrome } from './fakeChrome'
import { makeReminder, setNow, T0 } from './helpers'

let fake: ReturnType<typeof installFakeChrome>

beforeEach(() => {
  fake = installFakeChrome()
  setNow(T0)
})

describe('alarms', () => {
  it('sets one alarm per reminder at the time it is due, and the sweep', async () => {
    const soon = makeReminder({ due_at: timestamp(T0 + 60_000) })
    const snoozed = makeReminder({
      due_at: timestamp(T0 - 60_000),
      snoozed_until: timestamp(T0 + 600_000),
    })
    const done = makeReminder({ due_at: timestamp(T0 + 60_000), done_at: timestamp(T0) })
    const deleted = makeReminder({ due_at: timestamp(T0 + 60_000), deleted: true })
    const past = makeReminder({ due_at: timestamp(T0 - 60_000) })
    const all = [soon, snoozed, done, deleted, past]
    await reschedule(Object.fromEntries(all.map((r) => [r.id, r])), T0)

    expect(fake.alarms.get(`r:${soon.id}`)?.scheduledTime).toBe(T0 + 60_000)
    expect(fake.alarms.get(`r:${snoozed.id}`)?.scheduledTime).toBe(T0 + 600_000)
    for (const r of [done, deleted, past]) expect(fake.alarms.has(`r:${r.id}`)).toBe(false)
    expect(fake.alarms.get(SWEEP)?.periodInMinutes).toBe(1)
  })

  it('moves an alarm when the reminder moves and drops it when it goes', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0 + 60_000) })
    await reschedule({ [reminder.id]: reminder }, T0)
    reminder.snoozed_until = timestamp(T0 + 120_000)
    await reschedule({ [reminder.id]: reminder }, T0)
    expect(fake.alarms.get(`r:${reminder.id}`)?.scheduledTime).toBe(T0 + 120_000)
    await reschedule({}, T0)
    expect([...fake.alarms.keys()]).toEqual([SWEEP])
  })
})
