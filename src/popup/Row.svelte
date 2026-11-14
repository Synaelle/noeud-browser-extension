<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- One reminder in the popup list: Done, Snooze, Edit in place, Delete. Done and Delete are
     undone from the notice the popup shows after them. -->
<script lang="ts">
  import { delayTitle } from '../lib/delay'
  import { formatRepeat, formatWhen, localZone } from '../lib/format'
  import type { Message } from '../lib/messages'
  import { notifyAt, TITLE_MAX, type Reminder, type RepeatUnit } from '../lib/reminder'
  import { rankTimes, snoozeDefaults, timeLabel, type TimeUse } from '../lib/usage'
  import { parseWhen, pickerText, pickerValue } from '../lib/when'
  import Icon from '../ui/Icon.svelte'
  import RepeatField from './RepeatField.svelte'
  import WhenField from './WhenField.svelte'

  let {
    reminder,
    now,
    times,
    delay,
    highlighted,
    onaction,
    ondone,
    ondelete,
  }: {
    reminder: Reminder
    now: number
    times: TimeUse[]
    /** The length chosen for Delay, "1d". */
    delay: string
    highlighted: boolean
    onaction: (message: Message) => Promise<boolean>
    ondone: (reminder: Reminder) => void
    ondelete: (reminder: Reminder) => void
  } = $props()

  const zone = localZone()

  let mode = $state<'view' | 'snooze' | 'edit'>('view')
  let row: HTMLLIElement | undefined = $state()
  let opener: HTMLElement | null = null

  const at = $derived(notifyAt(reminder))
  const isDone = $derived(reminder.done_at !== null)
  const overdue = $derived(!isDone && at !== null && at <= now)
  const when = $derived(
    isDone
      ? `Done ${formatWhen(Date.parse(reminder.done_at ?? ''), now)}`
      : formatWhen(at ?? Date.parse(reminder.due_at), now),
  )

  // snooze
  const snoozes = $derived(
    rankTimes(times, snoozeDefaults, now, zone).map((pick) => ({
      when: pick,
      label: timeLabel(pick),
    })),
  )
  let custom = $state('')
  const customParsed = $derived(parseWhen(custom, now, zone))

  // edit
  let title = $state('')
  let whenText = $state('')
  let every = $state<RepeatUnit | ''>('')
  let interval = $state(1)
  let notes = $state('')
  let editError = $state<string | null>(null)
  /** What When held when the form opened: until it changes, the reminder keeps its time, even
      one a sync moves meanwhile. A snoozed reminder shows its snooze. */
  let openedWhen = $state('')
  const whenMoved = $derived(whenText !== openedWhen)
  const whenParsed = $derived(
    whenMoved
      ? parseWhen(whenText, now, zone)
      : ({ ok: true, at: at ?? Date.parse(reminder.due_at) } as const),
  )

  $effect(() => {
    if (highlighted) row?.scrollIntoView({ block: 'center' })
  })

  function open(next: 'snooze' | 'edit', event: MouseEvent) {
    if (mode === next) return close()
    opener = event.currentTarget as HTMLElement
    if (next === 'edit') {
      title = reminder.title
      openedWhen = pickerText(pickerValue(at ?? Date.parse(reminder.due_at), zone))
      whenText = openedWhen
      every = reminder.repeat?.every ?? ''
      interval = reminder.repeat?.interval ?? 1
      notes = reminder.notes ?? ''
      editError = null
    } else {
      custom = ''
    }
    mode = next
    requestAnimationFrame(() =>
      row?.querySelector<HTMLElement>('.panel button, .panel textarea')?.focus(),
    )
  }

  function close() {
    mode = 'view'
    opener?.focus()
  }

  function escape(event: KeyboardEvent) {
    if (event.key !== 'Escape' || mode === 'view' || !row?.contains(document.activeElement)) return
    event.preventDefault()
    event.stopPropagation()
    close()
  }

  async function snoozeTo(text: string) {
    const until = parseWhen(text, Date.now(), zone)
    if (!until.ok) return
    if (await onaction({ type: 'snooze', id: reminder.id, until: until.at, when: text })) close()
  }

  async function save() {
    editError = title.trim() ? null : 'Enter what to remember'
    // the time shown in the preview when it was saved
    const due = whenMoved ? whenParsed : null
    if (editError || (due && !due.ok)) return
    const repeat = every ? { every, interval: Math.max(1, Math.round(interval)) } : null
    const sameRepeat =
      repeat?.every === reminder.repeat?.every && repeat?.interval === reminder.repeat?.interval
    const ok = await onaction({
      type: 'edit',
      id: reminder.id,
      changes: {
        title,
        notes: notes.trim() || null,
        ...(due?.ok ? { due_at: new Date(due.at).toISOString() } : {}),
        ...(sameRepeat ? {} : { repeat }),
      },
    })
    if (ok) close()
  }
</script>

<svelte:window onkeydown={escape} />

<li class="row" class:highlighted bind:this={row}>
  <div class="line">
    <div class="text">
      <span class="title">{reminder.title}</span>
      <span class="meta" class:overdue>
        {when}
        {#if reminder.snoozed_until && !isDone}<span class="tag">Snoozed</span>{/if}
        {#if reminder.repeat}
          <span class="tag"><Icon name="repeat" size={12} />{formatRepeat(reminder.repeat)}</span>
        {/if}
      </span>
    </div>
    <div class="actions">
      {#if !isDone}
        <button
          type="button"
          class="button icon"
          title={reminder.repeat ? 'Done, until next time' : 'Done'}
          aria-label="Done: {reminder.title}"
          onclick={() => ondone(reminder)}
        >
          <Icon name="check" />
        </button>
        <button
          type="button"
          class="button icon"
          title="Snooze"
          aria-label="Snooze: {reminder.title}"
          aria-expanded={mode === 'snooze'}
          onclick={(event) => open('snooze', event)}
        >
          <Icon name="clock" />
        </button>
        <button
          type="button"
          class="button icon"
          title="Edit"
          aria-label="Edit: {reminder.title}"
          aria-expanded={mode === 'edit'}
          onclick={(event) => open('edit', event)}
        >
          <Icon name="pencil" />
        </button>
      {:else}
        <button
          type="button"
          class="button icon"
          title="Open again"
          aria-label="Open again: {reminder.title}"
          onclick={() => onaction({ type: 'reopen', id: reminder.id })}
        >
          <Icon name="rotate-ccw" />
        </button>
      {/if}
      <button
        type="button"
        class="button icon"
        title="Delete"
        aria-label="Delete: {reminder.title}"
        onclick={() => ondelete(reminder)}
      >
        <Icon name="trash-2" />
      </button>
    </div>
  </div>

  {#if overdue}
    <div class="due">
      <button
        type="button"
        class="button small"
        aria-label="{delayTitle(delay)}: {reminder.title}"
        onclick={() => onaction({ type: 'delay', ids: [reminder.id] })}
      >
        <Icon name="clock" size={14} />
        {delayTitle(delay)}
      </button>
    </div>
  {/if}

  {#if mode === 'snooze'}
    <div class="panel" role="group" aria-label="Snooze {reminder.title}">
      <div class="choices">
        {#each snoozes as choice (choice.when)}
          <button type="button" class="button small" onclick={() => snoozeTo(choice.when)}>
            {choice.label}
          </button>
        {/each}
      </div>
      <form
        class="custom"
        novalidate
        onsubmit={(event) => {
          event.preventDefault()
          void snoozeTo(custom)
        }}
      >
        <label class="visually-hidden" for="snooze-{reminder.id}">Snooze until</label>
        <input
          id="snooze-{reminder.id}"
          class="field"
          bind:value={custom}
          placeholder="Other: 3h, 18:00, friday"
          autocomplete="off"
          spellcheck="false"
          aria-describedby="snooze-{reminder.id}-preview"
          aria-invalid={custom && !customParsed.ok ? 'true' : undefined}
        />
        <button type="submit" class="button small" disabled={!customParsed.ok}>Snooze</button>
      </form>
      {#if custom}
        <p id="snooze-{reminder.id}-preview" class="preview" class:error={!customParsed.ok}>
          {customParsed.ok ? `Until ${formatWhen(customParsed.at, now)}` : customParsed.error}
        </p>
      {/if}
    </div>
  {:else if mode === 'edit'}
    <form
      class="panel edit"
      novalidate
      aria-label="Edit {reminder.title}"
      onsubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <label class="visually-hidden" for="edit-{reminder.id}">Reminder</label>
      <textarea
        id="edit-{reminder.id}"
        class="field"
        rows="2"
        maxlength={TITLE_MAX * 2}
        bind:value={title}
        aria-invalid={editError ? 'true' : undefined}
        onkeydown={(event) => {
          if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
            event.preventDefault()
            void save()
          }
        }}></textarea>
      {#if editError}<p class="preview error">{editError}</p>{/if}
      <WhenField
        id="edit-when-{reminder.id}"
        value={whenText}
        parsed={whenParsed}
        {now}
        oninput={(value) => (whenText = value)}
        onenter={() => void save()}
      />
      <RepeatField id="edit-repeat-{reminder.id}" bind:every bind:interval />
      <label class="visually-hidden" for="edit-notes-{reminder.id}">Notes</label>
      <textarea
        id="edit-notes-{reminder.id}"
        class="field"
        rows="2"
        placeholder="Notes"
        bind:value={notes}></textarea>
      <div class="buttons">
        <button type="button" class="button small" onclick={close}>Cancel</button>
        <button type="submit" class="button small primary">Save</button>
      </div>
    </form>
  {/if}
</li>

<style>
  .row {
    padding: var(--space-2) var(--space-1) var(--space-2) var(--space-3);
    border-radius: var(--radius);
    transition: background var(--dur-fast) var(--ease-out);
  }
  .row:hover,
  .row:focus-within {
    background: var(--color-surface);
  }
  .row.highlighted {
    background: var(--color-selection);
  }
  .line {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
  .text {
    display: grid;
    flex: 1;
    min-width: 0;
  }
  .title {
    display: -webkit-box;
    overflow: hidden;
    font-weight: 600;
    overflow-wrap: anywhere;
    white-space: pre-line;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0 var(--space-2);
  }
  .meta.overdue {
    color: var(--color-accent-text);
  }
  .tag {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--color-text-muted);
  }
  .actions {
    display: flex;
    flex: none;
  }
  .actions .button.icon {
    width: 28px;
  }
  .due {
    margin-top: var(--space-1);
  }
  .due .button {
    gap: var(--space-1);
  }
  .panel {
    display: grid;
    gap: var(--space-2);
    margin: var(--space-2) var(--space-2) 0 0;
  }
  .choices,
  .custom,
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
  }
  .custom .field {
    flex: 1;
  }
  .buttons {
    justify-content: flex-end;
  }
  textarea.field {
    height: auto;
    padding: 6px var(--space-2);
    resize: vertical;
  }
  .preview {
    margin: 0;
    font-size: 12px;
    color: var(--color-text-muted);
  }
</style>
