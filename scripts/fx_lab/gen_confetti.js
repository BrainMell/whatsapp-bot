// gen_confetti.js - v14 BALL ARENA celebration frames: 2 confetti-burst
// frames (1280x720 + 800x450 thumbs). The bot plays them back-to-back on
// every 5th kick via the proven same-bubble HQ-morph edit - REAL confetti
// ON the card, not the dead react-pill gamble.
const { Jimp, loadFont } = require("jimp");
const path = require("path");
const fs = require("fs");

const FDIR = "/home/ubuntu/whatsapp-bot/node_modules/@jimp/plugin-print/fonts/open-sans";
const ASSETS = "/home/ubuntu/whatsapp-bot/fx_captures/assets";
const W = 1280, H = 720;
const CX = 640, CY = 340;
const TEAL = [31, 191, 168], NAVY_TOP = [13, 20, 30], NAVY_BOT = [10, 26, 28];
const COLORS = [
    [255, 82, 82], [255, 213, 79], [31, 191, 168], [240, 98, 146],
    [100, 181, 246], [255, 167, 38], [245, 248, 250], [129, 212, 250],
];

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
            d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 40;
        });
    }
    for (const [x0, y0, w, h] of [[0, 0, W, 4], [0, H - 4, W, 4], [0, 0, 4, H], [W - 4, 0, 4, H]]) {
        img.scan(x0, y0, w, h, function (x, y, idx) {
            const d = img.bitmap.data;
            d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 255;
        });
    }
}

function ball(img, cx, cy, R) {
    for (let dy = -R - 10; dy <= R + 10; dy++) for (let dx = -R - 10; dx <= R + 10; dx++) {
        const x = cx + dx, y = cy + dy;
        if (x < 0 || y < 0 || x >= W || y >= H) continue;
        const dist = Math.hypot(dx, dy);
        const idx = img.getPixelIndex(x, y);
        const d = img.bitmap.data;
        if (dist <= R - 10) { d[idx] = 245; d[idx + 1] = 248; d[idx + 2] = 250; d[idx + 3] = 255; }
        else if (dist <= R) { d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 255; }
        else if (dist <= R + 6 && dist > R + 3) { d[idx] = TEAL[0]; d[idx + 1] = TEAL[1]; d[idx + 2] = TEAL[2]; d[idx + 3] = 110; }
    }
}

// seeded LCG → deterministic frames
function rng(seed) {
    let s = seed >>> 0;
    return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

function confetti(img, seed, spread, count, drift) {
    const rnd = rng(seed);
    for (let i = 0; i < count; i++) {
        const ang = rnd() * Math.PI * 2;
        const rad = (90 + rnd() * 300) * spread + drift * (rnd() * 40);
        const px = Math.round(CX + Math.cos(ang) * rad);
        const py = Math.round(CY + Math.sin(ang) * rad * 0.72 + drift * 26); // slight fall
        if (px < 10 || px >= W - 10 || py < 10 || py >= H - 10) continue;
        const c = COLORS[Math.floor(rnd() * COLORS.length)];
        const streak = rnd() > 0.45;
        if (streak) {
            const len = 10 + Math.floor(rnd() * 14), th = 3 + Math.floor(rnd() * 3);
            const sa = rnd() * Math.PI;
            const dxs = Math.cos(sa), dys = Math.sin(sa);
            for (let t = 0; t < len; t++) for (let o = -th; o <= th; o++) {
                const x = Math.round(px + dxs * t - dys * o), y = Math.round(py + dys * t + dxs * o);
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const idx = img.getPixelIndex(x, y);
                const d = img.bitmap.data;
                d[idx] = c[0]; d[idx + 1] = c[1]; d[idx + 2] = c[2]; d[idx + 3] = 255;
            }
        } else {
            const r = 4 + Math.floor(rnd() * 5);
            for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy > r * r) continue;
                const x = px + dx, y = py + dy;
                if (x < 0 || x >= W || y < 0 || y >= H) continue;
                const idx = img.getPixelIndex(x, y);
                const d = img.bitmap.data;
                d[idx] = c[0]; d[idx + 1] = c[1]; d[idx + 2] = c[2]; d[idx + 3] = 255;
            }
        }
    }
}

async function label(img, text) {
    const f32 = await loadFont(path.join(FDIR, "open-sans-32-white/open-sans-32-white.fnt"));
    const w = (typeof Jimp.measureText === "function") ? Jimp.measureText(f32, text) : text.length * 19;
    img.print({ font: f32, x: Math.round((W - w) / 2), y: H - 64, text });
}

(async () => {
    const frames = [
        { name: "ball_conf0", seed: 1337, spread: 1.0, count: 46, drift: 0 },
        { name: "ball_conf1", seed: 7331, spread: 1.75, count: 64, drift: 1 },
    ];
    for (const f of frames) {
        const img = new Jimp({ width: W, height: H, color: 0x00000000 });
        gradient(img);
        gridLines(img);
        ball(img, CX, CY, 84);
        confetti(img, f.seed, f.spread, f.count, f.drift);
        await label(img, "MILESTONE KICK - CONFETTI!");
        const out = path.join(ASSETS, f.name + ".jpg");
        const tout = path.join(ASSETS, f.name + "_thumb.jpg");
        await img.write(out);
        await img.clone().resize({ w: 800, h: 450 }).write(tout);
        console.log("frame", f.name, fs.statSync(out).size + "B", fs.statSync(tout).size + "B");
    }
    console.log("DONE");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
