'use strict';
// Numeric shadow check: render clock@(8,7) alone, compare floor pixels vs empty render
// at points inside the shadow rhombus but outside the sprite silhouette.
const path = require('path');
process.chdir(path.join(__dirname, '..'));
const { createCanvas, loadImage } = require('canvas');
const R = require('../core/rpg/homesteadRenderer');

(async () => {
    const emptyBuf = await R.renderFrame({ owner: 'probe', theme: 'oakhaven', placed: [] }, 0, {});
    const itemBuf = await R.renderFrame({ owner: 'probe', theme: 'oakhaven', placed: [{ item: 'clock_grand', x: 8, y: 7, fw: 1, fh: 1 }] }, 0, {});
    const E = await loadImage(emptyBuf), I = await loadImage(itemBuf);
    const ec = createCanvas(E.width, E.height); ec.getContext('2d').drawImage(E, 0, 0);
    const ic = createCanvas(I.width, I.height); ic.getContext('2d').drawImage(I, 0, 0);
    const ED = ec.getContext('2d').getImageData(0, 0, E.width, E.height).data;
    const ID = ic.getContext('2d').getImageData(0, 0, I.width, I.height).data;
    const px = (D, x, y) => { const i = (y * E.width + x) * 4; return [D[i], D[i + 1], D[i + 2]]; };
 // clock: c=(482,446) art. sample art points (dx,dy from c): (6,-6),(−10,−4),(12,−2),(0,+? below base)
    const pts = [[488, 440], [472, 442], [494, 444], [482, 452], [500, 436]];
    for (const [xa, ya] of pts) {
        const [r1, g1, b1] = px(ED, xa * 2, ya * 2), [r2, g2, b2] = px(ID, xa * 2, ya * 2);
        const drop = (1 - (r2 + g2 + b2) / (r1 + g1 + b1)) * 100;
        console.log(`art(${xa},${ya}): empty rgb(${r1},${g1},${b1}) -> item rgb(${r2},${g2},${b2})  darkening=${drop.toFixed(0)}%`);
    }
})().catch(e => { console.error('ERR', e); process.exit(1); });
