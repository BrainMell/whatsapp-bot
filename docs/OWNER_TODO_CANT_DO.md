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
- **Death-clip HUD parity**: the death plate (`deathOverlay.scenePlate`) is Go bg + cutouts with no Node hub; card-play scenes carry the Node hub. Card+death is now a 0.35s xfade (`CLIP_XFADE=0` to disable). Full parity needs the Node hub painted on the plate.
