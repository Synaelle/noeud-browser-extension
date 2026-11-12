// SPDX-License-Identifier: GPL-3.0-or-later

import type { State } from '../lib/store'

const relativeFormat = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })

/** "just now", "5 minutes ago", "yesterday". */
export function ago(at: string, now: number): string {
  const seconds = Math.round((Date.parse(at) - now) / 1000)
  if (seconds > -60) return 'just now'
  const minutes = Math.round(seconds / 60)
  if (minutes > -60) return relativeFormat.format(minutes, 'minute')
  const hours = Math.round(minutes / 60)
  if (hours > -24) return relativeFormat.format(hours, 'hour')
  return relativeFormat.format(Math.round(hours / 24), 'day')
}

export type SyncTone = 'ok' | 'offline' | 'error' | 'idle'

/** One sentence on where the sync stands, for the popup badge and the options page. */
export function syncSummary(state: State, now: number): { tone: SyncTone; text: string } {
  const count = Object.keys(state.pending).length
  const waiting =
    count === 0 ? '' : ` ${count} ${count === 1 ? 'change waits' : 'changes wait'} to be sent.`
  const { sync } = state
  const last = sync.ok_at ? ` Last synced ${ago(sync.ok_at, now)}.` : ''
  switch (sync.state) {
    case 'ok':
      return { tone: 'ok', text: `Synced ${ago(sync.ok_at ?? sync.at ?? '', now)}.${waiting}` }
    case 'offline':
      return { tone: 'offline', text: `The server is out of reach.${last}${waiting}` }
    case 'error':
      return { tone: 'error', text: `${sync.message ?? 'The last sync failed.'}${waiting}` }
    default:
      return { tone: 'idle', text: `Not synced yet.${waiting}` }
  }
}
