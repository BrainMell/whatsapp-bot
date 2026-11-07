# Implementation + design guide for the owner's agent (2026-11-07)

Branch `audit/fix-pass-1`. All Node canvas, design space 1024x687 (`s = width/1024`). Go supplies `generateCombatLayers(..., {hud:'none-clean'})` → `{bg, sprites, cuts[{side,index,x,y,w,h,png(b64)}], anchors[{side,index,x,feetY,w,h}]}`.

## 1. Draw order on the battle card (`combatCardNode.renderNodeCard`)
1. `bg` → turn marker ellipse → **auras 'ground' pass** (rings/puddles/roots under feet)
2. `sprites` layer
3. **hit reaction** (`hitFx.drawHitReaction`)
4. overhead HP bars → **auras 'front' pass** + status badges → rank chip → hub plate (parchment banner) → deck tray.
PvP (`renderNodePvpCard`): same minus rank banner / tray; P1 hub bottom-left, P2 hub top-right `{flip:true}`.

## 2. Status auras (`combat/statusAuras.js`)
API: `drawAuras(c, anchor, unit.statusEffects, s, 'ground'|'front')`. Each status = one function in `GROUND` and/or `FRONT` receiving `(c, box, s, rng, effect)` where `box = {cx, fy, w, h, top, mid}` (pixels). Rules that keep it from looking cheap:
- never fill the sprite — use rim light, ground marks, or sparse particles;
- ground effects are squashed ellipses (`scale(1, 0.28)`) so they sit in perspective;
- deterministic randomness (`rng(seed from anchor)`) so a unit looks the same every render;
- one colour family per status (shield blue hex, burn orange, poison toxic green, freeze ice, curse violet, taunt red).
Add a status: add the key to `GROUND`/`FRONT` (+ `ORDER`), or map it in `ALIAS`.

Shield = hex **ward**: floor rune circle (two rings + 12 ticks), rim-lit dome (radial gradient only near the edge), hex lattice clipped to the dome rim, absorb pill under the feet. Old bubble: `LEGACY_SHIELD_BUBBLE=1`.

## 3. Still-frame hit reaction (`combat/hitFx.js`)
Reference (classic JRPG/Dragon-Quest-style feedback): slash → target recoil/flash → number. Frozen into one frame:
- white-hot flash of the original sprite (alpha .35)
- **knock-back red copy** shifted 15px away from the attacker, rotated ~4.3°, alpha .95 → reads as a motion double-image
- 2 tapered crescent slashes (3 on crit) with white core + element-coloured glow, angled by attack direction
- additive 16-point impact star + sparks at the contact point
- number above the head: red damage, gold crit with "CRITICAL" tag, grey "MISS" with sidestep afterimage, green "+heal"
Inputs: `act = {attackerSide, attackerIndex, targetSide, targetIndex, damage, isCrit, missed, heal, element}`.
Next ideas: per-weapon slash shapes (pierce = line, blunt = shockwave ring), boss hit = bigger star.

## 4. Card flight MP4 (`summonCards/cardPlayScene.js`)
`renderCardPlayScene({card, players, enemies, playerIndex, targetIndex, entries, info, sceneOptions, api})` → mp4 Buffer or null. Timeline (t 0..1): anticipation dip .04-.12 → arc lift .12-.36 (bezier from slot/“+N” chip to a hover point above the caster, overshoot scale, rotation settle, 3 ghost trails) → hover + ability ribbon .36-.58 (bob, dust motes, element aura, summon art rises) → projectile + impact (attack) or rings (skill) .52-.80, screen shake on impact → card burns to sparks .74-.92. Slot geometry comes from `combatHud.deckLayout()` (single source of truth with `drawDeckTray`; entries with `hidden:true` are skipped by the tray). Tunables: `FPS`, `N`, `OUT_W`. Disable: `CARD_SCENE_ANIM=0`.

## 5. Summon card design language (`summonCards/cardRenderer.js`)
300x440. Layers: dark backing + riveted metal frame by rarity (`METAL`) → deckled parchment (`shared/parchment.js makePaper/tornPath`) → ink keyline + stitch → arched art window with element sunburst → swallowtail title ribbon → wax-seal energy cost (top-left) + hourglass shield (cooldown, top-right) → type ribbon over the art foot → rule box (ability name, diamond divider, description, italic flavour from `FLAVOR`) → footer (element sigil medallion, rarity gems). Vector sigils/emblems, no emoji fonts. Gold leaf sheen on LEGENDARY.

## 6. Fixes made today
- `skillVfx.classifyDeath`: element/type/family/category now win over name keywords (a void boss named “…Guardian” no longer crumbles as stone).
- Quest complete: removed the narration paragraph from both the portrait card caption and the text message; the Groq narration call is skipped (`QUEST_NARRATION=1` restores).
- Hit reaction ported to PvP; status auras on both cards.

## 7. Testing
`node scripts/qa_summon_cards.js`; preview harness: `combat/vfxPreviewStage.js` gives a fake layered scene (blocks for sprites) — enough to check geometry, not real art.
