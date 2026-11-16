// SPDX-License-Identifier: GPL-3.0-or-later

import { beforeEach, describe, expect, it } from 'vitest'
import {
  calendarText,
  chooseWeekStart,
  firstDayOfWeek,
  loadWeekStart,
  moveInList,
  setWeekStart,
  yearPage,
  clockHour,
  dayHour,
  minuteOf,
  monthWeeks,
  moveDay,
  weekStart,
} from '../src/lib/calendar'
import { parseWhen } from '../src/lib/when'
import { installFakeChrome } from './fakeChrome'

const date = (text: string) => Temporal.PlainDate.from(text)
const MONDAY = 1
const SUNDAY = 7

describe('the month grid', () => {
  it('starts on the first day of the week and covers six weeks', () => {
    const weeks = monthWeeks(Temporal.PlainYearMonth.from('2026-11'), MONDAY)
    expect(weeks).toHaveLength(6)
    expect(weeks.every((week) => week.length === 7)).toBe(true)
    // 1 November 2026 is a Sunday
    expect(weeks[0]?.[0]?.toString()).toBe('2026-10-26')
    expect(weeks[0]?.[6]?.toString()).toBe('2026-11-01')
    expect(weeks[5]?.[6]?.toString()).toBe('2026-12-06')
  })

  it('starts on Sunday where weeks do', () => {
    const weeks = monthWeeks(Temporal.PlainYearMonth.from('2026-11'), SUNDAY)
    expect(weeks[0]?.[0]?.toString()).toBe('2026-11-01')
  })

  it('has every day of the month once', () => {
    for (const month of ['2024-02', '2025-02', '2026-03', '2026-11']) {
      const days = monthWeeks(Temporal.PlainYearMonth.from(month), MONDAY)
        .flat()
        .filter((day) => day.toPlainYearMonth().toString() === month)
      expect(days.map((day) => day.day)).toEqual(
        Array.from({ length: Temporal.PlainYearMonth.from(month).daysInMonth }, (_, i) => i + 1),
      )
    }
  })

  it('knows leap years', () => {
    const last = (month: string) =>
      monthWeeks(Temporal.PlainYearMonth.from(month), MONDAY)
        .flat()
        .filter((day) => day.toPlainYearMonth().toString() === month)
        .at(-1)
        ?.toString()
    expect(last('2024-02')).toBe('2024-02-29')
    expect(last('2028-02')).toBe('2028-02-29')
    expect(last('2026-02')).toBe('2026-02-28')
    expect(last('2100-02')).toBe('2100-02-28')
    expect(last('2000-02')).toBe('2000-02-29')
  })

  it('reads the week start from the locale', () => {
    expect(weekStart('fr-FR')).toBe(MONDAY)
    expect(weekStart('en-US')).toBe(SUNDAY)
  })
})

describe('moving the day', () => {
  it.each([
    ['2026-11-13', 'ArrowLeft', '2026-11-12'],
    ['2026-11-13', 'ArrowRight', '2026-11-14'],
    ['2026-11-13', 'ArrowUp', '2026-11-06'],
    ['2026-11-13', 'ArrowDown', '2026-11-20'],
    ['2026-11-30', 'ArrowRight', '2026-12-01'],
    ['2026-12-31', 'ArrowDown', '2027-01-07'],
    ['2027-01-03', 'ArrowUp', '2026-12-27'],
    ['2026-11-13', 'PageUp', '2026-10-13'],
    ['2026-11-13', 'PageDown', '2026-12-13'],
    ['2026-12-15', 'PageDown', '2027-01-15'],
    ['2027-01-15', 'PageUp', '2026-12-15'],
    // to the last day of a shorter month
    ['2026-01-31', 'PageDown', '2026-02-28'],
    ['2028-01-31', 'PageDown', '2028-02-29'],
    ['2026-03-31', 'PageUp', '2026-02-28'],
    ['2026-10-31', 'PageDown', '2026-11-30'],
    ['2028-02-29', 'ArrowRight', '2028-03-01'],
    ['2026-02-28', 'ArrowRight', '2026-03-01'],
    // Friday to the week's Monday and Sunday
    ['2026-11-13', 'Home', '2026-11-09'],
    ['2026-11-13', 'End', '2026-11-15'],
    ['2026-11-09', 'Home', '2026-11-09'],
    ['2026-11-15', 'End', '2026-11-15'],
  ])('%s %s is %s', (from, key, expected) => {
    expect(moveDay(date(from), key, MONDAY)?.toString()).toBe(expected)
  })

  it('finds the week ends where weeks start on Sunday', () => {
    expect(moveDay(date('2026-11-13'), 'Home', SUNDAY)?.toString()).toBe('2026-11-08')
    expect(moveDay(date('2026-11-13'), 'End', SUNDAY)?.toString()).toBe('2026-11-14')
    expect(moveDay(date('2026-11-15'), 'Home', SUNDAY)?.toString()).toBe('2026-11-15')
  })

  it('ignores other keys', () => {
    expect(moveDay(date('2026-11-13'), 'a', MONDAY)).toBeNull()
  })
})

describe('the time', () => {
  it.each([
    [0, { hour: 0, pm: false }, { hour: 12, pm: false }],
    [9, { hour: 9, pm: false }, { hour: 9, pm: false }],
    [12, { hour: 12, pm: true }, { hour: 12, pm: true }],
    [18, { hour: 18, pm: true }, { hour: 6, pm: true }],
    [23, { hour: 23, pm: true }, { hour: 11, pm: true }],
  ])('hour %i shows as in each clock', (hour, h24, h12) => {
    expect(clockHour(hour, '24h')).toEqual(h24)
    expect(clockHour(hour, '12h')).toEqual(h12)
  })

  it.each([
    ['0', false, 0],
    ['09', false, 9],
    ['14', false, 14],
    ['23', true, 23],
    ['24', false, null],
    ['', false, null],
    ['1a', false, null],
    ['-1', false, null],
  ])('24-hour %j is %s', (text, pm, hour) => expect(dayHour(text, pm, '24h')).toBe(hour))

  it.each([
    ['12', false, 0],
    ['1', false, 1],
    ['11', false, 11],
    ['12', true, 12],
    ['6', true, 18],
    ['11', true, 23],
    ['0', false, null],
    ['13', true, null],
  ])('12-hour %j pm=%s is %s', (text, pm, hour) => expect(dayHour(text, pm, '12h')).toBe(hour))

  it('turns every hour into the same hour in both clocks', () => {
    for (let hour = 0; hour < 24; hour++) {
      const { hour: shown, pm } = clockHour(hour, '12h')
      expect(dayHour(String(shown), pm, '12h')).toBe(hour)
      expect(dayHour(String(clockHour(hour, '24h').hour), false, '24h')).toBe(hour)
    }
  })

  it.each([
    ['0', 0],
    ['05', 5],
    ['59', 59],
    ['60', null],
    ['', null],
  ])('minute %j is %s', (text, minute) => expect(minuteOf(text)).toBe(minute))
})

describe('what the calendar writes', () => {
  it('writes what the date picker did', () => {
    expect(calendarText(date('2026-11-13'), 14, 30)).toBe('2026-11-13 14:30')
    expect(calendarText(date('2027-01-02'), 0, 5)).toBe('2027-01-02 00:05')
    expect(calendarText(date('2028-02-29'), 23, 59)).toBe('2028-02-29 23:59')
  })

  it('is read back as the same time', () => {
    const now = Date.parse('2026-11-12T14:00:00Z')
    const when = parseWhen(calendarText(date('2026-11-13'), 18, 0), now, 'Europe/Paris')
    expect(when.ok && new Date(when.at).toISOString()).toBe('2026-11-13T17:00:00.000Z')
  })
})

describe('the first day of the week', () => {
  let fake: ReturnType<typeof installFakeChrome>
  beforeEach(() => {
    fake = installFakeChrome()
    setWeekStart('auto')
  })

  it("follows the browser's language until chosen", async () => {
    expect(await loadWeekStart()).toBe('auto')
    expect(firstDayOfWeek('fr-FR')).toBe(MONDAY)
    expect(firstDayOfWeek('en-US')).toBe(SUNDAY)
  })

  it.each([
    [1, MONDAY],
    [7, SUNDAY],
    [6, 6],
  ] as const)('starts on day %i whatever the language', async (choice, day) => {
    await chooseWeekStart(choice)
    expect(fake.storage.get('weekStart')).toBe(choice)
    setWeekStart('auto')
    expect(await loadWeekStart()).toBe(choice)
    expect(firstDayOfWeek('en-US')).toBe(day)
    expect(firstDayOfWeek('fr-FR')).toBe(day)
    expect(
      monthWeeks(Temporal.PlainYearMonth.from('2026-11'), firstDayOfWeek())[0]?.[0]?.dayOfWeek,
    ).toBe(day)
  })

  it('goes back to the language when chosen again', async () => {
    await chooseWeekStart(1)
    await chooseWeekStart('auto')
    expect(await loadWeekStart()).toBe('auto')
    expect(firstDayOfWeek('en-US')).toBe(SUNDAY)
  })

  it('ignores a stored value it does not know', async () => {
    fake.storage.set('weekStart', 3)
    expect(await loadWeekStart()).toBe('auto')
  })
})

describe('the month and year lists', () => {
  // months as year * 12 + month - 1, the way the calendar moves through them
  const month = (text: string) => {
    const ym = Temporal.PlainYearMonth.from(text)
    return ym.year * 12 + ym.month - 1
  }
  const back = (at: number | null) =>
    at === null ? null : new Temporal.PlainYearMonth(Math.floor(at / 12), (at % 12) + 1).toString()

  it.each([
    ['2026-11', 'ArrowRight', '2026-12'],
    ['2026-12', 'ArrowRight', '2027-01'],
    ['2026-01', 'ArrowLeft', '2025-12'],
    ['2026-02', 'ArrowUp', '2025-11'],
    ['2026-11', 'ArrowDown', '2027-02'],
    ['2026-11', 'PageUp', '2025-11'],
    ['2026-11', 'PageDown', '2027-11'],
  ])('month %s %s is %s', (from, key, expected) => {
    expect(back(moveInList(month(from), key, 12))).toBe(expected)
  })

  it.each([
    [2026, 'ArrowRight', 2027],
    [2026, 'ArrowUp', 2023],
    [2026, 'ArrowDown', 2029],
    [2026, 'PageUp', 2014],
    [2026, 'PageDown', 2038],
    [2026, 'Enter', null],
  ])('year %i %s is %s', (from, key, expected) => {
    expect(moveInList(from, key, 12)).toBe(expected)
  })

  it('pages years from the year before this one', () => {
    expect(yearPage(2026, 2026)).toEqual([
      2025, 2026, 2027, 2028, 2029, 2030, 2031, 2032, 2033, 2034, 2035, 2036,
    ])
    expect(yearPage(2036, 2026)[0]).toBe(2025)
    expect(yearPage(2037, 2026)).toEqual([
      2037, 2038, 2039, 2040, 2041, 2042, 2043, 2044, 2045, 2046, 2047, 2048,
    ])
    expect(yearPage(2024, 2026)).toEqual([
      2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
    ])
  })

  it('keeps the day inside a shorter month or a year without 29 February', () => {
    const day = Temporal.PlainDate.from('2028-01-31')
    expect(day.with({ month: 2 }).toString()).toBe('2028-02-29')
    expect(Temporal.PlainDate.from('2028-02-29').with({ year: 2027 }).toString()).toBe('2027-02-28')
  })
})
