> **AGENT: if you started before reading section 5 (WORK ORDER, bottom of this file), re-read it now: finish your current step, then follow it. After sections 1 and 2, continue through every row of docs/GENERATION_BLUEPRINT.md. Do not stop at the first row.**

# RECIPE — Skill clips, Ultimate clips, Summon/card clips (agent: read fully, then implement + test)
Foundation to use: `core/utils/assetBake.js` (`makeBakeCache`, `encodeBgraFrames`, `registerPrewarm/prewarmAll`).
Rules: **same output size/fps/frame count, no quality loss, kill switch per feature, caches outside git with size caps,
parity test before merge.** Read `docs/GENERATION_BLUEPRINT.md` + `docs/PREBAKE_MANDATE.md` first.

## 0. What exists today (verified in code, do not rebuild)
| Piece | File | Facts |
|---|---|---|
| Skill/ult entry | `combat/skillVfx.js` `animateUltimate` (l.~961) | Sends 3 "charging" texts spaced 2s **then** renders. Render raced at 30s (`raceTimeout`). Calls `ultimateFx.renderUltimateVideo`. Returns mp4 + thumb. Text fallback on null. |
| Ult/skill engine | `combat/ultimateFx.js` (+`Layers`, `Layers2`, `Recipes`, `Cinema*`, `Cosmic`) | 640×480 @15fps. Tracks painted per frame on canvas from sprite sheets (`SETS`, ~80 named sets). `overlayOnly` mode (used by death clips) paints effects only. |
| Plate cache | `combat/ultimatePlateCache.js` | Disk cache of transparent effect **plates** per frame/group. Key = recipe+palette+intensity+side/aoe+quantised anchors+fan points+**base-scene bytes**+render-code hash. Cap 1.5GB, `ULT_PLATES=0` off. |
| Legacy GIF (skills) | `skillVfx.renderSignatureGif` | Purged as fallback; leave. |
| Card play (primary) | `summonCards/cardPlayScene.js` | Node MP4: card flies hand→caster, effect in real scene. Raw BGRA pipe. 12s leash + 11s grace in `guildAdventure.js` ~6483 and `pvpSystem.js` ~1503. |
| Card play (fallback) | `summonCards/cardPlayGif.js` | 420×280, 14fps, 18 frames, PNG frames→ffmpeg palette GIF→ converted to MP4 (`gifToMp4Even`). |
| Go summon GIF | `goImageService.generateSummonCardGIF` | Only ifrit/leviathan/shiva as fallback after scene fails. 17–35s Go side; disk+in-flight cache keyed on whole request. |
| Death merge | `guildAdventure.js` `_deathClipForCardKill` + `_concatMp4` | Card clip + death clip concatenated into one mp4. |

## 1. SKILL + ULTIMATE clips
### Problem
Every cast paints all effect tracks live (breath blits ≈40%, vortex warp ≈19% of a DRAGON_GOD render per R3 profile),
then encodes. The plate cache already exists but hit rate is low because **base-scene bytes are in the key**, and the scene
changes every fight, so plates almost never replay.

### Plan (do in this order; each step independently shippable)
1. **Hide the render behind the charging texts (free ~4–6s).** In `animateUltimate`, start `renderUltimateVideo(...)` as a
   promise BEFORE the 3-message loop, `await` it after. Texts already take ≥4s (2×2s gaps). Keep the abort token +30s race.
   Guard: if the render rejects, behave as today (text fallback).
2. **Split plates into scene-independent vs scene-dependent.** Painters that sample scene pixels (vortex, bgfill, warp — grep
   `bgc.getImageData` near `ultimateFx.js:260`) stay keyed with scene hash. Everything else (rings, bursts, beams, sprites-sheet
   fx, particles, breath) is keyed WITHOUT scene bytes: `key = sha1(recipe, palette, intensity, side, aoe, quantised anchors,
   fan points, codeVer)`. Quantise anchors to 16px grid (already done) so common formations share plates.
3. **Prewarm the common geometries.** `registerPrewarm('ultplates', {keys, bake})`: iterate every class ult × intensity 1..3 ×
   {single, aoe} × the canonical formation anchors (1 caster slot 0..3 × target slot 0..3, enemy side and PvP side). Bake with
   a flat gray scene (valid because step 2 made plates scene-independent). Run from `prewarmAll()` 30s after boot, RAM-gated.
4. **Composite step only at cast time:** plates (drawImage) + live layers (fighters, HP chip bars, banner, HUD, camera) →
   `encodeBgraFrames` raw pipe (swap any PNG-frame encode still in `ultimateFx` for this).
5. **Non-ult skills** (basic class skills using `resolveSignature`): same engine, so steps 2–4 cover them; their prewarm key set
   is `getSignature(classId, skillId)` for every class/skill in `skillVfx.js` SIGNATURES.
6. **Kill turns:** send the still (existing card image) immediately, clip after (`makeUltimateSender`), never block the turn.

### Cache keys
`plates`: above. `clip` (optional whole-clip cache for PvE replays): sha1(plateKey, scene bytes hash, hud fields, victim HP, dying kinds).

### Acceptance (measure with `scripts/qa_*` style script; store numbers here)
- Output 640×480, 15fps (or recipe fps), frame count equal to pre-change for every class (assert in test).
- Visual diff warm vs cold ≤ tiny per-pixel epsilon on plate layers; eyeball 3 ults per class (ground fx under fighters, air fx over).
- Cold render unchanged or faster; warm render ≤ 3s on this box, ≤ 15s on the "10× slower" assumption.
- Kill switches: `ULT_PLATES=0`, new `ULT_PREWARM=0`, `ULT_RENDER_EARLY=0` (step 1).

## 2. SUMMON / CARD clips
### Layers (what is finite vs live)
- BAKED per card: card face sprite (`cardRenderer.drawCard` → PNG, key cardId+version), summon-creature sprite, **effect strip**
  (slashes/shockwave for ATTACK, shield/heal rings for others) keyed `(cardId|element|type|vfx)`, burst/glow strip keyed `(element)`.
- BAKED per start slot: the hand→caster flight easing is pure math; the card sprite is the only thing drawn → cache nothing
  but the card PNG; do not bake the flight frames.
- LIVE: scene plate (`bg+sprites` from the layers cache), caster/target anchors, damage/heal number pop, HP bar chip, enemy hit flash.

### Plan
1. **Card/creature/effect strips on disk** via `makeBakeCache({ns:'cardfx'})`; `drawCard` result cached in-memory LRU + disk.
   Prewarm all cards in `summonCards/catalog.js` (147 lines, finite) at boot.
2. **Scene plate once per clip:** use `_generateCombatLayers` (HP-insensitive cache) and paint bg+sprites into ONE canvas reused by
   every frame (do not redraw sprites per frame); only the moving card, effect strip, number and bars are drawn per frame.
3. **Encode with `encodeBgraFrames`** (cardPlayScene already pipes raw BGRA; confirm cardPlayGif does the same or retire it:
   make the generic path produce the same scene MP4 with a flat plate when layers fail, so there is ONE code path).
4. **Remove the Go summon GIF from the hot path.** ifrit/leviathan/shiva render through the same Node scene (add their art as
   effect strips). Keep Go only behind `SUMMON_GO_GIF=1`.
5. **Kill + summon merge:** keep `_concatMp4`, but start `_deathClipForCardKill` **in parallel** with the card scene (it is
   independent; death overlay is already baked) and concat when both finish, instead of awaiting sequentially (saves up to 9s).
6. **Leash logic:** keep 12s+11s but, with 1–5 in place, expect warm < 2s. Log `[SummonCards] cold/warm ms`.
7. **Send still first, clip after** for PvE summons: send the post-card still immediately, then the clip as a follow-up message.

### Acceptance
- Dimensions/fps/frames identical to current scene MP4 (read from `cardPlayScene` constants; assert in test).
- Every catalog card renders in the scene path (loop over `catalog.js`, no fallback hits, no throw).
- Warm: ≤ 2s render; cold ≤ current; simulate 10× slow by `nice`/cpulimit and confirm < 15s.
- Kill switches: `CARD_SCENE_ANIM=0` (exists), new `CARDFX_BAKE=0`, `SUMMON_GO_GIF=0`.

## 3. Test plan the agent runs (and owner repeats live)
1. Script per section times cold (empty `BAKE_DIR`) vs warm; paste results below.
2. Run existing QA: `scripts/qa_summon_sim.js`, `qa_layers_cache.js`, `qa_overlay_cache_prune.js`; add `qa_ult_plates_prewarm.js`, `qa_cardfx_bake.js`.
3. Live: Joker-only GC → cast one ult per class (cold, then warm), play 3 different cards twice, kill-turn ult, PvP ult.
   Then add Subaru; each bot's `qa-send` triggers the other's commands; compare log timings (`[SkillVFX] sprite mp4 ... in Nms`,
   `[SummonCards] ...`). Watch RSS: prewarm must stop on `lowMem`.
4. Report: table of cold/warm ms per class ult and per card, before vs after.

## 4. Results (agent fills)
Measured on box1 (2-core, loaded QA box, 2026-11-09; warm = 2nd render, different scene bytes, same geometry):
| Item | before cold | before warm | after cold | after warm | notes |
|---|---|---|---|---|---|
| Ult plates replay (DRAGON_GOD, 1v2) | ~25s every cast (never replayed across fights) | ~25s | 25.1s (capture) | **6.3s HIT** | pure key (§1.2): same geometry + DIFFERENT scene bytes now hits |
| Ult plates replay (REAPER, 1v2) | ~14-45s every cast | ~14-45s | 13.9-45.2s (capture) | **10.0-15.9s HIT** | replay = drawImage plates + encode; paint skipped |
| Cheap painters (FIGHTER) | ~9-12s | ~9-12s | 12.2s plates=off | 9.0s skipped | by design: paint <150ms → live path, no plate toll |
| Prewarm bake (§1.3) | n/a | n/a | bakePlates captured 36.5s (DRAGON_GOD, worst class) | 360 keys @ boot | aoe:true left to organic capture (reusable keys) |
| Card-play scene (ifrit) | ~12.3s every play (drawCard × idle frames) | ~12.3s | 12.3s cold | **6.0s warm** | card face + idle variants disk-baked (§2.1) |
| Card-play scene (leviathan) | ~4.0s | ~4.0s | 4.0s cold | **2.6s warm** | same |
| Card-play scene (shiva) | ~2.6s | ~2.6s | 2.6s cold | **2.6s warm** | already fast; bake adds ~0 |
| Kill-turn death merge | scene + death serial (≤9s extra) | same | parallel (§2.5) | parallel | death clip starts with the scene, concat when both done |
| Go summon GIF hot path | ifrit/leviathan/shiva fell back to 17-35s Go render | same | **out of hot path** (SUMMON_GO_GIF=1 only) | — | §2.4; disk cache remains for QA |
| Early ult render (§1.1) | texts (≥4s) THEN render | same | render starts with texts | ULT_RENDER_EARLY=0 reverts | ~4s perceived saving on every cast |
| Flat-plate one-path (§2.3) | layers fail → null → generic GIF | same | scene continues on flat plate | — | ONE code path; GIF/Go stay last-resort |
| Frames/dims parity | — | — | asserted by qa scripts | — | 640×480 @15fps ults; scene MP4 dims unchanged |

## 5. AGENT WORK ORDER (do all of this, in order, without asking)
Scope: sections 1 and 2 above FIRST, then every remaining row of `docs/GENERATION_BLUEPRINT.md` (Abyss hub/room/scene,
boss splash/endscreen prewarm, profile/shop/inventory/menu/deck cards, homestead/world/guildwar, basic-attack combos).
For each row: time cold/warm -> find finite key -> implement with `core/utils/assetBake.js` -> parity test -> kill switch -> fill the results table.
1. `git pull --rebase` before starting and before every push (another agent pushes concurrently). Work on branch `audit/fix-pass-1`.
2. Order: (a) ult early-render + plate split + prewarm, (b) card/summon bake + single scene path + parallel death merge,
   (c) remaining blueprint rows by player-visible latency. One commit per step, each with its test script in `scripts/`.
3. Never change output dimensions/fps/frame counts or lower quality. Parity assertions are mandatory.
4. Every feature gets an env kill switch, documented in `docs/OWNER_TODO_CANT_DO.md`. Caches outside git, size-capped.
5. You cannot deploy or test on the live boxes: say so, and leave the live test plan (section 3) for the owner / `qa-send`.
6. Finish by filling section 4 (results), listing anything not done and why, and pushing. Do not stop at the first row.

## 6. prebaked/ folder (owner asked for baked assets to live ON THE REPO)
Mechanism is in: `core/utils/prebaked.js` seeds `prebaked/{ult-plates,cardfx-v1,deathov}` into the live caches on boot (copy-missing, no overwrite).
AGENT TODO: after prewarm finishes on a live box (all 360 plate keys baked), run `node scripts/export_prebaked.js`, commit `prebaked/`
(budget 60MB). Plate keys embed a code hash -> re-export after the LAST change to `ultimateFx*.js`/`ultimatePlateCache.js`, or they are dead weight.
Add the same seed+export for every new cache the blueprint rows create (subfolder name = cache ns-version).
