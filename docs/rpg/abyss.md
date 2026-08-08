# RPG Subsystem: Abyss System

## What it is
The Abyss is an endless dungeon-crawl mode where players descend through floors, fighting increasingly difficult enemies. HP persists between encounters within a run, creating a survival challenge. The Abyss is the primary source of fragments for summon egg crafting and is the main high-level gold/XP income source.

## Core Components

### Floor Structure (`core/rpg/abyssSystem.js`)
- Floors are grouped into tiers: F (1-10), C (11-20), B (21-30), A (31-40), S (41-50), SS (51-60), SSS (61-70), ABYSSAL_GOD (71+)
- Each floor spawns 1 enemy (regular or boss)
- Boss floors: every 5th floor (5, 10, 15, ...) — 5x reward multiplier
- Run cooldown: 12 hours between Abyss runs

### Reward Formula
```
gold = floor(100 * tierMult * bossMult * floorMultiplier)
xp   = floor(50  * tierMult * bossMult * floorMultiplier)
```

**Tier multipliers:** F=1, C=2, B=4, A=8, S=20, SS=50, SSS=150, ABYSSAL_GOD=1000, GOD=5000

**Floor multiplier:** `1.0 + (floor - 1) * 0.15 + pow(floor - 1, 1.5) * 0.05`

**Boss multiplier:** 5x for boss enemies

### Fragment Drops
- Floor >= 50 OR MYTHIC rarity: legendary fragment
- Floor >= 21 OR LEGENDARY: epic fragment
- Floor >= 11 OR EPIC: rare fragment
- Default: common fragment
- Higher of (floor-based, rarity-based) tier is used

### Persistent HP System
- Player HP carries over between floors within a run
- Energy also carries over
- If HP reaches 0: run ends, player returns to surface
- Hospital command available for healing (12h cooldown)

### Boss Floors (Floor 21+)
- Guaranteed rune drop on boss kills (Floor 21+)
- Drop chance: 30% (Floor 50+), 15% (Floor 21-49)
- Drop types: greater, supreme, mythic runes

### Treasure Caches
- Random treasure events during Abyss runs
- GOLD_CACHE: awards gold scaled by tier multiplier
- Other types: items, fragments, runes

## Recent Changes
- Abyss banner now shows "FLOOR N" instead of rank (Go renderer `Floor` field)
- HP/EN carry-over from `abyssRun.currentHp` / `abyssRun.currentEnergy`
- RPG mods bypass Abyss cooldown (can enter at any time)
- Abyss command routing fixed (`.s combat attack` redirects properly)
- Abyss resume: can resume interrupted runs
- Wild summon encounters: 10% spawn rate (was bugged — fixed in audit)
