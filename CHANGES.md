# Audit Pass 1 — Bug Fixes & Polish

This document tracks every issue found during the systematic audit of the
`whatsapp-bot` RPG codebase, the fix applied, and the reasoning.

Each fix is also covered by a regression test in `/home/z/my-project/scripts/`.

---

## Batch 1 — Progression & Class Foundation (commit 1)

### BUG-001 [MAJOR] — XP milestone multipliers stacked instead of replacing
**File:** `core/rpg/progression.js`
**Symptom:** Late-game XP requirements were mathematically unobtainable.
At level 75→76, a player needed **219,632,652 XP** for a single level-up.
With quest XP capped at ~5,000 per boss kill, that would require ~44,000
boss kills per level.
**Root cause:** The `getXPForLevel` loop applied every milestone multiplier
in sequence:
```js
if (i >= 10) xpNeeded = Math.floor(xpNeeded * 1.2);
if (i >= 25) xpNeeded = Math.floor(xpNeeded * 1.3);
if (i >= 50) xpNeeded = Math.floor(xpNeeded * 1.5);
if (i >= 75) xpNeeded = Math.floor(xpNeeded * 1.8);
```
At L75 this compounds to `1.2 × 1.3 × 1.5 × 1.8 = 4.212×`.
**Fix:** Milestones are now TIERED REPLACEMENTS — only the highest applicable
tier applies. At L75, only 1.8× is used.
**Result:** L75→L76 now requires **93,860,109 XP** (still a grind, but ~2.4×
lower and within design intent).
**Test:** `test_progression.js` → `XP needed for level 75->76 is achievable`

---

### BUG-002 [MINOR] — Duplicate `PALADIN` key in `CLASS_MODIFIERS`
**File:** `core/rpg/progression.js` (lines 56 and 67)
**Symptom:** Silent override of an identical entry. No functional impact
because both definitions happened to be the same, but a maintenance trap
for anyone editing only one of them.
**Fix:** Removed the duplicate.
**Reasoning:** JavaScript object literals silently drop earlier keys when
duplicated. Even when harmless, this is a code smell that hides intent.

---

### BUG-003 [MINOR] — `getGPLeaderboard` was a stub returning `[]`
**File:** `core/rpg/progression.js`
**Symptom:** The GP leaderboard command would always return "no data" even
for active players with thousands of GP.
**Fix:** Implemented to query the economy cache and return the top users by
lifetime `totalGP`, mirroring the pattern used by `getLeaderboard('xp')`.

---

### BUG-004 [MAJOR] — `economy.hasItem` didn't handle the object-shape inventory
**File:** `core/rpg/economy.js`
**Symptom:** `hasItem()` always returned `false` for any item stored as
`{ id, quantity, ... }` (the current inventory shape), because the code did
`(user.inventory[itemId] || 0) > 0` which evaluates `{...} || 0` to the
object, then `{} > 0` is `false`.
**Impact:** Any code path that used `economy.hasItem()` to gate behavior
(registering a class change, opening a special dungeon, buying an item that
requires a prerequisite) was broken. The `inventorySystem.hasItem` (the
canonical version) was correct, but `economy.hasItem` was a parallel buggy
copy that some callers still used.
**Fix:** Handle both legacy (plain number) and current (object with
`quantity`) inventory shapes.

---

### BUG-005 [MAJOR] — `canEvolve` used `arguments[5]` and ignored most requirement fields
**File:** `core/rpg/classSystem.js`
**Symptom:** Evolution requirements like `victories`, `dragonsKilled`,
`goldEarned`, and `undeadKills` were defined in class data but never
checked. A player could evolve to **Warlord** (which requires 100 victories)
without ever winning a single quest, evolve to **Dragon God** (200 dragon
kills) with 0 kills, evolve to **Tycoon** (500k gold earned) by simply
having 200k on hand, etc.
**Root cause:**
1. The function used `arguments[5]` to read the 6th positional argument
   (gold) — unreadable, broken in arrow functions, and only worked for
   one specific field.
2. The `dragonsKilled` parameter was declared but never used in the body.
3. No logic existed for `goldEarned`, `victories`, or `undeadKills`.
**Fix:** Replaced the positional `arguments[5]` pattern with an explicit
`userContext` parameter (`{ gold, goldEarned, victories, undeadKills }`).
Now checks every requirement field declared in class data.
**Caller updated:** `core/commands/skillCommands.js` `handleEvolve()` now
passes the full context object.

---

### BUG-006 [MAJOR] — `calculateAdventurerRank` ignored the GP requirement
**File:** `core/rpg/classSystem.js`
**Symptom:** Every adventurer rank from E to GOD has a `gp` requirement
(50 → 25000). The function accepted `gp` as a parameter but never compared
it against the requirement. A player could hit GOD rank with 0 GP as long
as they had the level (100) and quest count (1000).
**Fix:** Now enforces `gpVal >= req.gp` in addition to level and quests.

---

### Test Coverage Added
- `scripts/test_harness.js` — mocks mongoose, botConfig, db so all 21 RPG
  subsystems can be imported standalone.
- `scripts/test_progression.js` — 9 tests covering XP curve, stat allocation,
  soft cap, reset, level-up flow.
- `scripts/test_classSystem.js` — 10 tests covering adventurer rank GP gating,
  evolution requirement checks (victories / dragons / gold earned / undead),
  lineage walking, fighter-lineage recognition.
- `scripts/smoke_imports.js` — verifies all 21 RPG modules import cleanly.

**Test results after Batch 1:**
- Progression: 9/9 pass
- Class System: 10/10 pass
- Smoke imports: 21/21 pass
