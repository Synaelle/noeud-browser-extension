// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import {
  chooseDelay,
  DEFAULT_DELAY,
  delayChoices,
  delayTitle,
  loadDelay,
  readDelay,
} from '../src/lib/delay'
import { handle, notificationButton, wake } from '../src/lib/engine'
import { notificationOptions, summaryOptions, SUMMARY_ID } from '../src/lib/notify'
import { timestamp } from '../src/lib/reminder'
import { readState } from '../src/lib/store'
import { installFakeChrome } from './fakeChrome'
import { makeReminder, seed, setNow, T0 } from './helpers'

const HOUR = 3_600_000
let fake: ReturnType<typeof installFakeChrome>

beforeEach(() => {
  fake = installFakeChrome()
  setNow(T0)
})

describe('the delay setting', () => {
  it('is 24 hours until chosen', async () => {
    expect(DEFAULT_DELAY).toBe('1d')
    expect(await loadDelay()).toBe('1d')
    expect(delayTitle(await loadDelay())).toBe('Delay 24 hours')
  })

  it('offers 1 hour, 3 hours, 24 hours and 1 week', () => {
    expect(delayChoices.map(delayTitle)).toEqual([
      'Delay 1 hour',
      'Delay 3 hours',
      'Delay 24 hours',
      'Delay 1 week',
    ])
  })

  it.each([
    ['3h', '3h', 'Delay 3 hours'],
    ['36h', '1d12h', 'Delay 36 hours'],
    ['1d12h', '1d12h', 'Delay 36 hours'],
    [' 2 D ', '2d', 'Delay 2 days'],
    ['90m', '1h30m', 'Delay 1 h 30 min'],
    ['1d6', '1d6h', 'Delay 30 hours'],
    ['in 45m', '45m', 'Delay 45 min'],
  ])('stores a custom %j as %j', async (typed, stored, title) => {
    await chooseDelay(typed)
    expect(fake.storage.get('delay')).toBe(stored)
    expect(await loadDelay()).toBe(stored)
    expect(delayTitle(stored)).toBe(title)
  })

  it.each([
    ['soon', 'Enter a length like 2h or 1d12h'],
    ['', 'Enter a length like 2h or 1d12h'],
    ['18:00', 'Enter a length like 2h or 1d12h'],
    ['0m', 'Enter a time after now, like 10m'],
    ['1h1h', 'Use each unit once, like 1h30m'],
    ['600w', 'Keep it under 10 years'],
  ])('refuses %j', async (typed, error) => {
    expect(readDelay(typed)).toEqual({ error })
    await expect(chooseDelay(typed)).rejects.toThrow(error)
    expect(fake.storage.has('delay')).toBe(false)
  })

  it('falls back to 24 hours when what is stored cannot be read', async () => {
    fake.storage.set('delay', 'soon')
    expect(await loadDelay()).toBe('1d')
    fake.storage.set('delay', 3)
    expect(await loadDelay()).toBe('1d')
  })
})

describe('the button', () => {
  it('says the chosen length on Chromium', () => {
    const reminder = makeReminder()
    expect(notificationOptions(reminder, T0, 'chromium').buttons?.[1]?.title).toBe('Delay 24 hours')
    expect(notificationOptions(reminder, T0, 'chromium', '3h').buttons?.[1]?.title).toBe(
      'Delay 3 hours',
    )
    expect(summaryOptions([reminder], T0, 'chromium', '1w').buttons).toEqual([
      { title: 'Delay 1 week' },
    ])
  })

  it('is left out on Firefox, where a click opens the reminder', () => {
    const reminder = makeReminder()
    expect(notificationOptions(reminder, T0, 'firefox', '3h').buttons).toBeUndefined()
    expect(summaryOptions([reminder], T0, 'firefox').buttons).toBeUndefined()
  })

  it('reads the setting when the notification is made', async () => {
    await chooseDelay('3h')
    await seed([makeReminder({ due_at: timestamp(T0) })])
    await wake()
    expect(fake.created[0]?.options.buttons?.[1]?.title).toBe('Delay 3 hours')
  })
})

describe('delaying', () => {
  it('puts the reminder off by the length set when the button is pressed', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0) })
    await seed([reminder])
    await wake()
    await chooseDelay('3h')
    await notificationButton(`r:${reminder.id}`, 1)
    const state = await readState()
    expect(state.reminders[reminder.id]?.snoozed_until).toBe(timestamp(T0 + 3 * HOUR))
    expect(fake.shown.size).toBe(0)
  })

  it('puts off every reminder of the summary, except those done since', async () => {
    const reminders = [1, 2, 3, 4, 5].map((n) =>
      makeReminder({ title: `Reminder ${n}`, due_at: timestamp(T0 - n * 60_000) }),
    )
    await seed(reminders)
    await wake()
    expect(fake.created.map((notification) => notification.id)).toEqual([SUMMARY_ID])
    expect(fake.created[0]?.options.buttons).toEqual([{ title: 'Delay 24 hours' }])
    const [first, ...rest] = reminders as [(typeof reminders)[number], ...typeof reminders]
    await handle({ type: 'done', id: first.id })
    await notificationButton(SUMMARY_ID, 0)
    const state = await readState()
    for (const reminder of rest) {
      expect(state.reminders[reminder.id]?.snoozed_until).toBe(timestamp(T0 + 24 * HOUR))
    }
    expect(state.reminders[first.id]?.snoozed_until).toBeNull()
    expect(fake.shown.size).toBe(0)
  })

  it('is the same from the popup', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0 - HOUR) })
    await seed([reminder])
    await handle({ type: 'delay', ids: [reminder.id] })
    expect((await readState()).reminders[reminder.id]?.snoozed_until).toBe(
      timestamp(T0 + 24 * HOUR),
    )
    expect(fake.alarms.get(`r:${reminder.id}`)?.scheduledTime).toBe(T0 + 24 * HOUR)
  })
})
