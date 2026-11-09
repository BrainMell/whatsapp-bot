# GENERATION BLUEPRINT — make every image/animation instant
Owner mandate (2026-11-09): any agent touching image/animation generation MUST follow this. Claude writes the
foundation; the working agent applies the recipe to each generator, one PR per row of the table.

## The one rule
Split every output into **BAKED** (depends only on a finite key: skill id, enemy id, card id, sprite hash, kind)
and **LIVE** (HP bars, names, numbers, which background). Bake once to disk, glue live pieces per request.
Never change output dimensions or lower quality; verify parity (same W×H, same frame count/fps) before merging.

## Foundation (already in repo)
- `core/utils/assetBake.js`
  - `makeBakeCache({ns,version,maxMB})` → `key(...parts)`, `get/put`, `getOrBake(key, fn)` (disk + in-flight dedupe + size cap, outside git).
  - `encodeBgraFrames({w,h,fps,outW,outH,frames})` raw-BGRA → ffmpeg pipe (no PNG round trip, veryfast crf24).
  - `registerPrewarm(name,{keys,bake})` + `prewarmAll()` background baking, RAM-gated, yields between jobs.
- `core/utils/goImageService.js` static memo: every pure-JSON Go still is cached 120s + in-flight deduped (`GO_STATIC_MEMO=0` off).
- `core/utils/renderQueue.js`: `getOrRender` for Node canvases (TTL + dedupe); one render at a time (RAM).
- Reference implementations to copy: `combat/deathOverlay.js` (baked overlay frames keyed by cut-PNG hash),
  `combatImageGenerator._layerCache` (layers cache), `summonCards/cardPlayScene.js` (raw BGRA encode).
- Env: `ASSET_BAKE=0` kill switch, `BAKE_DIR`, `BAKE_RSS_MB`(620).

## Recipe per generator (apply top to bottom, highest player-visible latency first)
| Generator | BAKED (key) | LIVE (glued per request) | How |
|---|---|---|---|
| Death clips | overlay frames (cut hash+kind+boss+atk) | bg plate, HUD | DONE; verify live hit rate |
| Combat stills / PvP | Go layers (HP-insensitive) | HUD, shadows | DONE (layers cache) |
| Card-play scene | card sprite, ribbon, shadow | hand/target pos | DONE |
| Skill VFX clips | per (skillId, element) frame strip, transparent, sprite-local | caster/target positions, bg | bake strip frames to `makeBakeCache({ns:'skillfx'})`; composite onto plate with `encodeBgraFrames`; prewarm all skillIds from skill registry |
| Ultimate clips (`ultimateFx*`) | per (ultId) cast strip + impact strip | bg, sprites, names | same; split into cast/impact so any ult = 2 cache lookups + 1 encode |
| Basic attack→death combo | per (enemyId, atkKind) lunge strip | target plate | key on sprite hash; prewarm bestiary |
| Go summon GIF (17–35s) | per-cardId card reveal frames (card art + glow + frame) | caster/HP bar overlay | bake card-only frames once; Go/Node overlays live bar; send still first, clip after |
| Boss splash / endscreen | per (boss/tier) background+sprite | text | Go memo covers repeats; prewarm boss list into memo |
| Abyss hub/room/scene | per (roomType, floorTheme) background | party icons, floor number | `getOrRender` + disk bake of backgrounds |
| Profile/shop/inventory/menu/deck cards | per (item/card id) art tiles, frames, fonts glyph runs | numbers, name | cache decoded images (`loadImage` LRU) + bake tiles; whole-card `getOrRender` by payload hash |
| Homestead / world / guildwar | terrain/tile layers per (map, zoom) | units, markers | bake tile layer; draw markers live |
| Stock/trend/quote/map/space cards | n/a (data-driven) | all | already `getOrRender`; keep |
| Upload | — | — | send **still first, clip after** on kill turns; JPEG for stills; never block next turn on clip |

## Steps for the agent (per row)
1. Time it cold/warm with a script in `scripts/qa_*`; record numbers in this file.
2. Identify the finite key. If none exists, bake a coarser layer (background/sprite) instead of the whole image.
3. Implement with `makeBakeCache`; add `registerPrewarm` fed from the content registry; call `prewarmAll()` ~30s after boot.
4. Parity test: same dimensions, fps, frame count, visually diff warm vs cold output.
5. Keep a kill switch env var; document it in `docs/OWNER_TODO_CANT_DO.md`.
6. Never put baked output in git (`BAKE_DIR` outside repo); size caps mandatory.

## Test plan (owner-run, live)
1. Joker alone in a GC: run each row's command cold, then again; log `[GoService]`/bake timings.
2. Add Subaru; have each bot's `qa-send` trigger the other's commands to watch timing from outside.
3. Acceptance: warm path < 1.5s for stills, < 3s for clips (10× slower box budget: < 15s).

## 2026-11-09 wave-2 rows (agent measurements, box1 QA)
| Row | Implementation | Cold | Warm | Kill switch |
|---|---|---|---|---|
| Upload: still-first, clip after | kill-turn merged clips send frame 0 of the SAME mp4 instantly, clip follows; helper `mp4FirstFrameJpeg` in mediaConvert (237ms) | n/a | n/a | `UPLOAD_STILL_FIRST=0` |
| Boss splash / endscreen | disk bake per (name,sprite,flavor,tier) via assetBake ns bosssplash (60MB cap); 5s combat race kept — a timed-out bake continues in background so the NEXT encounter hits | 4.19s (Go) | **69ms disk hit** | `BOSS_SPLASH_BAKE=0` |
| Profile / shop / inventory / menu cards | whole-card disk bake keyed by FULL payload hash (incl. pfp buffer bytes) + 10-min freshness bucket, ns profilecards (250MB); render queue unchanged on bake-miss path | 5.84s | **0ms (disk read)** | `PROFILE_BAKE=0` |
| Skill VFX (non-ult) | covered by the recipe §1 work: same plate engine + prewarm (see RECIPE doc §4) | — | — | — |
| Abyss hub/room/scene | NOT DONE this wave: backgrounds are local files already LRU-decode-cached (`_bgCache`); the real win needs the composed tile-layer extraction in abyssScene (2848 lines) — queued | — | — | — |
| Homestead / world / guildwar | NOT DONE this wave: markers are drawn into the same canvas as the tile layer, so whole-output caching would freeze markers — needs the bake-tile-layer/draw-markers-live split — queued | — | — | — |
| Basic attack→death prewarm | NOT DONE: overlay keys hash the actual cut PNG bytes; prebaking synthetic fights only helps if cuts are byte-stable across rosters (mandate step-2 verification) — queued behind that verification | — | — | — |
