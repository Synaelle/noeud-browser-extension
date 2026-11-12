// SPDX-License-Identifier: GPL-3.0-or-later

import type { Reminder } from '../src/lib/reminder'

const editable = [
  'title',
  'notes',
  'due_at',
  'time_zone',
  'repeat',
  'snoozed_until',
  'done_at',
] as const

/** A Noeud server in memory that answers as docs/api.md says, installed as the global fetch. */
export function installFakeServer(origin = 'https://noeud.test', token = 'noeud_test') {
  const reminders = new Map<string, Reminder>()
  const changedAt = new Map<string, number>()
  let counter = 0
  const server = {
    origin,
    token,
    reminders,
    offline: false,
    /** The next request reaches the server but its answer is lost on the way back. */
    loseNextAnswer: false,
    /** Requests wait for this before they reach the server. */
    gate: null as Promise<void> | null,
    requests: [] as string[],
    /** A reminder made by another app. */
    async create(fields: { title: string; due_at: string }): Promise<Reminder> {
      const answer = await handle('POST', new URL('/v1/reminders', origin), fields)
      return (await answer.json()) as Reminder
    },
    /** A change made by another app. */
    edit(id: string, fields: Partial<Reminder>) {
      const reminder = reminders.get(id)
      if (!reminder) throw new Error(`no ${id}`)
      Object.assign(reminder, fields, { version: reminder.version + 1 })
      changedAt.set(id, ++counter)
    },
  }

  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
  const problem = (status: number, error: string, message: string, extra = {}) =>
    json(status, { error, message, ...extra })
  const now = () =>
    new Date(Math.floor(Date.now() / 1000) * 1000).toISOString().replace('.000Z', 'Z')
  const iso = (value: string) => new Date(value).toISOString().replace('.000Z', 'Z')

  function save(reminder: Reminder) {
    reminders.set(reminder.id, reminder)
    changedAt.set(reminder.id, ++counter)
  }

  async function handle(method: string, url: URL, body: Record<string, unknown> | null) {
    const path = url.pathname
    if (path === '/v1/token' && method === 'GET') return json(200, { name: 'extension' })
    if (path === '/v1/reminders' && method === 'GET') {
      const since = Number(url.searchParams.get('since') ?? 0)
      const limit = Number(url.searchParams.get('limit') ?? 500)
      const changed = [...changedAt.entries()]
        .filter(([, at]) => at > since)
        .sort((a, b) => a[1] - b[1])
      const page = changed.slice(0, limit)
      return json(200, {
        reminders: page.map(([id]) => reminders.get(id)),
        cursor: page.at(-1)?.[1] ?? since,
        has_more: changed.length > limit,
      })
    }
    if (path === '/v1/reminders' && method === 'POST') {
      if (
        !body ||
        typeof body.title !== 'string' ||
        body.title.length === 0 ||
        body.title.length > 500
      ) {
        return problem(400, 'invalid_request', 'title must be 1 to 500 characters')
      }
      const id = typeof body.id === 'string' ? body.id : crypto.randomUUID()
      const existing = reminders.get(id)
      if (existing) return json(200, existing)
      const dueAt = iso(String(body.due_at))
      const repeat = body.repeat as Reminder['repeat']
      const reminder: Reminder = {
        id,
        title: body.title,
        notes: (body.notes as string | null) ?? null,
        due_at: dueAt,
        time_zone: (body.time_zone as string | undefined) ?? 'UTC',
        repeat: repeat && { ...repeat, start: iso(repeat.start ?? dueAt) },
        snoozed_until: null,
        done_at: null,
        deleted: false,
        version: 1,
        created_at: now(),
        updated_at: now(),
        created_by: 'extension',
      }
      save(reminder)
      return json(201, reminder)
    }
    const match = /^\/v1\/reminders\/([^/]+)$/.exec(path)
    const reminder = match ? reminders.get(match[1] ?? '') : undefined
    if (!reminder) return problem(404, 'not_found', 'no such reminder')
    if (method === 'PATCH') {
      if (reminder.deleted) return problem(404, 'not_found', 'no such reminder')
      if (body?.version !== reminder.version) {
        return problem(409, 'conflict', 'the reminder was changed in the meantime', { reminder })
      }
      for (const field of editable) {
        if (body && field in body) Object.assign(reminder, { [field]: body[field] })
      }
      if (body && 'due_at' in body && !('snoozed_until' in body)) reminder.snoozed_until = null
      reminder.version += 1
      reminder.updated_at = now()
      save(reminder)
      return json(200, reminder)
    }
    if (method === 'DELETE') {
      const version = url.searchParams.get('version')
      if (version !== null && Number(version) !== reminder.version) {
        return problem(409, 'conflict', 'the reminder was changed in the meantime', { reminder })
      }
      Object.assign(reminder, {
        deleted: true,
        title: '',
        notes: null,
        version: reminder.version + 1,
      })
      save(reminder)
      return new Response(null, { status: 204 })
    }
    return problem(400, 'invalid_request', 'unknown route')
  }

  globalThis.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input))
    const method = init?.method ?? 'GET'
    server.requests.push(`${method} ${url.pathname}${url.search}`)
    if (server.offline || url.origin !== origin) throw new TypeError('fetch failed')
    const auth = new Headers(init?.headers).get('Authorization')
    if (auth !== `Bearer ${token}`) return problem(401, 'unauthorized', 'bad token')
    const body =
      typeof init?.body === 'string' ? (JSON.parse(init.body) as Record<string, unknown>) : null
    if (server.gate) await server.gate
    const answer = await handle(method, url, body)
    if (server.loseNextAnswer) {
      server.loseNextAnswer = false
      throw new TypeError('connection reset')
    }
    return answer
  }
  return server
}
