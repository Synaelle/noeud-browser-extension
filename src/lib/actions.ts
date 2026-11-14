// SPDX-License-Identifier: GPL-3.0-or-later

import { fieldsProblem, notifyAt, timestamp, type Reminder, type RepeatUnit } from './reminder'
import { nextOccurrence } from './repeat'
import type { State } from './store'
import { uuidv7 } from './uuid'
import { ENTER_A_TIME } from './when'

/** What an edit may change, as in a PATCH. A repeat without a start starts at the due time. */
export type Changes = Partial<
  Pick<Reminder, 'title' | 'notes' | 'due_at' | 'time_zone' | 'snoozed_until' | 'done_at'>
> & { repeat?: { every: RepeatUnit; interval: number; start?: string } | null }

export interface NewReminder {
  title: string
  notes: string | null
  due_at: string
  time_zone: string
  repeat: { every: RepeatUnit; interval: number } | null
}

/** Why the server would refuse this reminder, or null when it is fine. */
export function invalidReason(input: NewReminder): string | null {
  const problem = fieldsProblem(input)
  if (problem) return problem
  if (Number.isNaN(Date.parse(input.due_at))) return ENTER_A_TIME
  return null
}

/** Records a local change in the outbox, when there is a server to send it to. */
function changed(state: State, reminder: Reminder, now: number): void {
  reminder.updated_at = timestamp(now)
  if (!state.server) return
  const pending = state.pending[reminder.id]
  state.pending[reminder.id] = {
    base: pending?.base ?? reminder.version,
    rev: (pending?.rev ?? 0) + 1,
    ...(pending?.before ? { before: pending.before } : {}),
  }
}

/** The reminder to change. Before its first unsent change, keeps it as the server has it. */
function live(state: State, id: string): Reminder {
  const reminder = state.reminders[id]
  if (!reminder || reminder.deleted) throw new Error('This reminder is gone')
  if (state.server && !state.pending[id] && reminder.version > 0) {
    state.pending[id] = { base: reminder.version, rev: 0, before: structuredClone(reminder) }
  }
  return reminder
}

export function addReminder(state: State, input: NewReminder, now: number): Reminder {
  const reason = invalidReason(input)
  if (reason) throw new Error(reason)
  const due = timestamp(Date.parse(input.due_at))
  const reminder: Reminder = {
    id: uuidv7(now),
    title: input.title.trim(),
    notes: input.notes?.trim() || null,
    due_at: due,
    time_zone: input.time_zone,
    repeat: input.repeat && { ...input.repeat, start: due },
    snoozed_until: null,
    done_at: null,
    deleted: false,
    version: 0,
    created_at: timestamp(now),
    updated_at: timestamp(now),
    created_by: null,
  }
  state.reminders[reminder.id] = reminder
  changed(state, reminder, now)
  return reminder
}

/** Done, or for a repeating reminder the next occurrence after now, as the server does it. */
export function markDone(state: State, id: string, now: number): void {
  const reminder = live(state, id)
  if (reminder.repeat) {
    const after = Temporal.Instant.fromEpochMilliseconds(Math.max(now, Date.parse(reminder.due_at)))
    reminder.due_at = timestamp(
      nextOccurrence(reminder.repeat, reminder.time_zone, after).epochMilliseconds,
    )
  } else {
    reminder.done_at = timestamp(now)
  }
  reminder.snoozed_until = null
  changed(state, reminder, now)
}

export function reopen(state: State, id: string, now: number): void {
  const reminder = live(state, id)
  reminder.done_at = null
  reminder.snoozed_until = null
  changed(state, reminder, now)
}

export function snooze(state: State, id: string, until: number, now: number): void {
  const reminder = live(state, id)
  reminder.snoozed_until = timestamp(until)
  changed(state, reminder, now)
}

/** Deletes a reminder, keeping a tombstone until the server has heard of it. */
export function remove(state: State, id: string, now: number): void {
  const reminder = live(state, id)
  delete state.fired[id]
  if (!state.server) {
    delete state.reminders[id]
    delete state.pending[id]
    return
  }
  reminder.deleted = true
  changed(state, reminder, now)
}

/**
 * Changes a reminder the way a PATCH does on the server (docs/api.md): moving due_at clears the
 * snooze and moves repeat.start along, unless the same change sets them.
 */
export function editReminder(state: State, id: string, changes: Changes, now: number): void {
  const problem = fieldsProblem(changes)
  if (problem) throw new Error(problem)
  const reminder = live(state, id)
  if (changes.title !== undefined) reminder.title = changes.title.trim()
  if (changes.notes !== undefined) reminder.notes = changes.notes?.trim() || null
  if (changes.time_zone !== undefined) reminder.time_zone = changes.time_zone
  const time = (value: string | null) => (value === null ? null : timestamp(Date.parse(value)))
  if (changes.due_at !== undefined) {
    reminder.due_at = timestamp(Date.parse(changes.due_at))
    if (!('snoozed_until' in changes)) reminder.snoozed_until = null
    if (!('repeat' in changes) && reminder.repeat) {
      reminder.repeat = { ...reminder.repeat, start: reminder.due_at }
    }
  }
  if (changes.snoozed_until !== undefined) reminder.snoozed_until = time(changes.snoozed_until)
  if (changes.done_at !== undefined) reminder.done_at = time(changes.done_at)
  if (changes.repeat !== undefined) {
    reminder.repeat = changes.repeat && {
      every: changes.repeat.every,
      interval: changes.repeat.interval,
      start: time(changes.repeat.start ?? null) ?? reminder.due_at,
    }
  }
  changed(state, reminder, now)
}

/** A reminder brought back after it came due was notified already: it is not notified again. */
function noteNotified(state: State, reminder: Reminder, now: number): void {
  const at = notifyAt(reminder)
  if (at !== null && at <= now) state.fired[reminder.id] = at
}

/**
 * Brings back a reminder deleted a moment ago. Once the server has its deletion, the same id
 * stays deleted there, so it comes back as a new reminder.
 */
export function restoreReminder(state: State, snapshot: Reminder, now: number): string {
  const existing = state.reminders[snapshot.id]
  if (existing && !existing.deleted) return existing.id
  if (existing) {
    existing.deleted = false
    changed(state, existing, now)
    noteNotified(state, existing, now)
    return existing.id
  }
  const restored: Reminder = {
    ...snapshot,
    id: state.server ? uuidv7(now) : snapshot.id,
    deleted: false,
    version: 0,
    created_at: timestamp(now),
    created_by: null,
  }
  state.reminders[restored.id] = restored
  changed(state, restored, now)
  noteNotified(state, restored, now)
  return restored.id
}
