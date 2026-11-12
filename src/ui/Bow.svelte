<!-- SPDX-License-Identifier: GPL-3.0-or-later -->
<!-- The Noeud bow, drawn as a thread so it can tie itself: the tails rise from their tips to
     the middle, the loops grow out of it, then a small pull. One value drives it all, as with
     Ficelle's knot. With reduced motion it is shown still. -->
<script lang="ts">
  let { size = 112 }: { size?: number } = $props()
</script>

<svg class="bow" width={size} height={size} viewBox="0 0 512 512" aria-hidden="true">
  <g transform="translate(0 -6)">
    <path class="tail" d="M246 248C232 296 210 330 178 360" pathLength="1" />
    <path class="tail" d="M266 248C280 296 302 330 334 360" pathLength="1" />
    <path class="loop" d="M240 230C186 120 40 96 40 200C40 290 160 282 240 230" pathLength="1" />
    <path class="loop" d="M272 230C326 120 472 96 472 200C472 290 352 282 272 230" pathLength="1" />
  </g>
</svg>

<style>
  @property --head {
    syntax: '<number>';
    inherits: true;
    initial-value: 1;
  }
  .bow {
    display: block;
    overflow: visible;
    transform-origin: 50% 50%;
    animation:
      bow-tie 900ms cubic-bezier(0.55, 0.05, 0.3, 1) both,
      bow-pull 240ms cubic-bezier(0.3, 1.6, 0.5, 1) 900ms both;
  }
  path {
    fill: none;
    stroke: var(--color-accent);
    stroke-width: 52;
    stroke-linecap: round;
    stroke-dasharray: 1 2;
  }
  /* the offsets are lengths: with pathLength 1 a px is one unit of the path. A negative
     offset starts the dash at the far end, the tail's tip */
  .tail {
    stroke-dashoffset: calc((clamp(0, var(--head) / 0.3, 1) - 1) * 1px);
  }
  .loop {
    stroke-dashoffset: calc((1 - clamp(0, (var(--head) - 0.3) / 0.7, 1)) * 1px);
  }
  @keyframes bow-tie {
    from {
      --head: 0;
    }
    to {
      --head: 1;
    }
  }
  @keyframes bow-pull {
    from {
      transform: scale(1.06);
    }
    to {
      transform: scale(1);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bow {
      animation: none;
    }
  }
</style>
