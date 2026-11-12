// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import type { RepeatUnit } from '../src/lib/reminder'
import { nextOccurrence } from '../src/lib/repeat'

// the same cases as the Noeud server's own repeat tests, so both agree
const cases: {
  name: string
  start: string
  time_zone: string
  every: RepeatUnit
  interval: number
  after: string
  next: string
}[] = [
  {
    name: 'daily, strictly after an occurrence',
    start: '2026-01-01T09:00:00Z',
    time_zone: 'UTC',
    every: 'day',
    interval: 1,
    after: '2026-01-05T09:00:00Z',
    next: '2026-01-06T09:00:00Z',
  },
  {
    name: 'daily, between two occurrences',
    start: '2026-01-01T09:00:00Z',
    time_zone: 'UTC',
    every: 'day',
    interval: 1,
    after: '2026-01-05T10:00:00Z',
    next: '2026-01-06T09:00:00Z',
  },
  {
    name: 'before the start gives the start',
    start: '2026-01-01T09:00:00Z',
    time_zone: 'UTC',
    every: 'day',
    interval: 1,
    after: '2025-12-01T00:00:00Z',
    next: '2026-01-01T09:00:00Z',
  },
  {
    name: 'ten years later',
    start: '2026-01-01T09:00:00Z',
    time_zone: 'UTC',
    every: 'day',
    interval: 1,
    after: '2036-01-01T09:00:00Z',
    next: '2036-01-02T09:00:00Z',
  },
  {
    name: 'every three days in Tokyo',
    start: '2026-11-01T00:00:00Z',
    time_zone: 'Asia/Tokyo',
    every: 'day',
    interval: 3,
    after: '2026-11-05T00:00:00Z',
    next: '2026-11-07T00:00:00Z',
  },
  {
    name: 'daily across the spring change in Paris',
    start: '2026-03-27T08:00:00Z',
    time_zone: 'Europe/Paris',
    every: 'day',
    interval: 1,
    after: '2026-03-28T08:00:00Z',
    next: '2026-03-29T07:00:00Z',
  },
  {
    name: 'daily across the autumn change in Paris',
    start: '2026-10-23T07:00:00Z',
    time_zone: 'Europe/Paris',
    every: 'day',
    interval: 1,
    after: '2026-10-24T07:00:00Z',
    next: '2026-10-25T08:00:00Z',
  },
  {
    name: 'weekly across the spring change in Paris',
    start: '2026-03-23T08:00:00Z',
    time_zone: 'Europe/Paris',
    every: 'week',
    interval: 1,
    after: '2026-03-23T08:00:00Z',
    next: '2026-03-30T07:00:00Z',
  },
  {
    name: 'a time inside the spring gap moves forward',
    start: '2026-03-07T07:30:00Z',
    time_zone: 'America/New_York',
    every: 'day',
    interval: 1,
    after: '2026-03-07T08:00:00Z',
    next: '2026-03-08T07:30:00Z',
  },
  {
    name: 'the day after the spring gap is back to the same time',
    start: '2026-03-07T07:30:00Z',
    time_zone: 'America/New_York',
    every: 'day',
    interval: 1,
    after: '2026-03-08T07:30:00Z',
    next: '2026-03-09T06:30:00Z',
  },
  {
    name: 'a repeated hour in autumn takes the first one',
    start: '2026-10-31T05:30:00Z',
    time_zone: 'America/New_York',
    every: 'day',
    interval: 1,
    after: '2026-10-31T06:00:00Z',
    next: '2026-11-01T05:30:00Z',
  },
  {
    name: 'every two weeks',
    start: '2026-11-02T18:30:00Z',
    time_zone: 'UTC',
    every: 'week',
    interval: 2,
    after: '2026-11-10T00:00:00Z',
    next: '2026-11-16T18:30:00Z',
  },
  {
    name: 'monthly on the 31st, February',
    start: '2026-01-31T12:00:00Z',
    time_zone: 'UTC',
    every: 'month',
    interval: 1,
    after: '2026-02-01T00:00:00Z',
    next: '2026-02-28T12:00:00Z',
  },
  {
    name: 'monthly on the 31st, back to the 31st',
    start: '2026-01-31T12:00:00Z',
    time_zone: 'UTC',
    every: 'month',
    interval: 1,
    after: '2026-02-28T12:00:00Z',
    next: '2026-03-31T12:00:00Z',
  },
  {
    name: 'monthly on the 31st, April',
    start: '2026-01-31T12:00:00Z',
    time_zone: 'UTC',
    every: 'month',
    interval: 1,
    after: '2026-03-31T12:00:00Z',
    next: '2026-04-30T12:00:00Z',
  },
  {
    name: 'every three months',
    start: '2026-01-15T08:00:00Z',
    time_zone: 'UTC',
    every: 'month',
    interval: 3,
    after: '2026-05-01T00:00:00Z',
    next: '2026-07-15T08:00:00Z',
  },
  {
    name: 'yearly on the 29th of February, common year',
    start: '2024-02-29T10:00:00Z',
    time_zone: 'UTC',
    every: 'year',
    interval: 1,
    after: '2024-03-01T00:00:00Z',
    next: '2025-02-28T10:00:00Z',
  },
  {
    name: 'yearly on the 29th of February, leap year',
    start: '2024-02-29T10:00:00Z',
    time_zone: 'UTC',
    every: 'year',
    interval: 1,
    after: '2027-03-01T00:00:00Z',
    next: '2028-02-29T10:00:00Z',
  },
]

describe('repeats', () => {
  for (const c of cases) {
    it(c.name, () => {
      const next = nextOccurrence(
        { every: c.every, interval: c.interval, start: c.start },
        c.time_zone,
        Temporal.Instant.from(c.after),
      )
      expect(next.toString()).toBe(c.next)
    })
  }

  it('finds the occurrence after a thousand of them without drifting', () => {
    const repeat = { every: 'month' as const, interval: 1, start: '2026-01-31T12:00:00Z' }
    const next = nextOccurrence(repeat, 'UTC', Temporal.Instant.from('2109-02-01T00:00:00Z'))
    expect(next.toString()).toBe('2109-02-28T12:00:00Z')
  })
})
