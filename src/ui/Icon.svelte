<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- A Lucide icon. Decorative unless `label` is given. -->
<script lang="ts">
  import { lucide } from 'virtual:icons'
  import type { IconName } from './iconNames'

  let { name, size = 16, label }: { name: IconName; size?: number; label?: string } = $props()
</script>

<svg
  width={size}
  height={size}
  viewBox="0 0 24 24"
  fill="none"
  stroke="currentColor"
  stroke-width="1.75"
  stroke-linecap="round"
  stroke-linejoin="round"
  role={label ? 'img' : undefined}
  aria-label={label}
  aria-hidden={label ? undefined : 'true'}
>
  <!-- the markup comes from the bundled Lucide files, never from user data -->
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html lucide[name]}
</svg>

<style>
  svg {
    flex: none;
  }
</style>
