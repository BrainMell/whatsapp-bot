# ⚔️ SUMMONS — IMPLEMENTATION REMOVED (2026-11-06)

The entire summons implementation was scraped for the **summon-cards overhaul**
(summons return as special cards: mod-only acquisition for now, a hub-side card
slot UI, per-card animated abilities with cooldowns — spec in flight).

**What was removed:** this whole subsystem (12 modules), the `.j summon` command
router (`core/commands/summonCommands.js`), the Mongo models (`core/models/Summon.js`,
`SummonTrial.js`, `SummonMarket.js`), the GIF delivery util (`core/utils/summonGifDelivery.js`),
and every call site that wired into them (engine, guildAdventure, pvp, abyss,
loot drops, shop, player market, admin give, tutorial, structure scenes, economy
migrations, User schema fields, command registry).

**The pointer you're looking for — the summon ASSETS stay in the repo, untouched:**

```
core/rpgasset/summons/        ← 7,315 files: digimon/ cache, retromon/,
                                sparklinlabs/ packs, SD .pngs (ifrit, leviathan…)
assets/v3/hires/summons/      ← summon skill-node / archetype art (v3 pack)
```

Any rebuild should load sprites from those folders. Nothing else in `core/`
references the old subsystem; `core/rpg/registry.js` auto-discovers subsystem
folders, so with no `index.js` here the `summons` registry entry is gone.

**Old player data (Mongo `Summon` / `SummonTrial` / `SummonMarket` collections
and the summon fields on user docs) was left orphaned on purpose** — no code
reads it; it can be migrated or dropped when the card system lands.

Inert remnants kept on purpose (data-only, zero runtime coupling):
boss drop-table egg entries were removed, but summon-flavored item catalog
entries (eggs/fragments/gear) remain sellable mementos, the guild
`summonSanctum` building config stays (uncalled), and combat renderers still
tolerate `summons: []` payloads.
