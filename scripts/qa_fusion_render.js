#!/usr/bin/env node
'use strict';
/**
 * QA: base ⇄ command fusion — PART 2: RENDER SMOKE (needs node_modules: canvas).
 * Renders every structure type × level × key activity through the REAL
 * renderStructureCard and asserts real pixels come back. Run on-box:
 *   QA_MODE=1 node scripts/qa_fusion_render.js
 */
process.env.QA_MODE = process.env.QA_MODE || '1';
const scenes = require('../core/rpg/structureScenes');
const bb = require('../core/rpg/baseBuilder');

let pass = 0, fail = 0;
const check = (name, cond) => { cond ? (pass++, console.log(`  ✅ ${name}`)) : (fail++, console.log(`  ❌ ${name}`)); };

const TYPES = ['mines', 'pond', 'hunting', 'shop', 'barracks', 'blacksmith', 'medbay', 'alchemy'];
const ACTIVITIES = ['', 'browse', 'mining', 'fishing', 'hunting', 'summoning', 'healing', 'forging', 'repair', 'brewing', 'shopping'];

(async () => {
    console.log('\n--- potionStock math (§16, pure) ---');
    {
        const H = 3600000, t0 = 1000000;
        const q1 = bb.potionStock(1, t0, t0 + 12 * H).qty;   // 1 after one interval
        const q2 = bb.potionStock(1, t0, t0 + 100 * H).qty;  // capped at 2
        const q3 = bb.potionStock(3, t0, t0 + 20 * H).qty;   // L3: 6h interval → 3
        const q4 = bb.potionStock(3, t0, t0 + 100 * H).qty;  // capped at 4
        const q0 = bb.potionStock(0, t0, t0 + 100 * H).qty;  // no medbay → 0
        const q5 = bb.potionStock(2, 0, Date.now()).qty;     // never started clock → 0
        check('L1 12h → 1 potion', q1 === 1);
        check('L1 cap 2', q2 === 2);
        check('L3 20h → 3 potions (6h interval)', q3 === 3);
        check('L3 cap 4', q4 === 4);
        check('no medbay → 0', q0 === 0);
        check('no clock started → 0', q5 === 0);
    }

    console.log('\n--- HINTS map (§5, prefix-aware, the REAL exported map) ---');
    for (const [t, want] of [['pond', '.jb fish'], ['hunting', '.jb hunt'], ['mines', '.jb mine <spot>'], ['shop', '.jb shop'], ['barracks', '.jb summon'], ['blacksmith', '.jb blacksmith'], ['medbay', '.jb clinic'], ['alchemy', '.jb recipes']]) {
        const H = bb.HINTS && bb.HINTS[t];
        check(`${t} hint resolves prefix`, !!H && H('.jb')[0] === want);
    }

    console.log('\n--- render every type × level × activity (real pixels) ---');
    for (const type of TYPES) {
        for (const lvl of [1, 2, 3]) {
            for (const activity of ACTIVITIES) {
                const tag = `${type} L${lvl}${activity ? ' × ' + activity : ' (viewer)'}`;
                try {
                    const out = await scenes.renderStructureCard({
                        type, level: lvl, biome: 'isle', seed: `qa:${type}:${lvl}`,
                        activity: activity || undefined,
                        spotlight: activity === 'hunting' || activity === 'fishing' || activity === 'healing',
                        tint: activity === 'brewing' ? '#ff8c2e' : undefined,
                        spec: activity ? { banner: { head: 'QA BANNER', lines: ['line one', 'line two'] } } : {},
                    });
                    check(tag, !!(out && out.buffer && out.buffer.length > 5000 && out.contentType === 'image/jpeg'));
                } catch (e) {
                    check(`${tag} → THREW: ${e.message.slice(0, 90)}`, false);
                }
            }
        }
    }
    console.log(`\n${'='.repeat(50)}\nRESULT: ${pass} passed, ${fail} failed\n${'='.repeat(50)}`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL:', e); process.exit(1); });
