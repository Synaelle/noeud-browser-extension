// SPDX-License-Identifier: GPL-3.0-or-later

import { mount } from 'svelte'
import '../ui/theme.css'
import { loadClock } from '../lib/format'
import { loadTheme } from '../ui/theme'
import Popup from './Popup.svelte'

void loadTheme()
// every time on the page is written in the chosen clock, so it is read first
void loadClock().then(() => mount(Popup, { target: document.getElementById('app') as HTMLElement }))
