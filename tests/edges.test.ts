// SPDX-License-Identifier: GPL-3.0-or-later

// What a day of trying to break the extension found.

import { beforeEach, describe, expect, it } from 'vitest'
import { handle, wake } from '../src/lib/engine'
import { SUMMARY_ID } from '../src/lib/notify'
import { fieldsProblem, timestamp, type Reminder } from '../src/lib/reminder'
import { readState } from '../src/lib/store'
import { installFakeChrome } from './fakeChrome'
import { makeReminder, seed, setNow, T0 } from './helpers'

let fake: ReturnType<typeof installFakeChrome>

beforeEach(() => {
  fake = installFakeChrome()
  setNow(T0)
})

describe('undo of a delete', () => {
  it('does not notify an overdue reminder a second time', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0 - 60_000) })
    await seed([reminder])
    await wake()
    expect(fake.created).toHaveLength(1)
    const snapshot = (await readState()).reminders[reminder.id]
    if (!snapshot) throw new Error('missing')
    await handle({ type: 'delete', id: reminder.id })
    await handle({ type: 'restore', reminder: snapshot })
    await wake()
    expect(fake.created).toHaveLength(1)
  })
})

describe('the summary notification', () => {
  it('goes once every reminder in it is done', async () => {
    const reminders = [1, 2, 3, 4].map((n) =>
      makeReminder({ title: `Reminder ${n}`, due_at: timestamp(T0 - n * 60_000) }),
    )
    await seed(reminders)
    await wake()
    expect(fake.shown.has(SUMMARY_ID)).toBe(true)
    const [last, ...others] = reminders.reverse() as [Reminder, ...Reminder[]]
    for (const reminder of others) await handle({ type: 'done', id: reminder.id })
    expect(fake.shown.has(SUMMARY_ID)).toBe(true)
    await handle({ type: 'done', id: last.id })
    expect(fake.shown.has(SUMMARY_ID)).toBe(false)
  })
})

describe('stored data of the wrong shape', () => {
  it('reads as empty, and adding works again', async () => {
    await chrome.storage.local.set({ reminders: null, fired: [], times: 'x', cursor: '3' })
    const state = await readState()
    expect(state.reminders).toEqual({})
    expect(state.fired).toEqual({})
    expect(state.times).toEqual([])
    expect(state.cursor).toBe(0)
    const id = await handle({
      type: 'add',
      reminder: {
        title: 'Pet the cat',
        notes: null,
        due_at: timestamp(T0 + 3600_000),
        time_zone: 'Europe/Paris',
        repeat: null,
      },
    })
    expect((await readState()).reminders[String(id)]?.title).toBe('Pet the cat')
  })
})

describe('the limits the server sets', () => {
  it('counts an emoji as one character, as the server does', () => {
    expect(fieldsProblem({ title: '🐈'.repeat(500) })).toBeNull()
    expect(fieldsProblem({ title: '🐈'.repeat(501) })).toMatch(/under 500/)
  })
  it('refuses long notes and repeats past 1000 before the server does', () => {
    expect(fieldsProblem({ notes: 'a'.repeat(10_001) })).toMatch(/notes under 10,000/)
    expect(fieldsProblem({ repeat: { interval: 5000 } })).toMatch(/1 to 1000/)
    expect(fieldsProblem({ repeat: { interval: 1000 } })).toBeNull()
  })
  it('says so when adding', async () => {
    await expect(
      handle({
        type: 'add',
        reminder: {
          title: 'Pet the cat',
          notes: 'a'.repeat(10_001),
          due_at: timestamp(T0 + 3600_000),
          time_zone: 'Europe/Paris',
          repeat: null,
        },
      }),
    ).rejects.toThrow(/notes under/)
  })
})
