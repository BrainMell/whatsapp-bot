'use strict';
// ═══════════════════════════════════════════════════════════════════════════
//  GUILD BASE RENDERER — outdoor isometric guild grounds
//  Same visual law as homesteadBaseRenderer.js: 16x16 iso island, grass
//  tiles, isoShadow grounding, back-to-front depth sort, ambient animation.
//  Structures mirror GUILD_UPGRADES (guilds.js): hall L0-5 (4x4),
//  training L0-5 (3x3), treasury L0-5 (2x2). L0 = building plot (scaffold).
//  Archetype theming (ADVENTURER/MERCHANT/RESEARCH) + member cottages.
//  Media law (owner §6): views render STATIC PNG; build/upgrade moments
//  may pass opts.celebrate for the mp4-gif transformation.
// ═══════════════════════════════════════════════════════════════════════════

const fs = require('fs');
const path = require('path');
const os = require('os');
const isoShadow = require('./isoShadow');
const mediaCache = require('./mediaCache');

const SS = 2;
const TW = 64, TH = 32;
const N = 16;
const ART_W = 1240, ART_H = 850;
const OX = ART_W / 2;
const OY = 150;
const FRAMES = 14, FRAME_MS = 110;

const PREFIX = '.j'; // display-only default; engine passes real prefix via opts.hint when it matters
const GB_ASSETS = path.join(__dirname, '..', 'rpgasset', 'guildbase');
const HS_ASSETS = path.join(__dirname, '..', 'rpgasset', 'homestead');
const FONTS = path.join(__dirname, '..', 'rpgasset', 'fonts');

// ── structure defs (mirror of GUILD_UPGRADES visual states) ──
const GUILD_STRUCTS = {
    hall: {
        id: 'hall', name: 'Guild Hall', fw: 4, fh: 4,
        x: 6, y: 4,
        levels: [
            { level: 1, sprite: 'gb_hall_l1', name: 'War Lodge' },
            { level: 2, sprite: 'gb_hall_l2', name: 'Stone Hall' },
            { level: 3, sprite: 'gb_hall_l3', name: 'Command Hall' },
            { level: 4, sprite: 'gb_hall_l4', name: 'Grand Hall' },
            { level: 5, sprite: 'gb_hall_l5', name: 'Citadel' },
        ],
    },
    training: {
        id: 'training', name: 'Training Ground', fw: 3, fh: 3,
        x: 2, y: 8,
        levels: [
            { level: 1, sprite: 'gb_training_l1', name: 'Dust Yard' },
            { level: 2, sprite: 'gb_training_l2', name: 'Spar Ring' },
            { level: 3, sprite: 'gb_training_l3', name: "Warrior's Ring" },
            { level: 4, sprite: 'gb_training_l4', name: 'War College' },
            { level: 5, sprite: 'gb_training_l5', name: "Legend's Arena" },
        ],
    },
    treasury: {
        id: 'treasury', name: 'Treasury', fw: 2, fh: 2,
        x: 12, y: 6,
        levels: [
            { level: 1, sprite: 'gb_treasury_l1', name: 'Coin Chest' },
            { level: 2, sprite: 'gb_treasury_l2', name: 'Vault Hut' },
            { level: 3, sprite: 'gb_treasury_l3', name: 'Strongroom' },
            { level: 4, sprite: 'gb_treasury_l4', name: 'Gold Vault' },
            { level: 5, sprite: 'gb_treasury_l5', name: 'Royal Treasury' },
        ],
    },
};

const ARCH = {
    ADVENTURER: { flag: '#a02c3c', flagD: '#7c1e2c', label: 'Adventurers' },
    MERCHANT: { flag: '#b8862e', flagD: '#8a6420', label: 'Merchants' },
    RESEARCH: { flag: '#2a6a6e', flagD: '#1e4e52', label: 'Research' },
};

// cottage slots along the south meadow (member housing visual, spread to avoid overlap)
const COTTAGE_SLOTS = [[2, 13], [5, 13], [8, 13], [11, 13], [3.5, 14.3], [6.5, 14.3], [9.5, 14.3]];
const PATHS = [[8, 9], [8, 10], [8, 11], [8, 12], [7, 12], [6, 12], [4, 12], [3, 12], [10, 7], [11, 7]];

let fontsReady = false;
function ensureFonts() {
    if (fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        for (const [f, o] of [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['MedievalSharp.ttf', { family: 'Medieval' }],
        ]) {
            const p = path.join(FONTS, f);
            if (fs.existsSync(p)) { try { registerFont(p, o); } catch (e) { /* skip */ } }
        }
        fontsReady = true;
        return true;
    } catch (e) { return false; }
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = Math.imul(t ^ (t >>> 7), 61 | t);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) {
    let h = 2166136261;
    s = String(s || '');
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
}

const _img = new Map();
async function img(dir, file) {
    const key = dir + '/' + file;
    if (_img.has(key)) return _img.get(key);
    let out = null;
    try { out = await require('canvas').loadImage(path.join(dir, file)); } catch (e) { out = null; }
    _img.set(key, out);
    return out;
}
const gbImg = (f) => img(GB_ASSETS, f);
const hsImg = (f) => img(HS_ASSETS, f);

function isoX(x, y) { return OX + (x - y) * (TW / 2); }
function isoY(x, y) { return OY + (x + y) * (TH / 2); }
function footCenter(x, y) { return { x: isoX(x, y), y: isoY(x, y) }; }
// sprite bottom anchor so the (law-clipped) base diamond sits on its footprint
function anchorOf(x, y, fw, fh) {
    const c = footCenter(x + fw / 2, y + fh / 2);
    return { cx: c.x, ay: c.y + (fw + fh) * (TH / 4) - TH / 2 + 2 };
}

function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}

// building plot: rope-fenced site with corner stakes + scaffold frame
function drawPlot(ctx, cx, ay, fw, fh, t) {
    const EW = fw * 32, NS2 = fh * 16;
    const bx = cx, by = ay - 2;
    ctx.save();
    ctx.strokeStyle = 'rgba(120,86,40,0.9)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 5]);
    ctx.beginPath();
    ctx.moveTo(bx, by - NS2 * 2);
    ctx.lineTo(bx + EW, by - NS2);
    ctx.lineTo(bx, by);
    ctx.lineTo(bx - EW, by - NS2);
    ctx.closePath();
    ctx.stroke();
    ctx.setLineDash([]);
    // corner stakes
    ctx.fillStyle = '#4a2d17';
    for (const [sx, sy] of [[bx, by - NS2 * 2], [bx + EW, by - NS2], [bx, by], [bx - EW, by - NS2]]) {
        ctx.fillRect(sx - 1.5, sy - 16, 3, 16);
    }
    // scaffold A-frame at the middle
    const bounce = Math.sin(t * Math.PI * 2) * 1.2;
    ctx.fillStyle = '#6b4222';
    ctx.fillRect(bx - 14, by - NS2 - 26 + bounce, 4, 26);
    ctx.fillRect(bx + 10, by - NS2 - 26 + bounce, 4, 26);
    ctx.fillStyle = '#8a5a33';
    ctx.fillRect(bx - 16, by - NS2 - 30 + bounce, 32, 4);
    ctx.fillStyle = '#a5744a';
    ctx.fillRect(bx - 10, by - NS2 - 22 + bounce, 20, 3);
    ctx.restore();
}

// archetype props near the hall (drawn at render time — keeps sprites clean)
function drawArchProps(ctx, arch, cx, baseY, t) {
    ctx.save();
    if (arch === 'MERCHANT') {
        // crate stack + market awning hint
        for (const [ox, oy, w, h, c] of [[-58, -12, 22, 16, '#8a5a33'], [-34, -8, 18, 12, '#a5744a'], [-50, -26, 16, 12, '#b8882e']]) {
            ctx.fillStyle = c;
            ctx.fillRect(cx + ox, baseY + oy - h, w, h);
            ctx.strokeStyle = '#4a2d17'; ctx.lineWidth = 1.4;
            ctx.strokeRect(cx + ox, baseY + oy - h, w, h);
            ctx.beginPath(); ctx.moveTo(cx + ox, baseY + oy - h); ctx.lineTo(cx + ox + w, baseY + oy); ctx.stroke();
        }
    } else if (arch === 'RESEARCH') {
        // crystal cluster with glow pulse
        const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
        for (const [ox, hgt, w] of [[-48, 26, 10], [-36, 16, 7], [-58, 12, 6]]) {
            ctx.fillStyle = '#9adce8';
            ctx.beginPath();
            ctx.moveTo(cx + ox - w / 2, baseY - 8);
            ctx.lineTo(cx + ox, baseY - 8 - hgt);
            ctx.lineTo(cx + ox + w / 2, baseY - 8);
            ctx.closePath(); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.25 + 0.2 * pulse;
        const g = ctx.createRadialGradient(cx - 46, baseY - 24, 2, cx - 46, baseY - 24, 30);
        g.addColorStop(0, 'rgba(154,220,232,0.8)');
        g.addColorStop(1, 'rgba(154,220,232,0)');
        ctx.fillStyle = g;
        ctx.beginPath(); ctx.arc(cx - 46, baseY - 24, 30, 0, Math.PI * 2); ctx.fill();
    } else {
        // ADVENTURER: practice target
        ctx.fillStyle = '#4a2d17';
        ctx.fillRect(cx - 46, baseY - 26, 3, 26);
        ctx.fillStyle = '#c2a05a';
        ctx.beginPath(); ctx.arc(cx - 44, baseY - 30, 12, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#a02c3c';
        ctx.beginPath(); ctx.arc(cx - 44, baseY - 30, 7, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = '#d4b470';
        ctx.beginPath(); ctx.arc(cx - 44, baseY - 30, 2.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// ONE FRAME
// ═══════════════════════════════════════════════════════════════════════════
async function renderFrame(state, frame, opts = {}) {
    ensureFonts();
    const canvas = require('canvas').createCanvas(ART_W * SS, ART_H * SS);
    const ctx = canvas.getContext('2d');
    ctx.scale(SS, SS);
    ctx.imageSmoothingEnabled = false;

    const seed = hashStr(state.name || 'guild');
    const t = frame / FRAMES;
    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    const archCol = ARCH[arch];
    const flagCol = (state.emblemColor && /^#[0-9a-fA-F]{3,8}$/.test(state.emblemColor)) ? state.emblemColor : archCol.flag;
    const flagD = archCol.flagD;

    // ── sky + sun (same law as base renderer) ──
    const sky = ctx.createLinearGradient(0, 0, 0, ART_H);
    sky.addColorStop(0, '#8fb8d9');
    sky.addColorStop(0.45, '#b8d4e4');
    sky.addColorStop(1, '#57452e');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, ART_W, ART_H);
    const sun = ctx.createRadialGradient(180, 90, 10, 180, 90, 260);
    sun.addColorStop(0, 'rgba(255,238,190,0.85)');
    sun.addColorStop(1, 'rgba(255,238,190,0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, ART_W, 420);

    // clouds
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.75)';
    const cd = (frame / FRAMES) * 40;
    for (const [bx, by, s] of [[220, 90, 1.2], [760, 60, 0.9], [1040, 130, 1.05]]) {
        const cx2 = ((bx + cd * s) % (ART_W + 260)) - 130;
        ctx.beginPath();
        ctx.ellipse(cx2, by, 60 * s, 16 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 + 34 * s, by - 8 * s, 36 * s, 13 * s, 0, 0, Math.PI * 2);
        ctx.ellipse(cx2 - 30 * s, by - 4 * s, 30 * s, 11 * s, 0, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // ── terrain ──
    const grass = ['base_grass_a.png', 'base_grass_b.png', 'base_grass_c.png'];
    for (let sum = 0; sum <= 2 * (N - 1); sum++) {
        for (let x = Math.max(0, sum - N + 1); x <= Math.min(N - 1, sum); x++) {
            const y = sum - x;
            const r = mulberry32(seed + x * 131 + y * 17)();
            const tile = (PATHS || []).some(([px, py]) => px === x && py === y)
                ? 'base_path.png'
                : (r < 0.06 ? 'base_grass_flowers.png' : grass[Math.floor(r * 3) % 3]);
            const timg = await hsImg(tile);
            if (timg) ctx.drawImage(timg, isoX(x, y) - TW / 2, isoY(x, y) - TH / 2);
        }
    }
    ctx.strokeStyle = 'rgba(40,28,14,0.4)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(isoX(0, N), isoY(0, N));
    ctx.lineTo(isoX(N, N), isoY(N, N));
    ctx.lineTo(isoX(N, 0), isoY(N, 0));
    ctx.stroke();

    // scattered vegetation (avoid structure cells + paths)
    const treeImg = await hsImg('base_tree_oak.png');
    const pineImg = await hsImg('base_tree_pine.png');
    const bushImg = await hsImg('base_bush.png');
    const boulderImg = await hsImg('base_boulder.png');
    const occupied = new Set();
    for (const st of Object.values(GUILD_STRUCTS)) {
        for (let ix = -1; ix <= st.fw; ix++) for (let iy = -1; iy <= st.fh; iy++) occupied.add(`${st.x + ix},${st.y + iy}`);
    }
    for (const [px, py] of PATHS) occupied.add(`${px},${py}`);
    for (const [px, py] of COTTAGE_SLOTS) { occupied.add(`${px},${py}`); occupied.add(`${px},${py - 1}`); }
    const props = [];
    for (let i = 0; i < 26; i++) {
        const r1 = mulberry32(seed + 700 + i)(), r2 = mulberry32(seed + 1400 + i)();
        const xx = Math.floor(r1 * N), yy = Math.floor(r2 * N);
        if (occupied.has(`${xx},${yy}`)) continue;
        if (yy < 2 && xx > 5) continue; // keep the north approach open
        if (xx >= 9 && xx <= 12 && yy >= 8 && yy <= 10) continue; // archetype-prop meadow stays clear
        const rr = mulberry32(seed + 2100 + i)();
        const pxc = isoX(xx + 0.5, yy + 0.5), pyC = isoY(xx + 0.5, yy + 0.5);
        if (rr < 0.34 && treeImg) props.push({ img: rr < 0.14 ? pineImg : treeImg, x: pxc, y: pyC + 10 });
        else if (rr < 0.55 && bushImg) props.push({ img: bushImg, x: pxc, y: pyC + 8 });
        else if (rr > 0.86 && boulderImg) props.push({ img: boulderImg, x: pxc, y: pyC + 8 });
    }

    // ── guild structures (hall / training / treasury; L0 = plot) ──
    const structs = [];
    for (const st of Object.values(GUILD_STRUCTS)) {
        const lvl = Math.max(0, Math.min(5, parseInt((state.buildings || {})[st.id], 10) || 0));
        if (lvl <= 0) {
            structs.push({ kind: 'plot', st, lvl: 0 });
            continue;
        }
        const lv = st.levels.find((l) => l.level === lvl) || st.levels[0];
        structs.push({ kind: 'struct', st, lvl, lv });
    }

    const drawables = [];
    for (const s of structs) {
        if (s.kind === 'plot') {
            drawables.push({ kind: 'plot', st: s.st, order: s.st.x + s.st.y });
            continue;
        }
        const spr = await gbImg(`${s.lv.sprite}.png`);
        if (!spr) continue;
        const { cx, ay } = anchorOf(s.st.x, s.st.y, s.st.fw, s.st.fh);
        drawables.push({ kind: 'struct', st: s.st, lvl: s.lvl, lv: s.lv, spr, cx, ay, w: spr.width, h: spr.height, order: s.st.x + s.st.y });
    }
    // member cottages
    const cottageImg = await gbImg('gb_cottage.png');
    const nCottages = Math.max(0, Math.min(COTTAGE_SLOTS.length, parseInt(state.memberCount, 10) || 0));
    const cottages = [];
    for (let i = 0; i < nCottages; i++) {
        const [cxx, cyy] = COTTAGE_SLOTS[i];
        const { cx, ay } = anchorOf(cxx, cyy, 1.35, 1.35);
        cottages.push({ cx, ay });
    }
    // props merge into the depth pass
    const all = [
        ...props.map((p) => ({ kind: 'prop', x: p.x, y: p.y, img: p.img })),
        ...cottages.map((c) => ({ kind: 'cottage', x: c.cx, y: c.ay })),
        ...drawables,
    ].sort((a, b) => (a.y ?? (a.ay ?? 0)) - (b.y ?? (b.ay ?? 0)));

    // shadows first
    for (const d of all) {
        if (d.kind === 'prop') {
            if (d.img && d.img.height > 26) isoShadow.drawItemShadow(ctx, { img: d.img, key: `p${d.x}|${d.y}`, scale: 1, ax: d.x, ay: d.y + 2, alpha: 0.8 });
        } else if (d.kind === 'cottage') {
            if (cottageImg) isoShadow.drawItemShadow(ctx, { img: cottageImg, key: `c${d.x}|${d.y}`, scale: 1, ax: d.x, ay: d.y + 2, alpha: 0.9 });
        } else if (d.kind === 'struct') {
            isoShadow.drawItemShadow(ctx, { img: d.spr, key: `${d.st.id}_${d.lvl}`, scale: 1, ax: d.cx, ay: d.ay, alpha: 1 });
        }
    }
    // sprites
    for (const d of all) {
        if (d.kind === 'prop') {
            ctx.drawImage(d.img, d.x - d.img.width / 2, d.y - d.img.height);
        } else if (d.kind === 'cottage') {
            if (cottageImg) ctx.drawImage(cottageImg, d.x - cottageImg.width / 2, d.y - cottageImg.height);
        } else if (d.kind === 'struct') {
            ctx.drawImage(d.spr, d.cx - d.w / 2, d.ay - d.h);
        } else if (d.kind === 'plot') {
            drawPlot(ctx, anchorOf(d.st.x, d.st.y, d.st.fw, d.st.fh).cx, anchorOf(d.st.x, d.st.y, d.st.fw, d.st.fh).ay, d.st.fw, d.st.fh, t);
        }
    }

    // ── archetype props on the open east meadow (tile 12,10 — kept clear of vegetation) ──
    const hallDef = GUILD_STRUCTS.hall;
    const hallAnchor = anchorOf(hallDef.x, hallDef.y, hallDef.fw, hallDef.fh);
    const apX = OX + 2 * (TW / 2), apY = OY + 22 * (TH / 2); // tile (12,10) centre
    drawArchProps(ctx, arch, apX, apY + 8, t);

    // ── guild banner by the hall entrance (cloth waves; emblem color) ──
    const poleX = hallAnchor.cx + 44, poleBase = hallAnchor.ay + 26;
    ctx.fillStyle = '#4a2d17';
    ctx.fillRect(poleX - 1.5, poleBase - 84, 3, 84);
    const wave = Math.sin(t * Math.PI * 2) * 3;
    ctx.fillStyle = flagCol;
    ctx.beginPath();
    ctx.moveTo(poleX + 1.5, poleBase - 83);
    ctx.quadraticCurveTo(poleX + 22, poleBase - 80 + wave, poleX + 40, poleBase - 77 + wave * 0.4);
    ctx.lineTo(poleX + 38, poleBase - 63 + wave * 0.4);
    ctx.quadraticCurveTo(poleX + 20, poleBase - 66 + wave, poleX + 1.5, poleBase - 69);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.22)';
    ctx.beginPath();
    ctx.moveTo(poleX + 1.5, poleBase - 76);
    ctx.quadraticCurveTo(poleX + 22, poleBase - 73 + wave, poleX + 40, poleBase - 70 + wave * 0.4);
    ctx.lineTo(poleX + 38, poleBase - 63 + wave * 0.4);
    ctx.quadraticCurveTo(poleX + 20, poleBase - 66 + wave, poleX + 1.5, poleBase - 69);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#e8b84a';
    ctx.beginPath(); ctx.arc(poleX, poleBase - 86, 3.4, 0, Math.PI * 2); ctx.fill();
    if (state.emblemIcon) {
        ctx.font = '14px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(String(state.emblemIcon).slice(0, 2), poleX + 20, poleBase - 68 + wave * 0.3);
    }

    // ── ambient animation ──
    // hall smoke (L3+)
    const hallD = drawables.find((d) => d.st.id === 'hall');
    if (hallD && hallD.lvl >= 3) {
        ctx.save();
        for (let i = 0; i < 3; i++) {
            const ph = (t + i / 3) % 1;
            ctx.globalAlpha = 0.30 * (1 - ph);
            ctx.fillStyle = '#e8e4da';
            ctx.beginPath();
            ctx.ellipse(hallD.cx + 34 + Math.sin(ph * 5 + i) * 8, hallD.ay - hallD.h + 26 - ph * 46, 4 + ph * 10, 3 + ph * 7, 0, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }
    // treasury sparkle (L2+)
    const treasD = drawables.find((d) => d.st.id === 'treasury');
    if (treasD && treasD.lvl >= 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < 3; i++) {
            const ph = (t * 1.6 + i / 3) % 1;
            ctx.globalAlpha = 0.65 * Math.sin(ph * Math.PI);
            ctx.fillStyle = '#ffe9a8';
            const sx = treasD.cx + Math.sin(i * 2.1 + t * 6.28) * 26;
            const sy = treasD.ay - 26 - ph * 18;
            ctx.beginPath(); ctx.arc(sx, sy, 1.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
    }
    // training glint (L2+): sword flash over the ring
    const trainD = drawables.find((d) => d.st.id === 'training');
    if (trainD && trainD.lvl >= 2) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ph = (t * 2) % 1;
        if (ph < 0.25) {
            ctx.globalAlpha = 1 - ph * 4;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 2;
            const gx = trainD.cx - 30, gy = trainD.ay - 46;
            ctx.beginPath(); ctx.moveTo(gx, gy - 10); ctx.lineTo(gx + 9, gy + 2); ctx.stroke();
        }
        ctx.restore();
    }
    // fireflies
    ctx.save();
    for (let i = 0; i < 6; i++) {
        const r1 = mulberry32(seed + 3000 + i)();
        const ph = (t + r1) % 1;
        ctx.globalAlpha = 0.5 * Math.sin(ph * Math.PI);
        ctx.fillStyle = '#ffe9a8';
        ctx.beginPath();
        ctx.arc(OX + (r1 - 0.5) * 700, OY + 300 + (i % 3) * 90 - ph * 26, 1.6, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(OX, OY + 340, 380, OX, OY + 340, 900);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(20,14,6,0.42)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, ART_W, ART_H);

    drawHud(ctx, state, opts);
    return canvas.toBuffer('image/png');
}

// ── HUD plate ──
function drawHud(ctx, state, opts) {
    const H = 132, Wp = ART_W - 60;
    const x0 = 30, y0 = ART_H - H - 22;
    ctx.save();
    ctx.fillStyle = 'rgba(24,17,10,0.88)';
    roundRect(ctx, x0, y0, Wp, H, 14);
    ctx.fill();
    ctx.strokeStyle = '#a67c2e';
    ctx.lineWidth = 2.5;
    roundRect(ctx, x0 + 4, y0 + 4, Wp - 8, H - 8, 10);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(166,124,46,0.35)';
    ctx.lineWidth = 1;
    roundRect(ctx, x0 + 9, y0 + 9, Wp - 18, H - 18, 8);
    ctx.stroke();

    const arch = ARCH[state.archetype] ? state.archetype : 'ADVENTURER';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#e8d5a3';
    ctx.font = '26px "Cinzel Deco", Cinzel';
    ctx.textAlign = 'left';
    ctx.fillText(`${state.emblemIcon ? state.emblemIcon + ' ' : ''}${String(state.name || 'Guild').slice(0, 20)}`, x0 + 26, y0 + 34);
    ctx.font = '16px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText(`${ARCH[arch].label} Guild · Level ${state.level || 1}`, x0 + 26, y0 + 60);

    // right side: members + three building chips
    ctx.textAlign = 'center';
    ctx.font = '20px Cinzel';
    ctx.fillStyle = '#e8d5a3';
    ctx.fillText(`${state.memberCount || 0}/${state.memberCap || '?'}`, x0 + Wp - 84, y0 + 34);
    ctx.font = '13px Medieval';
    ctx.fillStyle = '#9c8455';
    ctx.fillText('MEMBERS', x0 + Wp - 84, y0 + 56);

    const chips = [
        ['HALL', (state.buildings || {}).hall],
        ['TRAINING', (state.buildings || {}).training],
        ['TREASURY', (state.buildings || {}).treasury],
    ];
    let chipX = x0 + Wp - 250;
    for (const [label, lvl] of chips) {
        const built = (parseInt(lvl, 10) || 0) > 0;
        ctx.fillStyle = built ? 'rgba(166,124,46,0.25)' : 'rgba(90,70,40,0.35)';
        roundRect(ctx, chipX - 52, y0 + 22, 100, 40, 8);
        ctx.fill();
        ctx.font = '16px Cinzel';
        ctx.fillStyle = built ? '#e8d5a3' : '#7a663f';
        ctx.fillText(`${label} ${built ? `L${lvl}` : '—'}`, chipX - 2, y0 + 43);
        chipX -= 116;
    }

    ctx.textAlign = 'center';
    ctx.font = '15px Medieval';
    ctx.fillStyle = '#7a663f';
    const foot = opts.hint || (state.motto ? `\u201C${String(state.motto).slice(0, 70)}\u201D` : `${PREFIX} guild upgrade hall \u2022 ${PREFIX} guild donate \u2022 ${PREFIX} guild perks`);
    ctx.fillText(foot, x0 + Wp / 2, y0 + H - 24);
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════════════════
// PUBLIC: static view PNG (default) or celebrate mp4-gif
// ═══════════════════════════════════════════════════════════════════════════
async function encodeFramesToMp4(frames) {
    const ffmpeg = require('fluent-ffmpeg');
    try { ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH || 'ffmpeg'); } catch (e) { /* engine sets it too */ }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'gbase-'));
    frames.forEach((b, i) => fs.writeFileSync(path.join(tmp, `f${String(i).padStart(3, '0')}.png`), b));
    const out = path.join(tmp, 'gbase.mp4');
    try {
        await new Promise((resolve, reject) => {
            ffmpeg()
                .input(path.join(tmp, 'f%03d.png'))
                .inputOptions(['-framerate', `${1000 / FRAME_MS}`])
                .outputOptions([
                    '-c:v', 'libx264', '-profile:v', 'baseline', '-level', '3.0',
                    '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-crf', '23',
                    '-movflags', '+faststart', '-an', '-y',
                ])
                .output(out)
                .on('end', resolve)
                .on('error', reject)
                .run();
        });
        return fs.readFileSync(out);
    } finally {
        try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) {}
    }
}

const _renderCache = new Map();
const CACHE_TTL = 10 * 60 * 1000;
function stateHash(state, opts = {}) {
    return hashStr(JSON.stringify([state.name, state.level, state.archetype, state.buildings, state.memberCount, state.memberCap, state.emblemColor, state.emblemIcon, state.motto, opts.hint || '', opts.static ? 1 : 0]));
}

async function renderGuildBaseImage(state, opts = {}) {
    const key = stateHash(state, opts);
    const hit = _renderCache.get(key);
    if (hit && (Date.now() - hit.ts) < CACHE_TTL) return hit;
    const out = await mediaCache.cached('guildbase', key, async () => {
        const frames = [];
        const frameCount = opts.static === false ? FRAMES : 1;
        for (let f = 0; f < frameCount; f++) frames.push(await renderFrame(state, f, opts));
        let out = { buffer: frames[0], contentType: 'image/png' };
        if (frameCount > 1) {
            try {
                const mp4 = await encodeFramesToMp4(frames);
                if (mp4 && mp4.length > 1000) out = { buffer: mp4, contentType: 'video/mp4' };
            } catch (e) {
                console.error('[guildBaseRenderer] mp4 encode failed, PNG fallback:', e.message);
            }
        }
        return out;
    });
    if (_renderCache.size > 120) _renderCache.clear();
    _renderCache.set(key, { ...out, ts: Date.now() });
    return out;
}

module.exports = { GUILD_STRUCTS, ARCH, FRAMES, renderFrame, renderGuildBaseImage, encodeFramesToMp4 };
