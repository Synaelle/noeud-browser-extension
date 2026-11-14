<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Adding a reminder: the text, then when ("2h", "8h52", "18:00", "tomorrow 9:00"). Enter adds
     it for exactly the time the preview shows. -->
<script lang="ts">
  import { localZone } from '../lib/format'
  import { send } from '../lib/messages'
  import { TITLE_MAX, type RepeatUnit } from '../lib/reminder'
  import { addDefaults, rankTimes, startingTime, timeLabel, type TimeUse } from '../lib/usage'
  import { normalizeWhen, parseWhen } from '../lib/when'
  import Icon from '../ui/Icon.svelte'
  import RepeatField from './RepeatField.svelte'
  import WhenField from './WhenField.svelte'

  let { now, times }: { now: number; times: TimeUse[] } = $props()

  const zone = localZone()
  let title = $state('')
  let when = $state('')
  /** The When field was set by hand, so it no longer follows the most used time. */
  let whenChosen = $state(false)
  let every = $state<RepeatUnit | ''>('')
  let interval = $state(1)
  let notes = $state('')
  let more = $state(false)
  let titleError = $state<string | null>(null)
  let error = $state<string | null>(null)
  let adding = $state(false)
  let titleInput: HTMLTextAreaElement | undefined = $state()

  const picks = $derived(
    rankTimes(times, addDefaults, now, zone).map((pick) => ({
      when: pick,
      label: timeLabel(pick),
    })),
  )
  // until set by hand, When is the most used time
  const topPick = $derived(startingTime(times, now, zone))
  const whenText = $derived(whenChosen ? when : topPick)
  // `now` ticks on each second, so a duration's preview and the time added are the same
  const parsed = $derived(parseWhen(whenText, now, zone))
  const chosen = $derived(normalizeWhen(whenText))

  $effect(() => {
    titleInput?.focus()
  })

  function choose(text: string) {
    when = text
    whenChosen = true
  }

  async function add() {
    error = null
    const text = title.trim()
    titleError = text ? null : 'Enter what to remember'
    if (titleError) {
      titleInput?.focus()
      return
    }
    // the time shown in the preview when Enter was pressed
    const at = parsed
    if (!at.ok) {
      document.getElementById('add-when')?.focus()
      return
    }
    adding = true
    try {
      await send({
        type: 'add',
        reminder: {
          title: text,
          notes: notes.trim() || null,
          due_at: new Date(at.at).toISOString(),
          time_zone: zone,
          repeat: every ? { every, interval: Math.max(1, Math.round(interval)) } : null,
        },
        when: whenText,
      })
      title = ''
      when = ''
      whenChosen = false
      every = ''
      interval = 1
      notes = ''
      more = false
      titleInput?.focus()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      adding = false
    }
  }
</script>

<form
  class="add"
  novalidate
  onsubmit={(event) => {
    event.preventDefault()
    void add()
  }}
>
  <label class="visually-hidden" for="add-title">What should I remember?</label>
  <textarea
    id="add-title"
    class="field title"
    rows="2"
    bind:this={titleInput}
    bind:value={title}
    maxlength={TITLE_MAX * 2}
    placeholder="What should I remember?"
    aria-invalid={titleError ? 'true' : undefined}
    aria-describedby={titleError ? 'add-title-error' : undefined}
    oninput={() => (titleError = null)}
    onkeydown={(event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        void add()
      }
    }}></textarea>
  {#if titleError}<p id="add-title-error" class="hint error">{titleError}</p>{/if}

  <WhenField
    id="add-when"
    value={whenText}
    {parsed}
    {now}
    oninput={choose}
    onenter={() => void add()}
  />

  <div class="picks" role="group" aria-label="Quick times">
    {#each picks as pick (pick.when)}
      <button
        type="button"
        class="button small"
        aria-pressed={chosen === pick.when}
        onclick={() => choose(pick.when)}
      >
        {pick.label}
      </button>
    {/each}
  </div>

  <button
    type="button"
    class="more"
    aria-expanded={more}
    aria-controls="add-more"
    onclick={() => (more = !more)}
  >
    <span class="chevron" class:open={more}><Icon name="chevron-down" size={14} /></span>
    More
    {#if !more && (every || notes.trim())}
      <span class="meta">
        {[every && 'repeats', notes.trim() && 'with notes'].filter(Boolean).join(', ')}
      </span>
    {/if}
  </button>
  {#if more}
    <div id="add-more" class="more-fields">
      <RepeatField id="add-repeat" bind:every bind:interval />
      <label class="visually-hidden" for="add-notes">Notes</label>
      <textarea id="add-notes" class="field" rows="2" placeholder="Notes" bind:value={notes}
      ></textarea>
    </div>
  {/if}

  <div class="submit">
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    <span class="hint muted">Enter adds, Shift+Enter starts a new line</span>
    <button type="submit" class="button primary" disabled={adding}>
      <Icon name="plus" />
      Add
    </button>
  </div>
</form>

<style>
  .add {
    display: grid;
    gap: var(--space-2);
    padding: var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  .title {
    height: auto;
    min-height: 32px;
    padding: 6px var(--space-2);
    resize: vertical;
    line-height: 1.45;
  }
  textarea.field {
    height: auto;
    padding: 6px var(--space-2);
    resize: vertical;
  }
  .hint {
    margin: 0;
    font-size: 12px;
  }
  .picks {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .picks [aria-pressed='true'] {
    border-color: var(--color-accent);
  }
  .more {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    justify-self: start;
    padding: 2px var(--space-1);
    margin-left: calc(var(--space-1) * -1);
    border: 0;
    border-radius: var(--radius);
    background: none;
    color: var(--color-text-muted);
    font-size: 13px;
    cursor: pointer;
  }
  .more:hover {
    color: var(--color-text);
  }
  .chevron {
    display: inline-flex;
    transform: rotate(-90deg);
    transition: transform var(--dur-fast) var(--ease-out);
  }
  .chevron.open {
    transform: none;
  }
  .more-fields {
    display: grid;
    gap: var(--space-2);
  }
  .submit {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-2);
  }
  .submit .hint {
    flex: 1;
  }
  .submit .error {
    flex-basis: 100%;
    margin: 0;
  }
</style>
