// SPDX-License-Identifier: GPL-3.0-or-later

// How long "Delay" puts a reminder off, from a notification or the popup. Chosen in the options,
// written like a duration in When ("3h", "1d12h") and stored in its shortest form.

import { durationLabel } from './usage'
import { durationText, parseDuration } from './when'

export const DEFAULT_DELAY = '1d'
/** The lengths the options page offers before a custom one. */
export const delayChoices = ['1h', '3h', '1d', '1w']

/** A typed length as it is stored ("36h" is "1d12h"), or why it cannot be one. */
export function readDelay(text: string): { delay: string; ms: number } | { error: string } {
  const parsed = parseDuration(text)
  if (parsed === null) return { error: 'Enter a length like 2h or 1d12h' }
  if ('error' in parsed) return parsed
  return { delay: durationText(parsed.ms), ms: parsed.ms }
}

function delayMs(delay: string): number {
  const read = readDelay(delay)
  return 'ms' in read ? read.ms : 0
}

/** The stored length, 24 hours when there is none or it cannot be read. */
export async function loadDelay(): Promise<string> {
  const { delay } = await chrome.storage.local.get('delay')
  const read = typeof delay === 'string' ? readDelay(delay) : null
  return read && 'delay' in read ? read.delay : DEFAULT_DELAY
}

export async function chooseDelay(delay: string): Promise<void> {
  const read = readDelay(delay)
  if ('error' in read) throw new Error(read.error)
  await chrome.storage.local.set({ delay: read.delay })
}

/** When a reminder delayed now comes back. */
export function delayedUntil(delay: string, now: number): number {
  return now + delayMs(delay)
}

/** "Delay 24 hours", "Delay 3 hours", "Delay 1 week", "Delay 36 hours". */
export function delayTitle(delay: string): string {
  return `Delay ${durationLabel(delay)}`
}
