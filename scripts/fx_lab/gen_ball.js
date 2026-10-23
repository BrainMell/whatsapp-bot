// gen_ball.js - v13 BALL ARENA frames: 9 cells (3x3 grid), 1280x720 + 800x450
// thumbs. Teal pitch, white ball + ring at the cell center. The bot GLIDES
// the ball between cells via rapid same-bubble HQ-morph edits (flipbook).
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
 // vertical + horizontal pitch lines through cell boundaries
    const lines = [[W / 6, "v"], [W / 2, "v"], [5 * W / 6, "v"], [H / 6, "h"], [H / 2, "h"], [5 * H / 6, "h"]];
    for (const [p, o] of lines) {
        const x0 = o === "v" ? Math.round(p) : 0, y0 = o === "v" ? 0 : Math.round(p);
        const w = o === "v" ? 2 : W, h = o === "v" ? H : 2;
        img.scan(x0, y0, w, h, function (x, y, idx) {
            const d = img.bitmap.data;
            d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 46;
        });
    }
 // border
    for (const [x0, y0, w, h] of [[0, 0, W, 4], [0, H - 4, W, 4], [0, 0, 4, H], [W - 4, 0, 4, H]]) {
        img.scan(x0, y0, w, h, function (x, y, idx) {
            const d = img.bitmap.data;
            d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 255;
        });
    }
}

function cellGlow(img, cx, cy) {
 // subtle highlight rect on the ball's cell
    const hw = W / 3, hh = H / 3;
    img.scan(Math.round(cx - hw / 2), Math.round(cy - hh / 2), Math.round(hw), Math.round(hh), function (x, y, idx) {
        if (x < 4 || y < 4 || x >= W - 4 || y >= H - 4) return;
        const d = img.bitmap.data;
        d[idx] = Math.min(255, d[idx] + 14); d[idx + 1] = Math.min(255, d[idx + 1] + 24); d[idx + 2] = Math.min(255, d[idx + 2] + 22);
    });
}

function ball(img, cx, cy) {
    const R = 56;
 // shadow
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
 // white disc + teal ring
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
    for (let gx = 0; gx < 3; gx++) {
        for (let gy = 0; gy < 3; gy++) {
            const img = new Jimp({ width: W, height: H, color: 0x00000000 });
            gradient(img);
            cellGlow(img, CELLX[gx], CELLY[gy]);
            gridLines(img);
            ball(img, CELLX[gx], CELLY[gy]);
            await label(img, "BALL ARENA · cell (" + (gx + 1) + "," + (gy + 1) + ") · vote to kick");
            const out = path.join(ASSETS, "ball_g" + gx + "g" + gy + ".jpg");
            const tout = path.join(ASSETS, "ball_g" + gx + "g" + gy + "_thumb.jpg");
            await img.write(out);
            await img.clone().resize({ w: 800, h: 450 }).write(tout);
            console.log("frame", gx, gy, fs.statSync(out).size + "B", fs.statSync(tout).size + "B");
        }
    }
    console.log("DONE");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
