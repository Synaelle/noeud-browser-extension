<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- "When": typed text (2h30m, 8h52, 18:00, tomorrow 9:00) or the native date picker, with
     exactly when it will notify you, or the reason it is wrong, underneath. -->
<script lang="ts">
  import { localZone } from '../lib/format'
  import { formatPreview, pickerText, pickerValue, type When } from '../lib/when'
  import Icon from '../ui/Icon.svelte'

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

  let picker: HTMLInputElement | undefined = $state()

  function pick() {
    if (!picker) return
    picker.value = pickerValue(parsed.ok ? parsed.at : now + 3_600_000, localZone())
    picker.showPicker()
  }
</script>

<div class="when">
  <label class="visually-hidden" for={id}>{label}</label>
  <div class="line">
    <input
      {id}
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
      onclick={pick}
    >
      <Icon name="calendar" />
    </button>
    <input
      bind:this={picker}
      class="picker"
      type="datetime-local"
      tabindex="-1"
      aria-hidden="true"
      onchange={() => picker?.value && oninput(pickerText(picker.value))}
    />
  </div>
  <p id="{id}-preview" class="preview" class:error={!parsed.ok} aria-live="polite">
    {parsed.ok ? formatPreview(parsed, now) : parsed.error}
  </p>
</div>

<style>
  .line {
    position: relative;
    display: flex;
    gap: var(--space-1);
  }
  .line .field {
    flex: 1;
  }
  /* the native picker opens from here, it must be laid out to open at all */
  .picker {
    position: absolute;
    right: 0;
    bottom: 0;
    width: 32px;
    height: 1px;
    opacity: 0;
    pointer-events: none;
  }
  .preview {
    margin: var(--space-1) 0 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
