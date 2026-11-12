<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The toolbar popup: add a reminder, then what is overdue, due today, later and done. -->
<script lang="ts">
  import { icons } from '../brand'
  import { DEFAULT_DELAY, loadDelay } from '../lib/delay'
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
  let delay = $state(DEFAULT_DELAY)
  void loadDelay().then((stored) => (delay = stored))
  const UNDO_MS = 6000

  let error = $state<string | null>(null)
  let showDone = $state(false)
  let highlighted = $state(location.hash.slice(1))
  let notice = $state<{ text: string; undo: Message } | null>(null)
  let syncing = $state(false)
  /** A sync was asked for here, so how it went shows under the header. */
  let synced = $state(false)
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
    syncing
      ? 'refresh-cw'
      : sync?.tone === 'offline'
        ? 'cloud-off'
        : sync?.tone === 'error'
          ? 'circle-alert'
          : sync?.tone === 'ok'
            ? 'cloud-check'
            : 'cloud',
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

  async function syncNow() {
    if (syncing) return
    syncing = true
    try {
      await act({ type: 'sync' })
    } finally {
      syncing = false
      synced = true
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
      class:syncing
      title="Sync now. {sync.text}"
      aria-label="Sync now. {sync.text}"
      aria-busy={syncing}
      onclick={syncNow}
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

{#if sync && synced && !syncing}
  <p class="sync-line {sync.tone}" role="status">{sync.text}</p>
{/if}

<AddForm now={time.now} times={live.current?.times ?? []} />

{#if error}
  <p class="banner error" role="alert">{error}</p>
{/if}

<!-- with no reminders the popup is only the add form, with room under it only for the Undo notice -->
{#if live.current === null || reminders.length > 0 || notice}
  <main>
    {#if live.current === null}
      <p class="state muted" aria-live="polite">Loading reminders…</p>
    {:else if reminders.length > 0}
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
                  {delay}
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
              <span class="chevron" class:open={showDone}
                ><Icon name="chevron-down" size={14} /></span
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
                  {delay}
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
{/if}

<div class="notice-area" role="status">
  {#if notice}
    <div class="notice">
      <span class="notice-text">{notice.text}</span>
      <button type="button" class="button small" onclick={undo}>Undo</button>
    </div>
  {/if}
</div>

<style>
  /* The body scrolls rather than the popup, so a long list's scrollbar takes its room inside the
     360 px. When the popup itself scrolled, its scrollbar hid the right edge of everything. 600 px
     is the tallest a popup gets in Chromium and Firefox. */
  :global(html) {
    overflow: hidden;
  }
  :global(body) {
    width: 360px;
    max-height: 600px;
    overflow-y: auto;
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
    color: var(--color-text);
  }
  .sync.offline {
    color: var(--color-warning);
  }
  .sync.error {
    color: var(--color-danger);
  }
  @media (prefers-reduced-motion: no-preference) {
    .sync.syncing :global(svg) {
      animation: spin 0.9s linear infinite;
    }
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
  }
  .sync-line {
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-bottom: 1px solid var(--color-border);
    font-size: 12px;
    color: var(--color-text-muted);
  }
  .sync-line.offline {
    color: var(--color-warning);
  }
  .sync-line.error {
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

  /* stuck to the bottom of the scrolling body, over the room main keeps free under the list */
  .notice-area {
    position: sticky;
    bottom: 0;
    height: 0;
  }
  .notice {
    position: absolute;
    right: var(--space-2);
    bottom: var(--space-2);
    left: var(--space-2);
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
