// SPDX-License-Identifier: GPL-3.0-or-later

import { icons } from './src/brand.ts'

export type Browser = 'chromium' | 'firefox'

/** The extension manifest, one source for both browsers. */
export function manifest(browser: Browser, version: string) {
  return {
    manifest_version: 3,
    name: 'Noeud',
    version,
    description:
      'Reminders that notify you in the browser, kept locally or on your own Noeud server.',
    icons,
    action: { default_popup: 'popup.html', default_icon: icons, default_title: 'Noeud' },
    options_ui: { page: 'options.html', open_in_tab: true },
    permissions: ['alarms', 'contextMenus', 'notifications', 'storage'],
    commands: {
      _execute_action: { suggested_key: { default: 'Alt+Shift+R' }, description: 'Open Noeud' },
    },
    // the server's origin is asked for when one is added in the options
    optional_host_permissions: ['*://*/*'],
    ...(browser === 'chromium'
      ? {
          background: { service_worker: 'background.js', type: 'module' },
          // Temporal shipped in Chrome 144
          minimum_chrome_version: '144',
        }
      : {
          background: { scripts: ['background.js'], type: 'module' },
          browser_specific_settings: {
            gecko: {
              id: 'noeud@synaelle',
              strict_min_version: '140.0',
              data_collection_permissions: { required: ['none'] },
            },
          },
        }),
  }
}
