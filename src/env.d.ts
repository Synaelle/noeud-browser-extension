// SPDX-License-Identifier: GPL-3.0-or-later

/** The browser this build is for, set by vite.config.ts. */
declare const __BROWSER__: 'chromium' | 'firefox'

declare module 'virtual:icons' {
  /** Inner svg markup of each icon, see vite.config.ts. */
  export const lucide: Record<import('./ui/iconNames').IconName, string>
}
