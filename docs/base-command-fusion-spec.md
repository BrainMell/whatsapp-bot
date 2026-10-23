# Base ⇄ Command Fusion - Implementation Spec

Status: **PROPOSAL - nothing here is implemented.** Written for the owner to approve.
Audience: any engineer or agent, including one with zero context. Every step names the exact file, function and line area.
Repo: `whatsapp-bot`, branch `audit/fix-pass-1`. Prefix is `.j` (use `ctx.prefix` / `getPrefix()`, never hard-code).

---

## 0. The idea in one paragraph

A base structure and a command that does the same job must be **one thing**.

| Player types | Today | After this spec |
|---|---|---|
| `.j hospital` (`heal`, `clinic`) | plain text, 12h cooldown | **Image card**: zoomed Med Bay + overlay "You were healed" |
| `.j mine <spot>` | text + zoomed mines card (static) | **Animated clip**: zoomed mine + small 2D swinging-pickaxe animation + haul overlay |
| `.j hunt` | Go-service card (`/api/hunt/card`) | Zoomed **forest** scene + hunt overlay (animals, loot) |
| `.j fish` | text / Go "FISH" card | Zoomed **pond** from the top of the dock looking at the water: animated water + moving silhouettes + catch overlay |
| `.j base <number>` / `.j base <name>` | zoom card **and then runs the command** | **Pure render + caption** naming the command. No overlay, no side effects, never runs the command |

Plus progression changes: the mines no longer use a separate "Mining level"; they progress with the **building level**. The Med Bay's level means **it produces a healing potion over time**.

Hard rules that apply to every section:
1. `.j base <n>` must have **zero gameplay side effects** (it is a viewer).
2. Every fused command keeps its **text fallback** if the render throws (same try/catch pattern already in `mineOre`).
3. No new database collections. Reuse the `Base` document (`core/models/Base.js`, already has `cooldowns: Mixed`).
4. Never `git add -A` (LFS pointer stubs in `core/rpgasset`). Add explicit paths.

---

## 1. What exists today (verified in the code)

### 1.1 Rendering stack
- Sprites: KayKit Medieval Hexagon pack pre-baked to PNG. Iso sprites in `core/rpgasset/kingdom3d_iso/` (759 files, `manifest.json` has `S`, `pitch`, `yaw`, `sprites`). Bake scripts in `scripts/kingdom3d/` (`kk_raster.py` rasteriser, `bake_kingdom_sprites.py`, `houses.py` procedural houses, `recolor_biomes.py`).
- Compositor: `core/rpg/kingdom3d.js` → `HexWorld` (`put`, `overlay(fn,c,r,{dx,dz})`, `layoutFixed`, `draw`, `proj`, `cellPoly`).
- Zoom cards: `core/rpg/structureScenes.js` → `renderStructureCard({type,level,biome,seed,spec})` → `buildScene(type,lvl,biome,seed)` with one `case` per structure (`mines`, `shop`, `barracks`, `hunting`, `blacksmith`, `medbay`, `alchemy`, and the `pond` special path ~line 185-225). Returns a **JPEG** (`image/jpeg`), 1400×1000, via `mediaCache.cached('structcard', …)`.
- Info panel: `drawPanel(ctx,w,h,spec)` in the same file (parchment panel at the bottom, optional `spec.banner` ribbon).
- Animation machinery already exists: `core/rpg/ambient.js` (`animateWater(ctx,sc,t,G)`, `buildBoats`/`drawBoats`, `drawBirds`, `drawSway`, `drawButterflies`, `drawCloudShadows`, `drawTint`) and the mp4 encoder `encodeFramesToMp4` in `homesteadBaseRenderer.js` (~line 960-1000; raw BGRA frames streamed to ffmpeg stdin; `FRAMES = 14`, `FRAME_MS = 143`). Sent to WhatsApp as `{ video: buffer, gifPlayback: true, caption }` (see `baseBuilder.js` ~line 199).
- Disk cache: `core/rpg/mediaCache.js` `cached(kind,key,produce,journal,qopts)`; `CODE_VER` is a sha1 of render source files + sprite manifest. **Any new render file must be added to the `files` array there (line ~55) or edits to it will not invalidate the cache.**

### 1.2 Commands (the fusion targets)
| Command | Where | Notes |
|---|---|---|
| Hospital | `core/engine.js` ~line 12618 (`primaryCmd === "hospital" \|\| "heal" \|\| "clinic"`) | Uses `economy.getPersistentHP`, `economy.healToFull(userId,maxHP)` → `{healed,onCooldown,cooldownRemainingMs}`; **12 h cooldown** (`HOSPITAL_COOLDOWN_MS`, field `user.lastHospitalUse`); cures `poison_pill`; lore drop `maybeDrop('healing', chance 0.10)`; tutorial hook `tutorial.notify(senderJid,'hospital',…)`. Replies are plain text only. |
| Mine | `core/commands/rpgCommands.js` `mineOre(sock,chatId,senderJid,locationId)` line ~1051 | Locations from `craftingSystem.getMiningLocations()` (`craftingSystem.js` ~line 485-545: Shimmering Caves, Deep Vein Shafts, Volcanic Hollow, Void Fissure). Gated by player level + rank + **`miningLevel`** (profession). Energy via `economy.getPersistentEnergy/ setPersistentEnergy`. Ends by sending the static zoom card via `baseBuilder.zoomForCommand(…,'mines',{banner})`. |
| Hunt | `core/engine.js` ~line 13437 (`lowerTxt === "<prefix> hunt"`) | Daily limit 10 (`user.huntCount`, `user.lastHuntDay`, UTC reset), animals rabbit_hide 60 / deer_antler 30 / bear_claw 10 (+ luck bonus ≤15, 5% `infected_shard`), `progression.addXP`, card via `combatImageGenerator.generateHuntCard({… biome:'forest', animal:'RABBIT'|'DEER'|'BEAR' …})` which calls a Go service (`/api/hunt/card`). Go source and its background art are **not in this repo** (`core/rpgasset/backgrounds/forest.png` is an LFS pointer stub). |
| Fish | `core/engine.js` ~line 13282 | 25 casts then 1 h rest (`user.fishCount`, `user.lastFishReset`), 5 s `setTimeout` "casting", rarity common/rare/mythic/infected, card via `goService.generateTransactionCard({type:'FISH'})`. |
| Viewer | `core/rpg/baseBuilder.js` `zoomIn` (~line 316) → renders card **then calls `followUp(ctx,st)`**, which runs the real command. `cmdActivity` (~line 334) handles `.j base fish|hunt`. | `followUp` is the thing that must go (§3). |

### 1.3 Existing models relevant to this spec
- Med Bay: `struct_med_tent`, `struct_med_infirmary`, `struct_med_sanatorium` - **procedurally generated by me** in `scripts/kingdom3d/houses.py` (`make_struct`, name `med_*`, ~line 444). These are the "current" models the owner finds unsatisfying.
- Mines: `struct_mine_cave/timber/deep` (procedural) and the pack's `building_mine_<team>`; also `coc_mine_l1..l3` (Clash-style art already in the pack folder).
- Water/dock: `dock_straight@0..5`, `dock_end@0..5`, `waterlily_*`, `waterplant_*`, `hex_water*`, `bucket_water`, `barrel`.
- Hunting: pack has `tree_*`, `trees_*`, `hills_*_trees`, `mountain_*`, `rock_single_*`, `resource_lumber`; **no animals** (deer/boar/rabbit are drawn procedurally in `structureScenes.js`: `drawDeer`, `drawBoar`, `drawRabbit`, `drawCampfire`).
- 2D VFX art available for animation: `core/rpgasset/vfx/{attack,dark,holy,magic}/…` (numbered PNG frames), `core/rpgasset/vfx/spark_*.png`.

---

## 2. Where to find 3D models (honest assessment)

**Constraint:** the dev sandbox can `git clone` public GitHub repos but **cannot download from itch.io, Kenney, Quaternius, Sketchfab, Poly Pizza or OpenGameArt** (shell egress allowlist). So a human downloads the file once and drops it into the repo (or into the chat as an attachment). Nothing below was downloaded by me.

**Honest finding:** I searched for a ready-made *free, low-poly, medieval/fantasy hospital building* and found **none** that is clearly CC0 and stylistically matches KayKit. The hits were paid CGTrader/TurboSquid/Fab listings or modern/sci-fi hospitals (wrong era, wrong style). So the plan has three tiers; try them in order.

### Tier A - assemble a Med Bay from CC0 kits (recommended, safest style match)
| Pack | License | Format | Why | Link |
|---|---|---|---|---|
| **KayKit Medieval Hexagon** (already in repo) | CC0 | glTF | Same art style as everything on the map. Pieces that read as medical when recoloured: `building_church_*` (white + cross), `building_home_A/B_*`, `tent`, `building_well_*`, `bucket_water`, `sack`, `barrel`, `flag_*` | https://kaylousberg.itch.io/kaykit-medieval-hexagon |
| **Kenney Fantasy Town Kit** (160+ models) | CC0 (no attribution needed) | FBX / OBJ / glTF | Extra houses, stalls, fences, lanterns to build a bigger "Sanatorium" compound | https://opengameart.org/content/fantasy-town-kit |
| **Quaternius Medieval Village MegaKit** (304 models) | CC0 | FBX / OBJ / glTF | Modular walls/roofs/doors/windows to *build* a custom infirmary (the page does **not** list a ready hospital) | https://quaternius.com/packs/medievalvillagemegakit.html |

Recipe for the "hospital look" (works with only pieces we already have): white-plaster building + **red roof** + a **red cross** on a sign/banner + a herb garden (`building_grain` tinted green) + `bucket_water` + a row of `sack`/bed-roll props. The red cross is a tiny extra mesh (two crossed boxes) authored in `houses.py` - no download needed.

### Tier B - a single downloaded model (only if its license is CC0 or CC-BY)
Search these catalogues (a human must click through and read the license on **each** model):
- Poly Pizza - https://poly.pizza (search "hospital", "clinic", "medic", "tent"; mostly CC0 / CC-BY, shows license on the page)
- Sketchfab - https://sketchfab.com (filter: *Downloadable* + license *CC0* or *CC Attribution*; search "medieval infirmary", "field hospital tent", "apothecary")
- OpenGameArt - https://opengameart.org (filter license CC0)
Accept only: **glTF/GLB, < 5 k triangles, single colour atlas or flat colours, license CC0 or CC-BY**. Reject: NC (non-commercial) and "editorial" licenses, anything modern/sci-fi, anything over ~10 k tris (the rasteriser is numpy, it will be slow).
If CC-BY: add the credit line to `docs/CREDITS.md` (create it) **and** to the footer of the Med Bay card.

### Tier C - author it ourselves (what exists now, upgraded)
Improve `med_infirmary` / `med_sanatorium` in `scripts/kingdom3d/houses.py`: add the red-cross sign, bed rows, a chimney with smoke, an ambulance-style cart. Zero licensing risk, fully consistent palette.

### 2.1 Importing ANY new glTF into the sprite set (step by step)
1. Put the file at `scripts/kingdom3d/extra_models/<name>.glb` (create the folder; commit the source - it is small).
2. Open `scripts/kingdom3d/bake_kingdom_sprites.py`. Find where it iterates the pack's glTF files and where it appends `houses.py` STRUCTS (search `STRUCTS` / `make_struct`). Add a second loop over `extra_models/*.glb|gltf` using the same loader (`kk_raster.load_model`; if the model uses per-material colours instead of the KayKit gradient atlas, add a branch that reads `material.baseColorFactor` and fills per-vertex colour).
3. Normalise: scale so the model's longest ground axis ≈ 1.8 units (a `struct_*` model fits roughly one hex-pair), centre at origin, ground at y = 0, front towards +z (conventions are in `houses.py` docstring).
4. Name it `struct_<thing>_<level>` e.g. `struct_med_l1/l2/l3`. The sprite is baked once (not 6 rotations).
5. Run the bake with the same env as documented in `docs/kingdom3d.md`:
   `python3 -I scripts/kingdom3d/bake_kingdom_sprites.py` (needs `numpy trimesh pillow`). Because pycache is tracked, afterwards run `git checkout scripts/kingdom3d/__pycache__`.
6. Confirm `core/rpgasset/kingdom3d_iso/manifest.json` now has the new sprite keys (`python3 -c "import json;print([k for k in json.load(open('core/rpgasset/kingdom3d_iso/manifest.json'))['sprites'] if 'med' in k])"`).
7. Reference it in `structureScenes.js` `case 'medbay'` (replace `struct_med_*` names) and in `homesteadBaseRenderer.js` `mainSpriteOf` / `buildWorld` (search `struct_med`) and `core/rpgasset/homestead/structures.json` (the `sprite` field of the medbay levels is a legacy name; the renderers key off `struct_med_*`).
8. Render a proof card (§9) and look at it before committing.

---

## 3. `.j base <n>` becomes a pure viewer

### 3.1 Changes in `core/rpg/baseBuilder.js`
1. **Delete `followUp()` calls.** In `zoomIn` (~line 316-330) remove `return followUp(ctx, st);` → `return;`. Delete the `followUp` function (~line 301) entirely.
2. Rewrite the caption in `zoomIn` so it always names the command, built from one table. Add near `ALIASES` (~line 238):
```js
const CMD_HINT = {
  mines:      (P) => `⛏️ Mine here with \`${P} mine <spot>\``,
  pond:       (P) => `🎣 Cast a line with \`${P} fish\``,
  hunting:    (P) => `🏹 Ride out with \`${P} hunt\``,
  shop:       (P) => `🛒 Browse with \`${P} shop\``,
  barracks:   (P) => `⚔️ Command your summons with \`${P} summons\``,
  blacksmith: (P) => `🔨 Repair gear with \`${P} blacksmith\``,
  medbay:     (P) => `🏥 Get treated with \`${P} hospital\``,
  alchemy:    (P) => `⚗️ Brew with \`${P} brew <potion>\``,
};
```
   Caption = existing title line + upgrade line + `CMD_HINT[st.type](ctx.prefix)`. Remove the old per-type `pond`/`hunting` extras (lines ~321-322).
3. `zoomIn` must call `renderZoom(ctx, rec, st)` **with no `banner` and no `note`** → plain panel, no overlay.
4. `cmdActivity` (`.j base fish|hunt`): make it call the same `zoomIn` path (just resolves `fish→pond`, `hunt→hunting`). It must not roll loot or touch cooldowns.
5. `specFor` (~line 258): update the `acts` table so each list ends with the real command (`hospital` not `clinic`, etc.). Remove the "Mining Lv" row for mines (§5) and replace with "Yield ×" (§5.3).
6. Keep `.j base upgrade …`, `.j base build …`, `.j base info` exactly as they are.

### 3.2 Tests (add to `/tmp/…/flow.js` style harness or a new `scripts/qa_base_viewer.js`)
- For each of `.j base 1..9`, `.j base mines|pond|hunting|shop|barracks|medbay`: assert exactly **one** `sendMessage` call with `image`, and **zero** calls to `mineOre`, `displayShop`, `summonCommands.handleCommand`, `displayBlacksmith`, and zero writes to `economy`/`Base`.

---

## 4. Hospital fusion - `.j hospital` shows the Med Bay

### 4.1 Behaviour
- Player has a Med Bay (in `Base.structures`, type `medbay`): card = zoomed Med Bay **at its current level**.
- Player has **no** Med Bay: use the level-1 "Medic Tent" scene (everyone can use the hospital; the building only improves it). Do **not** create anything in the database.
- Overlay (the existing banner ribbon in `drawPanel`, `spec.banner = {head, lines}`):
  - **Healed:** head `"You were healed"`, lines `["+{healed} HP", "HP {max}/{max}", "Next visit in 12h"]`. Add a soft green "+" sparkle layer (§4.3).
  - **Already full:** head `"Already at full health"`, lines `["HP {max}/{max}"]`.
  - **Cooldown:** head `"The healers are resting"`, lines `["Next visit in {h}h {m}m", "HP {cur}/{max}"]`.
  - **Poison cured:** if `poison_pill` was present before the call, add line `"Poison purged"`.
  - **Potion collected** (§6): extra line `"+1 Health Potion"`.
- Keep the old text as the **caption** (so screen-reader/long-press info is retained) and as the fallback if rendering fails.

### 4.2 Code
1. In `core/rpg/baseBuilder.js` export a helper (zoomForCommand already exists and does exactly the lookup/`fixedSeed` logic; reuse it):
   `zoomForCommand(ctx, 'medbay', { banner })`. **Fix needed:** `zoomForCommand` falls back to `fixedSeed()` for missing structures, but `medbay` is a BUILDABLE not a fixed structure → add:
   ```js
   if (!st) { const f = fixedSeed().find(x => x.type === type) || (type === 'medbay' ? { uid:'virt', type:'medbay', level:1, x:0, y:0 } : null); if (!f) return null; st = f; have.push(f); }
   ```
   Also: `zoomForCommand` returns `null` when the user has **no Base document at all** (`if (!rec) return null`). For the hospital, build a synthetic record instead: `rec = { userId: ctx.senderJid, structures: [] }` (the code that uses `rec` only reads `userId` and `structures`; `biomeOf(rec)` already try/catches to `'isle'`).
2. In `core/engine.js` hospital block (line ~12618) wrap the three reply sites. **Do not restructure the logic** - only replace the `sock.sendMessage({text})` at: already-full (~12634), cooldown (~12651) and healed (~12663) with a small local function:
   ```js
   const sendHospital = async (text, banner) => {
     try {
       const card = await require('./rpg/baseBuilder').zoomForCommand({ senderJid, prefix: botConfig.getPrefix() }, 'medbay', { banner });
       if (card && card.buffer && card.buffer.length > 500) return sock.sendMessage(chatId, { image: card.buffer, caption: BOT_MARKER + text }, { quoted: m });
     } catch (e) { /* fall through to text */ }
     return sock.sendMessage(chatId, { text: BOT_MARKER + text });
   };
   ```
3. Keep every side-effect line (`healToFull`, lore drop, tutorial notify) in the same order. The lore drop is sent **after** the card, as today.
4. `.j base <medbay#>` stays a pure viewer (§3).

### 4.3 Optional polish (do after the base works)
Healing sparkles: add `drawHealSparkles(ctx, cx, cy, k, t)` to `structureScenes.js` (green `+` glyphs rising and fading; same pattern as `drawCampfire`). For a still JPEG draw a fixed set; if the animated pipeline (§5.4) is built, loop it.

---

## 5. Mines fusion - animated mining on the 3D mine

### 5.1 Behaviour
`.j mine <spot>` returns an **mp4 clip** (`gifPlayback:true`, ~2 s, 14 frames):
- Background: the zoomed 3D mines scene (same `buildScene('mines', level, …)`).
- A small 2D **miner + swinging pickaxe** sprite at the cave mouth, with spark/rock-chip particles on each hit and a dust puff; the last 4 frames show the haul ribbon (existing `banner`).
- `.j mine` with **no spot** still returns the text list (unchanged).
- If ffmpeg/render fails → existing static card → existing text (three-level fallback).

### 5.2 2D animation art
- Do **not** download anything. Draw it with canvas primitives in a new function `drawMiner(ctx, x, y, k, t)` in `structureScenes.js` (follow `drawDeer`'s style: shadow ellipse, rounded body, head, hard hat; arm angle = `-0.9 + 1.6 * easeInOut(phase)` rad; pickaxe is a rotated line + wedge head). One swing per half-loop (phase `= (t*2) % 1`; impact at phase 0.5 → spawn sparks).
- Sparks: reuse `core/rpgasset/vfx/spark_7.png` / `spark_10.png` with `ctx.globalCompositeOperation='lighter'`, 4-6 sprites flung outward over 3 frames. (Fallback: drawn yellow dots.)
- Camera: the scene stays still; only the miner, sparks, dust and the torch flicker (`coc_torch` sprite exists) move. Cheap: scene is rendered **once** to a canvas; each frame = `drawImage(sceneCanvas)` + overlay draws. This is why the animated version is no slower than the static one.

### 5.3 Remove the profession level; progress with the building
**Decision (owner):** "remove the level system there, it should progress with the building's level".
Mines building level = `Base.structures[type=mines].level` (1-3). Default 1 when the user has no Base.

Replace, in `core/commands/rpgCommands.js` `mineOre`:
1. Delete `const miningLevel = economy.getProfessionLevel(…,'mining')` (~line 1056). Add
   `const mineLv = await require('../rpg/baseBuilder').getStructureLevel(senderJid, 'mines');` (new tiny exported helper: `Base.findOne({userId}).lean()` → structure level, default 1; try/catch → 1).
2. **Location gating** (currently `loc.req.miningLevel`, values 1/5/15/30 in `craftingSystem.js` lines ~489, 501, 514, 527): change the requirement to a **mine level**: Shimmering Caves → 1, Deep Vein Shafts → 2, Volcanic Hollow → 3, Void Fissure → 3 (and keep player level + rank gates). In `craftingSystem.js` rename `miningLevel` → `mineLevel` with values `1,2,2,3` (one-line edits ×4). Update the locked message (`needs Mines Lv.X - upgrade with .j base upgrade mines`).
3. **Energy discount** `pctCost` used `Math.floor(miningLevel/2)`: replace with `mineLv * 3` (Lv1 −3, Lv2 −6, Lv3 −9 percentage points off the location cost, still floored at 5).
4. **Rolls**: `baseRolls = 2 + Math.floor(miningLevel/10)` → `2 + (mineLv - 1)` (2/3/4).
5. **XP**: remove `economy.addProfessionXP(…,'mining',…)` and the `levelUp` message/lines. Replace the XP line with `⛏️ Mines Lv.{mineLv}`. (Leave `user.professions.mining` in the schema - other code may read it; just stop writing it. Verified: the only other readers are `baseBuilder.specFor` line 276 and the lines in `mineOre`.)
6. `baseBuilder.specFor` line ~276: replace the `Mining Lv` row with `['Yield', '×' + [1.0,1.25,1.5][st.level-1]]` and, in `mineOre`, multiply each ore `qty` by that yield (`Math.max(1, Math.round(qty * yieldMult))`) so upgrading the building has a visible effect.
7. Migration: none needed. Players keep their old profession data untouched; it simply stops mattering. Their mine level starts at the building level they already own.
8. Search for leftovers: `grep -rn "getProfessionLevel(.*'mining'\|addProfessionXP(.*'mining'" core` must return nothing except the profile/card display if one exists.

### 5.4 Animated pipeline (new file `core/rpg/structureClip.js`)
Do **not** duplicate the ffmpeg code. `homesteadBaseRenderer.js` exports `encodeFramesToMp4`; read its signature (~line 960-1000: it takes an array/stream of raw BGRA frame buffers and `frameMs`) and call it. Pseudocode:
```js
async function renderMineClip({ level, biome, seed, spec, haul }) {
  return mediaCache.cached('structclip', key, async () => {
    const sceneCanvas = await drawSceneToCanvas('mines', level, biome, seed);   // refactor renderStructureCard: split into drawScene() + drawPanel/encode
    const frames = [];
    for (let f = 0; f < 14; f++) { const c = clone(sceneCanvas); drawMiner(c.ctx, …, f/14); drawSparks(…); if (f >= 10) drawPanel(c.ctx, W, H, spec /* with banner */); frames.push(c.getBGRA()); }
    return { buffer: await encodeFramesToMp4(frames, 143), contentType: 'video/mp4' };
  }, null, { label: 'mineclip' });   // 4th arg: run inside renderQueue (memory gate!)
}
```
- **Refactor first:** in `structureScenes.js` split `renderStructureCard` into `drawStructureScene(o) → {canvas, ctx}` (everything up to and including the vignette) and a thin wrapper that adds the panel + JPEG encode. The animated renderer reuses `drawStructureScene`.
- **Memory:** the pm2 limit is ~430 MB on a 952 MB box (see comment at top of `mediaCache.js`). Always pass the `qopts` argument so the bake is serialized through `renderQueue`. 14 frames at 1400×1000 is fine; if RSS gets high, render at 1100×786 for clips.
- The cache key must include `haul` text hash (the ribbon differs per mine result) → the clip is **not** cacheable across results. Fix: bake the **clip once per (level, biome, seed)** with *no* ribbon (cache hit nearly always), then composite the ribbon in a **second cheap ffmpeg-free step**? That is not possible on mp4. Choose one:
  - **Option 1 (recommended):** send the clip **without** overlay text; send the haul as the **caption** (already built) and as a second small JPEG of the static card with the ribbon. Fast, cached.
  - **Option 2:** bake per result (slow, ~2-5 s, uncached). Acceptable only if `renderQueue` is healthy.
- Wire in `mineOre`: replace the `zoomForCommand` block with `structureClip.renderMineClip(...)`; on throw → existing static `zoomForCommand` block → text.

---

## 6. Med Bay level = healing potions over time

### 6.1 Rule
The Med Bay brews **one Health Potion per interval**, collected when the player uses `.j hospital` (no new command needed).

| Med Bay level | Brew interval | Potion | Stock cap |
|---|---|---|---|
| none | - | - | - |
| 1 Medic Tent | 12 h | `minor_hp_potion` (15%) | 2 |
| 2 Infirmary | 8 h | `hp_potion` (30%) | 3 |
| 3 Sanatorium | 6 h | `mega_potion` (60%) | 4 |
All three item ids already exist in `lootSystem.js` (~lines 995-1000) - **no new items**.

### 6.2 Data
Use the existing `Base.cooldowns` (Mixed) field: `cooldowns.medbayCollectedAt` (ms). Stock is **derived**, never stored: `stock = min(cap, floor((now − collectedAt) / interval))`. When the player collects: add `stock` potions via `inventorySystem.addItem(userId, itemId, stock)`, set `collectedAt = now − (leftover remainder)` so partial progress is preserved:
`collectedAt = now − ((now − collectedAt) − stock*interval)` (if stock hit the cap, `collectedAt = now`).
First time (undefined `collectedAt`): treat as `collectedAt = now` (no instant freebie), write it on first `.j hospital` or on **building** the Med Bay (set it in `cmdBuild`).

### 6.3 Code
- New module `core/rpg/medbayBrew.js` with `getState(rec)` (returns `{level, item, intervalMs, cap, stock, nextInMs}`) and `async collect(userId)` (atomic: read `Base`, compute, `Base.updateOne({userId,'cooldowns.medbayCollectedAt':oldVal},{$set:{…}})` - if `modifiedCount===0` someone raced → return 0 potions; then `addItem`). Guard with the same `opLocks` pattern used in `baseBuilder.js`.
- Call `collect` from the hospital block in `engine.js` **after** the heal result is decided and **in all three outcomes** (potions accumulate even while the heal is on cooldown). Add the line to the banner (§4.1).
- Show brew progress on the Med Bay zoom card (`specFor`, `type==='medbay'`): rows `['Potion', item name]`, `['Ready', `${stock}/${cap}`]`, `['Next', 'in 3h 10m']`. This is the *only* addition to the pure-viewer card and it is read-only.

---

## 7. Pond fusion - `.j fish` seen from the top of the dock

### 7.1 Behaviour
`.j fish` result card (still image **or** short clip) with this camera:
- **POV: standing at the end of the pier looking out over the water.** In `structureScenes.js` the pond scene already builds a per-seed lake and pier (`pd` direction, `lakeShore`, `pier`, returns `focus`). Add an optional `pov:'dock'` parameter: set the camera focus to the **pier head** (`pier.lw`) and render the lake filling the upper 2/3 of the frame; place the pier's planks in the bottom foreground (use `dock_straight@{pd}` / `dock_end@{pd}` pieces larger via `sc`).
- Water animation: call `ambient.animateWater(ctx, sc, t, G)` per frame (it already needs `sc = { water: [{poly,cx,cy,h,shore}], k, realm }` - build it from `w.cellPoly` for every cell with `.water`; copy how `guildBaseRenderer.js` / `homesteadBaseRenderer.js` build `sc` around line 892 / 854).
- **Moving silhouettes** = fish shadows under the water: new `drawFishShadows(ctx, list, t)` in `structureScenes.js`: 4-7 dark teal ellipses with a tail triangle (alpha 0.25-0.4, `globalCompositeOperation='multiply'`), each following a slow sine path inside the lake polygon, size classes small/medium/one big (the big one only when the catch rarity is rare/mythic - **it is the one that "bites"**: on the last frames it swims to the bobber and the ripple ring pops). Also keep `ambient.buildBoats/drawBoats` (already supports `max:2`) for the lake at pond level ≥ 2.
- Overlay (ribbon via `drawPanel`): head `"You caught!"`, lines `["{emoji} {item name}", "Rarity: {rarity}", "Sell value: {zeni}"]`.
- `.j base pond` = still viewer, same POV but **no** fish silhouette highlight and no banner.

### 7.2 Code
1. `renderStructureCard` gets `o.pov` and `o.t` (time 0..1) so a frame can be drawn; add `renderPondClip` in `structureClip.js` using §5.4's pattern (cache key per level/biome/seed; ribbon rendered as caption/2nd image, Option 1).
2. Wire into the `.j fish` handler in `engine.js` (~13350-13395): where it currently builds `fishCard` via `goService.generateTransactionCard`, **try the pond card first** (`baseBuilder.zoomForCommand(ctx,'pond',{pov:'dock', banner})`), fall back to the Go card, then text. Keep every game-rule line (`fishCount`, 5 s timer, rarity roll, `addItem`, `awardProgression`) byte-for-byte.
3. Pond level (1-3) already changes the lake dressing; additionally let it change catch odds slightly **only if the owner wants it** (out of scope here; the spec keeps `.j fish` rules unchanged).

---

## 8. Hunting fusion - `.j hunt` seen from inside the forest

The current zoom card (`case 'hunting'` in `structureScenes.js`, done ) is a forest glade with deer/boar/rabbit; the owner finds the *base card* dull. Plan:
1. **Make the forest richer** (all in `structureScenes.js`, `case 'hunting'` + the tree ring at ~line 300):
   - Light: add 3-4 diagonal "god-ray" polygons (`globalCompositeOperation='lighter'`, alpha 0.08, warm yellow) and a darker canopy vignette. Add drifting leaf/pollen particles.
   - Colour: autumn palette via `biome` (the existing `recolor_biomes.py` biomes) - choose `biome` for hunting from the base's biome, but boost saturation +10 %.
   - Props: tent + campfire is **banned** ("why some random building"); instead add a *hunting blind* (two logs leaning on a tree), animal tracks (small dark ellipses on dirt), feathers.
   - Animals alive: in the clip version, deer lifts its head (2-frame ear flick), rabbit hops (parabola), boar sniffs (head bob). All drawn procedurally already - add a `t` argument to `drawDeer/drawBoar/drawRabbit`.
2. **Fuse with `.j hunt`:** in `engine.js` (~13500-13560) the success path already builds `huntCard` from the Go service. Replace with: pick the animal (`RABBIT|DEER|BEAR` already known as `animalName`), call `zoomForCommand(ctx,'hunting',{banner:{head:'HUNT SUCCESSFUL', lines:[emoji+item.name, 'Rarity …', 'Sell …', '+XP …']}, spotlight: animalName})`. Add `spotlight` support: the chosen animal is drawn **larger, centred, with an arrow-pierced/“marked” indicator**, the others stay small. **Bear** is a new procedural `drawBear` (big dark-brown body, rounded ears, hump) - author it next to `drawBoar`.
   Fall back to `combatImageGen.generateHuntCard` (Go) then text, exactly as the code does today.
3. `.j base hunting` = still viewer (no spotlight, no banner).
4. Hunting limit/XP/luck code is **not touched**.

---

## 9. Verification checklist (what "done" means)

Run in this order; each must pass before the next.
1. `node --check` on every edited `.js`.
2. Delete `/tmp/qa-media-cache`, run with `QA_MODE=1` and `NODE_PATH=<dir containing canvas>`. (Local harnesses used so far: `/tmp/claude-0/kk_test/{sc.js,flow.js}` - they are scratch files, recreate if gone: `sc.js <type> <lvl> <biome> <seed>` renders `buildScene` to `sc_<type><lvl>.jpg`.)
3. Visual proofs to **look at** (use the Read tool on the JPEG; for mp4 extract frames with `ffmpeg -i x.mp4 -vf fps=7 f%02d.png`): medbay L1/L2/L3; mines L1/L2/L3 clip frames 0/5/10/13; pond dock POV (still + 3 frames); hunting with each spotlight animal.
4. Viewer test (§3.2): `.j base 1..9` → one image, no gameplay calls.
5. Hospital: states healed / full / cooldown / no-base-user / render-throws (stub `zoomForCommand` to throw → text sent).
6. Mining: location gating by mine level; energy cost numbers (Lv1/2/3); no `addProfessionXP('mining')` calls remain; clip → static card → text fallback chain.
7. Med Bay brew: simulate time (inject `now`): stock at 0/1/2/cap intervals; concurrent collect (two parallel calls give potions once).
8. `grep -rn "followUp(" core/rpg/baseBuilder.js` → no matches.
9. Cache: add `structureScenes.js` (already), `structureClip.js`, `medbayBrew.js` (not render, skip) to the `files` array in `mediaCache.js` (~line 55) - render-only files.
10. Docs: update `docs/kingdom3d.md` (new section "Command fusion") and add `docs/CREDITS.md` if any CC-BY model is used.
11. Commit with explicit paths; trailers `Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>` + `Claude-Session: …`; push to `audit/fix-pass-1` (fetch/rebase first - other sessions push here; on conflicts **prefer the owner's already-approved work**, never reset it away).

---

## 10. Suggested build order and effort

| # | Work | Size | Why this order |
|---|---|---|---|
| 1 | §3 pure viewer + caption table | S | Unblocks everything; removes side-effects; tiny |
| 2 | §4 hospital card | S | Most visible, only text→image swap |
| 3 | §6 med-bay potions | S-M | Needs `medbayBrew.js` + 3 banner lines |
| 4 | §5.3 mine-level progression | M | Touches balance; do before the animation |
| 5 | §2 medbay model (Tier C first, then A/B) | M | Art task, independent |
| 6 | §5.4 clip pipeline + §5 miner animation | L | Shared engine for 6 and 7 |
| 7 | §7 pond dock POV + silhouettes | L | Reuses §5.4 |
| 8 | §8 hunting richness + spotlight + bear | M | Reuses §5.4 for animated option |

---

## 11. Open questions for the owner (defaults in bold; answer only if you disagree)

1. Mining location gates by **mine level 1/2/2/3**, yield **×1.0/1.25/1.5**, energy discount **3 pts per level** - OK?
2. Hospital works for players **without** a Med Bay (shows the tent) - **yes** - or require the building?
3. Potion cadence **12/8/6 h, caps 2/3/4** - OK?
4. Mine/fish clips: **Option 1** (clip + caption + second still with ribbon) or Option 2 (ribbon baked into the clip, slower, uncached)?
5. Is a real downloaded hospital model still wanted after Tier C (upgraded procedural model) is on screen? If yes, drop a `.glb` + its license URL in the chat and §2.1 takes over.
6. Keep the Go-service hunt/fish cards as the **fallback** (**yes**) or delete them?

## 12. Things that could bite whoever implements this
- `economy.getUser(...)` returns a **cached shared object**; the hunt code increments counters synchronously before any `await` on purpose (race protection). Do not insert an `await` between the limit check and the increment.
- `busyUsers` is a Set that must be cleared in `finally` - the fish handler clears it inside a `setTimeout`; keep that shape.
- `zoomForCommand` must never create a Base document (it uses `findOne`, not upsert). Keep it that way.
- Sprites named `*_sh.png` are shadow layers; `w.put` loads them automatically - new baked sprites need both files.
- `media_cache` is keyed by code hash: after changing any render file the first view is cold (~2-15 s). `renderWarmer.js` can pre-bake journaled entries; give new `cached()` calls a `journal` object if you want warming.
- LFS: `core/rpgasset/backgrounds/*.png` are pointer stubs in this clone; never try to read them as images.
