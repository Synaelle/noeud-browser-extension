// SPDX-License-Identifier: GPL-3.0-or-later

import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { svelte } from '@sveltejs/vite-plugin-svelte'
import type { Plugin } from 'vite'
import { defineConfig } from 'vitest/config'
import { manifest, type Browser } from './manifest.ts'
import { iconNames } from './src/ui/iconNames.ts'

const version: string = JSON.parse(readFileSync('package.json', 'utf8')).version

/** Writes manifest.json for the browser being built. */
function manifestFile(browser: Browser): Plugin {
  return {
    name: 'manifest',
    apply: 'build',
    generateBundle() {
      this.emitFile({
        type: 'asset',
        fileName: 'manifest.json',
        source: JSON.stringify(manifest(browser, version), null, 2) + '\n',
      })
    },
  }
}

/** `virtual:icons`, the inner markup of each Lucide icon in iconNames. */
function lucideIcons(): Plugin {
  const id = 'virtual:icons'
  const resolved = '\0' + id
  const require = createRequire(import.meta.url)
  return {
    name: 'lucide-icons',
    resolveId: (source) => (source === id ? resolved : null),
    load(source) {
      if (source !== resolved) return null
      const inner = Object.fromEntries(
        iconNames.map((name) => {
          const svg = readFileSync(require.resolve(`lucide-static/icons/${name}.svg`), 'utf8')
          const body = /<svg[^>]*>([\s\S]*)<\/svg>/.exec(svg)?.[1]
          if (body === undefined) throw new Error(`no svg body in ${name}.svg`)
          return [name, body.trim()]
        }),
      )
      return `export const lucide = ${JSON.stringify(inner)}\n`
    },
  }
}

export default defineConfig(({ mode }) => {
  const browser: Browser = mode === 'firefox' ? 'firefox' : 'chromium'
  return {
    plugins: [svelte(), lucideIcons(), manifestFile(browser)],
    define: { __BROWSER__: JSON.stringify(browser) },
    build: {
      outDir: `dist/${browser}`,
      emptyOutDir: true,
      target: browser === 'firefox' ? 'firefox140' : 'chrome144',
      modulePreload: false,
      rollupOptions: {
        input: {
          popup: fileURLToPath(new URL('popup.html', import.meta.url)),
          options: fileURLToPath(new URL('options.html', import.meta.url)),
          background: fileURLToPath(new URL('src/background/index.ts', import.meta.url)),
        },
        output: {
          // the manifest names the background script, so it keeps a fixed name
          entryFileNames: (chunk) =>
            chunk.name === 'background' ? 'background.js' : 'assets/[name]-[hash].js',
        },
      },
    },
    test: {
      include: ['tests/**/*.test.ts'],
      // Temporal is still behind a flag in node 24
      execArgv: ['--harmony-temporal'],
    },
  }
})
