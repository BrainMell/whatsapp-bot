#!/usr/bin/env node
'use strict';
// QA - housekit-v5: the corrected Timberglen Hearth Cottage starter render
// through the REAL renderRoomImage path (static JPEG proofs; live lane = mp4).
const fs = require('fs');
const path = require('path');
const renderer = require('../core/rpg/homesteadRenderer');

const OUT = process.env.QA_OUT || '/tmp/hbqa_out';

async function main() {
    const states = [
        {
            name: 'v5_starter_hall_timberglen',
            state: {
                owner: 'Thatchwick Cottage', theme: 'timberglen', mezz: 1, roomId: 'main',
                placed: [
                    // upstairs: bed + chest on the deck (x<4 rides with the deck)
                    { item: 'bed_rustic', x: 1, y: 0, uid: 'a' },
                    { item: 'chest_wood', x: 2, y: 2, uid: 'b' },
                    // downstairs: hearth against the right wall, table + two seats,
                    // rug, clock, banner; diagonal walking route kept clear
                    { item: 'hearth_brick', x: 10, y: 7, uid: 'c' },
                    { item: 'table_small', x: 7, y: 4, uid: 'd' },
                    { item: 'chair_wood', x: 6, y: 3, uid: 'e' },
                    { item: 'chair_wood', x: 8, y: 5, f: 1, uid: 'f2' },
                    { item: 'rug_rose', x: 6, y: 5, uid: 'g' },
                    { item: 'clock_grand', x: 10, y: 1, uid: 'h' },
                    { item: 'banner_crimson', x: 6, y: 1, uid: 'i' },
                    { item: 'plant_flower', x: 9, y: 3, uid: 'j' },
                ],
            },
        },
        {
            name: 'v5_starter_facing_check',
            state: {
                owner: 'facing check', theme: 'timberglen', mezz: 0, roomId: 'main',
                placed: [
                    { item: 'chair_wood', x: 5, y: 5, uid: 'a' },
                    { item: 'chair_wood', x: 7, y: 5, f: 1, uid: 'b' },
                    { item: 'table_small', x: 6, y: 5, uid: 'c' },
                    { item: 'bed_royal', x: 2, y: 2, uid: 'd' },
                    { item: 'bed_royal', x: 2, y: 6, f: 1, uid: 'e' },
                    { item: 'rug_round', x: 7, y: 2, uid: 'f' },
                    { item: 'oven_brick', x: 10, y: 8, uid: 'g' },
                ],
            },
        },
    ];
    for (const s of states) {
        const out = await renderer.renderRoomImage(s.state, { static: true });
        const f = path.join(OUT, `house_builder_qa_${s.name}.jpg`);
        fs.writeFileSync(f, out.buffer);
        console.log(`${s.name}: ${out.buffer.length} bytes -> ${f}`);
    }
}

main().then(() => process.exit(0)).catch((e) => { console.error('QA FAIL', e); process.exit(1); });
