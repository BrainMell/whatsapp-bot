'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  QA 24 — the catch ribbon is PLASTERED, not fused (owner 06:30Z Task 24).
//  "the gif itself is cached, you just plaster that overlay on it depending
//  on what you catch ... making the generation wayyy faster"
//
//  Checks:
//    A1  ribbon overlay = real transparent PNG (alpha corner + opaque panel)
//    A2  catch #1 (cold):  base MISS → valid MP4 (ftyp) + thumb
//    A3  catch #2 (new loot, same band): base HIT → total < cold total
//    A4  catch #1 repeat: full disk hit (< 500ms) + thumb rebuilt
//    A5  MP4: duration ≈ 1.92s; banner VISIBLE at t=0.05 AND t=1.5 (always
//        on, the `.j base` view look); water pixels MOVE between frames
//    A6  ffmpeg-dead fallback: canvas plaster GIF, banner on frame 0
//    A7  silent queue: no "still settling" text remains in base/homestead
//
//  Run:  QA_MODE=1 CODE_VER=qa24x NODE_PATH=<repo>/node_modules node scripts/qa24_overlay.js <outdir>
// ═══════════════════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { createCanvas, loadImage } = require('canvas');

const OUT = process.argv[2] || '/tmp/qa24';
fs.mkdirSync(OUT, { recursive: true });
const dockPov = require('../core/rpg/dockPov');
const mediaConvert = require('../core/utils/mediaConvert');

let pass = 0, fail = 0;
function check(name, ok, detail = '') {
    if (ok) { pass++; console.log(`  ✅ ${name}${detail ? ` — ${detail}` : ''}`); }
    else { fail++; console.log(`  ❌ ${name}${detail ? ` — ${detail}` : ''}`); }
}
const timings = [];
const origLog = console.log;
console.log = ((...a) => { const s = a.join(' '); if (s.includes('[fish-gif]')) timings.push(s); origLog(s); });

// drawBanner geometry for 2 loot lines @ GW×GH (u = GH/1000):
const U = dockPov.GH / 1000, W = dockPov.GW, H = dockPov.GH;
const BW = Math.min(W - 120 * U, 760 * U), BH = 64 * U + 2 * 34 * U + 18 * U;
const BX = Math.round((W - BW) / 2), BY = Math.round(36 * U);
function regionMean(img, x0, y0, x1, y1) {
    const cv = createCanvas(img.width, img.height), c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    const d = c2.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let r = 0, g = 0, b = 0, n = 0;
    for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; }
    return [r / n, g / n, b / n];
}
function regionDiff(img1, img2, x0, y0, x1, y1) {
    const cv = createCanvas(img1.width, img1.height), c2 = cv.getContext('2d');
    c2.drawImage(img1, 0, 0);
    const d1 = c2.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    const cv2 = createCanvas(img2.width, img2.height), c22 = cv2.getContext('2d');
    c22.drawImage(img2, 0, 0);
    const d2 = c22.getImageData(x0, y0, x1 - x0, y1 - y0).data;
    let sum = 0, big = 0, n = 0;
    for (let i = 0; i < d1.length; i += 4) {
        const df = Math.abs(d1[i] - d2[i]) + Math.abs(d1[i + 1] - d2[i + 1]) + Math.abs(d1[i + 2] - d2[i + 2]);
        sum += df; if (df > 60) big++; n++;
    }
    return { mean: sum / n / 3, bigPx: big };
}

const RIBBON_A = { head: 'The Pond', lines: ['1× River Trout — UNCOMMON · sells 140Z', '+120 ZENI'] };
const RIBBON_B = { head: 'The Pond', lines: ['3× Pond Minnow — COMMON · sells 40Z', '+95 ZENI'] };

(async () => {
    console.log('── A1: ribbon overlay is a real transparent PNG ──');
    const ovl = await dockPov.renderRibbonOverlay(RIBBON_A);
    check('overlay returned', !!(ovl && ovl.buffer && ovl.buffer.length > 500), `${ovl.buffer.length}B ct=${ovl.contentType}`);
    check('overlay is PNG', ovl.contentType === 'image/png' && ovl.buffer[0] === 0x89 && ovl.buffer[1] === 0x50);
    const ovlImg = await loadImage(ovl.buffer);
    check('overlay canvas size', ovlImg.width === dockPov.GW && ovlImg.height === dockPov.GH, `${ovlImg.width}x${ovlImg.height}`);
    {
        const cv = createCanvas(W, H), c2 = cv.getContext('2d');
        c2.drawImage(ovlImg, 0, 0);
        const corner = c2.getImageData(4, H - 4, 1, 1).data;      // bottom-left: outside the banner
        const panel = c2.getImageData(BX + 20, BY + 20, 1, 1).data; // inside the banner panel
        check('overlay transparent outside banner', corner[3] === 0, `alpha=${corner[3]}`);
        check('overlay opaque inside banner', panel[3] > 200 && panel[0] < 70, `alpha=${panel[3]} rgb=${panel[0]},${panel[1]},${panel[2]}`);
        fs.writeFileSync(path.join(OUT, 'ribbon_overlay.png'), ovl.buffer);
    }

    console.log('── A2: catch #1 (cold) — base MISS, ships MP4 ──');
    const tA = Date.now();
    const cA = await dockPov.renderFishingGif({ biome: 'isle', lvl: 1, band: 'low', banner: RIBBON_A });
    const msA = Date.now() - tA;
    check('catch A returned', !!(cA && cA.buffer && cA.buffer.length > 1000), `${cA.buffer.length}B`);
    check('catch A is MP4 (ffmpeg lane)', cA.contentType === 'video/mp4' && cA.buffer.slice(4, 8).toString() === 'ftyp', cA.contentType);
    check('catch A has thumb', !!(cA.thumb && cA.thumb.length > 200 && cA.thumb[0] === 0xff && cA.thumb[1] === 0xd8), `${cA.thumb && cA.thumb.length}B`);
    fs.writeFileSync(path.join(OUT, 'catch_a.mp4'), cA.buffer);

    console.log('── A3: catch #2 (different loot, same band) — base HIT, faster ──');
    const tB = Date.now();
    const cB = await dockPov.renderFishingGif({ biome: 'isle', lvl: 1, band: 'low', banner: RIBBON_B });
    const msB = Date.now() - tB;
    check('catch B is MP4', cB.contentType === 'video/mp4', `${cB.buffer.length}B`);
    check('base GIF was cache-hit (no re-encode)', timings.some((t) => t.includes('base=hit')), '');
    check('overlay-only catch is FASTER', msB < msA, `cold=${msA}ms plastered=${msB}ms`);
    fs.writeFileSync(path.join(OUT, 'catch_b.mp4'), cB.buffer);

    console.log('── A4: catch #1 repeat — full disk hit ──');
    const tR = Date.now();
    const cR = await dockPov.renderFishingGif({ biome: 'isle', lvl: 1, band: 'low', banner: RIBBON_A });
    const msR = Date.now() - tR;
    check('repeat = disk hit, fast', msR < 500, `${msR}ms`);
    check('repeat thumb rebuilt', !!(cR.thumb && cR.thumb.length > 200), `${cR.thumb && cR.thumb.length}B`);

    console.log('── A5: MP4 sanity — duration, always-on banner, living water ──');
    {
        const f0 = path.join(OUT, 'f_005.png'), f1 = path.join(OUT, 'f_150.png');
        execFileSync('ffmpeg', ['-y', '-ss', '0.05', '-i', path.join(OUT, 'catch_b.mp4'), '-frames:v', '1', '-update', '1', f0]);
        execFileSync('ffmpeg', ['-y', '-ss', '1.5', '-i', path.join(OUT, 'catch_b.mp4'), '-frames:v', '1', '-update', '1', f1]);
        const i0 = await loadImage(f0), i1 = await loadImage(f1);
        const [r0, g0, b0] = regionMean(i0, BX + 14, BY + 14, BX + 24, BY + 24);
        check('banner VISIBLE at t=0.05 (dark panel)', r0 < 90 && g0 < 90, `rgb=${r0.toFixed(0)},${g0.toFixed(0)},${b0.toFixed(0)}`);
        const [r1, g1, b1] = regionMean(i1, BX + 14, BY + 14, BX + 24, BY + 24);
        check('banner VISIBLE at t=1.5 (always-on, not end-only)', r1 < 90 && g1 < 90, `rgb=${r1.toFixed(0)},${g1.toFixed(0)},${b1.toFixed(0)}`);
        const wd = regionDiff(i0, i1, Math.round(W * 0.1), Math.round(H * 0.55), Math.round(W * 0.9), Math.round(H * 0.78));
        check('water still ANIMATING under the overlay', wd.mean > 0.8 && wd.bigPx > 200, `meanDiff=${wd.mean.toFixed(1)} bigPx=${wd.bigPx}`);
        // gold border stroke lives on the CRISP overlay PNG (GIF palette + H.264
        // chroma smear eat a 1.5px line — the style itself is what we assert)
        const gold = regionMean(ovlImg, BX + Math.round(BW / 2) - 2, BY - 1, BX + Math.round(BW / 2) + 2, BY + 3);
        check('ribbon wears the established gold border', gold[0] > 100 && gold[0] > gold[2] + 30, `rgb=${gold.map((x) => x.toFixed(0)).join(',')}`);
        const dur = parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(OUT, 'catch_b.mp4')]).toString().trim());
        check('duration ≈ 1.92s loop', dur > 1.6 && dur < 2.3, `${dur}s`);
    }

    console.log('── A6: ffmpeg-dead → canvas plaster GIF fallback ──');
    {
        process.env.FFMPEG_PATH = '/nonexistent-ffmpeg';
        const mod = require.resolve('../core/utils/mediaConvert');
        delete require.cache[mod];
        process.env.CODE_VER = 'qa24fb';
        const dockPov2 = (() => { delete require.cache[require.resolve('../core/rpg/dockPov')]; return require('../core/rpg/dockPov'); })();
        const tC = Date.now();
        const cC = await dockPov2.renderFishingGif({ biome: 'isle', lvl: 1, band: 'low', banner: RIBBON_A, phase: 'day' });
        check('fallback returned a GIF', cC.contentType === 'image/gif' && require('../core/utils/gif89a').isGifBuffer(cC.buffer), `${cC.buffer.length}B`);
        const f0j = require('../core/utils/gif89a').firstFrameJpeg(cC.buffer);
        const i0 = await loadImage(f0j);
        const [r, g] = regionMean(i0, BX + 14, BY + 14, BX + 24, BY + 24);
        check('fallback frame 0 already wears the banner', r < 90 && g < 90, `rgb=${r.toFixed(0)},${g.toFixed(0)}`);
        console.log(`  (fallback lane took ${Date.now() - tC}ms)`);
        delete process.env.FFMPEG_PATH;
    }

    console.log('── A7: settle message gone, silent queue in place ──');
    {
        const bb = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'baseBuilder.js'), 'utf8');
        const hs = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'homestead.js'), 'utf8');
        check('no "still settling" replies left', !/return ctx\.reply\('⏳ Your last (base|homestead) action is still settling/.test(bb) && !/return ctx\.reply\('⏳ Your last (base|homestead) action is still settling/.test(hs));
        check('silent queue helper present ×2', (bb.match(/async function waitOpLock/g) || []).length === 1 && (hs.match(/async function waitOpLock/g) || []).length === 1);
        check('queue wired at all base sites', (bb.match(/await waitOpLock\(/g) || []).length === 3 && (hs.match(/await waitOpLock\(/g) || []).length === 1);
    }

    console.log('── proof sheet ──');
    {
        const ov = await loadImage(path.join(OUT, 'ribbon_overlay.png'));
        const f0 = await loadImage(path.join(OUT, 'f_005.png'));
        const f1 = await loadImage(path.join(OUT, 'f_150.png'));
        const cell = 320, ch = Math.round(cell * H / W);
        const sheet = createCanvas(cell * 3 + 40, ch + 70), s2 = sheet.getContext('2d');
        s2.fillStyle = '#101418'; s2.fillRect(0, 0, sheet.width, sheet.height);
        s2.font = '16px sans-serif'; s2.fillStyle = '#f2dfa8';
        s2.fillText('Task 24 — ribbon overlay (transparent)', 12, 24);
        s2.drawImage(ov, 10, 34, cell, ch);
        s2.fillText('plastered MP4 @ t=0.05s', cell + 24, 24);
        s2.drawImage(f0, cell + 20, 34, cell, ch);
        s2.fillText('plastered MP4 @ t=1.5s (still animated)', cell * 2 + 34, 24);
        s2.drawImage(f1, cell * 2 + 30, 34, cell, ch);
        fs.writeFileSync(path.join(OUT, 'task24_proofs.png'), sheet.toBuffer('image/png'));
    }

    console.log('── timings ──');
    for (const t of timings) origLog('  ' + t);
    origLog(`\nRESULT: ${pass} pass / ${fail} fail — cold=${msA}ms plastered=${msB}ms repeat=${msR}ms`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { origLog('QA FATAL:', e); process.exit(2); });
