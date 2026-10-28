'use strict';
// Validate core/rpgasset/vfx/vfx_assets.json and show which classes use which overridable layer.
//   node scripts/vfx_assets_check.js
const fx = require('../core/rpg/ultimateFx');
const { classRecipe } = require('../core/rpg/ultimateFxRecipes');
const { SIGNATURE_SKILLS } = require('../core/rpg/skillVfx');
(async () => {
    const A = fx._assets, man = A.loadManifest();
    let bad = 0;
    console.log(`Manifest sets: ${Object.keys(man.sets).length}, overrides: ${Object.keys(man.overrides).length}`);
    for (const nm of Object.keys(man.sets)) {
        if (nm.startsWith('_')) continue;
        const frames = await A.loadSet(nm);
        if (!frames.length) { bad++; console.log(`  ✗ set "${nm}": no frames loaded (check file paths / grid / n)`); }
        else console.log(`  ✓ set "${nm}": ${frames.length} frames, ${frames[0].width}x${frames[0].height}, ${(A.SETS[nm].fps)}fps`);
    }
    for (const [k, o] of Object.entries(man.overrides)) {
        const layer = k.split('@')[0];
        if (['cinema', 'cosmic', 'world'].includes(layer)) {      // full-screen swaps: cinema@CLASS, cosmic@CLASS, world@KIND
            if (!o.set || !A.SETS[o.set]) { bad++; console.log(`  ✗ override "${k}": unknown set "${o.set}"`); } else console.log(`  ✓ override "${k}" -> ${o.set} (full-screen)`);
            continue;
        }
        if (!A.OVERRIDABLE.has(layer)) { bad++; console.log(`  ✗ override "${k}": layer "${layer}" is not overridable`); }
        else if (!o.set || !A.SETS[o.set]) { bad++; console.log(`  ✗ override "${k}": unknown set "${o.set}"`); }
        else console.log(`  ✓ override "${k}" -> ${o.set}`);
    }
    const use = {};
    for (const cls of Object.keys(SIGNATURE_SKILLS)) {
        const tr = classRecipe(cls, ['#fff', '#ffcb45', '#e85a37'], { IMPACT: 1.05 }) || [];
        for (const t of tr) if (t.layer && A.OVERRIDABLE.has(t.layer)) (use[t.layer] = use[t.layer] || new Set()).add(cls);
    }
    const cin = [], wor = new Set();
    for (const cls of Object.keys(SIGNATURE_SKILLS)) {
        const tr = classRecipe(cls, ['#fff', '#ffcb45', '#e85a37'], { IMPACT: 1.05 }) || [];
        for (const t of tr) { if (t.layer === 'cinema' || t.layer === 'cosmic') cin.push(`${t.layer}@${cls}`); if (t.layer === 'world') wor.add(`world@${t.kind}`); }
    }
    console.log('\nFull-screen swap keys (intro sequences): ' + cin.join(' '));
    console.log('Arena backdrop keys: ' + [...wor].join(' '));
    console.log('\nOverridable layers -> classes using them:');
    for (const [l, set] of Object.entries(use).sort()) console.log(`  ${l.padEnd(9)} ${[...set].join(' ')}`);
    process.exit(bad ? 1 : 0);
})();
