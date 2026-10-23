'use strict';
// Render BEFORE/AFTER previews of the base-builder rebuild (
// 17:27Z commission). Run from repo root ON THE BOX (needs node canvas):
// node scripts/render_rebuild_preview.js
const fs = require('fs');
const path = require('path');
const OUT = '/tmp/rebuild_previews';
fs.mkdirSync(OUT, { recursive: true });

async function main() {
    const baseR = require('../core/rpg/homesteadBaseRenderer');
    const roomR = require('../core/rpg/homesteadRenderer');

 // -- 1) NEW BASE VIEW - v2 layout, scaled structures, margin world --
    const baseState = {
        owner: 'Mellow',
        structures: [
            { type: 'house', level: 2, x: baseR.LAYOUT.house.x, y: baseR.LAYOUT.house.y },
            { type: 'mines', level: 1, x: baseR.LAYOUT.mines.x, y: baseR.LAYOUT.mines.y },
            { type: 'pond', level: 1, x: baseR.LAYOUT.pond.x, y: baseR.LAYOUT.pond.y },
            { type: 'hunting', level: 1, x: baseR.LAYOUT.hunting.x, y: baseR.LAYOUT.hunting.y },
        ],
        freePlots: [
            { id: 1, x: 11, y: 5, fw: 3, fh: 3 },
            { id: 2, x: 11, y: 10, fw: 3, fh: 3 },
            { id: 3, x: 6, y: 11, fw: 3, fh: 3 },
            { id: 4, x: 2, y: 13, fw: 3, fh: 3 },
        ],
    };
    const f0 = await baseR.renderFrame(baseState, 0, {});
    fs.writeFileSync(path.join(OUT, 'base_v2.png'), f0);
    console.log('base_v2.png', f0.length);

 // -- 2) INTERIOR with the v2 grid overlay (bold edge numbers) --
    const roomState = {
        owner: 'Mellow',
        theme: 'oakhaven',
        placed: [
            { uid: 'a1', item: 'bed_noble', x: 1, y: 1 },
            { uid: 'a2', item: 'rug_royal', x: 4, y: 3 },
            { uid: 'a3', item: 'table_long', x: 6, y: 6 },
            { uid: 'a4', item: 'chair_wood', x: 6, y: 8 },
            { uid: 'a5', item: 'hearth_brick', x: 2, y: 0, wall: true },
            { uid: 'a6', item: 'shelf_books', x: 9, y: 0, wall: true },
        ],
    };
    const gframe = await roomR.renderFrame(roomState, 2, {
        grid: { x: 8, y: 8, fw: 2, fh: 1, label: 'Chair (move me)', valid: true },
        static: true,
    });
    fs.writeFileSync(path.join(OUT, 'interior_grid_v2.png'), gframe);
    console.log('interior_grid_v2.png', gframe.length);

 // -- 3) MOVE LOCOMOTION - mid-slide frame (pop.from) --
    const slide = await roomR.renderFrame({
        ...roomState,
        placed: roomState.placed.map((p) => (p.uid === 'a4' ? { ...p, x: 8, y: 8 } : p)),
    }, 5, {
        pop: { item: 'chair_wood', x: 8, y: 8, from: { x: 6, y: 8 } },
        static: true,
    });
    fs.writeFileSync(path.join(OUT, 'interior_move_slide.png'), slide);
    console.log('interior_move_slide.png', slide.length);

    console.log('DONE', OUT);
}

main().catch((e) => { console.error('PREVIEW FAIL:', e.message); process.exit(1); });
