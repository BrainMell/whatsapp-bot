'use strict';
// Visual A/B: after-fix render of a furnished room + zoomed crops of each item
// (before renders already saved as hs_probe2_*.png from the pre-fix probe run).
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const fs = require('fs');
const R = require('../core/rpg/homesteadRenderer');

const ITEMS = [
    { item: 'rug_royal',  x: 3, y: 6, fw: 3, fh: 2 },
    { item: 'bed_noble',  x: 3, y: 3, fw: 2, fh: 1 },
    { item: 'wardrobe',   x: 4, y: 7, fw: 1, fh: 1 },
    { item: 'barrel_small', x: 5, y: 5, fw: 1, fh: 1 },
    { item: 'clock_grand', x: 8, y: 7, fw: 1, fh: 1 },
    { item: 'table_feast', x: 6, y: 8, fw: 2, fh: 1 },
    { item: 'cauldron',   x: 7, y: 4, fw: 1, fh: 1 },
    { item: 'plant_flower', x: 2, y: 8, fw: 1, fh: 1 },
];

(async () => {
    const buf = await R.renderFrame({ owner: 'probe', theme: 'oakhaven', placed: ITEMS }, 0, {});
    fs.writeFileSync('/home/z/my-project/download/hs_after_room.png', buf);
    console.log('saved hs_after_room.png');

 // crops (art coords -> device x2), from measured geometry:
 // barrel@(5,5): c=(450,366) base 368 ; bed@(3,3): c=(466,310) base 320
 // clock@(8,7): c=(482,446) base 448 ; table@(6,8): c=(402,438) base 448
 // wardrobe@(4,7): c=(386,382) base 384 ; cauldron@(7,4): c=(482,366)
    const crops = {   // ART-space boxes [x0,y0,x1,y1] around each item (device = art*2)
        bed:    [380, 200, 560, 350],
        barrel: [390, 300, 510, 400],
        clock:  [420, 370, 545, 480],
        table:  [330, 370, 475, 480],
        ward:   [320, 310, 450, 420],
        cauldron:[420, 300, 545, 400],
    };
    const { loadImage } = require('canvas');
    const im = await loadImage(buf);
    const { createCanvas } = require('canvas');
    for (const [name, [x0, y0, x1, y1]] of Object.entries(crops)) {
        const c = createCanvas((x1 - x0) * 2, (y1 - y0) * 2);
        const cx = c.getContext('2d');
        cx.imageSmoothingEnabled = false;
        cx.drawImage(im, x0 * 2, y0 * 2, (x1 - x0) * 2, (y1 - y0) * 2, 0, 0, c.width, c.height);
        fs.writeFileSync(`/home/z/my-project/download/hs_after_${name}.png`, c.toBuffer('image/png'));
        console.log('saved hs_after_' + name + '.png');
    }
})().catch(e => { console.error('ERR', e); process.exit(1); });
