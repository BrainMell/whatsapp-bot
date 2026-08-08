# WhatsApp RPG Bot — Master Reference Doc


Consolidated from: `economy_report.pdf`, `difficulty_curve.png`, `envis.txt`, `users_export.csv`, `caludechat.txt` (a prior Claude Code combat-audit + simulation session).

Generated: 2026-08-08


## Table of Contents


1. [Combat System Audit](#1-combat-system-audit)
2. [Real-Player Simulation Findings](#2-real-player-simulation-findings)
3. [Difficulty Curve — Chart Reading + Simulation Narrative](#3-difficulty-curve--chart-reading--simulation-narrative)
4. [Economy Report](#4-economy-report)
5. [Environment Variables / Secrets](#5-environment-variables--secrets)
6. [User Database — Active Users (Summary Table)](#6-user-database--active-users-summary-table)
7. [User Database — Active Users (Full Records)](#7-user-database--active-users-full-records)
8. [Appendix — Original Audit Request & Team Chat Context](#8-appendix--original-audit-request--team-chat-context)


---


## 1. Combat System Audit


Branch audited: `audit/fix-pass-1` (repo: `brainmell/whatsapp-bot`). Full audit as originally produced, unedited — headings below are demoted one level so they nest under this section (§0–§9 numbering is internal to the audit itself, kept as-is for cross-reference).


**Branch audited:** `audit/fix-pass-1` (repo: `brainmell/whatsapp-bot`)
**Scope:** everything that touches combat outcomes — classes, enemies, stats, progression, equipment, status effects, damage math, turn order, RNG.
**Method:** direct source inspection (not docs — the docs undersell how much has already been hand-tuned; see the `💡 QA FIX` / `💡 AUDIT FIX` comments littered through `guildAdventure.js`, which show this file has already been through several balance passes). Chat logs and the economy report you supplied are used as ground-truth for what players are actually feeling in practice, cross-referenced against the code that produces those feelings.

---

#### 0. TL;DR

- **Balance score: 4/10.** Not because the game is un-fun — there's a genuinely thoughtful damage pipeline underneath (shields, CC diminishing returns, elemental chart, environment modifiers) — but because two or three *specific, isolated* numbers dwarf everything else in the system, which flattens all the nuance the rest of the formula tries to build. Fix those three numbers and this jumps to a 7+.
- The single biggest lever in the entire combat system is **not** a stat, a class, or a skill. It's `adventurerRank`: any *player* (never enemies) at D-rank or higher deals **flat 2x damage on every hit, forever**, stacking multiplicatively with everything else. This one `if` statement outweighs the entire stat-allocation, class-selection, and gear system combined.
- **Crit chance has no cap anywhere in the codebase.** By mid-late game (crit stat 80+ base on some classes, plus growth, plus allocation, plus gear) many builds sit at or above 100% crit — "crit chance" stops being a chance.
- **`TOTAL_ANNIHILATION`** (the mechanic your players were angry about in the logs) is a hard turn-30 wipe that sets every player's HP to 0 regardless of stats, DEF, HP pool, or evasion. It's an enrage timer wearing a damage-number costume — it doesn't run through `calculateDamage` at all, so nothing you build can mitigate it. That's *why* 🫩's complaint ("ignores my hp and defence") is literally true, not a perception issue.
- **PEAK-tier classes (19 of them) fall through every per-class scaling table** (`STAT_GROWTH.CLASS_MODIFIERS`, the stat-point tier multiplier) and silently inherit FIGHTER's growth curve and a 1.0x stat-point multiplier — worse than ASCENDED gets. They appear to be shelved/unreachable via the normal `.jk modclass` list right now (confirmed against your own chat log), so this is a landmine waiting for whenever that content goes live, not an active fire.
- Class base stats are wildly inconsistent in how much power each tier jump grants — some STARTER→EVOLVED jumps are +30%, others (WARRIOR, BERSERKER) are +65%+, before any level scaling even applies.

Everything below explains *why*, with line references, then proposes concrete redesign directions.

---

#### 1. How a Hit Actually Resolves — Full Pipeline

This is the annotated order of operations inside `calculateDamage()` (`core/rpg/guildAdventure.js:2118-2477`), the single function every point of damage in the game passes through (PvE, PvP, abyss, raids, summon duels — everything calls this).

```
1.  base damage = power (the flat number passed in — usually skill% × ATK or MAG)
2.  GODMODE check          → instant 99999 dmg / 0 dmg escape hatch (admin/debug only)
3.  Dragon Seal Ring gate  → 0 dmg vs DRAKE_*/DRAGON_* enemies without the ring
4.  RANK BONUS             → ×2.0 damage if attacker.adventurerRank ∈ {D,C,B,A,S,SS,SSS}
                              (PLAYERS ONLY — enemies never carry this field)
5.  Environment mults      → Fire Cave / Demon Castle enemy-only bonuses
6.  def = target.def (physical) | target.mag×0.5 (magic) | 0 (true)
7.  Attack buffs           → damage ×= (1 + Σattack%/100)
8.  Defense buffs          → def ×= (1 + Σdefense%/100)
9.  Status-effect def mods → shield ×1.5, vulnerability ×0.7, berserk(def) ×0.7, curse/weak ×0.8
10. Status-effect atk mods → brittle(target) → dmg ×1.5 physical; curse/weak(attacker) → dmg ×0.8
11. Flat mitigation        → damage -= def × 0.5
12. % mitigation           → totalDmgReduction = target.dmgReduction(=min(65, rawDef×0.55))
                                                  + Σ(dmgReduction buffs) + Σ(all buffs)
                              capped at 90%; damage ×= (1 - totalDmgReduction/100)
13. Class passive (atk)    → damage_when_low_hp / damage_per_hit(combo, capped 5 stacks) /
                              first_turn_bonus / rotate_elements / magic_damage — player-only
14. Class passive (def)    → flat % reduction, player-only, capped 90% combined w/ step 12
15. Shield absorption      → consumes target.statusEffects shield pool before HP
16. Berserk/Blessing (atk) → attacker-side % dmg boosts
17. Blind check            → attacker-side extra miss chance (early return, wasEvaded)
18. Variance               → ×(0.9 – 1.1) uniform random
19. Elemental chart        → ×1.5 strong / ×0.75 weak
20. Crit roll              → Math.random()*100 < attacker.crit → ×1.5 (×2.0 w/ specific rings)
                              (mantlet_of_chaos armor cloak = crit immune)
21. Evasion roll           → Math.random()*100 < target.evasion(+equipment/weather/env) → 0 dmg
22. SS/SSS floor           → enemy hits on players in SS/SSS dungeons can't go below 3%/5% of maxHP
23. Sturdy/anti-oneshot    → a hit that would kill a near-full-HP player instead leaves 2-10 HP
```

A few things jump out just from reading the order:

- **Step 4 (rank bonus) happens before literally every other multiplier**, and it's the single largest constant in the whole function. A C-rank Scout and an S-rank Scout with identical gear, stats, and skill do 2x different damage from one flag on their profile that has nothing to do with build choices.
- **Steps 11+12 both consume the same `def` stat** — once as a flat subtraction, once (via `dmgReduction`, itself derived from the *same* raw def) as a percentage. This isn't necessarily wrong (Diablo/PoE-style games layer flat armor + % resist too), but here the two layers aren't independently tunable — they're both functions of one number, so DEF's marginal value curve bends hard and unpredictably around raw-def ≈ 118 (where `def×0.55` hits the 65% cap and the percent layer stops responding to further investment; see §4).
- **Step 21 (evasion) happens *after* the crit roll, elemental multiplier and full mitigation math** — computationally wasteful, not a balance bug per se, but it means "evasion tanks" pay the full cost of every other calculation for a hit that then gets thrown away half the time. Not a balance issue, but worth flagging as a performance/readability cleanup.
- **`'all'`-type buffs are double-counted.** Look at steps 7-8 vs step 12: a buff tagged `type:'all'` is summed into `defenseBuffPercent` (which multiplies `def` before the flat subtraction) *and* separately summed into `totalDmgReduction` (the percent layer). A buff tagged `type:'defense'` only hits the first channel. So "+30% all stats" buffs are quietly worth much more defensively than a dedicated "+30% defense" buff of the same magnitude — almost certainly not intended, since nothing in the effect authoring surfaces this distinction to whoever is writing skill data.

---

#### 2. The Rank Multiplier — the Real Boss of This Game

```js
// guildAdventure.js:2172-2190
if (attacker.adventurerRank) {
  const rankValueMap = { F:1, E:2, D:3, C:4, B:5, A:6, S:7, SS:8, SSS:9 };
  const rankVal = rankValueMap[attacker.adventurerRank] || 1;
  if (rankVal >= 3) { damage *= 2.0; }   // D-rank and up
}
```

`adventurerRank` is a **player profile field** (`economy.js:1095, 1298`) driven by `calculateAdventurerRank(level, questsCompleted, gp)` — i.e. it's an account-progression gate, not a combat stat, not something you build around, and not something that scales gradually. It's binary: you either have it or you don't, and once you cross D-rank it never goes away.

Enemies are built via `scaleEnemyStats()` in `classEncounters.js`, which sets `.stats.{hp,atk,def,mag,spd}` but **never sets `.adventurerRank` on the scaled enemy object at all** — confirmed by grep across every file that constructs enemy objects. So this multiplier is structurally one-directional: only players ever get it, enemies never do.

**Why this matters more than every other system combined:** every other lever in the game — class choice, stat allocation (soft-capped, tier-multiplied, all carefully tuned with comments about avoiding "stat explosion"), skill tree investment, equipment, runes, forging — competes for marginal percentage gains in the 5-40% range. Rank bonus hands out +100% unconditionally, on top of all of it, the moment you hit an *account* milestone. It explains a huge amount of what your players are describing in the chat log ("mfs one shot everything") — and it explains why Mellow had to invent counter-mechanics like `TOTAL_ANNIHILATION` and `silence` just to give bosses a fighting chance: the intended lever (enemy stat scaling) can't keep pace with a flat player-side 2x that enemies structurally cannot access.

---

#### 3. Class Comparison

##### 3.1 Base stats at unlock, by tier (extracted from `classSystem.js`)

*"off" = a rough offense score (max(atk,mag) + crit×0.5 + spd×0.3), "def" = a rough survivability score (hp/10 + def×1.5). These are not in-game formulas — they're this audit's own composite for ranking, computed directly from the base-stat tables so the tier gaps below are verifiable, not vibes.*

**STARTER**
| Class | Role | Total | Off | Def |
|---|---|---|---|---|
| FIGHTER | TANK | 168 | 18.4 | 27.0 |
| SCOUT | DPS | 156 | 23.8 | 16.5 |
| ACOLYTE | SUPPORT | 156 | 20.0 | 22.0 |
| APPRENTICE | MAGIC_DPS | 134 | 25.7 | 14.0 |

APPRENTICE starts ~20% behind FIGHTER in raw stat total for a class whose entire identity is "glass cannon." That's *fine* if the cannon part is real — but its offense score (25.7) is barely ahead of ACOLYTE, a **support** class. The mage archetype doesn't actually hit harder than the healer archetype at level 1; it's just squishier for no payoff yet (payoff arrives later via the MAGE line's growth modifiers — see §3.2 — but a brand-new player feels strictly worse for picking the "high risk" starter).

**EVOLVED** (sorted by total)
| Class | Role | Total | Off | Def |
|---|---|---|---|---|
| WARRIOR | TANK | 277 | 22.0 | 55.0 |
| BERSERKER | TANK | 276 | 27.3 | 40.0 |
| DRAGONSLAYER | TANK | 253 | 24.4 | 41.5 |
| PALADIN | TANK | 239 | 13.7 | 51.0 |
| SAMURAI | DPS | 207 | 31.8 | 26.5 |
| MAGE | MAGIC_DPS | 193 | 42.6 | 23.0 |
| MONK | DPS | 191 | 26.9 | 24.0 |
| ROGUE | DPS | 186 | 36.5 | 17.5 |
| NINJA | DPS | 186 | 36.6 | 15.5 |
| DRUID | SUPPORT | 182 | 25.3 | 26.5 |
| MERCHANT | SUPPORT | 176 | 19.5 | 22.5 |
| CLERIC | SUPPORT | 175 | 26.2 | 24.5 |
| ARTIFICER | SUPPORT | 174 | 23.8 | 24.3 |
| ELEMENTALIST | MAGIC_DPS | 170 | 37.5 | 18.5 |
| WARLOCK | MAGIC_DPS | 169 | 34.4 | 19.0 |
| CHRONOMANCER | MAGIC_DPS | 167 | 38.2 | 17.8 |
| BARD | SUPPORT | 167 | 24.6 | 20.5 |
| NECROMANCER | MAGIC_DPS | 158 | 34.9 | 16.7 |

The four TANK evolutions occupy the **top four slots by total stat budget**, and PALADIN — a class whose entire kit is "be hard to kill" — has the *worst* offense score in the entire evolved tier (13.7) while still out-defending three of the four DPS/MAGIC_DPS lines. Meanwhile every FIGHTER line class (WARRIOR/BERSERKER/DRAGONSLAYER/PALADIN) got a noticeably bigger stat-total jump from STARTER than the SCOUT, APPRENTICE, or ACOLYTE lines did. This is the class-design version of what §2 does at the account level: the tank archetype is just given more total stuff, not a different shape of stuff.

**ASCENDED / PEAK** show the same pattern amplified — see the raw numbers in the appendix table (§9). By PEAK tier, ANNIHILATOR (TANK) posts total=1160 vs DEMIURGE (MAGIC_DPS, the actual "highest single-stat mag" class in the game at 125 base mag) at total=590 — **DEMIURGE has barely half of ANNIHILATOR's stat budget** despite being marketed as the number-crunching endgame caster. Glass cannons in this game are not compensated for their glassiness; they're just cannons with less of everything.

##### 3.2 Per-level growth (`progression.js:37-96`)

```js
getBaseGrowth(level) → { hp:15×f, atk:2.5×f, def:2.0×f, mag:2.5×f, spd:1.5×f, luck:1.2×f, crit:0.6×f }
   where f = 1 + floor(level/15)          // grows in discrete steps every 15 levels
CLASS_MODIFIERS[classId] scales each of the 7 growth numbers per class
```

This is a *good* system in principle — it's the right idea (differentiate classes by growth curve, not just base stats) and the modifier table is genuinely well thought out for the classes it covers (KAGE getting crit 3.0x, TYCOON getting luck 3.5x, etc. — real, legible identity). The problem is coverage, not design:

- `STAT_GROWTH.CLASS_MODIFIERS` only defines entries for STARTER, EVOLVED, and ASCENDED classes. **Every one of the 19 PEAK classes is undefined in this table** and falls back to `CLASS_MODIFIERS.FIGHTER` (`progression.js:322`). A caster like DEMIURGE (mag 125 base) would level up gaining magic at FIGHTER's 0.5x modifier — worse mag growth than *literally every other class in the game*, including FIGHTER itself gets to use its own 0.5x on-brand (FIGHTER isn't supposed to have good mag growth; DEMIURGE emphatically is).
- Right now this is inert — PEAK classes don't appear in the `.jk modclass` list your own logs show (`5:18pm` — the mod-class menu tops out at GRAND_INVENTOR, an ASCENDED class), consistent with the docs' note that PEAK tier is "SHELVED — trial bosses, skill trees, and sprites not yet implemented." **This is a landmine, not a live fire** — but it will detonate the day someone flips PEAK content on unless the modifier table is filled in first.

##### 3.3 Stat-point allocation (`.jk allocate`, `progression.js:374-439`)

```
baseStatValues = { hp:15, atk:3, def:2, mag:3, spd:2, luck:2, crit:1 }   // value per point
tierMultiplier: STARTER/PEAK = 1.0×, EVOLVED = 2.0×, ASCENDED = 2.0×
soft cap: after 20 points in one stat, further points worth 0.5× (partial-fill math for the crossing point)
```

This is the exact mechanic 🫩 and David were arguing about in your chat log — 🫩 wanted class-conditional *bonus* multipliers on top of allocation (a bracket system), David correctly pushed back that "you allocate the class's identity through what you allocate it *to*, not by getting more points for allocating it right" — and landed on rank/tier-based caps instead, which is the same idea you two eventually converged on with the "New Game+ / rebirth" framing. The code already mostly reflects David's position, which is good — the counter-argument in that conversation won and shipped.

Two implementation gaps worth fixing, both small:

1. **PEAK tier isn't in the `tierMultiplier` switch** (only `EVOLVED`/`ASCENDED` are checked; PEAK silently falls to the 1.0× STARTER default at `progression.js:402-404`). Same shelved-content landmine as §3.2 — the top tier would get the *worst* stat-point value in the game once it's live.
2. The soft cap is per-stat, not global, and its "half value past 20 points" partial-fill math (`progression.js:415-421`) is correct and reads fine — no issue there, flagging it only because it's the one piece of this subsystem that's actually solid and worth keeping as-is in any redesign.

---

#### 4. Defense, Evasion, Crit — the Secondary-Stat Layer

- **DEF → damage reduction:** `dmgReduction = min(65, rawDef × 0.55)` (`progression.js:368`). This means the percent-mitigation layer **saturates at raw DEF ≈ 118** — every point of DEF past that is *only* contributing through the flat `def×0.5` subtraction (step 11 in §1), not the percent layer. Given WARLORD alone posts 48 base DEF before any levels/allocation/gear, and DEF growth modifiers go up to 2.2× (TEMPLAR) per level, hitting raw-def 118 happens well before end-game. After that point DEF stops "feeling" like it's doing anything new mechanically (the percent number on your character sheet caps at 65%, visibly flatlining), even though the flat term keeps growing — this is a UX/legibility problem as much as a math one: the game shows you a stat that visibly stops moving while the *actual* mitigation from that same stat keeps changing underneath it.
- **Crit chance has no cap anywhere in the pipeline.** `Math.random()*100 < attacker.stats.crit` (`guildAdventure.js:2401`) is the only crit gate, and nothing clamps `stats.crit` — not in `getBaseStats` (§3.2, only HP/dmgReduction/evasion/energy are clamped there), not in `calculateDamage`. Classes like KAGE (crit growth 3.0×/level, base 50) or YAMI (base crit 80) plus 20+ allocated points plus gear reach 100%+ crit chance well before max level, at which point "crit chance" is a boolean, not a percentage, and the crit multiplier (1.5–2.0×) becomes a second flat damage multiplier stacked permanently on top of rank bonus.
- **Evasion is capped at 45%** in `getBaseStats` (`progression.js:367`) but a separate code path — the `.jk` shield-type buff at `guildAdventure.js:3123` — clamps evasion buffs to **75%**, a different, higher ceiling than the base-stat cap. Not exploitable by itself (75% only applies to the buff component, and it's additive on top of the 45%-capped base), but it's the kind of inconsistency that suggests these two caps were written at different times without cross-referencing each other.

---

#### 5. Enemy Scaling (`classEncounters.js:1111-1200`, `scaleEnemyStats`)

This is honestly the **best-designed system in the codebase** — genuinely worth preserving in any redesign. It's rank-bucketed (F/E → D → C → B → A → S+), each bucket has hand-tuned `dmgFactor`/`hpFactor`/`hpQuadFactor` breakpoints with an explicit target ("~60% player WR" — 60% player win rate), HP scaling includes a quadratic term so high-rank content doesn't just scale linearly, party size scales HP/ATK/MAG together (`partyFactor = 1 + (partySize-1)×0.20`) to keep multiplayer from trivializing content, and enemy speed *rubber-bands toward the party's average speed* rather than being static — archetype-aware (STALKER/ASSASSIN run 15% faster than the party, TANK/BRUTE run 25% slower), with an explicit comment trail (`QA FIX #33`) showing this was iterated on with real playtesting.

The problem isn't this system — it's that **this is the system fighting against §2's 2x rank multiplier and losing.** No amount of `dmgFactor`/`hpFactor` tuning on the enemy side can compensate for a flat, unconditional 2x that enemies structurally cannot receive. That's almost certainly *why* `TOTAL_ANNIHILATION` and abilities like `silence` exist — they're hand-authored patches bolted on top of a well-designed scaling system to compensate for damage the scaling system was never allowed to counter on its own terms.

##### `TOTAL_ANNIHILATION` — the turn-30 wipe (`guildAdventure.js:3893-3909`)

```js
if (state.turnCount > 30) {
  players.forEach(p => { p.stats.hp = 0; p.isDead = true; });   // no roll, no mitigation
  endCombat(sock, false, sessionKey);
}
```

This never touches `calculateDamage()`. It ignores HP, DEF, evasion, shields, class passives — everything the rest of the game asks you to build around. It's a pure **enrage timer**: "if the fight isn't over by turn 30, everyone loses," dressed up with a damage number for flavor. Enrage timers are a completely standard, well-understood tool (real MMOs use them constantly) — the issue here is presentation and asymmetry: it reads as a *combat mechanic* (the boss "attacks" you) when it's actually a *meta rule* (the encounter has a clock), and there's no in-fight signal counting down to it (no "boss grows unstable," no visible timer) apart from the ATK creep at turns 15/20/25 (`×1.05` each, `guildAdventure.js:3888`) which is far too subtle to read as "you have 5-15 turns left before an unconditional wipe."

---

#### 6. Bugs, Exploits, and Dead Mechanics — Summary Table

| # | Issue | Location | Severity | Type |
|---|---|---|---|---|
| 1 | Player-only flat 2x damage at D-rank+, enemies never get it | `guildAdventure.js:2172` | **Critical** | Balance |
| 2 | Crit chance uncapped — 100%+ reachable mid-late game | `guildAdventure.js:2401`, `progression.js` (no clamp) | **Critical** | Balance |
| 3 | `TOTAL_ANNIHILATION` bypasses all mitigation, no telegraph | `guildAdventure.js:3893` | High | Design/UX |
| 4 | `'all'`-type buffs double-counted (flat *and* percent mitigation channel) | `guildAdventure.js:2240-2296` | Medium | Balance bug |
| 5 | PEAK tier (19 classes) missing from `CLASS_MODIFIERS` → inherits FIGHTER growth | `progression.js:322` | Medium (dormant) | Data gap |
| 6 | PEAK tier missing from stat-point `tierMultiplier` → worst point-value in game | `progression.js:402-404` | Medium (dormant) | Data gap |
| 7 | DEF's percent-mitigation layer saturates at raw-def≈118 while flat layer keeps scaling — stat feels like it "stops working" on the character sheet | `progression.js:368` | Low-Medium | Legibility |
| 8 | Evasion has two different caps (45% base, 75% buff) set independently | `progression.js:367` vs `guildAdventure.js:3123` | Low | Consistency |
| 9 | Evasion roll happens *after* full damage math (steps 1-20 wasted on evaded hits) | `guildAdventure.js:2418-2450` | Low | Perf/clarity, not balance |
| 10 | Robbery, respec, and skill-reset costs (from your economy report) all scale off `level`, not off the actual power a respec undoes — so late-game respecs (5-10M Zeni) are priced independently of how big a stat swing rank bonus + crit stacking make possible | `economy.md` cross-ref | Low | Economy/combat interaction |

**Dead/underleveraged mechanics** worth naming even though they're not "broken": the elemental chart (`strongVs`/`weakTo`, ×1.5/×0.75) is a real, working RPS layer that nothing in the class or skill data seems to lean on heavily — enemies get an `element` field but player skills mostly don't route damage through elements in a way that makes RPS matchup decisions visible pre-fight. Given how much other machinery already exists (status effects, environment modifiers, CC diminishing returns), this is a system that's *built* but not *used* as a balancing axis — it could be doing real work instead of being cosmetic flavor text on ability names.

---

#### 7. What Well-Balanced Games (and the People Who Study This) Do Differently

You and David were already reaching for exactly the right reference points in the chat (Dark Souls' NG+ scaling, "there's no reason class should change how many points you get, class should change what those points *do*") — that instinct is correct and matches how the field actually thinks about this problem. A few concrete anchors:

- **Ian Schreiber's "Game Balance" course/book** (RIT; free 10-week version at `gamebalanceconcepts.wordpress.com`, later published as *Game Balance* with Brenda Romero, Routledge/CRC 2021) is the closest thing this space has to a canonical text, and its central vocabulary is directly applicable here: **transitive vs. intransitive mechanics.** A transitive relationship is a strict power ordering (A beats B beats C — this is what "higher rank = flatly stronger" is). An intransitive relationship is rock-paper-scissors (A beats B, B beats C, C beats A — no single best choice). Right now almost everything in this combat system is transitive (rank, tier, raw stat totals all just go up), while the *one* intransitive system you have (the elemental chart) is barely load-bearing. A game with only transitive systems has a single optimal build; a game with a real intransitive layer has *many* viable builds, which is what makes "balance" a meaningful, ongoing conversation instead of a one-time patch. Schreiber's course also gives the vocabulary for exactly the DEF-saturation problem in §4 ("cost curves" and diminishing marginal value should be a deliberate design choice with a visible cap, not an accidental byproduct of composing a flat term with a capped percent term).
- **Path of Exile's armor formula** — `mitigation% = armor / (armor + 10 × incoming_hit_damage)` — is the standard reference for "flat defense stat that scales smoothly against small hits but is deliberately weak against big hits," and it's a good template for replacing this game's def×0.5 + def×0.55%-capped-at-65 combo: one clean formula, self-diminishing (no separate hard cap needed), and its behavior against big single hits vs. many small hits is a real build-differentiating axis (tanky-vs-many-weak-attackers builds vs. tanky-vs-one-big-hit builds) — which maps directly onto the STALKER/BRUTE archetype split this game's enemy AI already has.
- **Tabletop's "bounded accuracy"** (the design principle D&D 5e is built around, and the opposite of what earlier D&D editions did) is the direct antidote to the rank-bonus problem: instead of letting to-hit/damage bonuses grow unboundedly with level so a level-1 creature becomes *literally irrelevant* at level 20, cap the total spread between weakest-relevant and strongest-relevant numbers so that a lower-level threat can still matter (with the right tactics) at higher levels, and — critically — so that *no single flag flips the whole game 2x*. This is the fix for §2, not "nerf the number" but "structurally prevent any one multiplier from being that large relative to everything else."
- **Dark Souls' NG+** (which you two already used as the reference for the "rebirth" idea) is worth citing precisely because it does what your chat log's rebirth proposal wanted: it re-scales *the encounter*, not just the player, on each cycle (enemies get more HP/damage too), so replaying content stays a meaningful choice instead of a pure power spike. If rebirth/prestige ships, it should scale both sides together the same way `scaleEnemyStats` already does for dungeon rank — reusing infrastructure you already have, rather than inventing a second system.

---

#### 8. Redesign Directions

Three drafts, roughly ordered from "surgical, ship this week" to "structural, needs a content pass."

##### Draft A — Fix the Three Numbers (lowest effort, highest immediate impact)

1. **Replace the flat rank-bonus with a smooth, symmetric curve applied to *both* sides.** Instead of `if (rank >= D) damage *= 2.0` for players only, give every combatant (player *and* scaled enemy) a small per-rank multiplier that grows gradually: e.g. `damage *= 1 + (rankVal - 1) * 0.08` (F=1.0x, SSS=1.64x) — meaningful, still rewards progression, but no longer a step function that quadruples the gap between C-rank and D-rank builds overnight, and because it now applies to enemies too via `scaleEnemyStats`'s existing rank-bucket system, the two sides stay in the relationship your `dmgFactor`/`hpFactor` tuning already assumes.
2. **Cap crit chance** (suggest 50-60%, matching the philosophy of the existing 45% evasion cap) in the same place `getBaseStats` already clamps evasion (`progression.js:367`) — one line, `baseStats.crit = Math.min(55, baseStats.crit)`.
3. **Fix the `'all'`-buff double-count** by having the `def *=` step (line ~2251) only read `buff.type === 'defense'`, and keep `totalDmgReduction` as the sole consumer of `'all'`-type buffs. One-line fix, makes "+X% all stats" buffs cost/value-consistent with dedicated defense buffs.
4. **Give `TOTAL_ANNIHILATION` a visible countdown** (a "boss instability: 8 turns until Annihilation" line starting at turn ~20) so it reads as the enrage timer it mechanically is, instead of feeling like an unfair damage number. Doesn't change the underlying balance, just the honesty of the UI — the ATK creep at turns 15/20/25 already gives you the hook to attach a countdown message to.

These four changes alone should meaningfully close the gap between "why does one guy one-shot everything" (rank + crit stacking) and the actually well-tuned enemy-scaling system underneath it, without touching a single class stat table.

##### Draft B — Layered Mitigation (medium effort, reworks §4)

Replace the flat-subtraction-plus-capped-percent DEF formula with a single PoE-style saturating curve:

```
mitigation% = def / (def + K × incoming_raw_damage)
```

Pick `K` (start around 8-12) so that early-game DEF values (10-30) still meaningfully blunt early-game hits, while it naturally self-caps against big late-game numbers without needing an arbitrary `min(65, ...)`. This removes bug #7 entirely (no more "the number on my sheet stopped moving but my actual mitigation didn't"), gives DEF a value curve that differentiates "tanky vs. many small hits" from "tanky vs. one big hit" builds (a real intransitive axis per §7), and slots into `calculateDamage` as a straight replacement for the current steps 11-12 — everything downstream (buffs, passives, status effects) keeps working, since they're currently expressed as modifiers to `def` or to `totalDmgReduction`, both of which still exist as intermediate values, just computed differently.

##### Draft C — Real Class Identity via Intransitive Triangles (highest effort, most durable fix)

Right now every class differentiates by *how much* stat it has, in a strict tier ordering (§3.1). The redesign direction with the most staying power is to make classes differentiate by *what beats what*, using systems that already exist but are underused:

- Lean on the **elemental chart** (§6, "dead mechanic") as a real build axis: give each class line 1-2 signature elements, and make enemy archetypes (STALKER/BRUTE/TANK/etc. — already in `classEncounters.js`) have real elemental leanings, so "which class should I bring to this dungeon" becomes a genuine RPS question instead of "bring whoever has the highest total stat."
- Split DEF's job (Draft B) from CC-resistance's job (already partially separate via the `ccImmune`/DR-window system at `guildAdventure.js:2504-2520`, which is good and worth keeping) so "tanky" isn't one stat but a real choice between physical-mitigation tanks, CC-immune tanks, and evasion tanks — each strong against a different enemy archetype, none strictly better than the others.
- For PEAK tier specifically (§3.2/§3.3, currently shelved): before it goes live, fill in `CLASS_MODIFIERS` and `tierMultiplier` for all 19 classes deliberately, using this as the opportunity to *also* assign each PEAK class an elemental/CC-resistance identity from the point above, rather than just extrapolating the existing "more of everything" curve one more tier up.

This draft is the one that actually answers 🫩's original instinct from the chat log ("class should give bonuses to allocation") — just routed the way David's counter-argument correctly redirected it: not more points, but a different *shape* of power, expressed through matchups instead of magnitude.

---

#### 9. Appendix — Full Class Stat Table (ASCENDED / PEAK, referenced in §3.1)

**ASCENDED**
| Class | Role | Total | Off | Def |
|---|---|---|---|---|
| DOOMSLAYER | TANK | 735 | 75.4 | 97.5 |
| DRAGON_GOD | TANK | 730 | 59.5 | 115.0 |
| DRAGON_LORD | TANK | 718 | 64.4 | 111.0 |
| WARLORD | TANK | 665 | 37.6 | 127.0 |
| TEMPLAR | TANK | 606 | 39.0 | 124.0 |
| ARCHDRUID | SUPPORT | 606 | 79.4 | 97.0 |
| SAINT | SUPPORT | 552 | 80.6 | 95.0 |
| TYCOON | SUPPORT | 550 | 62.5 | 75.0 |
| ZENMASTER | DPS | 545 | 66.5 | 68.0 |
| SHOGUN | DPS | 493 | 75.0 | 74.0 |
| GRAND_INVENTOR | SUPPORT | 482 | 51.6 | 84.5 |
| VIRTUOSO | SUPPORT | 468 | 76.5 | 58.0 |
| LICH | MAGIC_DPS | 466 | 84.0 | 67.5 |
| TIMELORD | MAGIC_DPS | 462 | 102.5 | 54.0 |
| VOIDWALKER | MAGIC_DPS | 459 | 79.4 | 67.5 |
| NIGHTBLADE | DPS | 449 | 79.5 | 43.0 |
| KAGE | DPS | 442 | 93.5 | 44.5 |
| AVATAR | MAGIC_DPS | 440 | 90.9 | 58.0 |
| ARCHMAGE | MAGIC_DPS | 371 | 92.6 | 47.0 |

**PEAK** *(currently shelved — no trial bosses/skill trees/sprites, not reachable via `.jk modclass`)*
| Class | Role | Total | Off | Def |
|---|---|---|---|---|
| ANNIHILATOR | TANK | 1160 | 111.5 | 155.0 |
| ASTRALWYRM | TANK | 1130 | 92.5 | 175.0 |
| WAREMPEROR | TANK | 1080 | 56.0 | 202.5 |
| BROOD_SOVEREIGN | TANK | 1075 | 82.5 | 158.5 |
| SYLVANUS | SUPPORT | 945 | 126.0 | 152.0 |
| SERAPH | TANK | 940 | 59.5 | 191.5 |
| BUDDHA | DPS | 845 | 103.5 | 106.5 |
| EMPYREAN | SUPPORT | 845 | 120.5 | 144.0 |
| PLUTOCRAT | SUPPORT | 800 | 97.0 | 114.0 |
| TENNO | DPS | 770 | 119.5 | 117.0 |
| TECHNARCH | SUPPORT | 750 | 80.5 | 132.0 |
| HARMONIA | SUPPORT | 725 | 118.5 | 88.5 |
| NEKROS | TANK | 715 | 119.0 | 106.5 |
| NEMESIS | DPS | 705 | 124.0 | 69.0 |
| CHRONARCH | MAGIC_DPS | 705 | 153.5 | 82.0 |
| VOIDLORD | MAGIC_DPS | 695 | 114.0 | 105.0 |
| YAMI | DPS | 685 | 145.5 | 71.5 |
| PRIMORDIAL | MAGIC_DPS | 675 | 133.5 | 91.5 |
| DEMIURGE | MAGIC_DPS | 590 | 153.0 | 76.0 |

---

*Sources used for the game-balance references in §7: Ian Schreiber, "A Course About Game Balance" (GDC 2016) and *Game Balance* (Schreiber & Romero, CRC Press/Routledge, 2021); Path of Exile's published armor mitigation formula (`armor / (armor + 10×damage)`); D&D 5e's "bounded accuracy" design philosophy; Dark Souls' New Game+ enemy-and-player co-scaling, referenced against your own team's rebirth discussion in the provided chat log.*


---


## 2. Real-Player Simulation Findings


Follow-up round using 92 real accounts pulled from `users_export.csv` (real class, level, achievements, and actual equipped gear), run 300 fights each through the real `calculateDamage`/`scaleEnemyStats` code — as opposed to the synthetic/invented-roster simulation in §3 below.


Ran the last round of testing — real accounts this time, not invented ones. Here's what came out:

The cliff is real, and gear doesn't save you from it. I rebuilt 92 real player accounts from your export (actual class, level, achievements, and — critically — actual equipped gear stats) and threw them at your real calculateDamage/scaleEnemyStats code, 300 fights each. Same shape as the synthetic sim: F through S rank is 83-100% win rate across the board, no exceptions, gear or no gear. Then SS hits and Revlis/Akon (your actual accounts, with actual gear) drop to 11%/21%. SSS is a wall: ace and Too Much — your two most invested, best-geared characters in the whole export — win 0% of simulated fights.

Isolated why, with real accounts: halving the enemy HP quadratic term takes Revlis/Akon from 11-21% up to 64-73%. Zeroing it entirely gets them to 100%. So SS rank has one clear, cheap, validated fix. SSS is a different problem — even zeroing that same term barely moves ace and Too Much (0%→17%, 0%→4%). At SSS the linear damage/HP scaling factors alone are already enough to overwhelm your best real characters, gear included. Needs its own separate tuning pass, not the same fix as SS.

Two things outside the combat-balance question entirely, worth your attention regardless:

Gojousensei's account has 20,366,227,966 unspent stat points sitting in their save. Every other account is in the tens/hundreds. Looks like the exact dupe exploit your own code comments describe as patched — except this account's corrupted value predates or bypasses the patch. Worth a direct DB check.
Rank and enemy level-gating are decoupled: getEnemyPoolByLevel() gates on level, scaleEnemyStats()'s difficulty gates on rank. Gojousensei is level 85 but B-rank, so they simulate at 100% win rate — full late-game monster roster, low-mid-game scaling. Any player who out-levels their rank promotion falls into this for free, no min-maxing required.

Also confirmed: gear now dwarfs everything else in the stat budget by mid-late game (10,000+ points from equipment vs. low hundreds from class+level+allocation combined at level 90+). So the class-identity redesign work from the first audit only really matters in the first 10-20 levels — past that, itemization is where balance actually lives.

Full writeup with the chart, the isolation-test table, and a revised priority list (data-integrity fix first, then the rank/level gate, then SS's quadratic term, then SSS's linear terms, then the Draft A items from round one) is in the file above.


---


## 3. Difficulty Curve — Chart Reading + Simulation Narrative


### 3.1 Chart reading (`difficulty_curve.png`)


Source: `difficulty_curve.png` — simulated win rate vs. on-level dungeon mob, using the real formulas from the codebase.

**Left chart — Win rate vs. on-level dungeon mob (%) and Avg HP% left after win**
- Levels ~3–75 (ranks F through S): win rate holds essentially flat at ~100%, with average HP remaining after a win starting around 96% at rank F and staying in the high-90s through ranks D–B, dipping slightly to ~97% at rank A and A(high).
- At rank S (~level 75): win rate is still ~100%, but avg HP left after win drops sharply to ~52% — this is the first real difficulty spike, where fights start actually costing meaningful HP.
- At rank SS (~level 90–100): win rate collapses to ~0% and avg HP left is ~0% — the content becomes effectively unwinnable at these levels with the simulated build.

**Right chart — Fight length (turns to resolve), cap = 60 (timeout/unwinnable)**
- Levels 3–38: fight length is flat and short, 1–2 turns.
- Levels 45–65: gradual climb to ~4–8 turns.
- Level ~75 (rank S): sharp spike to ~22 turns — matches the HP-loss cliff on the left chart.
- Levels 90–100 (rank SS): fight length actually drops back down to ~18–15 turns, but this is misleading — it's not because fights got easier, it's consistent with characters losing (dying/timing out in ways that end the encounter faster) rather than grinding out a win, matching the ~0% win rate over the same range.

**Interpretation:** the difficulty curve is essentially flat/trivial from level 3 to ~65, then hits a wall at rank S (~level 75) where fights suddenly get costly (HP-wise and turn-wise), and becomes a hard wall at rank SS (~level 90+) where the current formulas make encounters unwinnable. That's a very sharp, late difficulty cliff rather than a smooth ramp — worth flagging if the intent was gradual scaling.

---


### 3.2 Simulation narrative (synthetic-roster run, from the original session)


Couldn't touch the live DB, so here's what I did instead: built players using the actual level-up math (getBaseGrowth, CLASS_MODIFIERS, stat-point allocation with the real soft caps) from your own code, and threw them at the actual level-appropriate enemy pool for their bracket, scaled through the real scaleEnemyStats. 400 fights per level, invented player is a straightforward FIGHTER→WARRIOR→WARLORD build spending 60% of points on ATK, 20% DEF, 20% HP — nothing exotic, no equipment, no skills (basic attacks only, so this if anything underestimates real player damage since your skills go up to 700% ATK).

Here's what came out:

It's not "hard start → smooth glide" — it's "flat 100% stomp for 65% of the level range → brick wall." From level 3 all the way to level 65, win rate never drops below 97%, and most fights resolve in 1-2 turns. That's not "a bit of a challenge that fades" — that's never having been a challenge at all for the vast majority of the game, followed by an abrupt cliff at S/SS rank where win rate falls off a table (75→90 goes from 100% to 0%, and fights that don't get won just time out at 60 turns — practically unwinnable, not "hard").

So the shape you're describing ("hard at the very start, then I just mow through everything") is really: the very earliest levels (3-8) are the only place the enemy scaling and player growth are anywhere close to matched, because that's the one bracket your dmgFactor: 0.08, hpFactor: 0.12 baseline was tuned against directly. Every bracket after that, the player's growth curve (level growth × class modifier × stat allocation, all multiplying together) pulls ahead of the enemy scaling multiplier faster than the multiplier can compensate — until suddenly, around S/SS, the enemy HP's quadratic term (rankIndex² × hpQuadFactor) catches up all at once and overshoots into unwinnable. There's no smooth "getting harder" in the middle — the curve is doing almost nothing between E-rank and A-rank.

That matches exactly why you reached for TOTAL_ANNIHILATION and silence: those aren't balance tools, they're patches for the fact that the actual difficulty knob (per-rank dmgFactor/hpFactor) can't move fast enough across 90 levels of compounding player growth without also breaking the brackets on either side of wherever you tune it. Turning the dial up enough to matter at level 60 makes level 10 unplayable; tuning it for level 10 makes level 60 (and then 90) a joke, which is exactly what the chart shows.

A couple of quick isolation runs to show what's actually driving it:

Killing the D-rank-and-up 2x rank bonus entirely barely moves the needle below S-rank (game's already at 100% either way — the multiplier isn't what's making mid-game trivial, mid-game is trivial from pure stat growth alone), but at S-rank it's the difference between 100% and 56.5% win rate. In other words: the one number I flagged as the "critical" issue in the first audit is currently the only thing standing between a coherent S-rank fight and a curbstomp — which tells you it's structurally load-bearing in a way it shouldn't be. You don't want your one emergency lever also being your only functioning difficulty control at the top of the game.
Capping crit at 50% (vs. uncapped) does basically nothing across this whole range with this build — worth remembering that crit uncapped isn't the main driver of the "everything melts" feeling, it's an amplifier on top of it. Fix the base curve first.
What I'd actually do, concretely, given what you said ("I have no idea how to fix this"): the honest answer is the per-rank enemy multiplier table (dmgFactor/hpFactor/hpQuadFactor in scaleEnemyStats) is trying to do a job that a single multiplicative fudge factor structurally can't do once player growth is itself multiplicative across level×class×allocation. Rather than keep re-tuning those six numbers (which is what got you here — I can see in the comments this table's already been through several tuning passes), I'd:

Cap growth instead of trying to out-scale it. Put a soft ceiling on how much total stat a player can accumulate relative to their level (the D&D "bounded accuracy" idea from the first report) — e.g. total allocated-stat value capped as a function of level, not just per-stat soft caps. Right now nothing stops the compounding of (level growth) × (class modifier up to 2.2x) × (tier-multiplied allocation) from just running away.
Make the enemy multiplier scale off the player's actual current power, not just dungeon rank. avgLevel already feeds in — extend that to read the player's real ATK/DEF/HP off their sheet (which you already compute) and scale relative to that, not a static per-rank table. That's the only way to stay matched across a level range this wide without breaking either end.
Kill or heavily nerf TOTAL_ANNIHILATION once (1) and (2) land — if the curve is actually matched, you shouldn't need a turn-30 unconditional wipe to make fights end. Keep it only as a genuine last-resort anti-stall timer at like turn 60+, not turn 30.
Happy to build out a version of this sim that reads real user docs if you want to open network access to your Mongo cluster for a session, or if you'd rather just paste me a handful of real player stat blocks (.jk char output for a few actual accounts across the level range), I can run the same simulation against real data instead of invented ones — would sharpen the numbers but I don't think it'll change the shape of that chart much.


---


## 4. Economy Report


### WhatsApp RPG Bot — Comprehensive Economy Report
Complete reference for every Zeni/gold flow in the bot — generation, removal, transfer, and all associated formulas, prices, and mechanics. All data extracted directly from source code.

**Source files:** `economy.js`, `gambling.js`, `guildAdventure.js`, `pvpSystem.js`, `summonEggSystem.js`, `abyssSystem.js`, `guilds.js`, `summonAchievements.js`

### 1.1 Daily Rewards (`economy.js`)
- Formula: `totalReward = DAILY_REWARD + membershipBonus`
- `DAILY_REWARD` = 500 Zeni (constant)
- Membership Bonus: 0 (free), +1,000 (PREMIUM), +5,000 (DIAMOND)
- Cooldown: 24 hours (86,400,000 ms)
- Streak system: **not implemented**
- Total possible: 500 (free) / 1,500 (PREMIUM) / 5,500 (DIAMOND) per day

### 1.2 Dungeon & Quest Gold Rewards (`guildAdventure.js`)
- If `goldReward` is `[min, max]`: random integer in range
- If `goldReward` is a number: that exact number
- Fallback: 0 if no `goldReward` field

| Enemy | goldReward |
|---|---|
| Drake Scout | [80, 150] |
| Fire Breather | [100, 200] |
| Ancient Dragon | [500, 1000] |
| Stone Hulk | [120, 200] |
| Leviathan Spawn | [400, 700] |
| Golem King | [600, 900] |
| Mountain Colossus | [420, 680] |
| Abyssal Horror | [300, 500] |
| Kraken Spawn | [500, 800] |
| Perfect Mutation | [800, 1200] |
| Elemental Sovereign | [1000, 1500] |

### 1.3 Abyss Floor Rewards (`abyssSystem.js`)
- `gold = floor(100 * tierMult * bossMult * floorMultiplier)`
- `xp = floor(50 * tierMult * bossMult * floorMultiplier)`
- `floorMultiplier = 1.0 + (floor - 1) * 0.15 + pow(floor - 1, 1.5) * 0.05`
- Boss multiplier: 5x
- Abyss run cooldown: 12 hours

| Tier | Multiplier | Floor Range |
|---|---|---|
| F | 1x | 1–10 |
| C | 2x | 11–20 |
| B | 4x | 21–30 |
| A | 8x | 31–40 |
| S | 20x | 41–50 |
| SS | 50x | 51–60 |
| SSS | 150x | 61–70 |
| ABYSSAL_GOD | 1000x | 71+ |
| GOD | 5000x | Special |

Examples:
- Floor 10, regular enemy: `floor(100 * 1 * 1 * 3.1)` = 310 Zeni
- Floor 10, boss: `floor(100 * 1 * 5 * 3.1)` = 1,550 Zeni
- Floor 50, boss: `floor(100 * 20 * 5 * ~72.5-mult)` ≈ 72,500 Zeni

### 1.4 Boss Kill Rewards & Overkill Bonus (`guildAdventure.js`)
- Trigger: damage > 2x enemy remaining HP
- `bonusGold = floor(enemy.goldReward * 0.10)`, minimum 50 Zeni
- Added to player's `goldEarned` for the run; applies on regular enemies too, not just bosses

### 1.5 Puzzle Rewards (`guildAdventure.js`)
- Rune Puzzle: `reward = 60 + tier * 30` (full reward on success)
- Smash (success): `reward = floor(puzzle.reward * 0.60)`
- Smash (failure): no gold, takes damage instead
- `tier` = dungeon rank index (F=0, E=1, D=2, ...)

### 1.6 Gambling — Coinflip (`gambling.js`)
- 50/50 base win condition
- Base payout 1:1
- House edge applied: `gain = floor(winnings * (1 - edge))`
- Daily profit cap applies
- Forced loss can override a win after 20+ rounds/day
- If daily cap reached: bet refunded (no gain, no loss)

### 1.7 Gambling — Slots (`gambling.js`)

| Symbol | Multiplier | Approx. Probability (per reel) |
|---|---|---|
| Cherry | 5x | ~1.4% |
| Lemon | 10x | ~1.4% |
| Orange | 15x | ~1.4% |
| Grape | 25x | ~1.4% |
| Diamond | 50x | ~1.4% |
| Seven (7) | 100x | ~1.4% |

- 3 matching (Jackpot): `winnings = floor(bet * symbolMultiplier)`
- 2 matching (Small Win): `winnings = floor(bet * 1.2)` (reduced from 2.5x)
- No match: bet lost
- House edge + daily cap apply to all winnings

### 1.8 Gambling — Dice (`gambling.js`)
- `playerRoll > dealerRoll` wins
- 1:1 payout, same as coinflip
- House edge, forced loss, daily profit cap all apply

### 1.9 Gambling — Anti-Abuse Systems (`gambling.js`)

**House Edge (Scaling)**
- `edge = min(0.03 + roundsToday * 0.001, 0.10)`
- 3% at round 1, +0.1%/round, caps at 10%
- `actualPayout = floor(winnings * (1 - edge))`
- Resets daily

**Daily Profit Cap**
- `DAILY_PROFIT_LIMIT = 2,000,000 Zeni`
- Once daily net profit hits 2M, all payouts return 0
- Net profit = total winnings − total losses for the day
- Resets daily

**Forced Loss System**
- `forcedLossChance = min(max((rounds - 20) * 0.005, 0), 0.10)`
- 0% for rounds 1–20, +0.5%/round after, caps at 10%
- If wallet ≥ daily wallet cap: forced loss = 100%
- `dailyWalletCap = entryWalletToday + withdrawnToday`
- Resets daily

**Bet Limits**
- `GLOBAL_MIN_BET = 50 Zeni`
- `GLOBAL_MAX_BET = 500,000 Zeni`

### 1.10 PvP Stakes & Prizes (`pvpSystem.js`)

**With stake**
- `pot = stake * 2`
- Winner takes full pot; loser gets 0
- Cancelled duels: stake refunded (neutral)

**Without stake**
- `goldBonus = floor(150 + loser.level * 40)` (newly generated Zeni)
- `xpGain = floor(80 + loser.level * 15)`
- Example vs L20 opponent: 950 Zeni + 380 XP

### 1.11 PvP Summon Duel Rewards (`pvpSystem.js`)
- `summonXP = max(20, floor(50 + loser.level * 10))`
- Loyalty: winner −1, loser −2
- ELO: winner `arenaWins` +1, loser `arenaLosses` +1
- Stakes still apply (owner's Zeni at stake)
- No player XP/gold prize — summon rewards only

### 1.12 Guild Daily Board Rewards (`guilds.js`)
- Gold/XP reward varies per board, paid to shared guild balance
- Guild war points by dungeon rank: F=5, E=10, D=15, C=20, B=30, A=40, S=60, SS=80, SSS=100

### 1.13 Achievement Rewards (`summonAchievements.js`)

| Achievement | Reward Type | Value |
|---|---|---|
| First Summon | Stat: MAG | +5 |
| Lucky Catch | Stat: LUCK | +10 |
| Collector (5) | Summon Slots | +1 |
| Collector (10) | Summon Slots | +1 |
| Survivor | Stat: HP | +50 |
| Deep Delver | Stat: MAG | +20 |
| Arena Champion | Stat: ATK | +5 |
| Fortified | Stat: DEF | +15 |
| Swift Strike | Stat: SPD | +5 |
| Critical Master | Stat: CRIT | +10 |
| Fortune Seeker | Stat: LUCK | +5 |
| Arcane Scholar | Stat: MAG | +15 |
| Unbreakable | Stat: HP | +100 |
| Resonance Master | Stat: SPD | +10 |

### 1.14 Abyss Treasure Caches (`abyssSystem.js`)
- `GOLD_CACHE`: gold scaled by tier multiplier
- Other treasure types (items, fragments, runes): no direct gold

---

### 2. Money Removal (Sinks)

**2.1 Gambling Losses** — bet is permanently removed on any loss (coinflip/slots/dice); tracked in `gamblingProfile.netToday`.

**2.2 Shop Purchases & Item Prices** (`shopCommands.js`)

| Item | Price (Zeni) | Notes |
|---|---|---|
| Basic Summon Egg | 5,000 | Hatches 1 of 4 starter summons |
| Summon Healing Pill | varies | Heals summon mid-battle |
| Skill Respec Scroll | varies | Resets skill point allocation |
| Health Potion | varies | Restores HP in combat |
| Equipment | `item.value` | Price from DB, varies by item |
| Stones (evolution) | varies | Required for class evolution |

- Items with `value ≤ 1` hidden from shop
- Rare–Mythic summon eggs are NOT buyable, only crafted

**2.3 Summon Egg Shop Purchases** (`summonEggSystem.js`) — only Basic (5,000 Zeni) is purchasable; others crafted from fragments.

**2.4 Egg Incubation Speed-Up Costs**

| Egg Tier | Incubation Time | Speed-Up Cost (Zeni) |
|---|---|---|
| Basic | 1 hour | 2,000 |
| Rare | 4 hours | 10,000 |
| Epic | 12 hours | 30,000 |
| Legendary | 24 hours | 100,000 |
| Mythic | 48 hours | 500,000 |

**2.5 Robbery Fines** (`economy.js`)
- `fine = max(500, floor(thief.wallet * 0.01))`
- Success rate: 40%
- On success: steals `floor(random()*20)+10` percent (10–30%) of victim's wallet
- On failure: fine removed, robberyStrikes incremented; 3+ strikes = 24h prison ban
- Jail: 30 min after failed attempt; cooldown 30 min between attempts
- Victim minimum wallet to be robbable: 500 Zeni

**2.6 PvP Flee Penalties**
- XP loss: `floor(currentXP * 0.20)`
- Wallet loss: `floor(wallet * 0.50)`
- 1 random item destroyed
- CP affected

**2.7 Summon Duel Flee Penalties**
- Loyalty penalty (typically 10 points): `loyalty = max(0, loyalty - cpPenalty)`
- No gold/XP/item loss
- Loyalty at 0 → summon cannot be deployed

**2.8 Premium Tier Purchases**

| Tier | Cost (Zeni) | Duration | Daily Bonus | Bank Tax |
|---|---|---|---|---|
| Free | 0 | Permanent | +0 | 2% |
| PREMIUM | 50,000 | 30 days | +1,000/day | 2% |
| DIAMOND | 250,000 | 30 days | +5,000/day | 0% |

**2.9 Class Evolution Trial Costs** (`guildAdventure.js`)
- Cost varies by path (`trialData.cost`); also requires 1x evolution stone (`trialData.stoneId`)
- Cost 0 = free evolution; failed trial refunds cost

**2.10 Bank Tax** (`economy.js`)
- Free/PREMIUM: 2% on deposits; DIAMOND: 0%
- Example: deposit 10,000 → 200 tax → 9,800 to bank (free player)
- No tax on withdrawals

---

### 3. Money Transfer (Neutral Flows)

- **Bank Deposit/Withdraw**: deposit `wallet -= amount, bank += (amount - tax)`; withdraw `bank -= amount, wallet += amount` (no tax); no interest earned
- **Player-to-Player Transfers**: no fee, minimum 1 Zeni, alt-account (same-phone) transfers blocked
- **Robbery (Theft)**: success = transfer of 10–30% of victim's wallet; failure = sink (fine)
- **PvP Stake Escrow**: both pay stake on accept; winner gets full pot; cancel = refund to both

---

### 4. Gambling System Deep Dive

**4.1 House Edge Mechanic**
- `edge = min(0.03 + roundsToday * 0.001, 0.10)`
- Round 1: 3.0% edge (97% payout) · Round 50: 8.0% edge (92% payout) · Round 70+: 10.0% edge (90% payout, capped)
- Resets daily; applies to coinflip, slots, dice

**4.2 Daily Profit Cap**
- `DAILY_PROFIT_LIMIT = 2,000,000 Zeni`
- `netToday` ≥ 2M → payouts return 0; `netToday` < 2M → `payout = min(requestedPayout, 2M - netToday)`
- Player can still gamble (and lose)

**4.3 Forced Loss System**
- Rounds 1–20: 0% forced loss · Round 21: 0.5% · Round 40: 10% (capped)
- Wallet ≥ `dailyWalletCap` (entry wallet + withdrawn today) → 100% forced loss

**4.4 Bet Limits**
- `GLOBAL_MIN_BET = 50` · `GLOBAL_MAX_BET = 500,000`
- Cannot bet more than current wallet balance

---

### 5. Summon Economy Deep Dive

**5.1 Egg Tiers & Prices**

| Tier | Egg ID | Buy Price | Incubation | Speed-Up | Rarity Pool |
|---|---|---|---|---|---|
| Basic | `basic_summon_egg` | 5,000 | 1 hour | 2,000 | COMMON |
| Rare | `rare_summon_egg` | Crafted | 4 hours | 10,000 | RARE |
| Epic | `epic_summon_egg` | Crafted | 12 hours | 30,000 | EPIC |
| Legendary | `legendary_summon_egg` | Crafted | 24 hours | 100,000 | LEGENDARY |
| Mythic | `mythic_summon_egg` | Crafted | 48 hours | 500,000 | MYTHIC |

**5.2 Fragment Drop System**
- Floor ≥ 50 OR species rarity MYTHIC → legendary fragment
- Floor ≥ 21 OR species rarity LEGENDARY → epic fragment
- Floor ≥ 11 OR species rarity EPIC → rare fragment
- Default → common fragment
- If species rarity is higher than floor-based tier, higher tier used

**5.3 Egg Crafting Chain**
- 10x Common Fragment → 1x Rare Egg
- 10x Rare Fragment → 1x Epic Egg
- 10x Epic Fragment → 1x Legendary Egg
- 10x Legendary Fragment → 1x Mythic Egg
- Mythic Fragments: endgame currency, no crafting use yet

**5.4 Soul Forging**
- Cooldown: 1 forge/day (`FORGE_CONFIG.COOLDOWN_MS`)
- No Zeni cost, combines 2 summons into 1 enhanced summon

---

### 6. Complete Summary Table

| Flow | Type | Formula / Amount | Source |
|---|---|---|---|
| Daily Reward | GEN | 500 + premium (1K/5K) | economy.js |
| Dungeon Gold | GEN | `enemy.goldReward` or `[min,max]` | guildAdventure.js |
| Abyss Gold | GEN | `100 * tierMult * bossMult * floorMult` | abyssSystem.js |
| Overkill Bonus | GEN | 10% of goldReward (min 50) | guildAdventure.js |
| Puzzle (solve) | GEN | `60 + tier * 30` | guildAdventure.js |
| Puzzle (smash) | GEN | `floor(reward * 0.6)` | guildAdventure.js |
| Coinflip Win | GEN | `bet * (1 - edge)`, 1:1 base | gambling.js |
| Slots Jackpot | GEN | `bet * 5x` to `100x` | gambling.js |
| Slots Small Win | GEN | `bet * 1.2x` | gambling.js |
| Dice Win | GEN | `bet * (1 - edge)`, 1:1 base | gambling.js |
| PvP Staked Pot | GEN | `stake * 2` (to winner) | pvpSystem.js |
| PvP No-Stake | GEN | `150 + loser.level * 40` | pvpSystem.js |
| Summon Duel XP | GEN | `max(20, 50 + loser.level*10)` | pvpSystem.js |
| Guild Board | GEN | variable (per board) | guilds.js |
| Abyss Treasure | GEN | scaled by tier multiplier | abyssSystem.js |
| Gambling Loss | SINK | bet amount (all games) | gambling.js |
| Basic Egg Buy | SINK | 5,000 | summonEggSystem.js |
| Egg Speed-Up | SINK | 2K–500K (by tier) | summonEggSystem.js |
| Shop Items | SINK | `item.value` (varies) | shopCommands.js |
| Robbery Fine | SINK | `max(500, wallet*1%)` | economy.js |
| PvP Flee (player) | SINK | 20% XP + 50% wallet + 1 item | pvpSystem.js |
| PvP Flee (summon) | SINK | 10 loyalty points | pvpSystem.js |
| Premium Tier | SINK | 50K or 250K | economy.js |
| Evolution Trial | SINK | `trialData.cost` (varies) | guildAdventure.js |
| Bank Tax | SINK | 2% of deposit (free/PREMIUM) | economy.js |
| Bank Deposit | XFER | wallet → bank (−tax) | economy.js |
| Bank Withdraw | XFER | bank → wallet (no tax) | economy.js |
| Player Transfer | XFER | sender → receiver (0% fee) | economy.js |
| Robbery (success) | XFER | victim → thief (10–30%) | economy.js |
| PvP Stake Escrow | XFER | both → winner | pvpSystem.js |
| Guild Balance | XFER | guild pool (shared) | guilds.js |

**Legend:** GEN = Generation (creates new Zeni) · SINK = Removal (destroys Zeni) · XFER = Transfer (moves existing Zeni)

**Key balancing notes:**
- Daily reward (500–5,500) is the only guaranteed passive income
- Gambling has 3 anti-abuse layers: scaling house edge (3–10%), daily profit cap (2M), forced loss (0–10%)
- Abyss is the primary high-level income source — Floor 50 boss ≈ 72,500 Zeni
- PvP without stakes generates modest gold — not a major inflation source
- Premium tiers are the largest single one-time sink (50K–250K)
- Bank tax (2%) is a passive sink on all free/PREMIUM deposits
- Egg speed-up costs scale dramatically (2K–500K) by tier
- Robbery is net-neutral on success (transfer), sink on failure (fine)
- Soul Forging is free but cooldown-limited (1/day) — not a Zeni sink

---


---


## 5. Environment Variables / Secrets


### `whatsapp-bot`
```
GO_IMAGE_SERVICE_URL=https://bot-genaration-iat6.onrender.com
GROQ_API_KEYS=<GROQ_API_KEYS>
MONGO_URI=<MONGO_URI>
```

### `bot_generation`
```
BROWSERLESS_TOKEN=<BROWSERLESS_TOKEN>
CLOUDINARY_API_KEY=<CLOUDINARY_API_KEY>
CLOUDINARY_API_SECRET=<CLOUDINARY_API_SECRET>
CLOUDINARY_CLOUD_NAME=dwgct8qng
HF_SPACE_ID=Anon303/VisionDataGrab
HF_SPACE_URL=https://anon303-visiondatagrab.hf.space
HF_TOKEN=<HF_TOKEN>
KLIPY_API_KEY=<KLIPY_API_KEY>
MODE=full
PORT=7860
RAPIDAPI_KEY=<RAPIDAPI_KEY>
SCRAPE_CREATORS_KEY=<SCRAPE_CREATORS_KEY>
UPSTASH_REDIS_TOKEN=<UPSTASH_REDIS_TOKEN>
UPSTASH_REDIS_URL=https://unique-dove-77772.upstash.io
```

**⚠️ Flag (not a redaction, just noting it):** this section previously contained working credentials in plaintext (Mongo password, Groq/HF/RapidAPI/Cloudinary/Upstash keys). They have been replaced with `<PLACEHOLDER>` notes for the public repository — keep the real values in your local `.env` files only.


---


## 6. User Database — Active Users (Summary Table)


3,675 total accounts in `users_export.csv`. 3,650 are default/untouched (level 1, empty inventory, 0 wallet). These are the 25 accounts with real play data.


| userId | nickname | class | adventurerRank | level | xp | wallet | bank | totalEarned | totalSpent | pvpWins | pvpLosses | bossesDefeated | kills | summonSlots | inventorySlots | membership_tier | registered |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 251453323092189@lid | Mell | WARLOCK | C | 52 | 8719589 | 0 | 0 | 0 | 0 | 3 | 6 | 0 |  | 5 | 25 | BASIC | true |
| 62733080870965@lid | Too Much | ARCHMAGE | SSS | 70 | 292671452 | 129468670 | 4617765447 | 12179944212 | 6569493247 | 30 | 7 | 750 | 3621 | 5 | 90 | BASIC | true |
| 2349074039144@s.whatsapp.net | ༆ᴺᵉˣᵘˢད᤻£₦₦¥ | WARRIOR | C | 36 | 593429 | 132548 | 0 | 2150248 | 2239700 |  | 1 | 0 |  | 5 |  | BASIC | true |
| 2349166113259@s.whatsapp.net | Barneyyyy | SCOUT | F | 13 | 9024 | 30723 | 0 | 35505 | 77780 |  |  | 0 |  | 5 |  | BASIC | true |
| 2347055849264@s.whatsapp.net | ĄŁŁĘŇ | WARLORD | S | 64 | 81197670 | 4750000 | 20785138 | 48901821 | 32964289 | 1 | 3 | 34 | 629 | 5 | 100 | BASIC | true |
| 2349057077609@s.whatsapp.net | I C H I -𓃵 | TEMPLAR | A | 53 | 11956780 | 75836 | 67427330 | 70840623 | 1257240 | 2 |  | 0 |  | 5 |  | BASIC | true |
| 2347017056550@s.whatsapp.net | matty | WARRIOR | B | 45 | 2950383 | 102525 | 18175243 | 16310316 | 2897300 |  | 1 | 0 |  | 5 |  | BASIC | true |
| 2348107704329@s.whatsapp.net | CLOUD 🪐🪬 | ACOLYTE | F | 6 | 1643 | 2010 | 0 | 71230 | 69220 |  |  | 0 |  | 5 |  | BASIC | true |
| 2348083243446@s.whatsapp.net | MOv¡C DAVE 🍥 | SCOUT | D | 27 | 125471 | 82084 | 286168 | 562480 | 105280 |  | 2 | 0 |  | 5 |  | BASIC | true |
| 25151529836547@lid | Revlis | DRAGON_GOD | SS | 91 | 7833356734 | 1900000000 | 170000500 | 4816255265 | 2412001859 | 17 | 9 | 254 | 3151 | 5 | 90 | BASIC | true |
| test_craft_user@s.whatsapp.net | CraftTestHero | SCOUT | F | 5 | 724 | 1000 | 0 | 1000 | 0 | 0 | 0 | 0 |  | 5 |  | BASIC | true |
| 2348108205964@s.whatsapp.net | Gojousensei | AVATAR | B | 85 | 2959758992 | 0 | 535111943 | 558439376 | 21371069 | 3 | 8 | 265 | 1868 | 5 | 60 | BASIC | true |
| 2349061834359@s.whatsapp.net | Räzzy😮‍💨 | CHRONOMANCER | A | 66 | 113212044 | 0 | 41374329 | 25621019 | 2122334 | 6 | 12 | 36 | 1112 | 5 | 35 | BASIC | true |
| 64257458712825@lid | ace | SAINT | SSS | 98 | 24628233295 | 0 | 118378282 | 1714085340 | 1560742201 | 25 | 9 | 243 | 12695 | 5 | 100 | BASIC | true |
| 64841406501106@lid | VOID | NIGHTBLADE | B | 60 | 37596829 | 912126 | 0 | 11121313 | 4272458 | 4 | 2 | 24 | 772 | 5 | 40 | BASIC | true |
| 209904027570242@lid | Aspace✈️🎹 | WARLORD | S | 75 | 433602355 | 144153 | 0 | 140006096 | 13528507 | 7 | 7 | 73 | 2047 | 5 | 55 | BASIC | true |
| 193664605262049@lid | hero | LICH | S | 70 | 190565427 | 51099600 | 0 | 51256881 | 25123082 | 10 | 18 | 68 | 1803 | 5 | 50 | BASIC | true |
| 2347010231214@s.whatsapp.net | Evanesce | GRAND_INVENTOR | S | 77 | 640459521 | 39053869 | 10453700 | 233006088 | 261660685 | 6 | 3 | 163 | 1875 | 5 | 80 | BASIC | true |
| 2349079790431@s.whatsapp.net | Yaga | WARLORD | S | 76 | 574054585 | 204159914 | 0 | 102227038 | 10148679 | 4 | 11 | 179 | 2077 | 5 | 45 | BASIC | true |
| 176429438373975@lid | 𝕷𝖆𝖕𝖎𝖘 | LICH | S | 84 | 2271729515 | 0 | 8639995900 | 11780508685 | 5275370370 | 2 | 1 | 6 | 143 | 5 | 20 | BASIC | true |
| 166189682696262@lid | lavish | FIGHTER | F | 12 | 7564 | 213453 | 0 | 19420 | 20080 | 0 | 0 | 2 | 15 | 5 | 20 | BASIC | true |
| 2348160306992@s.whatsapp.net | (Helios) | APPRENTICE | F | 12 | 7559 | 237920 | 0 | 19420 | 1500 | 0 | 0 | 2 | 15 | 5 | 20 | BASIC | true |
| 2349016420495@s.whatsapp.net | King | DOOMSLAYER | B | 61 | 45820767 | 29621052 | 54450000 | 97726201 | 55415489 | 3 | 7 | 96 | 1019 | 5 | 45 | BASIC | true |
| 235747080687774@lid | Midari | APPRENTICE | F | 14 | 11344 | 119475 | 0 | 31875 | 2400 | 0 | 0 | 2 | 17 | 5 | 20 | BASIC | true |
| 191693517246534@lid | Haleem | APPRENTICE | F | 67 | 127505156 | 3032499 | 996500 | 3001499 | 22500 | 0 | 0 | 1 | 58 | 5 | 20 | BASIC | true |



**Real-player quest/PvP win-rate breakdown** (script + output used to build the 92-account roster in §2):


```text
cd /home/claude/sim && python3 -c "
import csv
csv.field_size_limit(10_000_000)
rows = list(csv.DictReader(open('/mnt/user-data/uploads/users_export.csv')))

active = []
for r in rows:
    try: lvl = int(r['progression_level'] or 1)
    except: lvl = 1
    cls = r['class'] or 'NONE'
    if cls != 'NONE' or lvl > 1:
        active.append(r)
real = [r for r in active if not r['nickname'].startswith('Sandbox') and r['adventurerRank']!='GOD']
real.sort(key=lambda r: -int(r['progression_level'] or 1))

print(f\"{'nickname':<22} {'class':<14} {'rk':<4} {'lvl':>4} {'qC':>6} {'qW':>6} {'qF':>6} {'qWR%':>6} {'pvpW':>5} {'pvpL':>5} {'pvpWR%':>7} {'bossDef':>8}\")
for r in real:
    lvl=int(r['progression_level'] or 1)
    qc,qw,qf = int(r['questsCompleted'] or 0), int(r['questsWon'] or 0), int(r['questsFailed'] or 0)
    pw,pl = int(r['pvpWins'] or 0), int(r['pvpLosses'] or 0)
    bd = r['bossesDefeated'] or '0'
    qwr = f'{qw/(qw+qf)*100:.0f}' if (qw+qf) else '-'
    pwr = f'{pw/(pw+pl)*100:.0f}' if (pw+pl) else '-'
    print(f\"{r['nickname'][:21]:<22} {r['class']:<14} {r['adventurerRank']:<4} {lvl:>4} {qc:>6} {qw:>6} {qf:>6} {qwr:>6} {pw:>5} {pl:>5} {pwr:>7} {bd:>8}\")
" 2>&1 | head -45
Output

nickname               class          rk    lvl     qC     qW     qF   qWR%  pvpW  pvpL  pvpWR%  bossDef
ace                    SAINT          SSS    98    842    784    124     86    25     9      74      243
Too Much               ARCHMAGE       SSS    93   1137    349     51     87    30     7      81      750
Revlis                 DRAGON_GOD     SS     91    443    176     15     92    17     9      65      254
Gojousensei            AVATAR         B      85    233     58     14     81     3     8      27      265
𝕷𝖆𝖕𝖎𝖘                  LICH           S      84      5      2      1     67     2     1      67        6
Akon                   DOOMSLAYER     SS     82    814    522     43     92    23     2      92      333
Void's Realm 𓃵         WARLORD        S      82    620    555      2    100     6     3      67        4
ayomide                DRAGONSLAYER   S      80    351    336      7     98     5    16      24       27
Evanesce               GRAND_INVENTOR S      77    227     85     22     79     6     3      67      163
Yaga                   WARLORD        S      76    180    179      9     95     4    11      27      179
Aspace✈️🎹              WARLORD        S      75    346    224     45     83     7     7      50       73
Psater                 SCOUT          D      73     27     23     12     66     3    15      17       22
hero                   LICH           S      70    183    147      3     98    10    18      36       68
𝚂 𝙻 𝙰 𝙳 𝙴 ⚡︎           DRAGONSLAYER   S      68    246    120     93     56    10     3      77       50
Haleem                 APPRENTICE     F      67      1      1      1     50     0     0       -        1
Räzzy😮‍💨               CHRONOMANCER   A      66    159    128     36     78     6    12      33       36
The Alchemist          LICH           S      65    199    154     39     80    11     7      61       20
ĄŁŁĘŇ                  WARLORD        S      64    248    206      8     96     1     3      25       34
King                   DOOMSLAYER     B      61    115     83     27     75     3     7      30       96
VOID                   NIGHTBLADE     B      60    101     24     25     49     4     2      67       24
Too Much😩😩             CHRONOMANCER   D      53     26     22      2     92     3    22      12       18
TANLUFFY❤️‍🔥🔥          DRUID          B      53    215    206     14     94     3     5      38       12
I C H I -𓃵             TEMPLAR        A      53    125    125      0    100     2     0     100        0
Mell                   WARLOCK        C      52     70     67      1     99     3     6      33        0
Red                    BERSERKER      B      45    130    130      0    100     0     0       -        0
matty                  WARRIOR        B      45    127    127      0    100     0     1       0        0
cube                   ACOLYTE        F      38      2      2      1     67     0     1       0        0
༆ᴺᵉˣᵘˢད᤻£₦₦¥           WARRIOR        C      36    118    118      0    100     0     1       0        0
TANLUFFY❤️‍🔥🔥          ACOLYTE        C      35    115    115      0    100     0     0       -        0
MOv¡C DAVE 🍥           SCOUT          D      27     27     27      0    100     0     2       0        0
Midari                 APPRENTICE     F      14      2      2      2     50     0     0       -        2
Barneyyyy              SCOUT          F      13      9      9      0    100     0     0       -        0
lavish                 FIGHTER        F      12      2      2      1     67     0     0       -        2
(Helios)               APPRENTICE     F      12      2      2      1     67     0     0       -        2
3rdven                 FIGHTER        E      11      6      6      0    100     0     0       -        0
Chudjoe                ACOLYTE        F      11      2      2      0    100     0     0       -        0
thief                  SCOUT          E      11     12     12      0    100     0     0       -        0
PlayerOne              FIGHTER        F      10      0      0      0      -     0     0       -        0
PlayerTwo              APPRENTICE     F      10      0      0      0      -     0     0       -        0
A.C.E                  FIGHTER        F       7      0      0      0      -     0     0       -        0
CLOUD 🪐🪬               ACOLYTE        F       6     10     10      0    100     0     0       -        0
Vᗩᕈꓰ᙭°                 APPRENTICE     F       5      2      2      0    100     0     0       -        0
Ghameoder              APPRENTICE     F       5      0      0      0      -     0     0       -        0
CraftTestHero          SCOUT          F       5      0      0      0      -     0     0       -        0
```


---


## 7. User Database — Active Users (Full Records)


Complete raw fields for all 25 active accounts, including full inventory/equipment/profession JSON.


### Mell  `251453323092189@lid`

- **userId**: 251453323092189@lid
- **registered**: true
- **nickname**: Mell
- **phoneHash**: 061071a2d355ade3868eaa64813bd1991b80eda11dc862aae42c6eb039e23602
- **wallet**: 0
- **bank**: 0
- **class**: WARLOCK
- **adventurerRank**: C
- **spriteIndex**: 66
- **level**: 52
- **xp**: 8719589
- **hp**: 
- **maxHp**: 
- **currentHP**: 4042
- **questGold**: 0
- **questsCompleted**: 70
- **questsWon**: 67
- **questsFailed**: 1
- **pvpWins**: 3
- **pvpLosses**: 6
- **eventTokens**: 2
- **totalEarned**: 0
- **totalSpent**: 0
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 25
- **progression_level**: 52
- **progression_xp**: 8719589
- **progression_gp**: 1430
- **progression_totalGP**: 1430
- **progression_statPoints**: 5
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: S-BD50
- **profile_whatsappName**: Mellow
- **profile_nickname**: Adventurer
- **profile_firstSeen**: "2026-08-08T03:02:18.177Z"
- **profile_lastSeen**: "2026-08-08T07:45:33.923Z"
- **profile_messageCount**: 1
- **createdAt**: 2026-02-07T16:39:50.508Z
- **updatedAt**: 2026-08-08T19:18:46.721Z

**equipment**:
```json
{
  "main_hand": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "acquiredAt": 1770827472376,
    "rarity": "COMMON",
    "stats": {
      "atk": 5
    },
    "slot": "weapon",
    "value": 1000,
    "maxDurability": 80,
    "durability": 47.5,
    "durabilityTraits": []
  },
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 2,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 5,
    "xp": 839
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "xp_booster": {
    "id": "xp_booster",
    "name": "xp_booster",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1770631624174,
    "value": 10,
    "rarity": "COMMON",
    "source": "MAIN_SHOP"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1770827472376,
    "rarity": "COMMON",
    "stats": {
      "atk": 5
    },
    "slot": "weapon",
    "value": 1000
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1779712643807,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 12,
    "acquiredAt": 1772963918027,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "smoke_bomb",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1772997902524,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1776903145815,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1776905084433,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "bomb": {
    "id": "bomb",
    "name": "bomb",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1779734811647,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "major_potion",
    "type": "ITEM",
    "quantity": 6,
    "acquiredAt": 1779734825255,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "health_potion": {
    "id": "health_potion",
    "name": "health_potion",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1779734827748,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "wooden_ring": {
    "id": "wooden_ring",
    "name": "Wooden Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1779734998553,
    "rarity": "COMMON",
    "value": 500,
    "stats": {
      "hp": 2
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 39,
    "acquiredAt": 1784303652072,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "INFECTED_COLOSSUS"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1780913302363,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1770631471380,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "weapon",
    "source": "CORRUPTED_GUARDIAN"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 9,
    "acquiredAt": 1784406595583,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1779825642440,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 6,
    "acquiredAt": 1784190916709,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784138829629,
    "rarity": "MYTHIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "elixir": {
    "id": "elixir",
    "name": "elixir",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1780913405814,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mana_potion": {
    "id": "mana_potion",
    "name": "mana_potion",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1780913410212,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784406596179,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1780913568116,
    "rarity": "RARE",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780913622226,
    "rarity": "COMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "crystal_staff": {
    "id": "crystal_staff",
    "name": "Crystal Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780913684419,
    "rarity": "RARE",
    "value": 3000,
    "stats": {
      "mag": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780913684666,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "infected_fish": {
    "id": "infected_fish",
    "name": "\u2623\ufe0f Corrupted Eel",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780929931883,
    "rarity": "EPIC",
    "value": 4500,
    "stats": {},
    "slot": null
  },
  "rabbit_hide": {
    "id": "rabbit_hide",
    "name": "Rabbit Hide",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780929951677,
    "rarity": "COMMON",
    "value": 120,
    "stats": {},
    "slot": null
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784190752754,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1781267276947,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "CORRUPTED_GUARDIAN"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781267278264,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781358881079,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 93,
    "acquiredAt": 1784139999575,
    "rarity": "COMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "gold_ore",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1781361926034,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "silver_ore",
    "type": "ITEM",
    "quantity": 24,
    "acquiredAt": 1781361927548,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781525029537,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 22,
    "acquiredAt": 1781714279438,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784139366079,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "ELDER_CHAOS"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1784189850102,
    "rarity": "RARE",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1784139367178,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 11,
    "acquiredAt": 1784139833678,
    "rarity": "COMMON",
    "value": 1200,
    "stats": null,
    "slot": null
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1784190917669,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784303652596,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785752667262,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "basic_summon_egg": {
    "id": "basic_summon_egg",
    "name": "Basic Summon Egg",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1786092052713,
    "rarity": "COMMON",
    "value": 5000,
    "stats": {},
    "slot": null
  },
  "rare_fragment": {
    "id": "rare_fragment",
    "name": "Rare Summon Fragment",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1786092152509,
    "rarity": "RARE",
    "value": 3000,
    "stats": {},
    "slot": null
  }
}
```

---

### Too Much  `62733080870965@lid`

- **userId**: 62733080870965@lid
- **registered**: true
- **nickname**: Too Much
- **phoneHash**: e5f04e600ac724ec0088c113cc0afa1ee9f3eb30e093f8826bd45dad4e53705f
- **wallet**: 129468670
- **bank**: 4617765447
- **class**: ARCHMAGE
- **adventurerRank**: SSS
- **spriteIndex**: 46
- **level**: 70
- **xp**: 292671452
- **hp**: 200
- **maxHp**: 4162
- **currentHP**: 25346
- **questGold**: 0
- **questsCompleted**: 1137
- **questsWon**: 349
- **questsFailed**: 51
- **pvpWins**: 30
- **pvpLosses**: 7
- **eventTokens**: 5
- **totalEarned**: 12179944212
- **totalSpent**: 6569493247
- **totalGambled**: 2980000
- **gamesPlayed**: 0
- **gamesWon**: 5
- **gamesLost**: 5
- **biggestWin**: 500000
- **biggestLoss**: 500000
- **bossesDefeated**: 750
- **dragonsKilled**: 52
- **itemsCrafted**: 56
- **itemsEquipped**: 9
- **undeadKills**: 2
- **kills**: 3621
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 90
- **progression_level**: 93
- **progression_xp**: 10224282054
- **progression_gp**: 866
- **progression_totalGP**: 866
- **progression_statPoints**: 30
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: sum_1785616272948_52d5ad37
- **profile_whatsappName**: Too Much
- **profile_nickname**: Too Much
- **profile_firstSeen**: "2026-03-16T15:06:42.311Z"
- **profile_lastSeen**: "2026-03-16T15:06:42.411Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-03-16T15:06:42.315Z
- **updatedAt**: 2026-08-08T14:24:11.196Z

**equipment**:
```json
{
  "main_hand": {
    "id": "void_kraken_harpoon",
    "name": "God-forged Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "acquiredAt": 1785946202780,
    "rarity": "MYTHIC",
    "value": 95000,
    "stats": {
      "atk": 1265,
      "mag": 345,
      "crit": 173
    },
    "slot": "main_hand",
    "reqLevel": 50,
    "baseStats": {
      "atk": 110,
      "mag": 30,
      "crit": 15
    },
    "enhancementLevel": 20,
    "enhancementBonus": 10.5,
    "maxDurability": 150,
    "durability": 148.4,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "off_hand": {
    "id": "aegis_of_the_abyss",
    "name": "God-forged Aegis of the Abyss",
    "type": "EQUIPMENT",
    "acquiredAt": 1783678215983,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": {
      "def": 1380,
      "hp": 4600,
      "luck": 115
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 120,
      "hp": 400,
      "luck": 10
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 150,
    "durability": 147.7,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "armor": {
    "id": "voidstrand_robes",
    "name": "God-forged Void-Strand Robes",
    "type": "EQUIPMENT",
    "acquiredAt": 1783784501328,
    "rarity": "MYTHIC",
    "value": 74000,
    "stats": {
      "def": 863,
      "hp": 2300,
      "mag": 460,
      "spd": 173
    },
    "slot": null,
    "enhancementLevel": 18,
    "maxDurability": 96,
    "durability": 93,
    "durabilityTraits": [],
    "baseStats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "enhancementBonus": 10.5
  },
  "helmet": {
    "id": "crown_of_hellfire",
    "name": "God-forged Crown of Hellfire of Sages",
    "type": "EQUIPMENT",
    "acquiredAt": 1781900736162,
    "rarity": "MYTHIC",
    "value": 65000,
    "stats": {
      "def": 460,
      "mag": 920,
      "crit": 230
    },
    "slot": null,
    "enhancementLevel": 20,
    "maxDurability": 96,
    "durability": 93,
    "durabilityTraits": [],
    "baseStats": {
      "def": 40,
      "mag": 80,
      "crit": 20
    },
    "enhancementBonus": 10.5
  },
  "boots": null,
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1783950749951,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "voidstar_choker",
    "name": "God-forged Void-Star Choker",
    "type": "EQUIPMENT",
    "acquiredAt": 1785947267395,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 2300,
      "mag": 920,
      "crit": 115
    },
    "slot": "amulet",
    "reqLevel": 50,
    "baseStats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    },
    "enhancementLevel": 18,
    "enhancementBonus": 10.5,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": null,
  "gloves": {
    "id": "mythril_staff",
    "name": "Mythril Staff",
    "type": "EQUIPMENT",
    "acquiredAt": 1770616011644,
    "stats": {
      "mag": 45,
      "hp": 15
    },
    "slot": "weapon",
    "maxDurability": 100,
    "durability": 97,
    "durabilityTraits": [],
    "baseStats": {
      "mag": 45,
      "hp": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  }
}
```

**statBonuses**:
```json
{
  "hp": 30,
  "atk": 20,
  "def": 20,
  "mag": 22,
  "spd": 22,
  "luck": 20,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 9,
    "xp": 693
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "evolution_stone": {
    "id": "evolution_stone",
    "name": "Evolution Stone (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781182182249,
    "rarity": "RARE",
    "value": 8000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1781182206299,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "ITEM",
    "quantity": 9,
    "acquiredAt": 1781182238388,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1781200546514,
    "rarity": "MYTHIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 222,
    "acquiredAt": 1784407440137,
    "rarity": "RARE",
    "value": 50,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 145,
    "acquiredAt": 1784407791958,
    "rarity": "RARE",
    "value": 200,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1784233928793,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "quantity": 6,
    "acquiredAt": 1781199074685,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 145,
      "hp": 255
    },
    "slot": "armor",
    "source": "COMBAT",
    "enhancementLevel": 2,
    "baseStats": {
      "def": 85,
      "hp": 150
    },
    "enhancementBonus": 0.7
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 1227,
    "acquiredAt": 1784233898883,
    "rarity": "UNCOMMON",
    "value": 100,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 14,
    "acquiredAt": 1783945044147,
    "rarity": "EPIC",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 38,
    "acquiredAt": 1784407793877,
    "rarity": "EPIC",
    "value": 400,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 297,
    "acquiredAt": 1785185005209,
    "rarity": "MYTHIC",
    "value": 1200,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "crystal_staff": {
    "id": "crystal_staff",
    "name": "Crystal Staff",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1781900588922,
    "rarity": "EPIC",
    "value": 3000,
    "stats": {
      "mag": 14
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "enhancementLevel": 1,
    "baseStats": {
      "mag": 10
    },
    "enhancementBonus": 0.35
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781210625327,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784233926973,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784408672326,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 49,
    "acquiredAt": 1784230785347,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 43,
    "acquiredAt": 1784408472722,
    "rarity": "RARE",
    "value": 200,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "chrono_blade": {
    "id": "chrono_blade",
    "name": "Chrono Blade",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1770548917815,
    "rarity": "EPIC",
    "value": 10,
    "stats": {
      "atk": 25,
      "spd": 40
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 286,
    "acquiredAt": 1784575066048,
    "rarity": "MYTHIC",
    "value": 1680,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784035443341,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 160,
    "acquiredAt": 1784406792922,
    "rarity": "RARE",
    "value": 150,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 23,
    "acquiredAt": 1784033720640,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784234122479,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Polished Greatsword",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1781237785772,
    "rarity": "MYTHIC",
    "value": 6000,
    "stats": {
      "atk": 24
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "atk": 15
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 44,
    "acquiredAt": 1785187306540,
    "rarity": "COMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1784233696578,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 15,
    "acquiredAt": 1784233943984,
    "rarity": "RARE",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "garb_of_the_elder_mage": {
    "id": "garb_of_the_elder_mage",
    "name": "God-forged Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1781310400939,
    "rarity": "COMMON",
    "value": 41000,
    "stats": {
      "def": 138,
      "mag": 179,
      "spd": 42
    },
    "slot": "armor",
    "enhancementLevel": 5,
    "baseStats": {
      "def": 50,
      "mag": 65,
      "spd": 15
    },
    "enhancementBonus": 1.75,
    "source": "COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 70,
    "acquiredAt": 1784484609283,
    "rarity": "MYTHIC",
    "value": 2500,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 59,
    "acquiredAt": 1784481160825,
    "rarity": "MYTHIC",
    "value": 3000,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "mirror_buckler": {
    "id": "mirror_buckler",
    "name": "Mirror Buckler",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1781901357245,
    "rarity": "LEGENDARY",
    "value": 37000,
    "stats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT"
  },
  "eelskin_hazard_suit": {
    "id": "eelskin_hazard_suit",
    "name": "Eel-Skin Hazard Suit",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784036958562,
    "rarity": "MYTHIC",
    "value": 76000,
    "stats": {
      "def": 122,
      "hp": 405,
      "spd": 41
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "enhancementLevel": 1,
    "baseStats": {
      "def": 90,
      "hp": 300,
      "spd": 30
    },
    "enhancementBonus": 0.35
  },
  "rare_gem": {
    "id": "rare_gem",
    "name": "Rare Gem",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781943260046,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "PUZZLE"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 117,
    "acquiredAt": 1785185190153,
    "rarity": "MYTHIC",
    "value": 5000,
    "source": "BOSS",
    "stats": null,
    "slot": null
  },
  "mythril_staff": {
    "id": "mythril_staff",
    "name": "Mythril Staff",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1781185210796,
    "rarity": "COMMON",
    "value": 30000,
    "stats": null,
    "slot": null,
    "enhancementLevel": 5,
    "maxDurability": 65,
    "durability": 65,
    "durabilityTraits": [],
    "baseStats": {
      "mag": 45,
      "hp": 15
    },
    "enhancementBonus": 1.75
  },
  "abyssal_blade": {
    "id": "abyssal_blade",
    "name": "God-forged Abyssal Blade",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783597810552,
    "rarity": "COMMON",
    "value": 950000,
    "stats": {
      "atk": 578,
      "mag": 138,
      "crit": 55
    },
    "slot": "main_hand",
    "enhancementLevel": 5,
    "baseStats": {
      "atk": 210,
      "mag": 50,
      "crit": 20
    },
    "enhancementBonus": 1.75,
    "source": "ELITE_COMBAT"
  },
  "scale_coat_of_eternity": {
    "id": "scale_coat_of_eternity",
    "name": "Masterwork Scale Coat of Eternity",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783617795992,
    "rarity": "MYTHIC",
    "value": 42000,
    "stats": {
      "def": 168,
      "hp": 360,
      "spd": 48
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "enhancementLevel": 4,
    "baseStats": {
      "def": 70,
      "hp": 150,
      "spd": 20
    },
    "enhancementBonus": 1.4
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 89,
    "acquiredAt": 1784482276713,
    "rarity": "MYTHIC",
    "value": 800,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 60,
    "acquiredAt": 1784483554210,
    "rarity": "MYTHIC",
    "value": 2500,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 223,
    "acquiredAt": 1785185187901,
    "rarity": "MYTHIC",
    "value": 25000,
    "source": "ABYSSAL_GOD",
    "stats": null,
    "slot": null
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 176,
    "acquiredAt": 1784483639614,
    "rarity": "MYTHIC",
    "value": 8000,
    "source": "BOSS",
    "stats": null,
    "slot": null
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784483554724,
    "rarity": "MYTHIC",
    "value": 35000,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "void_titan_heart": {
    "id": "void_titan_heart",
    "name": "Void Titan Heart",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784485003412,
    "rarity": "MYTHIC",
    "value": 120000,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1785185191197,
    "rarity": "MYTHIC",
    "value": 80000,
    "source": "BOSS",
    "stats": null,
    "slot": null
  },
  "abyssal_heartstone": {
    "id": "abyssal_heartstone",
    "name": "Abyssal Heartstone",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1784483363610,
    "rarity": "MYTHIC",
    "value": 220000,
    "source": "COMBAT",
    "stats": null,
    "slot": null
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 50,
    "acquiredAt": 1784449594292,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "legendary_chrono_ring": {
    "id": "legendary_chrono_ring",
    "name": "Polished Legendary Chrono Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783846734764,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "spd": 21,
      "luck": 34,
      "crit": 14
    },
    "slot": "ring",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "spd": 15,
      "luck": 25,
      "crit": 10
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "null_staff": {
    "id": "null_staff",
    "name": "God-forged Null Staff",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1783846846100,
    "rarity": "COMMON",
    "value": 380000,
    "stats": {
      "mag": 372,
      "hp": 97,
      "crit": 42
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "baseStats": {
      "mag": 135,
      "hp": 35,
      "crit": 15
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.75,
    "reqLevel": 70
  },
  "signet_of_the_ancestors": {
    "id": "signet_of_the_ancestors",
    "name": "God-forged Signet of the Ancestors",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1783848045313,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "atk": 230,
      "mag": 230,
      "luck": 138
    },
    "slot": "ring",
    "source": "COMBAT",
    "enhancementLevel": 29,
    "baseStats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "enhancementBonus": 10.5
  },
  "helm_of_ancient_blood": {
    "id": "helm_of_ancient_blood",
    "name": "Helm of Ancient Blood",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784480025410,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "def": 40,
      "atk": 30,
      "crit": 10
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "essence_mirror": {
    "id": "essence_mirror",
    "name": "Essence Mirror",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1783945203367,
    "rarity": "LEGENDARY",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "gaze_of_the_abyss": {
    "id": "gaze_of_the_abyss",
    "name": "Gaze of the Abyss",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784576293025,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "def": 35,
      "mag": 75,
      "crit": 25
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "crown_of_the_dragon_lord": {
    "id": "crown_of_the_dragon_lord",
    "name": "Polished Crown of the Dragon Lord",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1783952740154,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": {
      "def": 72,
      "mag": 48,
      "luck": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 45,
      "mag": 30,
      "luck": 12
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "titanium_band": {
    "id": "titanium_band",
    "name": "Titanium Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783952882880,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "def": 25,
      "hp": 100
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "pendant_of_eternity": {
    "id": "pendant_of_eternity",
    "name": "Masterwork Pendant of Eternity",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783953040852,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": {
      "hp": 360,
      "def": 96,
      "luck": 36
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT",
    "enhancementLevel": 4,
    "baseStats": {
      "hp": 150,
      "def": 40,
      "luck": 15
    },
    "enhancementBonus": 1.4
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 1279,
    "acquiredAt": 1783981228535,
    "rarity": "UNCOMMON",
    "value": 350,
    "stats": {},
    "slot": null
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 328,
    "acquiredAt": 1784233739976,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "null_aegis": {
    "id": "null_aegis",
    "name": "Null Aegis",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1784481356234,
    "rarity": "MYTHIC",
    "value": 360000,
    "stats": {
      "def": 130,
      "hp": 110,
      "luck": 15
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 29,
    "acquiredAt": 1784039768437,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "void_core_amulet": {
    "id": "void_core_amulet",
    "name": "Void Core Amulet",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1784230784762,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "hp": 250,
      "mag": 70,
      "spd": 10
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 77,
    "acquiredAt": 1784232417424,
    "rarity": "LEGENDARY",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 18,
    "acquiredAt": 1784483149511,
    "rarity": "MYTHIC",
    "value": 50000,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "touch_of_retribution": {
    "id": "touch_of_retribution",
    "name": "Touch of Retribution",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784359975763,
    "rarity": "MYTHIC",
    "value": 56000,
    "stats": {
      "atk": 40,
      "def": 25,
      "crit": 12
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "worldender_lance": {
    "id": "worldender_lance",
    "name": "Polished World-Ender Lance",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784360607447,
    "rarity": "COMMON",
    "value": 98000,
    "stats": {
      "atk": 156,
      "mag": 54,
      "crit": 17
    },
    "slot": null,
    "baseStats": {
      "atk": 115,
      "mag": 40,
      "crit": 12
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "hellfire_greatmaul": {
    "id": "hellfire_greatmaul",
    "name": "Hellfire Greatmaul",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1784578970321,
    "rarity": "MYTHIC",
    "value": 96000,
    "stats": {
      "atk": 120,
      "mag": 25,
      "crit": 10
    },
    "slot": "main_hand",
    "enhancementLevel": 5,
    "maxDurability": 80,
    "durability": 63,
    "durabilityTraits": [],
    "baseStats": {
      "atk": 120,
      "mag": 25,
      "crit": 10
    },
    "enhancementBonus": 1.75,
    "source": "ELITE_COMBAT"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1784410740059,
    "rarity": "MYTHIC",
    "value": 20000,
    "source": "ELITE_COMBAT",
    "stats": null,
    "slot": null
  },
  "visor_of_the_void_walker": {
    "id": "visor_of_the_void_walker",
    "name": "Visor of the Void Walker",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784409266362,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "def": 50,
      "spd": 40,
      "luck": 15
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "singularity_band": {
    "id": "singularity_band",
    "name": "Polished Singularity Band",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784411136799,
    "rarity": "MYTHIC",
    "value": 61000,
    "stats": {
      "def": 24,
      "luck": 64
    },
    "slot": "ring",
    "source": "COMBAT",
    "baseStats": {
      "def": 15,
      "luck": 40
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "infernal_greaves": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784411407494,
    "rarity": "MYTHIC",
    "value": 59000,
    "stats": {
      "def": 55,
      "spd": 25,
      "atk": 15
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "abyssal_grasp": {
    "id": "abyssal_grasp",
    "name": "Reinforced Abyssal Grasp",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784483254306,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": {
      "atk": 126,
      "mag": 70,
      "spd": 56
    },
    "slot": "gloves",
    "source": "COMBAT",
    "baseStats": {
      "atk": 45,
      "mag": 25,
      "spd": 20
    },
    "enhancementLevel": 3,
    "enhancementBonus": 1.7999999999999998
  },
  "heart_of_the_cosmos": {
    "id": "heart_of_the_cosmos",
    "name": "Heart of the Cosmos",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784412249755,
    "rarity": "COMMON",
    "value": 62000,
    "stats": {
      "hp": 300,
      "mag": 60,
      "luck": 15
    },
    "slot": "amulet",
    "source": "COMBAT"
  },
  "mirrorimage_shroud": {
    "id": "mirrorimage_shroud",
    "name": "Mirror-Image Shroud",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784414108074,
    "rarity": "MYTHIC",
    "value": 29000,
    "stats": {
      "def": 25,
      "spd": 35,
      "crit": 12
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "Smoke Bomb",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1784447927957,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "godshard": {
    "id": "godshard",
    "name": "Godshard",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1784483638913,
    "rarity": "MYTHIC",
    "value": 250000,
    "source": "ABYSSAL_GOD",
    "stats": null,
    "slot": null
  },
  "loop_of_forever": {
    "id": "loop_of_forever",
    "name": "Loop of Forever",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784480898139,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "band_of_cosmic_fortune": {
    "id": "band_of_cosmic_fortune",
    "name": "Polished Band of Cosmic Fortune",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784481367295,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "mag": 32,
      "luck": 72
    },
    "slot": "ring",
    "source": "COMBAT",
    "baseStats": {
      "mag": 20,
      "luck": 45
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "mirrorwarp_cloak": {
    "id": "mirrorwarp_cloak",
    "name": "Mirror-Warp Cloak",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784481367824,
    "rarity": "MYTHIC",
    "value": 28000,
    "stats": {
      "def": 30,
      "spd": 25,
      "crit": 10
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "amulet_of_the_broken_era": {
    "id": "amulet_of_the_broken_era",
    "name": "Polished Amulet of the Broken Era",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784481751114,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "mag": 32,
      "luck": 56
    },
    "slot": "amulet",
    "source": "COMBAT",
    "baseStats": {
      "mag": 20,
      "luck": 35
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "voidtouched_grips": {
    "id": "voidtouched_grips",
    "name": "Void-Touched Grips",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784485002660,
    "rarity": "MYTHIC",
    "value": 55000,
    "stats": {
      "atk": 30,
      "spd": 35,
      "crit": 12
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "titanstomp_sabatons": {
    "id": "titanstomp_sabatons",
    "name": "Titan-Stomp Sabatons",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784577466118,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "def": 65,
      "spd": -10,
      "hp": 100
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "aegis_of_eternal_fire": {
    "id": "aegis_of_eternal_fire",
    "name": "Polished Aegis of Eternal Fire",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785184649032,
    "rarity": "MYTHIC",
    "value": 81000,
    "stats": {
      "def": 200,
      "hp": 480,
      "atk": 24
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 125,
      "hp": 300,
      "atk": 15
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "dragonscale_kite_shield": {
    "id": "dragonscale_kite_shield",
    "name": "Polished Dragon-Scale Kite Shield of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785184693146,
    "rarity": "MYTHIC",
    "value": 39000,
    "stats": {
      "def": 152,
      "hp": 240
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 95,
      "hp": 150
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 34,
    "acquiredAt": 1785184732409,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "titanium_fortified_carapace": {
    "id": "titanium_fortified_carapace",
    "name": "Sharp Titanium Fortified Carapace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785185004675,
    "rarity": "MYTHIC",
    "value": 43000,
    "stats": {
      "def": 100,
      "hp": 250,
      "atk": 8
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "titan_fist_gauntlets": {
    "id": "titan_fist_gauntlets",
    "name": "Titan Fist Gauntlets of Sages",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785185027532,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "atk": 40,
      "def": 30,
      "mag": 20
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1785187124869,
    "rarity": "COMMON",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 9,
    "acquiredAt": 1785226169293,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "dark_matter_gauntlets": {
    "id": "dark_matter_gauntlets",
    "name": "Sharp Dark Matter Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785247694444,
    "rarity": "EPIC",
    "value": 15000,
    "stats": {
      "atk": 35,
      "def": 15
    },
    "slot": "gloves",
    "source": "COMBAT",
    "baseStats": {
      "atk": 35,
      "def": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "striders_of_the_dragon": {
    "id": "striders_of_the_dragon",
    "name": "Striders of the Dragon of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785249116228,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "def": 35,
      "spd": 30
    },
    "slot": "boots",
    "source": "COMBAT",
    "baseStats": {
      "def": 35,
      "spd": 30
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "summon_egg_common": {
    "id": "summon_egg_common",
    "name": "Common Summon Egg",
    "type": "ITEM",
    "quantity": "1,21,21,21,21,21,21,21,21,21,21,21,21,21,2",
    "acquiredAt": 1785249221264,
    "rarity": "UNCOMMON",
    "value": 5000,
    "source": "ABYSSAL_GOD",
    "stats": null,
    "slot": null
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Light Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785249360064,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10,
      "spd": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "summon_egg_void_walker": {
    "id": "summon_egg_void_walker",
    "name": "Void Walker Egg",
    "type": "ITEM",
    "quantity": 6,
    "acquiredAt": 1785249578274,
    "rarity": "RARE",
    "value": 18000,
    "source": "ABYSSAL_GOD",
    "stats": null,
    "slot": null
  },
  "wyrmscale_grips": {
    "id": "wyrmscale_grips",
    "name": "Wyrmscale Grips",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785250786120,
    "rarity": "MYTHIC",
    "value": 32000,
    "stats": {
      "atk": 35,
      "spd": 20,
      "crit": 8
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT"
  },
  "dragonwing_cloak": {
    "id": "dragonwing_cloak",
    "name": "Dragon-Wing Cloak of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785253069804,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "def": 40,
      "spd": 25,
      "luck": 10
    },
    "slot": "cloak",
    "source": "COMBAT",
    "baseStats": {
      "def": 40,
      "spd": 25,
      "luck": 10
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "veil_of_the_void": {
    "id": "veil_of_the_void",
    "name": "Veil of the Void of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785253114578,
    "rarity": "MYTHIC",
    "value": 52000,
    "stats": {
      "def": 50,
      "spd": 40,
      "crit": 20,
      "atk": 15
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "treads_of_the_damned": {
    "id": "treads_of_the_damned",
    "name": "Lucky Treads of the Damned",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785253184188,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "def": 40,
      "spd": 45,
      "luck": 15
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "aegis_of_the_golem_king": {
    "id": "aegis_of_the_golem_king",
    "name": "Reinforced Aegis of the Golem King",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785257584671,
    "rarity": "MYTHIC",
    "value": 38000,
    "stats": {
      "def": 252,
      "hp": 560,
      "mag": 28
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 90,
      "hp": 200,
      "mag": 10
    },
    "enhancementLevel": 3,
    "enhancementBonus": 1.7999999999999998
  },
  "necklace_of_the_void_empress": {
    "id": "necklace_of_the_void_empress",
    "name": "Necklace of the Void Empress",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785257822957,
    "rarity": "MYTHIC",
    "value": 64000,
    "stats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "slot": "amulet",
    "source": "COMBAT",
    "enhancementLevel": 5,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": [],
    "baseStats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "enhancementBonus": 1.75
  },
  "gaze_of_the_titan": {
    "id": "gaze_of_the_titan",
    "name": "Gaze of the Titan",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785257975564,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "def": 55,
      "hp": 80
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "dragonfang_claymore": {
    "id": "dragonfang_claymore",
    "name": "Dragon-Fang Claymore",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785258756385,
    "rarity": "MYTHIC",
    "value": 46000,
    "stats": {
      "atk": 85,
      "crit": 12
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "crown_of_hellfire": {
    "id": "crown_of_hellfire",
    "name": "God-forged Crown of Hellfire of Sages",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785259350795,
    "rarity": "MYTHIC",
    "value": 65000,
    "stats": {
      "def": 460,
      "mag": 920,
      "crit": 230
    },
    "slot": "helmet",
    "source": "COMBAT",
    "baseStats": {
      "def": 40,
      "mag": 80,
      "crit": 20
    },
    "enhancementLevel": 20,
    "enhancementBonus": 10.5
  },
  "eelspike_gauntlets": {
    "id": "eelspike_gauntlets",
    "name": "Eel-Spike Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785259503990,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "atk": 35,
      "spd": 30,
      "crit": 18
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT"
  },
  "mantlet_of_chaos": {
    "id": "mantlet_of_chaos",
    "name": "Mantlet of Chaos of Protection",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785313774091,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "slot": "cloak",
    "source": "COMBAT",
    "baseStats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0,
    "reqLevel": 50
  },
  "colossal_titan_shield": {
    "id": "colossal_titan_shield",
    "name": "Polished Sharp Colossal Titan Shield",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785313830759,
    "rarity": "MYTHIC",
    "value": 38000,
    "stats": {
      "def": 122,
      "hp": 338
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 90,
      "hp": 250
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "shroud_of_eternal_night": {
    "id": "shroud_of_eternal_night",
    "name": "Polished Sharp Shroud of Eternal Night",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785314070503,
    "rarity": "MYTHIC",
    "value": 53000,
    "stats": {
      "def": 54,
      "spd": 68,
      "luck": 21
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 40,
      "spd": 50,
      "luck": 15
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "chaos_cloak": {
    "id": "chaos_cloak",
    "name": "Strengthened Light Chaos Cloak of Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785316399573,
    "rarity": "MYTHIC",
    "value": 160000,
    "stats": {
      "def": 176,
      "hp": 308,
      "spd": 56
    },
    "slot": "armor",
    "source": "BOSS",
    "baseStats": {
      "def": 80,
      "hp": 140,
      "spd": 25
    },
    "enhancementLevel": 2,
    "enhancementBonus": 1.2
  },
  "mirroredged_rapier": {
    "id": "mirroredged_rapier",
    "name": "Glowing Mirror-Edged Rapier",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785503583578,
    "rarity": "MYTHIC",
    "value": 43000,
    "stats": {
      "atk": 65,
      "spd": 30,
      "crit": 15,
      "mag": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "Strength Brew",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785503658964,
    "rarity": "EPIC",
    "value": 3200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "void_step_sabatons": {
    "id": "void_step_sabatons",
    "name": "Lucky Void Step Sabatons of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785503784221,
    "rarity": "MYTHIC",
    "value": 56000,
    "stats": {
      "def": 45,
      "spd": 40,
      "luck": 15
    },
    "slot": "boots",
    "source": "BOSS",
    "baseStats": {
      "def": 45,
      "spd": 40,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "abyssal_bulwark": {
    "id": "abyssal_bulwark",
    "name": "Polished Lucky Abyssal Bulwark",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785504142868,
    "rarity": "MYTHIC",
    "value": 82000,
    "stats": {
      "def": 184,
      "hp": 720,
      "luck": 16
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 115,
      "hp": 450,
      "luck": 10
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785509015927,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS"
  },
  "rabbitfur_tunic": {
    "id": "rabbitfur_tunic",
    "name": "Sharp Rabbit-Fur Tunic",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785591462976,
    "rarity": "COMMON",
    "value": 1050,
    "stats": {
      "def": 12,
      "hp": 25,
      "atk": 8
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "assassin_hood": {
    "id": "assassin_hood",
    "name": "Shadow Hood of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785820772777,
    "rarity": "RARE",
    "value": 14000,
    "stats": {
      "def": 10,
      "spd": 15,
      "crit": 8
    },
    "slot": "helmet",
    "source": "COMBAT",
    "baseStats": {
      "def": 10,
      "spd": 15,
      "crit": 8
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "iron_scaffold_shield": {
    "id": "iron_scaffold_shield",
    "name": "Iron Scaffold Shield",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785821519971,
    "rarity": "COMMON",
    "value": 900,
    "stats": {
      "def": 22
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 55,
    "acquiredAt": 1785822544499,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {
      "atk": 5
    },
    "slot": "main_hand"
  },
  "voidstrand_robes": {
    "id": "voidstrand_robes",
    "name": "God-forged Void-Strand Robes",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785824332082,
    "rarity": "MYTHIC",
    "value": 74000,
    "stats": {
      "def": 863,
      "hp": 2300,
      "mag": 460,
      "spd": 173
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "enhancementLevel": 18,
    "enhancementBonus": 10.5
  },
  "mythril_chainshirt": {
    "id": "mythril_chainshirt",
    "name": "Sturdy Mythril Chainshirt",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785834787480,
    "rarity": "RARE",
    "value": 11000,
    "stats": {
      "def": 50,
      "hp": 40,
      "spd": 10
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 50,
      "hp": 40,
      "spd": 10
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "mythic_fragment": {
    "id": "mythic_fragment",
    "name": "Mythic Summon Fragment",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785840764531,
    "rarity": "MYTHIC",
    "value": 200000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "elemental_core": {
    "id": "elemental_core",
    "name": "Elemental Core",
    "type": "SUMMON_GEAR",
    "quantity": 1,
    "acquiredAt": 1785841509842,
    "rarity": "RARE",
    "value": 25000,
    "stats": {
      "mag": 35,
      "hp": 10
    },
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "rare_fragment": {
    "id": "rare_fragment",
    "name": "Rare Summon Fragment",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785860592379,
    "rarity": "RARE",
    "value": 3000,
    "stats": {},
    "slot": null
  },
  "lichs_bone_wand": {
    "id": "lichs_bone_wand",
    "name": "Lucky Lich's Bone Wand of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785860791101,
    "rarity": "EPIC",
    "value": 22000,
    "stats": {
      "atk": 15,
      "mag": 60
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "baseStats": {
      "atk": 15,
      "mag": 60
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "greataxe": {
    "id": "greataxe",
    "name": "Berserker Axe",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785860889467,
    "rarity": "EPIC",
    "value": 38000,
    "stats": {
      "atk": 55,
      "def": -10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "cloak_of_dark_matter": {
    "id": "cloak_of_dark_matter",
    "name": "Lucky Cloak of Dark Matter",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785861966174,
    "rarity": "EPIC",
    "value": 15000,
    "stats": {
      "def": 40,
      "mag": 10,
      "luck": 15
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "summon_essence_t2": {
    "id": "summon_essence_t2",
    "name": "Summon Essence (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785940612578,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "mythic_enhancement_stone": {
    "id": "mythic_enhancement_stone",
    "name": "Mythic Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 19,
    "acquiredAt": 1785946638159,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "necrotic_carver": {
    "id": "necrotic_carver",
    "name": "God-forged Necrotic Carver",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784232106948,
    "rarity": "COMMON",
    "value": 24000,
    "stats": {
      "atk": 138,
      "mag": 83
    },
    "slot": null,
    "enhancementLevel": 5,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": [],
    "baseStats": {
      "atk": 50,
      "mag": 30
    },
    "enhancementBonus": 1.75
  },
  "mythic_enhacement_stone": {
    "id": "mythic_enhacement_stone",
    "quantity": 99,
    "acquiredAt": 1785946894013
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785948326704,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "gloves_of_the_ruined_kingdom": {
    "id": "gloves_of_the_ruined_kingdom",
    "name": "Gloves of the Ruined Kingdom",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785948367776,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "mag": 30,
      "spd": 15,
      "luck": 12
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "common_fragment": {
    "id": "common_fragment",
    "name": "Common Summon Fragment",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785949228479,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null
  },
  "voidstar_choker": {
    "id": "voidstar_choker",
    "name": "Void-Star Choker of Haste",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785949259175,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 200,
      "mag": 80,
      "crit": 10,
      "spd": 15
    },
    "slot": "amulet",
    "source": "COMBAT"
  }
}
```

---

### ༆ᴺᵉˣᵘˢད᤻£₦₦¥  `2349074039144@s.whatsapp.net`

- **userId**: 2349074039144@s.whatsapp.net
- **registered**: true
- **nickname**: ༆ᴺᵉˣᵘˢད᤻£₦₦¥
- **phoneHash**: 3ef489c2241149dbf38b2141b5f1232a3f289fb09aaac8bcfc15849b8b515c3a
- **wallet**: 132548
- **bank**: 0
- **class**: WARRIOR
- **adventurerRank**: C
- **spriteIndex**: 60
- **level**: 36
- **xp**: 593429
- **hp**: 3416
- **maxHp**: 3416
- **currentHP**: 4412
- **questGold**: 0
- **questsCompleted**: 118
- **questsWon**: 118
- **questsFailed**: 0
- **pvpWins**: 
- **pvpLosses**: 1
- **eventTokens**: 0
- **totalEarned**: 2150248
- **totalSpent**: 2239700
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 36
- **progression_xp**: 593429
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 15
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ༆ᴺᵉˣᵘˢད᤻£₦₦¥
- **profile_nickname**: ༆ᴺᵉˣᵘˢད᤻£₦₦¥
- **profile_firstSeen**: "2026-05-28T20:36:15.913Z"
- **profile_lastSeen**: "2026-06-08T00:39:46.117Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-05-28T20:36:16.024Z
- **updatedAt**: 2026-08-01T20:52:31.876Z

**equipment**:
```json
{
  "main_hand": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "acquiredAt": 1781218952140,
    "rarity": "COMMON",
    "value": 16000,
    "stats": null,
    "slot": null,
    "maxDurability": 100,
    "durability": 84.9,
    "durabilityTraits": []
  },
  "off_hand": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "acquiredAt": 1781225690138,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT",
    "maxDurability": 80,
    "durability": 64.9,
    "durabilityTraits": []
  },
  "armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "acquiredAt": 1781226273443,
    "rarity": "COMMON",
    "value": 45000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 39.6,
    "durabilityTraits": []
  },
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 2,
    "xp": 205
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1781225690138,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 20,
    "acquiredAt": 1781530571535,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1781534005330,
    "rarity": "RARE",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781109818827,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 27,
    "acquiredAt": 1781533927438,
    "rarity": "UNCOMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781110050125,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 29,
    "acquiredAt": 1781264887272,
    "rarity": "COMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781432823201,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "ITEM",
    "quantity": 15,
    "acquiredAt": 1781181636787,
    "rarity": "UNCOMMON",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1781533614241,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1781531270638,
    "rarity": "UNCOMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 6,
    "acquiredAt": 1781530502140,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_potion": {
    "id": "minor_potion",
    "name": "Minor Health Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781223133636,
    "rarity": "COMMON",
    "value": 280,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781533779737,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1781264938820,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781530539333,
    "rarity": "RARE",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "steel_sabre": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781223975693,
    "rarity": "EPIC",
    "value": 16000,
    "stats": {
      "atk": 25,
      "spd": 5
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "crystal_staff": {
    "id": "crystal_staff",
    "name": "Crystal Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781225283345,
    "rarity": "UNCOMMON",
    "value": 3000,
    "stats": {
      "mag": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781225357941,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781225642334,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781530632739,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mirroredged_rapier": {
    "id": "mirroredged_rapier",
    "name": "Mirror-Edged Rapier",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781266540975,
    "rarity": "MYTHIC",
    "value": 43000,
    "stats": {
      "atk": 65,
      "spd": 30,
      "crit": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "dragonfang_claymore": {
    "id": "dragonfang_claymore",
    "name": "Dragon-Fang Claymore",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781267447800,
    "rarity": "MYTHIC",
    "value": 46000,
    "stats": {
      "atk": 85,
      "crit": 12
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 5,
    "acquiredAt": 1781349567571,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "silver_ore",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1781350048423,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "gold_ore",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1781350051722,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null
  },
  "health_potion": {
    "id": "health_potion",
    "name": "Health Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1781398719711,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "strength_brew",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1781398767417,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ascension_stone": {
    "id": "ascension_stone",
    "name": "Ascension Stone (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781398794717,
    "rarity": "EPIC",
    "value": 50000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781399604412,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781400444117,
    "rarity": "COMMON",
    "value": 95000,
    "stats": null,
    "slot": null
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781433240457,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781531313237,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781534005640,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781533313638,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781533824938,
    "rarity": "EPIC",
    "value": 6000,
    "stats": {
      "atk": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "great_wyrm_helm": {
    "id": "great_wyrm_helm",
    "name": "Great Wyrm Helm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781534047630,
    "rarity": "MYTHIC",
    "value": 32000,
    "stats": {
      "def": 45,
      "atk": 25,
      "crit": 8
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781534047937,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  }
}
```

---

### Barneyyyy  `2349166113259@s.whatsapp.net`

- **userId**: 2349166113259@s.whatsapp.net
- **registered**: true
- **nickname**: Barneyyyy
- **phoneHash**: a0ecd20a9d2e865e66a232f539fa94e413238ede078aca0523cbfa1e27f75018
- **wallet**: 30723
- **bank**: 0
- **class**: SCOUT
- **adventurerRank**: F
- **spriteIndex**: 34
- **level**: 13
- **xp**: 9024
- **hp**: 
- **maxHp**: 
- **currentHP**: 252
- **questGold**: 0
- **questsCompleted**: 9
- **questsWon**: 9
- **questsFailed**: 0
- **pvpWins**: 
- **pvpLosses**: 
- **eventTokens**: 0
- **totalEarned**: 35505
- **totalSpent**: 77780
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 13
- **progression_xp**: 9024
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 70
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Barneyyyy
- **profile_nickname**: Barneyyyy
- **profile_firstSeen**: "2026-05-28T23:53:35.732Z"
- **profile_lastSeen**: "2026-06-08T23:35:28.526Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-05-28T23:53:35.926Z
- **updatedAt**: 2026-08-01T18:34:56.235Z

**equipment**:
```json
{
  "main_hand": null,
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "evolution_stone": {
    "id": "evolution_stone",
    "name": "Evolution Stone (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780962429231,
    "rarity": "RARE",
    "value": 8000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "steel_sabre": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781030452612,
    "rarity": "COMMON",
    "value": 16000,
    "stats": null,
    "slot": null
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781079356524,
    "rarity": "LEGENDARY",
    "value": 6000,
    "stats": {
      "atk": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781079497764,
    "rarity": "MYTHIC",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781183291360,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781183423601,
    "rarity": "COMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1781183553053,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781202925984,
    "rarity": "UNCOMMON",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781202985084,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781203050091,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  }
}
```

---

### ĄŁŁĘŇ  `2347055849264@s.whatsapp.net`

- **userId**: 2347055849264@s.whatsapp.net
- **registered**: true
- **nickname**: ĄŁŁĘŇ
- **phoneHash**: 610336d20e462a48260c7b03261826e6deba6606be6a0ada2dde0073ae976c98
- **wallet**: 4750000
- **bank**: 20785138
- **class**: WARLORD
- **adventurerRank**: S
- **spriteIndex**: 58
- **level**: 64
- **xp**: 81197670
- **hp**: 226
- **maxHp**: 45210
- **currentHP**: 15543
- **questGold**: 0
- **questsCompleted**: 248
- **questsWon**: 206
- **questsFailed**: 8
- **pvpWins**: 1
- **pvpLosses**: 3
- **eventTokens**: 0
- **totalEarned**: 48901821
- **totalSpent**: 32964289
- **totalGambled**: 20000
- **gamesPlayed**: 0
- **gamesWon**: 1
- **gamesLost**: 1
- **biggestWin**: 10000
- **biggestLoss**: 10000
- **bossesDefeated**: 34
- **dragonsKilled**: 6
- **itemsCrafted**: 15
- **itemsEquipped**: 41
- **undeadKills**: 
- **kills**: 629
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 100
- **progression_level**: 64
- **progression_xp**: 81197670
- **progression_gp**: 230
- **progression_totalGP**: 230
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ĄŁŁĘŇ
- **profile_nickname**: ĄŁŁĘŇ
- **profile_firstSeen**: "2026-05-31T11:32:10.437Z"
- **profile_lastSeen**: "2026-06-08T08:44:20.524Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-05-31T11:32:10.628Z
- **updatedAt**: 2026-08-08T21:09:30.698Z

**equipment**:
```json
{
  "main_hand": {
    "id": "dragon_fang_dagger",
    "name": "God-forged Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "acquiredAt": 1781577588940,
    "rarity": "COMMON",
    "value": 22000,
    "stats": {
      "atk": 152,
      "crit": 42
    },
    "slot": null,
    "enhancementLevel": 5,
    "baseStats": {
      "atk": 55,
      "crit": 15
    },
    "enhancementBonus": 1.75,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "off_hand": {
    "id": "abyssal_bulwark",
    "name": "God-forged Abyssal Bulwark",
    "type": "EQUIPMENT",
    "acquiredAt": 1785794587677,
    "rarity": "MYTHIC",
    "value": 82000,
    "stats": {
      "def": 1323,
      "hp": 5175,
      "luck": 115
    },
    "slot": "off_hand",
    "reqLevel": 50,
    "baseStats": {
      "def": 115,
      "hp": 450,
      "luck": 10
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.5,
    "maxDurability": 150,
    "durability": 150,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "armor": {
    "id": "dragon_scale_armor",
    "name": "God-forged Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "acquiredAt": 1781210266783,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 978,
      "hp": 1725
    },
    "slot": "armor",
    "source": "COMBAT",
    "enhancementLevel": 30,
    "baseStats": {
      "def": 85,
      "hp": 150
    },
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "helmet": {
    "id": "dragon_helm",
    "name": "God-forged Dragon Helm",
    "type": "EQUIPMENT",
    "acquiredAt": 1785784869880,
    "rarity": "LEGENDARY",
    "value": 12000,
    "stats": {
      "def": 195,
      "hp": 98
    },
    "slot": "helmet",
    "source": "BOSS",
    "baseStats": {
      "def": 20,
      "hp": 10
    },
    "enhancementLevel": 20,
    "enhancementBonus": 8.75,
    "maxDurability": 156,
    "durability": 156,
    "durabilityTraits": []
  },
  "boots": {
    "id": "titanstomp_sabatons",
    "name": "God-forged Titan-Stomp Sabatons",
    "type": "EQUIPMENT",
    "acquiredAt": 1783950051251,
    "rarity": "COMMON",
    "value": 33000,
    "stats": {
      "def": 179,
      "spd": -27,
      "hp": 275
    },
    "slot": null,
    "enhancementLevel": 5,
    "baseStats": {
      "def": 65,
      "spd": -10,
      "hp": 100
    },
    "enhancementBonus": 1.75,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "ring": {
    "id": "dragon_seal_ring",
    "name": "God-forged Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1780940877070,
    "rarity": "COMMON",
    "value": 20000,
    "stats": {
      "atk": 28
    },
    "slot": null,
    "source": "ELITE_COMBAT",
    "enhancementLevel": 5,
    "baseStats": {
      "atk": 10
    },
    "enhancementBonus": 1.75,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "voidstar_choker",
    "name": "God-forged Void-Star Choker",
    "type": "EQUIPMENT",
    "acquiredAt": 1781572895351,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 2160,
      "mag": 864,
      "crit": 108
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT",
    "enhancementLevel": 30,
    "baseStats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    },
    "enhancementBonus": 9.799999999999995,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": {
    "id": "mantlet_of_chaos",
    "name": "God-forged Mantlet of Chaos",
    "type": "EQUIPMENT",
    "acquiredAt": 1783944726045,
    "rarity": "COMMON",
    "value": 54000,
    "stats": {
      "def": 165,
      "hp": 55,
      "luck": 42
    },
    "slot": null,
    "enhancementLevel": 5,
    "baseStats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "enhancementBonus": 1.75,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "abyssal_grasp",
    "name": "God-forged Abyssal Grasp",
    "type": "EQUIPMENT",
    "acquiredAt": 1783949695354,
    "rarity": "COMMON",
    "value": 54000,
    "stats": {
      "atk": 124,
      "mag": 69,
      "spd": 55
    },
    "slot": null,
    "enhancementLevel": 5,
    "baseStats": {
      "atk": 45,
      "mag": 25,
      "spd": 20
    },
    "enhancementBonus": 1.75,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 5,
    "xp": 189
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "defense_tonic": {
    "id": "defense_tonic",
    "name": "defense_tonic",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1781117082907,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "smoke_bomb",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1781191771550,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 5,
    "acquiredAt": 1781191776291,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1781264485777,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mana_potion": {
    "id": "mana_potion",
    "name": "Mana Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781300448725,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "cursed_bomb": {
    "id": "cursed_bomb",
    "name": "Cursed Bomb",
    "type": "CONSUMABLE",
    "quantity": 49,
    "acquiredAt": 1781574046138,
    "rarity": "RARE",
    "value": 5000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP",
    "usable": true,
    "effect": "aoe_slow_damage",
    "effectValue": 200
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 46,
    "acquiredAt": 1784231026413,
    "rarity": "MYTHIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 11,
    "acquiredAt": 1785156133241,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1784044098538,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "Major Health Potion",
    "type": "POTION",
    "quantity": 6,
    "acquiredAt": 1784138688279,
    "rarity": "RARE",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "dragon_key": {
    "id": "dragon_key",
    "name": "Dragon Hunter Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1784154851799,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "health_potion": {
    "id": "health_potion",
    "name": "Health Potion",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1784172592877,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1785155771947,
    "rarity": "UNCOMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785155804005,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785155804200,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1785155857620,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785155857818,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1785155971304,
    "rarity": "UNCOMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785155971831,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785156164492,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785156164678,
    "rarity": "EPIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785784793188,
    "rarity": "UNCOMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785784834802,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 1,
    "acquiredAt": 1785797866082,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785797866689,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1785797890942,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "titanium_fortified_carapace": {
    "id": "titanium_fortified_carapace",
    "name": "Titanium Fortified Carapace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785798141796,
    "rarity": "MYTHIC",
    "value": 43000,
    "stats": {
      "def": 100,
      "hp": 250
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1785798168415,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785798168944,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785875329117,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "dragon_key_reusable": {
    "id": "dragon_key_reusable",
    "name": "Master Dragon Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785881460841,
    "rarity": "LEGENDARY",
    "value": 100000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "abyssal_claw": {
    "id": "abyssal_claw",
    "name": "Abyssal Claw",
    "type": "SUMMON_GEAR",
    "quantity": 1,
    "acquiredAt": 1785952955607,
    "rarity": "EPIC",
    "value": 80000,
    "stats": {
      "atk": 60,
      "crit": 10
    },
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "basic_summon_egg": {
    "id": "basic_summon_egg",
    "name": "Basic Summon Egg",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785957863866,
    "rarity": "COMMON",
    "value": 5000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  }
}
```

---

### I C H I -𓃵  `2349057077609@s.whatsapp.net`

- **userId**: 2349057077609@s.whatsapp.net
- **registered**: true
- **nickname**: I C H I -𓃵
- **phoneHash**: 214c99acfe960119083b7570256c7b08b8612de8bb873d29c7c1ee1444b51faa
- **wallet**: 75836
- **bank**: 67427330
- **class**: TEMPLAR
- **adventurerRank**: A
- **spriteIndex**: 8
- **level**: 53
- **xp**: 11956780
- **hp**: 460
- **maxHp**: 
- **currentHP**: 4950
- **questGold**: 0
- **questsCompleted**: 125
- **questsWon**: 125
- **questsFailed**: 0
- **pvpWins**: 2
- **pvpLosses**: 
- **eventTokens**: 0
- **totalEarned**: 70840623
- **totalSpent**: 1257240
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 53
- **progression_xp**: 11956780
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 5
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ³❉ 𝙸 𝚌 𝚑 𝚒 -𓃵
- **profile_nickname**: I C H I -𓃵
- **profile_firstSeen**: "2026-06-04T12:41:15.379Z"
- **profile_lastSeen**: "2026-08-08T18:13:42.341Z"
- **profile_messageCount**: 6
- **createdAt**: 2026-06-04T12:41:15.476Z
- **updatedAt**: 2026-08-08T18:13:42.342Z

**equipment**:
```json
{
  "main_hand": {
    "id": "greatsword",
    "name": "Reinforced Greatsword",
    "type": "EQUIPMENT",
    "acquiredAt": 1780934249482,
    "rarity": "COMMON",
    "value": 6000,
    "stats": {
      "atk": 31
    },
    "slot": null,
    "enhancementLevel": 3,
    "source": "ELITE_COMBAT",
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": [],
    "baseStats": {
      "atk": 15
    },
    "enhancementBonus": 1.0499999999999998
  },
  "off_hand": null,
  "armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "acquiredAt": 1780937010938,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "helmet": null,
  "boots": null,
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1780934526382,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1780955546331,
    "rarity": "MYTHIC",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 19,
    "acquiredAt": 1781000548445,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "INFECTED_COLOSSUS"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1781000129903,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1780956971475,
    "rarity": "MYTHIC",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780932677154,
    "rarity": "RARE",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion",
    "type": "POTION",
    "quantity": 9,
    "acquiredAt": 1780936076931,
    "rarity": "UNCOMMON",
    "value": 600,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1780933430021,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1780956971230,
    "rarity": "MYTHIC",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1780939628887,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781000022577,
    "rarity": "COMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 8,
    "acquiredAt": 1780933327280,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1780933336840,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "major_potion",
    "type": "ITEM",
    "quantity": 6,
    "acquiredAt": 1780933355281,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 11,
    "acquiredAt": 1781001797177,
    "rarity": "MYTHIC",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1781000548600,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "steel_sabre": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780934403477,
    "rarity": "COMMON",
    "value": 16000,
    "stats": null,
    "slot": null
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780934479415,
    "rarity": "COMMON",
    "value": 5000,
    "stats": null,
    "slot": null
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780934497862,
    "rarity": "COMMON",
    "value": 1200,
    "stats": null,
    "slot": null
  },
  "dragon_seal_ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780934526382,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null
  },
  "mythril_staff": {
    "id": "mythril_staff",
    "name": "Mythril Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780934769602,
    "rarity": "COMMON",
    "value": 30000,
    "stats": null,
    "slot": null
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780935067026,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Greatsword",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1781174764875,
    "rarity": "MYTHIC",
    "value": 6000,
    "stats": {
      "atk": 31
    },
    "slot": "main_hand",
    "enhancementLevel": 3,
    "source": "ELITE_COMBAT",
    "baseStats": {
      "atk": 15
    },
    "enhancementBonus": 1.0499999999999998
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1780955841575,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 6,
    "acquiredAt": 1781174855679,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1781174657819,
    "rarity": "MYTHIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1781174764623,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1780938125061,
    "rarity": "MYTHIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781175038668,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1780955515691,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1781174830712,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1781174910523,
    "rarity": "MYTHIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780932617179,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1780957722974,
    "rarity": "RARE",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781001797392,
    "rarity": "MYTHIC",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781174729514,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "crystal_staff": {
    "id": "crystal_staff",
    "name": "Crystal Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781174855417,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": {
      "mag": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  }
}
```

---

### matty  `2347017056550@s.whatsapp.net`

- **userId**: 2347017056550@s.whatsapp.net
- **registered**: true
- **nickname**: matty
- **phoneHash**: c1fbe23ccbbc3eb073ce90dbed8d4355624ec99aa315be2461b875d50e71b4b1
- **wallet**: 102525
- **bank**: 18175243
- **class**: WARRIOR
- **adventurerRank**: B
- **spriteIndex**: 43
- **level**: 45
- **xp**: 2950383
- **hp**: 220
- **maxHp**: 
- **currentHP**: 5243
- **questGold**: 0
- **questsCompleted**: 127
- **questsWon**: 127
- **questsFailed**: 0
- **pvpWins**: 
- **pvpLosses**: 1
- **eventTokens**: 0
- **totalEarned**: 16310316
- **totalSpent**: 2897300
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 45
- **progression_xp**: 2950383
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 5
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ᴍᴀᴛᴛʏ ⚖️♎️
- **profile_nickname**: matty
- **profile_firstSeen**: "2026-06-06T14:13:22.651Z"
- **profile_lastSeen**: "2026-06-07T23:38:21.417Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-06-06T14:13:23.073Z
- **updatedAt**: 2026-08-08T12:11:10.896Z

**equipment**:
```json
{
  "main_hand": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "acquiredAt": 1780913938615,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "off_hand": null,
  "armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "acquiredAt": 1780967514347,
    "rarity": "COMMON",
    "value": 45000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "acquiredAt": 1780967566843,
    "rarity": "COMMON",
    "value": 12000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "boots": null,
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1780967643144,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 3,
    "xp": 233
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780913938615,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1781186709352,
    "rarity": "MYTHIC",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1780914706920,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "bomb": {
    "id": "bomb",
    "name": "bomb",
    "type": "ITEM",
    "quantity": 8,
    "acquiredAt": 1780916779818,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1781220224647,
    "rarity": "MYTHIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1780938558686,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "rabbit_hide": {
    "id": "rabbit_hide",
    "name": "Rabbit Hide",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1780938578077,
    "rarity": "COMMON",
    "value": 120,
    "stats": {},
    "slot": null
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 22,
    "acquiredAt": 1781211465883,
    "rarity": "LEGENDARY",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 8,
    "acquiredAt": 1781219402741,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 7,
    "acquiredAt": 1781219803038,
    "rarity": "MYTHIC",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781219079743,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1781219080123,
    "rarity": "EPIC",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1781219254837,
    "rarity": "MYTHIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "evolution_stone": {
    "id": "evolution_stone",
    "name": "Evolution Stone (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1780959144765,
    "rarity": "RARE",
    "value": 8000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780917276914,
    "rarity": "COMMON",
    "value": 5000,
    "stats": null,
    "slot": null
  },
  "iron_plate": {
    "id": "iron_plate",
    "name": "Iron Plate",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780917307915,
    "rarity": "COMMON",
    "value": 4500,
    "stats": null,
    "slot": null
  },
  "major_potion": {
    "id": "major_potion",
    "name": "major_potion",
    "type": "ITEM",
    "quantity": 7,
    "acquiredAt": 1780967776445,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1781207630336,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1780998271648,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {
      "atk": 5
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781118321404,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "elixir": {
    "id": "elixir",
    "name": "elixir",
    "type": "ITEM",
    "quantity": 3,
    "acquiredAt": 1781102771861,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 20,
    "acquiredAt": 1781206890003,
    "rarity": "MYTHIC",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781219403126,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781186551660,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "deer_antler": {
    "id": "deer_antler",
    "name": "Deer Antlers",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781105644624,
    "rarity": "UNCOMMON",
    "value": 600,
    "stats": {},
    "slot": null
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1781219138029,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781219803418,
    "rarity": "MYTHIC",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "wisdom_tome": {
    "id": "wisdom_tome",
    "name": "Wisdom Tome",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1781111813931,
    "rarity": "MYTHIC",
    "value": 10000,
    "stats": null,
    "slot": null,
    "source": "PUZZLE"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1781219603820,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781201481139,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1781118321558,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "defense_tonic": {
    "id": "defense_tonic",
    "name": "defense_tonic",
    "type": "ITEM",
    "quantity": 4,
    "acquiredAt": 1781118671501,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1781186028858,
    "rarity": "MYTHIC",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 20,
    "acquiredAt": 1781124152334,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781208384839,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781186003758,
    "rarity": "MYTHIC",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1781212200986,
    "rarity": "MYTHIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781186472458,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1781220224238,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "mana_potion": {
    "id": "mana_potion",
    "name": "Mana Potion",
    "type": "ITEM",
    "quantity": 5,
    "acquiredAt": 1781186626852,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781186781404,
    "rarity": "MYTHIC",
    "value": 6000,
    "stats": {
      "atk": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 6,
    "acquiredAt": 1781207092584,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781211240631,
    "rarity": "MYTHIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  }
}
```

---

### CLOUD 🪐🪬  `2348107704329@s.whatsapp.net`

- **userId**: 2348107704329@s.whatsapp.net
- **registered**: true
- **nickname**: CLOUD 🪐🪬
- **phoneHash**: 18f26ce2260c3966334f805e72a0ffc1b03c81da88dc2af114186323ec8944f1
- **wallet**: 2010
- **bank**: 0
- **class**: ACOLYTE
- **adventurerRank**: F
- **spriteIndex**: 77
- **level**: 6
- **xp**: 1643
- **hp**: 
- **maxHp**: 
- **currentHP**: 175
- **questGold**: 0
- **questsCompleted**: 10
- **questsWon**: 10
- **questsFailed**: 0
- **pvpWins**: 
- **pvpLosses**: 
- **eventTokens**: 0
- **totalEarned**: 71230
- **totalSpent**: 69220
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 6
- **progression_xp**: 1643
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 5
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: CLOUD 🪐🪬
- **profile_nickname**: CLOUD 🪐🪬
- **profile_firstSeen**: "2026-06-08T10:56:25.513Z"
- **profile_lastSeen**: "2026-06-08T10:56:25.516Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-06-08T10:56:25.516Z
- **updatedAt**: 2026-08-01T18:34:57.114Z

**equipment**:
```json
{
  "main_hand": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "acquiredAt": 1781532047542,
    "rarity": "COMMON",
    "value": 5000,
    "stats": null,
    "slot": null,
    "maxDurability": 100,
    "durability": 89.6,
    "durabilityTraits": []
  },
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 8,
    "xp": 390
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "mythic_fish": {
    "id": "mythic_fish",
    "name": "Void Kraken Tentacle",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781018427331,
    "rarity": "MYTHIC",
    "value": 15000,
    "stats": {},
    "slot": null
  },
  "bear_claw": {
    "id": "bear_claw",
    "name": "Bear Claws",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781018886547,
    "rarity": "RARE",
    "value": 2500,
    "stats": {},
    "slot": null
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 121,
    "acquiredAt": 1781524949126,
    "rarity": "COMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mana_potion": {
    "id": "mana_potion",
    "name": "mana_potion",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1781026927390,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1781530843745,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1781530696858,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781531885267,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null
  },
  "regen_salve": {
    "id": "regen_salve",
    "name": "Regeneration Salve",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781532440533,
    "rarity": "UNCOMMON",
    "value": 1120,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781559096188,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  }
}
```

---

### MOv¡C DAVE 🍥  `2348083243446@s.whatsapp.net`

- **userId**: 2348083243446@s.whatsapp.net
- **registered**: true
- **nickname**: MOv¡C DAVE 🍥
- **phoneHash**: eea0a26dabc30550f613d036ea517d61ec7e1f73e183b0d45b86074647214205
- **wallet**: 82084
- **bank**: 286168
- **class**: SCOUT
- **adventurerRank**: D
- **spriteIndex**: 61
- **level**: 27
- **xp**: 125471
- **hp**: 
- **maxHp**: 
- **currentHP**: 792
- **questGold**: 0
- **questsCompleted**: 27
- **questsWon**: 27
- **questsFailed**: 0
- **pvpWins**: 
- **pvpLosses**: 2
- **eventTokens**: 0
- **totalEarned**: 562480
- **totalSpent**: 105280
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 27
- **progression_xp**: 125471
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 5
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: MOv¡C DAVE 🍥
- **profile_nickname**: MOv¡C DAVE 🍥
- **profile_firstSeen**: "2026-06-09T05:48:09.950Z"
- **profile_lastSeen**: "2026-06-09T09:15:18.748Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-06-09T05:48:10.284Z
- **updatedAt**: 2026-08-01T18:34:57.291Z

**equipment**:
```json
{
  "main_hand": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "acquiredAt": 1781030483408,
    "rarity": "COMMON",
    "value": 16000,
    "stats": null,
    "slot": null,
    "maxDurability": 100,
    "durability": 100,
    "durabilityTraits": []
  },
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "iron_ring": {
    "id": "iron_ring",
    "name": "Iron Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781004254645,
    "rarity": "UNCOMMON",
    "value": 2000,
    "stats": {
      "hp": 10
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1781205897098,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781204920906,
    "rarity": "UNCOMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781005046563,
    "rarity": "LEGENDARY",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "steel_sabre": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781030483408,
    "rarity": "COMMON",
    "value": 16000,
    "stats": null,
    "slot": null
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781079356766,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781202939990,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1781207361692,
    "rarity": "MYTHIC",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781204017633,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1781079113121,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1781206518790,
    "rarity": "UNCOMMON",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781207241486,
    "rarity": "COMMON",
    "value": 6000,
    "stats": null,
    "slot": null
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1781207940087,
    "rarity": "MYTHIC",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1781441012380,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  }
}
```

---

### Revlis  `25151529836547@lid`

- **userId**: 25151529836547@lid
- **registered**: true
- **nickname**: Revlis
- **phoneHash**: 047e70856bda38410093ce7409d0db78a9719d5068b2296afc866845caae6c86
- **wallet**: 1900000000
- **bank**: 170000500
- **class**: DRAGON_GOD
- **adventurerRank**: SS
- **spriteIndex**: 93
- **level**: 91
- **xp**: 7833356734
- **hp**: 8943
- **maxHp**: 18717
- **currentHP**: 24851
- **questGold**: 0
- **questsCompleted**: 443
- **questsWon**: 176
- **questsFailed**: 15
- **pvpWins**: 17
- **pvpLosses**: 9
- **eventTokens**: 0
- **totalEarned**: 4816255265
- **totalSpent**: 2412001859
- **totalGambled**: 2100000
- **gamesPlayed**: 0
- **gamesWon**: 3
- **gamesLost**: 3
- **biggestWin**: 500000
- **biggestLoss**: 500000
- **bossesDefeated**: 254
- **dragonsKilled**: 166
- **itemsCrafted**: 1
- **itemsEquipped**: 75
- **undeadKills**: 6
- **kills**: 3151
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 90
- **progression_level**: 91
- **progression_xp**: 7833356734
- **progression_gp**: 1541
- **progression_totalGP**: 1541
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Ę.Ñ.Ď
- **profile_nickname**: Revlis
- **profile_firstSeen**: "2026-06-12T15:14:22.405Z"
- **profile_lastSeen**: "2026-07-12T11:47:27.096Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-06-12T15:14:22.405Z
- **updatedAt**: 2026-08-07T16:03:51.768Z

**equipment**:
```json
{
  "main_hand": {
    "id": "necrotic_carver",
    "name": "God-forged Necrotic Carver",
    "type": "EQUIPMENT",
    "acquiredAt": 1785272946319,
    "rarity": "COMMON",
    "value": 24000,
    "stats": {
      "atk": 138,
      "mag": 83
    },
    "slot": null,
    "baseStats": {
      "atk": 50,
      "mag": 30
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.75,
    "maxDurability": 80,
    "durability": 74,
    "durabilityTraits": []
  },
  "off_hand": {
    "id": "null_staff",
    "name": "God-forged Light Null Staff",
    "type": "EQUIPMENT",
    "acquiredAt": 1785195229726,
    "rarity": "MYTHIC",
    "value": 380000,
    "stats": {
      "mag": 1553,
      "hp": 403,
      "crit": 173
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "maxDurability": 150,
    "durability": 148.8,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "mag": 135,
      "hp": 35,
      "crit": 15
    },
    "enhancementLevel": 24,
    "enhancementBonus": 10.5
  },
  "armor": {
    "id": "garb_of_the_elder_mage",
    "name": "God-forged Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "acquiredAt": 1784409684460,
    "rarity": "MYTHIC",
    "value": 41000,
    "stats": {
      "def": 168,
      "mag": 218,
      "spd": 51
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 50,
      "mag": 65,
      "spd": 15
    },
    "enhancementLevel": 7,
    "enhancementBonus": 2.3499999999999996,
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "helmet": {
    "id": "void_crown",
    "name": "God-forged Void Crown",
    "type": "EQUIPMENT",
    "acquiredAt": 1786081010997,
    "rarity": "MYTHIC",
    "value": 600000,
    "stats": {
      "mag": 905,
      "def": 453,
      "luck": 272
    },
    "slot": "helmet",
    "reqLevel": 80,
    "baseStats": {
      "mag": 100,
      "def": 50,
      "luck": 30
    },
    "enhancementLevel": 23,
    "enhancementBonus": 8.049999999999997,
    "maxDurability": 180,
    "durability": 179.8,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "boots": {
    "id": "infernal_greaves",
    "name": "God-forged Infernal Greaves",
    "type": "EQUIPMENT",
    "acquiredAt": 1783976118337,
    "rarity": "COMMON",
    "value": 59000,
    "stats": {
      "def": 152,
      "spd": 69,
      "atk": 42
    },
    "slot": null,
    "baseStats": {
      "def": 55,
      "spd": 25,
      "atk": 15
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.75,
    "maxDurability": 96,
    "durability": 93.9,
    "durabilityTraits": []
  },
  "ring": {
    "id": "loop_of_forever",
    "name": "God-forged Loop of Forever",
    "type": "EQUIPMENT",
    "acquiredAt": 1783946288458,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "mag": 104,
      "luck": 125,
      "crit": 63
    },
    "slot": "ring",
    "source": "COMBAT",
    "baseStats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "enhancementLevel": 9,
    "enhancementBonus": 3.1500000000000004,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "amulet": {
    "id": "abyssal_amulet",
    "name": "God-forged Abyssal Amulet",
    "type": "EQUIPMENT",
    "acquiredAt": 1785737014717,
    "rarity": "MYTHIC",
    "value": 450000,
    "stats": {
      "mag": 450,
      "hp": 225
    },
    "slot": "amulet",
    "reqLevel": 70,
    "baseStats": {
      "mag": 100,
      "hp": 50
    },
    "enhancementLevel": 10,
    "enhancementBonus": 3.5000000000000004,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": {
    "id": "mantlet_of_chaos",
    "name": "Masterwork Mantlet of Chaos",
    "type": "EQUIPMENT",
    "acquiredAt": 1783976340312,
    "rarity": "COMMON",
    "value": 54000,
    "stats": {
      "def": 144,
      "hp": 48,
      "luck": 36
    },
    "slot": null,
    "baseStats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "enhancementLevel": 4,
    "enhancementBonus": 1.4,
    "maxDurability": 96,
    "durability": 93.9,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "abyssal_grasp",
    "name": "God-forged Abyssal Grasp",
    "type": "EQUIPMENT",
    "acquiredAt": 1783965787763,
    "rarity": "COMMON",
    "value": 54000,
    "stats": {
      "atk": 124,
      "mag": 69,
      "spd": 55
    },
    "slot": "gloves",
    "maxDurability": 96,
    "durability": 93.9,
    "durabilityTraits": [],
    "source": "COMBAT",
    "baseStats": {
      "atk": 45,
      "mag": 25,
      "spd": 20
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.75
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784326154975,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "summon_egg_common": {
    "id": "summon_egg_common",
    "name": "Common Summon Egg",
    "type": "ITEM",
    "quantity": null,
    "acquiredAt": 1785494877043,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 13,
    "acquiredAt": 1785622355310,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785740741441,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 20,
    "acquiredAt": 1785868734050,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 32,
    "acquiredAt": 1785868743984,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785870047439,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1785871809164,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1785871834561,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "CORRUPTED_GUARDIAN"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1785883305671,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1785883340981,
    "rarity": "COMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785883356428,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786080043191,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786080142581,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786080154786,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1786080302958,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1786081098461,
    "rarity": "COMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786082130387,
    "rarity": "RARE",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1786082516283,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1786082576977,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1786082749879,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786082788974,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786083306186,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1786083737211,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1786083814978,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786084037487,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "garb_of_the_elder_mage": {
    "id": "garb_of_the_elder_mage",
    "name": "God-forged Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786082693476,
    "rarity": "MYTHIC",
    "value": 41000,
    "stats": {
      "def": 168,
      "mag": 218,
      "spd": 51
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 50,
      "mag": 65,
      "spd": 15
    },
    "enhancementLevel": 7,
    "enhancementBonus": 2.3499999999999996,
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  }
}
```

---

### CraftTestHero  `test_craft_user@s.whatsapp.net`

- **userId**: test_craft_user@s.whatsapp.net
- **registered**: true
- **nickname**: CraftTestHero
- **phoneHash**: 
- **wallet**: 1000
- **bank**: 0
- **class**: SCOUT
- **adventurerRank**: F
- **spriteIndex**: 50
- **level**: 5
- **xp**: 724
- **hp**: 
- **maxHp**: 
- **currentHP**: 144
- **questGold**: 0
- **questsCompleted**: 0
- **questsWon**: 0
- **questsFailed**: 0
- **pvpWins**: 0
- **pvpLosses**: 0
- **eventTokens**: 0
- **totalEarned**: 1000
- **totalSpent**: 0
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 0
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 
- **progression_level**: 5
- **progression_xp**: 724
- **progression_gp**: 0
- **progression_totalGP**: 0
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: 
- **profile_nickname**: CraftTestHero
- **profile_firstSeen**: "2026-06-13T04:05:23.491Z"
- **profile_lastSeen**: "2026-06-13T04:05:23.505Z"
- **profile_messageCount**: 0
- **createdAt**: 2026-06-13T04:05:23.665Z
- **updatedAt**: 2026-08-01T18:34:57.835Z

**equipment**:
```json
{
  "main_hand": null,
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1781325175663,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand"
  }
}
```

---

### Gojousensei  `2348108205964@s.whatsapp.net`

- **userId**: 2348108205964@s.whatsapp.net
- **registered**: true
- **nickname**: Gojousensei
- **phoneHash**: 5ca08c6bbff9d941752ea0ed902a8ee1900a686555ebdc551de0407069b4e6b4
- **wallet**: 0
- **bank**: 535111943
- **class**: AVATAR
- **adventurerRank**: B
- **spriteIndex**: 26
- **level**: 85
- **xp**: 2959758992
- **hp**: 5143
- **maxHp**: 1015531
- **currentHP**: 986043
- **questGold**: 0
- **questsCompleted**: 233
- **questsWon**: 58
- **questsFailed**: 14
- **pvpWins**: 3
- **pvpLosses**: 8
- **eventTokens**: 0
- **totalEarned**: 558439376
- **totalSpent**: 21371069
- **totalGambled**: 94500
- **gamesPlayed**: 0
- **gamesWon**: 1
- **gamesLost**: 11
- **biggestWin**: 500
- **biggestLoss**: 40000
- **bossesDefeated**: 265
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 18
- **undeadKills**: 6
- **kills**: 1868
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 60
- **progression_level**: 85
- **progression_xp**: 2959758992
- **progression_gp**: 542
- **progression_totalGP**: 542
- **progression_statPoints**: 20366227966
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: 🫩
- **profile_nickname**: Gojousensei
- **profile_firstSeen**: "2026-06-15T19:08:26.037Z"
- **profile_lastSeen**: "2026-08-08T16:43:50.853Z"
- **profile_messageCount**: 3
- **createdAt**: 2026-06-15T19:08:26.040Z
- **updatedAt**: 2026-08-08T20:22:20.300Z

**equipment**:
```json
{
  "main_hand": {
    "id": "arcane_wand",
    "name": "God-forged Arcane Wand",
    "type": "EQUIPMENT",
    "acquiredAt": 1784474271884,
    "rarity": "COMMON",
    "value": 6000,
    "stats": {
      "mag": 50
    },
    "slot": null,
    "source": "ELEMENTAL_ARCHON",
    "maxDurability": 65,
    "durability": 61.6,
    "durabilityTraits": [],
    "enhancementLevel": 5,
    "enhancementBonus": 1.75,
    "baseStats": {
      "mag": 18
    }
  },
  "off_hand": {
    "id": "dragonscale_kite_shield",
    "name": "God-forged Dragon-Scale Kite Shield",
    "type": "EQUIPMENT",
    "acquiredAt": 1786134306387,
    "rarity": "LEGENDARY",
    "value": 39000,
    "stats": {
      "def": 927,
      "hp": 1463
    },
    "slot": "off_hand",
    "reqLevel": 40,
    "baseStats": {
      "def": 95,
      "hp": 150
    },
    "enhancementLevel": 25,
    "enhancementBonus": 8.75,
    "maxDurability": 130,
    "durability": 125.2,
    "durabilityTraits": []
  },
  "armor": {
    "id": "abyssal_carapace",
    "name": "Abyssal Carapace",
    "type": "EQUIPMENT",
    "acquiredAt": 1785256384116,
    "rarity": "COMMON",
    "value": 78000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 95.5,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "dragon_helm",
    "name": "God-forged Dragon Helm",
    "type": "EQUIPMENT",
    "acquiredAt": 1785154277804,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 160,
      "hp": 80
    },
    "slot": "helmet",
    "source": "BOSS",
    "maxDurability": 138,
    "durability": 137.5,
    "durabilityTraits": [],
    "enhancementLevel": 20,
    "enhancementBonus": 7,
    "baseStats": {
      "def": 20,
      "hp": 10
    }
  },
  "boots": {
    "id": "striders_of_the_titan",
    "name": "God-forged Striders of the Titan",
    "type": "EQUIPMENT",
    "acquiredAt": 1786134800828,
    "rarity": "LEGENDARY",
    "value": 32000,
    "stats": {
      "def": 537,
      "atk": 98,
      "hp": 488
    },
    "slot": "boots",
    "reqLevel": 40,
    "baseStats": {
      "def": 55,
      "atk": 10,
      "hp": 50
    },
    "enhancementLevel": 17,
    "enhancementBonus": 8.75,
    "maxDurability": 156,
    "durability": 155.5,
    "durabilityTraits": []
  },
  "ring": {
    "id": "titanium_band",
    "name": "God-forged Titanium Band",
    "type": "EQUIPMENT",
    "acquiredAt": 1786134786766,
    "rarity": "LEGENDARY",
    "value": 34000,
    "stats": {
      "def": 244,
      "hp": 975
    },
    "slot": "ring",
    "reqLevel": 40,
    "baseStats": {
      "def": 25,
      "hp": 100
    },
    "enhancementLevel": 16,
    "enhancementBonus": 8.75,
    "maxDurability": 104,
    "durability": 104,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "voidstar_choker",
    "name": "God-forged Lucky Void-Star Choker",
    "type": "EQUIPMENT",
    "acquiredAt": 1785255471178,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 2300,
      "mag": 920,
      "crit": 115
    },
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": [],
    "enhancementLevel": 30,
    "enhancementBonus": 10.5,
    "baseStats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    }
  },
  "cloak": {
    "id": "flickering_flame_cape",
    "name": "Flickering Flame Cape",
    "type": "EQUIPMENT",
    "acquiredAt": 1784541800008,
    "rarity": "EPIC",
    "value": 6500,
    "stats": {
      "def": 20,
      "atk": 10
    },
    "slot": "cloak",
    "source": "COMBAT",
    "maxDurability": 138,
    "durability": 137.5,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "gloves_of_the_ruined_kingdom",
    "name": "God-forged Gloves of the Ruined Kingdom",
    "type": "EQUIPMENT",
    "acquiredAt": 1786134790476,
    "rarity": "LEGENDARY",
    "value": 33000,
    "stats": {
      "mag": 293,
      "spd": 147,
      "luck": 117
    },
    "slot": "gloves",
    "reqLevel": 40,
    "source": "COMBAT",
    "baseStats": {
      "mag": 30,
      "spd": 15,
      "luck": 12
    },
    "enhancementLevel": 16,
    "enhancementBonus": 8.75,
    "maxDurability": 156,
    "durability": 155.5,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Strengthened Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784396470136,
    "rarity": "COMMON",
    "value": 22000,
    "stats": {
      "atk": 94,
      "crit": 26
    },
    "slot": null,
    "baseStats": {
      "atk": 55,
      "crit": 15
    },
    "enhancementLevel": 2,
    "enhancementBonus": 0.7
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "Strength Brew",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784396620357,
    "rarity": "EPIC",
    "value": 3200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 88,
    "acquiredAt": 1785153423684,
    "rarity": "UNCOMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 63,
    "acquiredAt": 1785154034761,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 14,
    "acquiredAt": 1784540939690,
    "rarity": "RARE",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "TREASURE"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 55,
    "acquiredAt": 1784542139406,
    "rarity": "UNCOMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784460921521,
    "rarity": "UNCOMMON",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ascension_stone": {
    "id": "ascension_stone",
    "name": "Ascension Stone (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784465763534,
    "rarity": "EPIC",
    "value": 50000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 45,
    "acquiredAt": 1785154052588,
    "rarity": "LEGENDARY",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 33,
    "acquiredAt": 1784540584308,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 54,
    "acquiredAt": 1785153886875,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 116,
    "acquiredAt": 1784471223845,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 53,
    "acquiredAt": 1784574642057,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 38,
    "acquiredAt": 1785153516791,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "abyssal_blade": {
    "id": "abyssal_blade",
    "name": "Polished Abyssal Blade",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784471132337,
    "rarity": "MYTHIC",
    "value": 950000,
    "stats": {
      "atk": 336,
      "mag": 80,
      "crit": 32
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "baseStats": {
      "atk": 210,
      "mag": 50,
      "crit": 20
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.6
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 98,
    "acquiredAt": 1785153516255,
    "rarity": "EPIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "VOID_CORRUPTED"
  },
  "void_titan_heart": {
    "id": "void_titan_heart",
    "name": "Void Titan Heart",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1784471223547,
    "rarity": "MYTHIC",
    "value": 120000,
    "stats": null,
    "slot": null,
    "source": "VOID_TITAN"
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784473563589,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand",
    "maxDurability": 100,
    "durability": 95.4,
    "durabilityTraits": [],
    "source": "CORRUPTED_GUARDIAN"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784506303696,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "defense_tonic": {
    "id": "defense_tonic",
    "name": "defense_tonic",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1784473693533,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784540812410,
    "rarity": "UNCOMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "God-forged Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1784474183682,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 20
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "baseStats": {
      "atk": 8
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.3999999999999997
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 177,
    "acquiredAt": 1784574649927,
    "rarity": "RARE",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "arcane_wand": {
    "id": "arcane_wand",
    "name": "God-forged Arcane Wand",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784474271884,
    "rarity": "COMMON",
    "value": 6000,
    "stats": {
      "mag": 50
    },
    "slot": null,
    "source": "ELEMENTAL_ARCHON",
    "baseStats": {
      "mag": 18
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.75
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "God-forged Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785154277804,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 160,
      "hp": 80
    },
    "slot": "helmet",
    "source": "BOSS",
    "baseStats": {
      "def": 20,
      "hp": 10
    },
    "enhancementLevel": 20,
    "enhancementBonus": 7
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 38,
    "acquiredAt": 1784506952410,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 53,
    "acquiredAt": 1785152430349,
    "rarity": "RARE",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784506961795,
    "rarity": "RARE",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "cloak_of_dark_matter": {
    "id": "cloak_of_dark_matter",
    "name": "Cloak of Dark Matter",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784484364512,
    "rarity": "LEGENDARY",
    "value": 15000,
    "stats": {
      "def": 40,
      "mag": 10
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "chaos_blade": {
    "id": "chaos_blade",
    "name": "Chaos Blade",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784396396871,
    "rarity": "COMMON",
    "value": 180000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 5.3,
    "durabilityTraits": [],
    "warnedLow": true
  },
  "null_staff": {
    "id": "null_staff",
    "name": "Strengthened Null Staff",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784485002110,
    "rarity": "COMMON",
    "value": 380000,
    "stats": {
      "mag": 230,
      "hp": 60,
      "crit": 26
    },
    "slot": "main_hand",
    "baseStats": {
      "mag": 135,
      "hp": 35,
      "crit": 15
    },
    "enhancementLevel": 2,
    "enhancementBonus": 0.7,
    "source": "COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784506065797,
    "rarity": "RARE",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784506416703,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1784506951902,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 61,
    "acquiredAt": 1784574459742,
    "rarity": "RARE",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1784537562762,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784538520317,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "abyssal_crown": {
    "id": "abyssal_crown",
    "name": "Abyssal Crown",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784539763421,
    "rarity": "MYTHIC",
    "value": 1100000,
    "stats": {
      "def": 200,
      "hp": 200,
      "luck": 40,
      "mag": 20
    },
    "slot": "helmet",
    "source": "BOSS"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 6,
    "acquiredAt": 1784574459234,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784574428860,
    "rarity": "EPIC",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1785154256892,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mythril_staff": {
    "id": "mythril_staff",
    "name": "Strengthened Mythril Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784484740409,
    "rarity": "COMMON",
    "value": 30000,
    "stats": {
      "mag": 77,
      "hp": 26
    },
    "slot": null,
    "maxDurability": 65,
    "durability": 65,
    "durabilityTraits": [],
    "baseStats": {
      "mag": 45,
      "hp": 15
    },
    "enhancementLevel": 2,
    "enhancementBonus": 0.7
  },
  "dewdrop_necklace": {
    "id": "dewdrop_necklace",
    "name": "Dewdrop Necklace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784484364106,
    "rarity": "EPIC",
    "value": 6200,
    "stats": {
      "hp": 80,
      "mag": 15
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT",
    "maxDurability": 92,
    "durability": 92,
    "durabilityTraits": []
  },
  "eelskin_hazard_suit": {
    "id": "eelskin_hazard_suit",
    "name": "Eel-Skin Hazard Suit",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784538058261,
    "rarity": "MYTHIC",
    "value": 76000,
    "stats": {
      "def": 90,
      "hp": 300,
      "spd": 30
    },
    "slot": "armor",
    "source": "COMBAT",
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 6,
    "acquiredAt": 1785257357933,
    "rarity": "EPIC",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor",
    "source": "VOID_CORRUPTED"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785257940672,
    "rarity": "EPIC",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "voidstar_choker": {
    "id": "voidstar_choker",
    "name": "God-forged Lucky Void-Star Choker",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785756377241,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 2300,
      "mag": 920,
      "crit": 115
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.5
  },
  "abyssal_grasp": {
    "id": "abyssal_grasp",
    "name": "Abyssal Grasp",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785777937744,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": null,
    "slot": "gloves",
    "reqLevel": 50
  },
  "heart_of_the_cosmos": {
    "id": "heart_of_the_cosmos",
    "name": "Heart of the Cosmos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785777940900,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": null,
    "slot": "amulet",
    "reqLevel": 50
  },
  "infernal_greaves": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785777946602,
    "rarity": "MYTHIC",
    "value": 59000,
    "stats": null,
    "slot": "boots",
    "reqLevel": 50
  },
  "titanium_fortified_carapace": {
    "id": "titanium_fortified_carapace",
    "name": "Polished Titanium Fortified Carapace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785777955761,
    "rarity": "LEGENDARY",
    "value": 43000,
    "stats": {
      "def": 135,
      "hp": 338
    },
    "slot": "armor",
    "reqLevel": 40,
    "baseStats": {
      "def": 100,
      "hp": 250
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "mantlet_of_chaos": {
    "id": "mantlet_of_chaos",
    "name": "Reinforced Mantlet of Chaos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785777959939,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": {
      "def": 111,
      "hp": 37,
      "luck": 28
    },
    "slot": "cloak",
    "reqLevel": 50,
    "baseStats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "enhancementLevel": 3,
    "enhancementBonus": 0.85
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785860303699,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785861167860,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785862498206,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "shadow_cloak": {
    "id": "shadow_cloak",
    "name": "God-forged Shadow Cloak",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785862719771,
    "rarity": "LEGENDARY",
    "value": 90000,
    "stats": {
      "def": 122,
      "spd": 92,
      "luck": 61
    },
    "slot": "cloak",
    "reqLevel": 40,
    "baseStats": {
      "def": 40,
      "spd": 30,
      "luck": 20
    },
    "enhancementLevel": 5,
    "enhancementBonus": 2.05
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1785863421591,
    "rarity": "LEGENDARY",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "essence_mirror": {
    "id": "essence_mirror",
    "name": "Essence Mirror",
    "type": "ITEM",
    "quantity": 5,
    "acquiredAt": 1785863971077,
    "rarity": "LEGENDARY",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 37,
    "acquiredAt": 1785864539559,
    "rarity": "RARE",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "aegis_of_the_abyss": {
    "id": "aegis_of_the_abyss",
    "name": "Aegis of the Abyss",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785255204044,
    "rarity": "COMMON",
    "value": 80000,
    "stats": null,
    "slot": null
  },
  "crown_of_hellfire": {
    "id": "crown_of_hellfire",
    "name": "Crown of Hellfire",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785256380056,
    "rarity": "COMMON",
    "value": 65000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 95.4,
    "durabilityTraits": []
  },
  "abyssal_gauntlets": {
    "id": "abyssal_gauntlets",
    "name": "Abyssal Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785947012989,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "atk": 80,
      "def": 60,
      "crit": 30
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT"
  },
  "cloak_of_the_hive": {
    "id": "cloak_of_the_hive",
    "name": "Cloak of the Hive of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785947907774,
    "rarity": "MYTHIC",
    "value": 14500,
    "stats": {
      "def": 35,
      "spd": 10,
      "atk": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "rare_fragment": {
    "id": "rare_fragment",
    "name": "Rare Summon Fragment",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1786061122392,
    "rarity": "RARE",
    "value": 3000,
    "stats": {},
    "slot": null
  },
  "winged_sandals": {
    "id": "winged_sandals",
    "name": "Lucky Winged Sandals",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786061531478,
    "rarity": "RARE",
    "value": 18000,
    "stats": {
      "spd": 40,
      "luck": 15
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1786116482501,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "rabbit_hide": {
    "id": "rabbit_hide",
    "name": "Rabbit Hide",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786116483668,
    "rarity": "COMMON",
    "value": 120,
    "stats": {},
    "slot": null
  },
  "deer_antler": {
    "id": "deer_antler",
    "name": "Deer Antlers",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786116499072,
    "rarity": "UNCOMMON",
    "value": 600,
    "stats": {},
    "slot": null
  },
  "tower_shield": {
    "id": "tower_shield",
    "name": "Tower Shield",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785945999439,
    "rarity": "EPIC",
    "value": 38000,
    "stats": null,
    "slot": "off_hand",
    "reqLevel": 22,
    "maxDurability": 115,
    "durability": 115,
    "durabilityTraits": []
  },
  "abyssal_shield": {
    "id": "abyssal_shield",
    "name": "Abyssal Shield",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785945944117,
    "rarity": "LEGENDARY",
    "value": 120000,
    "stats": {
      "def": 70,
      "hp": 80,
      "spd": 10
    },
    "slot": "off_hand",
    "reqLevel": 45,
    "maxDurability": 130,
    "durability": 130,
    "durabilityTraits": [],
    "source": "ELITE_COMBAT"
  },
  "gloves_of_the_ruined_kingdom": {
    "id": "gloves_of_the_ruined_kingdom",
    "name": "God-forged Gloves of the Ruined Kingdom",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786134790476,
    "rarity": "LEGENDARY",
    "value": 33000,
    "stats": {
      "mag": 293,
      "spd": 147,
      "luck": 117
    },
    "slot": "gloves",
    "reqLevel": 40,
    "source": "COMBAT",
    "baseStats": {
      "mag": 30,
      "spd": 15,
      "luck": 12
    },
    "enhancementLevel": 16,
    "enhancementBonus": 8.75
  },
  "mirror_buckler": {
    "id": "mirror_buckler",
    "name": "Sharp Mirror Buckler",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786144049580,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "def": 75,
      "spd": 20,
      "luck": 8,
      "atk": 8
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "bloodsoaked_claws": {
    "id": "bloodsoaked_claws",
    "name": "Blood-Soaked Claws",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786144173383,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "atk": 40,
      "crit": 10
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "mythic_enhancement_stone": {
    "id": "mythic_enhancement_stone",
    "name": "Mythic Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 18,
    "acquiredAt": 1786145260409,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "dragonfang_claymore": {
    "id": "dragonfang_claymore",
    "name": "Dragon-Fang Claymore",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786145700161,
    "rarity": "MYTHIC",
    "value": 46000,
    "stats": {
      "atk": 85,
      "crit": 12
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "treads_of_the_damned": {
    "id": "treads_of_the_damned",
    "name": "Sharp Treads of the Damned",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786145743176,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "def": 40,
      "spd": 45,
      "atk": 8
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 10,
    "acquiredAt": 1786145754988,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "null_aegis": {
    "id": "null_aegis",
    "name": "Null Aegis of Haste",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786145814677,
    "rarity": "MYTHIC",
    "value": 360000,
    "stats": {
      "def": 130,
      "hp": 110,
      "luck": 15,
      "spd": 15
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "voidstrand_robes": {
    "id": "voidstrand_robes",
    "name": "Void-Strand Robes",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786145825795,
    "rarity": "MYTHIC",
    "value": 74000,
    "stats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "null_shard": {
    "id": "null_shard",
    "name": "Null Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786145844193,
    "rarity": "MYTHIC",
    "value": 90000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "chrono_weaver_vestments": {
    "id": "chrono_weaver_vestments",
    "name": "Light Chrono Weaver Vestments",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786146113796,
    "rarity": "MYTHIC",
    "value": 75000,
    "stats": {
      "def": 85,
      "hp": 250,
      "spd": 25
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 85,
      "hp": 250,
      "spd": 25
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "cloak_of_shifting_realities": {
    "id": "cloak_of_shifting_realities",
    "name": "Light Cloak of Shifting Realities",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786146114665,
    "rarity": "MYTHIC",
    "value": 55000,
    "stats": {
      "def": 45,
      "spd": 35,
      "luck": 15
    },
    "slot": "cloak",
    "source": "COMBAT",
    "baseStats": {
      "def": 45,
      "spd": 35,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "titanbone_halberd": {
    "id": "titanbone_halberd",
    "name": "Titan-Bone Halberd",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786149018863,
    "rarity": "MYTHIC",
    "value": 44000,
    "stats": {
      "atk": 80,
      "def": 20
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "aegis_of_the_golem_king": {
    "id": "aegis_of_the_golem_king",
    "name": "Aegis of the Golem King of Might",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786149080323,
    "rarity": "MYTHIC",
    "value": 38000,
    "stats": {
      "def": 90,
      "hp": 200,
      "mag": 10,
      "atk": 15
    },
    "slot": "off_hand",
    "source": "BOSS"
  },
  "dragon_plate": {
    "id": "dragon_plate",
    "name": "Dragon Armor of Protection",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786149700377,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": {
      "def": 90,
      "hp": 140,
      "spd": 15
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 90,
      "hp": 140,
      "spd": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "singularity_band": {
    "id": "singularity_band",
    "name": "Sturdy Singularity Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786149715465,
    "rarity": "MYTHIC",
    "value": 61000,
    "stats": {
      "def": 15,
      "luck": 40
    },
    "slot": "ring",
    "source": "COMBAT",
    "baseStats": {
      "def": 15,
      "luck": 40
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1786149741303,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "loop_of_forever": {
    "id": "loop_of_forever",
    "name": "Loop of Forever of Fortune",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786149763573,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "slot": "ring",
    "source": "COMBAT",
    "baseStats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "pendant_of_eternity": {
    "id": "pendant_of_eternity",
    "name": "Pendant of Eternity of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786150539767,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": {
      "hp": 150,
      "def": 40,
      "luck": 15,
      "atk": 15
    },
    "slot": "amulet",
    "source": "BOSS"
  },
  "void_crown": {
    "id": "void_crown",
    "name": "Light Void Crown",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786151734789,
    "rarity": "MYTHIC",
    "value": 600000,
    "stats": {
      "mag": 100,
      "def": 50,
      "luck": 30,
      "spd": 10
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "mirrorimage_shroud": {
    "id": "mirrorimage_shroud",
    "name": "Mirror-Image Shroud",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786151748296,
    "rarity": "MYTHIC",
    "value": 29000,
    "stats": {
      "def": 25,
      "spd": 35,
      "crit": 12
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "helm_of_ancient_blood": {
    "id": "helm_of_ancient_blood",
    "name": "Light Helm of Ancient Blood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786152501077,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "def": 40,
      "atk": 30,
      "crit": 10,
      "spd": 10
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "gaze_of_the_abyss": {
    "id": "gaze_of_the_abyss",
    "name": "Gaze of the Abyss",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786152624089,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "def": 35,
      "mag": 75,
      "crit": 25
    },
    "slot": "helmet",
    "source": "BOSS"
  },
  "abyssal_carapace": {
    "id": "abyssal_carapace",
    "name": "Abyssal Carapace of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786154167006,
    "rarity": "MYTHIC",
    "value": 78000,
    "stats": {
      "def": 110,
      "hp": 400,
      "mag": 20
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "striders_of_the_dragon": {
    "id": "striders_of_the_dragon",
    "name": "Striders of the Dragon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786154366408,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "def": 35,
      "spd": 30
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "talisman_of_eldritch_blood": {
    "id": "talisman_of_eldritch_blood",
    "name": "Talisman of Eldritch Blood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786190090889,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "hp": 150,
      "mag": 45,
      "luck": 10
    },
    "slot": "amulet",
    "source": "COMBAT"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786197194160,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragonscale_kite_shield": {
    "id": "dragonscale_kite_shield",
    "name": "Sturdy Dragon-Scale Kite Shield",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786210574466,
    "rarity": "MYTHIC",
    "value": 39000,
    "stats": {
      "def": 95,
      "hp": 150
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 95,
      "hp": 150
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "abyssal_heartstone": {
    "id": "abyssal_heartstone",
    "name": "Abyssal Heartstone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786216980786,
    "rarity": "MYTHIC",
    "value": 220000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "godshard": {
    "id": "godshard",
    "name": "Godshard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786219244720,
    "rarity": "MYTHIC",
    "value": 250000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  }
}
```

---

### Räzzy😮‍💨  `2349061834359@s.whatsapp.net`

- **userId**: 2349061834359@s.whatsapp.net
- **registered**: true
- **nickname**: Räzzy😮‍💨
- **phoneHash**: e8d6ef8fb6e9beea71f6c68878a5bea750d493db4804ce1c3c1ddb72cabc5612
- **wallet**: 0
- **bank**: 41374329
- **class**: CHRONOMANCER
- **adventurerRank**: A
- **spriteIndex**: 92
- **level**: 66
- **xp**: 113212044
- **hp**: 4638
- **maxHp**: 4638
- **currentHP**: 6644
- **questGold**: 0
- **questsCompleted**: 159
- **questsWon**: 128
- **questsFailed**: 36
- **pvpWins**: 6
- **pvpLosses**: 12
- **eventTokens**: 3
- **totalEarned**: 25621019
- **totalSpent**: 2122334
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 36
- **dragonsKilled**: 18
- **itemsCrafted**: 0
- **itemsEquipped**: 25
- **undeadKills**: 3
- **kills**: 1112
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 35
- **progression_level**: 66
- **progression_xp**: 113212044
- **progression_gp**: 370
- **progression_totalGP**: 370
- **progression_statPoints**: 10
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Räzzy😮‍💨
- **profile_nickname**: Räzzy😮‍💨
- **profile_firstSeen**: "2026-07-08T22:07:17.063Z"
- **profile_lastSeen**: "2026-07-08T23:10:36.467Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-08T22:07:17.066Z
- **updatedAt**: 2026-08-01T18:34:58.725Z

**equipment**:
```json
{
  "main_hand": {
    "id": "worldender_lance",
    "name": "World-Ender Lance",
    "type": "EQUIPMENT",
    "acquiredAt": 1783668170355,
    "rarity": "MYTHIC",
    "value": 98000,
    "stats": {
      "atk": 115,
      "mag": 40,
      "crit": 12
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "maxDurability": 150,
    "durability": 149.4,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "off_hand": {
    "id": "dragonscale_kite_shield",
    "name": "Dragon-Scale Kite Shield",
    "type": "EQUIPMENT",
    "acquiredAt": 1784007021853,
    "rarity": "COMMON",
    "value": 39000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 76.6,
    "durabilityTraits": []
  },
  "armor": {
    "id": "abyssal_carapace",
    "name": "Abyssal Carapace",
    "type": "EQUIPMENT",
    "acquiredAt": 1783679798126,
    "rarity": "COMMON",
    "value": 78000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 94.8,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "visor_of_the_void_walker",
    "name": "Visor of the Void Walker",
    "type": "EQUIPMENT",
    "acquiredAt": 1783766938723,
    "rarity": "COMMON",
    "value": 63000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 94.8,
    "durabilityTraits": []
  },
  "boots": {
    "id": "treads_of_the_forgotten_forest",
    "name": "Treads of the Forgotten Forest",
    "type": "EQUIPMENT",
    "acquiredAt": 1783681008161,
    "rarity": "COMMON",
    "value": 15000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 94.8,
    "durabilityTraits": []
  },
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1784132259144,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "void_core_amulet",
    "name": "Void Core Amulet",
    "type": "EQUIPMENT",
    "acquiredAt": 1783679943431,
    "rarity": "COMMON",
    "value": 60000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "cloak": {
    "id": "mirrorwarp_cloak",
    "name": "Mirror-Warp Cloak",
    "type": "EQUIPMENT",
    "acquiredAt": 1783667277353,
    "rarity": "COMMON",
    "value": 28000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 94.8,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "hivemind_mitts",
    "name": "Hive-Mind Mitts",
    "type": "EQUIPMENT",
    "acquiredAt": 1783681025864,
    "rarity": "COMMON",
    "value": 15500,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 94.8,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 40,
    "acquiredAt": 1784528980637,
    "rarity": "RARE",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 24,
    "acquiredAt": 1784488193126,
    "rarity": "MYTHIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_potion": {
    "id": "minor_potion",
    "name": "Minor Health Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1783555259225,
    "rarity": "COMMON",
    "value": 280,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1783560011140,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 82,
    "acquiredAt": 1784442830626,
    "rarity": "LEGENDARY",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "health_potion": {
    "id": "health_potion",
    "name": "Health Potion",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1783561512223,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784460973440,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "regen_salve": {
    "id": "regen_salve",
    "name": "Regeneration Salve",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1783563317023,
    "rarity": "UNCOMMON",
    "value": 1120,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784460972918,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783560929368,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784460542021,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 10,
    "acquiredAt": 1784460505916,
    "rarity": "RARE",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 22,
    "acquiredAt": 1784532903222,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 9,
    "acquiredAt": 1784481448310,
    "rarity": "UNCOMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 53,
    "acquiredAt": 1784532984514,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 28,
    "acquiredAt": 1784529173907,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "arcane_wand": {
    "id": "arcane_wand",
    "name": "Arcane Wand",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783559826122,
    "rarity": "COMMON",
    "value": 6000,
    "stats": null,
    "slot": null,
    "source": "ELEMENTAL_ARCHON",
    "maxDurability": 65,
    "durability": 55.1,
    "durabilityTraits": [],
    "warnedLow": true
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1784482021732,
    "rarity": "EPIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 29,
    "acquiredAt": 1783667683968,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 9,
    "acquiredAt": 1783667715764,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1784529954599,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gaze_of_the_titan": {
    "id": "gaze_of_the_titan",
    "name": "Gaze of the Titan",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783667849511,
    "rarity": "LEGENDARY",
    "value": 33000,
    "stats": {
      "def": 55,
      "hp": 80
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1784528358811,
    "rarity": "EPIC",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 35,
    "acquiredAt": 1784532851995,
    "rarity": "RARE",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784458006020,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1784481543411,
    "rarity": "RARE",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1783668291074,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 36,
    "acquiredAt": 1784533022202,
    "rarity": "RARE",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "REST"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 12,
    "acquiredAt": 1784487799927,
    "rarity": "RARE",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784460903715,
    "rarity": "LEGENDARY",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784482021212,
    "rarity": "EPIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "VOID_CORRUPTED"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1784528611902,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 23,
    "acquiredAt": 1784532984003,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1784040013252,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 12,
    "acquiredAt": 1784460486943,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784458096923,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 18,
    "acquiredAt": 1784528472405,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784528899200,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784503325621,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 32,
    "acquiredAt": 1784490372714,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "garb_of_the_elder_mage": {
    "id": "garb_of_the_elder_mage",
    "name": "Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784460407220,
    "rarity": "MYTHIC",
    "value": 41000,
    "stats": {
      "def": 50,
      "mag": 65,
      "spd": 15
    },
    "slot": "armor",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": [],
    "source": "ELITE_COMBAT"
  },
  "dragon_scale_mail": {
    "id": "dragon_scale_mail",
    "name": "Dragon Scale Mail",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783667149470,
    "rarity": "COMMON",
    "value": 42000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "mythril_staff": {
    "id": "mythril_staff",
    "name": "Mythril Staff",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783667060968,
    "rarity": "COMMON",
    "value": 30000,
    "stats": null,
    "slot": null,
    "maxDurability": 65,
    "durability": 65,
    "durabilityTraits": [],
    "warnedLow": true
  },
  "evolution_stone": {
    "id": "evolution_stone",
    "name": "Evolution Stone (T2)",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1783677274373,
    "rarity": "RARE",
    "value": 8000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "ascension_stone": {
    "id": "ascension_stone",
    "name": "Ascension Stone (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1783677472569,
    "rarity": "EPIC",
    "value": 50000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "null_staff": {
    "id": "null_staff",
    "name": "Null Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783679470430,
    "rarity": "COMMON",
    "value": 380000,
    "stats": null,
    "slot": null
  },
  "voidstrand_robes": {
    "id": "voidstrand_robes",
    "name": "Void-Strand Robes",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784325851831,
    "rarity": "MYTHIC",
    "value": 74000,
    "stats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "slot": "armor",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": [],
    "source": "ELITE_COMBAT"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783677949421,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS",
    "maxDurability": 138,
    "durability": 138,
    "durabilityTraits": []
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784488106811,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784530571335,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "Major Health Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1783961902601,
    "rarity": "RARE",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784532852698,
    "rarity": "EPIC",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1784528934634,
    "rarity": "RARE",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784006155675,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784529562294,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "titanium_band": {
    "id": "titanium_band",
    "name": "Titanium Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784007068074,
    "rarity": "COMMON",
    "value": 34000,
    "stats": null,
    "slot": null
  },
  "necklace_of_the_void_empress": {
    "id": "necklace_of_the_void_empress",
    "name": "Necklace of the Void Empress",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783679971923,
    "rarity": "COMMON",
    "value": 64000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "void_step_sabatons": {
    "id": "void_step_sabatons",
    "name": "Void Step Sabatons",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784039788064,
    "rarity": "MYTHIC",
    "value": 56000,
    "stats": {
      "def": 45,
      "spd": 40,
      "luck": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "demon_skin_vest": {
    "id": "demon_skin_vest",
    "name": "Demon Skin Vest",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784039900271,
    "rarity": "EPIC",
    "value": 10000,
    "stats": {
      "def": 45,
      "hp": 60
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "signet_of_the_ancestors": {
    "id": "signet_of_the_ancestors",
    "name": "Signet of the Ancestors",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784318823005,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 2,
    "acquiredAt": 1784318747793,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784317906490,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "Smoke Bomb",
    "type": "POTION",
    "quantity": 12,
    "acquiredAt": 1784529300194,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  }
}
```

---

### ace  `64257458712825@lid`

- **userId**: 64257458712825@lid
- **registered**: true
- **nickname**: ace
- **phoneHash**: 2531a43e5f612eec419b5ed2465b74f12d2550f49d7e296ea3c212030f2986b4
- **wallet**: 0
- **bank**: 118378282
- **class**: SAINT
- **adventurerRank**: SSS
- **spriteIndex**: 91
- **level**: 98
- **xp**: 24628233295
- **hp**: 1533
- **maxHp**: 6997
- **currentHP**: 22157
- **questGold**: 0
- **questsCompleted**: 842
- **questsWon**: 784
- **questsFailed**: 124
- **pvpWins**: 25
- **pvpLosses**: 9
- **eventTokens**: 10
- **totalEarned**: 1714085340
- **totalSpent**: 1560742201
- **totalGambled**: 500
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 1
- **biggestWin**: 0
- **biggestLoss**: 500
- **bossesDefeated**: 243
- **dragonsKilled**: 88
- **itemsCrafted**: 50
- **itemsEquipped**: 102
- **undeadKills**: 1
- **kills**: 12695
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 100
- **progression_level**: 98
- **progression_xp**: 24628233295
- **progression_gp**: 4031
- **progression_totalGP**: 4031
- **progression_statPoints**: 25
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ace
- **profile_nickname**: ace
- **profile_firstSeen**: "2026-07-08T22:08:27.769Z"
- **profile_lastSeen**: "2026-07-08T23:09:32.367Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-08T22:08:27.823Z
- **updatedAt**: 2026-08-08T13:45:49.170Z

**equipment**:
```json
{
  "main_hand": {
    "id": "null_staff",
    "name": "God-forged Null Staff",
    "type": "EQUIPMENT",
    "acquiredAt": 1785627017403,
    "rarity": "MYTHIC",
    "value": 380000,
    "stats": {
      "mag": 1553,
      "hp": 403,
      "crit": 173
    },
    "slot": "main_hand",
    "reqLevel": 70,
    "baseStats": {
      "mag": 135,
      "hp": 35,
      "crit": 15
    },
    "enhancementLevel": 23,
    "enhancementBonus": 10.5,
    "maxDurability": 150,
    "durability": 133.8,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "off_hand": null,
  "armor": {
    "id": "archmage_robes",
    "name": "God-forged Archmage Robes",
    "type": "EQUIPMENT",
    "acquiredAt": 1785627053931,
    "rarity": "LEGENDARY",
    "value": 90000,
    "stats": {
      "def": 195,
      "mag": 780
    },
    "slot": "armor",
    "reqLevel": 40,
    "maxDurability": 156,
    "durability": 141,
    "durabilityTraits": [],
    "baseStats": {
      "def": 20,
      "mag": 80
    },
    "enhancementLevel": 17,
    "enhancementBonus": 8.75
  },
  "helmet": {
    "id": "void_crown",
    "name": "God-forged Void Crown",
    "type": "EQUIPMENT",
    "acquiredAt": 1785627038163,
    "rarity": "MYTHIC",
    "value": 600000,
    "stats": {
      "mag": 1150,
      "def": 575,
      "luck": 345
    },
    "slot": "helmet",
    "reqLevel": 80,
    "maxDurability": 180,
    "durability": 177,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "mag": 100,
      "def": 50,
      "luck": 30
    },
    "enhancementLevel": 19,
    "enhancementBonus": 10.5
  },
  "boots": {
    "id": "titanstomp_sabatons",
    "name": "God-forged Titan-Stomp Sabatons",
    "type": "EQUIPMENT",
    "acquiredAt": 1784420641347,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "def": 748,
      "spd": -115,
      "hp": 1150
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 65,
      "spd": -10,
      "hp": 100
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.5,
    "maxDurability": 180,
    "durability": 177,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "ring": {
    "id": "abyssal_ring",
    "name": "God-forged Abyssal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1785620985491,
    "rarity": "MYTHIC",
    "value": 400000,
    "stats": {
      "atk": 575,
      "mag": 575,
      "hp": 345
    },
    "slot": "ring",
    "reqLevel": 70,
    "baseStats": {
      "atk": 50,
      "mag": 50,
      "hp": 30
    },
    "enhancementLevel": 25,
    "enhancementBonus": 10.5,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "amulet": {
    "id": "abyssal_amulet",
    "name": "God-forged Sharp Abyssal Amulet",
    "type": "EQUIPMENT",
    "acquiredAt": 1785700800669,
    "rarity": "MYTHIC",
    "value": 450000,
    "stats": {
      "mag": 1150,
      "hp": 575
    },
    "slot": "amulet",
    "source": "COMBAT",
    "reqLevel": 70,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "mag": 100,
      "hp": 50
    },
    "enhancementLevel": 20,
    "enhancementBonus": 10.5
  },
  "cloak": {
    "id": "abyssal_cloak",
    "name": "God-forged Abyssal Cloak",
    "type": "EQUIPMENT",
    "acquiredAt": 1785626998134,
    "rarity": "MYTHIC",
    "value": 550000,
    "stats": {
      "def": 920,
      "hp": 1150,
      "spd": 460
    },
    "slot": "cloak",
    "reqLevel": 75,
    "baseStats": {
      "def": 80,
      "hp": 100,
      "spd": 40
    },
    "enhancementLevel": 19,
    "enhancementBonus": 10.5,
    "maxDurability": 180,
    "durability": 177,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "gloves": {
    "id": "abyssal_grasp",
    "name": "God-forged Abyssal Grasp",
    "type": "EQUIPMENT",
    "acquiredAt": 1785627071622,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": {
      "atk": 518,
      "mag": 288,
      "spd": 230
    },
    "slot": "gloves",
    "reqLevel": 50,
    "baseStats": {
      "atk": 45,
      "mag": 25,
      "spd": 20
    },
    "enhancementLevel": 19,
    "enhancementBonus": 10.5,
    "maxDurability": 180,
    "durability": 177,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 5,
    "xp": 189
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 1403,
    "acquiredAt": 1784393881785,
    "rarity": "RARE",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 256,
    "acquiredAt": 1784394049377,
    "rarity": "RARE",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 288,
    "acquiredAt": 1784393840516,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1783559952229,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1783559986031,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 45,
    "acquiredAt": 1784381557922,
    "rarity": "EPIC",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 1345,
    "acquiredAt": 1784393894873,
    "rarity": "RARE",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 329,
    "acquiredAt": 1784574734727,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 604,
    "acquiredAt": 1784575138520,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 426,
    "acquiredAt": 1784582674524,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 63,
    "acquiredAt": 1784393853708,
    "rarity": "EPIC",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 131,
    "acquiredAt": 1784395330681,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 73,
    "acquiredAt": 1784393792577,
    "rarity": "LEGENDARY",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 1239,
    "acquiredAt": 1784562850324,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 65,
    "acquiredAt": 1784395331330,
    "rarity": "LEGENDARY",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 98,
    "acquiredAt": 1784393684817,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 383,
    "acquiredAt": 1784563177826,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 43,
    "acquiredAt": 1784321194594,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 378,
    "acquiredAt": 1784562620725,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784393852971,
    "rarity": "MYTHIC",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 12,
    "acquiredAt": 1784393408672,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 88,
    "acquiredAt": 1784393472683,
    "rarity": "RARE",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 322,
    "acquiredAt": 1784393776271,
    "rarity": "EPIC",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 485,
    "acquiredAt": 1784573378421,
    "rarity": "MYTHIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 61,
    "acquiredAt": 1784394641775,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 45,
    "acquiredAt": 1784393409321,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 857,
    "acquiredAt": 1784560710641,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 822,
    "acquiredAt": 1784582230718,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 47,
    "acquiredAt": 1784393960970,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 48,
    "acquiredAt": 1784381277518,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 1102,
    "acquiredAt": 1784583315826,
    "rarity": "MYTHIC",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "ELITE_COMBAT",
    "usable": true,
    "effect": "heal",
    "effectValue": 250
  },
  "ascension_stone": {
    "id": "ascension_stone",
    "name": "Ascension Stone (T3)",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1783952387553,
    "rarity": "EPIC",
    "value": 50000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "gold_pile": {
    "id": "gold_pile",
    "name": "Pile of Gold",
    "type": "MATERIAL",
    "quantity": 961,
    "acquiredAt": 1784017225383,
    "rarity": "RARE",
    "value": 1,
    "stats": null,
    "slot": null,
    "source": "PUZZLE"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1784393632972,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 87,
    "acquiredAt": 1784560425826,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "essence_mirror": {
    "id": "essence_mirror",
    "name": "Essence Mirror",
    "type": "ITEM",
    "quantity": 7,
    "acquiredAt": 1784393750275,
    "rarity": "LEGENDARY",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 92,
    "acquiredAt": 1784583029847,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 46,
    "acquiredAt": 1784582116123,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 144,
    "acquiredAt": 1784582675228,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "void_titan_heart": {
    "id": "void_titan_heart",
    "name": "Void Titan Heart",
    "type": "MATERIAL",
    "quantity": 64,
    "acquiredAt": 1784582116649,
    "rarity": "MYTHIC",
    "value": 120000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "titanstomp_sabatons": {
    "id": "titanstomp_sabatons",
    "name": "God-forged Titan-Stomp Sabatons",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784420641347,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "def": 748,
      "spd": -115,
      "hp": 1150
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 65,
      "spd": -10,
      "hp": 100
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.5,
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "abyssal_heartstone": {
    "id": "abyssal_heartstone",
    "name": "Abyssal Heartstone",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784560291920,
    "rarity": "MYTHIC",
    "value": 220000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "godshard": {
    "id": "godshard",
    "name": "Godshard",
    "type": "MATERIAL",
    "quantity": 38,
    "acquiredAt": 1784581952625,
    "rarity": "MYTHIC",
    "value": 250000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "abyssal_core": {
    "id": "abyssal_core",
    "name": "Abyssal Core",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1785299974152,
    "rarity": "MYTHIC",
    "value": 650000,
    "stats": {},
    "slot": null
  },
  "smoke_screen": {
    "id": "smoke_screen",
    "name": "Smoke Screen",
    "type": "CONSUMABLE",
    "quantity": 3,
    "acquiredAt": 1785300193472,
    "rarity": "RARE",
    "value": 100,
    "stats": {},
    "slot": null,
    "usable": true,
    "effect": "evasion_buff"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1785302570615,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "null_shard": {
    "id": "null_shard",
    "name": "Null Shard",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1785303540699,
    "rarity": "MYTHIC",
    "value": 90000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "discount_coupon": {
    "id": "discount_coupon",
    "name": "Discount Coupon",
    "type": "ITEM",
    "quantity": 2,
    "acquiredAt": 1785315910257,
    "rarity": "MYTHIC",
    "value": 2000,
    "stats": null,
    "slot": null,
    "source": "MERCHANT"
  },
  "minor_potion": {
    "id": "minor_potion",
    "name": "Minor Health Potion",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1785327403436,
    "rarity": "COMMON",
    "value": 280,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 49,
    "acquiredAt": 1785352185273,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "chaos_elixir": {
    "id": "chaos_elixir",
    "name": "Chaos Elixir",
    "type": "CONSUMABLE",
    "quantity": 7,
    "acquiredAt": 1785355972067,
    "rarity": "RARE",
    "value": 100,
    "stats": {},
    "slot": null,
    "usable": true,
    "effect": "random_major_buff"
  },
  "fortress_potion": {
    "id": "fortress_potion",
    "name": "Fortress Potion",
    "type": "CONSUMABLE",
    "quantity": 12,
    "acquiredAt": 1785356056979,
    "rarity": "RARE",
    "value": 100,
    "stats": {},
    "slot": null,
    "usable": true,
    "effect": "invincibility"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "Smoke Bomb",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1785501439757,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "summon_egg_void_walker": {
    "id": "summon_egg_void_walker",
    "name": "Void Walker Egg",
    "type": "ITEM",
    "quantity": 18,
    "acquiredAt": 1785586285726,
    "rarity": "RARE",
    "value": 18000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "summon_egg_common": {
    "id": "summon_egg_common",
    "name": "Common Summon Egg",
    "type": "ITEM",
    "quantity": "1,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,21,2",
    "acquiredAt": 1785586285931,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "Strength Brew",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785594110958,
    "rarity": "EPIC",
    "value": 3200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "elixir_of_power": {
    "id": "elixir_of_power",
    "name": "Elixir of Power",
    "type": "CONSUMABLE",
    "quantity": 1,
    "acquiredAt": 1785594315087,
    "rarity": "RARE",
    "value": 100,
    "stats": {},
    "slot": null,
    "usable": true,
    "effect": "buff_all",
    "effectValue": 50,
    "duration": 5
  },
  "thick_leather_mantle": {
    "id": "thick_leather_mantle",
    "name": "Thick Leather Mantle",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785650540959,
    "rarity": "COMMON",
    "value": 460,
    "stats": {
      "def": 8
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "golemcore_mace": {
    "id": "golemcore_mace",
    "name": "Light Golem-Core Mace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785652066292,
    "rarity": "RARE",
    "value": 11000,
    "stats": {
      "atk": 45,
      "spd": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 14,
    "acquiredAt": 1785652423094,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1785652897985,
    "rarity": "COMMON",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 62,
    "acquiredAt": 1785652927493,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 18,
    "acquiredAt": 1785654839226,
    "rarity": "EPIC",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS"
  },
  "wyrmscale_grips": {
    "id": "wyrmscale_grips",
    "name": "Wyrmscale Grips of Protection",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785660914388,
    "rarity": "LEGENDARY",
    "value": 32000,
    "stats": {
      "atk": 35,
      "spd": 20,
      "crit": 8,
      "def": 10
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785671153089,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {
      "atk": 5
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "abyssal_amulet": {
    "id": "abyssal_amulet",
    "name": "God-forged Sharp Abyssal Amulet",
    "type": "EQUIPMENT",
    "quantity": 7,
    "acquiredAt": 1785700800669,
    "rarity": "MYTHIC",
    "value": 450000,
    "stats": {
      "mag": 1150,
      "hp": 575
    },
    "slot": "amulet",
    "source": "COMBAT",
    "reqLevel": 70,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "mag": 100,
      "hp": 50
    },
    "enhancementLevel": 20,
    "enhancementBonus": 10.5
  },
  "void_crown": {
    "id": "void_crown",
    "name": "Void Crown",
    "type": "EQUIPMENT",
    "quantity": 7,
    "acquiredAt": 1785704029760,
    "rarity": "MYTHIC",
    "value": 600000,
    "stats": {
      "mag": 100,
      "def": 50,
      "luck": 30
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "null_ward": {
    "id": "null_ward",
    "name": "Null Ward",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785769887591,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "def": 100,
      "hp": 100,
      "luck": 20
    },
    "slot": "off_hand",
    "source": "BOSS",
    "reqLevel": 70,
    "maxDurability": 150,
    "durability": 150,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "chaos_blade": {
    "id": "chaos_blade",
    "name": "Chaos Blade",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785770656090,
    "rarity": "LEGENDARY",
    "value": 180000,
    "stats": {
      "atk": 95,
      "spd": 15,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "null_matrix": {
    "id": "null_matrix",
    "name": "Null Matrix",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785770656484,
    "rarity": "MYTHIC",
    "value": 280000,
    "stats": {},
    "slot": null
  },
  "necrotic_carver": {
    "id": "necrotic_carver",
    "name": "Necrotic Carver",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785780189889,
    "rarity": "EPIC",
    "value": 24000,
    "stats": null,
    "slot": "main_hand",
    "reqLevel": 30
  },
  "garb_of_the_elder_mage": {
    "id": "garb_of_the_elder_mage",
    "name": "God-forged Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785704690225,
    "rarity": "LEGENDARY",
    "value": 41000,
    "stats": {
      "def": 488,
      "mag": 634,
      "spd": 147
    },
    "slot": "armor",
    "reqLevel": 40,
    "baseStats": {
      "def": 50,
      "mag": 65,
      "spd": 15
    },
    "enhancementLevel": 16,
    "enhancementBonus": 8.75,
    "maxDurability": 156,
    "durability": 156,
    "durabilityTraits": [],
    "source": "COMBAT"
  },
  "deer_antler": {
    "id": "deer_antler",
    "name": "Deer Antlers",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785801440958,
    "rarity": "UNCOMMON",
    "value": 600,
    "stats": {},
    "slot": null
  },
  "aegis_of_eternal_fire": {
    "id": "aegis_of_eternal_fire",
    "name": "Aegis of Eternal Fire of Haste",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785824373605,
    "rarity": "MYTHIC",
    "value": 81000,
    "stats": {
      "def": 125,
      "hp": 300,
      "atk": 15,
      "spd": 15
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "maxDurability": 150,
    "durability": 150,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "shadow_cloak": {
    "id": "shadow_cloak",
    "name": "Shadow Cloak of Might",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785828298075,
    "rarity": "MYTHIC",
    "value": 90000,
    "stats": {
      "def": 40,
      "spd": 30,
      "luck": 20,
      "atk": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "mythic_fragment": {
    "id": "mythic_fragment",
    "name": "Mythic Summon Fragment",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1785830558516,
    "rarity": "MYTHIC",
    "value": 200000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "abyssal_blade": {
    "id": "abyssal_blade",
    "name": "Abyssal Blade",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785881617695,
    "rarity": "MYTHIC",
    "value": 950000,
    "stats": {
      "atk": 210,
      "mag": 50,
      "crit": 20
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "abyssal_cloak": {
    "id": "abyssal_cloak",
    "name": "Abyssal Cloak",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785881637424,
    "rarity": "MYTHIC",
    "value": 550000,
    "stats": {
      "def": 80,
      "hp": 100,
      "spd": 40
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "colossal_titan_shield": {
    "id": "colossal_titan_shield",
    "name": "Colossal Titan Shield of Sages",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785882638286,
    "rarity": "MYTHIC",
    "value": 38000,
    "stats": {
      "def": 90,
      "hp": 250,
      "mag": 20
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "mythic_enhancement_stone": {
    "id": "mythic_enhancement_stone",
    "name": "Mythic Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 62,
    "acquiredAt": 1785882756732,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "abyssal_crown": {
    "id": "abyssal_crown",
    "name": "Abyssal Crown",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785883188865,
    "rarity": "MYTHIC",
    "value": 1100000,
    "stats": {
      "def": 200,
      "hp": 200,
      "luck": 40,
      "mag": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "liquid_courage": {
    "id": "liquid_courage",
    "name": "Liquid Courage",
    "type": "CONSUMABLE",
    "quantity": 3,
    "acquiredAt": 1785918956718,
    "rarity": "RARE",
    "value": 100,
    "stats": {},
    "slot": null,
    "usable": true,
    "effect": "shield_max",
    "effectValue": 100
  },
  "aegis_of_the_golem_king": {
    "id": "aegis_of_the_golem_king",
    "name": "Aegis of the Golem King",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785941365567,
    "rarity": "MYTHIC",
    "value": 38000,
    "stats": {
      "def": 90,
      "hp": 200,
      "mag": 10
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "aegis_of_the_abyss": {
    "id": "aegis_of_the_abyss",
    "name": "Aegis of the Abyss",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1785942838079,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": {
      "def": 120,
      "hp": 400,
      "luck": 10
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "abyssal_bulwark": {
    "id": "abyssal_bulwark",
    "name": "Abyssal Bulwark",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785943044480,
    "rarity": "MYTHIC",
    "value": 82000,
    "stats": {
      "def": 115,
      "hp": 450,
      "luck": 10
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "worldender_lance": {
    "id": "worldender_lance",
    "name": "World-Ender Lance of Protection",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785947353475,
    "rarity": "MYTHIC",
    "value": 98000,
    "stats": {
      "atk": 115,
      "mag": 40,
      "crit": 12,
      "def": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "summon_essence_t3": {
    "id": "summon_essence_t3",
    "name": "Summon Essence (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785948807343,
    "rarity": "EPIC",
    "value": 60000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "summon_essence_t2": {
    "id": "summon_essence_t2",
    "name": "Summon Essence (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785948818260,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "abyssal_relic": {
    "id": "abyssal_relic",
    "name": "Abyssal Relic",
    "type": "SUMMON_GEAR",
    "quantity": 1,
    "acquiredAt": 1785948843286,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "allStatsMult": 0.15,
      "lifestealPct": 5
    },
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "crown_of_the_abyssal_sovereign": {
    "id": "crown_of_the_abyssal_sovereign",
    "name": "Crown of the Abyssal Sovereign",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785950009502,
    "rarity": "MYTHIC",
    "value": 66000,
    "stats": {
      "def": 45,
      "mag": 60,
      "luck": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "striders_of_the_dragon": {
    "id": "striders_of_the_dragon",
    "name": "Striders of the Dragon",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1785950561561,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "def": 35,
      "spd": 30
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "voidwalk_boots": {
    "id": "voidwalk_boots",
    "name": "Sturdy Voidwalk Boots",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785950615287,
    "rarity": "MYTHIC",
    "value": 400000,
    "stats": {
      "spd": 60,
      "luck": 30,
      "def": 5,
      "hp": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "shroud_of_eternal_night": {
    "id": "shroud_of_eternal_night",
    "name": "Shroud of Eternal Night of Haste",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786010062294,
    "rarity": "MYTHIC",
    "value": 53000,
    "stats": {
      "def": 40,
      "spd": 50,
      "luck": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 40,
      "spd": 50,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "talisman_of_eldritch_blood": {
    "id": "talisman_of_eldritch_blood",
    "name": "Talisman of Eldritch Blood",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1786010295083,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "hp": 150,
      "mag": 45,
      "luck": 10
    },
    "slot": "amulet",
    "source": "COMBAT"
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1786010344718,
    "rarity": "MYTHIC",
    "value": 95000,
    "stats": {
      "atk": 110,
      "mag": 30,
      "crit": 15
    },
    "slot": "main_hand",
    "source": "BOSS"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 10,
    "acquiredAt": 1786011116845,
    "rarity": "RARE",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "visor_of_the_void_walker": {
    "id": "visor_of_the_void_walker",
    "name": "Visor of the Void Walker",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1786013551562,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "def": 50,
      "spd": 40,
      "luck": 15
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "sunkissed_herb_satchel": {
    "id": "sunkissed_herb_satchel",
    "name": "Sun-Kissed Herb Satchel",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786015784881,
    "rarity": "COMMON",
    "value": 480,
    "stats": {
      "hp": 20
    },
    "slot": "amulet",
    "source": "COMBAT"
  },
  "dragonhide_boots": {
    "id": "dragonhide_boots",
    "name": "Sturdy Dragonhide Boots",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1786016039179,
    "rarity": "LEGENDARY",
    "value": 85000,
    "stats": {
      "def": 25,
      "spd": 20,
      "hp": 30
    },
    "slot": "boots",
    "source": "COMBAT",
    "baseStats": {
      "def": 25,
      "spd": 20,
      "hp": 30
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "cloak_of_dark_matter": {
    "id": "cloak_of_dark_matter",
    "name": "Lucky Cloak of Dark Matter",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786016060281,
    "rarity": "EPIC",
    "value": 15000,
    "stats": {
      "def": 40,
      "mag": 10,
      "luck": 15
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "trappers_mitts": {
    "id": "trappers_mitts",
    "name": "Trapper's Mitts",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786019075285,
    "rarity": "COMMON",
    "value": 550,
    "stats": {
      "def": 5,
      "spd": 5
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "boots_of_eternal_blood": {
    "id": "boots_of_eternal_blood",
    "name": "Boots of Eternal Blood",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786019535977,
    "rarity": "LEGENDARY",
    "value": 32000,
    "stats": {
      "def": 30,
      "spd": 35,
      "hp": 100
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "demon_grip_gauntlets": {
    "id": "demon_grip_gauntlets",
    "name": "Lucky Demon Grip Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786024988681,
    "rarity": "RARE",
    "value": 7000,
    "stats": {
      "atk": 25,
      "def": 10,
      "luck": 15
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "amulet_of_the_broken_era": {
    "id": "amulet_of_the_broken_era",
    "name": "Glowing Amulet of the Broken Era",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786025707786,
    "rarity": "LEGENDARY",
    "value": 36000,
    "stats": {
      "mag": 20,
      "luck": 35
    },
    "slot": "amulet",
    "source": "COMBAT",
    "baseStats": {
      "mag": 20,
      "luck": 35
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "abyssal_shield": {
    "id": "abyssal_shield",
    "name": "Abyssal Shield",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1786040212793,
    "rarity": "MYTHIC",
    "value": 120000,
    "stats": {
      "def": 70,
      "hp": 80,
      "spd": 10
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT"
  },
  "void_step_sabatons": {
    "id": "void_step_sabatons",
    "name": "Sturdy Void Step Sabatons of Fortune",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1786040213392,
    "rarity": "MYTHIC",
    "value": 56000,
    "stats": {
      "def": 45,
      "spd": 40,
      "luck": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 45,
      "spd": 40,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "striders_of_the_titan": {
    "id": "striders_of_the_titan",
    "name": "Sharp Striders of the Titan",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786040780966,
    "rarity": "MYTHIC",
    "value": 32000,
    "stats": {
      "def": 55,
      "atk": 10,
      "hp": 50
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 55,
      "atk": 10,
      "hp": 50
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "touch_of_retribution": {
    "id": "touch_of_retribution",
    "name": "Touch of Retribution of Fortune",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1786040794384,
    "rarity": "MYTHIC",
    "value": 56000,
    "stats": {
      "atk": 40,
      "def": 25,
      "crit": 12,
      "luck": 25
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "arcane_wand": {
    "id": "arcane_wand",
    "name": "Arcane Wand",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786041957146,
    "rarity": "RARE",
    "value": 6000,
    "stats": {
      "mag": 18
    },
    "slot": "main_hand",
    "reqLevel": 5
  },
  "chaos_cloak": {
    "id": "chaos_cloak",
    "name": "Sharp Chaos Cloak of Fortune",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786043031319,
    "rarity": "MYTHIC",
    "value": 160000,
    "stats": {
      "def": 80,
      "hp": 140,
      "spd": 25,
      "atk": 8,
      "luck": 25
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "archmage_robes": {
    "id": "archmage_robes",
    "name": "Archmage Robes",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1786043041420,
    "rarity": "MYTHIC",
    "value": 90000,
    "stats": {
      "def": 20,
      "mag": 80
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "band_of_cosmic_fortune": {
    "id": "band_of_cosmic_fortune",
    "name": "Sturdy Band of Cosmic Fortune of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786046922300,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "mag": 20,
      "luck": 45,
      "def": 15,
      "hp": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "berserker_pill": {
    "id": "berserker_pill",
    "name": "berserker_pill",
    "type": "ITEM",
    "quantity": 15,
    "acquiredAt": 1786047396474,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "rare_gem": {
    "id": "rare_gem",
    "name": "Rare Gem",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1786051094723,
    "rarity": "RARE",
    "value": 5000,
    "stats": {},
    "slot": null
  },
  "wyrm_fang": {
    "id": "wyrm_fang",
    "name": "Wyrm Fang",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786051192801,
    "rarity": "RARE",
    "value": 4000,
    "stats": {},
    "slot": null
  },
  "elder_blood": {
    "id": "elder_blood",
    "name": "Elder Blood",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1786051193722,
    "rarity": "LEGENDARY",
    "value": 15000,
    "stats": {},
    "slot": null
  },
  "mirror_essence": {
    "id": "mirror_essence",
    "name": "Mirror Essence",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786051229876,
    "rarity": "LEGENDARY",
    "value": 5000,
    "stats": {},
    "slot": null
  },
  "infected_heart": {
    "id": "infected_heart",
    "name": "\u2623\ufe0f Pulsing Heart",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1786051244954,
    "rarity": "EPIC",
    "value": 2000,
    "stats": {},
    "slot": null
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786051254023,
    "rarity": "EPIC",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor"
  },
  "dragon_scale": {
    "id": "dragon_scale",
    "name": "Dragon Scale",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1786051313464,
    "rarity": "RARE",
    "value": 3000,
    "stats": {},
    "slot": null
  },
  "necklace_of_the_void_empress": {
    "id": "necklace_of_the_void_empress",
    "name": "Glowing Necklace of the Void Empress",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786051654386,
    "rarity": "MYTHIC",
    "value": 64000,
    "stats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "slot": "amulet",
    "source": "COMBAT",
    "baseStats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "titanium_band": {
    "id": "titanium_band",
    "name": "Titanium Band of Haste",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786052364807,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "def": 25,
      "hp": 100,
      "spd": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "dragon_scale_mail": {
    "id": "dragon_scale_mail",
    "name": "Sturdy Dragon Scale Mail",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786052711359,
    "rarity": "MYTHIC",
    "value": 42000,
    "stats": {
      "def": 75,
      "hp": 200,
      "luck": 10
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 75,
      "hp": 200,
      "luck": 10
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "voidstar_choker": {
    "id": "voidstar_choker",
    "name": "Sharp Void-Star Choker",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786052712184,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 200,
      "mag": 80,
      "crit": 10,
      "atk": 8
    },
    "slot": "amulet",
    "source": "COMBAT"
  },
  "abyssal_ring": {
    "id": "abyssal_ring",
    "name": "Sturdy Abyssal Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786052850672,
    "rarity": "MYTHIC",
    "value": 400000,
    "stats": {
      "atk": 50,
      "mag": 50,
      "hp": 30
    },
    "slot": "ring",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "atk": 50,
      "mag": 50,
      "hp": 30
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "voidtouched_grips": {
    "id": "voidtouched_grips",
    "name": "Void-Touched Grips",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786087539374,
    "rarity": "MYTHIC",
    "value": 55000,
    "stats": {
      "atk": 30,
      "spd": 35,
      "crit": 12
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "dragon_gauntlets": {
    "id": "dragon_gauntlets",
    "name": "Glowing Dragon Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786087632875,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": {
      "def": 45,
      "atk": 25,
      "hp": 30,
      "mag": 10
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "chrono_weaver_vestments": {
    "id": "chrono_weaver_vestments",
    "name": "Chrono Weaver Vestments",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786087717537,
    "rarity": "MYTHIC",
    "value": 75000,
    "stats": {
      "def": 85,
      "hp": 250,
      "spd": 25
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "scale_coat_of_eternity": {
    "id": "scale_coat_of_eternity",
    "name": "Scale Coat of Eternity",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786088412143,
    "rarity": "MYTHIC",
    "value": 42000,
    "stats": {
      "def": 70,
      "hp": 150,
      "spd": 20
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "mirror_buckler": {
    "id": "mirror_buckler",
    "name": "Lucky Mirror Buckler",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786088729885,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "signet_of_the_ancestors": {
    "id": "signet_of_the_ancestors",
    "name": "Sharp Signet of the Ancestors",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786089411491,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "slot": "ring",
    "source": "COMBAT",
    "baseStats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "dragonfang_claymore": {
    "id": "dragonfang_claymore",
    "name": "Light Dragon-Fang Claymore",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786089522755,
    "rarity": "MYTHIC",
    "value": 46000,
    "stats": {
      "atk": 85,
      "crit": 12,
      "spd": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "treads_of_the_damned": {
    "id": "treads_of_the_damned",
    "name": "Glowing Treads of the Damned of Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786092448159,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "def": 40,
      "spd": 45,
      "mag": 10,
      "luck": 25
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "dragonwing_cloak": {
    "id": "dragonwing_cloak",
    "name": "Dragon-Wing Cloak",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786092449140,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "def": 40,
      "spd": 25,
      "luck": 10
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "abyssal_treads": {
    "id": "abyssal_treads",
    "name": "Sturdy Abyssal Treads",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786113967062,
    "rarity": "MYTHIC",
    "value": 58000,
    "stats": {
      "def": 35,
      "spd": 45,
      "luck": 15
    },
    "slot": "boots",
    "source": "COMBAT",
    "baseStats": {
      "def": 35,
      "spd": 45,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Glowing Dragon-Scale Plate of Might",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786114081887,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150,
      "mag": 10,
      "atk": 15
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "mirrorwarp_cloak": {
    "id": "mirrorwarp_cloak",
    "name": "Mirror-Warp Cloak of Might",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786114140824,
    "rarity": "MYTHIC",
    "value": 28000,
    "stats": {
      "def": 30,
      "spd": 25,
      "crit": 10,
      "atk": 15
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "mirror_shield_of_tartarus": {
    "id": "mirror_shield_of_tartarus",
    "name": "Mirror Shield of Tartarus of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786114793149,
    "rarity": "MYTHIC",
    "value": 84000,
    "stats": {
      "def": 130,
      "hp": 350,
      "crit": 15,
      "mag": 20
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "heart_of_the_cosmos": {
    "id": "heart_of_the_cosmos",
    "name": "Lucky Heart of the Cosmos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786115031248,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "hp": 300,
      "mag": 60,
      "luck": 15
    },
    "slot": "amulet",
    "source": "COMBAT",
    "baseStats": {
      "hp": 300,
      "mag": 60,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "mirrorimage_shroud": {
    "id": "mirrorimage_shroud",
    "name": "Glowing Mirror-Image Shroud",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786115292386,
    "rarity": "MYTHIC",
    "value": 29000,
    "stats": {
      "def": 25,
      "spd": 35,
      "crit": 12,
      "mag": 10
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "cloak_of_shifting_realities": {
    "id": "cloak_of_shifting_realities",
    "name": "Lucky Cloak of Shifting Realities",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1786115306842,
    "rarity": "MYTHIC",
    "value": 55000,
    "stats": {
      "def": 45,
      "spd": 35,
      "luck": 15
    },
    "slot": "cloak",
    "source": "COMBAT",
    "baseStats": {
      "def": 45,
      "spd": 35,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "infernal_greaves": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786115381192,
    "rarity": "MYTHIC",
    "value": 59000,
    "stats": {
      "def": 55,
      "spd": 25,
      "atk": 15
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "eelskin_hazard_suit": {
    "id": "eelskin_hazard_suit",
    "name": "Light Eel-Skin Hazard Suit",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786115535686,
    "rarity": "MYTHIC",
    "value": 76000,
    "stats": {
      "def": 90,
      "hp": 300,
      "spd": 30
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 90,
      "hp": 300,
      "spd": 30
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "veil_of_the_void": {
    "id": "veil_of_the_void",
    "name": "Veil of the Void of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786115605695,
    "rarity": "MYTHIC",
    "value": 52000,
    "stats": {
      "def": 50,
      "spd": 40,
      "crit": 20
    },
    "slot": "cloak",
    "source": "COMBAT",
    "baseStats": {
      "def": 50,
      "spd": 40,
      "crit": 20
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "mirroredged_rapier": {
    "id": "mirroredged_rapier",
    "name": "Mirror-Edged Rapier",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786115704479,
    "rarity": "MYTHIC",
    "value": 43000,
    "stats": {
      "atk": 65,
      "spd": 30,
      "crit": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "crown_of_the_dragon_lord": {
    "id": "crown_of_the_dragon_lord",
    "name": "Sturdy Crown of the Dragon Lord of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786118605122,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": {
      "def": 45,
      "mag": 30,
      "luck": 12
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 45,
      "mag": 30,
      "luck": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "loop_of_forever": {
    "id": "loop_of_forever",
    "name": "Loop of Forever",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786138698896,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "singularity_band": {
    "id": "singularity_band",
    "name": "Singularity Band of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786139053488,
    "rarity": "MYTHIC",
    "value": 61000,
    "stats": {
      "def": 15,
      "luck": 40,
      "atk": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "crown_of_hellfire": {
    "id": "crown_of_hellfire",
    "name": "Crown of Hellfire",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786139088835,
    "rarity": "MYTHIC",
    "value": 65000,
    "stats": {
      "def": 40,
      "mag": 80,
      "crit": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "gloves_of_the_ruined_kingdom": {
    "id": "gloves_of_the_ruined_kingdom",
    "name": "Gloves of the Ruined Kingdom",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786139172436,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "mag": 30,
      "spd": 15,
      "luck": 12
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "eelspike_gauntlets": {
    "id": "eelspike_gauntlets",
    "name": "Lucky Eel-Spike Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786139561497,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "atk": 35,
      "spd": 30,
      "crit": 18,
      "luck": 15
    },
    "slot": "gloves",
    "source": "BOSS"
  },
  "repair_kit_master": {
    "id": "repair_kit_master",
    "name": "Master Repair Kit",
    "type": "CONSUMABLE",
    "quantity": 2,
    "acquiredAt": 1786190048420,
    "rarity": "RARE",
    "value": 3000,
    "stats": {},
    "slot": null,
    "usable": true
  },
  "null_aegis": {
    "id": "null_aegis",
    "name": "Null Aegis of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786195092992,
    "rarity": "MYTHIC",
    "value": 360000,
    "stats": {
      "def": 130,
      "hp": 110,
      "luck": 15,
      "mag": 20
    },
    "slot": "armor",
    "source": "COMBAT"
  }
}
```

---

### VOID  `64841406501106@lid`

- **userId**: 64841406501106@lid
- **registered**: true
- **nickname**: VOID
- **phoneHash**: 7c49469b93fcbf2d00befce3ca4a6f8a28a14bbd59e98be2b740cd9bf7470521
- **wallet**: 912126
- **bank**: 0
- **class**: NIGHTBLADE
- **adventurerRank**: B
- **spriteIndex**: 61
- **level**: 60
- **xp**: 37596829
- **hp**: 4712
- **maxHp**: 6978
- **currentHP**: 6583
- **questGold**: 0
- **questsCompleted**: 101
- **questsWon**: 24
- **questsFailed**: 25
- **pvpWins**: 4
- **pvpLosses**: 2
- **eventTokens**: 9
- **totalEarned**: 11121313
- **totalSpent**: 4272458
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 24
- **dragonsKilled**: 1
- **itemsCrafted**: 0
- **itemsEquipped**: 29
- **undeadKills**: 12
- **kills**: 772
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 40
- **progression_level**: 60
- **progression_xp**: 37596829
- **progression_gp**: 290
- **progression_totalGP**: 290
- **progression_statPoints**: 10
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Void
- **profile_nickname**: VOID
- **profile_firstSeen**: "2026-07-08T22:24:32.760Z"
- **profile_lastSeen**: "2026-07-11T11:03:44.728Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-08T22:24:32.764Z
- **updatedAt**: 2026-08-07T14:35:19.292Z

**equipment**:
```json
{
  "main_hand": {
    "id": "void_kraken_cleaver",
    "name": "God-forged Void Kraken Cleaver",
    "type": "EQUIPMENT",
    "acquiredAt": 1784005949879,
    "rarity": "MYTHIC",
    "value": 92000,
    "stats": {
      "atk": 657,
      "mag": 125,
      "crit": 94
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "maxDurability": 150,
    "durability": 147.8,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "atk": 105,
      "mag": 20,
      "crit": 15
    },
    "enhancementLevel": 15,
    "enhancementBonus": 5.249999999999999
  },
  "off_hand": {
    "id": "mirror_shield_of_tartarus",
    "name": "God-forged Mirror Shield of Tartarus",
    "type": "EQUIPMENT",
    "acquiredAt": 1784368219566,
    "rarity": "COMMON",
    "value": 84000,
    "stats": {
      "def": 293,
      "hp": 788,
      "crit": 34
    },
    "slot": null,
    "baseStats": {
      "def": 130,
      "hp": 350,
      "crit": 15
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.25,
    "maxDurability": 80,
    "durability": 72.1,
    "durabilityTraits": []
  },
  "armor": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "acquiredAt": 1783978372656,
    "rarity": "COMMON",
    "value": 1600,
    "stats": null,
    "slot": null,
    "source": "INFECTED_COLOSSUS",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "helm_of_fire_essence",
    "name": "Helm of Fire Essence",
    "type": "EQUIPMENT",
    "acquiredAt": 1783878741546,
    "rarity": "RARE",
    "value": 8000,
    "stats": {
      "def": 25,
      "atk": 15,
      "crit": 5
    },
    "slot": "helmet",
    "source": "COMBAT",
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": []
  },
  "boots": {
    "id": "treads_of_the_forgotten_forest",
    "name": "God-forged Treads of the Forgotten Forest",
    "type": "EQUIPMENT",
    "acquiredAt": 1784368333131,
    "rarity": "COMMON",
    "value": 15000,
    "stats": {
      "def": 124,
      "hp": 138
    },
    "slot": null,
    "baseStats": {
      "def": 45,
      "hp": 50
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.75,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "ring": {
    "id": "dragon_seal_ring",
    "name": "God-forged Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1784368451236,
    "rarity": "COMMON",
    "value": 20000,
    "stats": {
      "atk": 22
    },
    "slot": null,
    "baseStats": {
      "atk": 10
    },
    "enhancementLevel": 5,
    "enhancementBonus": 1.15,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "voidstar_choker",
    "name": "God-forged Void-Star Choker",
    "type": "EQUIPMENT",
    "acquiredAt": 1784005713878,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 760,
      "mag": 304,
      "crit": 38
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    },
    "enhancementLevel": 8,
    "enhancementBonus": 2.8000000000000003,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": null,
  "gloves": {
    "id": "wyrmscale_grips",
    "name": "Wyrmscale Grips",
    "type": "EQUIPMENT",
    "acquiredAt": 1783860833182,
    "rarity": "COMMON",
    "value": 32000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1784410908062,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1784194913054,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784157086495,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1784410014304,
    "rarity": "RARE",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "voidstrand_robes": {
    "id": "voidstrand_robes",
    "name": "Void-Strand Robes",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783771629830,
    "rarity": "COMMON",
    "value": 74000,
    "stats": null,
    "slot": null
  },
  "worldender_lance": {
    "id": "worldender_lance",
    "name": "World-Ender Lance",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783772274340,
    "rarity": "COMMON",
    "value": 98000,
    "stats": null,
    "slot": null
  },
  "chaos_blade": {
    "id": "chaos_blade",
    "name": "Chaos Blade",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783772274926,
    "rarity": "COMMON",
    "value": 180000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "steel_sabre": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783772438627,
    "rarity": "COMMON",
    "value": 16000,
    "stats": null,
    "slot": null
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 44,
    "acquiredAt": 1784190911463,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "INFECTED_COLOSSUS"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784487445127,
    "rarity": "MYTHIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Polished Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783772437922,
    "rarity": "COMMON",
    "value": 22000,
    "stats": {
      "atk": 75,
      "crit": 21
    },
    "slot": null,
    "maxDurability": 80,
    "durability": 78.9,
    "durabilityTraits": [],
    "baseStats": {
      "atk": 55,
      "crit": 15
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1783781673331,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784196510853,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 16,
    "acquiredAt": 1784409849265,
    "rarity": "EPIC",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784189521661,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 25,
    "acquiredAt": 1784506906206,
    "rarity": "RARE",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1783792092406,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1784373319016,
    "rarity": "UNCOMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784194245657,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1784506313695,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784092591734,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784373744817,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 28,
    "acquiredAt": 1784506314298,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 26,
    "acquiredAt": 1784574537619,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "regen_salve": {
    "id": "regen_salve",
    "name": "Regeneration Salve",
    "type": "POTION",
    "quantity": 9,
    "acquiredAt": 1783858374175,
    "rarity": "UNCOMMON",
    "value": 1120,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "legendary_chrono_ring": {
    "id": "legendary_chrono_ring",
    "name": "Polished Legendary Chrono Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860938973,
    "rarity": "COMMON",
    "value": 36000,
    "stats": {
      "spd": 18,
      "luck": 29,
      "crit": 12
    },
    "slot": null,
    "baseStats": {
      "spd": 15,
      "luck": 25,
      "crit": 10
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.15
  },
  "amulet_of_the_hive_mind": {
    "id": "amulet_of_the_hive_mind",
    "name": "Amulet of the Hive Mind",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783770753931,
    "rarity": "COMMON",
    "value": 16500,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "carapace_of_the_corrupted_eel": {
    "id": "carapace_of_the_corrupted_eel",
    "name": "Carapace of the Corrupted Eel",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783877507745,
    "rarity": "EPIC",
    "value": 22500,
    "stats": {
      "def": 55,
      "hp": 120,
      "spd": 10
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1784395451069,
    "rarity": "EPIC",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 42,
    "acquiredAt": 1784574539819,
    "rarity": "MYTHIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "Major Health Potion",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1783888199357,
    "rarity": "RARE",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784195407128,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "Smoke Bomb",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1783889602140,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1783889640738,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784373615326,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "copper_band": {
    "id": "copper_band",
    "name": "Copper Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783942005946,
    "rarity": "COMMON",
    "value": 400,
    "stats": {
      "luck": 3
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "amulet_of_the_broken_era": {
    "id": "amulet_of_the_broken_era",
    "name": "Amulet of the Broken Era",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783942569144,
    "rarity": "LEGENDARY",
    "value": 36000,
    "stats": {
      "mag": 20,
      "luck": 35
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784398029198,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784409849857,
    "rarity": "EPIC",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 12,
    "acquiredAt": 1783969917643,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783978372656,
    "rarity": "COMMON",
    "value": 1600,
    "stats": null,
    "slot": null,
    "source": "INFECTED_COLOSSUS"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784505577907,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 33,
    "acquiredAt": 1784505572000,
    "rarity": "MYTHIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "great_wyrm_helm": {
    "id": "great_wyrm_helm",
    "name": "Polished Great Wyrm Helm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860643374,
    "rarity": "COMMON",
    "value": 32000,
    "stats": {
      "def": 61,
      "atk": 34,
      "crit": 11
    },
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": [],
    "baseStats": {
      "def": 45,
      "atk": 25,
      "crit": 8
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1784394308571,
    "rarity": "RARE",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784507070293,
    "rarity": "EPIC",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784504448493,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784045595839,
    "rarity": "LEGENDARY",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784156136302,
    "rarity": "EPIC",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "berserker_pill": {
    "id": "berserker_pill",
    "name": "berserker_pill",
    "type": "ITEM",
    "quantity": 3,
    "acquiredAt": 1784161560400,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "spiked_eel_buckler": {
    "id": "spiked_eel_buckler",
    "name": "Spiked Eel Buckler",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784161914203,
    "rarity": "EPIC",
    "value": 17500,
    "stats": {
      "def": 40,
      "spd": 15
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT"
  },
  "mirroredged_rapier": {
    "id": "mirroredged_rapier",
    "name": "Mirror-Edged Rapier",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860617481,
    "rarity": "COMMON",
    "value": 43000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 79.2,
    "durabilityTraits": []
  },
  "mythril_shield": {
    "id": "mythril_shield",
    "name": "Polished Mythril Shield",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783771894527,
    "rarity": "COMMON",
    "value": 9500,
    "stats": {
      "def": 64
    },
    "slot": null,
    "maxDurability": 65,
    "durability": 63.9,
    "durabilityTraits": [],
    "baseStats": {
      "def": 55
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.15
  },
  "pendant_of_the_dragon_eye": {
    "id": "pendant_of_the_dragon_eye",
    "name": "Pendant of the Dragon Eye",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860963775,
    "rarity": "COMMON",
    "value": 34000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "scale_coat_of_eternity": {
    "id": "scale_coat_of_eternity",
    "name": "Scale Coat of Eternity",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860801577,
    "rarity": "COMMON",
    "value": 42000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "infected_fish": {
    "id": "infected_fish",
    "name": "\u2623\ufe0f Corrupted Eel",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784283046808,
    "rarity": "EPIC",
    "value": 4500,
    "stats": {},
    "slot": null
  },
  "visor_of_the_void_walker": {
    "id": "visor_of_the_void_walker",
    "name": "Visor of the Void Walker",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784368283442,
    "rarity": "COMMON",
    "value": 63000,
    "stats": null,
    "slot": null
  },
  "void_core_amulet": {
    "id": "void_core_amulet",
    "name": "Void Core Amulet",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784368545017,
    "rarity": "COMMON",
    "value": 60000,
    "stats": null,
    "slot": null
  },
  "pulsing_heart_loop": {
    "id": "pulsing_heart_loop",
    "name": "Polished Pulsing Heart Loop",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783770607222,
    "rarity": "COMMON",
    "value": 18500,
    "stats": {
      "hp": 126,
      "crit": 9
    },
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": [],
    "baseStats": {
      "hp": 120,
      "crit": 8
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.05
  },
  "phylactery_pendant": {
    "id": "phylactery_pendant",
    "name": "Phylactery Pendant",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784368496940,
    "rarity": "COMMON",
    "value": 18000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "cloak_of_the_phantom": {
    "id": "cloak_of_the_phantom",
    "name": "Cloak of the Phantom",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860984373,
    "rarity": "COMMON",
    "value": 30000,
    "stats": null,
    "slot": null
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784505090607,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784356347052,
    "rarity": "COMMON",
    "value": 95000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784190197983,
    "rarity": "EPIC",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor",
    "source": "VOID_CORRUPTED",
    "maxDurability": 158,
    "durability": 158,
    "durabilityTraits": []
  },
  "abyssal_carapace": {
    "id": "abyssal_carapace",
    "name": "Polished Abyssal Carapace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784372462945,
    "rarity": "COMMON",
    "value": 78000,
    "stats": {
      "def": 149,
      "hp": 540
    },
    "slot": null,
    "baseStats": {
      "def": 110,
      "hp": 400
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "boots_of_eternal_blood": {
    "id": "boots_of_eternal_blood",
    "name": "Boots of Eternal Blood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783860897375,
    "rarity": "COMMON",
    "value": 32000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "abyssal_treads": {
    "id": "abyssal_treads",
    "name": "Abyssal Treads",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784373143211,
    "rarity": "COMMON",
    "value": 58000,
    "stats": null,
    "slot": null
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784410907464,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784410356356,
    "rarity": "LEGENDARY",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785267725044,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  }
}
```

---

### Aspace✈️🎹  `209904027570242@lid`

- **userId**: 209904027570242@lid
- **registered**: true
- **nickname**: Aspace✈️🎹
- **phoneHash**: 61abe6ff0bcc19eea3a2445f0331c94ed34777623cb37b4f8e53a145cbd9810c
- **wallet**: 144153
- **bank**: 0
- **class**: WARLORD
- **adventurerRank**: S
- **spriteIndex**: 67
- **level**: 75
- **xp**: 433602355
- **hp**: 1562
- **maxHp**: 8095
- **currentHP**: 10639
- **questGold**: 0
- **questsCompleted**: 346
- **questsWon**: 224
- **questsFailed**: 45
- **pvpWins**: 7
- **pvpLosses**: 7
- **eventTokens**: 2
- **totalEarned**: 140006096
- **totalSpent**: 13528507
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 73
- **dragonsKilled**: 52
- **itemsCrafted**: 0
- **itemsEquipped**: 53
- **undeadKills**: 1
- **kills**: 2047
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 55
- **progression_level**: 75
- **progression_xp**: 433602355
- **progression_gp**: 615
- **progression_totalGP**: 615
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Aspace✈️🎹
- **profile_nickname**: Aspace✈️🎹
- **profile_firstSeen**: "2026-08-08T09:59:51.467Z"
- **profile_lastSeen**: "2026-08-08T10:11:15.858Z"
- **profile_messageCount**: 1
- **createdAt**: 2026-07-09T00:13:14.130Z
- **updatedAt**: 2026-08-08T10:11:21.337Z

**equipment**:
```json
{
  "main_hand": {
    "id": "dragonfang_claymore",
    "name": "Reinforced Dragon-Fang Claymore",
    "type": "EQUIPMENT",
    "acquiredAt": 1783858969972,
    "rarity": "COMMON",
    "value": 46000,
    "stats": {
      "atk": 175,
      "crit": 25
    },
    "slot": null,
    "maxDurability": 80,
    "durability": 52,
    "durabilityTraits": [],
    "enhancementLevel": 3,
    "baseStats": {
      "atk": 85,
      "crit": 12
    },
    "enhancementBonus": 1.0499999999999998
  },
  "off_hand": {
    "id": "null_ward",
    "name": "God-forged Null Ward",
    "type": "EQUIPMENT",
    "acquiredAt": 1785934169790,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "def": 880,
      "hp": 880,
      "luck": 176
    },
    "slot": "off_hand",
    "reqLevel": 70,
    "maxDurability": 150,
    "durability": 142.7,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "def": 100,
      "hp": 100,
      "luck": 20
    },
    "enhancementLevel": 13,
    "enhancementBonus": 7.799999999999998
  },
  "armor": {
    "id": "eelskin_hazard_suit",
    "name": "Reinforced Eel-Skin Hazard Suit of Sages",
    "type": "EQUIPMENT",
    "acquiredAt": 1785934906920,
    "rarity": "MYTHIC",
    "value": 76000,
    "stats": {
      "def": 252,
      "hp": 840,
      "spd": 84
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 90,
      "hp": 300,
      "spd": 30
    },
    "enhancementLevel": 3,
    "enhancementBonus": 1.7999999999999998,
    "maxDurability": 180,
    "durability": 178.3,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "helmet": {
    "id": "visor_of_the_void_walker",
    "name": "Visor of the Void Walker",
    "type": "EQUIPMENT",
    "acquiredAt": 1783581225094,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "def": 50,
      "spd": 40,
      "luck": 15
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT",
    "maxDurability": 180,
    "durability": 178.3,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "boots": {
    "id": "treads_of_the_forgotten_forest",
    "name": "Treads of the Forgotten Forest",
    "type": "EQUIPMENT",
    "acquiredAt": 1783973158867,
    "rarity": "COMMON",
    "value": 15000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 87.5,
    "durabilityTraits": []
  },
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1784100258540,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "void_core_amulet",
    "name": "Void Core Amulet",
    "type": "EQUIPMENT",
    "acquiredAt": 1784137811275,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "hp": 250,
      "mag": 70,
      "spd": 10
    },
    "slot": "amulet",
    "source": "COMBAT",
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": {
    "id": "mantlet_of_chaos",
    "name": "Strengthened Light Mantlet of Chaos of Protection",
    "type": "EQUIPMENT",
    "acquiredAt": 1783858910890,
    "rarity": "COMMON",
    "value": 54000,
    "stats": {
      "def": 91,
      "hp": 26,
      "luck": 20,
      "spd": 13
    },
    "slot": null,
    "maxDurability": 96,
    "durability": 87.5,
    "durabilityTraits": [],
    "enhancementLevel": 2,
    "enhancementBonus": 0.3,
    "baseStats": {
      "def": 70,
      "hp": 20,
      "luck": 15,
      "spd": 10
    }
  },
  "gloves": {
    "id": "titan_fist_gauntlets",
    "name": "Titan Fist Gauntlets",
    "type": "EQUIPMENT",
    "acquiredAt": 1784127115046,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "atk": 40,
      "def": 30
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT",
    "maxDurability": 180,
    "durability": 178.3,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 42,
    "acquiredAt": 1784230336963,
    "rarity": "RARE",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1783560017128,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 65,
    "acquiredAt": 1784229657478,
    "rarity": "UNCOMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 46,
    "acquiredAt": 1784178254772,
    "rarity": "UNCOMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 75,
    "acquiredAt": 1784573129050,
    "rarity": "MYTHIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 164,
    "acquiredAt": 1784209666118,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 23,
    "acquiredAt": 1784179849784,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "defense_tonic": {
    "id": "defense_tonic",
    "name": "defense_tonic",
    "type": "ITEM",
    "quantity": 3,
    "acquiredAt": 1783563584431,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 25,
    "acquiredAt": 1784453185616,
    "rarity": "UNCOMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 60,
    "acquiredAt": 1784569515831,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 18,
    "acquiredAt": 1784183569276,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 99,
    "acquiredAt": 1784571225350,
    "rarity": "EPIC",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784572143726,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 69,
    "acquiredAt": 1784570667120,
    "rarity": "RARE",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 39,
    "acquiredAt": 1784180775682,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1783579189593,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 36,
    "acquiredAt": 1784569440720,
    "rarity": "EPIC",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "speed_elixir": {
    "id": "speed_elixir",
    "name": "speed_elixir",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1783580515592,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 60,
    "acquiredAt": 1784568805926,
    "rarity": "EPIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 63,
    "acquiredAt": 1784573376820,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 33,
    "acquiredAt": 1784568807335,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784568776124,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 22,
    "acquiredAt": 1784324427350,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "evolution_stone": {
    "id": "evolution_stone",
    "name": "Evolution Stone (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1783630086440,
    "rarity": "RARE",
    "value": 8000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1784457090316,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784569441649,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "Strength Brew",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1783660209565,
    "rarity": "EPIC",
    "value": 3200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 11,
    "acquiredAt": 1784568645527,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 35,
    "acquiredAt": 1784229908467,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784183637975,
    "rarity": "RARE",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784180261676,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784457638915,
    "rarity": "LEGENDARY",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 23,
    "acquiredAt": 1784572144356,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "berserker_pill": {
    "id": "berserker_pill",
    "name": "berserker_pill",
    "type": "ITEM",
    "quantity": 4,
    "acquiredAt": 1783670502287,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1784139233280,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "essence_mirror": {
    "id": "essence_mirror",
    "name": "Essence Mirror",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1783671846969,
    "rarity": "LEGENDARY",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784568719838,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 8,
    "acquiredAt": 1783771270425,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "Major Health Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1783798157672,
    "rarity": "RARE",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "regen_salve": {
    "id": "regen_salve",
    "name": "Regeneration Salve",
    "type": "POTION",
    "quantity": 6,
    "acquiredAt": 1783861434479,
    "rarity": "UNCOMMON",
    "value": 1120,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mana_potion": {
    "id": "mana_potion",
    "name": "Mana Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1783886638741,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "Smoke Bomb",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1784099789534,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 150,
    "acquiredAt": 1784575139047,
    "rarity": "MYTHIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784573952529,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythic_enhancement_stone": {
    "id": "mythic_enhancement_stone",
    "name": "Mythic Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1785484221681,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "skill_scroll": {
    "id": "skill_scroll",
    "name": "Skill Scroll",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785485562982,
    "rarity": "MYTHIC",
    "value": 15000,
    "stats": null,
    "slot": null,
    "source": "PUZZLE"
  },
  "gold_pile": {
    "id": "gold_pile",
    "name": "Pile of Gold",
    "type": "MATERIAL",
    "quantity": 179,
    "acquiredAt": 1785485563958,
    "rarity": "RARE",
    "value": 1,
    "stats": null,
    "slot": null,
    "source": "PUZZLE"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 10,
    "acquiredAt": 1785485785317,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "rare_item_ticket": {
    "id": "rare_item_ticket",
    "name": "Rare Item Ticket",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785493877779,
    "rarity": "MYTHIC",
    "value": 10000,
    "stats": null,
    "slot": null,
    "source": "MERCHANT"
  },
  "discount_coupon": {
    "id": "discount_coupon",
    "name": "Discount Coupon",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785493878685,
    "rarity": "MYTHIC",
    "value": 2000,
    "stats": null,
    "slot": null,
    "source": "MERCHANT"
  },
  "mantlet_of_chaos": {
    "id": "mantlet_of_chaos",
    "name": "Mantlet of Chaos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785496757985,
    "rarity": "COMMON",
    "value": 54000,
    "stats": null,
    "slot": null
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785499550101,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785935145885,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785935146982,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mirror_shield_of_tartarus": {
    "id": "mirror_shield_of_tartarus",
    "name": "Mirror Shield of Tartarus",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785934866396,
    "rarity": "MYTHIC",
    "value": 84000,
    "stats": null,
    "slot": "off_hand",
    "reqLevel": 50,
    "maxDurability": 150,
    "durability": 150,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 1,
    "acquiredAt": 1785961670479,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "void_crown": {
    "id": "void_crown",
    "name": "Light Void Crown",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785963540646,
    "rarity": "MYTHIC",
    "value": 600000,
    "stats": {
      "mag": 100,
      "def": 50,
      "luck": 30,
      "spd": 10
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785964769993,
    "rarity": "LEGENDARY",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gaze_of_the_titan": {
    "id": "gaze_of_the_titan",
    "name": "Lucky Gaze of the Titan of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786014359402,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "def": 55,
      "hp": 80,
      "luck": 15,
      "atk": 15
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786014902180,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "worldender_lance": {
    "id": "worldender_lance",
    "name": "World-Ender Lance of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786014902743,
    "rarity": "MYTHIC",
    "value": 98000,
    "stats": {
      "atk": 115,
      "mag": 40,
      "crit": 12
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "baseStats": {
      "atk": 115,
      "mag": 40,
      "crit": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "petrified_forest_boots": {
    "id": "petrified_forest_boots",
    "name": "Sturdy Petrified Forest Boots",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786014956143,
    "rarity": "MYTHIC",
    "value": 14000,
    "stats": {
      "def": 35,
      "hp": 50
    },
    "slot": "boots",
    "source": "COMBAT",
    "baseStats": {
      "def": 35,
      "hp": 50
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1786015046068,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "hivecore_band": {
    "id": "hivecore_band",
    "name": "Light Hive-Core Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786015199893,
    "rarity": "MYTHIC",
    "value": 19000,
    "stats": {
      "atk": 10,
      "crit": 12,
      "luck": 8,
      "spd": 10
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Light Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786015485206,
    "rarity": "MYTHIC",
    "value": 22000,
    "stats": {
      "atk": 55,
      "crit": 15,
      "spd": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "singularity_band": {
    "id": "singularity_band",
    "name": "Singularity Band of Haste",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786017778180,
    "rarity": "MYTHIC",
    "value": 61000,
    "stats": {
      "def": 15,
      "luck": 40,
      "spd": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "treads_of_the_damned": {
    "id": "treads_of_the_damned",
    "name": "Treads of the Damned",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786017861234,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "def": 40,
      "spd": 45
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "ancient_artifact_loop": {
    "id": "ancient_artifact_loop",
    "name": "Ancient Artifact Loop",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786017977489,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": {
      "atk": 25,
      "luck": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "voidtouched_grips": {
    "id": "voidtouched_grips",
    "name": "Void-Touched Grips",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786018077243,
    "rarity": "MYTHIC",
    "value": 55000,
    "stats": {
      "atk": 30,
      "spd": 35,
      "crit": 12
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "mirror_buckler": {
    "id": "mirror_buckler",
    "name": "Lucky Mirror Buckler of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786018190474,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "helm_of_ancient_blood": {
    "id": "helm_of_ancient_blood",
    "name": "Glowing Helm of Ancient Blood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786018582100,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "def": 40,
      "atk": 30,
      "crit": 10,
      "mag": 10
    },
    "slot": "helmet",
    "source": "COMBAT"
  },
  "garb_of_the_elder_mage": {
    "id": "garb_of_the_elder_mage",
    "name": "Lucky Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786018633684,
    "rarity": "MYTHIC",
    "value": 41000,
    "stats": {
      "def": 50,
      "mag": 65,
      "spd": 15,
      "luck": 15
    },
    "slot": "armor",
    "source": "COMBAT"
  }
}
```

---

### hero  `193664605262049@lid`

- **userId**: 193664605262049@lid
- **registered**: true
- **nickname**: hero
- **phoneHash**: 388101e1ff3b82086c3f80a713635145687a8e9da335cf0a29fa0215a2633245
- **wallet**: 51099600
- **bank**: 0
- **class**: LICH
- **adventurerRank**: S
- **spriteIndex**: 91
- **level**: 70
- **xp**: 190565427
- **hp**: 6465
- **maxHp**: 8547
- **currentHP**: 8650
- **questGold**: 0
- **questsCompleted**: 183
- **questsWon**: 147
- **questsFailed**: 3
- **pvpWins**: 10
- **pvpLosses**: 18
- **eventTokens**: 0
- **totalEarned**: 51256881
- **totalSpent**: 25123082
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 68
- **dragonsKilled**: 181
- **itemsCrafted**: 15
- **itemsEquipped**: 26
- **undeadKills**: 5
- **kills**: 1803
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 50
- **progression_level**: 70
- **progression_xp**: 190565427
- **progression_gp**: 757
- **progression_totalGP**: 757
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ♤Shiro♡
- **profile_nickname**: hero
- **profile_firstSeen**: "2026-07-17T17:33:01.591Z"
- **profile_lastSeen**: "2026-07-31T22:14:09.965Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-11T19:42:35.507Z
- **updatedAt**: 2026-08-07T13:24:25.962Z

**equipment**:
```json
{
  "main_hand": {
    "id": "hellfire_greatmaul",
    "name": "Hellfire Greatmaul",
    "type": "EQUIPMENT",
    "acquiredAt": 1784335549310,
    "rarity": "MYTHIC",
    "value": 96000,
    "stats": {
      "atk": 120,
      "mag": 25,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "maxDurability": 150,
    "durability": 147.3,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "off_hand": null,
  "armor": {
    "id": "abyssal_carapace",
    "name": "Abyssal Carapace of Protection",
    "type": "EQUIPMENT",
    "acquiredAt": 1785357016081,
    "rarity": "MYTHIC",
    "value": 78000,
    "stats": {
      "def": 110,
      "hp": 400
    },
    "slot": "armor",
    "source": "COMBAT",
    "maxDurability": 180,
    "durability": 179.2,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "def": 110,
      "hp": 400
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "helmet": {
    "id": "crown_of_hellfire",
    "name": "Crown of Hellfire",
    "type": "EQUIPMENT",
    "acquiredAt": 1785711400366,
    "rarity": "MYTHIC",
    "value": 65000,
    "stats": {
      "def": 40,
      "mag": 80,
      "crit": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT",
    "maxDurability": 180,
    "durability": 179.6,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "boots": {
    "id": "shocking_treads",
    "name": "Shocking Treads",
    "type": "EQUIPMENT",
    "acquiredAt": 1783970734454,
    "rarity": "LEGENDARY",
    "value": 15500,
    "stats": {
      "def": 25,
      "spd": 35,
      "crit": 5
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "maxDurability": 156,
    "durability": 128.9,
    "durabilityTraits": []
  },
  "ring": {
    "id": "signet_of_the_ancestors",
    "name": "Signet of the Ancestors",
    "type": "EQUIPMENT",
    "acquiredAt": 1784340540653,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "slot": "ring",
    "source": "ELITE_COMBAT",
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "amulet": {
    "id": "heart_of_the_cosmos",
    "name": "Heart of the Cosmos",
    "type": "EQUIPMENT",
    "acquiredAt": 1783970548889,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "hp": 300,
      "mag": 60,
      "luck": 15
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT",
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": {
    "id": "veil_of_the_void",
    "name": "Veil of the Void",
    "type": "EQUIPMENT",
    "acquiredAt": 1783967236172,
    "rarity": "COMMON",
    "value": 52000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 75.5,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "insulated_ice_grips",
    "name": "Insulated Ice Grips",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234262125,
    "rarity": "EPIC",
    "value": 6900,
    "stats": {
      "atk": 20,
      "mag": 15
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT",
    "maxDurability": 138,
    "durability": 130.7,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 36,
    "acquiredAt": 1784407582986,
    "rarity": "RARE",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 82,
    "acquiredAt": 1784406275680,
    "rarity": "UNCOMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 18,
    "acquiredAt": 1784395162718,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784407615080,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 120,
    "acquiredAt": 1784407583579,
    "rarity": "RARE",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 79,
    "acquiredAt": 1784406430515,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 56,
    "acquiredAt": 1784407666315,
    "rarity": "RARE",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 37,
    "acquiredAt": 1784407484277,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784395432580,
    "rarity": "LEGENDARY",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 23,
    "acquiredAt": 1784393248977,
    "rarity": "UNCOMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784395466473,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 104,
    "acquiredAt": 1784407920386,
    "rarity": "EPIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 148,
    "acquiredAt": 1784404666748,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "null_staff": {
    "id": "null_staff",
    "name": "Null Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783966814466,
    "rarity": "COMMON",
    "value": 380000,
    "stats": null,
    "slot": null
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 27,
    "acquiredAt": 1784404336346,
    "rarity": "RARE",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1784407813981,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 28,
    "acquiredAt": 1784407947777,
    "rarity": "LEGENDARY",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784406429978,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "ITEM",
    "quantity": 12,
    "acquiredAt": 1784395699872,
    "rarity": "EPIC",
    "value": 1500,
    "stats": {},
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chaos_blade": {
    "id": "chaos_blade",
    "name": "Chaos Blade",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784041450547,
    "rarity": "COMMON",
    "value": 180000,
    "stats": null,
    "slot": null
  },
  "worldender_lance": {
    "id": "worldender_lance",
    "name": "World-Ender Lance",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784041499846,
    "rarity": "COMMON",
    "value": 98000,
    "stats": null,
    "slot": null
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 29,
    "acquiredAt": 1784404394517,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1784407276880,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784406090992,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 6,
    "acquiredAt": 1784339686755,
    "rarity": "LEGENDARY",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS",
    "maxDurability": 156,
    "durability": 136.3,
    "durabilityTraits": []
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784407879580,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 32,
    "acquiredAt": 1784405582750,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "dragon_key_reusable": {
    "id": "dragon_key_reusable",
    "name": "Master Dragon Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1784335138562,
    "rarity": "LEGENDARY",
    "value": 100000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "dragon_seal_ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783970192149,
    "rarity": "COMMON",
    "value": 20000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1784393998419,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784394484682,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 11,
    "acquiredAt": 1784405518791,
    "rarity": "RARE",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT",
    "maxDurability": 108,
    "durability": 45,
    "durabilityTraits": []
  },
  "band_of_cosmic_fortune": {
    "id": "band_of_cosmic_fortune",
    "name": "Band of Cosmic Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783967202964,
    "rarity": "COMMON",
    "value": 62000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "mythril_staff": {
    "id": "mythril_staff",
    "name": "Mythril Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783810526332,
    "rarity": "COMMON",
    "value": 30000,
    "stats": null,
    "slot": null,
    "maxDurability": 65,
    "durability": 43,
    "durabilityTraits": [],
    "warnedLow": true
  },
  "gold_pile": {
    "id": "gold_pile",
    "name": "Pile of Gold",
    "type": "MATERIAL",
    "quantity": 33,
    "acquiredAt": 1784338413754,
    "rarity": "UNCOMMON",
    "value": 1,
    "stats": null,
    "slot": null,
    "source": "TREASURE"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 5,
    "acquiredAt": 1784340540147,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784406344364,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sparkling_gem_band": {
    "id": "sparkling_gem_band",
    "name": "Sparkling Gem Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784393585977,
    "rarity": "EPIC",
    "value": 8000,
    "stats": {
      "mag": 10,
      "luck": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784396149770,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784396185069,
    "rarity": "UNCOMMON",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "carapace_of_the_corrupted_eel": {
    "id": "carapace_of_the_corrupted_eel",
    "name": "Carapace of the Corrupted Eel",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784407517879,
    "rarity": "LEGENDARY",
    "value": 22500,
    "stats": {
      "def": 55,
      "hp": 120,
      "spd": 10
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "touch_of_retribution": {
    "id": "touch_of_retribution",
    "name": "Touch of Retribution",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783967193564,
    "rarity": "COMMON",
    "value": 56000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 82.8,
    "durabilityTraits": []
  },
  "abyssal_crown": {
    "id": "abyssal_crown",
    "name": "Lucky Abyssal Crown",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785248198869,
    "rarity": "MYTHIC",
    "value": 1100000,
    "stats": {
      "def": 200,
      "hp": 200,
      "luck": 40,
      "mag": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 200,
      "hp": 200,
      "luck": 40,
      "mag": 20
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "signet_of_the_ancestors": {
    "id": "signet_of_the_ancestors",
    "name": "Signet of the Ancestors",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785356032712,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1785357866073,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "ELDER_CHAOS"
  },
  "health_potion": {
    "id": "health_potion",
    "name": "Health Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1785358292938,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 4,
    "acquiredAt": 1785359235519,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1785359419987,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1785359883793,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785360643362,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {
      "atk": 5
    },
    "slot": "main_hand"
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785360684568,
    "rarity": "EPIC",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor"
  },
  "phylactery_pendant": {
    "id": "phylactery_pendant",
    "name": "Phylactery Pendant",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785511467572,
    "rarity": "LEGENDARY",
    "value": 18000,
    "stats": {
      "hp": 100,
      "mag": 40
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT"
  },
  "mirror_buckler": {
    "id": "mirror_buckler",
    "name": "Light Mirror Buckler",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785511468207,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Sturdy Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785512783365,
    "rarity": "MYTHIC",
    "value": 95000,
    "stats": {
      "atk": 110,
      "mag": 30,
      "crit": 15,
      "def": 5,
      "hp": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1785513925075,
    "rarity": "UNCOMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "infected_hive_needle": {
    "id": "infected_hive_needle",
    "name": "Light Infected Hive Needle",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785513984993,
    "rarity": "LEGENDARY",
    "value": 23000,
    "stats": {
      "atk": 45,
      "spd": 25,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "atk": 45,
      "spd": 25,
      "crit": 10
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "loop_of_forever": {
    "id": "loop_of_forever",
    "name": "Glowing Loop of Forever of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785607277960,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785622836577,
    "rarity": "RARE",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785624494992,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "infernal_greaves": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves of Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785711642084,
    "rarity": "MYTHIC",
    "value": 59000,
    "stats": {
      "def": 55,
      "spd": 25,
      "atk": 15,
      "luck": 25
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "crown_of_the_abyssal_sovereign": {
    "id": "crown_of_the_abyssal_sovereign",
    "name": "Light Crown of the Abyssal Sovereign",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785715967874,
    "rarity": "MYTHIC",
    "value": 66000,
    "stats": {
      "def": 45,
      "mag": 60,
      "luck": 20,
      "spd": 10
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "treads_of_the_damned": {
    "id": "treads_of_the_damned",
    "name": "Treads of the Damned",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785718926379,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "def": 40,
      "spd": 45
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "mask_of_concentrated_magic": {
    "id": "mask_of_concentrated_magic",
    "name": "Mask of Concentrated Magic",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785724643883,
    "rarity": "RARE",
    "value": 7800,
    "stats": {
      "def": 20,
      "mag": 25
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "voidstrand_robes": {
    "id": "voidstrand_robes",
    "name": "Sharp Void-Strand Robes of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785807508384,
    "rarity": "MYTHIC",
    "value": 74000,
    "stats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "bear_claw_sabatons": {
    "id": "bear_claw_sabatons",
    "name": "Sturdy Bear Claw Sabatons",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785807844883,
    "rarity": "RARE",
    "value": 7000,
    "stats": {
      "def": 20,
      "atk": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 20,
      "atk": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 10,
    "acquiredAt": 1785808046387,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand",
    "source": "CORRUPTED_GUARDIAN"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785810176283,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785890232879,
    "rarity": "LEGENDARY",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "helm_of_ancient_blood": {
    "id": "helm_of_ancient_blood",
    "name": "Helm of Ancient Blood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785891462189,
    "rarity": "LEGENDARY",
    "value": 34000,
    "stats": {
      "def": 40,
      "atk": 30,
      "crit": 10
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "mantlet_of_chaos": {
    "id": "mantlet_of_chaos",
    "name": "Mantlet of Chaos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785892878569,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "legendary_chrono_ring": {
    "id": "legendary_chrono_ring",
    "name": "Legendary Chrono Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785892920873,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "spd": 15,
      "luck": 25,
      "crit": 10
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "null_ward": {
    "id": "null_ward",
    "name": "Null Ward",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785892973090,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "def": 100,
      "hp": 100,
      "luck": 20
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785893012843,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "ELDER_CHAOS"
  },
  "elemental_core": {
    "id": "elemental_core",
    "name": "Elemental Core",
    "type": "SUMMON_GEAR",
    "quantity": 2,
    "acquiredAt": 1785944056321,
    "rarity": "RARE",
    "value": 25000,
    "stats": {
      "mag": 35,
      "hp": 10
    },
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "mythic_summon_egg": {
    "id": "mythic_summon_egg",
    "name": "Mythic Summon Egg",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785944417892,
    "rarity": "MYTHIC",
    "value": 1000000,
    "stats": {},
    "slot": null
  }
}
```

---

### Evanesce  `2347010231214@s.whatsapp.net`

- **userId**: 2347010231214@s.whatsapp.net
- **registered**: true
- **nickname**: Evanesce
- **phoneHash**: c543e558f674bb3bab4efab7bab0e237540e12b2736a250874454036c371c2f9
- **wallet**: 39053869
- **bank**: 10453700
- **class**: GRAND_INVENTOR
- **adventurerRank**: S
- **spriteIndex**: 99
- **level**: 77
- **xp**: 640459521
- **hp**: 6485
- **maxHp**: 10511
- **currentHP**: 1
- **questGold**: 0
- **questsCompleted**: 227
- **questsWon**: 85
- **questsFailed**: 22
- **pvpWins**: 6
- **pvpLosses**: 3
- **eventTokens**: 0
- **totalEarned**: 233006088
- **totalSpent**: 261660685
- **totalGambled**: 75000
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 4
- **biggestWin**: 0
- **biggestLoss**: 30000
- **bossesDefeated**: 163
- **dragonsKilled**: 98
- **itemsCrafted**: 16
- **itemsEquipped**: 46
- **undeadKills**: 9
- **kills**: 1875
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 80
- **progression_level**: 77
- **progression_xp**: 640459521
- **progression_gp**: 757
- **progression_totalGP**: 757
- **progression_statPoints**: 80
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Evanesce🌻
- **profile_nickname**: Evanesce
- **profile_firstSeen**: "2026-07-14T14:34:47.736Z"
- **profile_lastSeen**: "2026-07-15T16:24:40.079Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-11T23:05:57.873Z
- **updatedAt**: 2026-08-07T16:06:39.726Z

**equipment**:
```json
{
  "main_hand": {
    "id": "worldender_lance",
    "name": "Polished World-Ender Lance",
    "type": "EQUIPMENT",
    "acquiredAt": 1784303188681,
    "rarity": "COMMON",
    "value": 98000,
    "stats": {
      "atk": 156,
      "mag": 54,
      "crit": 17
    },
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": [],
    "baseStats": {
      "atk": 115,
      "mag": 40,
      "crit": 12
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "off_hand": {
    "id": "aegis_of_eternal_fire",
    "name": "Aegis of Eternal Fire",
    "type": "EQUIPMENT",
    "acquiredAt": 1785198144226,
    "rarity": "COMMON",
    "value": 81000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "armor": {
    "id": "voidstrand_robes",
    "name": "Void-Strand Robes",
    "type": "EQUIPMENT",
    "acquiredAt": 1784040980739,
    "rarity": "COMMON",
    "value": 74000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "gaze_of_the_abyss",
    "name": "Gaze of the Abyss",
    "type": "EQUIPMENT",
    "acquiredAt": 1784041405196,
    "rarity": "COMMON",
    "value": 62000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "boots": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves",
    "type": "EQUIPMENT",
    "acquiredAt": 1784462057243,
    "rarity": "MYTHIC",
    "value": 59000,
    "stats": {
      "def": 55,
      "spd": 25,
      "atk": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring of Sages",
    "type": "EQUIPMENT",
    "acquiredAt": 1785195044601,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": {
      "atk": 10,
      "mag": 20
    },
    "slot": "ring",
    "source": "COMBAT",
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "amulet": {
    "id": "necklace_of_the_void_empress",
    "name": "Necklace of the Void Empress",
    "type": "EQUIPMENT",
    "acquiredAt": 1784304332374,
    "rarity": "COMMON",
    "value": 64000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "cloak": {
    "id": "cloak_of_the_phantom",
    "name": "Cloak of the Phantom",
    "type": "EQUIPMENT",
    "acquiredAt": 1783965512571,
    "rarity": "LEGENDARY",
    "value": 30000,
    "stats": {
      "def": 30,
      "spd": 40
    },
    "slot": "cloak",
    "source": "COMBAT",
    "maxDurability": 156,
    "durability": 156,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "abyssal_grasp",
    "name": "Abyssal Grasp",
    "type": "EQUIPMENT",
    "acquiredAt": 1785196094797,
    "rarity": "COMMON",
    "value": 54000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 137,
    "acquiredAt": 1784468137346,
    "rarity": "LEGENDARY",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 29,
    "acquiredAt": 1784036958046,
    "rarity": "MYTHIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 70,
    "acquiredAt": 1784472073542,
    "rarity": "UNCOMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 56,
    "acquiredAt": 1784467567141,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783862412078,
    "rarity": "COMMON",
    "value": 1000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 63.8,
    "durabilityTraits": []
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 60,
    "acquiredAt": 1784581535924,
    "rarity": "RARE",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 22,
    "acquiredAt": 1784468189559,
    "rarity": "RARE",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "defense_tonic": {
    "id": "defense_tonic",
    "name": "defense_tonic",
    "type": "ITEM",
    "quantity": 3,
    "acquiredAt": 1783940065747,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mana_potion": {
    "id": "mana_potion",
    "name": "Mana Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1783940917752,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784462500547,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783862326492,
    "rarity": "COMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand",
    "maxDurability": 100,
    "durability": 68.6,
    "durabilityTraits": []
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 54,
    "acquiredAt": 1784474042133,
    "rarity": "RARE",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1784376809562,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784467310153,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 32,
    "acquiredAt": 1784467009273,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 20,
    "acquiredAt": 1784466726443,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 21,
    "acquiredAt": 1783947659149,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1783947669237,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "quantity": 4,
    "acquiredAt": 1783946379045,
    "rarity": "COMMON",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150
    },
    "slot": "armor",
    "maxDurability": 96,
    "durability": 63.6,
    "durabilityTraits": [],
    "source": "COMBAT"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784464112337,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783943709958,
    "rarity": "COMMON",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor",
    "maxDurability": 116,
    "durability": 116,
    "durabilityTraits": [],
    "source": "VOID_CORRUPTED"
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1783964697065,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "berserker_pill": {
    "id": "berserker_pill",
    "name": "berserker_pill",
    "type": "ITEM",
    "quantity": 5,
    "acquiredAt": 1783964711273,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 20,
    "acquiredAt": 1784467713733,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "CORRUPTED_GUARDIAN"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 99,
    "acquiredAt": 1784472896844,
    "rarity": "EPIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "Major Health Potion",
    "type": "POTION",
    "quantity": 10,
    "acquiredAt": 1783965029367,
    "rarity": "RARE",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1784464387242,
    "rarity": "RARE",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784314623987,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784466946338,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1783966051467,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 0,
    "durabilityTraits": [],
    "warnedLow": true
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784409903901,
    "rarity": "LEGENDARY",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784472279040,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "gold_pile": {
    "id": "gold_pile",
    "name": "Pile of Gold",
    "type": "MATERIAL",
    "quantity": 612,
    "acquiredAt": 1783968768307,
    "rarity": "UNCOMMON",
    "value": 1,
    "stats": null,
    "slot": null,
    "source": "TREASURE"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1784474041447,
    "rarity": "LEGENDARY",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784409215161,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1784464113135,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 5,
    "acquiredAt": 1784472317839,
    "rarity": "LEGENDARY",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "maxDurability": 96,
    "durability": 49.8,
    "durabilityTraits": [],
    "source": "BOSS"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 22,
    "acquiredAt": 1784377226465,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 24,
    "acquiredAt": 1784472200939,
    "rarity": "RARE",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 83,
    "acquiredAt": 1784474329661,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "Strength Brew",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784229874955,
    "rarity": "EPIC",
    "value": 3200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784472199941,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1784467008741,
    "rarity": "EPIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "VOID_CORRUPTED"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 10,
    "acquiredAt": 1784474010844,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mythril_staff": {
    "id": "mythril_staff",
    "name": "Mythril Staff",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784041726245,
    "rarity": "COMMON",
    "value": 30000,
    "stats": null,
    "slot": null,
    "maxDurability": 65,
    "durability": 37.5,
    "durabilityTraits": []
  },
  "abyssal_blade": {
    "id": "abyssal_blade",
    "name": "Abyssal Blade",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784303218582,
    "rarity": "COMMON",
    "value": 950000,
    "stats": null,
    "slot": null
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 37,
    "acquiredAt": 1784474329141,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "voidstar_choker": {
    "id": "voidstar_choker",
    "name": "Polished Void-Star Choker",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784303525171,
    "rarity": "COMMON",
    "value": 63000,
    "stats": {
      "hp": 270,
      "mag": 108,
      "crit": 14
    },
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": [],
    "baseStats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "shield_of_restless_souls": {
    "id": "shield_of_restless_souls",
    "name": "Shield of Restless Souls",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784309339890,
    "rarity": "EPIC",
    "value": 18000,
    "stats": {
      "def": 50,
      "hp": 80
    },
    "slot": "off_hand",
    "source": "ELITE_COMBAT"
  },
  "infected_fish": {
    "id": "infected_fish",
    "name": "\u2623\ufe0f Corrupted Eel",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1784315124685,
    "rarity": "EPIC",
    "value": 4500,
    "stats": {},
    "slot": null
  },
  "heart_of_the_cosmos": {
    "id": "heart_of_the_cosmos",
    "name": "Polished Heart of the Cosmos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1783862978882,
    "rarity": "MYTHIC",
    "value": 62000,
    "stats": {
      "hp": 405,
      "mag": 81,
      "luck": 21
    },
    "slot": "amulet",
    "source": "COMBAT",
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ],
    "baseStats": {
      "hp": 300,
      "mag": 60,
      "luck": 15
    },
    "enhancementLevel": 1,
    "enhancementBonus": 0.35
  },
  "ghost_pendant": {
    "id": "ghost_pendant",
    "name": "Ghost Pendant",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784316801094,
    "rarity": "RARE",
    "value": 100,
    "stats": {
      "mag": 45
    },
    "slot": "amulet"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 7,
    "acquiredAt": 1784467935634,
    "rarity": "EPIC",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "lichs_signet": {
    "id": "lichs_signet",
    "name": "Lich's Signet",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784375725721,
    "rarity": "LEGENDARY",
    "value": 17500,
    "stats": {
      "mag": 35,
      "crit": 5
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "titanstomp_sabatons": {
    "id": "titanstomp_sabatons",
    "name": "Titan-Stomp Sabatons",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784376809018,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "def": 65,
      "spd": -10,
      "hp": 100
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784377587960,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "mirror_buckler": {
    "id": "mirror_buckler",
    "name": "Mirror Buckler",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784408472182,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "def": 75,
      "spd": 20,
      "luck": 8
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1784465402442,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "hivecore_band": {
    "id": "hivecore_band",
    "name": "Hive-Core Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784409615987,
    "rarity": "MYTHIC",
    "value": 19000,
    "stats": {
      "atk": 10,
      "crit": 12,
      "luck": 8
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 25,
    "acquiredAt": 1784411566356,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1784411610264,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "pondbass_charm": {
    "id": "pondbass_charm",
    "name": "Pond-Bass Charm",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784411738161,
    "rarity": "COMMON",
    "value": 450,
    "stats": {
      "hp": 15,
      "spd": 2
    },
    "slot": "amulet"
  },
  "mythic_fish": {
    "id": "mythic_fish",
    "name": "Void Kraken Tentacle",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784412533733,
    "rarity": "MYTHIC",
    "value": 15000,
    "stats": {},
    "slot": null
  },
  "lucky_fishbone_ring": {
    "id": "lucky_fishbone_ring",
    "name": "Lucky Fish-Bone Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784413165578,
    "rarity": "COMMON",
    "value": 390,
    "stats": {
      "luck": 5
    },
    "slot": "ring"
  },
  "dragon_key_reusable": {
    "id": "dragon_key_reusable",
    "name": "Master Dragon Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1784413496105,
    "rarity": "LEGENDARY",
    "value": 100000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "fire_essence": {
    "id": "fire_essence",
    "name": "Fire Essence",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784413761011,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null
  },
  "death_scythe": {
    "id": "death_scythe",
    "name": "Reaper Scythe",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784461760837,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "atk": 45,
      "mag": 20
    },
    "slot": "weapon",
    "source": "ELITE_COMBAT"
  },
  "infernal_greaves": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784462057243,
    "rarity": "MYTHIC",
    "value": 59000,
    "stats": {
      "def": 55,
      "spd": 25,
      "atk": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "maxDurability": 180,
    "durability": 180,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "veil_of_the_void": {
    "id": "veil_of_the_void",
    "name": "Veil of the Void",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784462361242,
    "rarity": "MYTHIC",
    "value": 52000,
    "stats": {
      "def": 50,
      "spd": 40,
      "crit": 20
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784472052636,
    "rarity": "UNCOMMON",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mantlet_of_chaos": {
    "id": "mantlet_of_chaos",
    "name": "Mantlet of Chaos",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784464508842,
    "rarity": "MYTHIC",
    "value": 54000,
    "stats": {
      "def": 60,
      "hp": 20,
      "luck": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "power_ring": {
    "id": "power_ring",
    "name": "Ring of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784465716137,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "atk": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "glinting_trout_ring": {
    "id": "glinting_trout_ring",
    "name": "Glinting Trout Ring",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784466107034,
    "rarity": "RARE",
    "value": 8200,
    "stats": {
      "luck": 20
    },
    "slot": "ring"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "name": "abyssal_detonator",
    "type": "ITEM",
    "quantity": 18,
    "acquiredAt": 1784574517822,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "mythic_enhancement_stone": {
    "id": "mythic_enhancement_stone",
    "name": "Mythic Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785193070521,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "gloves_of_the_ruined_kingdom": {
    "id": "gloves_of_the_ruined_kingdom",
    "name": "Light Gloves of the Ruined Kingdom of Might",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785193454744,
    "rarity": "MYTHIC",
    "value": 33000,
    "stats": {
      "mag": 30,
      "spd": 15,
      "luck": 12
    },
    "slot": "gloves",
    "source": "COMBAT",
    "baseStats": {
      "mag": 30,
      "spd": 15,
      "luck": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785193748039,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "dragon_seal_ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785195044601,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": {
      "atk": 10,
      "mag": 20
    },
    "slot": "ring",
    "source": "COMBAT",
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 24,
    "acquiredAt": 1785195607103,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 1,
    "acquiredAt": 1785195607634,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bloodsoaked_claws": {
    "id": "bloodsoaked_claws",
    "name": "Blood-Soaked Claws",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784303497077,
    "rarity": "COMMON",
    "value": 31000,
    "stats": {
      "atk": 40,
      "crit": 10
    },
    "slot": "gloves",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": [],
    "source": "ELITE_COMBAT"
  },
  "abyssal_crown": {
    "id": "abyssal_crown",
    "name": "Abyssal Crown",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785196840141,
    "rarity": "COMMON",
    "value": 1100000,
    "stats": null,
    "slot": null
  },
  "aegis_of_the_abyss": {
    "id": "aegis_of_the_abyss",
    "name": "Aegis of the Abyss",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784040676849,
    "rarity": "COMMON",
    "value": 80000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "amulet_of_the_broken_era": {
    "id": "amulet_of_the_broken_era",
    "name": "Amulet of the Broken Era",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785197417068,
    "rarity": "COMMON",
    "value": 36000,
    "stats": null,
    "slot": null
  },
  "void_step_sabatons": {
    "id": "void_step_sabatons",
    "name": "Void Step Sabatons",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784041129245,
    "rarity": "COMMON",
    "value": 56000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785196469874,
    "rarity": "COMMON",
    "value": 95000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "crown_of_the_abyssal_sovereign": {
    "id": "crown_of_the_abyssal_sovereign",
    "name": "Crown of the Abyssal Sovereign",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785223083702,
    "rarity": "MYTHIC",
    "value": 66000,
    "stats": {
      "def": 45,
      "mag": 60,
      "luck": 20
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "archmage_robes": {
    "id": "archmage_robes",
    "name": "Archmage Robes",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785234460797,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "def": 20,
      "mag": 80
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "mirrorwarp_cloak": {
    "id": "mirrorwarp_cloak",
    "name": "Mirror-Warp Cloak",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785235850771,
    "rarity": "MYTHIC",
    "value": 28000,
    "stats": {
      "def": 30,
      "spd": 25,
      "crit": 10
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "steel_sabre": {
    "id": "steel_sabre",
    "name": "Steel Sabre",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785312974048,
    "rarity": "RARE",
    "value": 16000,
    "stats": {
      "atk": 25,
      "spd": 5
    },
    "slot": "main_hand"
  },
  "lichskin_vestments": {
    "id": "lichskin_vestments",
    "name": "Lich-Skin Vestments of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785349482873,
    "rarity": "LEGENDARY",
    "value": 21000,
    "stats": {
      "def": 45,
      "hp": 80,
      "mag": 25
    },
    "slot": "armor",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 45,
      "hp": 80,
      "mag": 25
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 6,
    "acquiredAt": 1785359224788,
    "rarity": "UNCOMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "eelspike_gauntlets": {
    "id": "eelspike_gauntlets",
    "name": "Light Eel-Spike Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785440009722,
    "rarity": "MYTHIC",
    "value": 57000,
    "stats": {
      "atk": 35,
      "spd": 30,
      "crit": 18
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "atk": 35,
      "spd": 30,
      "crit": 18
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "boots_of_eternal_blood": {
    "id": "boots_of_eternal_blood",
    "name": "Boots of Eternal Blood",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785455670178,
    "rarity": "MYTHIC",
    "value": 32000,
    "stats": {
      "def": 30,
      "spd": 35,
      "hp": 100
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1785456015729,
    "rarity": "RARE",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "essence_mirror": {
    "id": "essence_mirror",
    "name": "Essence Mirror",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785456054667,
    "rarity": "LEGENDARY",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "talisman_of_eldritch_blood": {
    "id": "talisman_of_eldritch_blood",
    "name": "Light Talisman of Eldritch Blood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785456760481,
    "rarity": "MYTHIC",
    "value": 37000,
    "stats": {
      "hp": 150,
      "mag": 45,
      "luck": 10,
      "spd": 10
    },
    "slot": "amulet",
    "source": "COMBAT"
  },
  "legendary_chrono_ring": {
    "id": "legendary_chrono_ring",
    "name": "Legendary Chrono Ring of Might",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785540576593,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "spd": 15,
      "luck": 25,
      "crit": 10,
      "atk": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785540853476,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "ELDER_CHAOS"
  },
  "voidwalk_boots": {
    "id": "voidwalk_boots",
    "name": "Voidwalk Boots",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785658508591,
    "rarity": "MYTHIC",
    "value": 400000,
    "stats": {
      "spd": 60,
      "luck": 30
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "minor_potion": {
    "id": "minor_potion",
    "name": "Minor Health Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1785751023435,
    "rarity": "COMMON",
    "value": 280,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785766894234,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mirrorimage_shroud": {
    "id": "mirrorimage_shroud",
    "name": "Mirror-Image Shroud",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785767058690,
    "rarity": "MYTHIC",
    "value": 29000,
    "stats": {
      "def": 25,
      "spd": 35,
      "crit": 12
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "abyssal_gauntlets": {
    "id": "abyssal_gauntlets",
    "name": "Abyssal Gauntlets of Haste",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785767535501,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "atk": 80,
      "def": 60,
      "crit": 30,
      "spd": 15
    },
    "slot": "gloves",
    "source": "COMBAT"
  },
  "smoke_bomb": {
    "id": "smoke_bomb",
    "name": "Smoke Bomb",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1785856931554,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ascension_stone": {
    "id": "ascension_stone",
    "name": "Ascension Stone (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785857133550,
    "rarity": "EPIC",
    "value": 50000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "godshard": {
    "id": "godshard",
    "name": "Godshard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785858948314,
    "rarity": "MYTHIC",
    "value": 250000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "summon_egg_void_walker": {
    "id": "summon_egg_void_walker",
    "name": "Void Walker Egg",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785858948509,
    "rarity": "RARE",
    "value": 18000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "summon_egg_common": {
    "id": "summon_egg_common",
    "name": "Common Summon Egg",
    "type": "ITEM",
    "quantity": [
      1,
      2
    ],
    "acquiredAt": 1785858948705,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "signet_of_the_ancestors": {
    "id": "signet_of_the_ancestors",
    "name": "Signet of the Ancestors",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785197434870,
    "rarity": "COMMON",
    "value": 36000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "dragonfang_claymore": {
    "id": "dragonfang_claymore",
    "name": "Dragon-Fang Claymore of Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785658116482,
    "rarity": "MYTHIC",
    "value": 46000,
    "stats": {
      "atk": 85,
      "crit": 12,
      "luck": 25
    },
    "slot": "main_hand",
    "source": "REST",
    "maxDurability": 150,
    "durability": 150,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "wyrmscale_grips": {
    "id": "wyrmscale_grips",
    "name": "Wyrmscale Grips",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785942331083,
    "rarity": "MYTHIC",
    "value": 32000,
    "stats": {
      "atk": 35,
      "spd": 20,
      "crit": 8
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT"
  },
  "aegis_of_eternal_fire": {
    "id": "aegis_of_eternal_fire",
    "name": "Aegis of Eternal Fire",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785942600089,
    "rarity": "MYTHIC",
    "value": 81000,
    "stats": {
      "def": 125,
      "hp": 300,
      "atk": 15
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "void_kraken_cleaver": {
    "id": "void_kraken_cleaver",
    "name": "Void Kraken Cleaver",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785942664106,
    "rarity": "MYTHIC",
    "value": 92000,
    "stats": {
      "atk": 105,
      "mag": 20,
      "crit": 15
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "striders_of_the_dragon": {
    "id": "striders_of_the_dragon",
    "name": "Striders of the Dragon of Haste",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785944460187,
    "rarity": "MYTHIC",
    "value": 31000,
    "stats": {
      "def": 35,
      "spd": 30
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 35,
      "spd": 30
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "necklace_of_the_void_empress": {
    "id": "necklace_of_the_void_empress",
    "name": "Glowing Necklace of the Void Empress of Protection",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785945736759,
    "rarity": "MYTHIC",
    "value": 64000,
    "stats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "slot": "amulet",
    "source": "COMBAT",
    "baseStats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "common_fragment": {
    "id": "common_fragment",
    "name": "Common Summon Fragment",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1786117009378,
    "rarity": "COMMON",
    "value": 500,
    "stats": {},
    "slot": null
  },
  "touch_of_retribution": {
    "id": "touch_of_retribution",
    "name": "Sharp Touch of Retribution of Might",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786117506500,
    "rarity": "MYTHIC",
    "value": 56000,
    "stats": {
      "atk": 40,
      "def": 25,
      "crit": 12
    },
    "slot": "gloves",
    "source": "COMBAT",
    "baseStats": {
      "atk": 40,
      "def": 25,
      "crit": 12
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "cursed_mirror_buckler": {
    "id": "cursed_mirror_buckler",
    "name": "Sturdy Cursed Mirror Buckler of Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786118075220,
    "rarity": "EPIC",
    "value": 18000,
    "stats": {
      "def": 45,
      "luck": 10
    },
    "slot": "off_hand",
    "source": "COMBAT",
    "baseStats": {
      "def": 45,
      "luck": 10
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  }
}
```

---

### Yaga  `2349079790431@s.whatsapp.net`

- **userId**: 2349079790431@s.whatsapp.net
- **registered**: true
- **nickname**: Yaga
- **phoneHash**: 25a870ada0580fb66676402dcbf9c96ccfb3d78668deaedc2c5930485e69cf5a
- **wallet**: 204159914
- **bank**: 0
- **class**: WARLORD
- **adventurerRank**: S
- **spriteIndex**: 78
- **level**: 76
- **xp**: 574054585
- **hp**: 8455
- **maxHp**: 12944
- **currentHP**: 14527
- **questGold**: 0
- **questsCompleted**: 180
- **questsWon**: 179
- **questsFailed**: 9
- **pvpWins**: 4
- **pvpLosses**: 11
- **eventTokens**: 0
- **totalEarned**: 102227038
- **totalSpent**: 10148679
- **totalGambled**: 2630000
- **gamesPlayed**: 0
- **gamesWon**: 1
- **gamesLost**: 6
- **biggestWin**: 500000
- **biggestLoss**: 500000
- **bossesDefeated**: 179
- **dragonsKilled**: 281
- **itemsCrafted**: 16
- **itemsEquipped**: 33
- **undeadKills**: 2
- **kills**: 2077
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 45
- **progression_level**: 76
- **progression_xp**: 574054585
- **progression_gp**: 1042
- **progression_totalGP**: 1042
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Yaga
- **profile_nickname**: Yaga
- **profile_firstSeen**: "2026-07-13T20:53:48.535Z"
- **profile_lastSeen**: "2026-07-14T09:49:05.313Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-13T20:53:48.647Z
- **updatedAt**: 2026-08-07T22:46:54.455Z

**equipment**:
```json
{
  "main_hand": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234470778,
    "rarity": "COMMON",
    "value": 95000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "off_hand": {
    "id": "worldender_lance",
    "name": "World-Ender Lance",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234540395,
    "rarity": "COMMON",
    "value": 98000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "armor": {
    "id": "abyssal_carapace",
    "name": "Abyssal Carapace",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234568611,
    "rarity": "COMMON",
    "value": 78000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "crown_of_hellfire",
    "name": "Crown of Hellfire",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234599003,
    "rarity": "COMMON",
    "value": 65000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "boots": {
    "id": "infernal_greaves",
    "name": "Infernal Greaves",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234624808,
    "rarity": "COMMON",
    "value": 59000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "ring": {
    "id": "loop_of_forever",
    "name": "Loop of Forever",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234658437,
    "rarity": "COMMON",
    "value": 60000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "heart_of_the_cosmos",
    "name": "Heart of the Cosmos",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234687805,
    "rarity": "COMMON",
    "value": 62000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "cloak": {
    "id": "mantlet_of_chaos",
    "name": "Mantlet of Chaos",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234732954,
    "rarity": "COMMON",
    "value": 54000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "gloves": {
    "id": "abyssal_grasp",
    "name": "Abyssal Grasp",
    "type": "EQUIPMENT",
    "acquiredAt": 1784234750910,
    "rarity": "COMMON",
    "value": 54000,
    "stats": null,
    "slot": null,
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 62,
    "acquiredAt": 1784459912535,
    "rarity": "RARE",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 46,
    "acquiredAt": 1784459936518,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 106,
    "acquiredAt": 1784459935922,
    "rarity": "EPIC",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1784231683214,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 51,
    "acquiredAt": 1784419969491,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1784423623606,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784029240144,
    "rarity": "COMMON",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor",
    "source": "VOID_CORRUPTED",
    "maxDurability": 116,
    "durability": 102.8,
    "durabilityTraits": []
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 23,
    "acquiredAt": 1784424801794,
    "rarity": "MYTHIC",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1784422258713,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 10,
    "acquiredAt": 1784418674488,
    "rarity": "LEGENDARY",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": [],
    "source": "BOSS"
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784234470778,
    "rarity": "COMMON",
    "value": 95000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "scrappers_leather_helm": {
    "id": "scrappers_leather_helm",
    "name": "Scrapper's Leather Helm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784029918035,
    "rarity": "COMMON",
    "value": 550,
    "stats": {
      "def": 7
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT",
    "maxDurability": 96,
    "durability": 96,
    "durabilityTraits": []
  },
  "loop_of_forever": {
    "id": "loop_of_forever",
    "name": "Loop of Forever",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784234658437,
    "rarity": "COMMON",
    "value": 60000,
    "stats": null,
    "slot": null,
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": []
  },
  "dragon_fang_dagger": {
    "id": "dragon_fang_dagger",
    "name": "Dragon-Fang Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784029187044,
    "rarity": "COMMON",
    "value": 22000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 80,
    "durabilityTraits": []
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 119,
    "acquiredAt": 1784422865693,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 85,
    "acquiredAt": 1784423623087,
    "rarity": "LEGENDARY",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 68,
    "acquiredAt": 1784477890407,
    "rarity": "UNCOMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 18,
    "acquiredAt": 1784417177568,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1784301394876,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 14,
    "acquiredAt": 1784478588411,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784417178019,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1784419049696,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 17,
    "acquiredAt": 1784477876237,
    "rarity": "RARE",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT"
  },
  "mirroredged_rapier": {
    "id": "mirroredged_rapier",
    "name": "Mirror-Edged Rapier",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784302443682,
    "rarity": "LEGENDARY",
    "value": 43000,
    "stats": {
      "atk": 65,
      "spd": 30,
      "crit": 15
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 19,
    "acquiredAt": 1784478644709,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 17,
    "acquiredAt": 1784419930185,
    "rarity": "UNCOMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "reqLevel": 2
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 64,
    "acquiredAt": 1784477890839,
    "rarity": "UNCOMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 7,
    "acquiredAt": 1784331858844,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand",
    "source": "CORRUPTED_GUARDIAN"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 42,
    "acquiredAt": 1784477974514,
    "rarity": "EPIC",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 40,
    "acquiredAt": 1784423595885,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 12,
    "acquiredAt": 1784421789694,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 37,
    "acquiredAt": 1784424718486,
    "rarity": "RARE",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 94,
    "acquiredAt": 1784478442106,
    "rarity": "UNCOMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 92,
    "acquiredAt": 1784421194694,
    "rarity": "UNCOMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "arcane_wand": {
    "id": "arcane_wand",
    "name": "Arcane Wand",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784331062820,
    "rarity": "RARE",
    "value": 6000,
    "stats": {
      "mag": 18
    },
    "slot": "main_hand",
    "source": "ELEMENTAL_ARCHON"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 53,
    "acquiredAt": 1784420987184,
    "rarity": "LEGENDARY",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "worldender_lance": {
    "id": "worldender_lance",
    "name": "World-Ender Lance",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784234540395,
    "rarity": "COMMON",
    "value": 98000,
    "stats": null,
    "slot": null,
    "maxDurability": 80,
    "durability": 48.8,
    "durabilityTraits": []
  },
  "dragon_seal_ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1784029269435,
    "rarity": "COMMON",
    "value": 20000,
    "stats": {
      "atk": 10
    },
    "slot": "ring",
    "maxDurability": 64,
    "durability": 64,
    "durabilityTraits": [],
    "source": "ELITE_COMBAT"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 13,
    "acquiredAt": 1784337822192,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1784459815313,
    "rarity": "RARE",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 17,
    "acquiredAt": 1784391746978,
    "rarity": "EPIC",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "archmage_robes": {
    "id": "archmage_robes",
    "name": "Archmage Robes",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784338316455,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "def": 20,
      "mag": 80
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 16,
    "acquiredAt": 1784422490991,
    "rarity": "EPIC",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "golem_core_signet": {
    "id": "golem_core_signet",
    "name": "Golem Core Signet",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784338507447,
    "rarity": "EPIC",
    "value": 8500,
    "stats": {
      "def": 20,
      "hp": 40
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 18,
    "acquiredAt": 1784392639174,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "treads_of_the_forgotten_forest": {
    "id": "treads_of_the_forgotten_forest",
    "name": "Treads of the Forgotten Forest",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784340057048,
    "rarity": "LEGENDARY",
    "value": 15000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "cloak_of_dark_matter": {
    "id": "cloak_of_dark_matter",
    "name": "Cloak of Dark Matter",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784340472100,
    "rarity": "LEGENDARY",
    "value": 15000,
    "stats": {
      "def": 40,
      "mag": 10
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "obsidian_shield": {
    "id": "obsidian_shield",
    "name": "Obsidian Shield",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1784340852491,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "def": 60
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "warhammer": {
    "id": "warhammer",
    "name": "Paladin Warhammer",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784341561404,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "atk": 35,
      "def": 10
    },
    "slot": "weapon",
    "source": "COMBAT"
  },
  "dragon_key_reusable": {
    "id": "dragon_key_reusable",
    "name": "Master Dragon Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1784391222875,
    "rarity": "LEGENDARY",
    "value": 100000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784423098189,
    "rarity": "LEGENDARY",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 48,
    "acquiredAt": 1784407946587,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "PRIMORDIAL_CHAOS"
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784412336063,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "infected_fish": {
    "id": "infected_fish",
    "name": "\u2623\ufe0f Corrupted Eel",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784412369865,
    "rarity": "EPIC",
    "value": 4500,
    "stats": {},
    "slot": null
  },
  "mythic_fish": {
    "id": "mythic_fish",
    "name": "Void Kraken Tentacle",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784412394466,
    "rarity": "MYTHIC",
    "value": 15000,
    "stats": {},
    "slot": null
  },
  "pondbass_charm": {
    "id": "pondbass_charm",
    "name": "Pond-Bass Charm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784412452563,
    "rarity": "COMMON",
    "value": 450,
    "stats": {
      "hp": 15,
      "spd": 2
    },
    "slot": "amulet"
  },
  "common_fish": {
    "id": "common_fish",
    "name": "Small Bass",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784412558972,
    "rarity": "COMMON",
    "value": 150,
    "stats": {},
    "slot": null
  },
  "shocking_treads": {
    "id": "shocking_treads",
    "name": "Shocking Treads",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784418791489,
    "rarity": "LEGENDARY",
    "value": 15500,
    "stats": {
      "def": 25,
      "spd": 35,
      "crit": 5
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "veil_of_the_void": {
    "id": "veil_of_the_void",
    "name": "Veil of the Void",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784420155798,
    "rarity": "MYTHIC",
    "value": 52000,
    "stats": {
      "def": 50,
      "spd": 40,
      "crit": 20
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "sparkling_gem_band": {
    "id": "sparkling_gem_band",
    "name": "Sparkling Gem Band",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784422258196,
    "rarity": "EPIC",
    "value": 8000,
    "stats": {
      "mag": 10,
      "luck": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "volt_dagger": {
    "id": "volt_dagger",
    "name": "Volt Dagger",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784422324894,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "atk": 20,
      "spd": 25
    },
    "slot": "weapon",
    "source": "COMBAT"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 32,
    "acquiredAt": 1784423795188,
    "rarity": "UNCOMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragonfang_claymore": {
    "id": "dragonfang_claymore",
    "name": "Dragon-Fang Claymore",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784423526093,
    "rarity": "MYTHIC",
    "value": 46000,
    "stats": {
      "atk": 85,
      "crit": 12
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "dragon_scale_armor": {
    "id": "dragon_scale_armor",
    "name": "Dragon-Scale Plate",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784423526796,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "def": 85,
      "hp": 150
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "cloak_of_the_phantom": {
    "id": "cloak_of_the_phantom",
    "name": "Cloak of the Phantom of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785192948685,
    "rarity": "MYTHIC",
    "value": 30000,
    "stats": {
      "def": 30,
      "spd": 40,
      "mag": 20
    },
    "slot": "cloak",
    "source": "COMBAT"
  },
  "elder_chaos_essence": {
    "id": "elder_chaos_essence",
    "name": "Elder Chaos Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785193549923,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mythic_enhancement_stone": {
    "id": "mythic_enhancement_stone",
    "name": "Mythic Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785195118388,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "entropy_loop": {
    "id": "entropy_loop",
    "name": "Entropy Loop of Haste",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785195148316,
    "rarity": "MYTHIC",
    "value": 58000,
    "stats": {
      "mag": 20,
      "luck": 25,
      "crit": 22,
      "spd": 15
    },
    "slot": "ring",
    "source": "COMBAT"
  },
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785195359701,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "mirrorwarp_cloak": {
    "id": "mirrorwarp_cloak",
    "name": "Mirror-Warp Cloak",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785234464672,
    "rarity": "MYTHIC",
    "value": 28000,
    "stats": {
      "def": 30,
      "spd": 25,
      "crit": 10
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "wizard_hat": {
    "id": "wizard_hat",
    "name": "Sharp Wizard Hat",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785236699113,
    "rarity": "EPIC",
    "value": 100,
    "stats": {
      "mag": 15,
      "atk": 8
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "pulsing_heart_loop": {
    "id": "pulsing_heart_loop",
    "name": "Lucky Pulsing Heart Loop",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785496427689,
    "rarity": "LEGENDARY",
    "value": 18500,
    "stats": {
      "hp": 120,
      "crit": 8,
      "luck": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1785496532072,
    "rarity": "UNCOMMON",
    "value": 1000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "pendant_of_the_dragon_eye": {
    "id": "pendant_of_the_dragon_eye",
    "name": "Pendant of the Dragon Eye",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785498104395,
    "rarity": "MYTHIC",
    "value": 34000,
    "stats": {
      "atk": 30,
      "crit": 15
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT"
  },
  "iron_plate": {
    "id": "iron_plate",
    "name": "Iron Plate",
    "type": "EQUIPMENT",
    "quantity": 7,
    "acquiredAt": 1785498856334,
    "rarity": "UNCOMMON",
    "value": 4500,
    "stats": {
      "def": 15
    },
    "slot": "armor"
  },
  "rusty_dagger": {
    "id": "rusty_dagger",
    "name": "Rusted Dagger",
    "type": "EQUIPMENT",
    "quantity": 8,
    "acquiredAt": 1785498917076,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {
      "atk": 5
    },
    "slot": "main_hand"
  },
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 12,
    "acquiredAt": 1785499635679,
    "rarity": "RARE",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "weavers_cloak": {
    "id": "weavers_cloak",
    "name": "Weaver's Cloak",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785500010765,
    "rarity": "MYTHIC",
    "value": 15500,
    "stats": {
      "def": 25,
      "spd": 20,
      "mag": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "abyssal_treads": {
    "id": "abyssal_treads",
    "name": "Lucky Abyssal Treads",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785501656391,
    "rarity": "MYTHIC",
    "value": 58000,
    "stats": {
      "def": 35,
      "spd": 45,
      "luck": 15
    },
    "slot": "boots",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "def": 35,
      "spd": 45,
      "luck": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "signet_of_the_ancestors": {
    "id": "signet_of_the_ancestors",
    "name": "Signet of the Ancestors",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785502292786,
    "rarity": "MYTHIC",
    "value": 36000,
    "stats": {
      "atk": 20,
      "mag": 20,
      "luck": 12
    },
    "slot": "ring",
    "source": "ELITE_COMBAT"
  },
  "corrupted_eel_carapace": {
    "id": "corrupted_eel_carapace",
    "name": "Sharp Corrupted Eel Carapace",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785754336259,
    "rarity": "MYTHIC",
    "value": 22000,
    "stats": {
      "def": 50,
      "hp": 100,
      "spd": 15,
      "atk": 8
    },
    "slot": "armor",
    "source": "COMBAT"
  }
}
```

---

### 𝕷𝖆𝖕𝖎𝖘  `176429438373975@lid`

- **userId**: 176429438373975@lid
- **registered**: true
- **nickname**: 𝕷𝖆𝖕𝖎𝖘
- **phoneHash**: f2f95cbd2b754aa2f29daadd77a9489a6eabfa62f3cf3fa8f7082c7282fb1fb4
- **wallet**: 0
- **bank**: 8639995900
- **class**: LICH
- **adventurerRank**: S
- **spriteIndex**: 52
- **level**: 84
- **xp**: 2271729515
- **hp**: 
- **maxHp**: 
- **currentHP**: 22890
- **questGold**: 0
- **questsCompleted**: 5
- **questsWon**: 2
- **questsFailed**: 1
- **pvpWins**: 2
- **pvpLosses**: 1
- **eventTokens**: 1
- **totalEarned**: 11780508685
- **totalSpent**: 5275370370
- **totalGambled**: 2000000
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 4
- **biggestWin**: 0
- **biggestLoss**: 500000
- **bossesDefeated**: 6
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 10
- **undeadKills**: 
- **kills**: 143
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 20
- **progression_level**: 84
- **progression_xp**: 2271729515
- **progression_gp**: 110
- **progression_totalGP**: 110
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: S-F500
- **profile_whatsappName**: 𝔐𝔞𝔯𝔠𝔶
- **profile_nickname**: 𝕷𝖆𝖕𝖎𝖘
- **profile_firstSeen**: "2026-07-28T16:19:08.529Z"
- **profile_lastSeen**: "2026-07-28T16:19:19.865Z"
- **profile_messageCount**: 1
- **createdAt**: 2026-07-19T01:38:45.328Z
- **updatedAt**: 2026-08-08T17:13:33.089Z

**equipment**:
```json
{
  "main_hand": {
    "id": "hellfire_greatmaul",
    "name": "God-forged Hellfire Greatmaul",
    "type": "EQUIPMENT",
    "acquiredAt": 1785711540701,
    "rarity": "MYTHIC",
    "value": 96000,
    "stats": {
      "atk": 1380,
      "mag": 288,
      "crit": 115
    },
    "slot": "main_hand",
    "reqLevel": 50,
    "baseStats": {
      "atk": 120,
      "mag": 25,
      "crit": 10
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 150,
    "durability": 146.1,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "off_hand": {
    "id": "mirror_shield_of_tartarus",
    "name": "God-forged Mirror Shield of Tartarus",
    "type": "EQUIPMENT",
    "acquiredAt": 1785715278379,
    "rarity": "MYTHIC",
    "value": 84000,
    "stats": {
      "def": 1495,
      "hp": 4025,
      "crit": 173
    },
    "slot": "off_hand",
    "reqLevel": 50,
    "baseStats": {
      "def": 130,
      "hp": 350,
      "crit": 15
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 150,
    "durability": 145.3,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "armor": {
    "id": "null_aegis",
    "name": "God-forged Null Aegis",
    "type": "EQUIPMENT",
    "acquiredAt": 1785711927260,
    "rarity": "MYTHIC",
    "value": 360000,
    "stats": {
      "def": 1495,
      "hp": 1265,
      "luck": 173
    },
    "slot": "armor",
    "reqLevel": 70,
    "baseStats": {
      "def": 130,
      "hp": 110,
      "luck": 15
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 180,
    "durability": 179.1,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "helmet": {
    "id": "void_crown",
    "name": "God-forged Void Crown",
    "type": "EQUIPMENT",
    "acquiredAt": 1785716079490,
    "rarity": "MYTHIC",
    "value": 600000,
    "stats": {
      "mag": 1150,
      "def": 575,
      "luck": 345
    },
    "slot": "helmet",
    "reqLevel": 80,
    "baseStats": {
      "mag": 100,
      "def": 50,
      "luck": 30
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 180,
    "durability": 179.1,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "boots": {
    "id": "voidwalk_boots",
    "name": "God-forged Voidwalk Boots",
    "type": "EQUIPMENT",
    "acquiredAt": 1785711691342,
    "rarity": "MYTHIC",
    "value": 400000,
    "stats": {
      "spd": 690,
      "luck": 345
    },
    "slot": "boots",
    "reqLevel": 70,
    "baseStats": {
      "spd": 60,
      "luck": 30
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 180,
    "durability": 179.1,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "ring": {
    "id": "abyssal_ring",
    "name": "God-forged Abyssal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1785716591211,
    "rarity": "MYTHIC",
    "value": 400000,
    "stats": {
      "atk": 575,
      "mag": 575,
      "hp": 345
    },
    "slot": "ring",
    "reqLevel": 70,
    "baseStats": {
      "atk": 50,
      "mag": 50,
      "hp": 30
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "amulet": {
    "id": "necklace_of_the_void_empress",
    "name": "God-forged Necklace of the Void Empress",
    "type": "EQUIPMENT",
    "acquiredAt": 1785716369626,
    "rarity": "MYTHIC",
    "value": 64000,
    "stats": {
      "hp": 4600,
      "mag": 575,
      "crit": 138
    },
    "slot": "amulet",
    "reqLevel": 50,
    "baseStats": {
      "hp": 400,
      "mag": 50,
      "crit": 12
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 120,
    "durability": 120,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "cloak": {
    "id": "abyssal_cloak",
    "name": "God-forged Abyssal Cloak",
    "type": "EQUIPMENT",
    "acquiredAt": 1785715912407,
    "rarity": "MYTHIC",
    "value": 550000,
    "stats": {
      "def": 920,
      "hp": 1150,
      "spd": 460
    },
    "slot": "cloak",
    "reqLevel": 75,
    "baseStats": {
      "def": 80,
      "hp": 100,
      "spd": 40
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 180,
    "durability": 179.1,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  },
  "gloves": {
    "id": "abyssal_gauntlets",
    "name": "God-forged Abyssal Gauntlets",
    "type": "EQUIPMENT",
    "acquiredAt": 1785716249841,
    "rarity": "MYTHIC",
    "value": 500000,
    "stats": {
      "atk": 920,
      "def": 690,
      "crit": 345
    },
    "slot": "gloves",
    "reqLevel": 75,
    "baseStats": {
      "atk": 80,
      "def": 60,
      "crit": 30
    },
    "enhancementLevel": 30,
    "enhancementBonus": 10.499999999999995,
    "maxDurability": 180,
    "durability": 179.1,
    "durabilityTraits": [
      "MYTHIC_MATERIAL"
    ]
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "chaos_ore": {
    "id": "chaos_ore",
    "name": "Chaos Ore",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784425695307,
    "rarity": "MYTHIC",
    "value": 35000,
    "source": "COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1784538215911,
    "rarity": "MYTHIC",
    "value": 8000,
    "source": "ELITE_COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 12,
    "acquiredAt": 1784539107119,
    "rarity": "MYTHIC",
    "value": 1680,
    "source": "ELITE_COMBAT"
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784539676405,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 7,
    "acquiredAt": 1784539762719,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1785221767096,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1785221829150,
    "rarity": "RARE",
    "value": 1200,
    "source": "ELITE_COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1785221842086,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "CORRUPTED_GUARDIAN"
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785221842268,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand",
    "source": "CORRUPTED_GUARDIAN"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785221842450,
    "rarity": "EPIC",
    "value": 3000,
    "source": "BOSS"
  },
  "mythic_fragment": {
    "id": "mythic_fragment",
    "name": "Mythic Summon Fragment",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1785616185374,
    "rarity": "MYTHIC",
    "value": 200000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "summon_essence_t2": {
    "id": "summon_essence_t2",
    "name": "Summon Essence (T2)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785616832470,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "summon_essence_t3": {
    "id": "summon_essence_t3",
    "name": "Summon Essence (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785616848680,
    "rarity": "EPIC",
    "value": 60000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 9,
    "acquiredAt": 1785716615184,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": {},
    "source": "MAIN_SHOP"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785716744980,
    "rarity": "COMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785716753002,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785716766120,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785716783624,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785716800241,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1785774952329,
    "rarity": "MYTHIC",
    "value": 5000,
    "source": "COMBAT"
  },
  "void_titan_heart": {
    "id": "void_titan_heart",
    "name": "Void Titan Heart",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785774952978,
    "rarity": "MYTHIC",
    "value": 120000,
    "source": "COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785775024787,
    "rarity": "MYTHIC",
    "value": 800,
    "source": "ELITE_COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785775025459,
    "rarity": "MYTHIC",
    "value": 3000,
    "source": "ELITE_COMBAT"
  },
  "chaos_blade": {
    "id": "chaos_blade",
    "name": "Chaos Blade",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785775040565,
    "rarity": "MYTHIC",
    "value": 180000,
    "stats": {
      "atk": 95,
      "spd": 15,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785775187070,
    "rarity": "MYTHIC",
    "value": 2500,
    "source": "ELITE_COMBAT"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785775262584,
    "rarity": "MYTHIC",
    "value": 2500,
    "source": "ELITE_COMBAT"
  },
  "abyssal_detonator": {
    "id": "abyssal_detonator",
    "quantity": 99993,
    "acquiredAt": 1785775293938
  },
  "full_restore_elixir": {
    "id": "full_restore_elixir",
    "quantity": 9999999,
    "acquiredAt": 1785775935639
  },
  "hellfire_greatmaul": {
    "id": "hellfire_greatmaul",
    "name": "Hellfire Greatmaul",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785794670407,
    "rarity": "MYTHIC",
    "value": 96000,
    "stats": null,
    "slot": "main_hand",
    "reqLevel": 50
  }
}
```

---

### lavish  `166189682696262@lid`

- **userId**: 166189682696262@lid
- **registered**: true
- **nickname**: lavish
- **phoneHash**: 4a7e2da57cdac096dd8dc69dbbfa8b8409c34c8fe482831fb669386f76b4fa9c
- **wallet**: 213453
- **bank**: 0
- **class**: FIGHTER
- **adventurerRank**: F
- **spriteIndex**: 90
- **level**: 12
- **xp**: 7564
- **hp**: 
- **maxHp**: 
- **currentHP**: 487
- **questGold**: 0
- **questsCompleted**: 2
- **questsWon**: 2
- **questsFailed**: 1
- **pvpWins**: 0
- **pvpLosses**: 0
- **eventTokens**: 0
- **totalEarned**: 19420
- **totalSpent**: 20080
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 2
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 15
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 20
- **progression_level**: 12
- **progression_xp**: 7564
- **progression_gp**: 15
- **progression_totalGP**: 15
- **progression_statPoints**: 35
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Sammylvsh
- **profile_nickname**: lavish
- **profile_firstSeen**: "2026-07-20T13:46:57.159Z"
- **profile_lastSeen**: "2026-07-20T17:42:36.020Z"
- **profile_messageCount**: 3
- **createdAt**: 2026-07-20T13:46:57.161Z
- **updatedAt**: 2026-08-01T17:37:46.390Z

**equipment**:
```json
{
  "main_hand": null,
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "minor_potion": {
    "id": "minor_potion",
    "name": "Minor Health Potion",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1784569531360,
    "rarity": "COMMON",
    "value": 280,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1784570333023,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "dragon_key": {
    "id": "dragon_key",
    "name": "Dragon Hunter Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1784570381929,
    "rarity": "RARE",
    "value": 15000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1784572110928,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1784572141123,
    "rarity": "COMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 1,
    "acquiredAt": 1784572348221,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "CORRUPTED_GUARDIAN"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784572348426,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  }
}
```

---

### (Helios)  `2348160306992@s.whatsapp.net`

- **userId**: 2348160306992@s.whatsapp.net
- **registered**: true
- **nickname**: (Helios)
- **phoneHash**: 60aabd42f32aff9deb29324f185647626ad7905b80bd904029ba507d98b7eb8b
- **wallet**: 237920
- **bank**: 0
- **class**: APPRENTICE
- **adventurerRank**: F
- **spriteIndex**: 69
- **level**: 12
- **xp**: 7559
- **hp**: 
- **maxHp**: 
- **currentHP**: 465
- **questGold**: 0
- **questsCompleted**: 2
- **questsWon**: 2
- **questsFailed**: 1
- **pvpWins**: 0
- **pvpLosses**: 0
- **eventTokens**: 0
- **totalEarned**: 19420
- **totalSpent**: 1500
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 2
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 15
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 20
- **progression_level**: 12
- **progression_xp**: 7559
- **progression_gp**: 10
- **progression_totalGP**: 10
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: ...
- **profile_nickname**: (Helios)
- **profile_firstSeen**: "2026-07-20T17:23:10.763Z"
- **profile_lastSeen**: "2026-07-20T17:23:10.765Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-20T17:23:10.766Z
- **updatedAt**: 2026-08-01T18:35:00.144Z

**equipment**:
```json
{
  "main_hand": null,
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784569708423,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1784569851543,
    "rarity": "RARE",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1784570930623,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  }
}
```

---

### King  `2349016420495@s.whatsapp.net`

- **userId**: 2349016420495@s.whatsapp.net
- **registered**: true
- **nickname**: King
- **phoneHash**: b331d640e3b28e23fcb92e475d04677135dadd830d7f91ca93477b071251b560
- **wallet**: 29621052
- **bank**: 54450000
- **class**: DOOMSLAYER
- **adventurerRank**: B
- **spriteIndex**: 64
- **level**: 61
- **xp**: 45820767
- **hp**: 4490
- **maxHp**: 12110
- **currentHP**: 7604
- **questGold**: 0
- **questsCompleted**: 115
- **questsWon**: 83
- **questsFailed**: 27
- **pvpWins**: 3
- **pvpLosses**: 7
- **eventTokens**: 0
- **totalEarned**: 97726201
- **totalSpent**: 55415489
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 96
- **dragonsKilled**: 120
- **itemsCrafted**: 0
- **itemsEquipped**: 24
- **undeadKills**: 11
- **kills**: 1019
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 45
- **progression_level**: 61
- **progression_xp**: 45820767
- **progression_gp**: 539
- **progression_totalGP**: 539
- **progression_statPoints**: 10
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: King
- **profile_nickname**: King
- **profile_firstSeen**: "2026-07-20T17:39:44.964Z"
- **profile_lastSeen**: "2026-08-02T08:16:34.334Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-20T17:39:44.966Z
- **updatedAt**: 2026-08-07T16:09:39.758Z

**equipment**:
```json
{
  "main_hand": {
    "id": "infected_hive_needle",
    "name": "Infected Hive Needle",
    "type": "EQUIPMENT",
    "acquiredAt": 1785839805974,
    "rarity": "EPIC",
    "value": 23000,
    "stats": null,
    "slot": "main_hand",
    "reqLevel": 30,
    "maxDurability": 115,
    "durability": 0,
    "durabilityTraits": [],
    "warnedLow": true
  },
  "off_hand": {
    "id": "abyssal_shield",
    "name": "Abyssal Shield",
    "type": "EQUIPMENT",
    "acquiredAt": 1786038179235,
    "rarity": "LEGENDARY",
    "value": 120000,
    "stats": null,
    "slot": "off_hand",
    "reqLevel": 45,
    "maxDurability": 130,
    "durability": 48.6,
    "durabilityTraits": []
  },
  "armor": {
    "id": "titanium_fortified_carapace",
    "name": "Titanium Fortified Carapace",
    "type": "EQUIPMENT",
    "acquiredAt": 1786038526197,
    "rarity": "LEGENDARY",
    "value": 43000,
    "stats": null,
    "slot": "armor",
    "reqLevel": 40,
    "maxDurability": 156,
    "durability": 147.8,
    "durabilityTraits": []
  },
  "helmet": {
    "id": "helm_of_ancient_blood",
    "name": "Helm of Ancient Blood",
    "type": "EQUIPMENT",
    "acquiredAt": 1786038607231,
    "rarity": "LEGENDARY",
    "value": 34000,
    "stats": null,
    "slot": "helmet",
    "reqLevel": 40,
    "maxDurability": 156,
    "durability": 147.8,
    "durabilityTraits": []
  },
  "boots": {
    "id": "striders_of_the_titan",
    "name": "Striders of the Titan",
    "type": "EQUIPMENT",
    "acquiredAt": 1786038820305,
    "rarity": "LEGENDARY",
    "value": 32000,
    "stats": null,
    "slot": "boots",
    "reqLevel": 40,
    "maxDurability": 156,
    "durability": 147.8,
    "durabilityTraits": []
  },
  "ring": {
    "id": "dragon_seal_ring",
    "name": "Dragon Seal Ring",
    "type": "EQUIPMENT",
    "acquiredAt": 1785784707300,
    "rarity": "EPIC",
    "value": 20000,
    "stats": null,
    "slot": "ring",
    "reqLevel": 20,
    "maxDurability": 92,
    "durability": 92,
    "durabilityTraits": []
  },
  "amulet": {
    "id": "pendant_of_the_dragon_eye",
    "name": "Pendant of the Dragon Eye",
    "type": "EQUIPMENT",
    "acquiredAt": 1786038919872,
    "rarity": "LEGENDARY",
    "value": 34000,
    "stats": null,
    "slot": "amulet",
    "reqLevel": 40,
    "maxDurability": 104,
    "durability": 104,
    "durabilityTraits": []
  },
  "cloak": null,
  "gloves": {
    "id": "bloodsoaked_claws",
    "name": "Blood-Soaked Claws",
    "type": "EQUIPMENT",
    "acquiredAt": 1786038561283,
    "rarity": "LEGENDARY",
    "value": 31000,
    "stats": null,
    "slot": "gloves",
    "reqLevel": 40,
    "maxDurability": 156,
    "durability": 147.8,
    "durabilityTraits": []
  }
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "tough_leather": {
    "id": "tough_leather",
    "name": "Tough Leather",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1785660630567,
    "rarity": "UNCOMMON",
    "value": 400,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "minor_enhancement_stone": {
    "id": "minor_enhancement_stone",
    "name": "Minor Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785670119546,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "spider_silk": {
    "id": "spider_silk",
    "name": "Spider Silk",
    "type": "MATERIAL",
    "quantity": 21,
    "acquiredAt": 1785671820423,
    "rarity": "COMMON",
    "value": 80,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "ascension_stone": {
    "id": "ascension_stone",
    "name": "Ascension Stone (T3)",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785672337703,
    "rarity": "EPIC",
    "value": 50000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "bandage": {
    "id": "bandage",
    "name": "Bandage",
    "type": "MATERIAL",
    "quantity": 175,
    "acquiredAt": 1785672483398,
    "rarity": "COMMON",
    "value": 50,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1785672486662,
    "rarity": "LEGENDARY",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "major_potion": {
    "id": "major_potion",
    "name": "Major Health Potion",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1785673763130,
    "rarity": "RARE",
    "value": 1680,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "iron_shard": {
    "id": "iron_shard",
    "name": "Iron Shard",
    "type": "MATERIAL",
    "quantity": 28,
    "acquiredAt": 1785673875191,
    "rarity": "COMMON",
    "value": 100,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "hp_potion": {
    "id": "hp_potion",
    "name": "Health Potion (alt)",
    "type": "POTION",
    "quantity": 18,
    "acquiredAt": 1785674237383,
    "rarity": "UNCOMMON",
    "value": 700,
    "stats": null,
    "slot": null,
    "source": "CORRUPTED_GUARDIAN"
  },
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 56,
    "acquiredAt": 1785674237562,
    "rarity": "RARE",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "ghost_essence": {
    "id": "ghost_essence",
    "name": "Ghost Essence",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1785675009865,
    "rarity": "RARE",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 38,
    "acquiredAt": 1785675010070,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "healing_herb": {
    "id": "healing_herb",
    "name": "Sun-kissed Herb",
    "type": "MATERIAL",
    "quantity": 57,
    "acquiredAt": 1785702092969,
    "rarity": "COMMON",
    "value": 150,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 6,
    "acquiredAt": 1785702323337,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "fire_shard": {
    "id": "fire_shard",
    "name": "Fire Shard",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1785703465661,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "boss_essence": {
    "id": "boss_essence",
    "name": "Boss Essence",
    "type": "MATERIAL",
    "quantity": 27,
    "acquiredAt": 1785706198570,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "minor_hp_potion": {
    "id": "minor_hp_potion",
    "name": "Minor HP Potion",
    "type": "POTION",
    "quantity": 37,
    "acquiredAt": 1785706339896,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "leather_tunic": {
    "id": "leather_tunic",
    "name": "Leather Tunic",
    "type": "EQUIPMENT",
    "quantity": 16,
    "acquiredAt": 1785706503572,
    "rarity": "COMMON",
    "value": 1600,
    "stats": {
      "def": 8
    },
    "slot": "armor",
    "source": "INFECTED_COLOSSUS"
  },
  "gunpowder": {
    "id": "gunpowder",
    "name": "Volatile Gunpowder",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1785711456286,
    "rarity": "COMMON",
    "value": 200,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "mana_dew": {
    "id": "mana_dew",
    "name": "Mana Dew",
    "type": "MATERIAL",
    "quantity": 15,
    "acquiredAt": 1785733896239,
    "rarity": "RARE",
    "value": 800,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "void_kraken_harpoon": {
    "id": "void_kraken_harpoon",
    "name": "Void Kraken Harpoon",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785734700288,
    "rarity": "MYTHIC",
    "value": 95000,
    "stats": {
      "atk": 110,
      "mag": 30,
      "crit": 15
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT"
  },
  "mystic_thread": {
    "id": "mystic_thread",
    "name": "Mystic Thread",
    "type": "MATERIAL",
    "quantity": 39,
    "acquiredAt": 1785734767475,
    "rarity": "EPIC",
    "value": 3000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "lucky_charm": {
    "id": "lucky_charm",
    "name": "Lucky Charm",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785735280960,
    "rarity": "COMMON",
    "value": 1000,
    "stats": {
      "luck": 5
    },
    "slot": "amulet",
    "source": "QUEST_SHOP"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785738196264,
    "rarity": "LEGENDARY",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "elixir": {
    "id": "elixir",
    "name": "Full Restore Elixir",
    "type": "POTION",
    "quantity": 7,
    "acquiredAt": 1785740141544,
    "rarity": "EPIC",
    "value": 4200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "dragon_key_reusable": {
    "id": "dragon_key_reusable",
    "name": "Master Dragon Key",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1785740783298,
    "rarity": "LEGENDARY",
    "value": 100000,
    "stats": {},
    "slot": null,
    "source": "MAIN_SHOP"
  },
  "bronze_spear": {
    "id": "bronze_spear",
    "name": "Bronze Spear",
    "type": "EQUIPMENT",
    "quantity": 8,
    "acquiredAt": 1785740980484,
    "rarity": "UNCOMMON",
    "value": 1200,
    "stats": {
      "atk": 8
    },
    "slot": "main_hand",
    "source": "COMBAT",
    "reqLevel": 2
  },
  "chainmail": {
    "id": "chainmail",
    "name": "Chainmail",
    "type": "EQUIPMENT",
    "quantity": 7,
    "acquiredAt": 1785741504870,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {
      "def": 12
    },
    "slot": "armor",
    "source": "COMBAT",
    "reqLevel": 4,
    "maxDurability": 108,
    "durability": 50.4,
    "durabilityTraits": []
  },
  "ice_shard": {
    "id": "ice_shard",
    "name": "Ice Shard",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785741792262,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "chaos_cloak": {
    "id": "chaos_cloak",
    "name": "Sharp Chaos Cloak of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785745577197,
    "rarity": "LEGENDARY",
    "value": 160000,
    "stats": {
      "def": 80,
      "hp": 140,
      "spd": 25,
      "atk": 8,
      "mag": 20
    },
    "slot": "armor",
    "source": "ELITE_COMBAT"
  },
  "mega_potion": {
    "id": "mega_potion",
    "name": "Mega Potion",
    "type": "POTION",
    "quantity": 40,
    "acquiredAt": 1785746750244,
    "rarity": "RARE",
    "value": 1680,
    "stats": null,
    "slot": null,
    "source": "ELEMENTAL_ARCHON"
  },
  "rare_fish": {
    "id": "rare_fish",
    "name": "Rainbow Trout",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1785747173799,
    "rarity": "RARE",
    "value": 800,
    "stats": {},
    "slot": null
  },
  "iron_sword": {
    "id": "iron_sword",
    "name": "Iron Sword",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785734879850,
    "rarity": "UNCOMMON",
    "value": 5000,
    "stats": {
      "atk": 12
    },
    "slot": "main_hand",
    "reqLevel": 5,
    "maxDurability": 110,
    "durability": 78.9,
    "durabilityTraits": [],
    "source": "CORRUPTED_GUARDIAN"
  },
  "mana_crystal": {
    "id": "mana_crystal",
    "name": "Mana Crystal",
    "type": "MATERIAL",
    "quantity": 11,
    "acquiredAt": 1785747954431,
    "rarity": "RARE",
    "value": 1500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "legendary_enhancement_stone": {
    "id": "legendary_enhancement_stone",
    "name": "Legendary Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785748217580,
    "rarity": "LEGENDARY",
    "value": 20000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "necklace_of_the_void_empress": {
    "id": "necklace_of_the_void_empress",
    "name": "Necklace of the Void Empress",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785757707500,
    "rarity": "MYTHIC",
    "value": 64000,
    "stats": null,
    "slot": "amulet",
    "reqLevel": 50
  },
  "phylactery_aegis": {
    "id": "phylactery_aegis",
    "name": "Phylactery Aegis",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785757843173,
    "rarity": "EPIC",
    "value": 19000,
    "stats": {
      "def": 55,
      "hp": 100,
      "mag": 10
    },
    "slot": "off_hand",
    "reqLevel": 30,
    "maxDurability": 115,
    "durability": 87.8,
    "durabilityTraits": []
  },
  "tower_shield": {
    "id": "tower_shield",
    "name": "Tower Shield",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785757566241,
    "rarity": "EPIC",
    "value": 38000,
    "stats": null,
    "slot": "off_hand",
    "reqLevel": 22,
    "maxDurability": 115,
    "durability": 115,
    "durabilityTraits": []
  },
  "phoenix_down": {
    "id": "phoenix_down",
    "name": "Phoenix Down",
    "type": "POTION",
    "quantity": 2,
    "acquiredAt": 1785758170661,
    "rarity": "RARE",
    "value": 3500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "lightning_shard": {
    "id": "lightning_shard",
    "name": "Lightning Shard",
    "type": "MATERIAL",
    "quantity": 10,
    "acquiredAt": 1785758550273,
    "rarity": "UNCOMMON",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "sharp_whetstone": {
    "id": "sharp_whetstone",
    "name": "Sharp Whetstone",
    "type": "MATERIAL",
    "quantity": 4,
    "acquiredAt": 1785759478657,
    "rarity": "EPIC",
    "value": 300,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "gold_ore": {
    "id": "gold_ore",
    "name": "Gold Ore",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785760071163,
    "rarity": "LEGENDARY",
    "value": 900,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragonhide_boots": {
    "id": "dragonhide_boots",
    "name": "Dragonhide Boots",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785761314675,
    "rarity": "MYTHIC",
    "value": 85000,
    "stats": {
      "def": 25,
      "spd": 20,
      "hp": 30
    },
    "slot": "boots",
    "source": "ELITE_COMBAT"
  },
  "obsidian_chunk": {
    "id": "obsidian_chunk",
    "name": "Obsidian Chunk",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785761315329,
    "rarity": "MYTHIC",
    "value": 2200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "strength_brew": {
    "id": "strength_brew",
    "name": "Strength Brew",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1785762567528,
    "rarity": "EPIC",
    "value": 3200,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "ancient_wood": {
    "id": "ancient_wood",
    "name": "Ancient Wood",
    "type": "MATERIAL",
    "quantity": 13,
    "acquiredAt": 1785762787806,
    "rarity": "EPIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  },
  "voidstrand_robes": {
    "id": "voidstrand_robes",
    "name": "Light Void-Strand Robes of Fortune",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785783234966,
    "rarity": "MYTHIC",
    "value": 74000,
    "stats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "slot": "armor",
    "source": "COMBAT",
    "baseStats": {
      "def": 75,
      "hp": 200,
      "mag": 40,
      "spd": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "silver_ore": {
    "id": "silver_ore",
    "name": "Silver Ore",
    "type": "MATERIAL",
    "quantity": 8,
    "acquiredAt": 1785783296771,
    "rarity": "RARE",
    "value": 350,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "remedy": {
    "id": "remedy",
    "name": "Remedy",
    "type": "POTION",
    "quantity": 4,
    "acquiredAt": 1785783537609,
    "rarity": "RARE",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "vampiric_ring": {
    "id": "vampiric_ring",
    "name": "Vampiric Ring",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785703055645,
    "rarity": "EPIC",
    "value": 35000,
    "stats": {
      "atk": 15
    },
    "slot": "ring",
    "reqLevel": 25,
    "maxDurability": 92,
    "durability": 92,
    "durabilityTraits": [],
    "source": "COMBAT"
  },
  "elemental_wand": {
    "id": "elemental_wand",
    "name": "Glowing Prism Wand",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785835063975,
    "rarity": "LEGENDARY",
    "value": 42000,
    "stats": {
      "mag": 50
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "mag": 50
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "reinforced_plate": {
    "id": "reinforced_plate",
    "name": "Reinforced Plate",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785835336510,
    "rarity": "EPIC",
    "value": 24000,
    "stats": {
      "def": 45,
      "hp": 50
    },
    "slot": "armor",
    "source": "VOID_CORRUPTED"
  },
  "demon_hide": {
    "id": "demon_hide",
    "name": "Demon Hide",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785838538977,
    "rarity": "EPIC",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "assassin_hood": {
    "id": "assassin_hood",
    "name": "Shadow Hood",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785710510950,
    "rarity": "RARE",
    "value": 14000,
    "stats": null,
    "slot": "helmet",
    "reqLevel": 15,
    "maxDurability": 120,
    "durability": 81,
    "durabilityTraits": []
  },
  "mirror_shield_of_tartarus": {
    "id": "mirror_shield_of_tartarus",
    "name": "Glowing Mirror Shield of Tartarus",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785840730288,
    "rarity": "MYTHIC",
    "value": 84000,
    "stats": {
      "def": 130,
      "hp": 350,
      "crit": 15,
      "mag": 10
    },
    "slot": "off_hand",
    "source": "COMBAT"
  },
  "titan_gauntlets": {
    "id": "titan_gauntlets",
    "name": "Titan Gauntlets",
    "type": "EQUIPMENT",
    "quantity": 2,
    "acquiredAt": 1785840748016,
    "rarity": "LEGENDARY",
    "value": 40000,
    "stats": {
      "atk": 30,
      "def": 20
    },
    "slot": "gloves",
    "source": "ELITE_COMBAT",
    "reqLevel": 25,
    "maxDurability": 138,
    "durability": 117.6,
    "durabilityTraits": []
  },
  "wyrmtail_greatsword": {
    "id": "wyrmtail_greatsword",
    "name": "Glowing Wyrmtail Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785841175292,
    "rarity": "MYTHIC",
    "value": 45000,
    "stats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "slot": "main_hand",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "atk": 75,
      "mag": 20,
      "crit": 10
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "rare_enhancement_stone": {
    "id": "rare_enhancement_stone",
    "name": "Rare Enhancement Stone",
    "type": "MATERIAL",
    "quantity": 2,
    "acquiredAt": 1785855820073,
    "rarity": "EPIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dragon_helm": {
    "id": "dragon_helm",
    "name": "Dragon Helm",
    "type": "EQUIPMENT",
    "quantity": 3,
    "acquiredAt": 1785857389484,
    "rarity": "LEGENDARY",
    "value": 12000,
    "stats": {
      "def": 20,
      "hp": 10
    },
    "slot": "helmet",
    "source": "BOSS",
    "maxDurability": 138,
    "durability": 117.6,
    "durabilityTraits": []
  },
  "loop_of_forever": {
    "id": "loop_of_forever",
    "name": "Loop of Forever of Sages",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786009438063,
    "rarity": "MYTHIC",
    "value": 60000,
    "stats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "slot": "ring",
    "source": "ELITE_COMBAT",
    "baseStats": {
      "mag": 25,
      "luck": 30,
      "crit": 15
    },
    "enhancementLevel": 0,
    "enhancementBonus": 0
  },
  "greataxe": {
    "id": "greataxe",
    "name": "Berserker Axe",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785699335861,
    "rarity": "EPIC",
    "value": 38000,
    "stats": {
      "atk": 55,
      "def": -10
    },
    "slot": "main_hand",
    "reqLevel": 25,
    "maxDurability": 115,
    "durability": 101.4,
    "durabilityTraits": []
  },
  "travelers_leather_boots": {
    "id": "travelers_leather_boots",
    "name": "Traveler's Leather Boots",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786035804190,
    "rarity": "COMMON",
    "value": 600,
    "stats": {
      "def": 6,
      "spd": 6
    },
    "slot": "boots",
    "source": "COMBAT"
  },
  "voidstar_choker": {
    "id": "voidstar_choker",
    "name": "Void-Star Choker",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786036114105,
    "rarity": "MYTHIC",
    "value": 63000,
    "stats": {
      "hp": 200,
      "mag": 80,
      "crit": 10
    },
    "slot": "amulet",
    "source": "ELITE_COMBAT"
  },
  "glacier_guard": {
    "id": "glacier_guard",
    "name": "Glacier Guard",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785757115420,
    "rarity": "EPIC",
    "value": 45000,
    "stats": null,
    "slot": "armor",
    "reqLevel": 25,
    "maxDurability": 138,
    "durability": 117.6,
    "durabilityTraits": []
  },
  "aegis_of_the_abyss": {
    "id": "aegis_of_the_abyss",
    "name": "Aegis of the Abyss",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786038312115,
    "rarity": "MYTHIC",
    "value": 80000,
    "stats": null,
    "slot": "off_hand",
    "reqLevel": 50
  },
  "garb_of_the_elder_mage": {
    "id": "garb_of_the_elder_mage",
    "name": "Lucky Garb of the Elder Mage",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785735360982,
    "rarity": "LEGENDARY",
    "value": 41000,
    "stats": {
      "def": 50,
      "mag": 65,
      "spd": 15,
      "luck": 15
    },
    "slot": "armor",
    "source": "COMBAT",
    "maxDurability": 156,
    "durability": 156,
    "durabilityTraits": []
  },
  "wind_boots": {
    "id": "wind_boots",
    "name": "Wind Boots",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785839127944,
    "rarity": "EPIC",
    "value": 35000,
    "stats": null,
    "slot": "boots",
    "reqLevel": 25,
    "maxDurability": 138,
    "durability": 117.6,
    "durabilityTraits": []
  },
  "warrior_pendant": {
    "id": "warrior_pendant",
    "name": "Warrior Pendant",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1785757221955,
    "rarity": "EPIC",
    "value": 36000,
    "stats": null,
    "slot": "amulet",
    "reqLevel": 22,
    "maxDurability": 92,
    "durability": 92,
    "durabilityTraits": []
  },
  "rare_fragment": {
    "id": "rare_fragment",
    "name": "Rare Summon Fragment",
    "type": "MATERIAL",
    "quantity": 3,
    "acquiredAt": 1786108457476,
    "rarity": "RARE",
    "value": 3000,
    "stats": {},
    "slot": null
  },
  "demon_horn": {
    "id": "demon_horn",
    "name": "Demon Horn",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786110354561,
    "rarity": "EPIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "DEMON_LORD"
  },
  "ether": {
    "id": "ether",
    "name": "Ether",
    "type": "POTION",
    "quantity": 3,
    "acquiredAt": 1786111238150,
    "rarity": "RARE",
    "value": 1000,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "berserker_pill": {
    "id": "berserker_pill",
    "name": "berserker_pill",
    "type": "ITEM",
    "quantity": 1,
    "acquiredAt": 1786111249578,
    "rarity": "COMMON",
    "value": 10,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "greatsword": {
    "id": "greatsword",
    "name": "Greatsword",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786111707884,
    "rarity": "RARE",
    "value": 6000,
    "stats": {
      "atk": 15
    },
    "slot": "main_hand",
    "source": "COMBAT"
  }
}
```

---

### Midari  `235747080687774@lid`

- **userId**: 235747080687774@lid
- **registered**: true
- **nickname**: Midari
- **phoneHash**: 24459092c7e38d80947d8c1f5ed51351a358beedd15afb06eef0233a93fe6a5b
- **wallet**: 119475
- **bank**: 0
- **class**: APPRENTICE
- **adventurerRank**: F
- **spriteIndex**: 13
- **level**: 14
- **xp**: 11344
- **hp**: 
- **maxHp**: 
- **currentHP**: 1
- **questGold**: 0
- **questsCompleted**: 2
- **questsWon**: 2
- **questsFailed**: 2
- **pvpWins**: 0
- **pvpLosses**: 0
- **eventTokens**: 0
- **totalEarned**: 31875
- **totalSpent**: 2400
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 2
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 17
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 20
- **progression_level**: 14
- **progression_xp**: 11344
- **progression_gp**: 10
- **progression_totalGP**: 10
- **progression_statPoints**: 0
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: M♡I☆D°A•R♡I
- **profile_nickname**: Midari
- **profile_firstSeen**: "2026-07-31T11:12:26.047Z"
- **profile_lastSeen**: "2026-07-31T11:14:21.297Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-07-31T11:12:26.050Z
- **updatedAt**: 2026-08-05T20:35:28.896Z

**equipment**:
```json
{
  "main_hand": null,
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "mythril_ore": {
    "id": "mythril_ore",
    "name": "Mythril Ore",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1785751361828,
    "rarity": "RARE",
    "value": 1200,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  }
}
```

---

### Haleem  `191693517246534@lid`

- **userId**: 191693517246534@lid
- **registered**: true
- **nickname**: Haleem
- **phoneHash**: 528b505dc43fa5724c0fe270c0ee73a31707fb6b3a068617fe8ed8e625fea743
- **wallet**: 3032499
- **bank**: 996500
- **class**: APPRENTICE
- **adventurerRank**: F
- **spriteIndex**: 80
- **level**: 67
- **xp**: 127505156
- **hp**: 
- **maxHp**: 
- **currentHP**: 34
- **questGold**: 0
- **questsCompleted**: 1
- **questsWon**: 1
- **questsFailed**: 1
- **pvpWins**: 0
- **pvpLosses**: 0
- **eventTokens**: 0
- **totalEarned**: 3001499
- **totalSpent**: 22500
- **totalGambled**: 
- **gamesPlayed**: 0
- **gamesWon**: 0
- **gamesLost**: 
- **biggestWin**: 
- **biggestLoss**: 
- **bossesDefeated**: 1
- **dragonsKilled**: 
- **itemsCrafted**: 0
- **itemsEquipped**: 0
- **undeadKills**: 
- **kills**: 58
- **membership_tier**: BASIC
- **membership_expires**: 0
- **inventorySlots**: 20
- **progression_level**: 67
- **progression_xp**: 127505156
- **progression_gp**: 5
- **progression_totalGP**: 5
- **progression_statPoints**: 400
- **frozenAssets**: {"wallet":0,"bank":0,"reason":""}
- **summonSlots**: 5
- **activeSummonId**: 
- **profile_whatsappName**: Haleem
- **profile_nickname**: Haleem
- **profile_firstSeen**: "2026-08-08T19:04:27.018Z"
- **profile_lastSeen**: "2026-08-08T19:05:29.794Z"
- **profile_messageCount**: 2
- **createdAt**: 2026-08-08T19:04:27.021Z
- **updatedAt**: 2026-08-08T19:33:03.975Z

**equipment**:
```json
{
  "main_hand": null,
  "off_hand": null,
  "armor": null,
  "helmet": null,
  "boots": null,
  "ring": null,
  "amulet": null,
  "cloak": null,
  "gloves": null
}
```

**statBonuses**:
```json
{
  "hp": 0,
  "atk": 0,
  "def": 0,
  "mag": 0,
  "spd": 0,
  "luck": 0,
  "crit": 0
}
```

**professions**:
```json
{
  "mining": {
    "level": 1,
    "xp": 0
  },
  "crafting": {
    "level": 1,
    "xp": 0
  }
}
```

**inventory**:
```json
{
  "bomb": {
    "id": "bomb",
    "name": "Bomb",
    "type": "POTION",
    "quantity": 7,
    "acquiredAt": 1786216265788,
    "rarity": "UNCOMMON",
    "value": 2500,
    "stats": {},
    "slot": null,
    "source": "QUEST_SHOP"
  },
  "refined_steel": {
    "id": "refined_steel",
    "name": "Refined Steel",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786216336565,
    "rarity": "UNCOMMON",
    "value": 500,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "crown_of_the_dragon_lord": {
    "id": "crown_of_the_dragon_lord",
    "name": "Crown of the Dragon Lord",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786217065987,
    "rarity": "MYTHIC",
    "value": 35000,
    "stats": {
      "def": 45,
      "mag": 30,
      "luck": 12
    },
    "slot": "helmet",
    "source": "ELITE_COMBAT"
  },
  "rune_removal_scroll": {
    "id": "rune_removal_scroll",
    "name": "Rune Removal Scroll",
    "type": "CONSUMABLE",
    "quantity": 1,
    "acquiredAt": 1786217123173,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "legendary_shard": {
    "id": "legendary_shard",
    "name": "Legendary Shard",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1786217123354,
    "rarity": "MYTHIC",
    "value": 8000,
    "stats": null,
    "slot": null,
    "source": "COMBAT"
  },
  "cloak_of_shifting_realities": {
    "id": "cloak_of_shifting_realities",
    "name": "Cloak of Shifting Realities",
    "type": "EQUIPMENT",
    "quantity": 1,
    "acquiredAt": 1786217247885,
    "rarity": "MYTHIC",
    "value": 55000,
    "stats": {
      "def": 45,
      "spd": 35,
      "luck": 15
    },
    "slot": "cloak",
    "source": "ELITE_COMBAT"
  },
  "dragon_blood": {
    "id": "dragon_blood",
    "name": "Dragon Blood",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786217278112,
    "rarity": "MYTHIC",
    "value": 5000,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "dark_matter": {
    "id": "dark_matter",
    "name": "Dark Matter",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786217369286,
    "rarity": "MYTHIC",
    "value": 2500,
    "stats": null,
    "slot": null,
    "source": "ELITE_COMBAT"
  },
  "void_essence": {
    "id": "void_essence",
    "name": "Void Essence",
    "type": "MATERIAL",
    "quantity": 5,
    "acquiredAt": 1786217568490,
    "rarity": "MYTHIC",
    "value": 25000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "godshard": {
    "id": "godshard",
    "name": "Godshard",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786217569437,
    "rarity": "MYTHIC",
    "value": 250000,
    "stats": null,
    "slot": null,
    "source": "ABYSSAL_GOD"
  },
  "infernal_crown": {
    "id": "infernal_crown",
    "name": "Infernal Crown",
    "type": "MATERIAL",
    "quantity": 1,
    "acquiredAt": 1786217570688,
    "rarity": "MYTHIC",
    "value": 50000,
    "stats": null,
    "slot": null,
    "source": "BOSS"
  }
}
```

---




---


## 8. Appendix — Original Audit Request & Team Chat Context


### 8.1 Original request that kicked off the combat audit


```text
Pull the repo: "github.com/brainmell/whatsapp-bot", specifically the fix/audit branch, NOT the main branch.
Read through the docs and thoroughly examine the entire codebase. Note that the docs are not fully up to date, so don't rely on them alone. You need to inspect the actual implementation and figure out how everything works.
Your focus is everything related to the combat system: players, classes, enemies, skills, stats, progression, equipment, status effects, damage calculations, defense, attack, scaling, and anything else that directly or indirectly affects combat.
I want you to compare all player classes, enemies, and general combat mechanics, and document how everything interacts. Break down all the math happening under the hood—damage formulas, attack/defense calculations, stat scaling, multipliers, reductions, HP calculations, skill formulas, progression scaling, RNG, and anything else that affects combat outcomes.
Basically, I want a comprehensive combat-system audit. Cover every system and subsystem that has any meaningful connection to combat, including interactions that aren't immediately obvious from the docs.
After that:

Rate the current balance and balancing mechanisms out of 10, with explanations.
Identify major balance problems, exploits, dead mechanics, overpowered/underpowered elements, and scaling issues.
Look at older, well-balanced games for inspiration. Search online for games with strong combat balancing, preferably older games and open-source projects where possible.
Look for useful books, papers, developer talks, or other resources on game/combat balance.
Use those references to propose redesigns and balancing drafts for this game's combat system.
Don't just suggest changes—explain why each change would improve the balance and how it would affect the existing systems.
The end goal is to understand the combat system from top to bottom, document exactly how it currently works, identify what's wrong with the balance, and then develop a few solid redesign directions based on proven balancing principles and examples from other games.
Here are some calculations and player chat logs to help you understand the current system and put the code and mechanics into context. Use them alongside the codebase when analyzing the combat system.
```


### 8.2 WhatsApp team chat excerpt used as context (referenced throughout §1)


```text
Mellow: I sent it to omniverse for this dude to join and she clicked [08/08, 1:43 pm] Too Much: Sha add my t4s I'll probably tweak some shit [08/08, 1:43 pm] 🫩: .jk [08/08, 1:44 pm] 🫩: Bet [08/08, 1:44 pm] Too Much: I see [08/08, 1:44 pm] Mellow: Tell him first right here before y
```
