<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A month and a time of day, drawn in the popup. The browser's own date picker opens outside
     the popup and ignores the clock setting, so it is not used. Picking gives the text When
     understands ("2026-11-13 14:30"); Escape closes without changing anything. -->
<script lang="ts">
  import { untrack } from 'svelte'
  import {
    calendarText,
    clockHour,
    dayHour,
    minuteOf,
    monthWeeks,
    moveDay,
    weekStart,
  } from '../lib/calendar'
  import { clockOptions, type Clock } from '../lib/format'
  import Icon from '../ui/Icon.svelte'

  let {
    id,
    start,
    today,
    onpick,
    onclose,
  }: {
    id: string
    /** The date and time it opens on. */
    start: Temporal.PlainDateTime
    today: Temporal.PlainDate
    onpick: (text: string) => void
    onclose: () => void
  } = $props()

  const clock: Clock = clockOptions().hourCycle === 'h12' ? '12h' : '24h'
  const firstDay = weekStart(navigator.language)
  const initial = untrack(() => ({ ...clockHour(start.hour, clock), day: start.toPlainDate() }))

  let day = $state(initial.day)
  let hourText = $state(clock === '24h' ? pad(initial.hour) : String(initial.hour))
  let minuteText = $state(pad(untrack(() => start.minute)))
  let pm = $state(initial.pm)
  let timeError = $state<string | null>(null)
  let grid: HTMLTableElement | undefined = $state()

  const weeks = $derived(monthWeeks(day.toPlainYearMonth(), firstDay))
  const month = $derived(day.toLocaleString(undefined, { month: 'long', year: 'numeric' }))
  const weekdays = $derived(
    (weeks[0] ?? []).map((date) => ({
      short: date.toLocaleString(undefined, { weekday: 'narrow' }),
      long: date.toLocaleString(undefined, { weekday: 'long' }),
    })),
  )

  $effect(() => focusDay())

  function pad(value: number): string {
    return String(value).padStart(2, '0')
  }

  function focusDay() {
    grid?.querySelector<HTMLElement>(`[data-day="${untrack(() => day).toString()}"]`)?.focus()
  }

  function moveTo(next: Temporal.PlainDate) {
    day = next
    requestAnimationFrame(focusDay)
  }

  function dayKey(event: KeyboardEvent) {
    if (event.key === 'Enter') {
      event.preventDefault()
      pick()
      return
    }
    const next = moveDay(day, event.key, firstDay)
    if (!next) return
    event.preventDefault()
    moveTo(next)
  }

  /** Arrow Up and Down step the hour or minutes, round the clock. */
  function step(event: KeyboardEvent, part: 'hour' | 'minute') {
    if (event.key === 'Enter') {
      event.preventDefault()
      pick()
      return
    }
    const by = event.key === 'ArrowUp' ? 1 : event.key === 'ArrowDown' ? -1 : 0
    if (!by) return
    event.preventDefault()
    timeError = null
    if (part === 'minute') {
      minuteText = pad(((minuteOf(minuteText) ?? 0) + by + 60) % 60)
      return
    }
    const hour = ((dayHour(hourText, pm, clock) ?? 0) + by + 24) % 24
    const shown = clockHour(hour, clock)
    hourText = clock === '24h' ? pad(shown.hour) : String(shown.hour)
    pm = shown.pm
  }

  function pick() {
    const hour = dayHour(hourText, pm, clock)
    const minute = minuteOf(minuteText)
    if (hour === null || minute === null) {
      timeError = clock === '24h' ? 'Enter a time like 18:30' : 'Enter a time like 6:30 PM'
      document.getElementById(hour === null ? `${id}-hour` : `${id}-minute`)?.focus()
      return
    }
    onpick(calendarText(day, hour, minute))
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape') return
    event.preventDefault()
    event.stopPropagation()
    onclose()
  }
</script>

<div
  {id}
  class="calendar"
  role="dialog"
  aria-labelledby="{id}-month"
  tabindex="-1"
  onkeydown={escape}
>
  <div class="head">
    <button
      type="button"
      class="button icon"
      aria-label="Previous month"
      title="Previous month (Page Up)"
      onclick={() => (day = day.subtract({ months: 1 }))}
    >
      <Icon name="chevron-left" />
    </button>
    <h2 id="{id}-month" aria-live="polite">{month}</h2>
    <button
      type="button"
      class="button icon"
      aria-label="Next month"
      title="Next month (Page Down)"
      onclick={() => (day = day.add({ months: 1 }))}
    >
      <Icon name="chevron-right" />
    </button>
  </div>

  <table role="grid" aria-labelledby="{id}-month" bind:this={grid}>
    <thead>
      <tr>
        {#each weekdays as weekday (weekday.long)}
          <th scope="col" abbr={weekday.long}>{weekday.short}</th>
        {/each}
      </tr>
    </thead>
    <tbody>
      {#each weeks as week (week[0]?.toString())}
        <tr>
          {#each week as date (date.toString())}
            {@const selected = date.equals(day)}
            <td aria-selected={selected}>
              <button
                type="button"
                class="day"
                class:selected
                class:outside={date.month !== day.month}
                class:past={Temporal.PlainDate.compare(date, today) < 0}
                data-day={date.toString()}
                tabindex={selected ? 0 : -1}
                aria-current={date.equals(today) ? 'date' : undefined}
                aria-label={date.toLocaleString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  year: 'numeric',
                })}
                onclick={() => moveTo(date)}
                onkeydown={dayKey}
              >
                {date.day}
              </button>
            </td>
          {/each}
        </tr>
      {/each}
    </tbody>
  </table>

  <div class="time">
    <div class="clock" role="group" aria-label="Time">
      <input
        id="{id}-hour"
        class="field"
        aria-label="Hour"
        inputmode="numeric"
        maxlength="2"
        autocomplete="off"
        aria-invalid={timeError && dayHour(hourText, pm, clock) === null ? 'true' : undefined}
        aria-describedby={timeError ? `${id}-error` : undefined}
        bind:value={hourText}
        oninput={() => (timeError = null)}
        onkeydown={(event) => step(event, 'hour')}
      />
      <span aria-hidden="true">:</span>
      <input
        id="{id}-minute"
        class="field"
        aria-label="Minutes"
        inputmode="numeric"
        maxlength="2"
        autocomplete="off"
        aria-invalid={timeError && minuteOf(minuteText) === null ? 'true' : undefined}
        aria-describedby={timeError ? `${id}-error` : undefined}
        bind:value={minuteText}
        oninput={() => (timeError = null)}
        onkeydown={(event) => step(event, 'minute')}
      />
      {#if clock === '12h'}
        <div class="half" role="group" aria-label="AM or PM">
          <button type="button" class="button small" aria-pressed={!pm} onclick={() => (pm = false)}
            >AM</button
          >
          <button type="button" class="button small" aria-pressed={pm} onclick={() => (pm = true)}
            >PM</button
          >
        </div>
      {/if}
    </div>
    <button type="button" class="button small primary" onclick={pick}>Set</button>
  </div>
  {#if timeError}<p id="{id}-error" class="hint error" role="alert">{timeError}</p>{/if}
</div>

<style>
  .calendar {
    display: grid;
    gap: var(--space-2);
    margin-top: var(--space-2);
    padding: var(--space-2);
    border: 1px solid var(--color-border);
    border-radius: var(--radius);
    background: var(--color-surface);
  }
  .calendar:focus {
    outline: none;
  }
  .head {
    display: flex;
    align-items: center;
  }
  .head .button.icon {
    width: 28px;
    height: 28px;
  }
  h2 {
    flex: 1;
    margin: 0;
    font-size: 13px;
    font-weight: 600;
    text-align: center;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }
  th {
    padding-bottom: var(--space-1);
    font-size: 11px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  td {
    padding: 1px;
  }
  .day {
    display: block;
    width: 100%;
    height: 28px;
    padding: 0;
    border: 1px solid transparent;
    border-radius: var(--radius);
    background: none;
    font-size: 13px;
    font-variant-numeric: tabular-nums;
    cursor: pointer;
  }
  .day:hover {
    background: var(--color-surface-2);
  }
  .day.past,
  .day.outside {
    color: var(--color-text-faint);
  }
  .day[aria-current='date'] {
    border-color: var(--color-border-strong);
    font-weight: 600;
  }
  .day.selected {
    border-color: var(--color-accent);
    background: var(--color-accent);
    color: var(--color-accent-on);
    font-weight: 600;
  }
  .day:focus-visible {
    outline-offset: 1px;
  }
  .time {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: var(--space-2);
  }
  .clock {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .clock .field {
    width: 40px;
    height: 28px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .half {
    display: flex;
    margin-left: var(--space-1);
  }
  .half .button {
    color: var(--color-text-muted);
  }
  .half .button + .button {
    margin-left: -1px;
  }
  .half [aria-pressed='true'] {
    position: relative;
    border-color: var(--color-accent);
    color: var(--color-text);
  }
  .hint {
    margin: 0;
    font-size: 12px;
  }
</style>
