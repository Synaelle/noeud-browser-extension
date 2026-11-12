// SPDX-License-Identifier: GPL-3.0-or-later

import { mount } from 'svelte'
import '../ui/theme.css'
import { loadTheme } from '../ui/theme'
import Popup from './Popup.svelte'

void loadTheme()
mount(Popup, { target: document.getElementById('app') as HTMLElement })
