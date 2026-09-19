# Cosmology Pass — Implementation Notes (2026-09-19)

> First implementation slice of the approved worldbuilding design package
> (pass 2/3 owner rulings). All systems are live-coded, in-memory, and
> schema-free (zero Mongoose model changes, zero migrations).

## What shipped

| System | Files | Notes |
|---|---|---|
| **Lore drops** | `core/rpg/loreDrops.js` + 11 attach sites | `╒ *line* ╛` plain chat text, 30-min per user+chat cooldown, per-chat 10-line recent ring, 0.4-weight "important" lines. Pools: blacksmith, brewing, crafting, enchanting, healing, trading, general_world, 5 abyss pools, 4 encounter pools (openers/barks/env/npc). Never on failure paths, never two per reply, never baked into cards. |
| **Cosmology clocks** | `core/rpg/cosmology.js` | FOUR SEPARATE systems (never merge): FW orbit 5 h (clockwise, 5 game days), Abyss entry 6 h cycle (5 locked + 1 open, gates ENTRY ONLY — nobody inside is ever extracted), Afterlife ~2 d own circuit, Triune alignment = checked STATE (FW bottom ∧ AL at its point; recurs ~weekly by construction, flaggable window via `triuneWindow`). Pure functions of wall time anchored at `T0` — restart-stable, zero persistence. |
| **Player-variant enemies** | `core/rpg/enemyVariants.js` | MIRROR (own class, skewed), WANDERER (other class), OTHER BANNER, TIMELINE_DRIFTER (90+ only). Spawn policy: non-boss 31+/50+/90+ at 12/20/25 %, MIRROR replaces bosses 31+ at 15 %, drifter share 40 % at 90+. Abilities = existing MONSTER_ARCHETYPES tables by class role (no new mechanics). Global 5 % WANDERER swap in standard dungeon encounters (data-level: name/tag/archetype/sprite, stats untouched). |
| **Abyss sprite fix (UI-CB-15)** | `abyssSystem.generateFloorEnemy` + pass-through in `startAbyssCombat` | Every abyss enemy now carries a real element-family `spriteIndex` (was always 0 = bat for everyone) and bosses send a clean `bossId`. |
| **Abyss lore wiring** | `abyssSystem` + `guildAdventure` | Fight-openers on floor intros (10 %), humanoid barks (15 %), env observations on victory (12 % pools by variant tag / depth escalation: 1-30 creature, 31-89 +timeline, 90+ +self-variant), creature-pool line on pack-fight jumps (10 %), NPC sightings on non-hostile floors (8 %). |
| **`.j world` + 4 sub-maps** | `core/rpg/worldMap.js`, `core/rpg/worldMapRenderer.js` | Live node-canvas renders in the Royal Decree chrome with the exact pass-3 geometry (r_FW = R_WB/2 internally tangent, co-rotating quadrant cross, Order at FW center, movement indicator top→right→bottom, shrinking non-orbiting abyss rings, independent afterlife orbit, wax-red triune beam when aligned). Locked maps NEVER render — requirement text only. Text fallbacks for every sheet. |
| **Brewing & repair** | `craftingSystem.js`, `repairCommands.js`, `inventorySystem.js` | 3 new deep brews (`abyssal_tonic`, `warden_broth`, `banner_ale`) reusing existing effect ids + ingredient ids (auto-registered into the item DB by the existing injection). Blacksmith voice on repair/blacksmith surfaces (10-12 %), potion-use healing drops (10 %). |
| **Trading/heal/rune surfaces** | `economy.js`, `shopCommands.js`, `runeSystem.js`, `engine.js` (hospital + menu tips slot) | trading 10 % (transfer/deposit/withdraw/buy), enchanting 10 % (socket/fuse/remove/destroy), healing 10 % (hospital), menu tips: 1-in-6 slots a general_world drop. |

## Tuning knobs (owner-adjustable)

- `loreDrops.CONFIG` — BASE_CHANCE 0.10, COOLDOWN_MS 30 min, RECENT_RING 10, IMPORTANT_WEIGHT 0.4
- `worldMap.ABYSS_MAP_UNLOCK` — **20 (PROPOSED, owner recall; single constant)**
- `enemyVariants.VARIANT_CHANCE / MIRROR_BOSS_CHANCE / GLOBAL_WANDERER_CHANCE / NPC_SIGHTING_CHANCE`
- Per-surface chances at every call site (8/10/12/15 % per the design table)
- Cosmology anchors: `cosmology.T0`, epsilon windows (`FW_BOTTOM_EPS`, `AL_ALIGNMENT_EPS`) set the triune's ~weekly recurrence

## Open owner decisions (unchanged from the design package)

1. Triune consequence — the window fires; nothing is scheduled on it yet (`ideas.md` #13)
2. `ABYSS_MAP_UNLOCK` = 20 needs one word to finalize (`ideas.md` #15)
3. Afterlife sheet stays locked until the dead-soul reading feature exists
4. NPC skill trees remain V2 (owner sign-off; never stored on User)

## QA

- `node scripts/qa_cosmology_pass.js` — four clocks, geometry invariants, lore format/cooldown/routing, variant spawn policy, gate math
- `node scripts/qa_integration_pass.js` — mock-sock command flows: gates refuse with zero image bytes, sheets render, variants spawn, brews registered
- `node scripts/render_world_maps.js <outdir>` — render all four sheets for visual review
