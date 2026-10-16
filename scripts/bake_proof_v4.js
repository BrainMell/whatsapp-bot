#!/usr/bin/env node
// bake_proof_v4.js — owner-feedback round 2 proofs (Discord 2026-10-16 21:23Z):
//   1) base static: pixel fence ring + hazed wild forest behind it
//   2) guild v3: pixel CASTLE at dead center + 4 house build plots + fence
//   3) close-move slide: mid-glide frame must show a 2x2 piece BETWEEN cells
//      at floor level (flat glide) — never dropped from above
'use strict';
const fs = require('fs');
const path = require('path');

const baseR = require('../core/rpg/homesteadBaseRenderer');
const guildR = require('../core/rpg/guildBaseRenderer');
const roomR = require('../core/rpg/homesteadRenderer');

const OUT = process.env.PROOF_DIR || '/home/z/my-project/download/proof_v4';
fs.mkdirSync(OUT, { recursive: true });
const save = (name, buf) => { fs.writeFileSync(path.join(OUT, name), buf); console.log('wrote', name, buf.length, 'bytes'); };

(async () => {
    // ── 1) base ──
    const L = baseR.LAYOUT;
    const baseState = {
        owner: 'Mellow',
        structures: [
            { uid: 'h', type: 'house', level: 2, x: L.house.x, y: L.house.y },
            { uid: 'm', type: 'mines', level: 1, x: L.mines.x, y: L.mines.y },
            { uid: 'p', type: 'pond', level: 1, x: L.pond.x, y: L.pond.y },
            { uid: 'g', type: 'hunting', level: 1, x: L.hunting.x, y: L.hunting.y },
            { uid: 'b', type: 'blacksmith', level: 1, x: 11, y: 6 },
        ],
        freePlots: [{ id: 2, x: 11, y: 10 }, { id: 3, x: 6, y: 11 }, { id: 4, x: 2, y: 13 }],
    };
    save('base.png', await baseR.renderFrame(baseState, 7, {}));

    // ── 2) guild (castle L3 + L5 variants) ──
    const mkGuild = (hallLvl) => ({
        name: 'Iron Vanguard', level: 3, archetype: 'ADVENTURER',
        buildings: { hall: hallLvl, training: 2, treasury: 2 },
        memberCount: 3, memberCap: 7, emblemColor: '#a02c3c', emblemIcon: '⚔',
        motto: 'Steel sharpens steel',
    });
    save('guild_l3.png', await guildR.renderFrame(mkGuild(3), 7, {}));
    save('guild_l5.png', await guildR.renderFrame(mkGuild(5), 3, {}));

    // ── 3) close-move slide, 2x2 piece, 2 tiles east ──
    const twoBy = roomR.catalog().items.find((it) => it.fw === 2 && it.fh === 2);
    if (!twoBy) throw new Error('no 2x2 catalog item found');
    const roomState = {
        owner: 'Mellow', theme: 'oakhaven',
        placed: [{ item: twoBy.id, x: 3, y: 5, uid: 'proof', f: false }],
    };
    const pop = { item: twoBy.id, x: 5, y: 5, from: { x: 3, y: 5 } };
    for (const f of [1, 3, 5]) {
        save(`slide_f${f}.png`, await roomR.renderFrame(roomState, f, { pop, grid: { x: 5, y: 5, fw: 2, fh: 2, valid: true, label: `${twoBy.name} → (5,5)` } }));
    }
    console.log('2x2 slide item:', twoBy.id);
    console.log('PROOF OK ->', OUT);
})().catch((e) => { console.error('PROOF FAILED:', e); process.exit(1); });
