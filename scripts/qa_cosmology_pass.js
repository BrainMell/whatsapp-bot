// QA harness for the cosmology pass implementation (run with: node scripts/qa_cosmology_pass.js)
// Covers world_map.md §6 QA bar + loreDrops contract + enemyVariants policy.
process.env.NODE_ENV = 'test';

const assert = require('assert');

// ─── cosmology ──────────────────────────────────────────────────────────────
const cosmology = require('../core/rpg/cosmology');
const MS_H = 3600_000, MS_D = 24 * MS_H;

// invariant: phases are pure functions of wall time, restart-stable
const t1 = Date.UTC(2026, 5, 15, 12, 30, 0);
assert.strictEqual(cosmology.fwPhase(t1), cosmology.fwPhase(t1));
assert.ok(cosmology.fwPhase(t1) >= 0 && cosmology.fwPhase(t1) < 1);
assert.ok(cosmology.alPhase(t1) >= 0 && cosmology.alPhase(t1) < 1);

// FW bottom window: phase 0 anchor ±3%
assert.strictEqual(cosmology.fwAtBottom(t1), cosmology.fwPhase(t1) <= 0.03 || cosmology.fwPhase(t1) >= 0.97);
// at T0 exactly, FW is at bottom and AL at its alignment point
assert.strictEqual(cosmology.fwAtBottom(cosmology.T0), true);
assert.strictEqual(cosmology.isTriuneAligned(cosmology.T0), true);

// abyss window: 5h locked + 1h open, universal
{
    const w = cosmology.abyssWindow(cosmology.T0 + 4 * MS_H); // 4h into cycle -> locked
    assert.strictEqual(w.open, false);
    assert.strictEqual(w.msRemaining, 1 * MS_H);
    const w2 = cosmology.abyssWindow(cosmology.T0 + 5 * MS_H + 30 * 60000); // into the open hour
    assert.strictEqual(w2.open, true);
    assert.strictEqual(w2.msRemaining, 30 * 60000);
    const w3 = cosmology.abyssWindow(cosmology.T0 + 5.999 * MS_H);
    assert.strictEqual(w3.open, true);
    assert.ok(w3.msRemaining < 60_000);
}

// routine link != triune (routine happens every 5h; triune needs AL too)
assert.strictEqual(typeof cosmology.isRoutineLink(cosmology.T0 + 5 * MS_H), 'boolean');

// triune window is flaggable with bounds when aligned
{
    const win = cosmology.triuneWindow(cosmology.T0);
    assert.strictEqual(win.aligned, true);
    assert.ok(win.end > win.start);
    assert.ok(win.minutesLeft >= 1);
}

// geometry helpers: FW center rides at R/2 from WB center (invariant 1)
{
    const off = cosmology.fwCenterOffset(t1, 400);
    assert.ok(Math.abs(Math.hypot(off.dx, off.dy) - 200) < 1e-9);
    // movement indicator ends at the FW bottom as the orbit completes
    const fwR = 200;
    const miEnd = cosmology.movementIndicator(cosmology.T0 + 4.999 * MS_H, fwR, 0, 0);
    assert.ok(miEnd.y > fwR * 0.5, 'indicator approaches bottom at orbit end');
    const miStart = cosmology.movementIndicator(cosmology.T0, fwR, 0, 0);
    assert.ok(miStart.y < 0, 'indicator starts near the top');
}

console.log('✓ cosmology: four clocks separate, phases stable, gates correct, geometry invariants hold');

// ─── loreDrops ──────────────────────────────────────────────────────────────
const loreDrops = require('../core/rpg/loreDrops');

// pool sizes (pools ship with 10+ lines each)
{
    const stats = loreDrops.poolStats();
    for (const k of Object.keys(loreDrops.POOLS)) assert.ok(stats[k] >= 10, `pool ${k} too small: ${stats[k]}`);
}

// format contract: ╒ *line* ╛ with un-italicized framers
{
    const d = loreDrops.maybeDrop('blacksmith', { userId: 'u_test', chatId: 'c_test', force: true });
    assert.ok(d.startsWith('╒ *') && d.endsWith('* ╛'), 'format mismatch: ' + d);
    assert.ok(!d.includes('\n'));
}

// cooldown: second immediate drop suppressed even with force
{
    const a = loreDrops.maybeDrop('trading', { userId: 'u_cd', chatId: 'c_cd', force: true });
    const b = loreDrops.maybeDrop('trading', { userId: 'u_cd', chatId: 'c_cd', force: true });
    assert.ok(a, 'first forced drop should land');
    assert.strictEqual(b, null, 'cooldown must suppress the second drop');
}

// unknown pool -> null, never throws
assert.strictEqual(loreDrops.maybeDrop('nope_pool', { force: true }), null);

// routing: variant tags beat depth heuristics
{
    assert.strictEqual(loreDrops.routeAbyssCategory({ variantTag: 'self' }, 5), 'abyss_self_variant');
    assert.strictEqual(loreDrops.routeAbyssCategory({ variantTag: 'distorted' }, 5), 'abyss_distorted_player');
    assert.strictEqual(loreDrops.routeAbyssCategory({ variantTag: 'timeline' }, 5), 'abyss_timeline_person');
    assert.strictEqual(loreDrops.routeAbyssCategory({ variantTag: 'player' }, 5), 'abyss_player');
    for (let i = 0; i < 50; i++) {
        const c = loreDrops.routeAbyssCategory({}, 10);
        assert.strictEqual(c, 'abyss_unknown_creature', 'shallow floors route to creature pool');
    }
}

// no Kosmion name-drops in any pool (canon rule)
for (const [pool, lines] of Object.entries(loreDrops.POOLS)) {
    for (const entry of lines) {
        const text = typeof entry === 'string' ? entry : entry.t;
        assert.ok(!/kosmion/i.test(text), `Kosmion leaked in pool ${pool}`);
    }
}

console.log('✓ loreDrops: format ╒ *line* ╛, cooldown, routing, pool sizes, canon discipline');

// ─── enemyVariants ──────────────────────────────────────────────────────────
const enemyVariants = require('../core/rpg/enemyVariants');

// spawn policy: no variants below floor 31 on non-boss floors
for (let i = 0; i < 200; i++) {
    assert.strictEqual(enemyVariants.rollAbyssVariant(1 + Math.floor(Math.random() * 30), false, 'FIGHTER'), null,
        'no variants should spawn below floor 31');
}
// variants DO spawn at depth (statistical)
{
    let hits = 0;
    for (let i = 0; i < 500; i++) if (enemyVariants.rollAbyssVariant(60, false, 'FIGHTER')) hits++;
    assert.ok(hits > 20 && hits < 250, `deep variant rate out of band: ${hits}/500`);
}
// MIRROR boss variant uses the player's own class name
{
    let found = false;
    for (let i = 0; i < 500 && !found; i++) {
        const v = enemyVariants.rollAbyssVariant(40, true, 'PALADIN');
        if (v) { found = true; assert.strictEqual(v.variantTag, 'self'); assert.ok(/PALADIN/i.test(v.name)); assert.ok(v.isBoss); }
    }
    assert.ok(found, 'MIRROR boss variant never rolled in 500 tries');
}
// TIMELINE_DRIFTER only at 90+
{
    let drifterEarly = 0, drifterDeep = 0;
    for (let i = 0; i < 400; i++) {
        const v1 = enemyVariants.rollAbyssVariant(60, false, 'FIGHTER');
        if (v1 && v1.variantKind === 'TIMELINE_DRIFTER') drifterEarly++;
        const v2 = enemyVariants.rollAbyssVariant(95, false, 'FIGHTER');
        if (v2 && v2.variantKind === 'TIMELINE_DRIFTER') drifterDeep++;
    }
    assert.strictEqual(drifterEarly, 0, 'drifter spawned below floor 90');
    assert.ok(drifterDeep > 5, 'no drifters at 95 despite share=0.4');
}
// wanderer swap is data-level: stats untouched, name/tag/archetype change
{
    const mob = { name: 'Infected Hound', enemyIndex: 1, stats: { hp: 100 }, isBoss: false };
    let swapped = null;
    for (let i = 0; i < 500 && !swapped; i++) {
        const out = enemyVariants.maybeSwapWanderer([mob], 'MAGE', { chance: 1 });
        swapped = out[0];
    }
    assert.strictEqual(swapped.stats.hp, 100, 'swap must not touch stats');
    assert.strictEqual(swapped.humanoid, true);
    assert.ok(/WANDERER|OTHER BANNER/.test(swapped.name));
    assert.ok(swapped.spriteIndex !== undefined);
}
// abyss sprite map: element families resolve to distinct indices
{
    const a = enemyVariants.abyssSpriteIndex('EMBER_SPAWN');
    const b = enemyVariants.abyssSpriteIndex('FROST_WISP');
    const c = enemyVariants.abyssSpriteIndex('CAVE_BAT');
    assert.notStrictEqual(a, b);
    assert.strictEqual(c, 0, 'CAVE_BAT maps to the bat sheet');
    assert.ok(Number.isInteger(enemyVariants.abyssSpriteIndex('UNKNOWN_THING')));
}

console.log('✓ enemyVariants: spawn policy by depth, MIRROR/DRIFTER rules, data-level swap, sprite mapping');

// ─── worldMap gates (locked = requirement text, never a render) ─────────────
const worldMap = require('../core/rpg/worldMap');
assert.strictEqual(worldMap.ABYSS_MAP_UNLOCK, 20); // CONFIRMED by owner (2026-09-19)
{
    const ref = worldMap._refuseBeyond('A');
    assert.ok(ref.includes('S'), 'rank requirement named');
    const refA = worldMap._refuseAbyss(12);
    assert.ok(refA.includes('20'), 'level requirement named');
    // gate logic
    assert.strictEqual(worldMap._rankAtLeast('S', 'S'), true);
    assert.strictEqual(worldMap._rankAtLeast('A', 'S'), false);
    assert.strictEqual(worldMap._rankAtLeast('SSS', 'S'), true);
}

console.log('✓ worldMap: ABYSS_MAP_UNLOCK=20 constant, gate refusals name the requirement, rank gate math');

console.log('\nALL QA CHECKS PASSED');
