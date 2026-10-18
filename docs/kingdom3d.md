# Kingdom3D — 3D hex guild kingdom + player base (v8)

Status: **WIP on branch `kingdom3d`** — guild kingdom + player base both rebuilt on the hex engine; static + animated (mp4) paths verified. Not merged to main.

## What it is
Both base views are now composited from **pre-baked sprites of real 3D models**
(KayKit Medieval Hexagon Pack, CC0 — credit Kay Lousberg, www.kaylousberg.com).
No GL / no 3D at runtime: node-canvas just blits sprites back-to-front.
Measured: guild card ~120-190 ms warm (first render ~2 s while sprites load),
~300 KB JPEG, vs the old multi-second canvas bake + ~1 MB card.

## Pipeline
1. `scripts/kingdom3d/kk_raster.py` — tiny numpy z-buffer rasteriser (orthographic,
   pitch 40°, Lambert shading from the pack's gradient atlas, 3x supersampled AA,
   projected ground shadow). Needs only `numpy trimesh pillow` (no GPU/EGL/Blender).
2. `scripts/kingdom3d/bake_kingdom_sprites.py` — bakes every glTF in the pack:
   tiles/roads/rivers/coasts + wall/fence/bridge pieces in **6 rotations**
   (`name@0..5`), everything else once. Writes `core/rpgasset/kingdom3d/*.png`,
   `<name>_sh.png` shadow layers and `manifest.json` (anchors, per-edge terrain
   classes `edges`, wall/fence reach `conn`). 439 sprites in ~60 s, 6.6 MB.
   Re-run: `KK_HEX_DIR=<pack>/addons/kaykit_medieval_hexagon_pack python3 -I scripts/kingdom3d/bake_kingdom_sprites.py`
3. `core/rpg/kingdom3d.js` — `HexWorld`: pointy-top odd-r hex grid, terrain
   **autotiler** (road/river/coast/river-crossing chosen by matching baked edge
   signatures; coast tiles from contiguous water-edge runs), `layWall()` (wall
   path → straight/corner/gate pieces by connectivity), depth-sorted compositor
   (terrain → shadows → flat decals → objects → overlays), helpers (`ring`,
   `hexLine`, `hexDist`, `hexPath`, `paintBackdrop`).
4. `core/rpg/guildBaseRenderer.js` — the guild kingdom (same public API:
   `renderGuildBaseImage(state, {hint, static})`, `GUILD_STRUCTS`, `GUILD_PLOTS`, `ARCH`).
5. `scripts/render_guild_kingdom.js` — proof cards (`node scripts/render_guild_kingdom.js /tmp/out`).

## Guild kingdom design
Walled citadel (ring-4 wall, south gate, cobble avenue), castle on the centre cell,
facilities on the E (Training) / W (Treasury) ring-3 cells, five numbered build plots
(dashed gold outline + plaque, dirt + scaffolding props), one cottage per member
(cap 12) in the southern ring, per-guild-seed wilds (forest W, mountains N, fields +
windmill SE, lighthouse, river + watermill, lumber mill, mine). Facility level → model
(hall: tower → fort → barracks → castle → castle + 4 towers; training: tent/targets →
archery → +blacksmith → barracks + catapult tower; treasury: crates → home → market →
church → church + tower). Team colour from archetype (red/yellow/green); emblem colour
+ icon on a waving banner above the keep. Output keeps the HUD plate.

## Things learned (so nobody re-discovers them)
- Sandbox egress allowlist: GitHub git clone works (`git clone` of public repos,
  incl. `KayKit-Game-Assets/KayKit-Medieval-Hexagon-Pack-1.0`); **itch.io, Kenney,
  Quaternius sites are blocked** — assets must come from GitHub mirrors.
  `KayKit-Medieval-Builder-Pack-1.0` repo is NOT public on GitHub (clone prompts for auth).
  The Hexagon pack already contains walls, gates, towers, scaffolding/build stages
  (`building_stage_A/B/C`, `building_scaffolding`, `building_dirt`), fields (`building_grain`).
- No premade 3D kingdom *map files* exist for free — only tiles + buildings; maps are
  generated (this autotiler). Paid: "Kingdom Low-Poly Asset Pack" ($59, license unclear).
- Pack tiles: hex radius 1.1547 (width 2, row pitch √3), top surface at y=0, glTF y-up.
  UVs map into a 1024² gradient atlas — sample colours per vertex (flip V).
- Edge order used everywhere: 0=E 1=SE 2=SW 3=W 4=NW 5=NE. Rotating a model by 60°·r
  yaw maps edge k → k−r. Tile rotation 0 art: coast_A `010000`, B `122100`, C `222100`, D `222112`.
- `media_cache` (disk) is keyed by state hash + git HEAD; when iterating on art locally
  with `QA_MODE=1` clear `/tmp/qa-media-cache` or you will keep seeing stale renders.
- `git clone` here skips LFS (`GIT_LFS_SKIP_SMUDGE=1`) → `scripts/render_out/*.png`
  show as modified (pointer stubs). **Never `git add -A` in such a clone.**

## Player base (homesteadBaseRenderer.js)
Saved data model untouched (16x16 grid `x,y,fw,fh`; `LAYOUT` kept verbatim so `baseBuilder.js`
needs no change). Grid (x,y) → hex (col=x+3,row=y+3); the 3-cell margin is the player's wilds,
biome rolled from the owner seed (meadow / highlands / farmland / lakeside) with a ragged
coastline. House on the village green (plaza ring + well), mines = NW quarry mountains, pond =
NE lake blob, hunting grounds = W woods, stone gatehouse + towers across the south gate on the
main street, free expansion plots = dirt pad + scaffolding + dashed outline + "PLOT n" plaque.
Roads are re-drawn as hex lines with **explicit links** (`HexWorld.link`) — auto-connecting to
every adjacent road cell produced a messy lattice. Structures: per-type/level compositions of
KayKit buildings scaled 1.3-2.1x for the 3x3 footprint (house home_A→home_B→manor, blacksmith,
medbay tent→church, alchemy barrel→tavern→tavern+windmill, mines, pond lilies→dock props→mill).
Animated path (`static:false`): smoke puffs + fireflies, 14 frames → mp4 in ~1.6 s (was ~15-20 s).

## Verify locally
```
npm i canvas            # (or use the repo's node_modules)
node scripts/render_guild_kingdom.js /tmp/guild   # 4 guild cards
node scripts/render_base_kingdom.js  /tmp/base    # 3 base cards
```
Old one-off proof scripts (`scripts/bake_proof_v*.js`, `qa_*`, `check_*`) target the retired 2D
sprite renderers and will not run against v8 — safe to delete/archive.

## TODO
- Facade orientation: sprites all face the camera; mirror buildings whose door should face a street.
- Hunting-woods palisade fence + gate pieces (fence_wood_* rotations not yet used).
- Cathedral / arena / harbour kits are NOT in the Hexagon pack (see asset ledger).
- Optional: more building variety from other CC0 packs once reachable via GitHub mirrors.

## Guild biomes (v9)
Each guild gets one of 5 biomes from its name hash (`state.biome` overrides): `isle` (now a COASTAL realm: sea on one seeded side only,
the only one with a sea), `desert`, `tundra`, `highlands` (autumn), `volcanic`. Goal + log:
`docs/KINGDOM_BIOMES_GOAL.md`; proof sheet: `docs/kingdom3d_biomes.jpg`.
- **Art**: `scripts/kingdom3d/recolor_biomes.py` palette-swaps the baked terrain/nature sprites into
  `core/rpgasset/kingdom3d/biomes/<biome>/` (same file names; buildings/walls shared). Re-run it after
  re-baking the base sprites. `K.biomeFile()` resolves per-biome paths; `HexWorld({biome})` selects the set.
- **Generator**: `core/rpg/kingdomTerrain.js` — `shape()` (ragged silhouette with `void` edge so no sea,
  lakes/oasis/lava pools, river with a road bridge in 60% of guilds) and `populate()` (value-noise
  elevation + moisture → mountains, hills/dunes, forest, rocks, fields/windmill, mine, lumber mill,
  watermill, war camps, ruins, watch-tower). Pure function of guild name + biome.
- **Proof**: `node scripts/render_guild_biomes.js /tmp/gb "Name A,Name B,Name C"`; 30 different names → 30 unique maps.
- `.gitattributes` keeps `core/rpgasset/kingdom3d/biomes/*/*.png` as plain git blobs (no LFS).
