# RPG Subsystem: Rune System

## What it is
The Rune System allows players to socket runes into their class abilities, adding modifiers like damage multipliers, element conversions, cooldown reductions, and status effect applications. Runes are obtained exclusively from Abyss boss kills (Floor 21+).

## Core Components

### Rune Types (`core/rpg/runeSystem.js`)
- **VOID_CONVERSION**: Converts damage type. Skips damage multiplier on DEF-ignoring skills. True damage bypasses all mitigation.
- **SILENCE_INFUSION**: Applies Silence status to target (prevents ability use).
- **COOLDOWN**: Reduces ability cooldown (multiplier, e.g. 0.5 = half cooldown).
- **QUICK_CAST**: Flat cooldown reduction (subtract N turns).
- **IGNORE_DEFENSE**: Percentage-based defense bypass (0-100%).
- Other runes: damage multipliers, lifesteal, element conversion, haste buffs.

### Socketing
- Runes are socketed into specific skill IDs.
- `.s rune socket <skillId> <runeId>` — socket a rune.
- `.s rune sockets` — view all socketed runes across all skills.
- `.s rune remove <runeId/name>` — remove a rune (accepts friendly names, not just R-XXXX IDs).
- `.s rune destroy <runeId/name>` — destroy a rune permanently.

### Name Resolution
- `resolveSocketedRune()`: Accepts both R-XXXX format IDs AND friendly names (e.g. `void_conversion-greater`).
- Remove/destroy commands try direct ID lookup first, then fall back to name resolver.

### PvP Integration
- `applyRuneModifiers()` applied in `handlePvPAction()` for both player and summon duels.
- Silence check: targets with Silence status cannot use abilities.
- VOID_CONVERSION: TRUE damage type sets def=0 (bypasses all mitigation).
- Cooldown runes: `cooldownMult` and `cooldownFlatReduction` applied to effective cooldown.

### Rune Tiers
- Lesser, Greater, Supreme, Mythic — scaling power per tier.
- Drop tiers: greater (Floor 21+), supreme (Floor 50+), mythic (special).

## Recent Changes (2026-08-06)
- Fixed: runes had zero effect in PvP (applyRuneModifiers was missing from handlePvPAction)
- Fixed: Void Conversion damage penalty (TRUE damage was falling into MAG mitigation)
- Fixed: Silence status effect not being applied in PvP
- Added: `.s rune sockets` command to view all socketed runes
- Added: friendly name resolution for remove/destroy (was R-XXXX only)
