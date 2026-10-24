# House Builder 3D and Combat Direction: Protected Baseline

All work belongs on `audit/fix-pass-1`. These are implementation rules, not instructions for a separate agent.

## Interior renderer and model assets

- Live route: `core/rpg/homestead.js` → `core/rpg/homesteadRenderer.js` → `core/rpg/interior3d/index.js` → `core/rpg/interior3d/scene.js`.
- Runtime GLBs: `core/rpgasset/interior3d/models/{arch,floors,furniture,walls}/`. Every ID in `core/rpgasset/homestead/catalog.json` must have `models/furniture/<id>.glb`.
- Walls, floors, doors, loft, stairs, railings and placed furniture use 3D models. Do not silently fall back to legacy 2D sprites.
- Beds use their committed `bed_*.glb` in both the room and shop/inventory thumbnails. The old procedural box-bed override bypassed those models.
- 3D is the default irrespective of stale `HOMESTEAD_3D=0`. Legacy 2D recovery requires explicit `HOMESTEAD_3D_LEGACY_FALLBACK=1`. A 3D failure must be logged and surfaced instead of being disguised as a successful sprite render.
- Increment `core/rpg/interior3d/index.js`'s `VERSION` after model, camera or geometry changes. It invalidates room and shop-thumbnail bakes.
- Run `node scripts/qa_homestead_glb.js`. Do not claim visuals are fixed without inspecting an actual runtime render.

## Player/enemy facing: do not regress

The approved player-left / enemy-right layout is controlled by `core/rpg/abyssScene.js`:
- `PLAYER_ART_FACES_LEFT` and `PLAYER_ART_FACES_NEVER` are reviewed native-facing overrides. Don't delete or casually regenerate these sets.
- `playerFaceKey`, `enemyNativeFacing`, `PLAYER_SLOT`, `ALLY_ARC` and the `flip` calculations in `planCombatLayout` control how actors face each other.
- Monster-size changes affect rendered height only. They must not alter a player's `flip`, player slot, facing tables or direction-resolution logic.
- Run `scripts/abyss_visual_qa.js` and `core/utils/faceAudit.js` where dependencies are available.

## Mixed-tier dungeon safety

`core/rpg/partyDungeonRank.js` is the pure policy function used by `guildAdventure.js`. Mixed-tier groups are limited to one rank above the lowest-ranked member and receive a visible warning. High-ranked players must not pull low-ranked members into dangerous content.
Run `node scripts/qa_party_dungeon_rank.js` after changing party rank or dungeon-start code.

## Safe-change checklist

1. Keep changes on `audit/fix-pass-1`.
2. Preserve approved player direction unless the owner explicitly requests a direction change.
3. Update renderer cache versions when model output changes.
4. Run both new static QA scripts and existing homestead/abyss QA suites where dependencies are available.
5. Inspect a real output render before claiming visual defects are fixed.
