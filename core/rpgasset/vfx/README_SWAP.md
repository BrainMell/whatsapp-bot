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


## Swapping the cinematic intros + arenas (full-screen art)

Every ultimate class opens with a short procedural **intro sequence** (`LAYERS.cinema`, `LAYERS.cosmic` for Mage), and
three skills also swap the **arena** (`world`). Both are drawn in code today; replace either with downloaded art
(an image sequence, a sprite sheet cut with `grid`, or one still image) without touching code:

```json
"sets": {
  "mage_asteroid": { "files": ["mage/a1.png", "mage/a2.png", "mage/a3.png"], "fps": 12 },
  "lava_arena":    { "files": ["worlds/lava.png"] }
},
"overrides": {
  "cosmic@MAGE":    { "set": "mage_asteroid", "loop": false },
  "cinema@REAPER":  { "set": "reaper_cut",    "fit": "cover" },
  "world@lava":     { "set": "lava_arena" }
}
```
* `cinema@CLASS` (or `cosmic@MAGE`) paints the set **full-screen over the battle for the intro's window** (1.4s for the short
  classes, 2.1s for the long ones, ~2.0s Mage), fading in/out. Frames play at the set's `fps`; `loop:false` holds the last
  frame. `fit`: `cover` (default) or `contain`; `alpha` 0-1. The class attack still plays afterwards, so only the intro changes.
* `world@KIND` is painted as the arena **behind the fighters** (kinds that exist: `lava` (Mage), `void` (Kage, Archmage)).
  Same `fps` / `loop` / `fit` / `alpha` fields.
* `node scripts/vfx_assets_check.js` prints the exact keys available (`cinema@...`, `cosmic@...`, `world@...`).

What each intro is meant to show (so an asset hunter knows what to look for):
Mage asteroid hitting a planet -> lava world · Archmage black hole swallowing the arena (singularity) -> void · Kage ink +
many eyes opening in darkness -> shadow figures · Time Lord inside a clock face, hands spinning back · Avatar four
elements merging into a glowing eye · Death Lord skull moon + bone hands · Voidwalker screen shattering into inverted shards
· Reaper a scythe cut splitting the screen · Lich frost crystallising the frame · Grand Inventor blueprint becoming metal ·
Warlock pentagram under a blood moon · Elementalist fire/water/earth/air quadrants colliding · Virtuoso curtains opening on
a stage · and a 1.4s intro for each remaining class (Necromancer souls, Fighter fist, Warrior planted sword, Samurai iai
cut, Shogun banner army, Berserker rage, Scout scope, Rogue dagger glints, Ninja moon leap, Nightblade crescent, Apprentice
spellbook, Dragonslayer dragon at sunset, Doomslayer black sun, Warlord charge, Chronomancer hourglass, Artificer scanner
HUD, Bard note ribbon, Acolyte candle, Paladin shield, Cleric rose window, Saint heaven, Monk lotus, Zen Master enso,
Templar cross, Divine Fist fist barrage, God Hand giant hand, Druid forest, Archdruid world tree, Merchant scales + coins,
Tycoon skyline). Dragon God and Dragon Lord keep their original cinematics.
