// SPDX-License-Identifier: GPL-3.0-or-later

/** The Lucide icons the pages use, bundled at build time (lucide-static/icons/<name>.svg). */
export const iconNames = [
  'calendar',
  'check',
  'chevron-down',
  'chevron-left',
  'chevron-right',
  'circle-alert',
  'clock',
  'cloud',
  'cloud-off',
  'pencil',
  'plus',
  'refresh-cw',
  'repeat',
  'rotate-ccw',
  'settings',
  'trash-2',
] as const

export type IconName = (typeof iconNames)[number]
