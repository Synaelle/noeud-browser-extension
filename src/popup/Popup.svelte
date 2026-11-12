<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The toolbar popup: add a reminder, then what is overdue, due today, later and done. -->
<script lang="ts">
  import { icons } from '../brand'
  import { localZone } from '../lib/format'
  import { send, type Message } from '../lib/messages'
  import { notifyAt, type Reminder } from '../lib/reminder'
  import Icon from '../ui/Icon.svelte'
  import { clock, liveState } from '../ui/live.svelte'
  import { syncSummary } from '../ui/syncText'
  import AddForm from './AddForm.svelte'
  import Row from './Row.svelte'

  const live = liveState()
  const time = clock()
  const UNDO_MS = 6000

  let error = $state<string | null>(null)
  let showDone = $state(false)
  let highlighted = $state(location.hash.slice(1))
  let notice = $state<{ text: string; undo: Message } | null>(null)
  let noticeTimer: ReturnType<typeof setTimeout> | undefined

  addEventListener('hashchange', () => (highlighted = location.hash.slice(1)))

  const endOfToday = $derived(
    Temporal.Instant.fromEpochMilliseconds(time.now)
      .toZonedDateTimeISO(localZone())
      .toPlainDate()
      .add({ days: 1 })
      .toZonedDateTime(localZone()).epochMilliseconds,
  )
  const reminders = $derived(
    Object.values(live.current?.reminders ?? {}).filter((reminder) => !reminder.deleted),
  )
  const open = $derived(
    reminders
      .filter((reminder) => reminder.done_at === null)
      .sort((a, b) => (notifyAt(a) ?? 0) - (notifyAt(b) ?? 0)),
  )
  const groups = $derived([
    {
      id: 'overdue',
      label: 'Overdue',
      items: open.filter((r) => (notifyAt(r) ?? 0) <= time.now),
    },
    {
      id: 'today',
      label: 'Today',
      items: open.filter((r) => (notifyAt(r) ?? 0) > time.now && (notifyAt(r) ?? 0) < endOfToday),
    },
    { id: 'later', label: 'Later', items: open.filter((r) => (notifyAt(r) ?? 0) >= endOfToday) },
  ])
  const done = $derived(
    reminders
      .filter((reminder) => reminder.done_at !== null)
      .sort((a, b) => Date.parse(b.done_at ?? '') - Date.parse(a.done_at ?? '')),
  )
  const sync = $derived(live.current?.server ? syncSummary(live.current, time.now) : null)
  const syncIcon = $derived(
    sync?.tone === 'offline' ? 'cloud-off' : sync?.tone === 'error' ? 'circle-alert' : 'cloud',
  )

  async function act(message: Message): Promise<boolean> {
    error = null
    try {
      await send(message)
      return true
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
      return false
    }
  }

  function announce(text: string, undo: Message) {
    clearTimeout(noticeTimer)
    notice = { text, undo }
    noticeTimer = setTimeout(() => (notice = null), UNDO_MS)
  }

  async function markDone(reminder: Reminder) {
    if (!(await act({ type: 'done', id: reminder.id }))) return
    const { due_at, repeat, snoozed_until, done_at } = reminder
    announce(
      reminder.repeat ? `Done until next time: ${reminder.title}` : `Done: ${reminder.title}`,
      {
        type: 'edit',
        id: reminder.id,
        changes: { due_at, repeat, snoozed_until, done_at },
      },
    )
  }

  async function remove(reminder: Reminder) {
    if (!(await act({ type: 'delete', id: reminder.id }))) return
    announce(`Deleted: ${reminder.title}`, { type: 'restore', reminder: $state.snapshot(reminder) })
  }

  async function undo() {
    if (!notice) return
    const { undo: message } = notice
    clearTimeout(noticeTimer)
    notice = null
    await act(message)
    document.getElementById('add-title')?.focus()
  }
</script>

<header>
  <img src={'/' + icons[32]} width="16" height="16" alt="" />
  <h1>Noeud</h1>
  <span class="spacer"></span>
  {#if sync}
    <button
      type="button"
      class="button icon sync {sync.tone}"
      title={sync.text}
      aria-label={sync.text}
      onclick={() => chrome.runtime.openOptionsPage()}
    >
      <Icon name={syncIcon} />
    </button>
  {/if}
  <button
    type="button"
    class="button icon"
    title="Options"
    aria-label="Options"
    onclick={() => chrome.runtime.openOptionsPage()}
  >
    <Icon name="settings" />
  </button>
</header>

<AddForm now={time.now} times={live.current?.times ?? []} />

{#if error}
  <p class="banner error" role="alert">{error}</p>
{/if}

<main>
  {#if live.current === null}
    <p class="state muted" aria-live="polite">Loading reminders…</p>
  {:else if reminders.length === 0}
    <div class="state">
      <p>Nothing to remember yet.</p>
      <p class="meta">
        Write what to remember, then when: 2h, 8h30 or tomorrow 9:00. You are notified even if the
        browser was closed.
      </p>
    </div>
  {:else}
    {#each groups as group (group.id)}
      {#if group.items.length > 0}
        <section aria-labelledby="group-{group.id}">
          <h2 id="group-{group.id}" class="caption" class:overdue={group.id === 'overdue'}>
            {group.label} <span class="count">{group.items.length}</span>
          </h2>
          <ul>
            {#each group.items as reminder (reminder.id)}
              <Row
                {reminder}
                now={time.now}
                times={live.current?.times ?? []}
                highlighted={reminder.id === highlighted}
                onaction={act}
                ondone={markDone}
                ondelete={remove}
              />
            {/each}
          </ul>
        </section>
      {/if}
    {/each}
    {#if open.length === 0}
      <p class="state muted">Everything is done.</p>
    {/if}
    {#if done.length > 0}
      <section>
        <h2 class="caption">
          <button
            type="button"
            class="toggle"
            aria-expanded={showDone}
            onclick={() => (showDone = !showDone)}
          >
            <span class="chevron" class:open={showDone}><Icon name="chevron-down" size={14} /></span
            >
            Done <span class="count">{done.length}</span>
          </button>
        </h2>
        {#if showDone}
          <ul>
            {#each done as reminder (reminder.id)}
              <Row
                {reminder}
                now={time.now}
                times={live.current?.times ?? []}
                highlighted={reminder.id === highlighted}
                onaction={act}
                ondone={markDone}
                ondelete={remove}
              />
            {/each}
          </ul>
        {/if}
      </section>
    {/if}
  {/if}
</main>

<div class="notice-area" role="status">
  {#if notice}
    <div class="notice">
      <span class="notice-text">{notice.text}</span>
      <button type="button" class="button small" onclick={undo}>Undo</button>
    </div>
  {/if}
</div>

<style>
  :global(body) {
    width: 360px;
    min-height: 360px;
  }

  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    height: 44px;
    padding: 0 var(--space-2) 0 var(--space-3);
    border-bottom: 1px solid var(--color-border);
  }
  h1 {
    margin: 0;
    font-size: 14px;
    font-weight: 600;
  }
  .spacer {
    flex: 1;
  }
  .sync.ok {
    color: var(--color-success);
  }
  .sync.offline {
    color: var(--color-warning);
  }
  .sync.error {
    color: var(--color-danger);
  }
  .banner {
    margin: 0;
    padding: var(--space-2) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    background: var(--color-surface);
  }

  main {
    padding: var(--space-2) var(--space-1) 56px;
  }
  .state {
    margin: 0;
    padding: var(--space-5) var(--space-3);
    text-align: center;
  }
  .state p {
    margin: 0 0 var(--space-1);
  }
  ul {
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .caption {
    margin: var(--space-2) var(--space-2) var(--space-1);
    font-size: 12px;
    font-weight: 600;
    color: var(--color-text-muted);
  }
  .caption.overdue {
    color: var(--color-accent-text);
  }
  .count {
    margin-left: var(--space-1);
    font-weight: 400;
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    margin: 0 calc(var(--space-1) * -1);
    padding: var(--space-1);
    border: 0;
    border-radius: var(--radius);
    background: none;
    font-weight: 600;
    cursor: pointer;
  }
  .toggle:hover {
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

  .notice-area {
    position: fixed;
    right: var(--space-2);
    bottom: var(--space-2);
    left: var(--space-2);
  }
  .notice {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-1) var(--space-1) var(--space-1) var(--space-3);
    border: 1px solid var(--color-border-strong);
    border-radius: var(--radius);
    background: var(--color-surface-2);
    box-shadow: var(--shadow-popover);
  }
  .notice-text {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
