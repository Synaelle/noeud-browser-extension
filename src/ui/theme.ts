// SPDX-License-Identifier: GPL-3.0-or-later

export type Theme = 'dark' | 'light'

// read by public/theme.js before the first paint
const COPY_KEY = 'noeud-theme'

function apply(theme: Theme): void {
  if (theme === 'light') document.documentElement.dataset.theme = 'light'
  else delete document.documentElement.dataset.theme
  localStorage.setItem(COPY_KEY, theme)
}

/** Applies the stored choice, dark when there is none, and keeps the paint-time copy in step. */
export async function loadTheme(): Promise<Theme> {
  const { theme } = await chrome.storage.local.get('theme')
  const chosen: Theme = theme === 'light' ? 'light' : 'dark'
  apply(chosen)
  return chosen
}

export async function chooseTheme(theme: Theme): Promise<void> {
  apply(theme)
  await chrome.storage.local.set({ theme })
}
