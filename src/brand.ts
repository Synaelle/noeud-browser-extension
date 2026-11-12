// SPDX-License-Identifier: GPL-3.0-or-later

/** The extension's icons, relative to the extension root. Swap the files to change the mark. */
export const icons = {
  16: 'icons/icon-16.png',
  32: 'icons/icon-32.png',
  48: 'icons/icon-48.png',
  128: 'icons/icon-128.png',
} as const

export const notificationIcon = icons[128]
