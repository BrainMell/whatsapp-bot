# Importing PVFX Foundry

## Grid sheets

Grid sheets are designed for engines and tools that only need regular cells.

- Cell size: 96×96 pixels.
- Columns: 5.
- Order: row-major, starting at frame 0.
- Frame duration: 50 ms for v0.10.0.
- Filtering: nearest-neighbor.
- Wrapping: clamp.
- Background: transparent RGBA.

For zero-based frame `n`:

```text
x = (n % 5) * 96
y = floor(n / 5) * 96
width = 96
height = 96
```

The final row may contain transparent unused cells. Stop at the declared frame
count; do not infer it from sheet dimensions.

## Packed sheets

Packed sheets trim every frame and use deterministic placement with one pixel
of extrusion plus one pixel of transparent padding. They require the adjacent
manifest.

For each manifest frame, read `sheet.x`, `sheet.y`, `sheet.width`, and
`sheet.height`. The pivot in sheet pixels is:

```text
[sheet.x, sheet.y] + trimmed_pivot * sheet.scale
```

The original canvas-space pivot remains in `pivot`. A trimmed pivot may fall
outside the cropped frame; that is valid and necessary for stable gameplay
alignment.

## Timing and markers

Every frame records exact rational milliseconds as `numerator_ms / denominator`.
All v0.10.0 sources evaluate to 50 ms per frame, but consumers should read the
manifest so future packs can use authored variable durations.

Read `loop_mode` from each manifest. `Rift Portal`, `Venom Ward`, `Rain Field`,
`Shoreline Foam`, `Dripping Runoff`, `Lattice Beam`, `Counterfall`, `Relay Bough`, and `Echo Shuttle` use
`loop` and have
byte-identical first and final canonical frames for a clean seam. Effects
declaring `none` should stop after their final source frame.

Markers identify useful lifecycle beats such as `launch`, `contact`, `peak`,
`breakup`, and `release`. They are optional gameplay hooks, not extra frames.

## Pixel-perfect playback

- Disable smoothing, mipmapping, and lossy texture compression when crisp
  pixels are required.
- Draw at integer scale and integer positions.
- Preserve straight RGBA transparency.
- Use the manifest's original pivot consistently across frames.
- Treat `pixel_hash` as the identity of decoded canonical RGBA pixels, not of
  the PNG file bytes.

## Impossible Materials gameplay anchors

Cinder Orchid uses pivot (38,78); Rootscript uses (24,73); Ferrospine uses
(48,75). Place these pivots at the intended ground contact. Other new effects
use the actor-centered (48,48) pivot. Packed manifests include trimmed pivots;
do not treat the cropped texture corner as the effect origin.

Markers use zero-based source frames: Foldstep `blink` 8, Mercury Molt
`release` 26, Cinder Orchid `detonation` 15, Suturelight `closure` 24,
Hourglass Splinter `time-release` 14, and Rootscript `snare` 25. Each frame is
50 ms. These are metadata events, not baked gameplay logic. Hourglass Splinter
uses authored partial alpha for glass; retain straight-alpha blending.

## Mechanical engagement

Pawl Snap is a one-shot: play frames 0–19 once, 50 ms each, anchored at (48,52).
Its `engage` event is source frame 6, starting at 300 ms. Drive the lock or trap
state transition from game code; the marker itself performs no gameplay action.
The effect ends transparent. Packed placement and trimmed pivots preserve the
same contact point as the grid edition.

## Borrowed Gravity anchors

Tether Catch is a 28-frame one-shot anchored at (48,48), with `catch` on frame
8 and `draw` on frame 12. Counterfall is a 40-frame seamless loop anchored at
(48,72), with `apex` on frame 10. Mass Release is a 30-frame one-shot anchored
at (48,72), with `release` on frame 7 and ground `impact` on frame 11. All use
50 ms frames. The markers are synchronization hooks; game code owns object
capture, levitation, damage, and physics.

## Signal Orchard anchors

Beacon Seed is a 34-frame one-shot at pivot (48,72): `plant` frame 7 and
`ready` frame 12. Relay Bough is a 40-frame seamless loop at pivot (18,56):
`send` frame 0, `fork` frame 12, `receive-upper` frame 28 and `receive-lower`
frame 31. Harvest Seal is a 36-frame one-shot at pivot (48,50): `collect` frame
12 and `reward` frame 18. Drive gameplay state from those markers; the visual
effects themselves do not place objects, route signals or grant resources.

## Hush Mechanics anchors

Hush Lock is a 36-frame one-shot at pivot (48,48): `silence` frame 10 and
`release` frame 22. Echo Shuttle is a 40-frame seamless loop at pivot (19,48):
`send` frame 3, `reflect` frame 18, and `return` frame 34. Resonant Break is a
34-frame one-shot at pivot (48,48): `break` frame 8 and `echo` frame 14. Each
frame lasts 50 ms. Use these as timing hooks for silence, directional probe,
and stored-sound release; gameplay state remains in the engine.
