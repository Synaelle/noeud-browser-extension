// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import {
  alarmFired,
  handle,
  notificationButton,
  notificationClicked,
  wake,
} from '../src/lib/engine'
import { notificationOptions, SUMMARY_ID } from '../src/lib/notify'
import { timestamp } from '../src/lib/reminder'
import { readState } from '../src/lib/store'
import { installFakeChrome } from './fakeChrome'
import { makeReminder, seed, setNow, T0 } from './helpers'

let fake: ReturnType<typeof installFakeChrome>
const DAY = 86_400_000

beforeEach(() => {
  fake = installFakeChrome()
  setNow(T0)
})

describe('catch-up when the browser starts', () => {
  it('notifies about a reminder that came due while the browser was closed, marked missed', async () => {
    const missed = makeReminder({ title: 'Water the plants', due_at: timestamp(T0 - 40 * 60_000) })
    await seed([missed])
    await wake()
    expect(fake.created).toHaveLength(1)
    const [{ id, options }] = fake.created as [(typeof fake.created)[number]]
    expect(id).toBe(`r:${missed.id}`)
    expect(options.title).toBe('Water the plants')
    expect(options.message).toMatch(/^Missed, due at /)
    expect(options.buttons?.map((button) => button.title)).toEqual(['Done', 'Delay 24 hours'])
    expect(options.requireInteraction).toBe(true)
  })

  it('notifies each occurrence once, whatever wakes the extension', async () => {
    await seed([makeReminder({ due_at: timestamp(T0 - 60_000) })])
    await wake()
    await wake()
    await alarmFired('sweep')
    setNow(T0 + 5 * 60_000)
    await alarmFired('sweep')
    expect(fake.created).toHaveLength(1)
  })

  it('says "Due at" when the alarm is on time', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0 + 60_000) })
    await seed([reminder])
    await wake()
    expect(fake.created).toHaveLength(0)
    expect(fake.alarms.get(`r:${reminder.id}`)?.scheduledTime).toBe(T0 + 60_000)
    setNow(T0 + 60_000 + 300)
    await alarmFired(`r:${reminder.id}`)
    expect(fake.created[0]?.options.message).toMatch(/^Due at /)
  })

  it('makes more than three at once into one summary', async () => {
    const titles = ['One', 'Two', 'Three', 'Four', 'Five']
    await seed(
      titles.map((title, i) => makeReminder({ title, due_at: timestamp(T0 - (i + 2) * 3600_000) })),
    )
    await wake()
    expect(fake.created).toHaveLength(1)
    expect(fake.created[0]?.id).toBe(SUMMARY_ID)
    expect(fake.created[0]?.options.title).toBe('5 missed reminders')
    expect(fake.created[0]?.options.message).toBe('Five, Four, Three, and 2 more')
    await wake()
    expect(fake.created).toHaveLength(1)
  })

  it('leaves done, deleted and future reminders quiet', async () => {
    await seed([
      makeReminder({ due_at: timestamp(T0 - 60_000), done_at: timestamp(T0 - 30_000) }),
      makeReminder({ due_at: timestamp(T0 - 60_000), deleted: true }),
      makeReminder({ due_at: timestamp(T0 + 3600_000) }),
      makeReminder({ due_at: timestamp(T0 - 60_000), snoozed_until: timestamp(T0 + 60_000) }),
    ])
    await wake()
    expect(fake.created).toHaveLength(0)
  })

  it('gives Firefox a notification without buttons', () => {
    const options = notificationOptions(makeReminder(), T0, 'firefox')
    expect(options.buttons).toBeUndefined()
    expect(options.requireInteraction).toBeUndefined()
  })
})

describe('notification actions', () => {
  it('delays from the button and notifies again 24 hours later', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0) })
    await seed([reminder])
    await wake()
    await notificationButton(`r:${reminder.id}`, 1)
    const snoozed = (await readState()).reminders[reminder.id]
    expect(snoozed?.snoozed_until).toBe(timestamp(T0 + DAY))
    expect(fake.shown.size).toBe(0)
    expect(fake.alarms.get(`r:${reminder.id}`)?.scheduledTime).toBe(T0 + DAY)
    setNow(T0 + DAY)
    await alarmFired(`r:${reminder.id}`)
    expect(fake.created).toHaveLength(2)
    expect(fake.created[1]?.options.message).toMatch(/^Snoozed, due yesterday at /)
  })

  it('marks done from the button', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0) })
    await seed([reminder])
    await wake()
    await notificationButton(`r:${reminder.id}`, 0)
    expect((await readState()).reminders[reminder.id]?.done_at).toBe(timestamp(T0))
    expect(fake.shown.size).toBe(0)
    expect(fake.alarms.has(`r:${reminder.id}`)).toBe(false)
  })

  it('moves a repeating reminder to its next occurrence when done', async () => {
    // every day at 09:00 in Paris, two days late
    const start = '2026-11-10T08:00:00Z'
    const reminder = makeReminder({
      due_at: start,
      repeat: { every: 'day', interval: 1, start },
    })
    await seed([reminder])
    await handle({ type: 'done', id: reminder.id })
    const moved = (await readState()).reminders[reminder.id]
    expect(moved?.due_at).toBe('2026-11-13T08:00:00Z')
    expect(moved?.done_at).toBeNull()
  })

  it('opens the reminder on a click', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0) })
    await seed([reminder])
    await wake()
    await notificationClicked(`r:${reminder.id}`)
    expect(fake.windows).toEqual([`chrome-extension://noeud/popup.html#${reminder.id}`])
    expect(fake.shown.size).toBe(0)
  })

  it('notifies at once about a reminder added in the past', async () => {
    const id = await handle({
      type: 'add',
      reminder: {
        title: 'Already late',
        notes: null,
        due_at: timestamp(T0 - 1000),
        time_zone: 'UTC',
        repeat: null,
      },
    })
    expect(fake.created.map((entry) => entry.id)).toEqual([`r:${String(id)}`])
  })

  it('refuses a reminder without a title', async () => {
    await expect(
      handle({
        type: 'add',
        reminder: {
          title: '  ',
          notes: null,
          due_at: timestamp(T0),
          time_zone: 'UTC',
          repeat: null,
        },
      }),
    ).rejects.toThrow('Enter what to remember')
  })

  it('deletes a local reminder outright when there is no server', async () => {
    const reminder = makeReminder()
    await seed([reminder])
    await handle({ type: 'delete', id: reminder.id })
    const state = await readState()
    expect(state.reminders).toEqual({})
    expect(state.pending).toEqual({})
  })
})
