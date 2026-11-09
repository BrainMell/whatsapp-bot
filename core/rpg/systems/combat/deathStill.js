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
// (rotated off its stance, grounded, STILL READABLE — v2 keeps ~45% of the
// sprite's color; the v1 full-gray wash read as "random gray trash on the
// floor", owner meltdown 16:51Z), (2) premade element art frozen at its PEAK
// frame, BIG and bottom-anchored at the body's feet (v2: real 384px blasts +
// crater decals — v1 picked 64px 1%-visible pixies and misspelled every
// Kenney filename, so stamps rendered as white glints), (3) a ☠ DEFEATED chip
// sits where the HP bar was, (4) debris is SETTLED — the "after", not the "during".
//
// Architecture: the expensive part (premade art composition) is painted ONCE
// per (kind, boss) into a transparent "death stamp" PNG (disk + memory cache)
// — every kill is then scenePlate + stamp-behind + dead-sprite + stamp-front
// + chip blits, warm in ~0.1-0.25s. Replaces the 18-24s animated mp4 pipeline.
//
// premade sources: core/rpgasset/vfx (CC0 — fire2 blasts, kenney explosion/
// smoke/crater sets, meteor boulders, magic bolts, clock mandalas; CREDITS.md).

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
// 💡 v2: files are looked up by GLOBBING the real directory (the sets use
// inconsistent names — bsmoke_1..13, p_dirt_01, "Dark VFX 1 (40x32)3.png" —
// v1 hardcoded wrong names and EVERY Kenney load silently 404'd).
// 💡 v2 FIX: THREE ups (combat → systems → rpg → core) — v1 used two and
// pointed at core/rpg/rpgasset/vfx which DOESN'T EXIST, so every premade load
// silently 404'd since yesterday and every stamp rendered as a white glint.
const VFX_DIR = path.join(__dirname, '..', '..', '..', 'rpgasset', 'vfx');
const _dirMemo = new Map();
function dirFiles(sub) {
    if (_dirMemo.has(sub)) return _dirMemo.get(sub);
    let list = [];
    try { list = fs.readdirSync(path.join(VFX_DIR, sub)).filter((f) => /\.png$/i.test(f)).sort(); } catch (e) {}
    _dirMemo.set(sub, list);
    return list;
}
const _missingWarned = new Set();
function pickFile(sub, re, frac) {
    const files = dirFiles(sub).filter((f) => re.test(f));
    if (!files.length) {
        const key = sub + '::' + String(re);
        if (!_missingWarned.has(key)) { _missingWarned.add(key); console.warn(`[DeathStill] vfx set missing: ${sub}/${re} (stamp will lose a layer)`); }
        return null;
    }
    const idx = Math.max(0, Math.min(files.length - 1, Math.floor(files.length * frac)));
    return path.join(VFX_DIR, sub, files[idx]);
}
async function art(sub, re, frac = 0.6) {
    const p = pickFile(sub, re, frac);
    if (!p) return null;
    try { return await loadImage(p); } catch (e) { return null; }
}

// tint a (usually grayscale) premade sprite — returns a canvas
const _tintMemo = new Map();
function tinted(img, color) {
    if (!img) return null;
    const key = (img._tintKey || (img._tintKey = Math.random().toString(36).slice(2))) + '|' + color;
    if (_tintMemo.has(key)) return _tintMemo.get(key);
    const cv = createCanvas(img.width, img.height);
    const c = cv.getContext('2d');
    c.drawImage(img, 0, 0);
    c.globalCompositeOperation = 'source-in';
    c.fillStyle = color;
    c.fillRect(0, 0, cv.width, cv.height);
    _tintMemo.set(key, cv);
    return cv;
}

// centered draw helper (v1's corner math kept mis-placing layers)
function putArt(c, img, cx, cy, w, h, opts = {}) {
    if (!img) return;
    const { alpha = 1, rot = 0, smooth = true } = opts;
    c.save();
    c.globalAlpha = alpha;
    c.imageSmoothingEnabled = smooth;
    c.translate(cx, cy);
    if (rot) c.rotate(rot);
    c.drawImage(img, -w / 2, -h / 2, w, h);
    c.restore();
}

// ── the death stamp: per (kind, boss) transparent PNG painted ONCE ───────
// Art box 480x480 — the caller blits it BOTTOM-ANCHORED at the body's feet,
// so layers baked low (craters) land on the ground line and the core blast
// lands mid-body. v2 uses the real big art; NO white flash wash (v1's stamps
// measured avg RGB 255,254,254 — literally white rectangles).
const STAMP_SIZE = 480;
const STAMP_DIR = path.join(os.tmpdir(), 'death_stamps_v5');
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

// ── v4 design helpers — grounded in real VFX practice (shape language first,
// 3-stop value ramps, soft edges). NO pasted decals with straight canvas cuts.
// soft radial-gradient ellipse — every ground mark (scorch, puddle, dirt shadow)
function softBlob(c, x, y, rx, ry, stops) {
    c.save(); c.translate(x, y); c.scale(rx, ry);
    const g = c.createRadialGradient(0, 0, 0.05, 0, 0, 1);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g; c.fillRect(-1, -1, 2, 2);
    c.restore();
}
// partial tint — keeps the premade's internal shading (v2's full source-in
// tint flattened the soot boulders into flat beige donuts — the "blobs")
function tintedSoft(img, color, a) {
    if (!img) return null;
    const cv = createCanvas(img.width, img.height);
    const c2 = cv.getContext('2d');
    c2.drawImage(img, 0, 0);
    c2.globalCompositeOperation = 'source-atop';
    c2.globalAlpha = a; c2.fillStyle = color; c2.fillRect(0, 0, cv.width, cv.height);
    return cv;
}
// tapered curved spout (water crown) with a 3-stop value ramp base→tip
function spout(c, x, y, hgt, lean, w0, stops) {
    c.save();
    const g = c.createLinearGradient(x, y, x + lean, y - hgt);
    for (const [o, col] of stops) g.addColorStop(o, col);
    c.fillStyle = g;
    c.beginPath();
    c.moveTo(x - w0, y);
    c.quadraticCurveTo(x - w0 * 0.35 + lean * 0.35, y - hgt * 0.62, x + lean, y - hgt);
    c.quadraticCurveTo(x + w0 * 0.3 + lean * 0.5, y - hgt * 0.5, x + w0 * 0.55, y);
    c.closePath(); c.fill();
    c.restore();
}
// irregular gradient-shaded rubble chip — polygons, never fillRect squares
function rubbleChip(c, x, y, r, rot, rnd, pal) {
    c.save(); c.translate(x, y); c.rotate(rot);
    const n = 5 + Math.floor(rnd() * 3), pts = [];
    for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, rr = r * (0.7 + rnd() * 0.5); pts.push([Math.cos(a) * rr, Math.sin(a) * rr * 0.72]); }
    const g = c.createLinearGradient(-r, -r, r, r);
    g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath();
    c.fillStyle = g; c.fill();
    c.strokeStyle = 'rgba(30,22,14,0.5)'; c.lineWidth = 1.5; c.stroke();
    c.restore();
}
// jagged ground crack with tapering width + occasional branch
function crackLine(c, x0, y0, ang, len, rnd) {
    c.save(); c.strokeStyle = 'rgba(38,28,18,0.7)'; c.lineCap = 'round';
    let x = x0, y = y0, w = 3 + rnd() * 2;
    const segs = 3 + Math.floor(rnd() * 3);
    for (let i = 0; i < segs; i++) {
        const a2 = ang + (rnd() - 0.5) * 0.7, l2 = (len / segs) * (0.6 + rnd() * 0.8);
        const nx = x + Math.cos(a2) * l2, ny = y + Math.sin(a2) * l2 * 0.35;
        c.lineWidth = Math.max(0.8, w); c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
        if (rnd() < 0.4) { c.lineWidth = 1; c.beginPath(); c.moveTo(nx, ny); c.lineTo(nx + (rnd() - 0.5) * 30, ny + 6 + rnd() * 12); c.stroke(); }
        x = nx; y = ny; w *= 0.72;
    }
    c.restore();
}

async function paintStamp(kind, boss) {
    const S = STAMP_SIZE, cv = createCanvas(S, S), c = cv.getContext('2d');
    const cx = S / 2, gy = S - 78;   // gy = the ground line inside the stamp (craters sit here)
    const rnd = mulberry32(hashStr(kind + (boss ? ':boss' : '')));
    const A = boss ? 1.15 : 1;   // bosses die louder

    if (kind === 'FIRE') {
        // 💡 v4: same hero (fire2 blast + flash core + jet + smoke — that part
        // worked), but the scorch is now a SOFT PROCEDURAL radial mark. The
        // kenney ground_* decal is a flat-bottomed icon sprite — pasted raw at
        // 95% it read as "partly cut off clearly a png" (owner, third strike).
        const smoke = await art('kenney', /^sexp_[1-5]\.png$/, 0.25);
        const blast = await art('fire2', /^blast_[1-6]\.png$/, 0.5);
        const blast2 = await art('fire2', /^blast_[1-6]\.png$/, 0.33);
        const jet = await art('fire2', /^jet_[1-4]\.png$/, 0.75);
        const core = await art('kenney', /^flash_[1-5]\.png$/, 0.5);
        // scorch: dark soft ellipse + ember-hot inner rim + settled cinders
        softBlob(c, cx, gy + 6, 200 * A, 36 * A, [[0, 'rgba(20,11,5,0.92)'], [0.5, 'rgba(38,19,7,0.6)'], [1, 'rgba(38,19,7,0)']]);
        softBlob(c, cx, gy + 4, 118 * A, 19 * A, [[0, 'rgba(122,42,10,0.55)'], [1, 'rgba(122,42,10,0)']]);
        for (let i = 0; i < 7; i++) speck(rnd, c, cx + (rnd() - 0.5) * 300 * A, gy + 10 + rnd() * 14, 1.4 + rnd() * 2.2, i % 2 ? '#ff9c40' : '#e85a37', 0.45 + rnd() * 0.4);
        putArt(c, smoke, cx, gy - 150 * A, 300 * A, 260 * A, { alpha: 0.8 });
        putArt(c, blast, cx, gy - 175 * A, 345 * A, 345 * A, { alpha: 1 });
        putArt(c, blast2, cx - 60 * A, gy - 225 * A, 230 * A, 230 * A, { alpha: 0.9, rot: 0.35 });
        putArt(c, jet, cx + 82 * A, gy - 300 * A, 115 * A, 115 * A, { alpha: 0.85 });
        putArt(c, core, cx, gy - 175 * A, 130 * A, 130 * A, { alpha: 0.9 });
        motes(rnd, c, cx, gy - 160 * A, 22 * A, 1.5, 3.5, 175 * A, ['#ffcb45', '#e85a37', '#fff3c0', '#ffffff'], 46, 0.5, 0.95);
    } else if (kind === 'VOID') {
        const mass1 = tinted(await art('meteor', /^boulder_[1-8]\.png$/, 0.4), '#150820');
        const mass2 = tinted(await art('meteor', /^boulder_[1-8]\.png$/, 0.75), '#241035');
        const boltA = await art('magic', /^Dark-Bolt([1-9]|1[0-2])\.png$/, 0.83);            // deep purple frames
        const boltB = await art('magic', /^Dark-Bolt([1-9]|1[0-2])\.png$/, 0.66);
        const ring = await art('clock', /^mandala_[1-7]\.png$/, 0.4);
        const gas = tinted(await art('kenney', /^gas_[1-5]\.png$/, 0.4), '#4a1a66');
        putArt(c, gas, cx, gy - 170 * A, 300 * A, 250 * A, { alpha: 0.55 });
        putArt(c, mass1, cx, gy - 160 * A, 300 * A, 300 * A, { alpha: 0.92 });               // dark implosion mass
        putArt(c, mass2, cx, gy - 235 * A, 230 * A, 230 * A, { alpha: 0.85 });
        putArt(c, ring, cx, gy - 165 * A, 285 * A, 285 * A, { alpha: 0.6 });                 // arcane collapse ring
        putArt(c, boltA, cx, gy - 185 * A, 235 * A, 325 * A, { alpha: 0.95, smooth: false }); // pixel-crisp bolts
        putArt(c, boltB, cx + 55 * A, gy - 150 * A, 190 * A, 265 * A, { alpha: 0.8, rot: Math.PI / 2, smooth: false });
        // inward implosion: motes denser NEAR the centre (pulled in), purple/black
        for (let i = 0; i < 24 * A; i++) {
            const ang = rnd() * Math.PI * 2, d = (10 + 150 * A * rnd() * rnd());
            speck(rnd, c, cx + Math.cos(ang) * d, (gy - 160 * A) + Math.sin(ang) * d * 0.8, 1.5 + rnd() * 3, ['#7b4dff', '#2a1240', '#b18cff', '#12081f'][Math.floor(rnd() * 4)], 0.55 + rnd() * 0.4);
        }
    } else if (kind === 'EARTH') {
        // 💡 v4b iteration (full-res eyes on v4): earth read as murky lumps —
        // cracks were invisible on the dark floor, nothing was mid-air, two
        // giant boulders dominated. Now: a frozen ballistic arc of flying
        // chunks at the peak, lit-edge radiating cracks that actually SHOW,
        // smaller sunk ground boulders, lighter dust.
        const b1 = await art('meteor', /^boulder_[1-8]\.png$/, 0.12);
        const b2 = await art('meteor', /^boulder_[1-8]\.png$/, 0.6);
        const b3 = await art('meteor', /^boulder_[1-8]\.png$/, 0.88);
        const b4 = await art('meteor', /^boulder_[1-8]\.png$/, 0.3);
        const dirt1 = tintedSoft(await art('kenney', /^p_dirt_0[12]\.png$/, 0.2), '#6b5136', 0.5);
        const dirt2 = tintedSoft(await art('kenney', /^p_dirt_0[12]\.png$/, 0.8), '#57432c', 0.45);
        const dust = tinted(await art('kenney', /^bsmoke_([1-9]|1[0-3])\.png$/, 0.55), '#9a8062');
        softBlob(c, cx, gy + 6, 195 * A, 34 * A, [[0, 'rgba(24,16,9,0.8)'], [1, 'rgba(24,16,9,0)']]);   // dirt shadow
        putArt(c, dust, cx, gy - 175 * A, 240 * A, 195 * A, { alpha: 0.34 });
        putArt(c, dirt1, cx - 80 * A, gy - 70 * A, 170 * A, 170 * A, { alpha: 0.7 });
        putArt(c, dirt2, cx + 72 * A, gy - 55 * A, 150 * A, 150 * A, { alpha: 0.65 });
        // frozen ballistic arc — chunks caught mid-air at their peak (still = frozen at the "after")
        putArt(c, tintedSoft(b3, '#5f4f3c', 0.45), cx - 34 * A, gy - 205 * A, 62 * A, 62 * A, { alpha: 0.95, rot: 0.9 });
        putArt(c, tintedSoft(b4, '#6e5b44', 0.5), cx - 118 * A, gy - 148 * A, 46 * A, 46 * A, { alpha: 0.95, rot: -0.5 });
        putArt(c, tintedSoft(b3, '#7a664c', 0.5), cx + 64 * A, gy - 150 * A, 40 * A, 40 * A, { alpha: 0.95, rot: 2.1 });
        // settled boulders — smaller than v4, spread, sunk past the ground line
        putArt(c, tintedSoft(b1, '#7a664c', 0.55), cx - 108 * A, gy - 30 * A, 92 * A, 92 * A, { alpha: 0.96, rot: -0.3 });
        putArt(c, tintedSoft(b2, '#6e5b44', 0.5), cx + 96 * A, gy - 24 * A, 76 * A, 76 * A, { alpha: 0.96, rot: 0.5 });
        // impact burst star + lit-edge radiating cracks (dark core, light lip)
        c.save();
        c.lineCap = 'round';
        for (let i = 0; i < 7; i++) {
            const ang = (i / 7) * Math.PI * 2 + 0.3;
            const r0 = 8 + rnd() * 8, r1 = 30 + rnd() * 26;
            const y0 = (gy + 12) + Math.sin(ang) * r0 * 0.4, y1 = (gy + 12) + Math.sin(ang) * r1 * 0.4;
            c.strokeStyle = 'rgba(16,10,6,0.85)'; c.lineWidth = 3.2;
            c.beginPath(); c.moveTo(cx + Math.cos(ang) * r0, y0); c.lineTo(cx + Math.cos(ang) * r1, y1); c.stroke();
            c.strokeStyle = 'rgba(190,170,140,0.3)'; c.lineWidth = 1.2;
            c.beginPath(); c.moveTo(cx + Math.cos(ang) * r0 + 1.5, y0 + 1.5); c.lineTo(cx + Math.cos(ang) * r1 + 1.5, y1 + 1.5); c.stroke();
        }
        c.restore();
        for (let i = 0; i < 4; i++) crackLine(c, cx + (rnd() - 0.5) * 60, gy + 14 + rnd() * 10, (rnd() < 0.5 ? Math.PI : 0) + (rnd() - 0.5) * 0.9, 70 + rnd() * 70, rnd);
        // gradient-shaded polygon rubble settled on the ground
        const pal = [['#8a7658', '#4e3f2e'], ['#7d6d55', '#443728'], ['#93805f', '#574834']];
        for (let i = 0; i < 11 * A; i++) {
            rubbleChip(c, cx + (rnd() - 0.5) * 280 * A, gy + 6 + rnd() * 40, 5 + rnd() * 12, rnd() * Math.PI, rnd, pal[Math.floor(rnd() * pal.length)]);
        }
    } else if (kind === 'WATER') {
        // 💡 v4 full rework: v2 drew a stroked pancake + a stretched sprite-
        // SHEET smear (attack3 is a 3-frame strip — never draw a sheet whole)
        // + a floating thin ring = the "offensive" soap bubble. Now: soft
        // gradient puddle (no outline) + a real CROWN splash — tapered spouts
        // with a 3-stop value ramp, tall centre → short flanks — highlighted
        // droplets arcing outward, foam and mist kept subtle.
        const foam = tinted(await art('kenney', /^puff_([1-9]|1[0-3])\.png$/, 0.3), '#eaf7ff');
        const mist = tinted(await art('kenney', /^puff_([1-9]|1[0-3])\.png$/, 0.4), '#9fd4ff');
        // puddle: layered soft gradients, NO stroke outline
        softBlob(c, cx, gy + 8, 178 * A, 33 * A, [[0, 'rgba(24,80,148,0.88)'], [0.5, 'rgba(45,112,188,0.55)'], [1, 'rgba(45,112,188,0)']]);
        softBlob(c, cx - 45 * A, gy + 4, 72 * A, 12 * A, [[0, 'rgba(196,232,255,0.55)'], [1, 'rgba(196,232,255,0)']]);
        // central burst column
        softBlob(c, cx, gy - 52 * A, 58 * A, 88 * A, [[0, 'rgba(214,242,255,0.8)'], [0.55, 'rgba(120,190,240,0.4)'], [1, 'rgba(120,190,240,0)']]);
        // crown: 9 tapered spouts, parabolic heights, leaning outward
        const nS = 9;
        for (let i = 0; i < nS; i++) {
            const t = i / (nS - 1), dx = (t - 0.5) * 2;
            spout(c, cx + dx * 98 * A, gy + 5, (56 + 70 * (1 - dx * dx)) * A, dx * 36 * A, 12.5 * A,
                [[0, 'rgba(26,82,146,0.95)'], [0.55, 'rgba(70,160,222,0.92)'], [1, 'rgba(238,250,255,0.95)']]);
        }
        putArt(c, foam, cx, gy - 26 * A, 135 * A, 78 * A, { alpha: 0.5 });
        putArt(c, mist, cx - 58 * A, gy - 195 * A, 150 * A, 118 * A, { alpha: 0.3 });
        // droplets with a highlight dot, arcing outward and falling
        for (let i = 0; i < 15 * A; i++) {
            const dx = (rnd() - 0.5) * 2;
            const x = cx + dx * (100 + rnd() * 85) * A;
            const y = gy - (26 + (1 - Math.abs(dx)) * 120 * rnd()) * A + rnd() * 46;
            const r = 1.8 + rnd() * 3.2;
            speck(rnd, c, x, y, r, ['rgba(186,228,255,0.95)', 'rgba(116,182,238,0.92)', 'rgba(255,255,255,0.95)'][Math.floor(rnd() * 3)], 0.9);
            speck(rnd, c, x - r * 0.34, y - r * 0.34, r * 0.34, 'rgba(255,255,255,0.95)', 0.95);
        }
    } else if (kind === 'ICE') {
        const pane = tinted(await art('kenney', /^p_window_01\.png$/, 0.5), '#cfeeff');
        const ring = tinted(await art('kenney', /^p_circle_0[235]\.png$/, 0.8), '#dff4ff');
        const sparkle = tinted(await art('kenney', /^p_light_0[12]\.png$/, 0.3), '#ffffff');
        // frost patch
        c.save(); c.globalAlpha = 0.45; c.fillStyle = '#bfe8ff';
        c.beginPath(); c.ellipse(cx, gy + 6, 155 * A, 32 * A, 0, 0, Math.PI * 2); c.fill(); c.restore();
        putArt(c, pane, cx, gy - 150 * A, 250 * A, 250 * A, { alpha: 0.35 });                // frost pane behind
        putArt(c, ring, cx, gy - 130 * A, 250 * A, 250 * A, { alpha: 0.5 });
        putArt(c, sparkle, cx + 60 * A, gy - 235 * A, 150 * A, 150 * A, { alpha: 0.5 });
        // shard spray — BIG shards
        c.save();
        for (let i = 0; i < 15 * A; i++) {
            const x = cx + (rnd() - 0.5) * 260 * A, y = gy - 60 * A + (rnd() - 0.55) * 210 * A;
            const len = 22 + rnd() * 46, w = 6 + rnd() * 11, rot = (rnd() - 0.5) * 2.4;
            c.translate(x, y); c.rotate(rot);
            c.fillStyle = `rgba(${150 + Math.floor(rnd() * 60)},${215 + Math.floor(rnd() * 40)},255,${0.78 + rnd() * 0.22})`;
            c.beginPath(); c.moveTo(0, -len); c.lineTo(w, len * 0.35); c.lineTo(0, len * 0.6); c.lineTo(-w, len * 0.35); c.closePath(); c.fill();
            c.strokeStyle = 'rgba(255,255,255,0.9)'; c.lineWidth = 1.4; c.stroke();
            c.setTransform(1, 0, 0, 1, 0, 0);
        }
        c.restore();
        // sparkle crosses
        c.save(); c.strokeStyle = 'rgba(255,255,255,0.95)'; c.lineWidth = 2;
        for (let i = 0; i < 6; i++) {
            const x = cx + (rnd() - 0.5) * 230 * A, y = gy - 60 * A + (rnd() - 0.5) * 190 * A, r = 5 + rnd() * 9;
            c.beginPath(); c.moveTo(x - r, y); c.lineTo(x + r, y); c.moveTo(x, y - r); c.lineTo(x, y + r); c.stroke();
        }
        c.restore();
    } else {   // DUST — the generic fallback
        const puff1 = await art('kenney', /^puff_([1-9]|1[0-3])\.png$/, 0.15);
        const puff2 = await art('kenney', /^puff_([1-9]|1[0-3])\.png$/, 0.7);
        const smoke = await art('kenney', /^p_smoke_0[15]\.png$/, 0.3);
        putArt(c, puff1, cx, gy - 160 * A, 300 * A, 265 * A, { alpha: 0.62 });
        putArt(c, puff2, cx - 20 * A, gy - 90 * A, 255 * A, 235 * A, { alpha: 0.68 });
        putArt(c, smoke, cx + 45 * A, gy - 205 * A, 185 * A, 185 * A, { alpha: 0.5 });
        motes(rnd, c, cx, gy - 120 * A, 22 * A, 1.2, 3.2, 170 * A, ['#cfc8bd', '#a89f92', '#847c71', '#e8e2d8'], 70, 0.4, 0.85);   // dissolve motes rising
    }

    return cv.toBuffer('image/png');
}

async function getStamp(kind, boss) {
    const key = `${kind}${boss ? '_boss' : ''}`;
    if (_stampMemo.has(key)) return _stampMemo.get(key);
    try {
        if (!fs.existsSync(STAMP_DIR)) fs.mkdirSync(STAMP_DIR, { recursive: true });
        const f = path.join(STAMP_DIR, `${key}.png`);
        let buf;
        if (fs.existsSync(f) && fs.statSync(f).size > 2000) buf = fs.readFileSync(f);
        else { buf = await paintStamp(kind, boss); fs.writeFileSync(f, buf); }
        _stampMemo.set(key, buf);
        return buf;
    } catch (e) {
        try { return await paintStamp(kind, boss); } catch (e2) { return null; }   // cache-less fallback
    }
}

// ── scene plate (moved from deathOverlay.scenePlate — returns CANVAS) ────
// 💡 PROBED 2026-11-09: Go's layers bg is a CLEAN scene (no combatants baked)
// and DEAD combatants get NO cut/anchor at all — so the plate is bg + survivor
// cuts + chrome, and the dying appear ONLY via the KO'd body we draw.
async function scenePlateCanvas(layers, dyingIdx, deadIdx, chrome) {
    const W0 = Number(layers.w) || 1024, H0 = Number(layers.h) || 687;
    const kx = VW / W0, ky = VH / H0;
    const cv = createCanvas(VW, VH), c = cv.getContext('2d');
    const __bg = await loadImage(layers.bg);
    c.drawImage(__bg, 0, 0, VW, VH);
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

// ── the KO'd body: a barely-visible ghost STANDING at its battle spot ────
// 💡 v5 (owner clarification 2026-11-09: "why are the transparent assets
// still on the ground and not standing up... like I said"): the dead unit
// stays UPRIGHT in its stance, feet on its own ground line, at its exact
// battle position — a ~14%-alpha ghost of where it stood. No rotation, no
// lying pose, no shadow. (v3 ghosted the fall-rotated corpse — the owner
// never wanted the lying pose at all; "leave the position as is" meant its
// stance position.) DEATH_GHOST_DEBUG=1 renders the ghost at 0.9 alpha so
// the pose can be eyeballed in QA sheets.
function drawDeadSprite(plate, cutImg, a, kx, ky) {
    const c = plate.getContext('2d');
    const w = Number(a.w) || cutImg.width, h = Number(a.h) || cutImg.height;
    const ax = (Number(a.x) || 0) * kx, feetY = (Number(a.feetY) || (Number(a.y) || 0) + h) * ky;
    const dw = w * kx, dh = h * ky;
    c.save();
    c.globalAlpha = process.env.DEATH_GHOST_DEBUG ? 0.9 : 0.14;
    try { c.drawImage(cutImg, ax - dw / 2, feetY - dh, dw, dh); } catch (e) {}
    c.restore();
}

// ── ☠ DEFEATED chip where the HP bar was ─────────────────────────────────
function drawDefeatChip(plate, a, kx, ky, off = { dx: 0, dy: 0 }) {
    const c = plate.getContext('2d');
    const ax = (Number(a.x) || 0) * kx + (off.dx || 0);
    const topY = ((Number(a.feetY) || 0) - Math.max(24, Number(a.h) || 0) - 15) * ky + (off.dy || 0);
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
 *  deadIdx: Set of enemy indices that died on EARLIER turns (absent from scene)
 *  Returns { image, kind, boss, group } or null. Never throws. */
async function renderDeathStill({ layers, picks, deadIndices, deadIdx, chrome }) {
    try {
        // 🛡️ SHAPE-NORMALIZE (2026-11-09 prod lesson: the one prod caller
        // passed {e, i} while this filter read t.enemy — every pick was
        // silently dropped and every kill still returned null; ending kills
        // showed nothing but the victory card). Accept both shapes; a pick
        // may never be silently lost.
        const group = (Array.isArray(picks) ? picks : [])
            .map((t) => (t && (t.enemy || t.e)) ? { enemy: t.enemy || t.e, targetIndex: Number(t.targetIndex ?? t.i) || 0 } : null)
            .filter(Boolean).slice(0, 4);
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

        const stampBuf = await getStamp(kind, boss);
        const stamp = stampBuf ? await loadImage(stampBuf) : null;   // node-canvas drawImage wants Image/Canvas, not Buffer
        let chipI = 0;
        for (const t of group) {
            const i = Math.max(0, Math.floor(Number(t.targetIndex) || 0));
            const cut = (layers.cuts || []).find((x) => x && String(x.side) === 'enemy' && Math.floor(Number(x.index) || 0) === i && x.png);
            const a = (layers.anchors || []).find((v) => v && String(v.side) === 'enemy' && Math.floor(Number(v.index) || 0) === i) || null;
            if (cut && cut.png) {
                let img = null;
                try { img = await loadImage(Buffer.from(cut.png, 'base64')); } catch (e) {}
                if (img) {
                    const aa = a || { x: cut.x, y: cut.y, w: cut.w, h: cut.h, feetY: (Number(cut.y) || 0) + (Number(cut.h) || 0), index: i, side: 'enemy' };
                    const bodyW = (Number(aa.w) || 200) * kx;
                    const feetY = (Number(aa.feetY) || (Number(aa.y) || 0) + (Number(aa.h) || 0)) * ky;
                    // 💥 STAMP v2: BIG, bottom-anchored at the feet — layers baked
                    // low in the stamp (crater) land ON the ground line, the core
                    // blast lands mid-body. v1 drew a 1.5x-bodybox stamp wherever
                    // and it measured pure white on prod.
                    let sw = 0, sx = 0, sy = 0;
                    if (stamp) {
                        sw = Math.max(275, Math.min(450, bodyW * 2.5));
                        sx = (Number(aa.x) || 0) * kx - sw / 2;
                        sy = feetY - sw * 0.86;   // 86% of the blast above the ground line
                        c.drawImage(stamp, sx, sy, sw, sw);
                    }
                    drawDeadSprite(plate, img, aa, kx, ky);
                    // light front pass: a few embers/motes OVER the body for depth
                    if (stamp) {
                        c.save(); c.globalAlpha = 0.28;
                        c.drawImage(stamp, sx, sy, sw * 0.82, sw * 0.82);
                        c.restore();
                    }
                    // group kills: stagger the chips so they don't stack into one blob
                    const gN = group.length;
                    drawDefeatChip(plate, aa, kx, ky, { dx: gN > 1 ? (chipI - (gN - 1) / 2) * 26 : 0, dy: gN > 2 ? -(chipI % 2) * 22 : 0 });
                    chipI++;
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
