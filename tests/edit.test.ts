// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import { addMenu, handle, menuClicked } from '../src/lib/engine'
import { timestamp } from '../src/lib/reminder'
import { readState } from '../src/lib/store'
import { sync } from '../src/lib/sync'
import { installFakeChrome } from './fakeChrome'
import { installFakeServer } from './fakeServer'
import { makeReminder, seed, setNow, T0 } from './helpers'

let fake: ReturnType<typeof installFakeChrome>

beforeEach(() => {
  fake = installFakeChrome()
  setNow(T0)
})

const later = (minutes: number) => timestamp(T0 + minutes * 60_000)

describe('editing', () => {
  it('moves repeat.start with due_at, as the server does', async () => {
    const start = later(-24 * 60)
    const reminder = makeReminder({ due_at: start, repeat: { every: 'day', interval: 1, start } })
    await seed([reminder])
    await handle({ type: 'edit', id: reminder.id, changes: { due_at: later(90) } })
    const edited = (await readState()).reminders[reminder.id]
    expect(edited?.due_at).toBe(later(90))
    expect(edited?.repeat).toEqual({ every: 'day', interval: 1, start: later(90) })
  })

  it('keeps repeat.start when the same change sets the repeat', async () => {
    const start = later(-24 * 60)
    const reminder = makeReminder({ due_at: start, repeat: { every: 'day', interval: 1, start } })
    await seed([reminder])
    await handle({
      type: 'edit',
      id: reminder.id,
      changes: { due_at: later(90), repeat: { every: 'day', interval: 1, start } },
    })
    expect((await readState()).reminders[reminder.id]?.repeat?.start).toBe(start)
  })

  it('clears the snooze when the time moves, and keeps it when only the title changes', async () => {
    const reminder = makeReminder({ due_at: later(-10), snoozed_until: later(10) })
    await seed([reminder])
    await handle({ type: 'edit', id: reminder.id, changes: { title: 'Call the dentist back' } })
    let edited = (await readState()).reminders[reminder.id]
    expect(edited?.snoozed_until).toBe(later(10))
    await handle({ type: 'edit', id: reminder.id, changes: { due_at: later(60) } })
    edited = (await readState()).reminders[reminder.id]
    expect(edited?.title).toBe('Call the dentist back')
    expect(edited?.snoozed_until).toBeNull()
    expect(fake.alarms.get(`r:${reminder.id}`)?.scheduledTime).toBe(T0 + 60 * 60_000)
  })

  it('starts a new repeat at the due time', async () => {
    const reminder = makeReminder({ due_at: later(30) })
    await seed([reminder])
    await handle({
      type: 'edit',
      id: reminder.id,
      changes: { repeat: { every: 'week', interval: 2 } },
    })
    expect((await readState()).reminders[reminder.id]?.repeat).toEqual({
      every: 'week',
      interval: 2,
      start: later(30),
    })
  })

  it('refuses an empty title', async () => {
    const reminder = makeReminder()
    await seed([reminder])
    await expect(
      handle({ type: 'edit', id: reminder.id, changes: { title: ' ' } }),
    ).rejects.toThrow('Enter what to remember')
  })
})

describe('undo', () => {
  it('undoes done on a repeating reminder by putting its time back', async () => {
    const start = later(-60)
    const reminder = makeReminder({ due_at: start, repeat: { every: 'day', interval: 1, start } })
    await seed([reminder])
    await handle({ type: 'done', id: reminder.id })
    const { due_at, repeat, snoozed_until, done_at } = reminder
    await handle({
      type: 'edit',
      id: reminder.id,
      changes: { due_at, repeat, snoozed_until, done_at },
    })
    expect((await readState()).reminders[reminder.id]).toMatchObject({ due_at: start, repeat })
  })

  it('brings back a deleted reminder under its id without a server', async () => {
    const reminder = makeReminder({ due_at: later(30) })
    await seed([reminder])
    await handle({ type: 'delete', id: reminder.id })
    const id = await handle({ type: 'restore', reminder })
    expect(id).toBe(reminder.id)
    expect((await readState()).reminders[reminder.id]?.deleted).toBe(false)
  })

  it('brings back a reminder whose deletion reached the server as a new one', async () => {
    const server = installFakeServer()
    await handle({
      type: 'connect',
      server: { url: server.origin, token: server.token, name: 'extension' },
    })
    const id = String(
      await handle({
        type: 'add',
        reminder: {
          title: 'Buy bread',
          notes: null,
          due_at: later(30),
          time_zone: 'UTC',
          repeat: null,
        },
      }),
    )
    await sync()
    const snapshot = (await readState()).reminders[id]
    if (!snapshot) throw new Error('missing')
    await handle({ type: 'delete', id })
    await sync()
    expect(server.reminders.get(id)?.deleted).toBe(true)
    const back = String(await handle({ type: 'restore', reminder: snapshot }))
    await sync()
    expect(back).not.toBe(id)
    expect(server.reminders.get(back)?.title).toBe('Buy bread')
    expect(Object.keys((await readState()).reminders)).toEqual([back])
  })
})

describe('remind me about this', () => {
  it('adds the menu item once, on install', async () => {
    await addMenu()
    await addMenu()
    expect(fake.menus).toEqual([
      { id: 'remind', title: 'Remind me about this', contexts: ['page', 'link', 'selection'] },
    ])
  })

  it('opens the popup with the selection as the text and the page as the notes', async () => {
    await menuClicked(
      {
        menuItemId: 'remind',
        selectionText: '  Renew the passport ',
        pageUrl: 'https://example.org/passport',
      },
      { title: 'Passports', url: 'https://example.org/passport' },
    )
    expect(fake.session.get('draft')).toEqual({
      title: 'Renew the passport',
      notes: 'https://example.org/passport',
    })
    expect(fake.popups.opened).toBe(1)
  })

  it('falls back to the page title and the link, and to a window when the popup cannot open', async () => {
    fake.popups.refuse = true
    await menuClicked(
      {
        menuItemId: 'remind',
        linkUrl: 'https://example.org/form',
        pageUrl: 'https://example.org/',
      },
      { title: 'Example', url: 'https://example.org/' },
    )
    expect(fake.session.get('draft')).toEqual({
      title: 'Example',
      notes: 'https://example.org/form',
    })
    expect(fake.windows).toEqual(['chrome-extension://noeud/popup.html'])
  })
})
