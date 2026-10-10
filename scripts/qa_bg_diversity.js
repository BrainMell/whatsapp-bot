#!/usr/bin/env node
/**
 * qa_bg_diversity.js — owner ruling 2026-10-10 verification
 * ("keep the cave backgrounds and use these ones" + "diversify the backgrounds")
 *
 * Asserts:
 *  1. every DUNGEON_ENVIRONMENTS entry carries a bgPool of >= 2 distinct files
 *  2. primary asset is always a member of its own pool
 *  3. ZERO abyss-hall filenames anywhere in the dungeon pools (halls = abyss bosses only)
 *  4. every pool file has a measured ground entry in the Go groundmap registry
 *     (mirror list — the Go service owns the canonical JSON)
 *  5. every pool file is covered by deadWorldRenderer.ENV_CARD_ART (dead-world art)
 *  6. no duplicate-VISUAL files inside one pool (spark_2==spark_1-night,
 *     spark_4==spark_2-night, spark_6==spark_3-night are byte-identical twins)
 *  7. startJourney rolls the pool ONCE per run and freezes it into
 *     state.environment (start card envAsset + battle backgroundPath +
 *     dead-world environmentKey all read the same file)
 *  8. ruins/tutorial defaults are ground-verified spark files (no env* legacy flats)
 */
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const check = (ok, label) => {
    if (ok) { pass++; console.log(`  ✅ ${label}`); }
    else { fail++; console.log(`  ❌ ${label}`); }
};

// ground-verified backgrounds (bot_generation/pkg/combat/groundmap.json, 2026-09-20 vision pass)
const GROUND_VERIFIED = new Set([
    'background1.png', 'background2.png', 'background3.png',
    'env1.png', 'env2.png', 'env3.png',
    'forest.png', 'ice.png', 'sand.png',
    'spark_1.png', 'spark_1-night.png', 'spark_2.png', 'spark_2-night.png',
    'spark_3.png', 'spark_3-night.png', 'spark_4.png', 'spark_5.png',
    'spark_6.png', 'spark_7.png', 'spark_8.png', 'spark_10.png', 'spark_15.png',
]);
// byte-identical twins on the boxes (same md5) — never co-pool
const DUP_GROUPS = [
    ['spark_2.png', 'spark_1-night.png'],
    ['spark_4.png', 'spark_2-night.png'],
    ['spark_6.png', 'spark_3-night.png'],
];
// abyss-boss hall art — banned from dungeon pools by owner ruling 2026-10-10
const HALLS = new Set([
    'ember_depths.png', 'void_sanctum.png', 'crystal_vault.png', 'obsidian_throne.png',
    'ossuary_hall.png', 'blood_chapel.png', 'frost_reliquary.png', 'fungal_grotto.png',
    'chained_cells.png', 'cistern_hall.png', 'drowned_crypt.png', 'gargoyle_hall.png',
    'ruined_library.png', 'sacrarium.png', 'web_lair.png',
]);

console.log('\n[bg-diversity] owner ruling 2026-10-10 — cave backgrounds restored + diversified\n');

// load DUNGEON_ENVIRONMENTS without booting the whole engine: eval the two
// const blocks we need from the source (guildAdventure requires engine deps).
const gaSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildAdventure.js'), 'utf8');
const start = gaSrc.indexOf('const DUNGEON_ENVIRONMENTS');
const end = gaSrc.indexOf('};', gaSrc.indexOf('SIMPLE_FOREST', start));
const envSrc = gaSrc.slice(start, end + 2);
const DUNGEON_ENVIRONMENTS = eval(envSrc + '\nDUNGEON_ENVIRONMENTS');
const dwRenderer = require('../core/rpg/deadWorldRenderer');

const envIds = Object.keys(DUNGEON_ENVIRONMENTS);
check(envIds.length >= 11, `dungeon environments present (${envIds.length})`);

const allPoolFiles = new Set();
for (const id of envIds) {
    const env = DUNGEON_ENVIRONMENTS[id];
    const pool = env.bgPool || [];
    check(Array.isArray(pool) && pool.length >= 2, `${id}: bgPool >= 2 entries (${pool.join(', ')})`);
    check(pool.includes(env.asset), `${id}: primary asset ${env.asset} is in its pool`);
    const uniq = new Set(pool);
    check(uniq.size === pool.length, `${id}: no duplicate filenames in pool`);
    for (const f of pool) {
        allPoolFiles.add(f);
        check(GROUND_VERIFIED.has(f), `${id}: ${f} has a groundmap.json entry (sprites stand on ground)`);
        check(!HALLS.has(f), `${id}: ${f} is NOT abyss-boss hall art`);
        check(dwRenderer.ENV_CARD_ART[f] !== undefined, `${id}: ${f} covered by dead-world ENV_CARD_ART`);
    }
    // duplicate-visual guard
    for (const grp of DUP_GROUPS) {
        const clash = grp.filter((f) => pool.includes(f));
        check(clash.length <= 1, `${id}: pool avoids duplicate visuals (${grp.join(' == ')}) -> ${clash.length <= 1 ? 'ok' : clash.join('+')}`);
    }
}
const distinct = allPoolFiles.size;
check(distinct >= 15, `pools span ${distinct} distinct background files across the dungeon (diversity)`);

// hall ban across the whole pool surface
const gaHallRefs = [...gaSrc.matchAll(/"(?:ember_depths|void_sanctum|crystal_vault|obsidian_throne|ossuary_hall|blood_chapel|frost_reliquary|fungal_grotto)\.png"/g)].length;
check(gaHallRefs === 0, `zero hall filenames referenced in guildAdventure.js (found ${gaHallRefs})`);

// run-level roll wiring
check(/bgRoll\s*=[\s\S]{0,200}?bgPool\[Math\.floor\(Math\.random\(\) \* environment\.bgPool\.length\)\]/.test(gaSrc),
    'startJourney rolls ONE pool member per run');
check(/environment: chosenEnv,/.test(gaSrc) && /backgroundPath: `rpgasset\/environment\/\${chosenEnv\.asset}`/.test(gaSrc),
    'state.environment + battle backgroundPath carry the rolled file');
check(/envAsset: chosenEnv\.asset/.test(gaSrc), 'quest start card envAsset matches the rolled file');

// ruins / tutorial defaults: ground-verified, no legacy env flats
const ruinsFn = gaSrc.slice(gaSrc.indexOf('async function startRuinsCombat'), gaSrc.indexOf('async function startTutorialQuest'));
const m = ruinsFn.match(/background: spec\.background \|\| '([a-z0-9_\-]+\.png)'/);
check(m && m[1] === 'spark_10.png', `ruins default = ${m ? m[1] : '?'} (dark stone cave, owner's liked set)`);
check(!/spec\.background \|\| 'env\d\.png'/.test(gaSrc), 'no ruins/tutorial default points at legacy env flats');

console.log(`\n[bg-diversity] RESULT: ${pass} pass, ${fail} fail`);
process.exit(fail ? 1 : 0);
