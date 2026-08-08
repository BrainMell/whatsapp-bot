# RPG Subsystem: Summon System

## What it is
The Summon System is a full pet/companion system allowing players to collect, train, deploy, and battle monsters called "summons." Summons are obtained through eggs (purchased or crafted from Abyss fragments), leveled up through combat, and can be deployed in PvE and PvP. The system includes a Main Deck/Backlog organization, soul forging (combining two summons), a summon market, and dedicated summon-vs-summon PvP duels.

## Core Components

### Summon Registry (`core/rpg/summonRegistry.js`)
Defines all 26 valid summon species with their stats, abilities, archetypes, elements, and rarities.

**Species list:** bat, boar, chest, dino, dragon, ghost, giant, mimic, mushroom, octopus, reptile, slime, snake, yeti, ship_cruiser, ship_fighter, ship_squid, plaguefang, lumenmoth, emberwick, skitterswarm, tidalmaw, fireguard, boglurk, frostpeep, starnail

**Rarity tiers:** COMMON, RARE, EPIC, LEGENDARY, MYTHIC — each with a `statGrowthMult` (1.0 → 1.9)

### Egg System (`core/rpg/summonEggSystem.js`)
- **Basic Egg**: 5,000 Zeni from shop. Hatches 1 of 4 starter summons. 1h incubation.
- **Rare/Epic/Legendary/Mythic Eggs**: Crafted from 10 fragments of the previous tier. 4h/12h/24h/48h incubation.
- **Speed-up costs**: 2K/10K/30K/100K/500K Zeni to skip incubation.
- **Fragment drops**: Based on Abyss floor depth + species rarity.

### Main Deck / Backlog
- **Main Deck**: Max 5 summons (deployable in combat). `inMainDeck === true`.
- **Backlog**: Unlimited storage (not deployable). `inMainDeck !== true`.
- **Canonical filter**: `isInMainDeck(summon)` and `isInBackground(summon)` are the SINGLE source of truth. All other functions route through these helpers.
- **Swap**: `.summon swap <backlog#> <deck#>` moves a backlog summon into a deck slot.

### Deploy System
- Only 1 summon can be deployed at a time (`user.activeSummonId`).
- Deploy command: `.summon deploy <#>` or `.summon <#> deploy` — both route through the same `summonSystem.deploySummon()` function.
- Deploying from backlog automatically moves the summon to the Main Deck.

### Soul Forging (`core/rpg/summonForging.js`)
- Combines 2 summons into 1 enhanced summon.
- Cost: `50,000 + (totalLevel * 1,000)` Zeni.
- Cooldown: 1 forge per day.
- Result: +10% stat bonus, 1-3 random mutations.
- Purebred (3+ generations same species): +10% all stats.
- Crossbred: +5% all stats + double mutation chance.
- Soulbound: can't trade for 7 days after forging.

### Summon Market
- Players list summons for sale at a chosen price.
- 5% listing fee (paid upfront, permanently removed).
- Buyer pays full price → seller receives full price.
- Soulbound summons can't be listed.

### Summon PvP Duels
- Summon-vs-summon turn-based combat via `pvpSystem.js`.
- Both players must have a deployed summon.
- Uses `mode='summon'` in duel state.
- Rewards: summon XP, loyalty changes (winner -1, loser -2), ELO tracking.
- Flee penalty: -10 loyalty (no gold/XP/item loss).
- Combat image: dedicated `isPvPSummonDuel` render path with text name labels (no portraits).

### Summon AI (`core/rpg/summonAI.js`)
- `performSummonAction()`: called when summon's gauge fills in PvE combat.
- Uses `monsterSkills.evaluateAction()` for AI decisions.
- Full skill execution via `guildAdventure.applyAbilityEffect()` (not a stub).
- Generates combat image via `nextTurn()` after action.

### Summon Achievements (`core/rpg/summonAchievements.js`)
14 achievements granting permanent stat bonuses or summon slots. No direct gold rewards.

## Key Commands
| Command | Description |
|---------|-------------|
| `.summon` | Open summon codex (Pokédex-style) |
| `.summon <#>` | View summon #N details (animated GIF) |
| `.summon <#> deploy` | Deploy summon #N |
| `.summon deploy <#>` | Same as above (alternate syntax) |
| `.summon dismiss` | Undeploy active summon |
| `.summon swap <backlog#> <deck#>` | Swap backlog → deck |
| `.summon list` | Text list of all summons |
| `.summon abilities` | View active summon's abilities |
| `.summon eggcraft <tier>` | Craft egg from fragments |
| `.summon use <egg>` | Hatch an egg |
| `.summon duel @user [wager]` | Challenge to summon PvP |
| `.summon market sell <id> <price>` | List summon for sale |
| `.summon market buy <id>` | Buy listed summon |
| `.summon market list` | Browse market |
| `.summon train` | Train summon (daily cooldown) |
| `.summon forge <id1> <id2>` | Soul forge two summons |

## Recent Changes (2026-08-08)
- Consolidated deploy to single canonical path (eliminated double-fetch bug)
- Fixed Main Deck/Backlog membership (canonical `isInMainDeck`/`isInBackground`)
- Deck size increased from 3 to 5 slots
- Removed all legacy Digimon-era summons
- Added `giant.png` to facing map (was missing, caused facing bug)
- Summon duel end-of-combat handling verified (finishSummonDuel)
- Fixed `[object Object]` crash in PvP action result concatenation
