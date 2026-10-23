# Kingdom3D - 3D hex guild kingdom + player base (v8)

Status: **WIP on branch `kingdom3d`** - guild kingdom + player base both rebuilt on the hex engine; static + animated (mp4) paths verified. Not merged to main.

## What it is
Both base views are now composited from **pre-baked sprites of real 3D models**
(KayKit Medieval Hexagon Pack, CC0 - credit Kay Lousberg, www.kaylousberg.com).
No GL / no 3D at runtime: node-canvas just blits sprites back-to-front.
Measured: guild card ~120-190 ms warm (first render ~2 s while sprites load),
~300 KB JPEG, vs the old multi-second canvas bake + ~1 MB card.

## Pipeline
1. `scripts/kingdom3d/kk_raster.py` - tiny numpy z-buffer rasteriser (orthographic,
   pitch 40°, Lambert shading from the pack's gradient atlas, 3x supersampled AA,
   projected ground shadow). Needs only `numpy trimesh pillow` (no GPU/EGL/Blender).
2. `scripts/kingdom3d/bake_kingdom_sprites.py` - bakes every glTF in the pack:
   tiles/roads/rivers/coasts + wall/fence/bridge pieces in **6 rotations**
   (`name@0..5`), everything else once. Writes `core/rpgasset/kingdom3d/*.png`,
   `<name>_sh.png` shadow layers and `manifest.json` (anchors, per-edge terrain
   classes `edges`, wall/fence reach `conn`). 439 sprites in ~60 s, 6.6 MB.
   Re-run: `KK_HEX_DIR=<pack>/addons/kaykit_medieval_hexagon_pack python3 -I scripts/kingdom3d/bake_kingdom_sprites.py`
3. `core/rpg/kingdom3d.js` - `HexWorld`: pointy-top odd-r hex grid, terrain
   **autotiler** (road/river/coast/river-crossing chosen by matching baked edge
   signatures; coast tiles from contiguous water-edge runs), `layWall()` (wall
   path → straight/corner/gate pieces by connectivity), depth-sorted compositor
   (terrain → shadows → flat decals → objects → overlays), helpers (`ring`,
   `hexLine`, `hexDist`, `hexPath`, `paintBackdrop`).
4. `core/rpg/guildBaseRenderer.js` - the guild kingdom (same public API:
   `renderGuildBaseImage(state, {hint, static})`, `GUILD_STRUCTS`, `GUILD_PLOTS`, `ARCH`).
5. `scripts/render_guild_kingdom.js` - proof cards (`node scripts/render_guild_kingdom.js /tmp/out`).

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
  Quaternius sites are blocked** - assets must come from GitHub mirrors.
  `KayKit-Medieval-Builder-Pack-1.0` repo is NOT public on GitHub (clone prompts for auth).
  The Hexagon pack already contains walls, gates, towers, scaffolding/build stages
  (`building_stage_A/B/C`, `building_scaffolding`, `building_dirt`), fields (`building_grain`).
- No premade 3D kingdom *map files* exist for free - only tiles + buildings; maps are
  generated (this autotiler). Paid: "Kingdom Low-Poly Asset Pack" ($59, license unclear).
- Pack tiles: hex radius 1.1547 (width 2, row pitch √3), top surface at y=0, glTF y-up.
  UVs map into a 1024² gradient atlas - sample colours per vertex (flip V).
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
Roads are re-drawn as hex lines with **explicit links** (`HexWorld.link`) - auto-connecting to
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
sprite renderers and will not run against v8 - safe to delete/archive.

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
- **Generator**: `core/rpg/kingdomTerrain.js` - `shape()` (ragged silhouette with `void` edge so no sea,
  lakes/oasis/lava pools, river with a road bridge in 60% of guilds) and `populate()` (value-noise
  elevation + moisture → mountains, hills/dunes, forest, rocks, fields/windmill, mine, lumber mill,
  watermill, war camps, ruins, watch-tower). Pure function of guild name + biome.
- **Proof**: `node scripts/render_guild_biomes.js /tmp/gb "Name A,Name B,Name C"`; 30 different names → 30 unique maps.
- `.gitattributes` keeps `core/rpgasset/kingdom3d/biomes/*/*.png` as plain git blobs (no LFS).

## Realms (continents) - one world map, five lands
Owner brief: home bases get different biome versions, tied to the world map's art direction and cosmology;
a new map shows the continents, each tied to a biome; when someone founds a guild they choose a continent and a
random part of it holds the guild's marker, with the member home bases nearby, lore-wise.

| Realm (key) | Biome | Charted regions |
|---|---|---|
| The Storm Reach (`stormreach`) | `isle` - coastal realm, the ONLY sea | Gullwatch · The Salt Marches · Thunderhead Cape |
| The Sunscorch (`sunscorch`) | `desert` | The Glass Dunes · Mirage Wells · The Bone Road |
| The Frost Reach (`frostreach`) | `tundra` | Rimewall · The Whitefast · Lantern Fjord |
| The Wildwood (`wildwood`) | `highlands` | Amberdeep · The Hundred Oaks · Millrace |
| The Ember Fields (`emberfields`) | `volcanic` | The Cinder Steps · Slagmouth · Ashfall Basin |

- `core/rpg/continents.js` - pure data + functions. Canonical geometry (fixed seed per realm, map space 0..1),
  `markerFor(guild, realm)` (seeded random spot, kept off the coast), `baseSites()` (hamlets in a loose ring round
  the marker), `baseBiome()`, `find()` (fuzzy: "desert", "the frost reach", "lava"…). A guild stores `continent`
  + `marker` at creation; legacy guilds fall back to the old name-hash biome, so nothing changes for them.
- `core/rpg/continentMapRenderer.js` - the map, in the Royal Decree chrome of `worldMapRenderer` (parchment, ink,
  wax). Plain atlas, or with the guild's charter-stone banner + member hearths. ~100 ms.
- **Founding:** `.j guild create <name> | <type> | <realm>` (type and realm may come in either order). With no
  realm the bot shows the chooser and does not create the guild.
- **Commands:** `.j guild map` (your charter-stone on the chart), `.j realms` / `.j continents` (plain atlas + chooser).
- **Guild kingdom:** biome now comes from the guild's realm; the card subtitle shows the realm.
- **Player base** (`homesteadBaseRenderer.js`): terrain, sprite set and backdrop follow the guild's realm
  (coast / desert / tundra / wildwood / ashlands); a solo player gets a realm seeded from their name. The saved
  16x16 grid and `LAYOUT` are untouched. The caption names the realm and, for guild members, the region.
- **QA:** `node scripts/qa_continents.js` (geometry, markers/hamlets on land, determinism, parsing);
  proofs: `scripts/render_base_realms.js`, `docs/kingdom3d_continents_*.jpg`, `docs/kingdom3d_base_realms.jpg`.

Cosmology fit: realms are lands *of the First World* and scatter across all four quadrants of the chart;
timelines never appear as regions. Names reuse the surveyor field-names of the existing catalog.

## round 2 - Aldafold, the traced chart, the diagonal camera

**The planet has a name: Aldafold.** The five realms go Norse - Stormheim (coast),
Solheim (desert), Rimeheim (tundra), Skogheim (highlands), Eldheim (volcanic).
Storage keys and biome order stay frozen; `get()` / `find()` resolve the old
surveyor names (the Storm Reach, the Sunscorch…) as aliases, so nothing stored
breaks. `.j world` defaults to the continents atlas of Aldafold; the cosmology
sheet moved to `.j world cosmology`.

**The chart is traced art.** `core/rpgasset/continents/five_realms.jpg` is drawn
1:1 and the renderer overlays the guild location pin (emblem floating above) plus
member hearths. Land masks derive from the chart via `scripts/kingdom3d/make_realm_mask.py`
(`core/rpgasset/continents/realm_mask.json`), so markers, hamlets and region
lookups sit exactly where the art says the land is.

**Player base - diagonal isometric camera (yaw 45):** full-card terrain (no void
frame), hex-edge palisade, lakeside pier, cottages facing the street with spurs to
every building, denser village dressing (farmsteads, yards, fields, reeds and
lilies). Water and lava animate from the old two-frame glint art; smoke and
fireflies drift on the animated frames. The baker takes a camera yaw; sprite sets
are biome-recoloured.

**Guild kingdom - terrain fills the whole card:** oversized grid, far-field
mountains/forests/hills, off-card culling. The upgrade celebrate bake now rains
confetti over the card (deterministic per state, chunky card-scale scraps);
player-base build/upgrade bakes celebrate the same way.

**Guild gate:** `.j base` view/house/build/upgrade/info require a guild - no
charter, no land (mods keep baseadmin).

**Scrape status:** the 2D iso pipeline stays dead (`isoOutlands.js`, `isoForest.js`
deleted; `homesteadRenderer.js` and `isoShadow.js` remain for the flows that still
use them). Old scripts pointing at the scrapped renderers were removed.

QA: `node scripts/qa_continents.js` - geometry against the chart masks, markers and
hamlets on land, determinism, name resolution both ways.

## - life layer v2, houses, Mines/Med Bay, wider citadel
- `scripts/kingdom3d/houses.py`: procedural 3D houses (7 kinds x roof colours, `K.houseName`) + dedicated Mines (cave / timber / deep headframe) and Med Bay (tent / infirmary / sanatorium) models. Rebake just these: `KK_ONLY=house_,struct_ [KK_YAW=45] python3 -I scripts/kingdom3d/bake_kingdom_sprites.py`.
- `core/rpg/ambient.js`: loop-safe birds with shadows, villagers on roads, sailboats; 20-frame (2 s) loops.
- Guild citadel wall moved from ring 4 to ring 6 (`WALL_RING`): six corner towers, market, well, fields, orchard, up to 24 member cottages spread over rings 2-5.

## - world atlas + player-base tiers
- `.j world` / `guild map` now render `core/rpg/worldAtlasRenderer.js`: crisp 3D-hex Aldafold, every guild's castle + emblem plate on its realm, roster strip. `continentMapRenderer.renderContinentMap` delegates to it (legacy painted chart kept as fallback). Guild `continent`/`marker` are persisted (Guild model, loadGuilds, syncGuild).
- Player base village tier = the Home's level: lv2 adds six corner watchtowers on the palisade; lv3 replaces the palisade with a stone curtain wall (laid in dry runs round lakes) with gate and banner towers.
- Guild base tiers (hall 2-5) live in `guildBaseRenderer.js` (cobbles, second curtain, full city).

## (b) - zoom cards, shop/barracks/hunting camp, pond angles, speed
- **Speed:** `mediaCache` keys on a content hash of the render code + sprite manifest (not git HEAD) so unrelated deploys stop invalidating every baked card; animated loops are 14 frames (was 20).
- **`core/rpg/structureScenes.js`:** zoomed iso close-up per structure + parchment info panel + optional result ribbon (`renderStructureCard`, `drawPanel`). Used by `.j base <#|name>` and by command results.
- **New fixed structures:** `shop` (merchant market model, stall → bazaar) and `barracks` (summons barracks, tents → garrison keep), both in the base map; the hunting grounds now have a real camp (archery range, tents, targets) with its own plaque.
- **Pond:** the pier is aimed at THIS base's lake (direction/shore follow the per-owner lake nook), dock props sit landward.
- **Wiring:** `.j base 2` mines → card + mine list; `shop` → card + shop; `barracks`/`summons` → card + summons command; blacksmith → card + blacksmith; `.j base fish` / `.j base hunt` (`core/rpg/baseActivities.js`, cooldown stored on the Base doc) answer with a ribbon card; `.j mine <spot>` result plays on the mines card.
- **Guild:** `.j guild` is now the HALL zoomed in with the guild's info panel (`renderGuildHallCard`); the old animated grounds moved to `.j guild grounds`. The emblem crowns the keep and the uploaded crest (`emblem.img`) fills the shield when present.
