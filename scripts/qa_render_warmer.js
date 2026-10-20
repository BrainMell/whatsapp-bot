'use strict';
// 47-k8c QA: renderWarmer replay paths, fully sandboxed (QA_MODE → /tmp cache).
// node scripts/qa_render_warmer.js   (run with QA_MODE=1 CODE_VER=warmerqa1)
const fs = require('fs');
const path = require('path');
const os = require('os');
const QA = path.join(os.tmpdir(), 'qa-media-cache');
const CV = process.env.CODE_VER || 'warmerqa1';
let pass = 0, fail = 0;
const check = (name, cond) => { cond ? pass++ : fail++; console.log(`  ${cond ? 'PASS' : 'FAIL'} ${name}`); };

(async () => {
    fs.rmSync(QA, { recursive: true, force: true });
    const B = require('../core/rpg/homesteadBaseRenderer');
    const G = require('../core/rpg/guildBaseRenderer');
    const L = B.LAYOUT;
    const baseState = {
        owner: 'warmerQA',
        structures: [
            { type: 'house', level: 2, x: L.house.x, y: L.house.y },
            { type: 'mines', level: 3, x: L.mines.x, y: L.mines.y },
            { type: 'pond', level: 2, x: L.pond.x, y: L.pond.y },
            { type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
        ],
        freePlots: [],
    };
    const guildState = { name: 'Warmer QA Keep', biome: 'isle', level: 3, archetype: 'ADVENTURER',
        buildings: { hall: 2, training: 1, treasury: 0 }, memberCount: 5, memberCap: 30,
        emblemColor: '#aa3333', emblemIcon: 'boar', motto: 'qa' };

    // seed: valid stale base journal + garbage journal + guild journal + FRESH entry (data exists)
    const seed = (kind, file, obj) => {
        fs.mkdirSync(path.join(QA, kind), { recursive: true });
        fs.writeFileSync(path.join(QA, kind, file), JSON.stringify(obj));
    };
    seed('base', 'gDEADc0de_1111.json', { ct: 'image/jpeg', j: { state: baseState, opts: {} } });
    seed('base', 'gDEADc0de_2222.json', { ct: 'image/jpeg', j: { state: { owner: null, structures: 'GARBAGE' }, opts: {} } });
    seed('guildbase', 'gDEADc0de_3333.json', { ct: 'image/jpeg', j: { state: guildState, opts: {} } });
    seed('base', `${CV}_4444.json`, { ct: 'image/jpeg', j: { state: baseState, opts: { hint: 'fresh-check' } } });
    fs.writeFileSync(path.join(QA, 'base', `${CV}_4444.data`), 'fresh-bytes');

    console.log('— listJournal —');
    const mediaCache = require('../core/rpg/mediaCache');
    const lj = mediaCache.listJournal('base');
    check('listJournal finds 3 base journals (2 stale + 1 fresh)', lj.length === 3);
    check('fresh flag correct', lj.filter((e) => e.fresh).length === 1 && lj.filter((e) => !e.fresh).length === 2);
    check('newest-first ordering', lj[0].fresh === true);   // fresh entry seeded last → newest mtime

    console.log('— warmOnce —');
    const W = require('../core/rpg/renderWarmer');
    await W.warmOnce();

    // replay re-hashes the journaled state, so new data lands under the REAL hash —
    // detect it as: any current-CODE_VER .data except the seeded fresh-check one
    const freshName = `${CV}_4444.data`;
    const baseNew = fs.readdirSync(path.join(QA, 'base')).filter((f) => f.startsWith(`${CV}_`) && f.endsWith('.data') && f !== freshName);
    check('stale base re-baked under current CODE_VER (real hash)', baseNew.length === 1);
    const freshData = fs.readFileSync(path.join(QA, 'base', `${CV}_4444.data`), 'utf8');
    check('fresh entry NOT re-baked (bytes untouched)', freshData === 'fresh-bytes');
    check('garbage journal dropped (meta unlinked)', !fs.existsSync(path.join(QA, 'base', 'gDEADc0de_2222.json')));
    check('guild journal re-baked', fs.readdirSync(path.join(QA, 'guildbase')).some((f) => f.startsWith(`${CV}_`) && f.endsWith('.data')));
    check('re-baked meta carries journal forward', (() => {
        if (!baseNew.length) return false;
        const m = JSON.parse(fs.readFileSync(path.join(QA, 'base', baseNew[0].replace(/\.data$/, '.json')), 'utf8'));
        return m.j && m.j.state && m.j.state.owner === 'warmerQA';
    })());
    check('replay is idempotent (second run: nothing stale left)', (await W.warmOnce(), true) && !mediaCache.listJournal('base').some((e) => !e.fresh && fs.existsSync(e.metaPath)));

    console.log(`\n${pass} pass / ${fail} fail`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e.stack); process.exit(1); });
