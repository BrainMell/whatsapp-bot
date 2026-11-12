# Enemy balance v2 (dungeon enemies)

**Problem (owner report, Nov 2026):** from C-rank up, regular mobs were HP sponges that "nibbled" (~0.2–0.4% of a player's HP per hit at A-rank, e.g. 19 dmg vs ~8000 HP) while HP was in the 10k+ range; bosses were either harmless (boss ATK was *lower* than the A-rank mob ATK scaled by level) or brutal HP walls (SSS boss 3.4M HP). Cause: player HP/DEF grow superlinearly (growth doubles every 15 levels, DR up to 65%) while enemy ATK grew ~linearly.

**Fix:** `core/rpg/systems/combat/enemyBalance.js` anchors enemy ATK/HP to a *reference adventurer* of the party's level (class-averaged growth + typical gear; calibrated to a live L50 A-rank player at ~8000 HP). From D-rank up (F/E untouched):
- **Per-fight targets** (fraction of reference max HP over the fight): regular fight ~20%, elite fight ~32%, boss fight ~145% — so a run needs potions/rests and bosses are real spikes. Per-hit damage is *derived* from these and the number of mobs/fight length at each rank; boss basic hits are capped (14% + 2%/extra player) so a x4.5 skill never one-shots a reference player.
- **HP is set from the reference player's damage output**: mob ~1 action to kill, elite ~1.8, boss ~6. Sponges are gone (A-rank run was ~127 rounds, now ~29) and soft D/C mobs get a little body.
- **Elites** are now their own tier (previously most `ELITE_COMBAT` enemies were scaled like commons).
- **Party size:** enemy HP +70% per extra member, danger per player roughly constant (parties slightly kinder).
- **Toughness blend:** enemy ATK x sqrt(party avg maxHP / reference, clamped 0.6–1.5), so squishy builds aren't hit like average ones and tanks aren't coasting.
- **Rank floor level:** D15 C25 B35 A45 S60 SS75 SSS85 — a low-level player carried into a high rank still meets rank-appropriate enemies. Small per-rank ramp (+3%/rank).

**Full-dungeon sim results** (`scripts/sim_dungeon_runs.js`, balanced reference build, solo, standard potion kit, 300 runs; potion drunk at <35% HP costs that round):

| Rank | wipe | walkover (never <50% HP) | tense (20–50%) | nail-biter (<20%) | total rounds |
|---|---|---|---|---|---|
| D | 3% | 0% | 75% | 22% | 26 |
| C | 5% | 3% | 67% | 25% | 24 |
| B | 1% | 2% | 81% | 16% | 27 |
| A | 2% | 0% | 80% | 18% | 29 |
| S | 12% | 0% | 50% | 38% | 32 |
| SS | 12% | 0% | 43% | 45% | 35 |
| SSS | 20% | 0% | 36% | 44% | 40 |

Legacy for comparison: D/C were 100% walkovers, B/A took 62/127 rounds of sponge-nibbling, S/SS/SSS were unwinnable (60-round cap, mobs with 70k+ HP). Parties of 3–5: 0–9% wipes, 30–60% nail-biters, boss ~6 rounds. Tank builds are safe through A; glass-cannon solo builds are hard (about 40% clear at C–A) — evasion/crit are not modelled. With NO potions a balanced solo run wipes ~70% at D–A: potions/rests are part of the intended loop.

**Kill switch:** `ENEMY_BALANCE_V2=0` (restart) restores the exact legacy scaling.
**Tune:** constants at the top of `enemyBalance.js` (`LOSS_TRASH`, `LOSS_ELITE`, `LOSS_BOSS`, `*_ACTIONS`, `BOSS_HIT_CAP`, `RANK_RAMP`). Re-check with:
`node scripts/sim_dungeon_runs.js --runs 300 [--party 3] [--build tank|glass] [--kit 0|1|2] [--legacy] [--T KEY=val,...]` (full-dungeon Monte-Carlo with potions/rests; `--T` overrides constants for quick tuning) and `scripts/sim_enemy_balance.js` (per-fight attrition, no healing).

**Not changed / known:** boss phase mechanics in `bossMechanics.js` still use small flat damage numbers (30–200) that are irrelevant at high rank; Abyss/Guild War use separate scaling; the sim's reference player has no heals/shields/dodge, so real players should land a bit better than the sim. **Not verified on the live boxes.**

## Pass 3 — "enemies do no damage" bug (owner log 2026-11-12)
An A-rank solo run showed 17 minutes with the player at full HP. Root cause: regular/elite enemies had no `level`, so `evaluateAction()` only unlocked level-1 skills — Kraken Spawn (COLOSSUS) had only Iron Rebuke (a reflect buff) and Abyssal Horror (SPELLBREAKER) only Silence/Counterspell. Plus the AI re-cast Silence on an already-silenced target and re-cast Iron Rebuke every turn (it only looked in `statusEffects`, the buff lives in `buffs`).
Fixes: enemies get `level = min(20, party level)` so full kits unlock; `_hasFx()` checks statusEffects+buffs+debuffs; anti-stall wrapper (after any non-damaging skill the enemy must deal damage for 2 turns). `SKILL_MOB` re-calibrated 1.3→1.9 because mobs now actually use their big skills (sim distribution unchanged). Not verified on the live boxes.
