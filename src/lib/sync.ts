// SPDX-License-Identifier: GPL-3.0-or-later

import { sameContent, timestamp, type Reminder } from './reminder'
import {
  readState,
  withState,
  type Pending,
  type Server,
  type State,
  type SyncStatus,
} from './store'
import { uuidv7 } from './uuid'

const TIMEOUT_MS = 10_000
const PAGE = 500

/** The server could not be reached. Normal for a laptop on a train, not an error. */
export class Offline extends Error {}

export class ServerError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message)
  }
}

interface Answer {
  status: number
  data: unknown
}

/** The host permission pattern for a server, asked for when it is added. */
export function originPattern(url: string): string {
  return new URL(url).origin + '/*'
}

function parse(text: string): unknown {
  try {
    return JSON.parse(text)
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}

export async function request(
  server: Pick<Server, 'url' | 'token'>,
  method: string,
  path: string,
  body?: unknown,
): Promise<Answer> {
  let response: Response
  try {
    response = await fetch(server.url + path, {
      method,
      headers: {
        Authorization: `Bearer ${server.token}`,
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
  } catch (error) {
    // fetch rejects with a TypeError when the network fails, the timeout with a DOMException
    if (
      error instanceof TypeError ||
      (error instanceof DOMException && error.name === 'TimeoutError')
    ) {
      throw new Offline()
    }
    throw error
  }
  // a proxy in front of a server that is down
  if (response.status === 502 || response.status === 503 || response.status === 504) {
    throw new Offline()
  }
  return {
    status: response.status,
    data: response.status === 204 ? null : parse(await response.text()),
  }
}

function messageOf(answer: Answer): string {
  const data = answer.data as { message?: unknown } | null
  return typeof data?.message === 'string' ? data.message : `The server answered ${answer.status}.`
}

type Outcome =
  | { kind: 'server'; reminder: Reminder; conflict: boolean }
  | { kind: 'gone' }
  | { kind: 'rejected'; message: string }

function outcome(answer: Answer): Outcome {
  if (answer.status === 200 || answer.status === 201) {
    return { kind: 'server', reminder: answer.data as Reminder, conflict: false }
  }
  if (answer.status === 409) {
    return {
      kind: 'server',
      reminder: (answer.data as { reminder: Reminder }).reminder,
      conflict: true,
    }
  }
  if (answer.status === 400 || answer.status === 413) {
    return { kind: 'rejected', message: messageOf(answer) }
  }
  throw new ServerError(answer.status, messageOf(answer))
}

function changes(reminder: Reminder) {
  return {
    title: reminder.title,
    notes: reminder.notes,
    due_at: reminder.due_at,
    time_zone: reminder.time_zone,
    repeat: reminder.repeat,
    snoozed_until: reminder.snoozed_until,
    done_at: reminder.done_at,
  }
}

/** Sends one local change. The base version lets the server refuse it when it changed since. */
async function pushOne(server: Server, local: Reminder, base: number): Promise<Outcome> {
  const path = `/v1/reminders/${local.id}`
  if (local.deleted) {
    if (base === 0) return { kind: 'gone' }
    const answer = await request(server, 'DELETE', `${path}?version=${base}`)
    return answer.status === 204 || answer.status === 404 ? { kind: 'gone' } : outcome(answer)
  }
  if (base > 0) {
    const answer = await request(server, 'PATCH', path, { version: base, ...changes(local) })
    // unknown there, as after moving to another server: create it
    if (answer.status !== 404) return outcome(answer)
  }
  const { title, notes, due_at, time_zone, repeat } = local
  const created = outcome(
    await request(server, 'POST', '/v1/reminders', {
      id: local.id,
      title,
      notes,
      due_at,
      time_zone,
      repeat,
    }),
  )
  // a create carries no snooze or done, and a retried one answers with what the server kept
  if (
    created.kind !== 'server' ||
    created.reminder.deleted ||
    sameContent(created.reminder, local)
  ) {
    return created
  }
  return outcome(
    await request(server, 'PATCH', path, { version: created.reminder.version, ...changes(local) }),
  )
}

function forget(state: State, id: string): void {
  delete state.reminders[id]
  delete state.pending[id]
  delete state.fired[id]
}

/** Takes the server's copy, unless a local change waits to be pushed. */
function applyServer(state: State, reminder: Reminder): void {
  if (reminder.deleted) forget(state, reminder.id)
  else state.reminders[reminder.id] = reminder
}

const fields = [
  'title',
  'notes',
  'due_at',
  'time_zone',
  'repeat',
  'snoozed_until',
  'done_at',
  'deleted',
] as const

/**
 * Both sides changed the reminder: each field takes the side that changed it, and the local side
 * when both did. `before` is the reminder as the server had it when the local change began.
 */
export function merge(before: Reminder, local: Reminder, server: Reminder): Reminder {
  const merged: Record<string, unknown> = { ...server }
  for (const field of fields) {
    if (JSON.stringify(local[field]) !== JSON.stringify(before[field])) {
      merged[field] = local[field]
    }
  }
  return merged as unknown as Reminder
}

/** What the push did to the outbox: true when a merged change waits to be sent again. */
function applyPushed(state: State, id: string, sent: Pending, result: Outcome): boolean {
  const pending = state.pending[id]
  const newer = pending !== undefined && pending.rev !== sent.rev
  if (result.kind === 'gone') {
    const local = state.reminders[id]
    forget(state, id)
    if (newer && local && !local.deleted) {
      // restored while its deletion was on the way: the server keeps the id deleted
      const restored = { ...local, id: uuidv7(), version: 0 }
      state.reminders[restored.id] = restored
      state.pending[restored.id] = { base: 0, rev: 1 }
    }
  } else if (result.kind === 'rejected') {
    // kept, and said, until the reminder changes again
    if (pending && !newer) pending.refused = result.message
  } else if (result.conflict) {
    const local = state.reminders[id]
    const before = pending?.before
    if (!local || !before || result.reminder.deleted) {
      delete state.pending[id]
      applyServer(state, result.reminder)
      return false
    }
    // changed here and elsewhere: keep both, then send the result on the new version
    const merged = merge(before, local, result.reminder)
    if (fields.every((f) => JSON.stringify(merged[f]) === JSON.stringify(result.reminder[f]))) {
      delete state.pending[id]
      applyServer(state, result.reminder)
      return false
    }
    state.reminders[id] = { ...merged, version: result.reminder.version }
    state.pending[id] = {
      base: result.reminder.version,
      rev: (pending?.rev ?? 0) + 1,
      before: structuredClone(result.reminder),
    }
    return true
  } else if (newer && !result.reminder.deleted) {
    // the user changed it again while this push ran: keep that, on top of the new version
    const local = state.reminders[id]
    if (local && pending) {
      local.version = result.reminder.version
      pending.base = result.reminder.version
      pending.before = structuredClone(result.reminder)
    }
  } else {
    delete state.pending[id]
    applyServer(state, result.reminder)
  }
  return false
}

/** Sends the outbox. True when a change was merged after a conflict and waits to go again. */
async function push(server: Server): Promise<boolean> {
  let again = false
  for (const id of Object.keys((await readState()).pending)) {
    const { local, pending } = await withState((state) => ({
      local: state.reminders[id],
      pending: state.pending[id],
    }))
    if (!pending || pending.refused !== undefined) continue
    if (!local) {
      await withState((state) => void delete state.pending[id])
      continue
    }
    const result = await pushOne(server, local, pending.base)
    if (await withState((state) => applyPushed(state, id, pending, result))) again = true
  }
  return again
}

/** The first change the server refused and that still waits, if any. */
function refusal(state: State): string | null {
  for (const pending of Object.values(state.pending)) {
    if (pending.refused !== undefined) return pending.refused
  }
  return null
}

async function pull(server: Server): Promise<void> {
  let more = true
  while (more) {
    const { cursor } = await readState()
    const answer = await request(server, 'GET', `/v1/reminders?since=${cursor}&limit=${PAGE}`)
    if (answer.status !== 200) throw new ServerError(answer.status, messageOf(answer))
    const page = answer.data as { reminders: Reminder[]; cursor: number; has_more: boolean }
    await withState((state) => {
      for (const reminder of page.reminders) {
        if (!state.pending[reminder.id]) applyServer(state, reminder)
      }
      state.cursor = page.cursor
    })
    more = page.has_more
  }
}

function setStatus(state: SyncStatus['state'], message: string | null = null): Promise<void> {
  return withState((current) => {
    const at = timestamp(Date.now())
    current.sync = { state, at, ok_at: state === 'ok' ? at : current.sync.ok_at, message }
  })
}

async function syncOnce(): Promise<void> {
  const { server } = await readState()
  if (!server) return
  if (!(await chrome.permissions.contains({ origins: [originPattern(server.url)] }))) {
    await setStatus('error', 'Noeud may no longer reach the server. Connect it again.')
    return
  }
  try {
    if (await push(server)) again = true
    await pull(server)
    const refused = refusal(await readState())
    await setStatus(refused ? 'error' : 'ok', refused && `The server refused a change: ${refused}`)
  } catch (error) {
    if (error instanceof Offline) await setStatus('offline')
    else if (error instanceof ServerError && error.status === 401) {
      await setStatus('error', 'The server refused the token.')
    } else if (error instanceof ServerError) await setStatus('error', error.message)
    else {
      await setStatus('error', String(error))
      throw error
    }
  }
}

let running: Promise<void> | null = null
let again = false

/** Pushes the outbox, then pulls what changed on the server. Calls during a run add one more run. */
export function sync(): Promise<void> {
  if (running) {
    again = true
    return running
  }
  running = (async () => {
    try {
      // a few passes at most, should a server keep answering with conflicts
      for (let pass = 0; pass === 0 || (again && pass < 5); pass++) {
        again = false
        await syncOnce()
      }
    } finally {
      running = null
    }
  })()
  return running
}

/** Starts syncing with a server, sending every local reminder it does not have. */
export function connect(state: State, server: Server): void {
  state.server = server
  state.cursor = 0
  state.sync = { state: 'off', at: null, ok_at: null, message: null }
  for (const reminder of Object.values(state.reminders)) {
    if (reminder.version === 0 && !state.pending[reminder.id]) {
      state.pending[reminder.id] = { base: 0, rev: 1 }
    }
  }
}

/** A new token for the same server, as after `token regenerate`: what waits is kept. */
export function replaceToken(state: State, server: Server): void {
  state.server = server
  state.sync = { state: 'off', at: null, ok_at: null, message: null }
}

/** Stops syncing. The reminders stay, as if they had never been on a server. */
export function disconnect(state: State): void {
  state.server = null
  state.cursor = 0
  state.pending = {}
  state.sync = { state: 'off', at: null, ok_at: null, message: null }
  for (const reminder of Object.values(state.reminders)) {
    if (reminder.deleted) forget(state, reminder.id)
    else reminder.version = 0
  }
}
