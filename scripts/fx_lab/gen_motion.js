// gen_motion.js - v17 BALL ARENA flight frames: 24 directed mid-frames
// (12 undirected adjacent pairs x 2 directions), 1280x720 + 800x450 thumbs.
// Ball mid-air BETWEEN cells, motion trail ghosts + speed streaks behind it,
// faint glow on origin cell, full glow on target cell. The bot plays
// [flight frame -> arrival frame] per glide step: the move itself becomes
// the animation, on the proven v12e HQ-morph edit engine.
const { Jimp, loadFont } = require("jimp");
const path = require("path");
const fs = require("fs");

const FDIR = "/home/ubuntu/whatsapp-bot/node_modules/@jimp/plugin-print/fonts/open-sans";
const ASSETS = "/home/ubuntu/whatsapp-bot/fx_captures/assets";
const W = 1280, H = 720;
const CELLX = [213, 640, 1067], CELLY = [120, 360, 600];
const TEAL = [31, 191, 168], NAVY_TOP = [13, 20, 30], NAVY_BOT = [10, 26, 28];

function gradient(img) {
    img.scan(0, 0, W, H, function (x, y, idx) {
        const t = y / H;
        const d = img.bitmap.data;
        d[idx] = Math.round(NAVY_TOP[0] + (NAVY_BOT[0] - NAVY_TOP[0]) * t);
        d[idx + 1] = Math.round(NAVY_TOP[1] + (NAVY_BOT[1] - NAVY_TOP[1]) * t);
        d[idx + 2] = Math.round(NAVY_TOP[2] + (NAVY_BOT[2] - NAVY_TOP[2]) * t);
        d[idx + 3] = 255;
    });
}

function gridLines(img) {
    const lines = [[W / 6, "v"], [W / 2, "v"], [5 * W / 6, "v"], [H / 6, "h"], [H / 2, "h"], [5 * H / 6, "h"]];
    for (const [p, o] of lines) {
        const x0 = o === "v" ? Math.round(p) : 0, y0 = o === "v" ? 0 : Math.round(p);
        const w = o === "v" ? 2 : W, h = o === "v" ? H : 2;
        img.scan(x0, y0, w, h, function (x, y, idx) {
            const d = img.bitmap.data;
            d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 46;
        });
    }
    for (const [x0, y0, w, h] of [[0, 0, W, 4], [0, H - 4, W, 4], [0, 0, 4, H], [W - 4, 0, 4, H]]) {
        img.scan(x0, y0, w, h, function (x, y, idx) {
            const d = img.bitmap.data;
            d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 255;
        });
    }
}

function cellGlowS(img, cx, cy, s) {
    const hw = W / 3, hh = H / 3;
    img.scan(Math.round(cx - hw / 2), Math.round(cy - hh / 2), Math.round(hw), Math.round(hh), function (x, y, idx) {
        if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) return;
        const d = img.bitmap.data;
        d[idx] = Math.min(255, d[idx] + Math.round(14 * s));
        d[idx + 1] = Math.min(255, d[idx + 1] + Math.round(24 * s));
        d[idx + 2] = Math.min(255, d[idx + 2] + Math.round(22 * s));
    });
}

// alpha-blended white disc (motion trail ghost)
function ballGhost(img, cx, cy, r, a) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dist = Math.hypot(dx, dy);
        if (dist > r) continue;
        const idx = img.getPixelIndex(x, y);
        const d = img.bitmap.data;
        const al = a / 255;
        d[idx] = Math.round(d[idx] * (1 - al) + 245 * al);
        d[idx + 1] = Math.round(d[idx + 1] * (1 - al) + 248 * al);
        d[idx + 2] = Math.round(d[idx + 2] * (1 - al) + 250 * al);
    }
}

// speed streak: line from (cx,cy) extending BACKWARDS along -dir, fading
function streak(img, cx, cy, len, dirX, dirY, a) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let t = 0; t < len; t++) {
        const fade = 1 - t / len;
        const al = (a / 255) * fade;
        if (al <= 0.01) continue;
        for (let off = -1; off <= 1; off++) {
            const x = cx - dirX * t + (dirX === 0 ? off : 0);
            const y = cy - dirY * t + (dirY === 0 ? off : 0);
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const idx = img.getPixelIndex(x, y);
            const d = img.bitmap.data;
            d[idx] = Math.round(d[idx] * (1 - al) + 205 * al);
            d[idx + 1] = Math.round(d[idx + 1] * (1 - al) + 240 * al);
            d[idx + 2] = Math.round(d[idx + 2] * (1 - al) + 235 * al);
        }
    }
}

function ball(img, cx, cy) {
    const R = 56;
    for (let dy = -R - 8; dy <= R + 8; dy++) for (let dx = -R - 8; dx <= R + 8; dx++) {
        const x = cx + dx, y = cy + dy + 10;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dist = Math.hypot(dx, dy);
        if (dist < R + 6 && dist > R - 6) {
            const idx = img.getPixelIndex(x, y);
            const d = img.bitmap.data;
            d[idx] = 0; d[idx + 1] = 0; d[idx + 2] = 0; d[idx + 3] = 120;
        }
    }
    for (let dy = -R - 6; dy <= R + 6; dy++) for (let dx = -R - 6; dx <= R + 6; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dist = Math.hypot(dx, dy);
        const idx = img.getPixelIndex(x, y);
        const d = img.bitmap.data;
        if (dist <= R - 8) { d[idx] = 245; d[idx + 1] = 248; d[idx + 2] = 250; d[idx + 3] = 255; }
        else if (dist <= R) { d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 255; }
        else if (dist <= R + 4 && dist > R + 2) { d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 90; }
    }
}

async function label(img, text) {
    const f32 = await loadFont(path.join(FDIR, "open-sans-32-white/open-sans-32-white.fnt"));
    const w = (typeof Jimp.measureText === "function") ? Jimp.measureText(f32, text) : text.length * 19;
    img.print({ font: f32, x: Math.round((W - w) / 2), y: H - 64, text });
}

(async () => {
    let n = 0;
    for (let gx1 = 0; gx1 < 3; gx1++) for (let gy1 = 0; gy1 < 3; gy1++) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const gx2 = gx1 + dx, gy2 = gy1 + dy;
            if (gx2 < 0 || gx2 > 2 || gy2 < 0 || gy2 > 2) continue;
            const img = new Jimp({ width: W, height: H, color: 0x00000000 });
            gradient(img);
            cellGlowS(img, CELLX[gx1], CELLY[gy1], 0.45);   // origin faint
            cellGlowS(img, CELLX[gx2], CELLY[gy2], 1.0);    // destination pull
            gridLines(img);
            const mx = (CELLX[gx1] + CELLX[gx2]) / 2, my = (CELLY[gy1] + CELLY[gy2]) / 2;
            const gapX = CELLX[gx2] - CELLX[gx1], gapY = CELLY[gy2] - CELLY[gy1];
 // trail ghosts receding toward the origin cell
            ballGhost(img, mx - gapX * 0.22, my - gapY * 0.22, 40, 90);
            ballGhost(img, mx - gapX * 0.40, my - gapY * 0.40, 28, 55);
 // speed streaks behind the ball (3 lanes)
            const L = 230;
            if (dx !== 0) {
                streak(img, mx - 70, my - 34, L, dx, 0, 120);
                streak(img, mx - 60, my, L + 40, dx, 0, 150);
                streak(img, mx - 70, my + 34, L, dx, 0, 120);
            } else {
                streak(img, mx - 34, my - 70, L, 0, dy, 120);
                streak(img, mx, my - 60, L + 40, 0, dy, 150);
                streak(img, mx + 34, my - 70, L, 0, dy, 120);
            }
            ball(img, mx, my);
            await label(img, "BALL ARENA · (" + (gx1 + 1) + "," + (gy1 + 1) + ") -> (" + (gx2 + 1) + "," + (gy2 + 1) + ")");
            const out = path.join(ASSETS, "ball_m" + gx1 + gy1 + "_" + gx2 + gy2 + ".jpg");
            const tout = path.join(ASSETS, "ball_m" + gx1 + gy1 + "_" + gx2 + gy2 + "_thumb.jpg");
            await img.write(out);
            await img.clone().resize({ w: 800, h: 450 }).write(tout);
            n++;
            console.log("frame", gx1 + "," + gy1, "->", gx2 + "," + gy2, fs.statSync(out).size + "B", fs.statSync(tout).size + "B");
        }
    }
    console.log("DONE " + n + " flight frames");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
