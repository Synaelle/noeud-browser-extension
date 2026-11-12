<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The options page: connect a Noeud server, see how the sync stands. -->
<script lang="ts">
  import { chooseDelay, DEFAULT_DELAY, delayChoices, loadDelay, readDelay } from '../lib/delay'
  import { chooseClock, loadClock, type Clock } from '../lib/format'
  import { durationLabel } from '../lib/usage'
  import { send } from '../lib/messages'
  import { originPattern, Offline, request } from '../lib/sync'
  import Bow from '../ui/Bow.svelte'
  import Icon from '../ui/Icon.svelte'
  import { clock, liveState } from '../ui/live.svelte'
  import { syncSummary } from '../ui/syncText'
  import { chooseTheme, loadTheme, type Theme } from '../ui/theme'

  const live = liveState()
  const time = clock()

  let url = $state('')
  let token = $state('')
  let busy = $state(false)
  let error = $state<string | null>(null)
  let theme = $state<Theme>(document.documentElement.dataset.theme === 'light' ? 'light' : 'dark')
  void loadTheme().then((stored) => (theme = stored))

  const themes: { value: Theme; label: string }[] = [
    { value: 'dark', label: 'Dark' },
    { value: 'light', label: 'Light' },
  ]

  let clockChoice = $state<Clock>('24h')
  void loadClock().then((stored) => (clockChoice = stored))

  const clocks: { value: Clock; label: string; hint: string }[] = [
    { value: '24h', label: '24-hour', hint: '18:30' },
    { value: '12h', label: '12-hour', hint: '6:30 PM' },
  ]

  let delay = $state(DEFAULT_DELAY)
  let custom = $state('')
  let customChosen = $state(false)
  void loadDelay().then((stored) => {
    delay = stored
    if (!delayChoices.includes(stored)) {
      custom = stored
      customChosen = true
    }
  })
  const customRead = $derived(readDelay(custom))

  function choosePreset(choice: string) {
    customChosen = false
    delay = choice
    void chooseDelay(choice)
  }

  /** Custom is used once it reads as a length; until then the last good one stays. */
  function useCustom() {
    customChosen = true
    if ('delay' in customRead) {
      delay = customRead.delay
      void chooseDelay(customRead.delay)
    }
  }

  const server = $derived(live.current?.server ?? null)
  const summary = $derived(live.current ? syncSummary(live.current, time.now) : null)
  const plainHttp = $derived(/^http:\/\//i.test(url.trim()) && !isLocal(url.trim()))

  function isLocal(address: string): boolean {
    try {
      return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(address).hostname)
    } catch (reason) {
      if (reason instanceof TypeError) return false
      throw reason
    }
  }

  /** The address as typed, or null when it is not an http(s) URL. */
  function normalized(address: string): string | null {
    try {
      const parsed = new URL(address.trim())
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return null
      return (parsed.origin + parsed.pathname).replace(/\/+$/, '')
    } catch (reason) {
      if (reason instanceof TypeError) return null
      throw reason
    }
  }

  async function connect(event: SubmitEvent) {
    event.preventDefault()
    error = null
    const address = normalized(url)
    if (address === null) {
      error = 'Enter the server address, like https://example.com/noeud.'
      return
    }
    if (!token.trim()) {
      error = 'Paste the token made with noeud-server token create.'
      return
    }
    // asked first thing, while the click still counts as the user's
    const allowed = chrome.permissions.request({ origins: [originPattern(address)] })
    busy = true
    try {
      if (!(await allowed)) {
        error = 'Noeud needs permission to reach this server to sync with it.'
        return
      }
      const server = { url: address, token: token.trim() }
      const answer = await request(server, 'GET', '/v1/token')
      if (answer.status === 401) {
        error = 'The server refused this token.'
        return
      }
      const name = (answer.data as { name?: unknown } | null)?.name
      if (answer.status !== 200 || typeof name !== 'string') {
        error = `This does not look like a Noeud server (it answered ${answer.status}).`
        return
      }
      await send({ type: 'connect', server: { ...server, name } })
      url = ''
      token = ''
    } catch (reason) {
      error =
        reason instanceof Offline
          ? 'The server could not be reached. Check the address.'
          : reason instanceof Error
            ? reason.message
            : String(reason)
    } finally {
      busy = false
    }
  }

  async function run(action: () => Promise<unknown>) {
    error = null
    busy = true
    try {
      await action()
    } catch (reason) {
      error = reason instanceof Error ? reason.message : String(reason)
    } finally {
      busy = false
    }
  }

  function disconnect(address: string) {
    return run(async () => {
      await send({ type: 'disconnect' })
      await chrome.permissions.remove({ origins: [originPattern(address)] })
    })
  }
</script>

<div class="page">
  <header>
    <Bow size={88} />
    <h1 class="visually-hidden">Noeud settings</h1>
  </header>

  <section aria-labelledby="server-heading">
    <h2 id="server-heading">Server</h2>
    {#if live.current === null}
      <p class="muted" aria-live="polite">Loading…</p>
    {:else if server}
      <p>
        Syncing with <strong class="address">{server.url}</strong>
        <span class="muted">as {server.name}</span>.
      </p>
      {#if summary}
        <p class="status {summary.tone}" role="status">
          <Icon
            name={summary.tone === 'offline'
              ? 'cloud-off'
              : summary.tone === 'error'
                ? 'circle-alert'
                : 'cloud'}
          />
          <span>{summary.text}</span>
        </p>
      {/if}
      <div class="buttons">
        <button
          type="button"
          class="button primary"
          disabled={busy}
          onclick={() => run(() => send({ type: 'sync' }))}
        >
          <Icon name="refresh-cw" />
          {busy ? 'Syncing…' : 'Sync now'}
        </button>
        <button type="button" class="button" disabled={busy} onclick={() => disconnect(server.url)}>
          Disconnect
        </button>
      </div>
      <p class="meta">
        Disconnecting keeps every reminder in this browser. Connecting again sends them back.
      </p>
    {:else}
      <p class="muted">
        Noeud works on its own and keeps your reminders in this browser. Add your Noeud server to
        share them with your other devices and apps.
      </p>
      <form onsubmit={connect} novalidate>
        <label for="url">Address</label>
        <input
          id="url"
          class="field"
          type="url"
          bind:value={url}
          placeholder="https://example.com/noeud"
          autocomplete="url"
          spellcheck="false"
        />
        {#if plainHttp}
          <p class="meta warning">Over plain http the token travels unencrypted.</p>
        {/if}
        <label for="token">Token</label>
        <input
          id="token"
          class="field"
          type="password"
          bind:value={token}
          placeholder="noeud_…"
          autocomplete="off"
          spellcheck="false"
        />
        <p class="meta">
          Make one on the server with <code>noeud-server token create browser</code>.
        </p>
        <div class="buttons">
          <button type="submit" class="button primary" disabled={busy}>
            {busy ? 'Connecting…' : 'Connect'}
          </button>
        </div>
      </form>
    {/if}
    {#if error}
      <p class="error" role="alert">{error}</p>
    {/if}
  </section>

  <section aria-labelledby="appearance-heading">
    <h2 id="appearance-heading">Appearance</h2>
    <fieldset class="choices">
      <legend class="visually-hidden">Theme</legend>
      {#each themes as option (option.value)}
        <label class="choice">
          <input
            type="radio"
            name="theme"
            value={option.value}
            bind:group={theme}
            onchange={() => chooseTheme(option.value)}
          />
          <span class="choice-label">{option.label}</span>
        </label>
      {/each}
    </fieldset>
  </section>

  <section aria-labelledby="time-heading">
    <h2 id="time-heading">Time</h2>
    <fieldset class="choices">
      <legend class="visually-hidden">Clock</legend>
      {#each clocks as option (option.value)}
        <label class="choice">
          <input
            type="radio"
            name="clock"
            value={option.value}
            bind:group={clockChoice}
            onchange={() => chooseClock(option.value)}
          />
          <span class="choice-label">{option.label}</span>
          <span class="meta">{option.hint}</span>
        </label>
      {/each}
    </fieldset>
  </section>

  <section aria-labelledby="delay-heading">
    <h2 id="delay-heading">Delay</h2>
    <p class="meta">How long Delay puts a reminder off, from a notification or the popup.</p>
    <fieldset class="choices">
      <legend class="visually-hidden">Delay length</legend>
      {#each delayChoices as choice (choice)}
        <label class="choice">
          <input
            type="radio"
            name="delay"
            value={choice}
            checked={!customChosen && delay === choice}
            onchange={() => choosePreset(choice)}
          />
          <span class="choice-label">{durationLabel(choice)}</span>
        </label>
      {/each}
      <div class="choice">
        <input
          id="delay-custom-choice"
          type="radio"
          name="delay"
          value="custom"
          checked={customChosen}
          onchange={useCustom}
        />
        <label class="custom-label" for="delay-custom-choice">Custom</label>
        <input
          id="delay-custom"
          class="field custom"
          aria-label="Custom delay"
          placeholder="1d12h"
          autocomplete="off"
          spellcheck="false"
          aria-describedby="delay-custom-words"
          aria-invalid={custom.trim() && 'error' in customRead ? 'true' : undefined}
          bind:value={custom}
          oninput={useCustom}
        />
        <span id="delay-custom-words" class="meta custom-words" class:error={'error' in customRead}>
          {#if custom.trim()}
            {'delay' in customRead ? durationLabel(customRead.delay) : customRead.error}
          {/if}
        </span>
      </div>
    </fieldset>
  </section>

  <section aria-labelledby="about-heading">
    <h2 id="about-heading">About</h2>
    <p class="meta">
      Reminders that came due while the browser was closed notify you when it starts again. Hanken
      Grotesk is under the <a href="/fonts/HankenGrotesk-OFL.txt">SIL Open Font License</a>, Lucide
      icons under the ISC license.
    </p>
  </section>
</div>

<style>
  .page {
    max-width: 560px;
    margin: 0 auto;
    padding: var(--space-4);
  }
  header {
    display: flex;
    justify-content: center;
    margin-bottom: var(--space-3);
  }
  section {
    padding: var(--space-3) 0;
    border-top: 1px solid var(--color-border);
  }
  h2 {
    margin: 0 0 var(--space-2);
    font-size: 14px;
    font-weight: 600;
  }
  p {
    margin: 0 0 var(--space-2);
  }
  .address {
    font-weight: 600;
    overflow-wrap: anywhere;
  }
  form {
    display: grid;
    gap: var(--space-2);
  }
  label {
    margin-top: var(--space-2);
    font-weight: 600;
  }
  form .meta {
    margin: 0;
  }
  .buttons {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin: var(--space-3) 0;
  }
  .status {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }
  .status :global(svg) {
    margin-top: 2px;
  }
  .status.ok :global(svg) {
    color: var(--color-success);
  }
  .status.offline :global(svg),
  .warning {
    color: var(--color-warning);
  }
  .status.error {
    color: var(--color-danger);
  }
  code {
    font-size: 12px;
  }
  .choices {
    display: grid;
    gap: 2px;
    margin: 0 calc(var(--space-3) * -1);
    padding: 0;
    border: 0;
  }
  .choice {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin: 0;
    padding: var(--space-1) var(--space-3);
    border-radius: var(--radius);
    font-weight: 400;
    cursor: pointer;
    transition: background var(--dur-fast) var(--ease-out);
  }
  .choice:hover,
  .choice:has(:checked) {
    background: var(--color-surface);
  }
  .choice input {
    margin: 0;
    accent-color: var(--color-accent);
  }
  .choice-label {
    flex: 1;
  }
  .custom-label {
    margin: 0;
    font-weight: 400;
    cursor: pointer;
  }
  .field.custom {
    width: 96px;
    height: 28px;
  }
  .custom-words {
    flex: 1;
    min-width: 0;
  }
  a {
    color: var(--color-accent-text);
  }
</style>
