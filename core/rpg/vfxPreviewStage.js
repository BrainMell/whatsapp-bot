'use strict';
// Synthetic battle stage for `.j mod vfx` previews: a simple field with a caster block and 1-3 enemy
// blocks, shipped as the same layered payload the Go renderer sends (bg / sprites / focus / anchors / cuts)
// so previews exercise the REAL layered pipeline (spotlight, focus transforms, vortex, hide-caster...).
const { createCanvas } = require('canvas');
module.exports = function makeStage(nEnemies = 1) {
    const W = 1024, H = 687;
    const bgc = createCanvas(W, H), b = bgc.getContext('2d');
    const g = b.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6fa8dc'); g.addColorStop(0.55, '#c8e0f0'); g.addColorStop(0.56, '#5a8a3a'); g.addColorStop(1, '#2d4a1c');
    b.fillStyle = g; b.fillRect(0, 0, W, H);
    b.fillStyle = '#3d6b2a'; for (let i = 0; i < 9; i++) { b.beginPath(); b.arc(i * 140, 380, 120, Math.PI, 0); b.fill(); }
    for (let i = 0; i < 6; i++) { b.fillStyle = '#5b3a1a'; b.fillRect(80 + i * 170, 330, 20, 90); b.fillStyle = '#2e6b2e'; b.beginPath(); b.arc(90 + i * 170, 320, 45, 0, 7); b.fill(); }
    const sp = createCanvas(W, H), sc = sp.getContext('2d'), foc = createCanvas(W, H), fc = foc.getContext('2d');
    const anchors = [], cuts = [];
    const box = (c, x, feet, w, h, col) => { c.fillStyle = col; c.fillRect(x - w / 2, feet - h, w, h); c.fillStyle = '#fff'; c.fillRect(x - w / 4, feet - h + h * 0.15, w / 6, h / 10); c.fillRect(x + w / 10, feet - h + h * 0.15, w / 6, h / 10); };
    const cut = (side, index, x, feet, w, h, col) => { const cc = createCanvas(w, h); box(cc.getContext('2d'), w / 2, h, w, h, col); cuts.push({ side, index, x: x - w / 2, y: feet - h, w, h, png: cc.toBuffer('image/png').toString('base64') }); };
    box(sc, 260, 430, 90, 130, '#2a5fbf'); anchors.push({ side: 'player', index: 0, x: 260, feetY: 430, w: 90, h: 130 }); cut('player', 0, 260, 430, 90, 130, '#2a5fbf');
    [[740, 420], [820, 470], [690, 500]].slice(0, Math.max(1, Math.min(3, nEnemies))).forEach(([x, f], i) => {
        const col = ['#bf2a2a', '#8a2abf', '#bf7a2a'][i];
        if (i === 0) box(fc, x, f, 110, 150, col); else box(sc, x, f, 110, 150, col);
        anchors.push({ side: 'enemy', index: i, x, feetY: f, w: 110, h: 150 }); cut('enemy', i, x, f, 110, 150, col);
    });
    return { bg: bgc.toBuffer('image/png'), sprites: sp.toBuffer('image/png'), focus: foc.toBuffer('image/png'), anchors, cuts, w: W, h: H };
};
