// gen_methods.js - v18 METHOD LAB frames:
// SMEAR (24 directed): ball AT REST at the destination cell with the
// motion trail of the move it just made baked in (ghosts + streaks
// receding toward the origin). Single-edit animation, zero flash
// windows - the landing frame IS the animation.
// PULSE (9): impact ring + dust rays on the landed cell (juice beat).
// 1280x720 + 800x450 thumbs each, same jimp pipeline as gen_ball/gen_motion.
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

function streak(img, cx, cy, len, dirX, dirY, a) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let t = 0; t < len; t++) {
        const fade = 1 - t / len;
        const al = (a / 255) * fade;
        if (al <= 0.01) continue;
        for (let off = -1; off <= 1; off++) {
            const x = Math.round(cx - dirX * t + (dirX === 0 ? off : 0));
            const y = Math.round(cy - dirY * t + (dirY === 0 ? off : 0));
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const idx = img.getPixelIndex(x, y);
            const d = img.bitmap.data;
            d[idx] = Math.round(d[idx] * (1 - al) + 205 * al);
            d[idx + 1] = Math.round(d[idx + 1] * (1 - al) + 240 * al);
            d[idx + 2] = Math.round(d[idx + 2] * (1 - al) + 235 * al);
        }
    }
}

function ring(img, cx, cy, r, a) {
    cx = Math.round(cx); cy = Math.round(cy);
    for (let dy = -r - 2; dy <= r + 2; dy++) for (let dx = -r - 2; dx <= r + 2; dx++) {
        const dist = Math.hypot(dx, dy);
        if (dist > r + 1.5 || dist < r - 1.5) continue;
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const idx = img.getPixelIndex(x, y);
        const d = img.bitmap.data;
        const al = a / 255;
        d[idx] = Math.round(d[idx] * (1 - al) + TEAL[0] * al);
        d[idx + 1] = Math.round(d[idx + 1] * (1 - al) + TEAL[1] * al);
        d[idx + 2] = Math.round(d[idx + 2] * (1 - al) + TEAL[2] * al);
    }
}

function ray(img, cx, cy, dirX, dirY, start, len, a) {
    for (let t = start; t < start + len; t++) {
        const fade = 1 - (t - start) / len;
        const al = (a / 255) * fade;
        if (al <= 0.01) continue;
        for (let off = -1; off <= 1; off++) {
            const x = Math.round(cx + dirX * t + (Math.abs(dirY) > 0.5 ? off : 0));
            const y = Math.round(cy + dirY * t + (Math.abs(dirX) > 0.5 ? off : 0));
            if (x < 0 || y < 0 || x >= W || y >= H) continue;
            const idx = img.getPixelIndex(x, y);
            const d = img.bitmap.data;
            d[idx] = Math.round(d[idx] * (1 - al) + 210 * al);
            d[idx + 1] = Math.round(d[idx + 1] * (1 - al) + 242 * al);
            d[idx + 2] = Math.round(d[idx + 2] * (1 - al) + 238 * al);
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

async function save(img, base) {
    const out = path.join(ASSETS, base + ".jpg");
    const tout = path.join(ASSETS, base + "_thumb.jpg");
    await img.write(out);
    await img.clone().resize({ w: 800, h: 450 }).write(tout);
    return fs.statSync(out).size + "B/" + fs.statSync(tout).size + "B";
}

(async () => {
    let n = 0;
 // SMEAR landings - ball at rest at destination, trail receding to origin
    for (let ax = 0; ax < 3; ax++) for (let ay = 0; ay < 3; ay++) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
            const bx = ax + dx, by = ay + dy;
            if (bx < 0 || bx > 2 || by < 0 || by > 2) continue;
            const img = new Jimp({ width: W, height: H, color: 0x00000000 });
            gradient(img);
            cellGlowS(img, CELLX[ax], CELLY[ay], 0.45);  // where it came from
            cellGlowS(img, CELLX[bx], CELLY[by], 1.0);   // where it landed
            gridLines(img);
            const px = CELLX[bx], py = CELLY[by];
            const gapX = CELLX[bx] - CELLX[ax], gapY = CELLY[by] - CELLY[ay];
            ballGhost(img, px - gapX * 0.22, py - gapY * 0.22, 40, 90);
            ballGhost(img, px - gapX * 0.40, py - gapY * 0.40, 28, 55);
            const L = 230;
            if (dx !== 0) {
                streak(img, px - 70, py - 34, L, dx, 0, 120);
                streak(img, px - 60, py, L + 40, dx, 0, 150);
                streak(img, px - 70, py + 34, L, dx, 0, 120);
            } else {
                streak(img, px - 34, py - 70, L, 0, dy, 120);
                streak(img, px, py - 60, L + 40, 0, dy, 150);
                streak(img, px + 34, py - 70, L, 0, dy, 120);
            }
            ball(img, px, py);
            await label(img, "BALL ARENA · landed (" + (bx + 1) + "," + (by + 1) + ") · trail of (" + (ax + 1) + "," + (ay + 1) + ")");
            const sz = await save(img, "ball_s" + ax + ay + "_" + bx + by);
            n++;
            console.log("smear", ax + "," + ay, "->", bx + "," + by, sz);
        }
    }
 // PULSE impacts - ring + dust on the landed cell
    for (let gx = 0; gx < 3; gx++) for (let gy = 0; gy < 3; gy++) {
        const img = new Jimp({ width: W, height: H, color: 0x00000000 });
        gradient(img);
        cellGlowS(img, CELLX[gx], CELLY[gy], 1.15);
        gridLines(img);
        const px = CELLX[gx], py = CELLY[gy];
        ring(img, px, py, 56 + 14, 150);
        ring(img, px, py, 56 + 30, 80);
        for (const [rx, ry] of [[1, 0], [0.707, 0.707], [0, 1], [-0.707, 0.707], [-1, 0], [-0.707, -0.707], [0, -1], [0.707, -0.707]]) {
            ray(img, px, py, rx, ry, 56 + 8, 64, 130);
        }
        ball(img, px, py);
        await label(img, "BALL ARENA · IMPACT at (" + (gx + 1) + "," + (gy + 1) + ")");
        const sz = await save(img, "ball_p" + gx + gy);
        n++;
        console.log("pulse", gx + "," + gy, sz);
    }
    console.log("DONE " + n + " method frames (24 smear + 9 pulse)");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
