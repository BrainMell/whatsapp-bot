# Swapping VFX art (no code changes)

Ultimate animations are built from **layers** (procedural) and **sprite sets** (art). Any procedural layer can be
replaced by a downloaded sprite sheet through `vfx_assets.json` (this folder). The file is re-read automatically.

1. Put the pack's PNGs under `core/rpgasset/vfx/packs/<packname>/` (keep the licence/credit file next to them and
   add a line to `CREDITS.md`).
2. Register a **set** (how to cut the art into frames):

```json
"sets": {
  "slash_a":  { "file": "packs/fx/slash.png", "grid": { "cols": 5, "rows": 2 }, "n": 9, "fps": 18, "smooth": true },
  "flame_b":  { "files": ["packs/fx/f1.png", "packs/fx/f2.png", "packs/fx/f3.png"], "fps": 14 },
  "hit_c":    { "dir": "packs/hit", "prefix": "hit_", "n": 8, "fps": 16 }
}
```
   (`grid` = one sheet, row-major frames; `files` = list of single images; `strip` / `root` / `kdir` / `dir`+`prefix`
   are the older forms used by the built-ins - see `SETS` in `core/rpg/ultimateFx.js`.)
3. **Override** a layer with a set. `layer` replaces it everywhere, `layer@CLASS` only for one class:

```json
"overrides": {
  "slashes":          { "set": "slash_a", "w": 260, "n": 3, "gap": 0.07, "rot": [-0.8, 0.8, 0] },
  "scythe@REAPER":    { "set": "slash_a", "w": 520 },
  "breath":           { "set": "flame_b", "w": 300, "loop": true }
}
```
   Fields: `set`, `w` (px width in the 640x480 video; default taken from the layer), `n` (copies), `gap`, `jit [x,y]`,
   `rot` (number or list), `tint ["#hex", 0-1]`, `alpha`, `add` (additive blend, default true), `loop`, `dur`, `off [x,y]`.
   Position/timing/ground-vs-over depth/AoE fan-out all come from the original layer, so the swap keeps the choreography.
4. Check it: `node scripts/vfx_assets_check.js` (validates files, frame counts, unknown sets, lists which classes use
   each overridable layer), then preview in chat: `.j mod vfx <class> [level] [aoe]`.

**Not overridable** (they change *how the scene is drawn*, not art): `focus`, `vortex`, `bgfill`, `invert`, `lunge`,
`camera`, `hidecaster`, `wash`, `affect`, `hurt`, `hands`.

Overridable layers: slashes, swarm, scythe, robohand, breath, dragon, tether, soulflow, elements, reticle, staff, ripple,
eclipse, rings, pillar, crescent, circle, rift, cracks, vines, gears, blackhole, fall, emit, beam.
Per-class recipes live in `core/rpg/ultimateFxRecipes.js`; layers in `ultimateFxLayers*.js`.
