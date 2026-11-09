// ===============================================
// DEATHSTILL.JS — static death images (owner 2026-11-09)
// ===============================================
// "Move away from deaths being animated to them being images … remove all our
// current death animation implementation in favor of it, it should also use
// premade art btw, research how to communicate enemy death in a static image
// and all the different types for the different enemy types."
//
// Full research + type table: docs/DEATH_STILLS_SPEC.md. Short version — a
// still reads as a kill through four stacked signals: (1) the body is KO'd
// (rotated off its stance, grounded, desaturated), (2) premade element art
// frozen at its PEAK frame engulfs the body (fire bomb / dark implosion /
// shards / splash / rubble / dust — never one effect for everything), (3) a
// ☠ DEFEATED chip sits where the HP bar was, (4) debris is SETTLED — the
// "after", not the "during".
//
// Architecture: the expensive part (premade art composition) is painted ONCE
// per (kind, boss) into a transparent "death stamp" PNG (disk + memory cache)
// — every kill is then scenePlate + dead-sprite transform + 2 blits, warm in
// ~0.1-0.25s. Replaces the 18-24s animated DeathFx mp4 pipeline wholesale.
//
// premade sources: core/rpgasset/vfx (CC0 — kenney explosion/smoke/particles,
// magic fire-bomb/lightning/dark-bolt, fire2 blasts; see vfx/CREDITS.md).

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const VW = 640, VH = 480;   // same plate size the old death clips used (1024x687 scene scaled down)

// ── death kind classification (moved VERBATIM from skillVfx.js) ──────────
const DEATH_RULES = [
    ['FIRE', /fire|flame|ember|inferno|lava|magma|blaze|ifrit|phoenix|pyro|burn|molten|cinder|hellhound|salamander/i],
    ['ICE', /ice|frost|glacial|snow|blizzard|frozen|yeti|cryo/i],
    ['WATER', /water|tide|tidal|aqua|slime|sea|ocean|kraken|drown|hydra|siren|sahuagin|merfolk|coral|storm/i],
    // 💡 VOID outranks EARTH (owner 2026-11-07): the abyss amalgamation family carries
    // BOTH an infection word and a stone word — the F-tier void boss must not die like a rock.
    ['VOID', /void|shadow|dark|wraith|ghost|spirit|specter|spectre|phantom|demon|chaos|abyss|reaper|undead|necro|lich|wisp|banshee|blood|corrupt|shade|nightmare|eldritch|skeleton|zombie|vampire|hybrid|mutat|infect|plague|blight/i],
    ['EARTH', /stone|rock|golem|boulder|earth|crystal|titan|hulk|mud|gargoyle|colossus|guardian|obelisk|sand|mountain|ent\b|treant/i],
];
function classifyDeath(enemy) {
    if (/^abyss_/i.test(String((enemy && enemy.id) || ''))) return 'VOID';
    for (const field of [enemy && enemy.element, enemy && enemy.type, enemy && enemy.family, enemy && enemy.category]) {
        if (!field) continue;
        const f = String(field);
        for (const [kind, re] of DEATH_RULES) if (re.test(f)) return kind;
    }
    const hay = [enemy && enemy.id, enemy && enemy.name].filter(Boolean).map(String).join(' ');
    for (const [kind, re] of DEATH_RULES) if (re.test(hay)) return kind;
    return 'DUST';
}

// ── deterministic RNG (identical stamps on every rebake) ─────────────────
function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a |= 0; a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

// ── premade art loading (repo CC0 sets) ──────────────────────────────────
const VFX_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'vfx');
function loadFrame(rel, pickFrac) {
    try {
        const p = path.join(VFX_DIR, rel);
        if (!fs.existsSync(p)) return null;
        return loadImage(p);
    } catch (e) { return null; }
}
// sorted numeric frames of a set like "Fire-bomb1..12.png" — pick the PEAK
// (visually fullest ≈ 60-75% through the sequence; frame 1 is the wind-up).
function peakFrame(prefix, suffix, count, frac = 0.66) {
    const idx = Math.max(0, Math.min(count - 1, Math.floor(count * frac)));
    return loadFrame(`${prefix}${idx + 1}${suffix}`);
}
function kenney(name, frac = 0.5) { return peakFrame(`kenney/${name}`, '.png', 8, frac); }

// ── the death stamp: per (kind, boss) transparent PNG painted ONCE ───────
// Art box 480x480 — the caller scales/blits it centered on the fallen body.
const STAMP_SIZE = 480;
const STAMP_DIR = path.join(os.tmpdir(), 'death_stamps_v1');
const _stampMemo = new Map();

function speck(rnd, c, x, y, r, col, a) {
    c.save(); c.globalAlpha = a; c.fillStyle = col; c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill(); c.restore();
}
function motes(rnd, c, cx, cy, n, rMin, rMax, spread, colors, rise, aMin, aMax) {
    for (let i = 0; i < n; i++) {
        const ang = rnd() * Math.PI * 2, d = spread * (0.25 + 0.75 * rnd());
        const x = cx + Math.cos(ang) * d, y = cy + Math.sin(ang) * d * 0.7 - rise * rnd();
        speck(rnd, c, x, y, rMin + rnd() * (rMax - rMin), colors[Math.floor(rnd() * colors.length)], aMin + rnd() * (aMax - aMin));
    }
}

async function paintStamp(kind, boss) {
    const S = STAMP_SIZE, cv = createCanvas(S, S), c = cv.getContext('2d');
    const cx = S / 2, cy = S / 2;
    const rnd = mulberry32(hashStr(kind + (boss ? ':boss' : '')));
    const A = boss ? 1.18 : 1;   // bosses die louder
    const put = (img, x, y, w, h, alpha = 1) => { if (img) { try { c.save(); c.globalAlpha = alpha; c.drawImage(img, x, y, w, h); c.restore(); } catch (e) {} } };

    if (kind === 'FIRE') {
        const bomb = await peakFrame('magic/Fire-bomb', '.png', 12, 0.66);
        const blast = await peakFrame('fire2/blast_', '.png', 6, 0.7);
        const scorch = await kenney('p_scorch', 0.6);
        const smoke = await kenney('bsmoke', 0.35);
        if (scorch) put(scorch, cx - 150 * A, S - 96, 300 * A, 74, 0.8);                       // scorch at the feet
        put(blast, cx - 130 * A, cy - 120 * A, 260 * A, 260 * A, 0.55);                        // under-blast
        put(bomb, cx - 150 * A, cy - 170 * A, 300 * A, 300 * A);                               // the peak fireball
        put(smoke, cx - 70 * A, cy - 230 * A, 140 * A, 150 * A, 0.5);                          // wisp rising
        motes(rnd, c, cx, cy, 16 * A, 1.5, 3.5, 150 * A, ['#ffcb45', '#e85a37', '#ffffff'], 26, 0.5, 0.95);  // embers
    } else if (kind === 'VOID') {
        const bolt = await peakFrame('magic/Dark-Bolt', '.png', 12, 0.6);
        const gas = await kenney('gas', 0.55);
        put(gas, cx - 140 * A, cy - 140 * A, 280 * A, 280 * A, 0.5);
        put(bolt, cx - 150 * A, cy - 165 * A, 300 * A, 300 * A, 0.9);
        // inward implosion: motes denser NEAR the centre (pulled in), purple/black
        for (let i = 0; i < 22 * A; i++) {
            const ang = rnd() * Math.PI * 2, d = (10 + 150 * A * rnd() * rnd()) ;
            speck(rnd, c, cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * 0.8, 1.5 + rnd() * 3, ['#7b4dff', '#2a1240', '#b18cff', '#12081f'][Math.floor(rnd() * 4)], 0.55 + rnd() * 0.4);
        }
    } else if (kind === 'EARTH') {
        const dirt1 = await kenney('p_dirt', 0.4), dirt2 = await kenney('p_dirt', 0.75);
        const dust = await kenney('bsmoke', 0.3);
        put(dust, cx - 130 * A, cy - 150 * A, 260 * A, 220 * A, 0.55);
        put(dirt1, cx - 150 * A, cy - 40 * A, 190 * A, 140 * A, 0.9);
        put(dirt2, cx - 20 * A, cy - 10 * A, 170 * A, 120 * A, 0.85);
        // settled rubble chunks + ground cracks
        c.save();
        for (let i = 0; i < 9 * A; i++) {
            const x = cx + (rnd() - 0.5) * 260 * A, y = cy + 40 + rnd() * 90;
            const w = 8 + rnd() * 22, h = 6 + rnd() * 14, rot = rnd() * Math.PI;
            c.translate(x, y); c.rotate(rot);
            c.fillStyle = ['#6b5b45', '#57493a', '#7d6d55'][Math.floor(rnd() * 3)];
            c.globalAlpha = 0.95; c.fillRect(-w / 2, -h / 2, w, h);
            c.setTransform(1, 0, 0, 1, 0, 0);
        }
        c.strokeStyle = 'rgba(60,48,36,0.5)'; c.lineWidth = 2;
        for (let i = 0; i < 4; i++) {
            const x0 = cx + (rnd() - 0.5) * 200 * A, y0 = S - 60 + rnd() * 30;
            c.beginPath(); c.moveTo(x0, y0);
            c.lineTo(x0 + (rnd() - 0.5) * 90, y0 + 14 + rnd() * 20); c.stroke();
        }
        c.restore();
    } else if (kind === 'WATER') {
        const puff = await kenney('puff', 0.5);
        // ground puddle
        c.save(); c.globalAlpha = 0.4; c.fillStyle = '#3f7fd6';
        c.beginPath(); c.ellipse(cx, S - 78, 150 * A, 26 * A, 0, 0, Math.PI * 2); c.fill();
        c.globalAlpha = 0.5; c.strokeStyle = '#9fd0ff'; c.lineWidth = 3;
        c.beginPath(); c.ellipse(cx, S - 78, 150 * A, 26 * A, 0, 0, Math.PI * 2); c.stroke(); c.restore();
        // splash arcs
        c.save(); c.strokeStyle = 'rgba(190,230,255,0.9)'; c.lineWidth = 5;
        c.beginPath(); c.arc(cx, S - 80, 90 * A, Math.PI * 1.15, Math.PI * 1.85); c.stroke();
        c.lineWidth = 3; c.beginPath(); c.arc(cx, S - 80, 120 * A, Math.PI * 1.25, Math.PI * 1.75); c.stroke(); c.restore();
        put(puff, cx - 90 * A, cy - 120 * A, 180 * A, 160 * A, 0.35);   // mist
        motes(rnd, c, cx, S - 120, 18 * A, 1.5, 4, 130 * A, ['#bfe3ff', '#7fb8ff', '#ffffff'], 60, 0.5, 0.9);  // droplets
    } else if (kind === 'ICE') {
        // frost patch
        c.save(); c.globalAlpha = 0.35; c.fillStyle = '#bfe8ff';
        c.beginPath(); c.ellipse(cx, S - 78, 140 * A, 30 * A, 0, 0, Math.PI * 2); c.fill(); c.restore();
        // shard spray
        c.save();
        for (let i = 0; i < 11 * A; i++) {
            const x = cx + (rnd() - 0.5) * 240 * A, y = cy + (rnd() - 0.3) * 200 * A;
            const len = 16 + rnd() * 40, w = 5 + rnd() * 10, rot = (rnd() - 0.5) * 2.4;
            c.translate(x, y); c.rotate(rot);
            c.fillStyle = `rgba(${150 + Math.floor(rnd() * 60)},${215 + Math.floor(rnd() * 40)},255,${0.75 + rnd() * 0.25})`;
            c.beginPath(); c.moveTo(0, -len); c.lineTo(w, len * 0.35); c.lineTo(0, len * 0.6); c.lineTo(-w, len * 0.35); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.2; c.stroke();
            c.setTransform(1, 0, 0, 1, 0, 0);
        }
        c.restore();
        // sparkle crosses
        c.save(); c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 2;
        for (let i = 0; i < 5; i++) {
            const x = cx + (rnd() - 0.5) * 220 * A, y = cy + (rnd() - 0.4) * 180 * A, r = 5 + rnd() * 8;
            c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
        }
        c.restore();
    } else {   // DUST — the generic fallback
        const smoke = await kenney('bsmoke', 0.4);
        const puff = await kenney('puff', 0.65);
        put(smoke, cx - 120 * A, cy - 140 * A, 240 * A, 210 * A, 0.5);
        put(puff, cx - 90 * A, cy - 40 * A, 180 * A, 150 * A, 0.6);
        motes(rnd, c, cx, cy, 20 * A, 1.2, 3, 160 * A, ['#cfc8bd', '#a89f92', '#847c71'], 60, 0.35, 0.8);   // dissolve motes rising
    }

    // universal: soft white impact-flash ring at the body's centre
    c.save();
    const g = c.createRadialGradient(cx, cy, 6, cx, cy, 120 * A);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.beginPath(); c.arc(cx, cy, 120 * A, 0, Math.PI * 2); c.fill();
    c.restore();
    return cv.toBuffer('image/png');
}

async function getStamp(kind, boss) {
    const key = `${kind}${boss ? '_boss' : ''}`;
    if (_stampMemo.has(key)) return _stampMemo.get(key);
    try {
        if (!fs.existsSync(STAMP_DIR)) fs.mkdirSync(STAMP_DIR, { recursive: true });
        const f = path.join(STAMP_DIR, `${key}.png`);
        let buf;
        if (fs.existsSync(f) && fs.statSync(f).size > 500) buf = fs.readFileSync(f);
        else { buf = await paintStamp(kind, boss); fs.writeFileSync(f, buf); }
        _stampMemo.set(key, buf);
        return buf;
    } catch (e) {
        try { return await paintStamp(kind, boss); } catch (e2) { return null; }   // cache-less fallback
    }
}

// ── scene plate (moved from deathOverlay.scenePlate — returns CANVAS) ────
async function scenePlateCanvas(layers, dyingIdx, deadIdx, chrome) {
    const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
    const kx = VW / W0, ky = VH / H0;
    const cv = createCanvas(VW, VH), c = cv.getContext('2d');
    const __bg = await loadImage(layers.bg);
    c.drawImage(__bg, 0, 0, VW, VH);
    // ☠️ erase the fallen's bars: Go bakes overhead HP bars into the scene bg — paint
    // over each fallen unit's bar with the background sampled right above it.
    {
        const __gone = new Set();
        for (const __s of [dyingIdx, deadIdx]) {
            if (__s instanceof Set || Array.isArray(__s)) for (const __i of __s) __gone.add(Math.floor(Number(__i) || 0));
        }
        if (__gone.size && Array.isArray(layers.anchors)) {
            for (const __a of layers.anchors) {
                if (!__a || String(__a.side) !== 'enemy' || !__gone.has(Math.floor(Number(__a.index) || 0))) continue;
                const __bw = 100, __bh = 12, __pad = 6;   // Go enemy-bar geometry (100x12 @ center-50, top-15)
                const __bx = (Number(__a.x) || 0) - __bw / 2 - __pad;
                const __by = (Number(__a.feetY) || 0) - Math.max(24, Number(__a.h) || 0) - 15 - __pad;
                const __sw = __bw + __pad * 2, __sh = __bh + __pad * 2;
                const __sy = Math.max(0, __by - __sh - 2);
                const __shh = Math.min(__sh, Math.max(2, __by - __sy));
                try { c.drawImage(__bg, __bx, __sy, __sw, __shh, __bx * kx, __by * ky, __sw * kx, __sh * ky); } catch (e) {}
            }
        }
    }
    const __dead = deadIdx instanceof Set ? deadIdx : new Set();
    const cuts = (layers.cuts || []).filter((x) => x && x.png && !(String(x.side) === 'enemy' && (dyingIdx.has(Math.floor(Number(x.index) || 0)) || __dead.has(Math.floor(Number(x.index) || 0)))));
    cuts.sort((a, b) => (Number(a.y) + Number(a.h)) - (Number(b.y) + Number(b.h)));
    try { c.save(); c.scale(kx, ky); await require('./groundShadow').paintShadows(c, { cuts, anchors: [] }, 1); c.restore(); } catch (e) {}
    for (const x of cuts) { try { c.drawImage(await loadImage(Buffer.from(x.png, 'base64')), x.x * kx, x.y * ky, x.w * kx, x.h * ky); } catch (e) {} }
    // 🎞️ same HUD chrome as the card scenes — uniform in every death image
    if (chrome && process.env.DEATH_STILL_CHROME !== '0') {
        try {
            const hide = new Set([...dyingIdx, ...__dead].map((n) => Math.floor(Number(n) || 0)));
            c.save(); c.scale(kx, ky);
            await require('./combatCardNode').paintChrome(c, 1024 / 1024, { ...chrome, layers, hide });
            c.restore();
        } catch (e) {}
    }
    return cv;
}

// ── the KO'd body: rotated off its stance, grounded, desaturated ─────────
function drawDeadSprite(plate, cutImg, a, kx, ky) {
    const c = plate.getContext('2d');
    const w = Number(a.w) || cutImg.width, h = Number(a.h) || cutImg.height;
    const ax = (Number(a.x) || 0) * kx, feetY = (Number(a.feetY) || (Number(a.y) || 0) + h) * ky;
    const dw = w * kx, dh = h * ky;
    // desaturate + darken on an offscreen canvas
    const off = createCanvas(Math.max(2, Math.round(dw)), Math.max(2, Math.round(dh)));
    const oc = off.getContext('2d');
    oc.drawImage(cutImg, 0, 0, off.width, off.height);
    try {
        oc.globalCompositeOperation = 'saturation';
        oc.fillStyle = 'hsl(0,0%,35%)'; oc.fillRect(0, 0, off.width, off.height);
        oc.globalCompositeOperation = 'source-atop';
        oc.fillStyle = 'rgba(8,6,20,0.30)'; oc.fillRect(0, 0, off.width, off.height);
        oc.globalCompositeOperation = 'source-over';
    } catch (e) {   // older canvas build without blend modes: gray veil
        oc.globalCompositeOperation = 'source-atop';
        oc.fillStyle = 'rgba(90,90,100,0.45)'; oc.fillRect(0, 0, off.width, off.height);
    }
    // fall backward around the feet (enemies face the players), sink to the ground line
    c.save();
    c.globalAlpha = 0.92;
    c.translate(ax, feetY);
    c.rotate(Math.PI * 0.56);
    try { c.drawImage(off, -dw * 0.42, -dh * 0.30, dw * 0.84, dh * 0.84); } catch (e) {}
    c.restore();
}

// ── ☠ DEFEATED chip where the HP bar was ─────────────────────────────────
function drawDefeatChip(plate, a, kx, ky) {
    const c = plate.getContext('2d');
    const ax = (Number(a.x) || 0) * kx;
    const topY = ((Number(a.feetY) || 0) - Math.max(24, Number(a.h) || 0) - 15) * ky;
    const W = 108, H = 20, x = ax - W / 2, y = Math.max(6, topY - H - 3);
    c.save();
    c.globalAlpha = 0.92;
    c.fillStyle = 'rgba(12,10,18,0.85)';
    c.beginPath();
    const r = 5;
    c.moveTo(x + r, y); c.arcTo(x + W, y, x + W, y + H, r); c.arcTo(x + W, y + H, x, y + H, r);
    c.arcTo(x, y + H, x, y, r); c.arcTo(x, y, x + W, y, r); c.closePath(); c.fill();
    c.strokeStyle = 'rgba(232,90,55,0.85)'; c.lineWidth = 1; c.stroke();
    // procedural X (no glyph-font dependency)
    c.strokeStyle = '#ff6b4a'; c.lineWidth = 2.4; c.lineCap = 'round';
    const mx = x + 15, my = y + H / 2, s2 = 5;
    c.beginPath(); c.moveTo(mx - s2, my - s2); c.lineTo(mx + s2, my + s2);
    c.moveTo(mx + s2, my - s2); c.lineTo(mx - s2, my + s2); c.stroke();
    c.fillStyle = '#ffd9d0'; c.font = 'bold 11px sans-serif'; c.textAlign = 'left'; c.textBaseline = 'middle';
    c.fillText('DEFEATED', x + 28, my + 0.5);
    c.restore();
}

// ── main entry ───────────────────────────────────────────────────────────
/** Render ONE death still for every enemy that died on the same beat.
 *  layers: shared per-fight Go layers (bg + cuts + anchors, hud none-clean)
 *  picks:  [{ enemy, targetIndex }] — the dying, in roster order
 *  deadIdx: Set of enemy indices that died on EARLIER turns (bars erased, absent)
 *  Returns { image, kind, boss, group } or null. Never throws. */
async function renderDeathStill({ layers, picks, deadIndices, deadIdx, chrome }) {
    try {
        const group = (Array.isArray(picks) ? picks : []).filter((t) => t && t.enemy).slice(0, 4);
        if (!group.length || !layers) return null;
        const dyingIdx = new Set(group.map((t) => Math.max(0, Math.floor(Number(t.targetIndex) || 0))));
        const __dead = deadIdx instanceof Set ? deadIdx : new Set((Array.isArray(deadIndices) ? deadIndices : []).map((n) => Math.floor(Number(n) || 0)).filter((n) => n >= 0));
        // one element mode for the unit: the most common death kind in the group
        const tally = {}; let kind = 'DUST', n = 0;
        for (const t of group) { const k = classifyDeath(t.enemy); tally[k] = (tally[k] || 0) + 1; if (tally[k] > n) { kind = k; n = tally[k]; } }
        const boss = group.some((t) => !!(t.enemy.isBoss || t.enemy.boss || /boss/i.test(String(t.enemy.rank || t.enemy.tier || ''))));

        const plate = await scenePlateCanvas(layers, dyingIdx, __dead, chrome);
        const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
        const kx = VW / W0, ky = VH / H0;
        const c = plate.getContext('2d');

        // the dying's own cutouts — grabbed straight from layers.cuts
        const stampBuf = await getStamp(kind, boss);
        const stamp = stampBuf ? await loadImage(stampBuf) : null;   // node-canvas drawImage wants Image/Canvas, not Buffer
        for (const t of group) {
            const i = Math.max(0, Math.floor(Number(t.targetIndex) || 0));
            const cut = (layers.cuts || []).find((x) => x && String(x.side) === 'enemy' && Math.floor(Number(x.index) || 0) === i && x.png);
            const a = (layers.anchors || []).find((v) => v && String(v.side) === 'enemy' && Math.floor(Number(v.index) || 0) === i) || null;
            if (cut && cut.png) {
                let img = null;
                try { img = await loadImage(Buffer.from(cut.png, 'base64')); } catch (e) {}
                if (img) {
                    const aa = a || { x: cut.x, y: cut.y, w: cut.w, h: cut.h, feetY: (Number(cut.y) || 0) + (Number(cut.h) || 0), index: i, side: 'enemy' };
                    drawDeadSprite(plate, img, aa, kx, ky);
                    // premade stamp engulfing the body — scaled to ~1.5x its box
                    if (stamp) {
                        const sw = Math.max(180, (Number(aa.w) || 200) * kx * 1.5);
                        c.drawImage(stamp, (Number(aa.x) || 0) * kx - sw / 2, ((Number(aa.feetY) || 0) * ky) - sw * 0.62, sw, sw);
                    }
                    drawDefeatChip(plate, aa, kx, ky);
                }
            }
        }
        const image = plate.toBuffer('image/jpeg', { quality: 0.85 });
        return { image, kind, boss, group: group.map((t) => t.enemy) };
    } catch (err) {
        console.warn('[DeathStill] render failed:', err && err.message || err);
        return null;
    }
}

module.exports = {
    renderDeathStill,
    classifyDeath,
    DEATH_RULES,
    // test hooks
    _paintStamp: paintStamp,
    _getStamp: getStamp,
    _stampDir: STAMP_DIR,
    _scenePlateCanvas: scenePlateCanvas,
    _VW: VW, _VH: VH,
};
