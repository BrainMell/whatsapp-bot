# Changelog

## 1.0.0 — 2026-11-03

- A new library: 101 pixel-art effects across 16 families (arcane, explosions,
  fire, holy, ice, impacts, lightning, melee, nature, projectiles, shadow,
  smoke, status, UI, water, wind), 77 one-shots and 24 seamless loops, 1,826
  frames per tier and layout.
- Two style tiers for every effect. `lit` keeps colour plus additive light and
  translucent smoke and glow. `strict` is limited-palette, banded light and
  binary alpha, for engines and styles that need hard pixels.
- Each effect has its own native canvas, from 32×32 to 180×72, and its own
  frame timing, instead of one shared 96×96 cell.
- Every sheet is rendered by the deterministic effect-program runtime, checked
  against recorded goldens, and lint-clean in both tiers.
- The 44 effects from 0.10.0 are kept, unchanged and with their own checksums,
  under `legacy/0.10.0/`. Their effect IDs and pixels have not changed.

Earlier history is in `legacy/0.10.0/CHANGELOG.md`.
