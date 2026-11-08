# What I (the sandbox agent) could not do — owner checklist (2026-11-07)

Everything below needs the real boxes, real sprites or your decision. Code is on `audit/fix-pass-1`; pull + restart `wa-*`.

## Must verify on the boxes
1. **Status auras** (`combat/statusAuras.js`): in a PvE fight apply shield / burn / poison / freeze / slow / root / curse etc. and look at real sprites, especially tall bosses. Tune colours/sizes in the `GROUND` / `FRONT` tables.
2. **Hit reaction** (`combat/hitFx.js`): knock-back red double image + slash + impact star + number. Test a normal hit, crit, miss and heal; confirm the slash lands on the sprite (uses Go anchors `x, feetY, w, h` and cut `x,y,w,h`).
3. **PvP card**: Go must return cuts + anchors for BOTH duelists (`side:'player'`, `index` 0/1). If P2's anchor/cut is missing, the hit reaction silently skips and the Go fallback card is used.
4. **Card-play MP4** (`summonCards/cardPlayScene.js`): slot, middle-slot and "+N" pile origin; mp4 plays as a GIF (gifPlayback).
5. **Quest complete card**: the narration caption is now empty (`caption: ''`). Check the Go portrait card doesn't leave an ugly blank band; if it does, hide the caption block in Go when empty. `QUEST_NARRATION=1` brings the old text back.
6. **Death animations**: classification now trusts `element` / `type` BEFORE the name keywords. Kill a void boss and an earth boss and confirm each gets its own style. The earth "crumble" clip was reported looking unfinished — I could not render the real boss dissolve here; if it still looks cut off, check `deathOverlay.js` (`renderFast`, frame count vs. clip length) and the earth dissolve recipe in `ultimateFxLayers*.js`.

## Could not reproduce — need info
- **"Tentacle Crush hit me instead"**: I traced `.j combat summon` → `prepareActivation` → `resolveActivation` → turn image target resolution (`combatIntegration.buildAnimationAction`). Krakenling is `target:'enemy'`, enemy index is parsed 1-based and converted correctly, and the target object is an enemy (`isEnemy:true`). I found no path that damages the caster. Please send the exact command you typed (e.g. `.j combat summon 4 2`), the combat log lines and whether the damage number/red flash appeared on you or the HP actually dropped. Suspects: a thorns/reflect effect on that enemy, or the red flash resolving the wrong side in a multi-enemy fight.

## Go-side (needs Go repo)
- PvP layers contract + P2 sprite placement (hub is top-right, ~x 690-1010, y 12-110).
- Optional: Go GIF endpoint for all 25 cards; Go HUD parity for fallback cards; remove empty-caption band on the QUEST portrait card.

## Design decisions I left to you
- Dash / lunge animations for basic attacks (needs clips, 1-3s render per turn, chat spam) — recommend NOT doing it; the still hit reaction covers the feel. If you want it later: redraw bg + all cuts except the attacker, slide the attacker, flash target.
- Final card art (`core/rpgasset/summoncards/<id>.png`) and a parchment frame asset for the mini hand cards.

## 2026-11-07 late additions (Go side)
- **Side-scroller shadows**: `docs/go_patches/side_scroller_shadow.patch` replaces the round radial `utils.DrawShadow` blob with a flat contact oval (rx 0.78r, ry 0.16r). Apply in the Go repo, rebuild, redeploy; all PvE/summon/death plates pick it up because the shadow is baked into the Go layers.
- **Death-clip HUD parity (DONE in Node)**: death plates now carry the same chrome as card scenes (`combatCardNode.paintChrome`: survivor bars, rank chip, player hub); card+death is a 0.35s xfade. Kill switches `DEATH_CHROME=0`, `CLIP_XFADE=0`. Death clips whose baked HP snapshot differs are re-rendered at kill time (~1s, overlay cache).

- **PvP card-play scene (DONE)**: `PVP_CARD_SCENE=0` disables. **Hit effect without a cutout (DONE)**: slash/impact/number now draw on the anchor even if the target cutout is missing.

## 2026-11-08 speed + fx + shadow pass (Claude)
- **Why fx cards vanished on a slow box:** `generateCombatImage` abandoned the Node card after a hard 6s and sent the plain Go card (no hit/miss/heal fx). Budget is now `NODE_CARD_BUDGET_MS` (default 28s); layers axios timeout `LAYERS_TIMEOUT_MS` (default 25s); one retry on a failed layers call.
- **Layers cache** (`LAYERS_CACHE=0` disables): sprites/bg layers don't depend on HP (Go draws no bars in layers mode), so the key collapses HP/energy to an alive flag. Repeat turns = 0ms; identical in-flight requests share one render. QA: `scripts/qa_layers_cache.js`.
- **2.5D shadows now painted in Node** (`core/rpg/systems/combat/groundShadow.js`, `NODE_SHADOW=0` disables): overhead-sun drop shadow: compact soft oval centred on each sprite's real stance (measured from visible pixels, padding-proof). Used by PvE card, PvP card and death plates. Works with the live Go renderer unchanged — **no Go deploy needed**. If a Go build still bakes the old round blob into `bg`, apply `docs/go_patches/side_scroller_shadow.patch` or drop the Go shadow so they don't double. Harness: `scripts/qa_ground_shadow.js`.
- **Card-play scene** ~1385ms -> ~950ms locally (raw-pipe ffmpeg, cached ribbon + card shadow sprite).
- **Not done / can't from here:** WhatsApp upload time (box1 uplink ~2x slower than box2) is the dominant live cost per the speed test — that is network, not code. Summon GIF Go render is 17-35s server-side; per-card result caching is the lever if you want it instant.

## 2026-11-08 Owner admin shield
- `core/utils/ownerAdminGuard.js` + hook in the `group-participants.update` demote path of `core/engine.js`. If the bot owner (any `BOT_OWNER_PHONES` form, phone or LID) is demoted in any group by anyone except the group creator (`metadata.owner` / `ownerPn`) or the owner themself, every admin bot in that group promotes them straight back (1 retry on a transient error; max 8 restores/min per group so two admins can't fight forever). Kill switch `OWNER_ADMIN_SHIELD=0`. QA: `scripts/qa_owner_admin_guard.js`.
- Limits: a bot that is not admin in the group can't promote (it logs and another admin bot does it); if NO bot is admin there, nothing can restore you. The group creator can always demote you — WhatsApp and this rule both allow it. Kicks/removals are not covered by this shield (the existing `.j gcowner` immunity handles bot-side actions).
- **Bots protect each other too:** each bot registers its account ids in the shared KV `_shared_bot_accounts` when it connects. A demoted bot is re-promoted by the OTHER admin bots unless the demoter is you, the group creator, or a sibling bot running a permission-checked command (so `.demote` by a mod on a bot still works, a random admin's manual demote doesn't). Needs every bot to have restarted once on this commit so they're in the registry. A bot can't restore itself (it's no longer admin) — it needs a sibling that is admin.
