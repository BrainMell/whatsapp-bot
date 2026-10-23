#!/usr/bin/env node
'use strict';
// QA - medieval house builder: renders the new kit themes, the mezzanine
// tiers and the extra-room views through the REAL renderRoomImage path.
// Output: static JPEG proofs (the live lane is the animated mp4/gif bake).
const fs = require('fs');
const path = require('path');
const renderer = require('../core/rpg/homesteadRenderer');

const OUT = '/home/z/my-project/download';

async function main() {
    const states = [
        {
            name: 'hall_timberglen_mezz1',
            state: {
                owner: 'thefirstloser v4', theme: 'timberglen', mezz: 1, roomId: 'main',
                placed: [
                    { item: 'bed_rustic', x: 1, y: 2, uid: 'a' },
                    { item: 'chair_carved', x: 2, y: 5, uid: 'b' },
                    { item: 'table_long', x: 6, y: 3, uid: 'c' },
                    { item: 'hearth_brick', x: 8, y: 8, uid: 'd' },
                    { item: 'rug_rose', x: 6, y: 6, uid: 'e' },
                    { item: 'crate_old', x: 8, y: 2, uid: 'f' },
                    { item: 'banner_crimson', x: 4, y: 1, uid: 'g' },
                ],
            },
        },
        {
            name: 'hall_dressedcourt_mezz2',
            state: {
                owner: 'Mellow v4', theme: 'dressedcourt', mezz: 2, roomId: 'main',
                placed: [
                    { item: 'bed_forest', x: 1, y: 1, uid: 'a' },
                    { item: 'table_feast', x: 2, y: 4, uid: 'b' },
                    { item: 'plant_flower', x: 1, y: 8, uid: 'c' },
                    { item: 'hearth_brick', x: 8, y: 7, uid: 'd' },
                    { item: 'table_round', x: 7, y: 3, uid: 'e' },
                    { item: 'banner_royal', x: 5, y: 0, uid: 'f' },
                ],
            },
        },
        {
            name: 'regression_oakhaven_plain',
            state: {
                owner: 'regression v4', theme: 'oakhaven', mezz: 0, roomId: 'main',
                placed: [
                    { item: 'bed_bedroll', x: 2, y: 2, uid: 'a' },
                    { item: 'crate_old', x: 5, y: 2, uid: 'b' },
                    { item: 'chair_wood', x: 6, y: 4, uid: 'c' },
                ],
            },
        },
        {
            name: 'bedroom_plastercourt',
            state: {
                owner: 'thefirstloser v4', theme: 'plastercourt', mezz: 0, roomId: 'bedroom',
                placed: [
                    { item: 'bed_traveller', x: 5, y: 5, uid: 'a' },
                    { item: 'rug_round', x: 5, y: 6, uid: 'b' },
                ],
            },
        },
    ];
    for (const s of states) {
        const out = await renderer.renderRoomImage(s.state, { static: true });
        const f = path.join(OUT, `house_builder_qa_${s.name}.jpg`);
        fs.writeFileSync(f, out.buffer);
        console.log(`${s.name}: ${out.contentType} ${out.buffer.length} bytes -> ${f}`);
    }
    console.log('QA done');
}

main().catch((e) => { console.error('QA FAILED:', e); process.exit(1); });
