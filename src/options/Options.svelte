<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The options page: connect a Noeud server, see how the sync stands. -->
<script lang="ts">
  import { icons } from '../brand'
  import { send } from '../lib/messages'
  import { originPattern, Offline, request } from '../lib/sync'
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

  const themes: { value: Theme; label: string; hint: string }[] = [
    { value: 'dark', label: 'Dark', hint: 'The default' },
    { value: 'light', label: 'Light', hint: 'For daytime' },
  ]

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
      error = 'Enter the server address, like https://noeud.example.com.'
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
    <img src={'/' + icons[32]} width="24" height="24" alt="" />
    <h1>Noeud</h1>
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
          placeholder="https://noeud.example.com"
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
          <span class="meta">{option.hint}</span>
        </label>
      {/each}
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
    padding: var(--space-6) var(--space-4);
  }
  header {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-5);
  }
  h1 {
    margin: 0;
    font-size: 20px;
    font-weight: 600;
  }
  section {
    padding: var(--space-4) 0;
    border-top: 1px solid var(--color-border);
  }
  h2 {
    margin: 0 0 var(--space-3);
    font-size: 14px;
    font-weight: 600;
  }
  p {
    margin: 0 0 var(--space-3);
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
    padding: var(--space-2) var(--space-3);
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
  a {
    color: var(--color-accent-text);
  }
</style>
