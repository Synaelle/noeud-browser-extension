// SPDX-License-Identifier: GPL-3.0-or-later

// The part of the extension API this extension uses. Chromium and Firefox both
// answer these with promises in Manifest V3.

declare namespace chrome {
  interface Event<T extends (...args: never[]) => unknown> {
    addListener(callback: T): void
    removeListener(callback: T): void
  }

  namespace storage {
    interface StorageChange {
      oldValue?: unknown
      newValue?: unknown
    }
    const local: {
      get(keys: string | string[] | null): Promise<Record<string, unknown>>
      set(items: Record<string, unknown>): Promise<void>
      remove(keys: string | string[]): Promise<void>
    }
    /** Kept while the browser runs, gone after a restart. */
    const session: typeof local
    const onChanged: Event<(changes: Record<string, StorageChange>, areaName: string) => void>
  }

  namespace alarms {
    interface Alarm {
      name: string
      scheduledTime: number
      periodInMinutes?: number
    }
    function create(
      name: string,
      info: { when?: number; delayInMinutes?: number; periodInMinutes?: number },
    ): Promise<void>
    function clear(name: string): Promise<boolean>
    function getAll(): Promise<Alarm[]>
    const onAlarm: Event<(alarm: Alarm) => void>
  }

  namespace notifications {
    interface Options {
      type: 'basic'
      iconUrl: string
      title: string
      message: string
      buttons?: { title: string }[]
      requireInteraction?: boolean
      priority?: number
    }
    function create(id: string, options: Options): Promise<string>
    function clear(id: string): Promise<boolean>
    function getAll(): Promise<Record<string, unknown>>
    const onClicked: Event<(id: string) => void>
    const onButtonClicked: Event<(id: string, index: number) => void>
  }

  namespace runtime {
    const onStartup: Event<() => void>
    const onInstalled: Event<(details: { reason: string }) => void>
    const onMessage: Event<
      (message: unknown, sender: unknown, sendResponse: (response: unknown) => void) => boolean
    >
    function sendMessage(message: unknown): Promise<unknown>
    function getURL(path: string): string
    function openOptionsPage(): Promise<void>
  }

  namespace permissions {
    interface Permissions {
      origins: string[]
    }
    function request(permissions: Permissions): Promise<boolean>
    function contains(permissions: Permissions): Promise<boolean>
    function remove(permissions: Permissions): Promise<boolean>
  }

  namespace windows {
    function create(info: {
      url: string
      type: 'popup'
      width: number
      height: number
    }): Promise<unknown>
  }
}
