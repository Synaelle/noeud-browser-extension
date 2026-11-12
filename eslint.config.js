// SPDX-License-Identifier: GPL-3.0-or-later

import js from '@eslint/js'
import svelte from 'eslint-plugin-svelte'
import globals from 'globals'
import ts from 'typescript-eslint'

export default ts.config(
  {
    ignores: [
      '**/dist/',
      // local folders kept out of git, whatever their names
      '.*/',
    ],
  },
  js.configs.recommended,
  ...ts.configs.strict,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      globals: { ...globals.browser, chrome: 'readonly', __BROWSER__: 'readonly' },
    },
    rules: {
      // the state is stored as JSON objects keyed by reminder id
      '@typescript-eslint/no-dynamic-delete': 'off',
    },
  },
  {
    files: ['*.config.{js,ts}', 'manifest.ts'],
    languageOptions: { globals: globals.node },
  },
  {
    files: ['**/*.svelte', '**/*.svelte.ts'],
    languageOptions: {
      parserOptions: { parser: ts.parser },
    },
  },
)
