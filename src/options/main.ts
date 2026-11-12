// SPDX-License-Identifier: GPL-3.0-or-later

import { mount } from 'svelte'
import '../ui/theme.css'
import { loadTheme } from '../ui/theme'
import Options from './Options.svelte'

void loadTheme()
mount(Options, { target: document.getElementById('app') as HTMLElement })
