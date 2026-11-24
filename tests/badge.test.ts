// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import { badgeText, overdueCount } from '../src/lib/badge'
import { alarmFired, handle, notificationButton, wake } from '../src/lib/engine'
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

describe('counting', () => {
  it('counts what is due or past its snooze, not what is done, deleted or ahead', () => {
    const reminders = [
      makeReminder({ due_at: timestamp(T0 - HOUR) }),
      makeReminder({ due_at: timestamp(T0) }),
      makeReminder({ due_at: timestamp(T0 - HOUR), snoozed_until: timestamp(T0 - 60_000) }),
      makeReminder({ due_at: timestamp(T0 - HOUR), snoozed_until: timestamp(T0 + HOUR) }),
      makeReminder({ due_at: timestamp(T0 - HOUR), done_at: timestamp(T0) }),
      makeReminder({ due_at: timestamp(T0 - HOUR), deleted: true }),
      makeReminder({ due_at: timestamp(T0 + HOUR) }),
    ]
    expect(overdueCount(Object.fromEntries(reminders.map((r) => [r.id, r])), T0)).toBe(3)
  })

  it.each([
    [0, ''],
    [1, '1'],
    [99, '99'],
    [100, '99+'],
  ])('%i shows %j', (count, text) => expect(badgeText(count)).toBe(text))
})

describe('the badge', () => {
  it('shows the count in red, and nothing when none are overdue', async () => {
    const [late, alsoLate] = [1, 2].map(() => makeReminder({ due_at: timestamp(T0 - HOUR) })) as [
      ReturnType<typeof makeReminder>,
      ReturnType<typeof makeReminder>,
    ]
    await seed([late, alsoLate, makeReminder({ due_at: timestamp(T0 + HOUR) })])
    await wake()
    expect(fake.badge).toEqual({ text: '2', color: '#e44c3e', textColor: '#140b09' })
    await handle({ type: 'done', id: late.id })
    expect(fake.badge.text).toBe('1')
    await handle({ type: 'delete', id: alsoLate.id })
    expect(fake.badge.text).toBe('')
  })

  it('goes up when a reminder comes due', async () => {
    const soon = makeReminder({ due_at: timestamp(T0 + HOUR) })
    await seed([soon])
    await wake()
    expect(fake.badge.text).toBe('')
    setNow(T0 + HOUR)
    await alarmFired(`r:${soon.id}`)
    expect(fake.badge.text).toBe('1')
  })

  it('goes down on snooze and Delay, and up again when the snooze is over', async () => {
    const [a, b] = [1, 2].map(() => makeReminder({ due_at: timestamp(T0 - HOUR) })) as [
      ReturnType<typeof makeReminder>,
      ReturnType<typeof makeReminder>,
    ]
    await seed([a, b])
    await wake()
    expect(fake.badge.text).toBe('2')
    await handle({ type: 'snooze', id: a.id, until: T0 + HOUR })
    expect(fake.badge.text).toBe('1')
    await notificationButton(`r:${b.id}`, 1)
    expect(fake.badge.text).toBe('')
    setNow(T0 + HOUR)
    await alarmFired(`r:${a.id}`)
    expect(fake.badge.text).toBe('1')
  })

  it('follows Undo and edits', async () => {
    const reminder = makeReminder({ due_at: timestamp(T0 - HOUR) })
    await seed([reminder])
    await wake()
    await handle({ type: 'delete', id: reminder.id })
    expect(fake.badge.text).toBe('')
    // the popup's Undo sends the reminder as it was before the delete
    await handle({ type: 'restore', reminder })
    expect(fake.badge.text).toBe('1')
    const [restored] = Object.values((await readState()).reminders).filter((r) => !r.deleted)
    if (!restored) throw new Error('not restored')
    await handle({ type: 'edit', id: restored.id, changes: { due_at: timestamp(T0 + HOUR) } })
    expect(fake.badge.text).toBe('')
    await handle({ type: 'edit', id: restored.id, changes: { due_at: timestamp(T0 - 60_000) } })
    expect(fake.badge.text).toBe('1')
  })
})
