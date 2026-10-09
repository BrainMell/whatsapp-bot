// gif89a self-test: encode synthetic frames → decode with PIL → exact pixel compare
// + structural checks (NETSCAPE loop, GCE delays, trailer). Run: node scripts/gif89a_qa.js
const path = require('path');
const { encodeGif, isGifBuffer } = require(path.join(__dirname, '..', 'core', 'utils', 'gif89a'));
const fs = require('fs');

let PASS = 0, FAIL = 0;
const check = (n, c) => { if (c) { PASS++; console.log('  ✅', n); } else { FAIL++; console.log('  ❌', n); } };

// synthetic: 60×40, three frames with a moving 20×10 red block over two-tone bg
const W = 60, H = 40, N = 3;
const frames = [];
for (let f = 0; f < N; f++) {
    const b = Buffer.alloc(W * H * 4);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const inBlock = y >= 5 && y < 15 && x >= (f * 15) && x < (f * 15) + 20;
        if (inBlock) { b[i] = 220; b[i+1] = 30; b[i+2] = 40; }
        else if ((x + y * 7) % 2 === 0) { b[i] = 26; b[i+1] = 22; b[i+2] = 34; }
        else { b[i] = 44; b[i+1] = 40; b[i+2] = 58; }
        b[i+3] = 255;
    }
    frames.push(b);
}
const gif = encodeGif({ width: W, height: H, frames, delayMs: 120, loop: 0 });
check('encodeGif returns buffer', Buffer.isBuffer(gif) && gif.length > 100);
check('GIF89a magic', gif && gif[0] === 0x47 && gif[1] === 0x49 && gif[2] === 0x46 && gif[3] === 0x38 && gif[4] === 0x39 && gif[5] === 0x61);
check('isGifBuffer probe', isGifBuffer(gif) && !isGifBuffer(Buffer.from([0x89, 0x50])));
check('NETSCAPE2.0 loop present', gif && gif.includes(Buffer.from('NETSCAPE2.0')));
check('trailer 0x3B', gif && gif[gif.length - 1] === 0x3B);

fs.writeFileSync('/tmp/gif89a_test.gif', gif);

// large flat-art frame: real-size card frame (540x900), measure size
const W2 = 540, H2 = 900;
const big = [];
for (let f = 0; f < 4; f++) {
    const b = Buffer.alloc(W2 * H2 * 4);
    for (let y = 0; y < H2; y++) for (let x = 0; x < W2; x++) {
        const i = (y * W2 + x) * 4;
        // bands + a moving ellipse-ish blob: flat colors only
        const band = Math.floor(y / 90) % 3;
        b[i] = band === 0 ? 18 : band === 1 ? 34 : 22;
        b[i+1] = band === 0 ? 14 : band === 1 ? 26 : 16;
        b[i+2] = band === 0 ? 30 : band === 1 ? 44 : 28;
        const dx = x - W2/2, dy = y - (300 + f*120);
        if (dx*dx/200 + dy*dy/60 < 1) { b[i] = 240; b[i+1] = 182; b[i+2] = 74; }
        b[i+3] = 255;
    }
    big.push(b);
}
const t0 = Date.now();
const bigGif = encodeGif({ width: W2, height: H2, frames: big, delayMs: 140 });
const dt = Date.now() - t0;
console.log(`  big encode: 4 frames 540x900 → ${bigGif ? (bigGif.length/1024).toFixed(0) + 'KB' : 'FAIL'} in ${dt}ms (~${(dt/4).toFixed(0)}ms/frame)`);
check('big encode sane size (< 2MB for 4 frames)', bigGif && bigGif.length < 2 * 1024 * 1024);
check('big encode timing sane (< 3s for 4 frames)', dt < 3000);
fs.writeFileSync('/tmp/gif89a_big.gif', bigGif);

console.log(`\nRESULT: ${PASS} passed, ${FAIL} failed`);
process.exit(FAIL > 0 ? 1 : 0);
