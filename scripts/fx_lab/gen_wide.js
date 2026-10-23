// gen_wide.js - v12d landscape 16:9 link-preview cards (full-width layout test)
// WhatsApp picks narrow side-thumb layout for square thumbs; landscape bytes
// → large full-width card. Same PHASE visual identity as the 720x720 originals.
const { Jimp, loadFont } = require("jimp");
const path = require("path");

const FDIR = "/home/ubuntu/whatsapp-bot/node_modules/@jimp/plugin-print/fonts/open-sans";
const ASSETS = "/home/ubuntu/whatsapp-bot/fx_captures/assets";
const W = 1280, H = 720;

function hex(c) { return [(c >> 16) & 255, (c >> 8) & 255, c & 255]; }

function gradient(img, top, bot) {
    img.scan(0, 0, W, H, function (x, y, idx) {
        const t = y / H;
        const d = img.bitmap.data;
        d[idx] = Math.round(top[0] + (bot[0] - top[0]) * t);
        d[idx + 1] = Math.round(top[1] + (bot[1] - top[1]) * t);
        d[idx + 2] = Math.round(top[2] + (bot[2] - top[2]) * t);
        d[idx + 3] = 255;
    });
}

function bars(img, color) {
    img.scan(0, 0, W, 14, function (x, y, idx) {
        const d = img.bitmap.data;
        d[idx] = color[0]; d[idx + 1] = color[1]; d[idx + 2] = color[2]; d[idx + 3] = 255;
    });
    img.scan(0, H - 14, W, 14, function (x, y, idx) {
        const d = img.bitmap.data;
        d[idx] = color[0]; d[idx + 1] = color[1]; d[idx + 2] = color[2]; d[idx + 3] = 255;
    });
}

function ring(img, cx, cy, r, color) {
    const pad = 3;
    img.scan(cx - r - pad, cy - r - pad, 2 * (r + pad), 2 * (r + pad), function (x, y, idx) {
        if (x < 0 || y < 0 || x >= W || y >= H) return;
        const d = Math.hypot(x - cx, y - cy);
        if (Math.abs(d - r) < 1.6) {
            const px = img.bitmap.data;
            px[idx] = color[0]; px[idx + 1] = color[1]; px[idx + 2] = color[2]; px[idx + 3] = 255;
        }
    });
}

// print white text on a transparent layer, then recolor white glyphs → accent
async function coloredText(font128, font32, font16, text, sub, small, accent) {
    const layer = new Jimp({ width: W, height: H, color: 0x00000000 });
    const wHead = (typeof Jimp.measureText === "function") ? Jimp.measureText(font128, text) : text.length * 78;
    const wSub = (typeof Jimp.measureText === "function") ? Jimp.measureText(font32, sub) : sub.length * 19;
    const wSmall = (typeof Jimp.measureText === "function") ? Jimp.measureText(font16, small) : small.length * 10;
    layer.print({ font: font128, x: Math.round((W - wHead) / 2), y: 250, text });
    layer.print({ font: font32, x: Math.round((W - wSub) / 2), y: 430, text: sub });
    layer.print({ font: font16, x: Math.round((W - wSmall) / 2), y: 495, text: small });
    layer.scan(0, 0, W, H, function (x, y, idx) {
        const d = layer.bitmap.data;
        if (d[idx + 3] > 200 && d[idx] > 230 && d[idx + 1] > 230 && d[idx + 2] > 230) {
            d[idx] = accent[0]; d[idx + 1] = accent[1]; d[idx + 2] = accent[2];
        }
    });
    return layer;
}

async function makeCard(opts) {
    const img = new Jimp({ width: W, height: H, color: 0x00000000 });
    gradient(img, opts.bgTop, opts.bgBot);
    ring(img, 640, 330, 215, opts.ringC);
    bars(img, opts.accent);
    const f128 = await loadFont(path.join(FDIR, "open-sans-128-white/open-sans-128-white.fnt"));
    const f32 = await loadFont(path.join(FDIR, "open-sans-32-white/open-sans-32-white.fnt"));
    const f16 = await loadFont(path.join(FDIR, "open-sans-16-white/open-sans-16-white.fnt"));
    const txt = await coloredText(f128, f32, f16, opts.headline, opts.sub, opts.small, opts.accent);
    img.composite(txt, 0, 0);
    const out = path.join(ASSETS, opts.out);
    const thumbOut = path.join(ASSETS, opts.thumbOut);
    await img.write(out);
    const th = img.clone().resize({ w: 800, h: 450 });
    await th.write(thumbOut);
    return { out, thumbOut };
}

(async () => {
    const teal = { accent: [31, 191, 168], ringC: [31, 191, 168, 90], bgTop: [16, 18, 32], bgBot: [13, 22, 30] };
    const red = { accent: [245, 82, 123], ringC: [245, 82, 123, 90], bgTop: [30, 17, 23], bgBot: [20, 11, 16] };
    const a = await makeCard({ ...teal, out: "morph_wide_a.jpg", thumbOut: "morph_wide_a_thumb.jpg", headline: "PHASE 1", sub: "same bubble · watch the card flip", small: "landscape 16:9 · full-width card test" });
    const b = await makeCard({ ...red, out: "morph_wide_b.jpg", thumbOut: "morph_wide_b_thumb.jpg", headline: "PHASE 2", sub: "PIXELS SWAPPED · SAME BUBBLE", small: "stage 3: editedMessage carried a new preview" });
    for (const f of [a.out, a.thumbOut, b.out, b.thumbOut]) {
        const fs = require("fs");
        console.log(f, fs.statSync(f).size + "B");
    }
    console.log("DONE");
})().catch(e => { console.error("FAIL", e.message); process.exit(1); });
