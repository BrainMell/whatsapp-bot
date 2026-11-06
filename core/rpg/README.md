# RPG Subsystem Architecture

The RPG side of the bot is organized as **13 self-contained subsystems** under
`core/rpg/systems/`. The goal: **you can overhaul, rewrite, or rip out any one
subsystem without the rest of the game falling over** — as long as you keep that
subsystem's `index.js` exports stable.

```
core/rpg/
├── registry.js            ← the wiring point: use('<name>') → subsystem API
├── index.js               ← one-stop import: require('./rpg') === the registry
├── README.md              ← this file
└── systems/
    ├── shared/            ← foundation everything may use: mediaCache, dayNight,
    │                        emojiFont/emojiBitmap, isoShadow, ambient, lootArt,
    │                        loreDrops/loreContent, broadcastHelpers, renderWarmer,
    │                        shipCardRenderer
    ├── economy/           ← Zeni, registration, stockMarket, investment, loans,
    │                        itemMarket, playerMarket
    ├── characters/        ← classSystem, progression (XP/levels), skillTree,
    │                        skillAssets, abilityCards
    ├── combat/            ← combatIntegration, bossMechanics, classEncounters,
    │                        encounterFramework, monsterSkills, enemyVariants,
    │                        threatSystem, skillVfx + the whole ultimateFx family
    ├── adventures/        ← guildAdventure (solo/party crawler), abyss, raids,
    │                        bounties, soulReader, partyDungeonRank
    ├── guildwar/          ← guilds, guildPerks, guildCard(+Warmer),
    │                        guildBaseRenderer + the war engine (war.js = old
    │                        guildWar/index.js; state, dmRouter, rooms, ruinsPvp…)
    ├── world/             ← worldMap + renderers, continents, cosmology,
    │                        worldAlignment, deadWorld, kingdom3d/terrain, wilds,
    │                        structureScenes, dockPov/huntPov/minePov
    ├── summons/           ← summonSystem, summonAI, capture, eggs, forging,
    │                        bondTraits, skillTrees, sprites, codex/roster renderers
    ├── pvp/               ← pvpSystem (duels)
    ├── cards/             ← cardSystem (gacha, tokens, auctions)
    ├── inventory/         ← inventorySystem, lootSystem, durability, runes,
    │                        runeSynergies, weaponSynergy, crafting
    ├── homestead/         ← homestead + rooms, baseBuilder, baseActivities,
    │                        interior3d/
    └── meta/              ← socialSystem, interactionTracker, tutorial,
                             testerSystem, altDetection, profileCardRenderer
```

## The rules

1. **A subsystem may require `shared/` directly.** That's what it's for — stable,
   low-churn foundation (media cache, time-of-day, emoji glyphs…).
2. **A subsystem reaches another subsystem only through its `index.js` API** —
   either `require('../../registry').use('economy')` or, for legacy code, that
   system's folder path. Never deep-require another system's private files.
3. **Every subsystem exposes its public API in `systems/<name>/index.js`.**
   Export keys = module filename stems (`use('summons').summonSystem`).
   Keep old exports working when you refactor inside; add new ones freely.
4. **Engine and command routers are consumers, not owners.** `core/engine.js`
   dispatches into subsystems; gameplay state lives inside the subsystem.

## How to overhaul a subsystem (the whole point)

Example — rebuild PvP:

1. Read `systems/pvp/index.js` — that's the API surface other code depends on.
2. Grep who consumes it: `grep -rn "use('pvp')\|systems/pvp" core/ --include='*.js'`
   (today: engine.js routes `.j combat`, summonCommands pulls it, guildwar's
   ruinsPvp bridges into it).
3. Rewrite everything inside `systems/pvp/` however you like — new files, new
   data model, new rendering — as long as `index.js` keeps exporting the same
   names (or you bump the consumers in the same commit).
4. Its persistence stays in Mongo models + the `System` KV keys it owns
   (see table below) — rename keys only if you write a migration.

No other subsystem needs to know it happened.

## Persistence ownership (System KV store)

| Subsystem | Keys |
|---|---|
| cards | `token_rate_modes`, `card_active_groups_*`, `card_roles_*`, `card_spawn_interval_*`, `card_hidden_sets`, `card_tier_config_*`, `token_event_*`, `card_token_spawn_counters_v1`, `card_token_cmd_counters_v1`, `eshop_deck_*`, `card_render_mode_*`, `auction_gc_id`, `card_token_lb_hidden` |
| guildwar | `guild_system` (also `GuildWarEvent` Mongo), `gw_align_announced_*`, `gw_rpg_gcs_*` |
| economy | `rpg_daily_quest_cap`, `economy_market_cap` |
| meta | `_shared_game_testers`, `_shared_tester_gcs`, `_shared_rpg_test_mode`, `custom_classes_v1` (characters), `custom_skilltrees_v1`, `custom_skills_v1` (characters) |
| characters | `custom_classes_v1`, `custom_skilltrees_v1`, `custom_skills_v1` |
| pvp | duel invites / active duels (in-memory + `activeDuels` sweeper) |
| combat | `_shared_warlog_off`, `_shared_encounter_sessions` |
| meta (profile) | `_shared_default_card_style` |
| world | `_shared_world_alignment_last_event` |
| adventures | `veil_reading_<userId>` (soulReader) |

Player/profile data itself lives in Mongoose models (`User`, `Summon`, `Guild`,
`Homestead`, `Base`, `RaidBoss`, `Bounty`, `Loan`, markets, `AbyssRun`…).

## Schedulers

Inside subsystems: economy (weekly wealth tax), cardSystem (auction finalizer +
gif cache sweep), guildAdventure (quest sweeper), guilds (invite expiry),
homestead (cache sweeps), interactionTracker (Mongo flush), pvpSystem (duel
sweeper), baseBuilder (dedup sweep), guildCardWarmer (warm cycle).
Outside: engine.js's 60s tick drives `worldAlignment.tick()` and guildwar's
`state.tick()` — the RPG heartbeat lives in the engine.

## Known debt (documented, not hidden)

- **rpg → engine back-edges**: `abyssSystem`, `cardSystem`, `economy`,
  `progression`, `pvpSystem`, `soulReader`, `testerSystem`, `worldMap` still
  `require('../engine')` (now `../../../../core/engine` relative to their new
  homes) — a genuine cycle. Sever these by having the engine inject hooks via
  the registry when you next touch those files.
- `guildAdventure.js` (14.5k lines) is a subsystem-in-one-file; treat
  `systems/adventures/` as its future breakup site.
- Dev scripts under `scripts/` pin many internal paths; a handful were already
  broken before this reorganization (qa_*/test_summon_phase* etc.).
