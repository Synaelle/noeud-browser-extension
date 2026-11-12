// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import { handle } from '../src/lib/engine'
import { formatHour } from '../src/lib/format'
import { timestamp } from '../src/lib/reminder'
import { readState, type State } from '../src/lib/store'
import {
  addDefaults,
  KEEP_TIMES,
  noteTimeUse,
  rankTimes,
  snoozeDefaults,
  startingTime,
  timeLabel,
  type TimeUse,
} from '../src/lib/usage'
import { normalizeWhen } from '../src/lib/when'
import { installFakeChrome } from './fakeChrome'
import { makeReminder, seed, setNow, T0 } from './helpers'

// T0 is 14:00 UTC, 15:00 in Paris
const zone = 'Europe/Paris'

beforeEach(() => {
  installFakeChrome()
  setNow(T0)
})

describe('normalizing', () => {
  it.each([
    ['2h', '2h'],
    ['in 2h', '2h'],
    ['120m', '2h'],
    ['1h60m', '2h'],
    [' 90 m ', '1h30m'],
    ['8h52', '8h52m'],
    ['24h', '1d'],
    ['7d', '1w'],
    ['7D2H30S', '1w2h30s'],
    ['3s7w1h', '7w1h3s'],
    ['18:00', '18:00'],
    ['at 6pm', '18:00'],
    ['today 6:00 pm', '18:00'],
    ['tomorrow', 'tomorrow 9:00'],
    ['Tomorrow at 7:30am', 'tomorrow 7:30'],
    ['next monday 9:00', 'monday 9:00'],
    ['friday 10am', 'friday 10:00'],
  ])('%j is %j', (text, normalized) => expect(normalizeWhen(text)).toBe(normalized))

  it.each([
    '2026-11-13 14:30',
    '2026-11-13T14:30',
    'today',
    '0m',
    '600w',
    '1h1h',
    '5s3',
    'soon',
    '9',
    '',
  ])('does not count %j', (text) => expect(normalizeWhen(text)).toBeNull())
})

describe('labels', () => {
  it.each([
    ['10m', '10 min'],
    ['30m', '30 min'],
    ['1h', '1 hour'],
    ['2h', '2 hours'],
    ['1d', '24 hours'],
    ['3d', '3 days'],
    ['1w', '1 week'],
    ['2w', '2 weeks'],
    ['1h30m', '1 h 30 min'],
    ['8h52m', '8 h 52 min'],
    ['7w1h3s', '7 wk 1 h 3 s'],
    ['30s', '30 s'],
  ])('%j reads %j', (when, label) => expect(timeLabel(when)).toBe(label))

  it('says the time the way the browser writes it', () => {
    expect(timeLabel('18:00')).toBe(`Today ${formatHour(18)}`)
    expect(timeLabel('21:00')).toBe(`Tonight ${formatHour(21)}`)
    expect(timeLabel('tomorrow 9:00')).toBe(`Tomorrow ${formatHour(9)}`)
    expect(timeLabel('friday 9:30')).toBe(`Friday ${formatHour(9, 30)}`)
  })
})

function state(times: TimeUse[] = []): State {
  return { times } as State
}

describe('counting', () => {
  it('counts the same choice however it was written', () => {
    const s = state()
    noteTimeUse(s, '2h', T0)
    noteTimeUse(s, '120m', T0 + 1000)
    noteTimeUse(s, 'tomorrow', T0 + 2000)
    noteTimeUse(s, '2026-11-13 14:30', T0 + 3000)
    noteTimeUse(s, undefined, T0 + 4000)
    expect(s.times).toEqual([
      { when: '2h', count: 2, last: T0 + 1000 },
      { when: 'tomorrow 9:00', count: 1, last: T0 + 2000 },
    ])
  })

  it(`keeps the ${KEEP_TIMES} most used`, () => {
    const s = state()
    noteTimeUse(s, '1m', T0)
    noteTimeUse(s, '1m', T0 + 100)
    for (let i = 2; i <= KEEP_TIMES + 10; i++) noteTimeUse(s, `${i}m`, T0 + 100 + i)
    expect(s.times).toHaveLength(KEEP_TIMES)
    expect(s.times.find((entry) => entry.when === '1m')).toEqual({
      when: '1m',
      count: 2,
      last: T0 + 100,
    })
    // the oldest of the single uses went first
    expect(s.times.some((entry) => entry.when === '2m')).toBe(false)
    expect(s.times.some((entry) => entry.when === '1h')).toBe(true)
  })
})

describe('ranking', () => {
  it('gives the defaults in their order without history', () => {
    expect(rankTimes([], addDefaults, T0, zone)).toEqual(addDefaults)
    expect(rankTimes([], snoozeDefaults, T0, zone)).toEqual(snoozeDefaults)
  })

  it('puts the most used first, ties to the most recent, then fills with defaults', () => {
    const times = [
      { when: '2h', count: 3, last: T0 - 5000 },
      { when: 'friday 9:00', count: 5, last: T0 - 9000 },
      { when: '30m', count: 3, last: T0 - 1000 },
      { when: '10m', count: 1, last: T0 - 1000 },
    ]
    expect(rankTimes(times, addDefaults, T0, zone)).toEqual([
      'friday 9:00',
      '30m',
      '2h',
      '10m',
      '1h',
    ])
  })

  it('hides a time of day that has gone by today', () => {
    // 15:00 in Paris: 9:00 and 14:30 have passed, 18:00 has not
    const times = [
      { when: '9:00', count: 9, last: T0 },
      { when: '14:30', count: 8, last: T0 },
      { when: 'tomorrow 9:00', count: 7, last: T0 },
    ]
    expect(rankTimes(times, addDefaults, T0, zone)).toEqual([
      'tomorrow 9:00',
      '10m',
      '1h',
      '18:00',
      'monday 9:00',
    ])
    setNow(Date.parse('2026-11-12T18:30:00Z'))
    expect(rankTimes([], addDefaults, Date.now(), zone)).not.toContain('18:00')
  })
})

describe('where When starts', () => {
  it('starts in an hour before any history', () => {
    expect(startingTime([], T0, zone)).toBe('1h')
  })

  it('starts at the most used time', () => {
    const times = [
      { when: '30m', count: 4, last: T0 - 1000 },
      { when: 'friday 9:00', count: 3, last: T0 - 500 },
    ]
    expect(startingTime(times, T0, zone)).toBe('30m')
  })

  it('skips a most used time of day that has gone by today', () => {
    // 15:00 in Paris
    const times = [
      { when: '9:00', count: 9, last: T0 },
      { when: '2h', count: 2, last: T0 },
    ]
    expect(startingTime(times, T0, zone)).toBe('2h')
    expect(startingTime([{ when: '9:00', count: 9, last: T0 }], T0, zone)).toBe('1h')
  })
})

describe('through the popup messages', () => {
  it('counts the time of an added reminder and of a snooze, not a picked date', async () => {
    await handle({
      type: 'add',
      reminder: {
        title: 'Stretch',
        notes: null,
        due_at: timestamp(T0 + 7_200_000),
        time_zone: zone,
        repeat: null,
      },
      when: '2h',
    })
    await handle({
      type: 'add',
      reminder: {
        title: 'Dentist',
        notes: null,
        due_at: '2026-11-13T13:30:00Z',
        time_zone: zone,
        repeat: null,
      },
      when: '2026-11-13 14:30',
    })
    const reminder = makeReminder({ due_at: timestamp(T0 - 60_000) })
    await seed([reminder, ...Object.values((await readState()).reminders)])
    await handle({ type: 'snooze', id: reminder.id, until: T0 + 7_200_000, when: '120m' })
    expect((await readState()).times).toEqual([{ when: '2h', count: 2, last: T0 }])
  })
})
