<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- Repeat: never, or every n days, weeks, months or years. -->
<script lang="ts">
  import type { RepeatUnit } from '../lib/reminder'

  let {
    id,
    every = $bindable(),
    interval = $bindable(),
  }: { id: string; every: RepeatUnit | ''; interval: number } = $props()
</script>

<div class="repeat">
  <label for="{id}-every">Repeat</label>
  <select id="{id}-every" class="field" bind:value={every}>
    <option value="">Never</option>
    <option value="day">Daily</option>
    <option value="week">Weekly</option>
    <option value="month">Monthly</option>
    <option value="year">Yearly</option>
  </select>
  {#if every}
    <label for="{id}-interval">every</label>
    <input
      id="{id}-interval"
      class="field interval"
      type="number"
      min="1"
      max="1000"
      bind:value={interval}
    />
    <span class="muted">{interval === 1 ? every : `${every}s`}</span>
  {/if}
</div>

<style>
  .repeat {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
  }
  label {
    font-size: 13px;
  }
  .interval {
    width: 64px;
  }
</style>
