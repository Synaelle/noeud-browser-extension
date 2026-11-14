// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../src/lib/engine'
import { timestamp } from '../src/lib/reminder'
import { readState } from '../src/lib/store'
import { sync } from '../src/lib/sync'
import { installFakeChrome } from './fakeChrome'
import { installFakeServer } from './fakeServer'
import { makeReminder, seed, setNow, T0 } from './helpers'

let fake: ReturnType<typeof installFakeChrome>
let server: ReturnType<typeof installFakeServer>

beforeEach(() => {
  fake = installFakeChrome()
  server = installFakeServer()
  setNow(T0)
})

const later = (minutes: number) => timestamp(T0 + minutes * 60_000)

function connect() {
  return handle({
    type: 'connect',
    server: { url: server.origin, token: server.token, name: 'extension' },
  })
}

async function add(title: string, dueAt = later(60)) {
  return String(
    await handle({
      type: 'add',
      reminder: { title, notes: null, due_at: dueAt, time_zone: 'Europe/Paris', repeat: null },
    }),
  )
}

describe('sync with a server', () => {
  it('sends the reminders made before connecting, under their own ids', async () => {
    const first = await add('Buy bread')
    const second = await add('Call mum')
    await connect()
    expect([...server.reminders.keys()].sort()).toEqual([first, second].sort())
    const state = await readState()
    expect(state.pending).toEqual({})
    expect(state.reminders[first]?.version).toBe(1)
    expect(state.reminders[first]?.created_by).toBe('extension')
    expect(state.sync.state).toBe('ok')
  })

  it('creates once when an answer is lost and the create is sent again', async () => {
    await connect()
    server.loseNextAnswer = true
    // the sync after the change loses its answer, the one asked meanwhile sends the create again
    const id = await add('Buy bread')
    await sync()
    expect(server.reminders.size).toBe(1)
    expect(server.requests.filter((request) => request === 'POST /v1/reminders')).toHaveLength(2)
    expect((await readState()).reminders[id]?.version).toBe(1)
  })

  it('keeps changes made offline and sends them when the server is back', async () => {
    await connect()
    server.offline = true
    const id = await add('Buy bread')
    await handle({ type: 'snooze', id, until: T0 + 90 * 60_000 })
    await sync()
    let state = await readState()
    expect(state.sync.state).toBe('offline')
    expect(Object.keys(state.pending)).toEqual([id])
    expect(state.reminders[id]?.title).toBe('Buy bread')

    server.offline = false
    await sync()
    state = await readState()
    expect(state.sync.state).toBe('ok')
    expect(state.pending).toEqual({})
    expect(server.reminders.get(id)?.snoozed_until).toBe(later(90))
  })

  it('keeps both sides of a conflict: each field from the side that changed it', async () => {
    await connect()
    const id = await add('Buy bread')
    await sync()
    server.edit(id, { title: 'Buy bread and milk' })
    server.offline = true
    await handle({ type: 'snooze', id, until: T0 + 30 * 60_000 })
    server.offline = false
    await sync()
    const local = (await readState()).reminders[id]
    expect(local?.title).toBe('Buy bread and milk')
    expect(local?.snoozed_until).toBe(later(30))
    expect(server.reminders.get(id)?.snoozed_until).toBe(later(30))
    expect(server.reminders.get(id)?.title).toBe('Buy bread and milk')
    expect(local?.version).toBe(server.reminders.get(id)?.version)
    expect((await readState()).pending).toEqual({})
  })

  it('keeps a Done made here when another app renamed the reminder meanwhile', async () => {
    await connect()
    const id = await add('Buy bread')
    await sync()
    server.edit(id, { title: 'Buy bread and milk' })
    server.offline = true
    await handle({ type: 'done', id })
    server.offline = false
    await sync()
    expect(server.reminders.get(id)?.done_at).not.toBeNull()
    expect((await readState()).reminders[id]?.done_at).not.toBeNull()
  })

  it('lets the local side win a field both sides changed', async () => {
    await connect()
    const id = await add('Buy bread')
    await sync()
    server.edit(id, { title: 'From the phone' })
    server.offline = true
    await handle({ type: 'edit', id, changes: { title: 'From here' } })
    server.offline = false
    await sync()
    expect(server.reminders.get(id)?.title).toBe('From here')
  })

  it('pulls what other apps created, changed and deleted', async () => {
    await connect()
    const made = await server.create({ title: 'From the phone', due_at: later(10) })
    await sync()
    expect((await readState()).reminders[made.id]?.title).toBe('From the phone')
    server.edit(made.id, { done_at: later(0) })
    await sync()
    expect((await readState()).reminders[made.id]?.done_at).toBe(later(0))
    server.edit(made.id, { deleted: true, title: '' })
    await sync()
    expect((await readState()).reminders[made.id]).toBeUndefined()
  })

  it('notifies about a reminder that came due on another device while the browser was closed', async () => {
    await connect()
    const made = await server.create({ title: 'From the bot', due_at: later(-20) })
    await sync()
    await handle({ type: 'sync' })
    expect(fake.created.map((entry) => entry.id)).toEqual([`r:${made.id}`])
  })

  it('pages through more changes than fit in one answer', async () => {
    await connect()
    for (let i = 0; i < 501; i++) await server.create({ title: `Reminder ${i}`, due_at: later(60) })
    await sync()
    expect(Object.keys((await readState()).reminders)).toHaveLength(501)
    expect(
      server.requests.filter((request) => request.startsWith('GET /v1/reminders?since=')),
    ).toHaveLength(3)
  })

  it('keeps a change made while its push was on the way', async () => {
    await connect()
    let open = () => {}
    server.gate = new Promise((resolve) => (open = resolve))
    const id = await add('Buy bread')
    const running = sync()
    await handle({ type: 'snooze', id, until: T0 + 45 * 60_000 })
    server.gate = null
    open()
    await running
    await sync()
    expect(server.reminders.get(id)?.snoozed_until).toBe(later(45))
    expect((await readState()).reminders[id]?.snoozed_until).toBe(later(45))
    expect((await readState()).pending).toEqual({})
  })

  it('sends done on a repeating reminder as its next due time', async () => {
    await connect()
    const start = '2026-11-12T08:00:00Z'
    const id = String(
      await handle({
        type: 'add',
        reminder: {
          title: 'Stretch',
          notes: null,
          due_at: start,
          time_zone: 'Europe/Paris',
          repeat: { every: 'day', interval: 1 },
        },
      }),
    )
    await sync()
    await handle({ type: 'done', id })
    await sync()
    expect(server.reminders.get(id)?.due_at).toBe('2026-11-13T08:00:00Z')
    expect(server.reminders.get(id)?.repeat?.start).toBe(start)
    expect(server.reminders.get(id)?.done_at).toBeNull()
  })

  it('deletes on the server and forgets the tombstone', async () => {
    await connect()
    const id = await add('Buy bread')
    await sync()
    await handle({ type: 'delete', id })
    await sync()
    expect(server.reminders.get(id)?.deleted).toBe(true)
    expect((await readState()).reminders[id]).toBeUndefined()
  })

  it('reports a refused token', async () => {
    await seed([], { server: { url: server.origin, token: 'noeud_wrong', name: 'extension' } })
    await sync()
    expect((await readState()).sync).toMatchObject({
      state: 'error',
      message: 'The server refused the token.',
    })
  })

  it('reports a removed host permission instead of failing quietly', async () => {
    await connect()
    fake.permissions.granted = false
    await sync()
    expect((await readState()).sync.state).toBe('error')
  })

  it('keeps every reminder after disconnecting, and sends them again on the next connect', async () => {
    await connect()
    const id = await add('Buy bread')
    await sync()
    await handle({ type: 'disconnect' })
    let state = await readState()
    expect(state.server).toBeNull()
    expect(state.reminders[id]?.version).toBe(0)
    await connect()
    state = await readState()
    expect(state.reminders[id]?.version).toBe(1)
    expect(server.reminders.size).toBe(1)
  })

  it('stays quiet without a server', async () => {
    await seed([makeReminder()])
    await sync()
    expect(server.requests).toEqual([])
  })

  it('keeps saying a change was refused until it changes, and sends it then', async () => {
    await connect()
    server.refuse = 'notes must be at most 10000 characters'
    const id = await add('Buy bread')
    await sync()
    await sync()
    let state = await readState()
    expect(state.sync.state).toBe('error')
    expect(state.sync.message).toContain('notes must be at most')
    expect(state.pending[id]?.refused).toBeDefined()
    server.refuse = null
    await handle({ type: 'edit', id, changes: { title: 'Buy bread today' } })
    await sync()
    state = await readState()
    expect(state.sync.state).toBe('ok')
    expect(server.reminders.get(id)?.title).toBe('Buy bread today')
  })

  it('keeps what waits when the token is changed', async () => {
    await connect()
    const id = await add('Buy bread')
    await sync()
    server.token = 'noeud_new'
    await handle({ type: 'delete', id })
    await sync()
    expect((await readState()).sync.message).toBe('The server refused the token.')
    await handle({
      type: 'token',
      server: { url: server.origin, token: 'noeud_new', name: 'extension' },
    })
    expect(server.reminders.get(id)?.deleted).toBe(true)
    expect((await readState()).reminders[id]).toBeUndefined()
    expect((await readState()).sync.state).toBe('ok')
  })
})
