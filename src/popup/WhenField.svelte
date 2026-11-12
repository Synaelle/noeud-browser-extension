<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- "When": typed text (2h30m, 8h52, 18:00, tomorrow 9:00) or a date from the calendar, with
     exactly when it will notify you, or the reason it is wrong, underneath. -->
<script lang="ts">
  import { localZone } from '../lib/format'
  import { formatPreview, pickerValue, type When } from '../lib/when'
  import Icon from '../ui/Icon.svelte'
  import Calendar from './Calendar.svelte'

  let {
    id,
    value,
    parsed,
    now,
    label = 'When',
    oninput,
    onenter,
  }: {
    id: string
    value: string
    parsed: When
    now: number
    label?: string
    oninput: (value: string) => void
    onenter: () => void
  } = $props()

  let input: HTMLInputElement | undefined = $state()
  let opener: HTMLButtonElement | undefined = $state()
  /** Where the calendar opens: the time in When, or an hour from now. */
  let calendar = $state<{ start: Temporal.PlainDateTime; today: Temporal.PlainDate } | null>(null)

  function toggle() {
    if (calendar) return close()
    const zone = localZone()
    calendar = {
      start: Temporal.PlainDateTime.from(
        pickerValue(parsed.ok ? parsed.at : now + 3_600_000, zone),
      ),
      today: Temporal.Instant.fromEpochMilliseconds(now).toZonedDateTimeISO(zone).toPlainDate(),
    }
  }

  function close() {
    calendar = null
    opener?.focus()
  }
</script>

<div class="when">
  <label class="visually-hidden" for={id}>{label}</label>
  <div class="line">
    <input
      {id}
      bind:this={input}
      class="field"
      {value}
      placeholder="2h, 18:00, tomorrow 9:00"
      autocomplete="off"
      spellcheck="false"
      aria-invalid={parsed.ok ? undefined : 'true'}
      aria-describedby="{id}-preview"
      oninput={(event) => oninput(event.currentTarget.value)}
      onkeydown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault()
          onenter()
        }
      }}
    />
    <button
      type="button"
      class="button icon"
      title="Pick a date"
      aria-label="Pick a date"
      aria-expanded={calendar !== null}
      aria-controls="{id}-calendar"
      bind:this={opener}
      onclick={toggle}
    >
      <Icon name="calendar" />
    </button>
  </div>
  {#if calendar}
    <Calendar
      id="{id}-calendar"
      start={calendar.start}
      today={calendar.today}
      onpick={(text) => {
        oninput(text)
        calendar = null
        input?.focus()
      }}
      onclose={close}
    />
  {/if}
  <p id="{id}-preview" class="preview" class:error={!parsed.ok} aria-live="polite">
    {parsed.ok ? formatPreview(parsed, now) : parsed.error}
  </p>
</div>

<style>
  .line {
    display: flex;
    gap: var(--space-1);
  }
  .line .field {
    flex: 1;
  }
  .preview {
    margin: var(--space-1) 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
