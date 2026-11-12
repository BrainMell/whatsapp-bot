# Enemy balance v2 (dungeon enemies)

**Problem (owner report, Nov 2026):** from C-rank up, regular mobs were HP sponges that "nibbled" (~0.2–0.4% of a player's HP per hit at A-rank, e.g. 19 dmg vs ~8000 HP) while HP was in the 10k+ range; bosses were either harmless (boss ATK was *lower* than the A-rank mob ATK scaled by level) or brutal HP walls (SSS boss 3.4M HP). Cause: player HP/DEF grow superlinearly (growth doubles every 15 levels, DR up to 65%) while enemy ATK grew ~linearly.

**Fix:** `core/rpg/systems/combat/enemyBalance.js` anchors enemy ATK/HP to a *reference adventurer* of the party's level (class-averaged growth + typical gear; calibrated to a live L50 A-rank player at ~8000 HP).
- Hit strength is **derived from per-fight targets**, not a flat multiplier: a regular fight costs the reference player ~12% max HP, an elite ~18%, a boss fight ~90% over the whole fight, with boss basic hits capped at 12–20% so a x4.5 skill is a spike, not a one-shot. Long dungeons shave the per-fight number so a whole run stays survivable.
- Enemy HP is **trimmed only** (D-rank up) so a regular mob dies in ~2 reference actions, a boss in ~10. Hit strength is re-derived from the fight length that HP actually gives.
- ATK/MAG are **never lowered** below the legacy value.
- **F and E ranks are untouched** (hand-tuned reference).
- Party size: enemy HP +45% per extra member (was +20%); per-player danger is kept roughly constant but parties are slightly kinder.
- Rank floor level: D=15, C=25, B=35, A=45, S=60, SS=75, SSS=85 — a low-level player carried into a high rank still meets rank-appropriate enemies.

**Kill switch:** `ENEMY_BALANCE_V2=0` (restart) restores the exact legacy scaling.
**Tune:** constants at the top of `enemyBalance.js` (`LOSS_TRASH`, `LOSS_ELITE`, `LOSS_BOSS`, `*_ACTIONS`, `BOSS_HIT_CAP`, `RANK_RAMP`). Re-check with:
`node scripts/sim_enemy_balance.js --runs 150 --party 1|3|5 [--gear 0.6]` (Monte-Carlo, prints legacy vs v2 per rank for tank/balanced/glass builds; no healing between fights).

**Not changed / known:** boss phase mechanics in `bossMechanics.js` still use small flat damage numbers (30–200) that are irrelevant at high rank; Abyss/Guild War use separate scaling; the sim's reference player has no heals/shields/dodge, so real players should land a bit better than the sim. **Not verified on the live boxes.**
