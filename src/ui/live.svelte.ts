// SPDX-License-Identifier: GPL-3.0-or-later

import { readState, type State } from '../lib/store'

/** The stored state, kept current as the background changes it. */
export function liveState(): { readonly current: State | null } {
  let state = $state<State | null>(null)
  const load = async () => {
    state = await readState()
  }
  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area === 'local') void load()
  })
  void load()
  return {
    get current() {
      return state
    },
  }
}

/**
 * The time, on the whole second and moved on at each new second, so that previews like "in
 * 8 h 52 min 3 s" count down and the time added is the one shown.
 */
export function clock(): { readonly now: number } {
  const second = () => Math.floor(Date.now() / 1000) * 1000
  let now = $state(second())
  const tick = () => {
    now = second()
    setTimeout(tick, 1000 - (Date.now() % 1000))
  }
  setTimeout(tick, 1000 - (Date.now() % 1000))
  return {
    get now() {
      return now
    },
  }
}
