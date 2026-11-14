# PVFX Foundry

Forty-four original 96×96 pixel-art visual effects for combat, elemental,
defensive, support, status, portal, beam-lifecycle, water-interaction, and
environmental gameplay. Every effect is a transparent animation authored and
deterministically rendered with Pixel VFX Studio.

You do not need Pixel VFX Studio to use this pack.

Version 0.10 adds Hush Mechanics: Hush Lock, Echo Shuttle, and Resonant Break.
Silence an area, probe a direction with a reflected sound front, and release
stored pressure. All forty-one earlier effects remain included.

## What is included

- 44 effects at 20 FPS, including twelve seamless loops.
- 88 transparent PNG sprite sheets: one fixed grid and one trimmed packed sheet
  per effect.
- Exact JSON metadata for frame order, timing, pivots, markers, placements, and
  canonical per-frame hashes.
- A pack index, checksums, provenance, and import documentation.

The visual download contains sprite sheets only. It does not include animation
files, frame sequences, project source, engine plugins, or software binaries.

## Fastest import

Open an effect's `grid/sprite-sheet.png` and slice it into 96×96 cells using
five columns. Read frames left-to-right, top-to-bottom, and stop at the frame
count in `pack.json` or the adjacent manifest. Every current frame lasts 50 ms.

For smaller textures and exact trimmed pivots, use the corresponding `packed`
sheet and follow its manifest placements.

See `IMPORTING.md` for formulas and `FORMAT.md` for the stable pack contract.

## License

The rendered sprite sheets and bundled metadata/documentation are dedicated to
the public domain under CC0 1.0 Universal. Attribution is appreciated but not
required. A suggested credit is:

> VFX from PVFX Foundry by Pixel VFX Studio

The CC0 dedication does not apply to Pixel VFX Studio software, project source,
source assets, repository content, or product marks; none of those are included
in this download. See `LICENSE.txt` for the exact scope and legal text.

## Feedback

Tell us which effect family should come next on the pack's itch.io page. Good
next lanes include directional sets, reactive terrain, interface feedback, and
companion impact variants.
