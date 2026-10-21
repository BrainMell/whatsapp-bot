'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  STRUCTURE SCENES — the zoomed-in "inside the place" cards (owner 2026-10-20:
//  "if someone tries to mine … a zoomed in card that's on the mines with an
//  overlay containing something appropriate … same for everything else — the
//  shop gets the merchant model, hunting grounds, pond, summons barracks").
//
//  One iso close-up per base structure, built from the same KayKit sprites as the
//  base map but at ~2x zoom, with a parchment INFO PANEL (name, level, stats, the
//  commands that work here) and an optional RESULT RIBBON (what you just mined /
//  caught / hunted). Static JPEG, disk-cached by content so repeat views are free.
// ═══════════════════════════════════════════════════════════════════════════
const K = require('./kingdom3d');
const mediaCache = require('./mediaCache');

const W = 1400, H = 1000, PANEL_H = 250;
const SCALE = 0.76;
const COLS = 21, ROWS = 21, CC = 10, CR = 10;
const TEAMS = ['blue', 'green', 'red', 'yellow'];
const mulberry32 = K.mulberry32, hashStr = (s) => K.hashStr(String(s || ''));

function fonts() { try { require('./worldMapRenderer')._ensureFonts(); } catch (e) { /* default fonts */ } }

// ── parchment info panel + result ribbon (shared with the guild-hall card) ──
function wrap(ctx, text, maxW) {
    const words = String(text).split(/\s+/), lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    return lines;
}
/** The ESTABLISHED result ribbon — top-centre, dark + gold double border,
 *  Cinzel Deco head + Cinzel lines. Task 22 (owner: "when I said to use the
 *  same style for the overlays, I meant the other base commands… they already
 *  have an established style"): the animated fish/hunt GIFs draw THEIR loot
 *  banner through this exact painter, so every result overlay in the kingdom
 *  wears the same style at the same proportions. Metrics are scaled off the
 *  1400×1000 card canvas (u = h/1000) — at card size this is pixel-identical
 *  to the old inline block. */
function drawBanner(ctx, w, h, banner = {}) {
    const head = String(banner.head || ''), lines = (banner.lines || []).slice(0, 6);
    if (!head && !lines.length) return;
    const u = h / 1000;
    const bw = Math.min(w - 120 * u, 760 * u), bh = 64 * u + lines.length * 34 * u + 18 * u;
    const bx = (w - bw) / 2, by = 36 * u;
    ctx.save();
    ctx.fillStyle = 'rgba(28,19,10,0.90)'; K.roundRect(ctx, bx, by, bw, bh, 18 * u); ctx.fill();
    ctx.strokeStyle = '#c9a65a'; ctx.lineWidth = Math.max(1.5, 3 * u); K.roundRect(ctx, bx, by, bw, bh, 18 * u); ctx.stroke();
    ctx.strokeStyle = 'rgba(201,166,90,0.35)'; ctx.lineWidth = Math.max(1, u); K.roundRect(ctx, bx + 7 * u, by + 7 * u, bw - 14 * u, bh - 14 * u, 13 * u); ctx.stroke();
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(13, Math.round(34 * u))}px "Cinzel Deco", Cinzel`; ctx.fillStyle = '#f2dfa8';
    ctx.fillText(head.slice(0, 42), w / 2, by + 40 * u);
    ctx.font = `${Math.max(11, Math.round(25 * u))}px Cinzel`; ctx.fillStyle = '#e8d5a3';
    lines.forEach((ln, i) => ctx.fillText(String(ln).slice(0, 56), w / 2, by + 84 * u + i * 34 * u));
    ctx.restore();
}

/**
 * spec: { title, subtitle, rows:[[label,value],...] (≤6), actions:[string,...] (≤5), footer,
 *         banner:{ head, lines:[...] } , accent:'#c9a65a' }
 */
function drawPanel(ctx, w, h, spec = {}) {
    const accent = spec.accent || '#c9a65a';
    // result ribbon floats over the art, top-centre (shared painter — Task 22)
    if (spec.banner && (spec.banner.head || (spec.banner.lines || []).length)) drawBanner(ctx, w, h, spec.banner);
    const x0 = 28, pw = w - 56, y0 = h - PANEL_H - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.90)'; K.roundRect(ctx, x0, y0, pw, PANEL_H, 18); ctx.fill();
    ctx.strokeStyle = '#a67c2e'; ctx.lineWidth = 3; K.roundRect(ctx, x0 + 5, y0 + 5, pw - 10, PANEL_H - 10, 13); ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)'; ctx.lineWidth = 1; K.roundRect(ctx, x0 + 11, y0 + 11, pw - 22, PANEL_H - 22, 9); ctx.stroke();
    ctx.textBaseline = 'middle'; ctx.textAlign = 'left';
    // left block: name + form
    ctx.fillStyle = '#ecd9a6';
    let tf = 40; ctx.font = `${tf}px "Cinzel Deco", Cinzel`;
    while (tf > 22 && ctx.measureText(String(spec.title || '')).width > 405) { tf -= 2; ctx.font = `${tf}px "Cinzel Deco", Cinzel`; }
    ctx.fillText(String(spec.title || '').slice(0, 26), x0 + 34, y0 + 50);
    ctx.font = '23px Medieval'; ctx.fillStyle = accent;
    ctx.fillText(String(spec.subtitle || '').slice(0, 34), x0 + 36, y0 + 92);
    if (spec.note) {
        ctx.font = '19px "IM Fell", Medieval'; ctx.fillStyle = '#b9a173';
        wrap(ctx, spec.note, 400).slice(0, 3).forEach((ln, i) => ctx.fillText(ln, x0 + 36, y0 + 130 + i * 26));
    }
    // middle: stat rows (label dim, value bright)
    const rows = (spec.rows || []).slice(0, 6);
    const mx = x0 + 460, colW = 245;
    rows.forEach(([lab, val], i) => {
        const cx = mx + (i % 2) * colW, cy = y0 + 46 + Math.floor(i / 2) * 50;
        ctx.font = '17px Medieval'; ctx.fillStyle = '#9c8455'; ctx.fillText(String(lab).toUpperCase(), cx, cy);
        ctx.font = '24px Cinzel'; ctx.fillStyle = '#ecd9a6'; ctx.fillText(String(val).slice(0, 14), cx, cy + 24);
    });
    // right: the commands that work here
    const acts = (spec.actions || []).slice(0, 5);
    const ax = x0 + pw - 420;
    ctx.strokeStyle = 'rgba(166,124,46,0.4)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(ax - 22, y0 + 28); ctx.lineTo(ax - 22, y0 + PANEL_H - 28); ctx.stroke();
    ctx.font = '17px Cinzel'; ctx.fillStyle = '#9c8455'; ctx.fillText('HERE YOU CAN', ax, y0 + 38);
    acts.forEach((a, i) => { ctx.font = '21px Medieval'; ctx.fillStyle = '#e8d5a3'; ctx.fillText(String(a).slice(0, 34), ax, y0 + 76 + i * 33); });
    if (spec.footer) {
        ctx.textAlign = 'center'; ctx.font = '17px Medieval'; ctx.fillStyle = '#7a663f';
        ctx.fillText(String(spec.footer).slice(0, 90), x0 + pw / 2, y0 + PANEL_H - 22);
    }
    ctx.restore();
}


// ── hunting-ground critters + campfire (procedural, no animal sprites in the pack) ──
function shade(ctx, x, y, rx, ry, a = 0.28) { ctx.save(); ctx.fillStyle = `rgba(20,14,6,${a})`; ctx.beginPath(); ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
function drawDeer(ctx, x, y, s, flip = false, stag = true) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    shade(ctx, 0, 0.05 * s, 1.15 * s, 0.26 * s);
    const body = '#a86a38', dark = '#6e4220', belly = '#e0c08e';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // far legs, body, near legs
    ctx.strokeStyle = dark; ctx.lineWidth = 0.13 * s;
    for (const [lx, o] of [[-0.62, 0.05], [0.55, -0.04]]) { ctx.beginPath(); ctx.moveTo(lx + 0.12 * s, -0.75 * s); ctx.lineTo(lx * s + o * s, -0.02 * s); ctx.stroke(); }
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.ellipse(0, -0.95 * s, 0.95 * s, 0.46 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = belly; ctx.beginPath(); ctx.ellipse(0.05 * s, -0.72 * s, 0.7 * s, 0.17 * s, 0, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = 0.13 * s;
    for (const [lx, o] of [[-0.45, -0.04], [0.7, 0.05]]) { ctx.beginPath(); ctx.moveTo(lx * s, -0.7 * s); ctx.lineTo(lx * s + o * s, -0.02 * s); ctx.stroke(); }
    // tail
    ctx.fillStyle = '#f4ead6'; ctx.beginPath(); ctx.ellipse(-0.98 * s, -1.08 * s, 0.1 * s, 0.17 * s, -0.5, 0, Math.PI * 2); ctx.fill();
    // neck + head
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.moveTo(0.65 * s, -1.25 * s); ctx.lineTo(1.0 * s, -1.95 * s); ctx.lineTo(1.28 * s, -1.85 * s); ctx.lineTo(1.0 * s, -1.0 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(1.28 * s, -1.9 * s, 0.3 * s, 0.17 * s, 0.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#2a1a0c'; ctx.beginPath(); ctx.arc(1.52 * s, -1.84 * s, 0.045 * s, 0, Math.PI * 2); ctx.fill();        // nose
    ctx.beginPath(); ctx.arc(1.3 * s, -1.95 * s, 0.035 * s, 0, Math.PI * 2); ctx.fill();                                    // eye
    ctx.fillStyle = body; ctx.beginPath(); ctx.ellipse(1.05 * s, -2.05 * s, 0.1 * s, 0.2 * s, -0.5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();   // ear
    if (stag) {                                                                                                              // antlers
        ctx.strokeStyle = '#e6d3a8'; ctx.lineWidth = 0.06 * s;
        const br = (bx, by, dx, dy) => { ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx + dx * s, by + dy * s); ctx.stroke(); };
        const ax = 1.12 * s, ay = -2.1 * s;
        br(ax, ay, -0.12, -0.55); br(ax - 0.12 * s, ay - 0.55 * s, -0.22, -0.18); br(ax - 0.12 * s, ay - 0.55 * s, 0.14, -0.2); br(ax - 0.05 * s, ay - 0.3 * s, 0.25, -0.12);
        br(ax + 0.12 * s, ay + 0.02 * s, 0.1, -0.5); br(ax + 0.22 * s, ay - 0.48 * s, 0.2, -0.14); br(ax + 0.22 * s, ay - 0.48 * s, -0.08, -0.22);
    }
    ctx.restore();
}
function drawBoar(ctx, x, y, s, flip = false) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    shade(ctx, 0, 0.05 * s, 1.0 * s, 0.24 * s);
    const body = '#4a3526', dark = '#241810';
    ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.strokeStyle = dark; ctx.lineWidth = 0.14 * s;
    for (const lx of [-0.55, -0.25, 0.3, 0.6]) { ctx.beginPath(); ctx.moveTo(lx * s, -0.5 * s); ctx.lineTo(lx * s, -0.02 * s); ctx.stroke(); }
    ctx.fillStyle = body; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.ellipse(0, -0.78 * s, 0.9 * s, 0.5 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#5c4331'; ctx.beginPath(); ctx.ellipse(0.7 * s, -0.8 * s, 0.42 * s, 0.4 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();           // shoulder / head mass
    ctx.fillStyle = '#c99a86'; ctx.beginPath(); ctx.ellipse(1.12 * s, -0.7 * s, 0.17 * s, 0.14 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();           // snout
    ctx.strokeStyle = '#f1e6c8'; ctx.lineWidth = 0.06 * s; ctx.beginPath(); ctx.moveTo(1.02 * s, -0.62 * s); ctx.quadraticCurveTo(1.12 * s, -0.42 * s, 1.0 * s, -0.4 * s); ctx.stroke();   // tusk
    ctx.fillStyle = '#120a04'; ctx.beginPath(); ctx.arc(0.92 * s, -0.92 * s, 0.045 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = body; ctx.strokeStyle = dark; ctx.lineWidth = 0.04 * s; ctx.beginPath(); ctx.moveTo(0.62 * s, -1.12 * s); ctx.lineTo(0.78 * s, -1.38 * s); ctx.lineTo(0.9 * s, -1.08 * s); ctx.closePath(); ctx.fill(); ctx.stroke();   // ear
    ctx.strokeStyle = dark; ctx.lineWidth = 0.07 * s; ctx.beginPath(); ctx.moveTo(-0.85 * s, -0.9 * s); ctx.quadraticCurveTo(-1.1 * s, -1.0 * s, -1.05 * s, -0.78 * s); ctx.stroke();   // tail
    ctx.restore();
}
// ── summon sprites (the real KayKit-style 320px summon art in rpgasset/summons) standing on the barracks ground ──
const SUMMON_POOL = ['agumon', 'angemon', 'ancientgreymon', 'andromon', 'ankylomon', 'aegiochusmon', 'airdramon', 'ancientgarurumon', 'apollomon', 'angewomon'];
const _sumImg = new Map();
function loadSummon(name) {
    if (_sumImg.has(name)) return _sumImg.get(name);
    let im = null;
    try {
        const { Image } = require('canvas');
        const fs = require('fs'), path = require('path');
        const f = path.join(__dirname, '..', 'rpgasset', 'summons', 'digimon', name + '.png');
        const buf = fs.readFileSync(f);
        if (buf.length > 2000) { im = new Image(); im.src = buf; }
    } catch (e) { im = null; }
    _sumImg.set(name, im);
    return im;
}
function pickSummons(seed, n) {
    const pool = SUMMON_POOL.filter((nm) => loadSummon(nm));
    const out = []; let h = (seed >>> 0) || 1;
    while (out.length < n && pool.length) { h = (h * 1664525 + 1013904223) >>> 0; out.push(pool.splice(h % pool.length, 1)[0]); }
    return out;
}
function drawSummonSprite(ctx, x, y, size, name, flip = false) {
    const im = loadSummon(name); if (!im) return;
    ctx.save(); ctx.translate(x, y);
    shade(ctx, 0, 0, size * 0.36, size * 0.1);
    if (flip) ctx.scale(-1, 1);
    ctx.drawImage(im, -size / 2, -size * 0.92, size, size);
    ctx.restore();
}
function drawCampfire(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, -0.3 * s, 0.1 * s, 0, -0.3 * s, 2.4 * s);
    g.addColorStop(0, 'rgba(255,190,90,0.55)'); g.addColorStop(1, 'rgba(255,150,40,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, -0.2 * s, 2.6 * s, 1.5 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.lineCap = 'round'; ctx.strokeStyle = '#4a2c14'; ctx.lineWidth = 0.28 * s;
    ctx.beginPath(); ctx.moveTo(-0.7 * s, -0.05 * s); ctx.lineTo(0.7 * s, -0.35 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-0.7 * s, -0.35 * s); ctx.lineTo(0.7 * s, -0.05 * s); ctx.stroke();
    const flame = (w0, h0, col, dy) => { ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(-w0, -0.25 * s + dy); ctx.quadraticCurveTo(-w0 * 1.1, -h0 * 0.55 + dy, 0, -h0 + dy); ctx.quadraticCurveTo(w0 * 1.1, -h0 * 0.55 + dy, w0, -0.25 * s + dy); ctx.closePath(); ctx.fill(); };
    flame(0.55 * s, 1.5 * s, '#e8541a', 0); flame(0.4 * s, 1.15 * s, '#ff9a2a', 0); flame(0.22 * s, 0.75 * s, '#ffe27a', 0);
    ctx.restore();
}

// ── fusion painters (base ⇄ command fusion, owner spec 2026-10-21) ──
// Low-poly canvas figures in the same flat-shaded style as the KayKit sprites:
// the missing props the manifest has no model for (merchant, miner, anvil,
// cauldron, bottles, med cross, summoning circle, fish silhouettes).
function drawMerchant(ctx, x, y, s, flip = false, wave = true) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    shade(ctx, 0, 0.04 * s, 0.55 * s, 0.16 * s, 0.25);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // legs + boots
    ctx.strokeStyle = '#3d2c18'; ctx.lineWidth = 0.11 * s;
    ctx.beginPath(); ctx.moveTo(-0.14 * s, -0.42 * s); ctx.lineTo(-0.16 * s, -0.02 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.14 * s, -0.42 * s); ctx.lineTo(0.16 * s, -0.02 * s); ctx.stroke();
    // tunic body (warm merchant red) + apron
    ctx.fillStyle = '#8f3b2a'; ctx.strokeStyle = '#4a1f14'; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.moveTo(-0.34 * s, -0.42 * s); ctx.lineTo(0.34 * s, -0.42 * s); ctx.lineTo(0.26 * s, -1.25 * s); ctx.lineTo(-0.26 * s, -1.25 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#d9c193'; ctx.beginPath(); ctx.moveTo(-0.16 * s, -0.42 * s); ctx.lineTo(0.16 * s, -0.42 * s); ctx.lineTo(0.12 * s, -1.1 * s); ctx.lineTo(-0.12 * s, -1.1 * s); ctx.closePath(); ctx.fill();
    // arms — one resting, one raised in a welcome wave
    ctx.strokeStyle = '#8f3b2a'; ctx.lineWidth = 0.12 * s;
    ctx.beginPath(); ctx.moveTo(-0.26 * s, -1.12 * s); ctx.lineTo(-0.42 * s, -0.6 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.26 * s, -1.12 * s); ctx.quadraticCurveTo(0.52 * s, -1.25 * s, wave ? 0.44 * s : 0.5 * s, wave ? -1.6 * s : -0.7 * s); ctx.stroke();
    ctx.fillStyle = '#e8c39a'; ctx.beginPath(); ctx.arc(wave ? 0.44 * s : 0.5 * s, wave ? -1.66 * s : -0.66 * s, 0.09 * s, 0, Math.PI * 2); ctx.fill();
    // head + beard + hat
    ctx.fillStyle = '#e8c39a'; ctx.beginPath(); ctx.arc(0, -1.5 * s, 0.26 * s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#cfc4b0'; ctx.beginPath(); ctx.moveTo(-0.16 * s, -1.42 * s); ctx.quadraticCurveTo(0, -1.1 * s, 0.16 * s, -1.42 * s); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#6b4a26'; ctx.beginPath(); ctx.ellipse(0, -1.74 * s, 0.34 * s, 0.09 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-0.2 * s, -1.74 * s); ctx.quadraticCurveTo(0, -2.05 * s, 0.2 * s, -1.74 * s); ctx.closePath(); ctx.fill();
    ctx.restore();
}
function drawMiner(ctx, x, y, s, flip = false) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    shade(ctx, 0, 0.04 * s, 0.5 * s, 0.15 * s, 0.25);
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    ctx.strokeStyle = '#2f2418'; ctx.lineWidth = 0.11 * s;
    ctx.beginPath(); ctx.moveTo(-0.12 * s, -0.4 * s); ctx.lineTo(-0.14 * s, -0.02 * s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(0.12 * s, -0.4 * s); ctx.lineTo(0.14 * s, -0.02 * s); ctx.stroke();
    // body (work tunic) + arms mid-swing
    ctx.fillStyle = '#5b6a4a'; ctx.strokeStyle = '#2c3322'; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.4 * s); ctx.lineTo(0.3 * s, -0.4 * s); ctx.lineTo(0.24 * s, -1.18 * s); ctx.lineTo(-0.24 * s, -1.18 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = '#5b6a4a'; ctx.lineWidth = 0.12 * s;
    ctx.beginPath(); ctx.moveTo(-0.2 * s, -1.05 * s); ctx.lineTo(-0.34 * s, -0.6 * s); ctx.stroke();
    // swing arm + pickaxe raised overhead
    ctx.beginPath(); ctx.moveTo(0.2 * s, -1.05 * s); ctx.lineTo(0.5 * s, -1.5 * s); ctx.stroke();
    ctx.save(); ctx.translate(0.5 * s, -1.5 * s); ctx.rotate(-0.65);
    ctx.strokeStyle = '#6e4a24'; ctx.lineWidth = 0.07 * s;
    ctx.beginPath(); ctx.moveTo(-0.34 * s, 0.1 * s); ctx.lineTo(0.34 * s, -0.1 * s); ctx.stroke();
    ctx.strokeStyle = '#9aa3ad'; ctx.lineWidth = 0.1 * s;
    ctx.beginPath(); ctx.arc(0.42 * s, -0.14 * s, 0.2 * s, Math.PI * 0.75, Math.PI * 1.85); ctx.stroke();
    ctx.restore();
    // head + helmet + lamp
    ctx.fillStyle = '#e8c39a'; ctx.beginPath(); ctx.arc(0, -1.4 * s, 0.24 * s, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#d7a13c'; ctx.beginPath(); ctx.arc(0, -1.5 * s, 0.27 * s, Math.PI, 0); ctx.fill();
    ctx.fillRect(-0.3 * s, -1.52 * s, 0.6 * s, 0.07 * s);
    ctx.fillStyle = '#ffe9a3'; ctx.beginPath(); ctx.arc(0.16 * s, -1.62 * s, 0.07 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}
function drawSparks(ctx, x, y, s, seed = 1, n = 5) {
    const rng = mulberry32(hashStr(`spark:${seed}`));
    ctx.save(); ctx.translate(x, y);
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (rng() - 0.5) * 2.2, d = (0.35 + rng() * 1.15) * s, r = (0.03 + rng() * 0.05) * s;
        ctx.fillStyle = ['#ffd45e', '#ff9a2a', '#e8541a'][i % 3];
        ctx.globalAlpha = 0.55 + rng() * 0.45;
        ctx.beginPath(); ctx.arc(Math.cos(a) * d, Math.sin(a) * d * 0.85, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
}
function drawAnvil(ctx, x, y, s, hot = false) {
    ctx.save(); ctx.translate(x, y);
    shade(ctx, 0, 0.03 * s, 0.6 * s, 0.15 * s, 0.28);
    // glowing metal billet on the face
    if (hot) {
        const g = ctx.createRadialGradient(0, -0.72 * s, 0.02 * s, 0, -0.72 * s, 0.85 * s);
        g.addColorStop(0, 'rgba(255,160,60,0.85)'); g.addColorStop(1, 'rgba(255,120,30,0)');
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, -0.72 * s, 0.85 * s, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#ff8c2e'; ctx.beginPath(); ctx.ellipse(0.02 * s, -0.74 * s, 0.3 * s, 0.08 * s, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.fillStyle = '#3c4148'; ctx.strokeStyle = '#191c20'; ctx.lineWidth = 0.04 * s;
    // horn + face
    ctx.beginPath(); ctx.moveTo(-0.55 * s, -0.62 * s); ctx.lineTo(0.2 * s, -0.7 * s); ctx.lineTo(0.62 * s, -0.6 * s); ctx.lineTo(0.28 * s, -0.48 * s); ctx.lineTo(-0.5 * s, -0.48 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    // waist + base
    ctx.fillRect(-0.14 * s, -0.5 * s, 0.28 * s, 0.22 * s);
    ctx.beginPath(); ctx.moveTo(-0.3 * s, -0.28 * s); ctx.lineTo(0.3 * s, -0.28 * s); ctx.lineTo(0.38 * s, -0.02 * s); ctx.lineTo(-0.38 * s, -0.02 * s); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
}
function drawForgeGlow(ctx, x, y, s, strength = 1) {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, 0.1 * s, 0, 0, 1.6 * s);
    g.addColorStop(0, `rgba(255,140,40,${0.55 * strength})`); g.addColorStop(0.5, `rgba(255,100,25,${0.28 * strength})`); g.addColorStop(1, 'rgba(255,90,20,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, 1.6 * s, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}
function drawCauldron(ctx, x, y, s, liquid = '#7ce07c', steam = true) {
    ctx.save(); ctx.translate(x, y);
    shade(ctx, 0, 0.04 * s, 0.8 * s, 0.2 * s, 0.3);
    // liquid glow
    const lg = ctx.createRadialGradient(0, -0.88 * s, 0.05 * s, 0, -0.88 * s, 0.9 * s);
    lg.addColorStop(0, liquid); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.globalAlpha = 0.5; ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(0, -0.88 * s, 0.9 * s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
    // body: squat black pot on legs
    ctx.fillStyle = '#26221e'; ctx.strokeStyle = '#0e0c0a'; ctx.lineWidth = 0.05 * s;
    ctx.beginPath(); ctx.ellipse(0, -0.55 * s, 0.72 * s, 0.55 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    // rim + liquid surface
    ctx.fillStyle = '#383028'; ctx.beginPath(); ctx.ellipse(0, -0.94 * s, 0.68 * s, 0.2 * s, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = liquid; ctx.beginPath(); ctx.ellipse(0, -0.94 * s, 0.55 * s, 0.13 * s, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.ellipse(-0.18 * s, -0.97 * s, 0.12 * s, 0.035 * s, 0, 0, Math.PI * 2); ctx.fill();
    // legs
    ctx.strokeStyle = '#0e0c0a'; ctx.lineWidth = 0.07 * s;
    for (const lx of [-0.4, 0, 0.4]) { ctx.beginPath(); ctx.moveTo(lx * s, -0.22 * s); ctx.lineTo(lx * 1.1 * s, -0.02 * s); ctx.stroke(); }
    if (steam) {
        ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 0.06 * s; ctx.lineCap = 'round';
        for (const [ox, h] of [[-0.2, 0.9], [0.05, 1.25], [0.28, 0.75]]) {
            ctx.beginPath(); ctx.moveTo(ox * s, -1.05 * s);
            ctx.bezierCurveTo((ox - 0.18) * s, (-1.05 - h * 0.4) * s, (ox + 0.2) * s, (-1.05 - h * 0.7) * s, ox * s, (-1.05 - h) * s);
            ctx.stroke();
        }
    }
    ctx.restore();
}
function drawBottleShelf(ctx, x, y, s, colors = ['#7ce07c', '#6ea8ff', '#c07cff', '#ffd45e']) {
    ctx.save(); ctx.translate(x, y);
    shade(ctx, 0.1 * s, 0.02 * s, 1.05 * s, 0.18 * s, 0.22);
    // low wooden bench
    ctx.fillStyle = '#6e4a24'; ctx.strokeStyle = '#3d2a12'; ctx.lineWidth = 0.04 * s;
    ctx.fillRect(-1.0 * s, -0.55 * s, 2.0 * s, 0.14 * s); ctx.strokeRect(-1.0 * s, -0.55 * s, 2.0 * s, 0.14 * s);
    ctx.strokeStyle = '#3d2a12'; ctx.lineWidth = 0.06 * s;
    for (const lx of [-0.85, 0.85]) { ctx.beginPath(); ctx.moveTo(lx * s, -0.42 * s); ctx.lineTo(lx * s, -0.02 * s); ctx.stroke(); }
    // corked flasks
    colors.slice(0, 4).forEach((c, i) => {
        const bx = (-0.68 + i * 0.45) * s, bs = s * (0.85 + (i % 2) * 0.2);
        ctx.fillStyle = c; ctx.globalAlpha = 0.9; ctx.strokeStyle = '#1c1710'; ctx.lineWidth = 0.035 * bs;
        ctx.beginPath(); ctx.moveTo(bx - 0.1 * bs, -0.56 * bs * 0.55 - 0.28 * bs); ctx.lineTo(bx + 0.1 * bs, -0.56 * bs * 0.55 - 0.28 * bs); ctx.lineTo(bx + 0.16 * bs, -0.56 * bs); ctx.lineTo(bx - 0.16 * bs, -0.56 * bs); ctx.closePath(); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.arc(bx, -0.56 * bs * 0.55 - 0.06 * bs, 0.15 * bs, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#8a6a3a'; ctx.fillRect(bx - 0.05 * bs, -0.56 * bs * 0.55 - 0.42 * bs, 0.1 * bs, 0.13 * bs);
        ctx.globalAlpha = 1;
    });
    ctx.restore();
}
function drawSummonCircle(ctx, x, y, r, color = '#8f7bff') {
    ctx.save(); ctx.translate(x, y);
    const g = ctx.createRadialGradient(0, 0, r * 0.1, 0, 0, r);
    g.addColorStop(0, 'rgba(143,123,255,0.30)'); g.addColorStop(1, 'rgba(143,123,255,0)');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = Math.max(2, r * 0.07); ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(0, 0, r * 0.62, r * 0.28, 0, 0, Math.PI * 2); ctx.stroke();
    // runes around the ring
    ctx.fillStyle = color;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath(); ctx.ellipse(Math.cos(a) * r * 0.82, Math.sin(a) * r * 0.37, r * 0.06, r * 0.09, 0, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore(); ctx.globalAlpha = 1;
}
function drawMedCross(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#f4f1e6'; ctx.strokeStyle = '#b04a3a'; ctx.lineWidth = 0.06 * s;
    const w = 0.62 * s, h = 0.78 * s;
    K.roundRect(ctx, -w / 2, -h, w, h, 0.1 * s); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#c0392b';
    ctx.fillRect(-0.1 * s, -0.66 * s, 0.2 * s, 0.52 * s); ctx.fillRect(-0.24 * s, -0.5 * s, 0.48 * s, 0.2 * s);
    ctx.restore();
}
function drawHealSparkles(ctx, x, y, s, seed = 1, n = 5) {
    const rng = mulberry32(hashStr(`heal:${seed}`));
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = '#8ff0a8'; ctx.lineWidth = 0.05 * s; ctx.lineCap = 'round';
    for (let i = 0; i < n; i++) {
        const px = (rng() - 0.5) * 2.4 * s, py = -(0.3 + rng() * 1.6) * s, r = (0.09 + rng() * 0.08) * s;
        ctx.globalAlpha = 0.5 + rng() * 0.4;
        ctx.beginPath(); ctx.moveTo(px - r, py); ctx.lineTo(px + r, py); ctx.moveTo(px, py - r); ctx.lineTo(px, py + r); ctx.stroke();
    }
    ctx.restore(); ctx.globalAlpha = 1;
}
function drawFishShadow(ctx, x, y, s, wig = 0, flip = false) {
    ctx.save(); ctx.translate(x, y); if (flip) ctx.scale(-1, 1);
    ctx.fillStyle = 'rgba(12,52,54,0.35)';
    ctx.beginPath(); ctx.ellipse(0, 0, 0.62 * s, 0.2 * s, 0, 0, Math.PI * 2); ctx.fill();
    // tail sways with wig
    ctx.beginPath(); ctx.moveTo(-0.5 * s, 0);
    ctx.lineTo(-0.92 * s, (-0.22 + wig * 0.16) * s); ctx.lineTo(-0.92 * s, (0.22 + wig * 0.16) * s); ctx.closePath(); ctx.fill();
    ctx.restore();
}
function drawBobber(ctx, x, y, s) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = '#d94f3a'; ctx.beginPath(); ctx.arc(0, -0.1 * s, 0.12 * s, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#f4f1e6'; ctx.beginPath(); ctx.arc(0, -0.1 * s, 0.12 * s, 0, Math.PI); ctx.fill();
    ctx.strokeStyle = 'rgba(240,248,255,0.8)'; ctx.lineWidth = 0.03 * s;
    ctx.beginPath(); ctx.moveTo(0, -0.22 * s); ctx.lineTo(0, -0.55 * s); ctx.stroke();
    ctx.restore();
}
function drawRipple(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y); ctx.strokeStyle = 'rgba(235,250,252,0.7)'; ctx.lineWidth = Math.max(1.5, r * 0.06);
    for (const f of [1, 0.62, 0.3]) { ctx.globalAlpha = f; ctx.beginPath(); ctx.ellipse(0, 0, r * f, r * f * 0.42, 0, 0, Math.PI * 2); ctx.stroke(); }
    ctx.restore(); ctx.globalAlpha = 1;
}
function drawSpotlight(ctx, x, y, r) {
    ctx.save(); ctx.translate(x, y);
    ctx.fillStyle = 'rgba(255,214,110,0.16)'; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = '#ffd66e'; ctx.lineWidth = Math.max(2, r * 0.055); ctx.setLineDash([r * 0.22, r * 0.16]);
    ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // attention glints
    ctx.strokeStyle = '#ffe9a3'; ctx.lineWidth = Math.max(1.5, r * 0.04);
    for (const [gx, gy, gr] of [[-r * 0.8, -r * 0.3, r * 0.1], [r * 0.85, -r * 0.2, r * 0.08]]) {
        ctx.beginPath(); ctx.moveTo(gx - gr, gy); ctx.lineTo(gx + gr, gy); ctx.moveTo(gx, gy - gr); ctx.lineTo(gx, gy + gr); ctx.stroke();
    }
    ctx.restore();
}

// ── per-structure close-up compositions ──
const TREES = ['trees_A_large', 'trees_B_large', 'trees_A_medium', 'trees_B_medium'];
const SMALL = ['tree_single_A', 'tree_single_B', 'rock_single_A', 'rock_single_B', 'rock_single_C'];
const ROCKY = new Set(['desert', 'volcanic']);

function buildScene(type, lvl, biome, seed, o = {}) {
    // base ⇄ command fusion (owner spec 2026-10-21): o.activity names what is
    // happening here ('shopping'|'mining'|'fishing'|'hunting'|'summoning'|
    // 'healing'|'forging'|'repair'|'brewing'|'browse'), o.spotlight marks an
    // actual result target, o.tint colours the alchemy liquid. Viewer cards
    // pass none — clean scene, identity dressing only.
    const activity = String(o.activity || '');
    const rng = mulberry32(seed);
    const team = TEAMS[Math.floor(rng() * 4)];
    const w = new K.HexWorld(COLS, ROWS, { scale: SCALE, biome, oobWater: false, view: 'iso' });
    const cen = K.hexWorld(CC, CR);
    const P = (n, o = {}) => w.put(n, 0, 0, { wx: cen.x, wz: cen.z, ...o });
    const B = (n) => `building_${n}_${team}`;
    const has = (n) => K.hasSprite(n, 'iso');

    // pond: carve the lake first (direction varies per owner), before terrain resolves
    let pier = null, hunt = false;
    if (type === 'pond') {
        const ang = rng() * Math.PI * 2;
        const lw = { x: cen.x + Math.cos(ang) * 3.9, z: cen.z + Math.sin(ang) * 3.2 };
        let best = [CC, CR], bd = 1e9;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const q = K.hexWorld(c, r); const d = Math.hypot(q.x - lw.x, q.z - lw.z); if (d < bd) { bd = d; best = [c, r]; } }
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const d = K.hexDist(best[0], best[1], c, r);
            if ((d <= 1 || (d === 2 && rng() < 0.3)) && K.hexDist(CC, CR, c, r) >= 3) { const k = w.cell[r][c]; k.water = true; k.lake = true; }
        }
        pier = { lake: best, lw };
    }
    w.resolve();

    // the ground the place stands on
    if (type !== 'pond') P('building_dirt', { layer: 'flat', sc: 2.3 });
    if (type === 'pond') {
        // shore cell = land cell nearest the lake centre, pier heads straight at the water
        const [lc, lr] = pier.lake;
        let sc = [CC, CR], sd = 1e9;
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
            const k = w.cell[r][c]; if (k.water || k.river) continue;
            const d = K.hexDist(lc, lr, c, r); if (d < sd && K.hexDist(CC, CR, c, r) <= 4) { sd = d; sc = [c, r]; }
        }
        let pd = 0, pb = 1e9;
        for (let e = 0; e < 6; e++) { const nb = K.neighbor(sc[0], sc[1], e); const d = K.hexDist(nb[0], nb[1], lc, lr); if (d < pb) { pb = d; pd = e; } }
        const len = lvl === 1 ? 2 : lvl === 2 ? 3 : 4;
        w.resolve();
        { let cc = sc[0], rr = sc[1]; for (let i = 0; i < len; i++) { const nb = K.neighbor(cc, rr, pd); const kk = w.at(nb[0], nb[1]); if (kk) { kk.water = true; kk.lake = true; kk.river = false; } cc = nb[0]; rr = nb[1]; } }
        w.resolve();
        const cells = w.layPier(sc[0], sc[1], pd, len);
        const last = cells[cells.length - 1];
        if (last) { w.put('barrel', last[0], last[1], { dx: 0.15, dz: 0.2, h: 0.12, sc: 0.9 }); w.put('bucket_water', last[0], last[1], { dx: -0.3, dz: -0.2, h: 0.12 }); }
        const s0 = K.hexWorld(sc[0], sc[1]), s1 = K.hexWorld(...K.neighbor(sc[0], sc[1], pd));
        const vx = s1.x - s0.x, vz = s1.z - s0.z, px = -vz, pz = vx;
        const dry = (x, z) => { let bd2 = 1e9, ok = false; for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const q = K.hexWorld(c, r); const d = Math.hypot(q.x - x, q.z - z); if (d < bd2) { bd2 = d; ok = !w.cell[r][c].water && !w.cell[r][c].river; } } return ok; };
        const put = (n, a, b, o = {}) => { for (let t = 0; t < 4; t++) { const x = s0.x - vx * (a + t * 0.7) + px * b, z = s0.z - vz * (a + t * 0.7) + pz * b; if (dry(x, z)) { w.put(n, 0, 0, { wx: x, wz: z, ...o }); return; } } };
        put('barrel', 1.0, 0.7, { sc: 1.1 }); put('crate_open', 0.8, -0.9, { sc: 1.1 }); put('bucket_water', 1.3, 0.1);
        put('sack', 1.7, 1.0); if (lvl >= 2) put('resource_lumber', 1.5, -1.5, { sc: 1.1 });
        if (lvl >= 3 && has(B('watermill'))) put(B('watermill'), 2.8, 0.3, { sc: 1.3 });
        else put('tent', 2.6, 0.4, { sc: 1.5 });
        const rl = ['waterlily_A', 'waterlily_B', 'waterplant_A', 'waterplant_B'];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const k = w.cell[r][c]; if (k.tile === 'hex_water' && k.lake && rng() < 0.2) w.put(rl[Math.floor(rng() * 4)], c, r, { dx: (rng() - 0.5) * 0.8, dz: (rng() - 0.5) * 0.6, h: -0.2 }); }
        // 🎣 §13: dark-teal fish silhouettes cruise under the surface (ambient
        // identity — the viewer keeps them, the catch adds bobber + ripple).
        const wp2 = (dx, dz) => ({ x: cen.x + dx, z: cen.z + dz });
        const waterCells = [];
        for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) { const k = w.cell[r][c]; if (k.water && k.lake) waterCells.push([c, r]); }
        const nf = 4 + Math.floor(rng() * 4);
        for (let i = 0; i < nf && waterCells.length; i++) {
            const [fc, fr] = waterCells[Math.floor(rng() * waterCells.length)];
            const q = K.hexWorld(fc, fr);
            const fx = q.x + (rng() - 0.5) * 0.8, fz = q.z + (rng() - 0.5) * 0.8;
            const fs = (26 + rng() * 22) * (i === 0 && activity === 'fishing' ? 1.7 : 1);
            w.overlay((c2, p, k) => drawFishShadow(c2, p.x, p.y, fs * k * 2 / 1.5, (i % 3) - 1, rng() < 0.5), 0, 0, { dx: wp2(fx - cen.x, fz - cen.z).x, dz: wp2(fx - cen.x, fz - cen.z).z });
        }
        if (activity === 'fishing' && last) {
            const bq = K.hexWorld(last[0], last[1]);
            w.overlay((c2, p, k) => drawBobber(c2, p.x, p.y, 30 * k * 2 / 1.5), 0, 0, { dx: bq.x + 0.5 - cen.x, dz: bq.z + 0.3 - cen.z });
            if (o.spotlight) w.overlay((c2, p, k) => drawRipple(c2, p.x, p.y, 90 * k * 2 / 1.5), 0, 0, { dx: bq.x + 0.5 - cen.x, dz: bq.z + 0.3 - cen.z });
        }
        return { w, cen, team, water: true, focus: { x: cen.x * 0.35 + pier.lw.x * 0.65, z: cen.z * 0.35 + pier.lw.z * 0.65 } };
    }
    switch (type) {
        case 'mines': {
            const mt = biome === 'desert' || biome === 'volcanic' ? ['mountain_A', 'mountain_B', 'mountain_C'] : ['mountain_A_grass_trees', 'mountain_B_grass_trees', 'mountain_C_grass_trees'];
            P(mt[0], { dx: -3.4, dz: -3.1, sc: 1.1 }); P(mt[1], { dx: 2.6, dz: -3.7, sc: 1.1 }); P(mt[2 % mt.length], { dx: -0.4, dz: -4.4, sc: 1.2 });
            if (has(B('mine'))) P(B('mine'), { sc: lvl === 1 ? 2.9 : lvl === 2 ? 3.2 : 3.5, dx: 0.1, dz: 0.1 });
            else P('struct_mine_cave', { sc: 3.0 });
            P('resource_stone', { dx: 2.3, dz: 1.6, sc: 1.5 }); P('resource_stone', { dx: 3.1, dz: 0.9, sc: 1.2 });
            P('wheelbarrow', { dx: 1.5, dz: 2.4, sc: 1.2 });
            if (lvl >= 2) { P('ladder', { dx: -2.2, dz: 0.8, sc: 1.4 }); P('crate_long_A', { dx: -2.9, dz: 1.7, sc: 1.2 }); }
            if (lvl >= 3) { P('building_scaffolding', { dx: -2.6, dz: -0.6, sc: 1.5, flip: true }); P('resource_lumber', { dx: 0.4, dz: 2.9, sc: 1.2 }); P('crate_B_big', { dx: -1.6, dz: 2.5, sc: 1.1 }); }
            // ⛏️ §12: a miner working the face — pickaxe up, chips flying
            if (activity === 'mining') {
                w.overlay((c2, p, k) => drawMiner(c2, p.x, p.y, 52 * k * 2 / 1.5, true), 0, 0, { dx: cen.x + 1.6, dz: cen.z + 1.9 });
                w.overlay((c2, p, k) => drawSparks(c2, p.x - 18 * (k * 2 / 1.5), p.y - 60 * (k * 2 / 1.5), 40 * k * 2 / 1.5, seed, 7), 0, 0, { dx: cen.x + 1.6, dz: cen.z + 1.9 });
            }
            break;
        }
        case 'shop': {
            P(B('market'), { sc: lvl === 1 ? 2.3 : lvl === 2 ? 2.7 : 3.1 });
            P('crate_A_big', { dx: 2.5, dz: 1.3, sc: 1.3 }); P('barrel', { dx: -2.4, dz: 1.5, sc: 1.4 }); P('sack', { dx: 3.1, dz: 0.5, sc: 1.3 });
            P('crate_open', { dx: -3.1, dz: 0.6, sc: 1.3 });
            if (lvl >= 2) { P('crate_long_A', { dx: -2.0, dz: 2.4, sc: 1.2 }); P('wheelbarrow', { dx: 1.0, dz: 2.6, sc: 1.3 }); P('flag_' + team, { dx: 2.7, dz: -1.6, sc: 1.3 }); P('flag_' + team, { dx: -2.7, dz: -1.6, sc: 1.3 }); }
            if (lvl >= 3) { P(B('market'), { dx: -4.4, dz: -0.8, sc: 1.8, flip: true }); P(B('market'), { dx: 4.6, dz: -0.6, sc: 1.8 }); P('crate_B_big', { dx: 3.4, dz: 2.2, sc: 1.3 }); P(B('well'), { dx: 0.2, dz: 3.4, sc: 1.8 }); }
            // 🛒 §7: the shopkeeper is the soul of a market — behind the counter,
            // waving you in; a coin-glint sells 'open for business' in action mode
            w.overlay((c2, p, k) => drawMerchant(c2, p.x, p.y, 54 * k * 2 / 1.5, true, true), 0, 0, { dx: cen.x - 1.15, dz: cen.z + 1.45 });
            if (activity === 'shopping' || activity === 'browse') w.overlay((c2, p, k) => drawSparks(c2, p.x + 34 * (k * 2 / 1.5), p.y - 44 * (k * 2 / 1.5), 34 * k * 2 / 1.5, seed, 3), 0, 0, { dx: cen.x + 1.2, dz: cen.z + 1.1 });
            break;
        }
        case 'barracks': {
            // OWNER 2026-10-21 ("the barracks is azzz, redo it"): a proper walled FORT — stone curtain wall with a gatehouse
            // facing the camera, packed-earth parade ground inside, the barracks block / tents at the back, targets + weapon
            // racks along the yard, banners at the gate and the rune-marked summon pad in the middle of the square.
            const ringC = K.ring(CC, CR, 2);
            const gateRowB = CR + 2;
            const gateB = ringC.filter(([, r]) => r === gateRowB).sort((x, y) => Math.abs(x[0] - CC) - Math.abs(y[0] - CC))[0];
            for (const [c, r] of K.ring(CC, CR, 1).concat([[CC, CR]])) w.put('building_dirt', c, r, { layer: 'flat', sc: 1.0 });
            w.layWall(ringC, { closed: true, gates: new Set([`${gateB[0]},${gateB[1]}`]), outside: true });
            // the keep at the back of the yard
            if (lvl === 1) { P('tent', { dx: -0.6, dz: -2.3, sc: 2.3 }); P('tent', { dx: 2.1, dz: -2.0, sc: 1.9 }); P('tent', { dx: -3.0, dz: -1.5, sc: 1.8, flip: true }); }
            else P(B('barracks'), { dx: 0.2, dz: -1.9, sc: lvl === 2 ? 1.35 : 1.65 });
            if (lvl >= 2) {                                    // corner towers on the northern wall corners
                const north = ringC.filter(([, r]) => r === CR - 2).sort((x, y) => x[0] - y[0]);
                const tw = lvl >= 3 ? B('tower_A') : 'flag_' + team;
                if (north.length) { const L = north[0], R = north[north.length - 1]; w.put(tw, L[0], L[1], { sc: lvl >= 3 ? 1.2 : 1.4 }); w.put(tw, R[0], R[1], { sc: lvl >= 3 ? 1.2 : 1.4 }); }
            }
            // drill yard dressing
            P('weaponrack', { dx: -3.0, dz: 0.3, sc: 1.5 }); P('weaponrack', { dx: -3.0, dz: 1.5, sc: 1.5, flip: true });
            P('target', { dx: 3.1, dz: -0.2, sc: 1.5 }); P('target', { dx: 3.1, dz: 1.2, sc: 1.5 }); P('bucket_arrows', { dx: 2.2, dz: 0.5, sc: 1.4 });
            if (lvl >= 2) { P('crate_A_small', { dx: -2.2, dz: -0.5, sc: 1.2 }); P('barrel', { dx: -2.1, dz: 1.9, sc: 1.2 }); }
            if (lvl >= 3) { P('wheelbarrow', { dx: 2.4, dz: 1.9, sc: 1.2 }); P('weaponrack', { dx: -1.8, dz: -0.5, sc: 1.4 }); }
            // banners flanking the gatehouse
            const gq = K.hexWorld(gateB[0], gateB[1]);
            w.put('flag_' + team, 0, 0, { wx: gq.x - 1.7, wz: gq.z + 0.1, sc: 1.5 }); w.put('flag_' + team, 0, 0, { wx: gq.x + 1.7, wz: gq.z + 0.1, sc: 1.5 });
            // 🐉 the summon pad in the heart of the square (brighter while a summon action runs)
            const hot = activity === 'summoning';
            w.overlay((c2, p, k) => drawSummonCircle(c2, p.x, p.y, (hot ? 138 : 108) * k * 2 / 1.5, hot ? '#b79bff' : '#8f7bff'), 0, 0, { dx: cen.x, dz: cen.z + 0.9 });
            if (lvl >= 2) for (const sx of [-1, 1]) w.overlay((c2, p, k) => drawSummonCircle(c2, p.x, p.y, 46 * k * 2 / 1.5, '#7f8cff'), 0, 0, { dx: cen.x + sx * 2.3, dz: cen.z + 1.0 });
            break;
        }
        case 'hunting': {
            // a proper HUNTING GROUND (owner 2026-10-20): a stockaded camp in a forest clearing — hunter's lodge, archery range,
            // target lane, fire pit with log seats, drying racks, trophy-ready weapon racks — and game wandering the glade.
            P(has(B('archeryrange')) ? B('archeryrange') : B('barracks'), { sc: 2.2, dx: -1.6, dz: -1.2 });
            P(has('house_roundhut_thatch') ? 'house_roundhut_thatch' : 'tent', { dx: 3.0, dz: -1.5, sc: 2.1 });
            P('tent', { dx: 4.4, dz: 0.2, sc: 1.8, flip: true }); P('tent', { dx: 1.2, dz: -2.6, sc: 1.6 });
            // fire pit: ring of stones + two log seats
            for (let i = 0; i < 6; i++) { const a2 = i * Math.PI / 3; P(['rock_single_A', 'rock_single_B', 'rock_single_C'][i % 3], { dx: 0.9 + Math.cos(a2) * 0.62, dz: 1.5 + Math.sin(a2) * 0.5, sc: 0.8 }); }
            P('resource_lumber', { dx: -0.4, dz: 1.9, sc: 0.85 }); P('resource_lumber', { dx: 2.2, dz: 1.2, sc: 0.85, flip: true });
            // target lane + firing line
            for (let i = 0; i < 4; i++) P('target', { dx: -3.2 - i * 0.55, dz: 2.6 + i * 0.95, sc: 1.4 });
            P('bucket_arrows', { dx: -1.4, dz: 2.2, sc: 1.4 }); P('weaponrack', { dx: -2.4, dz: 1.2, sc: 1.4 }); P('weaponrack', { dx: 1.9, dz: -0.4, sc: 1.3, flip: true });
            // drying racks + butchering table
            P('pallet', { dx: 4.0, dz: 2.1, sc: 1.2 }); P('crate_long_A', { dx: 3.2, dz: 1.9, sc: 1.1 }); P('barrel', { dx: 2.6, dz: 2.5, sc: 1.2 });
            P('tree_single_A_cut', { dx: -0.6, dz: -3.4, sc: 1.2 }); P('tree_single_B_cut', { dx: 5.0, dz: -1.0, sc: 1.1 });
            // stockade behind the camp, with a gate
            for (let i = -5; i <= 5; i++) P(i === 1 ? 'fence_wood_straight_gate@0' : 'fence_wood_straight@0', { dx: i * 1.15 - 0.4, dz: -4.4, sc: 1.0 });
            // canvas overlays: the campfire flame + wandering game
            const wp = (dx, dz) => ({ x: cen.x + dx, z: cen.z + dz });
            const fire = wp(0.9, 1.5);
            w.overlay((ctx, p, k) => drawCampfire(ctx, p.x, p.y, 44 * k * 2 / 1.5), 0, 0, { dx: fire.x, dz: fire.z });
            const deer = [[-0.6, 4.9, false, true, 44], [6.6, 3.9, true, false, 40], [5.4, -3.2, true, true, 46]];
            for (const [dx, dz, fl, st2, sz] of deer) { const q = wp(dx, dz); w.overlay((ctx, p, k) => drawDeer(ctx, p.x, p.y, sz * k * 2 / 1.5, fl, st2), 0, 0, { dx: q.x, dz: q.z }); }
            { const q = wp(-6.6, 0.4); w.overlay((ctx, p, k) => drawBoar(ctx, p.x, p.y, 40 * k * 2 / 1.5, false), 0, 0, { dx: q.x, dz: q.z }); }
            // 🏹 §14: the animal the hunt actually returned takes the spotlight
            if (activity === 'hunting' && o.spotlight) w.overlay((ctx, p, k) => drawSpotlight(ctx, p.x, p.y + 26 * (k * 2 / 1.5), 130 * k * 2 / 1.5), 0, 0, { dx: wp(-0.6, 4.9).x, dz: wp(-0.6, 4.9).z });
            hunt = true;
            break;
        }
        case 'blacksmith': {
            P(B('blacksmith'), { sc: lvl === 1 ? 2.4 : lvl === 2 ? 2.8 : 3.2 });
            P('weaponrack', { dx: -2.7, dz: 1.8, sc: 1.5 }); P('resource_stone', { dx: 2.7, dz: 1.9, sc: 1.4 }); P('crate_A_small', { dx: 3.1, dz: 0.4, sc: 1.2 });
            if (lvl >= 3) { P('wheelbarrow', { dx: 1.2, dz: 2.8, sc: 1.3 }); P('barrel', { dx: -1.6, dz: 2.9, sc: 1.3 }); }
            // 🔥 §9: a working forge — glowing mouth, anvil with (hot) billet;
            // sparks fly when a repair/forge action just happened here
            const forging = activity === 'forging' || activity === 'repair';
            w.overlay((c2, p, k) => drawForgeGlow(c2, p.x, p.y - 40 * (k * 2 / 1.5), (forging ? 66 : 50) * k * 2 / 1.5, forging ? 1.25 : 0.8), 0, 0, { dx: cen.x + 0.4, dz: cen.z - 0.4 });
            w.overlay((c2, p, k) => drawAnvil(c2, p.x, p.y, 56 * k * 2 / 1.5, forging), 0, 0, { dx: cen.x - 1.3, dz: cen.z + 1.9 });
            if (forging) w.overlay((c2, p, k) => drawSparks(c2, p.x, p.y - 52 * (k * 2 / 1.5), 44 * k * 2 / 1.5, seed, 6), 0, 0, { dx: cen.x - 1.3, dz: cen.z + 1.9 });
            break;
        }
        case 'medbay': {
            if (has('struct_med_tent')) P(['struct_med_tent', 'struct_med_infirmary', 'struct_med_sanatorium'][lvl - 1], { sc: lvl === 1 ? 3.4 : lvl === 2 ? 3.0 : 2.8 });
            else P(lvl === 1 ? 'tent' : B('church'), { sc: 2.6 });
            P('bucket_water', { dx: -2.6, dz: 1.8, sc: 1.4 }); P('sack', { dx: 2.7, dz: 1.8, sc: 1.4 });
            if (lvl >= 3) { P('flag_' + team, { dx: 3.2, dz: 0.3, sc: 1.4 }); P(B('well'), { dx: -3.4, dz: 0.2, sc: 1.8 }); }
            // ⚕️ §11: the red-cross sign + a gentle green healing aura; plus-
            // sparkles rise when a heal just landed here
            w.overlay((c2, p, k) => drawMedCross(c2, p.x, p.y, 74 * k * 2 / 1.5), 0, 0, { dx: cen.x + 1.9, dz: cen.z + 1.35 });
            if (activity === 'healing') {
                w.overlay((c2, p, k) => { const g2 = c2.createRadialGradient(p.x, p.y - 60 * (k * 2 / 1.5), 10, p.x, p.y - 60 * (k * 2 / 1.5), 170 * (k * 2 / 1.5)); g2.addColorStop(0, 'rgba(110,230,150,0.30)'); g2.addColorStop(1, 'rgba(110,230,150,0)'); c2.fillStyle = g2; c2.beginPath(); c2.arc(p.x, p.y - 60 * (k * 2 / 1.5), 170 * (k * 2 / 1.5), 0, Math.PI * 2); c2.fill(); }, 0, 0, { dx: cen.x, dz: cen.z });
                w.overlay((c2, p, k) => drawHealSparkles(c2, p.x, p.y, 56 * k * 2 / 1.5, seed, 6), 0, 0, { dx: cen.x, dz: cen.z + 0.6 });
            }
            break;
        }
        case 'alchemy': {
            // ⚗️ §10 REDESIGN (was barrel→tavern→windmill, read as a pub): a
            // potion workshop — shack/tavern shell + bubbling cauldron front-
            // centre, corked-flask bench, herb crates; the liquid takes the
            // brewed item's colour (o.tint) when one was just crafted here.
            const liquid = o.tint || '#7ce07c';
            if (lvl === 1) {
                P('tent', { sc: 2.6 });
                P('crate_open', { dx: -2.2, dz: 1.4, sc: 1.3 }); P('bucket_water', { dx: 2.4, dz: 1.5, sc: 1.3 });
            } else {
                P(B('tavern'), { sc: lvl === 2 ? 2.6 : 3.0 });
                P('crate_open', { dx: -2.4, dz: 1.6, sc: 1.3 });
                if (lvl >= 3) P(B('windmill'), { dx: -4.4, dz: -1.2, sc: 1.6 });
            }
            P('sack', { dx: 2.9, dz: 0.6, sc: 1.2 });
            w.overlay((c2, p, k) => drawCauldron(c2, p.x, p.y, (lvl >= 3 ? 64 : 54) * k * 2 / 1.5, liquid, true), 0, 0, { dx: cen.x + 0.5, dz: cen.z + 2.0 });
            w.overlay((c2, p, k) => drawBottleShelf(c2, p.x, p.y, (lvl >= 2 ? 52 : 42) * k * 2 / 1.5, lvl >= 3 ? [liquid, '#6ea8ff', '#c07cff', '#ffd45e'] : undefined), 0, 0, { dx: cen.x - 1.9, dz: cen.z + 2.3 });
            if (lvl >= 2) w.overlay((c2, p, k) => drawSparks(c2, p.x, p.y - 90 * (k * 2 / 1.5), (activity === 'brewing' ? 46 : 30) * k * 2 / 1.5, seed, activity === 'brewing' ? 6 : 3), 0, 0, { dx: cen.x + 0.5, dz: cen.z + 2.0 });
            break;
        }
        default: P(B('home_A'), { sc: 2.4 }); break;
    }
    // wilds ring: trees / rocks beyond ~4.5 cells so the scene sits in its biome
    const trees = hunt ? TREES : (ROCKY.has(biome) ? SMALL : TREES);
    for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const d = K.hexDist(CC, CR, c, r), k = w.cell[r][c];
        if (d < (hunt ? 5 : 4) || k.water || k.river) continue;
        if (rng() < (hunt ? (d >= 6 ? 0.97 : 0.88) : (d >= 7 ? 0.7 : 0.45))) w.put(trees[Math.floor(rng() * trees.length)], c, r, { flip: rng() < 0.5, sc: 0.95 + rng() * 0.2 });
    }
    return { w, cen, team, water: false };
}

const BD = { isle: { top: '#cfe8ef', mid: '#8fc7b2', bot: '#3f7a5c' } };

/**
 * renderStructureCard({ type, level, biome, seed, spec }) → { buffer, contentType }
 * spec → drawPanel(); everything in spec is part of the cache key.
 */
async function renderStructureCard(o = {}) {
    const type = String(o.type || 'mines'), lvl = Math.max(1, Math.min(3, o.level || 1));
    const biome = o.biome || 'isle';
    const activity = o.activity || '', spotlight = !!o.spotlight, tint = o.tint || '';
    const phase = o.phase || require('./dayNight').phaseAt();   // day/night cycle (Task 21)
    // Task 19 (spec §Pond): the pond VIEWER is the true dock-POV composition as
    // a clean still — no catch spotlight, no banner. Task 20: the hunting
    // grounds viewer gets the same treatment from huntPov. Canonical seeds so
    // every player shares one bake per (biome, level) instead of one per user.
    const isPondView = type === 'pond' && !activity;
    const isHuntView = type === 'hunting' && !activity;
    const seed = isPondView ? hashStr('dockpov-still') : isHuntView ? hashStr('huntpov-still') : hashStr(`${o.seed || 'x'}:${type}`);
    const key = hashStr(JSON.stringify(['sc3', isPondView ? 'pond_pov' : isHuntView ? 'hunt_pov' : type, lvl, biome, seed, activity, spotlight, tint, phase, o.spec || {}]));
    return mediaCache.cached('structcard', key, async () => {
        fonts();
        const { createCanvas } = require('canvas');
        const cv = createCanvas(W, H), ctx = cv.getContext('2d');
        if (isPondView) {
            require('./dockPov').paintStill(ctx, W, H, { biome, lvl, phase });
        } else if (isHuntView) {
            await require('./huntPov').paintStill(ctx, W, H, { biome, lvl, phase });
        } else {
            const { w, cen, focus } = buildScene(type, lvl, biome, seed, { activity, spotlight, tint });
            const bi = (K.biomeInfo('iso').biomes || {})[biome];
            const bd = biome === 'isle' ? BD.isle : bi ? { top: bi.backdrop[0], mid: bi.backdrop[1], bot: bi.backdrop[2] } : { top: '#356f6a', mid: '#1f4a4c', bot: '#0d2527' };
            w.layoutFixed(W, H, (focus || cen).x, (focus || cen).z, W / 2, (H - PANEL_H) * 0.52);
            await w.draw(ctx, { drawBackdrop: (c2) => { const g = c2.createLinearGradient(0, 0, 0, H); g.addColorStop(0, bd.top); g.addColorStop(0.5, bd.mid); g.addColorStop(1, bd.bot); c2.fillStyle = g; c2.fillRect(0, 0, W, H); } });
            // Task 21 day/night: the close-up wears the hour; at night the
            // structure's own windows/forge/cauldron glow through the dark.
            const dn = require('./dayNight');
            dn.grade(ctx, W, H, phase);
            if (phase === 'night' || phase === 'dusk') {
                const sp = w.proj(cen.x, cen.z, 1.4);
                const warm = type === 'blacksmith' ? '#ff9a4a' : type === 'alchemy' ? '#8ee08e' : '#ffcf7a';
                dn.light(ctx, sp.x, sp.y, H * 0.16, warm, phase === 'night' ? 0.4 : 0.22, false);
                dn.light(ctx, sp.x, sp.y + H * 0.02, H * 0.08, warm, phase === 'night' ? 0.3 : 0.15);
                if (phase === 'night') dn.moonStars(ctx, W, H, { seed: 31, moonX: 0.82, moonY: 0.09, stars: 0 });
            }
        }
        // soft vignette so the panel + ribbon always read
        const vg = ctx.createRadialGradient(W / 2, H * 0.42, H * 0.25, W / 2, H * 0.45, H * 0.95);
        vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,0.38)');
        ctx.fillStyle = vg; ctx.fillRect(0, 0, W, H);
        drawPanel(ctx, W, H, o.spec || {});
        return { buffer: cv.toBuffer('image/jpeg', { quality: 0.9 }), contentType: 'image/jpeg' };
    });
}

module.exports = { renderStructureCard, drawPanel, drawBanner, drawDeer, drawBoar, drawCampfire, drawMerchant, drawMiner, drawCauldron, drawBottleShelf, drawSummonCircle, drawSummonSprite, pickSummons, drawMedCross, PANEL_H, W, H };
