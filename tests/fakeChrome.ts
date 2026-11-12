// SPDX-License-Identifier: GPL-3.0-or-later

/** An event that tests can fire. */
class FakeEvent<T extends (...args: never[]) => unknown> {
  listeners: T[] = []
  addListener(callback: T) {
    this.listeners.push(callback)
  }
  removeListener(callback: T) {
    this.listeners = this.listeners.filter((listener) => listener !== callback)
  }
  fire(...args: Parameters<T>) {
    for (const listener of this.listeners) listener(...args)
  }
}

/** The extension API, in memory, installed as the global `chrome`. */
export function installFakeChrome() {
  const storage = new Map<string, unknown>()
  const alarms = new Map<string, chrome.alarms.Alarm>()
  const shown = new Map<string, chrome.notifications.Options>()
  const created: { id: string; options: chrome.notifications.Options }[] = []
  const windows: string[] = []
  const permissions = { granted: true }
  const session = new Map<string, unknown>()
  const onChanged = new FakeEvent<
    (changes: Record<string, chrome.storage.StorageChange>, area: string) => void
  >()

  const fake = {
    storage: {
      local: {
        async get(keys: string | string[] | null) {
          const wanted =
            keys === null ? [...storage.keys()] : typeof keys === 'string' ? [keys] : keys
          return Object.fromEntries(
            wanted
              .filter((key) => storage.has(key))
              .map((key) => [key, structuredClone(storage.get(key))]),
          )
        },
        async set(items: Record<string, unknown>) {
          const changes: Record<string, chrome.storage.StorageChange> = {}
          for (const [key, value] of Object.entries(items)) {
            changes[key] = { oldValue: storage.get(key), newValue: value }
            storage.set(key, structuredClone(value))
          }
          onChanged.fire(changes, 'local')
        },
        async remove(keys: string | string[]) {
          for (const key of typeof keys === 'string' ? [keys] : keys) storage.delete(key)
        },
      },
      session: {
        async get(key: string) {
          return session.has(key) ? { [key]: structuredClone(session.get(key)) } : {}
        },
        async set(items: Record<string, unknown>) {
          for (const [key, value] of Object.entries(items)) session.set(key, structuredClone(value))
        },
        async remove(key: string) {
          session.delete(key)
        },
      },
      onChanged,
    },
    alarms: {
      async create(
        name: string,
        info: { when?: number; delayInMinutes?: number; periodInMinutes?: number },
      ) {
        const delay = info.delayInMinutes ?? info.periodInMinutes ?? 0
        alarms.set(name, {
          name,
          scheduledTime: info.when ?? Date.now() + delay * 60_000,
          periodInMinutes: info.periodInMinutes,
        })
      },
      async clear(name: string) {
        return alarms.delete(name)
      },
      async getAll() {
        return [...alarms.values()]
      },
      onAlarm: new FakeEvent<(alarm: chrome.alarms.Alarm) => void>(),
    },
    notifications: {
      async create(id: string, options: chrome.notifications.Options) {
        shown.set(id, options)
        created.push({ id, options })
        return id
      },
      async clear(id: string) {
        return shown.delete(id)
      },
      async getAll() {
        return Object.fromEntries([...shown.keys()].map((id) => [id, true]))
      },
      onClicked: new FakeEvent<(id: string) => void>(),
      onButtonClicked: new FakeEvent<(id: string, index: number) => void>(),
    },
    runtime: {
      onStartup: new FakeEvent<() => void>(),
      onInstalled: new FakeEvent<(details: { reason: string }) => void>(),
      getURL: (path: string) => `chrome-extension://noeud/${path}`,
    },
    permissions: {
      async contains() {
        return permissions.granted
      },
    },
    windows: {
      async create(info: { url: string }) {
        windows.push(info.url)
      },
    },
  }
  ;(globalThis as unknown as { chrome: unknown }).chrome = fake
  return { storage, alarms, shown, created, windows, permissions, session }
}
