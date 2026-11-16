// SPDX-License-Identifier: GPL-3.0-or-later

import { mount } from 'svelte'
import '../ui/theme.css'
import { loadWeekStart } from '../lib/calendar'
import { loadClock } from '../lib/format'
import { loadTheme } from '../ui/theme'
import Options from './Options.svelte'

void loadTheme()
// every time on the page is written in the chosen clock and week, so they are read first
void Promise.all([loadClock(), loadWeekStart()]).then(() =>
  mount(Options, { target: document.getElementById('app') as HTMLElement }),
)
