// QA: owner 2026-10-12 — MIRROR + WANDERER removed from the ABYSS monster
// pool. Verifies across a full floor/boss sweep that:
//   1. rollAbyssVariant NEVER returns MIRROR or WANDERER again
//   2. boss floors (any depth) never roll a variant (was MIRROR 31+)
//   3. mid floors 31-49 fall through to the regular pool (was WANDERER-only)
//   4. survivor shares unchanged: OTHER BANNER ~10% of deep floors (50-89),
//      TIMELINE DRIFTER ~10% + OTHER BANNER ~7.5% of 90+ floors
//   5. ruins/global WANDERER swap (maybeSwapWanderer) still functional
const path = require('path');
const R = path.join(__dirname, '..', 'core', 'rpg');
const ev = require(path.join(R, 'enemyVariants'));

let fail = 0;
function check(name, ok, detail) {
    console.log(`${ok ? 'OK  ' : 'FAIL'} - ${name}${detail ? `: ${detail}` : ''}`);
    if (!ok) fail++;
}

// ─── 1+2+3: full sweep, zero MIRROR / WANDERER ──────────────────────────────
const N = 400; // iterations per (floor, boss) cell
const counts = { MIRROR: 0, WANDERER: 0, OTHER_BANNER: 0, TIMELINE_DRIFTER: 0, null: 0 };
const byBand = {
    early: { rolls: 0, variants: 0 },   // 1-30
    mid: { rolls: 0, variants: 0 },     // 31-49
    deep: { rolls: 0, banner: 0 },      // 50-89
    abyssal: { rolls: 0, banner: 0, drifter: 0 }, // 90+
};
let bossVariants = 0, bossRolls = 0;

for (let f = 1; f <= 99; f++) {
    for (const isBoss of [false, true]) {
        for (let i = 0; i < N; i++) {
            const v = ev.rollAbyssVariant(f, isBoss, 'FIGHTER');
            const kind = v ? v.variantKind : 'null';
            if (kind === 'MIRROR' || kind === 'WANDERER') counts[kind]++;
            if (isBoss) { bossRolls++; if (v) bossVariants++; continue; }
            if (f <= 30) { byBand.early.rolls++; if (v) byBand.early.variants++; }
            else if (f <= 49) { byBand.mid.rolls++; if (v) byBand.mid.variants++; }
            else if (f <= 89) { byBand.deep.rolls++; if (v && v.variantKind === 'OTHER_BANNER') byBand.deep.banner++; }
            else { byBand.abyssal.rolls++; if (v && v.variantKind === 'OTHER_BANNER') byBand.abyssal.banner++; if (v && v.variantKind === 'TIMELINE_DRIFTER') byBand.abyssal.drifter++; }
        }
    }
}

check('no MIRROR spawns in abyss', counts.MIRROR === 0, `${counts.MIRROR} in ${99 * 2 * N} rolls`);
check('no WANDERER spawns in abyss', counts.WANDERER === 0, `${counts.WANDERER} in ${99 * 2 * N} rolls`);
check('boss floors: no variants at any depth', bossVariants === 0, `${bossVariants}/${bossRolls}`);
check('floors 1-30: creatures only', byBand.early.variants === 0, `${byBand.early.variants}/${byBand.early.rolls}`);
check('floors 31-49: fall through to regular pool', byBand.mid.variants === 0, `${byBand.mid.variants}/${byBand.mid.rolls}`);

// ─── 4: survivor share windows (binomial, generous ±) ───────────────────────
const pct = (x, n) => (100 * x / Math.max(1, n)).toFixed(2) + '%';
const deepBanner = byBand.deep.banner / byBand.deep.rolls;
const abDrifter = byBand.abyssal.drifter / byBand.abyssal.rolls;
const abBanner = byBand.abyssal.banner / byBand.abyssal.rolls;
check('deep 50-89: OTHER BANNER share ~10% (0.20 x 0.50)', deepBanner > 0.08 && deepBanner < 0.12, pct(byBand.deep.banner, byBand.deep.rolls));
check('90+: TIMELINE DRIFTER share ~10% (0.25 x 0.40)', abDrifter > 0.08 && abDrifter < 0.12, pct(byBand.abyssal.drifter, byBand.abyssal.rolls));
check('90+: OTHER BANNER share ~7.5% (0.25 x 0.60 x 0.50)', abBanner > 0.055 && abBanner < 0.095, pct(byBand.abyssal.banner, byBand.abyssal.rolls));

// ─── 5: ruins/global WANDERER swap untouched ────────────────────────────────
let swapped = 0, tries = 200;
for (let i = 0; i < tries; i++) {
    const host = { name: 'Slime', isBoss: false, isWildSummon: false, enemyIndex: 0 };
    ev.maybeSwapWanderer([host], 'FIGHTER', { chance: 1 });
    if (/^(WANDERER|OTHER BANNER) /.test(host.name)) swapped++;
}
check('ruins/global WANDERER swap still works', swapped === tries, `${swapped}/${tries} forced swaps`);

// ─── buildVariantEnemy remains callable for QA/manual renders ───────────────
const m = ev.buildVariantEnemy('MIRROR', { floor: 40, isBoss: true, playerClassId: 'FIGHTER' });
const w = ev.buildVariantEnemy('WANDERER', { floor: 38, playerClassId: 'FIGHTER' });
check('buildVariantEnemy intact for QA renders', !!m && !!w && !!m.spriteIndex && !!w.spriteIndex, `MIRROR=${m.name}, WANDERER=${w.name}`);

console.log(fail === 0 ? '\nPOOL REMOVAL QA: ALL GREEN' : `\nPOOL REMOVAL QA: ${fail} FAILURES`);
process.exit(fail === 0 ? 0 : 1);
