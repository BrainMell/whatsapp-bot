# Importing PVFX Foundry 1.0

Every effect lives at `effects/<family>/<effect>/<tier>/<layout>/`, where tier
is `lit` or `strict` and layout is `grid` or `packed`. Each holds
`sprite-sheet.png` and `manifest.json`.

## Grid sheets

Grid sheets need only the effect's size and frame count.

- Cell size: the effect's canvas, `source_size` in the manifest (`size` in
  `pack.json`). Sizes differ between effects.
- Columns: 8.
- Order: row-major, starting at frame 0.
- Filtering: nearest-neighbour. Wrapping: clamp. Background: transparent RGBA.

For zero-based frame `n` and a `w`×`h` canvas:

```text
x = (n % 8) * w
y = floor(n / 8) * h
```

The final row may contain transparent unused cells. Stop at the declared frame
count; do not infer it from the sheet dimensions. The anchor point inside each
cell is `pivot` in the manifest.

## Packed sheets

Packed sheets trim every frame and place it with one pixel of extrusion plus
one pixel of transparent padding. They require the manifest.

For each manifest frame, read `sheet.x`, `sheet.y`, `sheet.width`, and
`sheet.height`. The pivot in sheet pixels is:

```text
[sheet.x, sheet.y] + trimmed_pivot * sheet.scale
```

A trimmed pivot may fall outside the cropped frame; that is valid and keeps the
effect aligned to its gameplay anchor. A frame with nothing visible has
`visible_bounds: null` and a 1×1 transparent placement; show nothing for its
duration.

## Timing and loops

Every frame records its duration as exact rational milliseconds,
`numerator_ms / denominator`. Durations are constant within an effect and
differ between effects; `frame_ms` in `pack.json` gives the value. Read
`loop_mode` from the manifest, `loop` or `none` (`loop` in `pack.json`): loops
are seamless from the last frame back to the first, and one-shots end on an
empty frame.

## Legacy effects

`legacy/0.10.0/` is the complete 0.10.0 release with its own `README.md`,
`IMPORTING.md`, index and checksums. Its effects use 96×96 cells, five columns
and 50 ms frames.
