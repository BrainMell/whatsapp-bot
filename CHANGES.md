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

---

## Batch 2 — PvP, Inventory, Boss Mechanics, useItem (commit 2)

### BUG-007 [MAJOR] — `pvpSystem.challengePlayer` allowed self-challenges
**File:** `core/rpg/pvpSystem.js`
**Symptom:** A user could challenge themselves to a duel, which would create
a nonsensical 1-player duel state.
**Fix:** Explicitly reject `resolvedChallenger === resolvedTarget`.

### BUG-008 [MAJOR] — `pvpSystem.acceptChallenge` left invite in map on failure
**File:** `core/rpg/pvpSystem.js`
**Symptom:** When `acceptChallenge` failed (target couldn't afford the stake,
or one player unregistered), the invite stayed in `duelInvites` and blocked
ALL new challenges in that chat for 2 minutes. Confirmed by reproducing:
```
Challenge created: true
Accept success: false
New challenge possible: false | msg: ❌ A challenge is already pending!
```
**Fix:** Added `cleanupAndFail()` helper — every failure path now deletes
the invite before returning.

### BUG-009 [MAJOR] — `pvpSystem.challengePlayer` didn't check target wallet
**File:** `core/rpg/pvpSystem.js`
**Symptom:** Challenger could stake 10k Zeni against a target with only 100
Zeni. The challenge was created; target couldn't accept; challenger was
locked for 2 minutes.
**Fix:** Soft target-wallet check at challenge time (still re-verified at
accept time since wallets can change).

### BUG-010 [MAJOR] — `pvpSystem.handlePvPAction` ignored removeItem result
**File:** `core/rpg/pvpSystem.js`
**Symptom:** Combat item use called `inventorySystem.removeItem()` but
ignored the return value. A failed remove (item already gone, quantity 0)
would still let the player use the item's effect for free.
**Fix:** Verify removeItem succeeded before applying the effect.

### BUG-011 [CRITICAL] — `inventorySystem.equipItem` could silently lose items
**File:** `core/rpg/inventorySystem.js`
**Symptom:** When swapping a two-handed weapon into main_hand while a
one-hander + shield were equipped, the code did:
1. `removeItem(newItem)` — frees 1 slot
2. `addItem(oldOffHand)` — uses 1 slot
3. `addItem(oldMainHand)` — uses 1 slot

If the inventory was full at step 1, step 3 would fail silently (return
value ignored), and the old main-hand item was lost forever.
**Fix:** Pre-check inventory space for the worst-case swap. Rollback on
any addItem failure (re-equip the displaced item + put the new item back
in inventory).

### BUG-012 [MAJOR] — `inventorySystem.useItem` HP potions lied to the player
**File:** `core/rpg/inventorySystem.js`
**Symptom:** HP potions wrote to `user.stats.hp` and `user.stats.maxHp`,
but the user schema has no HP field — those properties were never read
elsewhere. The potion message said "💚 Restored X HP!" but the player's
actual HP didn't change. (HP isn't persistent outside combat.)
**Fix:** Block out-of-combat use of HP potions / holy_water with a clear
message directing the player to use them during combat via `combat item`.

### BUG-013 [MAJOR] — `inventorySystem.useItem` energy potions capped at 100
**File:** `core/rpg/inventorySystem.js`
**Symptom:** Energy potions used `user.maxEnergy || 100` to cap the result.
But `user.maxEnergy` is never initialized — it's derived dynamically from
`progression.getBaseStats` (formula: `100 + (level-1)*15 + mag*3`). For a
L50 mage with 100 MAG, actual maxEnergy is 1135, but potions capped at 100
— effectively useless for high-level mages. Also, `user.energy || 0` treated
undefined (first-time user) as 0, so a fresh user drinking an energy potion
would "restore" to 30 (down from the implicit 100 default).
**Fix:** Use `progression.getBaseStats(userId, user.class).maxEnergy` for
the actual cap. Treat undefined `user.energy` as full (matches the
mineOre behavior of defaulting to 100).

### BUG-014 [MINOR] — `bossMechanics.selectBossAction` claimed weighted but was uniform
**File:** `core/rpg/bossMechanics.js`
**Symptom:** Comment said "Select random ability weighted by priority" but
code was `abilities[Math.floor(Math.random() * abilities.length)]` — pure
uniform.
**Fix:** Implement weighted selection. Ability entries can be either a
string (uniform weight 1) or `{ id, priority }` (weight = priority).

### BUG-015 [MINOR] — `bossMechanics.triggerEnrage` returned null in edge case
**File:** `core/rpg/bossMechanics.js`
**Symptom:** If a boss had `enrageTimer` set but no `hardEnrage` effect
configured, `triggerEnrage` returned `null`. The caller would then end
the turn with a null result.
**Fix:** Return a fallback generic enrage effect.

### Test Coverage Added
- `scripts/test_batch2.js` — 15 tests covering hasItem, inventory add/remove,
  upgrade cost, PvP challenge/accept cleanup, self-challenge block.

---

## Batch 3 — Stock Market, Investment, Loans, Crafting (commit 3)

### BUG-016 [MAJOR] — `stockMarket.buyStock/sellStock` accepted non-numeric amounts
**File:** `core/rpg/stockMarket.js`
**Symptom:** `buyStock(id, 'ARCH', 'abc')` would slip past
`amount <= 0` (because `'abc' <= 0` is `false` — JS string-vs-number
comparison) and produce NaN portfolios.
**Fix:** Explicit `Number.isFinite(amt) && amt > 0` check, plus
`Math.floor` to enforce whole shares.

### BUG-017 [MINOR] — `stockMarket.getPortfolio` crashed on delisted stocks
**File:** `core/rpg/stockMarket.js`
**Symptom:** If a stock symbol was removed from `STOCKS` in an update but
a user still held shares, `getPortfolio` would crash on `stock.name`.
**Fix:** Return a "(delisted)" stub entry instead.

### BUG-018 [CRITICAL] — `investment.startInvestment` free-money exploit
**File:** `core/rpg/investment.js`
**Symptom:** Same JS-comparison trap as BUG-016. A non-numeric `amount`
would slip past every numeric check, then `economy.removeMoney` would
silently fail (it has its own NaN guard), but the investment was still
pushed to the user's portfolio. At maturity, the user could claim the
expected payout — getting free money without ever depositing anything.
**Fix:** Validate `amt = Number(amount)` up front; verify `removeMoney`
returned true before recording the investment.

### BUG-019 [MAJOR] — `loans.requestLoan` used total balance but acceptLoan used wallet
**File:** `core/rpg/loans.js`
**Symptom:** `requestLoan` checked `lenderBal.total` (wallet+bank) but
`acceptLoan` checked `lenderBal.wallet` only (since `removeMoney` only
touches wallet). A lender with bank funds but no wallet could pass the
request check, then fail at accept time.
**Fix:** Use `wallet` consistently in both functions.

### BUG-020 [MAJOR] — `loans.acceptLoan` ignored transfer return values
**File:** `core/rpg/loans.js`
**Symptom:** `economy.removeMoney` and `economy.addMoney` were called
without checking return values. If `removeMoney` failed (e.g. wallet
dropped between the check and the call) but `addMoney` succeeded, the
borrower received free money and the lender lost nothing — but the loan
was still recorded as active, so the borrower would later be force-
collected for money they never received.
**Fix:** Verify both legs of the transfer succeeded; roll back the
deduction if crediting the borrower fails.

### BUG-021 [MAJOR] — `loans.acceptLoan` left request in map on failure
**File:** `core/rpg/loans.js`
**Symptom:** Same UX bug as BUG-008. Failed accepts left the request in
`pendingLoans` and blocked all new loan requests for 2 minutes.
**Fix:** Same `failAndCleanup` pattern.

### BUG-022 [MAJOR] — `loans.requestLoan` didn't validate numeric inputs
**File:** `core/rpg/loans.js`
**Symptom:** Same JS-comparison trap as BUG-016/018 — non-numeric
amount/interest/duration would slip past every check.
**Fix:** Coerce all three inputs with `Number()` and validate with
`Number.isFinite`.

### BUG-023 [MINOR] — `craftingSystem.dismantleItem` over-conservative space check
**File:** `core/rpg/craftingSystem.js`
**Symptom:** Used `hasInventorySpace(userId, totalItemsToReturn)` without
passing `itemId`, so it didn't know about material stacking or existing
inventory entries. Dismantle would be refused when the materials would
actually fit fine via stacking.
**Fix:** Per-ingredient check that accounts for material stacking and
existing entries; rollback on partial failure.

### Test Coverage Added
- `scripts/test_batch3.js` — 12 tests covering stock market, investments,
  loans validation.

**Cumulative test count: 67 tests, all passing.**
