# ⚔️ SUMMONS — IMPLEMENTATION REMOVED (2026-11-06)

The entire summons implementation was scraped for the **summon-cards overhaul**
(summons return as special cards: mod-only acquisition for now, a hub-side card
slot UI, per-card animated abilities with cooldowns — spec in flight).

**What was removed:** this whole subsystem (12 modules), the `.j summon` command
router (`core/commands/summonCommands.js`), the Mongo models (`core/models/Summon.js`,
`SummonTrial.js`, `SummonMarket.js`), the GIF delivery util (`core/utils/summonGifDelivery.js`),
the Digimon crossover sprite cache (see below), and every call site that wired
into them (engine, guildAdventure, pvp, abyss, loot drops, shop, player market,
admin give, tutorial, structure scenes, economy migrations, User schema fields,
command registry).

**The pointer you're looking for — the summon ASSETS stay in the repo, untouched:**

```
core/rpgasset/summons/        ← 76 files (~4M): the sprites the RPG actually used
  retromon/            16 original creatures (Atrox, Charmadillo, Cindrill, Cleaf, Draem, …)
  sparklinlabs/        26 starter-family sprites (bat, boar, boglurk, chest, dino, dragon, …)
  sparklinlabs_abyss/  27 abyss-tinted variants
  root SD pngs          7 boss-summon art pieces (ifrit / leviathan / shiva variants)
```

**Digimon cache removed (2026-11-06):** the `digimon/` folder (158 files, 18M —
API-cached crossover sprites + `_digimon_mapping.json`) was scraped on
Mellow's call — it was never the RPG's own roster. The one-off
`scripts/clean_digimon_cache.js` halo-scrubber went with it.

Any rebuild should load sprites from the folders above. Nothing in `core/`
references the old subsystem; `core/rpg/registry.js` auto-discovers subsystem
folders, so with no `index.js` here the `summons` registry entry is gone.

**Old player data (Mongo `Summon` / `SummonTrial` / `SummonMarket` collections
and the summon fields on user docs) was left orphaned on purpose** — no code
reads it; it can be migrated or dropped when the card system lands.

Inert remnants kept on purpose (data-only, zero runtime coupling):
summon-flavored item catalog entries (eggs/fragments/gear) remain sellable
mementos, the guild `summonSanctum` building config stays (uncalled), and
combat renderers still tolerate `summons: []` payloads.
