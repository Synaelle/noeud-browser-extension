// SPDX-License-Identifier: GPL-3.0-or-later

import { describe, expect, it } from 'vitest'
import { ENTER_A_TIME, formatPreview, parseWhen, parseDuration } from '../src/lib/when'

// Thursday 12 November 2026, 15:00 in Paris
const now = Date.parse('2026-11-12T14:00:00Z')
const zone = 'Europe/Paris'
const at = (text: string) => {
  const when = parseWhen(text, now, zone)
  return when.ok ? new Date(when.at).toISOString().replace('.000Z', 'Z') : when.error
}

describe('durations', () => {
  it.each([
    ['30s', '2026-11-12T14:00:30Z'],
    ['5m', '2026-11-12T14:05:00Z'],
    ['2h', '2026-11-12T16:00:00Z'],
    ['1d', '2026-11-13T14:00:00Z'],
    ['2w', '2026-11-26T14:00:00Z'],
    ['1h30m', '2026-11-12T15:30:00Z'],
    ['1h 30m', '2026-11-12T15:30:00Z'],
    ['7w1h3s', '2026-12-31T15:00:03Z'],
    ['1d12h', '2026-11-14T02:00:00Z'],
    ['3s7w1h', '2026-12-31T15:00:03Z'],
    ['8h52', '2026-11-12T22:52:00Z'],
    ['1h30', '2026-11-12T15:30:00Z'],
    ['5m30', '2026-11-12T14:05:30Z'],
    ['1d6', '2026-11-13T20:00:00Z'],
    ['2w3', '2026-11-29T14:00:00Z'],
    ['1h 30', '2026-11-12T15:30:00Z'],
    ['8H52', '2026-11-12T22:52:00Z'],
    ['7W1H3S', '2026-12-31T15:00:03Z'],
    ['in 2h', '2026-11-12T16:00:00Z'],
    ['in2h30m', '2026-11-12T16:30:00Z'],
    ['520w', '2036-10-30T14:00:00Z'],
    ['1h30m30', '2026-11-12T15:30:30Z'],
  ])('%s', (text, expected) => expect(at(text)).toBe(expected))

  it.each([
    ['0m', 'Enter a time after now, like 10m'],
    ['0h0', 'Enter a time after now, like 10m'],
    ['600w', 'Keep it under 10 years'],
    ['1h1h', 'Use each unit once, like 1h30m'],
    ['1h30m2h', 'Use each unit once, like 1h30m'],
    ['5s3', 'Add a unit to the last number'],
    ['1h2s30m4', 'Add a unit to the last number'],
    ['2y', ENTER_A_TIME],
    ['2h-', ENTER_A_TIME],
    ['h2', ENTER_A_TIME],
    ['', ENTER_A_TIME],
    ['soon', ENTER_A_TIME],
  ])('refuses %j', (text, error) => expect(at(text)).toBe(error))

  it('says how long the duration is', () => {
    expect(parseDuration('8h52')).toEqual({ ms: (8 * 60 + 52) * 60_000 })
    expect(parseWhen('8h52', now, zone)).toEqual({
      ok: true,
      at: now + 31_920_000,
      delay: 31_920_000,
    })
    expect(parseDuration('18:00')).toBeNull()
  })

  it('is due on the minute shown when the time is shown to the minute', () => {
    const later = now + 21_000
    const long = parseWhen('8h52', later, zone)
    if (!long.ok) throw new Error(long.error)
    expect(long.at % 60_000).toBe(0)
    expect(long.at).toBe(Math.floor((later + 31_920_000) / 60_000) * 60_000)
    expect(formatPreview(long, later)).toMatch(/ · in 8 h 52 min$/)
    // under an hour or with seconds, it is shown to the second and kept to the second
    const short = parseWhen('5m', later, zone)
    const exact = parseWhen('2h3s', later, zone)
    expect(short.ok && short.at).toBe(later + 300_000)
    expect(exact.ok && exact.at).toBe(later + 7_203_000)
  })
})

describe('the preview', () => {
  const preview = (text: string) => {
    const when = parseWhen(text, now, zone)
    if (!when.ok) throw new Error(when.error)
    return formatPreview(when, now)
  }
  const second = /\d:\d{2}:\d{2}/

  it('shows the seconds for a duration with seconds or under an hour', () => {
    expect(preview('8h52m3s')).toMatch(second)
    expect(preview('8h52m3s')).toMatch(/ · in 8 h 52 min 3 s$/)
    expect(preview('30m')).toMatch(second)
    expect(preview('30m')).toMatch(/ · in 30 min$/)
    expect(preview('7w1h3s')).toMatch(/ · in 7 wk 1 h 3 s$/)
  })

  it('leaves them out for longer round durations and for times', () => {
    expect(preview('8h52')).not.toMatch(second)
    expect(preview('8h52')).toMatch(/ · in 8 h 52 min$/)
    expect(preview('tomorrow 9:00')).not.toMatch(second)
    expect(preview('tomorrow 9:00')).toMatch(/ · in 18 h$/)
  })

  it('writes the full date the browser way, with the year when it is not this one', () => {
    const at = parseWhen('8h52m3s', now, zone)
    if (!at.ok) throw new Error(at.error)
    const expected = new Intl.DateTimeFormat(undefined, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: 'numeric',
      minute: '2-digit',
      second: '2-digit',
    }).format(at.at)
    expect(preview('8h52m3s')).toBe(`${expected} · in 8 h 52 min 3 s`)
    expect(preview('520w')).toMatch(/2036/)
  })
})

describe('times and days, in the reminder zone', () => {
  it.each([
    ['18:00', '2026-11-12T17:00:00Z'],
    ['at 6pm', '2026-11-12T17:00:00Z'],
    ['6:30 pm', '2026-11-12T17:30:00Z'],
    ['14:00', '2026-11-13T13:00:00Z'],
    ['12am', '2026-11-12T23:00:00Z'],
    ['today 18:00', '2026-11-12T17:00:00Z'],
    ['tomorrow', '2026-11-13T08:00:00Z'],
    ['tomorrow 9:30', '2026-11-13T08:30:00Z'],
    ['tomorrow at 7am', '2026-11-13T06:00:00Z'],
    ['monday', '2026-11-16T08:00:00Z'],
    ['next monday 9:00', '2026-11-16T08:00:00Z'],
    ['thursday 10:00', '2026-11-19T09:00:00Z'],
  ])('%s', (text, expected) => expect(at(text)).toBe(expected))

  it.each([
    ['today 8:00', 'That time has passed'],
    ['today', 'Add a time, like today 18:00'],
    ['9', 'Enter the time like 18:00 or 6pm'],
    ['25:00', 'Enter the time like 18:00 or 6pm'],
    ['13pm', 'Enter the time like 18:00 or 6pm'],
  ])('refuses %j', (text, error) => expect(at(text)).toBe(error))
})

describe('the date picker', () => {
  it.each([
    ['2026-11-13 14:30', '2026-11-13T13:30:00Z'],
    ['2026-11-13T14:30', '2026-11-13T13:30:00Z'],
    // inside the spring change the time moves forward, as for repeats
    ['2027-03-28 02:30', '2027-03-28T01:30:00Z'],
  ])('%s', (text, expected) => expect(at(text)).toBe(expected))

  it.each([
    ['2026-02-30 10:00', 'That date does not exist'],
    ['2025-01-01 10:00', 'That time has passed'],
  ])('refuses %j', (text, error) => expect(at(text)).toBe(error))
})
