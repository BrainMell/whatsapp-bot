// ============================================
// 🏛️ RUINS ROOM SCENE RENDERER — presentation overhaul 2026-10-04 (QA pass)
// Owner spec (Final Polish brief §2-§6): the room image is the WORLD.
// Rendered fully in Node (node-canvas) from the owner's own Ruins plates —
// the Go microservice is NOT involved, so nothing here depends on the
// Box-2 deploy path or the Bot_genaration divergence.
//
//   • background = the door-variant plate that matches the room's REAL
//     exits (N/E/W arches; S faces the player — indicator only)
//   • yellow chevrons at every open arch, none where there is no path;
//     S-chevron stack sits clear of the bottom strip
//   • a floor compass laid as a PERSPECTIVE decal on the stone — reads as
//     etched into the floor, not a floating UI disc
//   • the player's ASSIGNED sprite (the SAME class+spriteIndex the default
//     combat/profile system resolves) standing GROUNDED: sprites are placed
//     by their alpha-content bounding box, so transparent padding inside the
//     PNG can never make the actor levitate (the old full-canvas scaling did)
//   • ROOM-TYPE CONTENT SPAWNS VISUALLY (§6): combat/coop rooms show the
//     actual seeded enemy pack, core/secret-boss rooms show the guardian,
//     discovery/reward/hazard/lore/anomaly/landmark rooms show their
//     content. Backend payloads stay the single source of truth — this is
//     their PRESENTATION, never a replacement.
//   • small ambient props (crates, urns, bones, rubble, moss) seeded per
//     room, wall-hugging, never blocking doors, the player or content
//   • encounter-style PLAYER HUD bottom-left (name/level/class/HP/energy +
//     state line) using the player's REAL persistent pools — Guild War
//     speaks the same visual language as every other encounter (§4/§5)
//   • puzzle boards OVERLAY the scene as a panel — never a separate card
// ============================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

const CFG = require('./config');
const state = require('./state');
const mapEngine = require('./mapEngine');

const W = 1200, H = 900;
const ASSET_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'guildwar', 'ruins');
const CHAR_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'characters');
const ENEMY_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'enemies');

// ── doorway geometry on the normalized plates (1200×900) ──
const DOORS = {
    w: { cx: 168, cy: 505 },   // left arch (player's left = west wall)
    e: { cx: 1032, cy: 505 },  // right arch
    n: { cx: 600, cy: 292 },   // back-wall arch (faces away from viewer)
    s: { cx: 600, cy: 818 },   // behind the viewer — chevrons stacked above the strip
};
// consistent actor placement: the champion always enters from the LEFT and
// holds the same spot in every room (background changes, actor does not)
const PLAYER_X = 336, PLAYER_GROUND = 802, PLAYER_H = 330;

// ── enemy sprite pool (VERIFIED single sprites — sheet files excluded) ──
// Curated by visual inspection against the plates' palette/perspective:
// pixel-art monsters read naturally in the torch-lit stone rooms.
const ENEMY_POOL = [
    'earth (1).png', 'earth (2).png', 'earth (3).png', 'earth (4).png', 'earth (5).png',
    'fire (5).png', 'fire (6).png', 'fire (7).png', 'fire (8).png', 'fire (11).png',
    'ice (1).png', 'ice (2).png', 'ice (3).png',
    'water (4).png', 'water (6).png', 'water (7).png',
    'mutated (1).png', 'mutated (2).png', 'mutated (3).png', 'mutated (4).png',
    'mutated (5).png', 'mutated (6).png', 'mutated (7).png',
    'hybrides (1).png', 'hybrides (2).png', 'hybrides (3).png', 'hybrides (4).png',
    'hybrides (5).png', 'hybrides (6).png', 'hybrides (7).png',
];
const BOSS_POOL = [
    'boss_0_N.png', 'boss_1_N.png', 'boss_2_N.png', 'boss_3_N.png', 'boss_4_N.png',
    'boss_5_N.png', 'boss_6_N.png', 'boss_7_N.png', 'boss_9_N.png', 'boss_10_N.png',
    'boss_11_N.png', 'boss_12_N.png', 'boss_13_N.png',
    'midlevelbosses (1).png', 'midlevelbosses (2).png', 'midlevelbosses (3).png',
    'midlevelbosses (4).png', 'midlevelbosses (5).png', 'midlevelbosses (6).png',
    'highlevelbosses (7).png', 'highlevelbosses (8).png', 'highlevelbosses (9).png',
    'highlevelbosses (10).png', 'highlevelbosses (11).png', 'highlevelbosses (12).png',
    'highlevelbosses (13).png',
];

// ── asset caches (plates + sprites decode once per worker lifetime) ──
const plateCache = new Map();
let plates = null;
function getPlates() {
    if (plates) return plates;
    const load = (name) => {
        const p = path.join(ASSET_DIR, name);
        if (!fs.existsSync(p)) return null;
        return loadImage(p).catch(() => null);
    };
    plates = {
        '0': load('ruins_door_0.png'),
        L: [load('ruins_door_L_a.png'), load('ruins_door_L_b.png')],
        R: load('ruins_door_R.png'),
        F: load('ruins_door_F.png'),
        LF: load('ruins_door_LF.png'),
        FR: load('ruins_door_FR.png'),
        LR: load('ruins_door_LR.png'),
        LFR: load('ruins_door_LFR.png'),
    };
    return plates;
}

// ── background variant selection from REAL exits (owner spec) ──
function plateKeyFor(exits, seedStr) {
    const has = (d) => exits.some((x) => x.dir === d && x.edge);
    const n = has('n'), e = has('e'), w = has('w');
    let key;
    if (n && e && w) key = 'LFR';
    else if (n && e) key = 'FR';
    else if (n && w) key = 'LF';
    else if (e && w) key = 'LR';
    else if (n) key = 'F';
    else if (e) key = 'R';
    else if (w) {
        // two ambient versions of the left-only plate — seeded pick
        const h = mapEngine.hashSeed(String(seedStr || ''));
        key = (h % 2 === 0) ? 'L_a' : 'L_b';
    } else key = '0';
    return key;
}

async function plateFor(exits, seedStr) {
    const P = getPlates();
    const key = plateKeyFor(exits, seedStr);
    const entry = P[key];
    const img = Array.isArray(entry) ? entry[mapEngine.hashSeed(String(seedStr || '')) % entry.length] : entry;
    return (await img) || (await P['0']);
}

// ── sprite helpers ─────────────────────────────────────────────────────────
// alpha-content bounding box: transparent padding inside a sprite PNG must
// never influence placement or scale (this is what made the actor levitate)
const bboxCache = new Map(); // file → {x,y,w,h} in natural pixels
async function contentBox(file, dir) {
    const cacheKey = dir + '/' + file;
    if (bboxCache.has(cacheKey)) return bboxCache.get(cacheKey);
    let box = null;
    try {
        const img = await loadImage(path.join(dir, file));
        const c = createCanvas(img.width, img.height);
        const ctx = c.getContext('2d', { willReadFrequently: true });
        ctx.drawImage(img, 0, 0);
        const data = ctx.getImageData(0, 0, img.width, img.height).data;
        let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
        for (let y = 0; y < img.height; y++) {
            for (let x = 0; x < img.width; x++) {
                if (data[(y * img.width + x) * 4 + 3] > 16) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }
        if (maxX >= 0) box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    } catch (e) { box = null; }
    bboxCache.set(cacheKey, box);
    return box;
}

// draw a sprite so its VISIBLE CONTENT stands exactly on the ground line
// (cx = content centre x, groundY = content bottom, ch = content height)
async function drawGroundedSprite(ctx, dirs, file, cx, groundY, ch, { shadow = true, flip = false, alpha = 1 } = {}) {
    const dirList = Array.isArray(dirs) ? dirs : [dirs];
    let img = null, foundDir = null;
    for (const dir of dirList) {
        try { img = await loadImage(path.join(dir, file)); foundDir = dir; break; } catch (e) { /* next dir */ }
    }
    if (!img) return null;
    const box = (await contentBox(file, foundDir)) || { x: 0, y: 0, w: img.width, h: img.height };
    const scale = ch / box.h;
    const dw = img.width * scale, dh = img.height * scale;
    // content anchors (natural px) → canvas px
    const drawX = cx - (box.x + box.w / 2) * scale;
    const drawY = groundY - (box.y + box.h) * scale;
    if (shadow) {
        ctx.save();
        ctx.globalAlpha = 0.42 * alpha;
        ctx.beginPath();
        ctx.ellipse(cx, groundY + 5, (box.w * scale) * 0.36, Math.max(7, ch * 0.045), 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.55)';
        ctx.fill();
        ctx.restore();
    }
    ctx.save();
    if (alpha < 1) ctx.globalAlpha = alpha;
    if (flip) {
        ctx.translate(drawX + dw / 2, drawY + dh / 2);
        ctx.scale(-1, 1);
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
        ctx.drawImage(img, drawX, drawY, dw, dh);
    }
    ctx.restore();
    return { w: box.w * scale, h: box.h * scale };
}

// ── PLAYER sprite (parent resolves the class file; worker just draws) ──
// Go-parity resolution — the SAME file the profile card and every combat
// render use: CLASS_SPRITE_SETS[classId][spriteIndex % len]. The Guild War
// event row does not carry class fields, so the parent resolves them from
// the economy (identical to buildRuinsPlayerEntity).
function resolvePlayerSpriteFile(player) {
    try {
        const pr = require('../profileCardRenderer');
        const economy = require('../economy');
        const userClass = economy.getUserClass(player.jid);
        const clsKey = String(player.classId || player.class?.id || userClass?.id || '').toUpperCase();
        const user = economy.getUser(player.jid);
        const idx = Math.max(0, Math.floor(Number(player.spriteIndex ?? user?.spriteIndex) || 0));
        const list = pr.CLASS_SPRITE_SETS[clsKey] || pr.CLASS_SPRITE_SETS.APPRENTICE;
        return list[idx % list.length] || 'apprentice1.png';
    } catch (e) {
        return 'apprentice1.png';
    }
}

// ── encounter-style HUD data (parent-side; REAL persistent pools) ──
function hudFor(player, room) {
    const out = { name: player.name || 'Explorer', level: 1, classId: 'APPRENTICE', hp: 100, maxHp: 100, energy: 50, maxEnergy: 50, state: '' };
    try {
        const economy = require('../economy');
        const progression = require('../progression');
        const userClass = economy.getUserClass(player.jid);
        out.classId = String(userClass?.id || 'APPRENTICE').toUpperCase();
        const baseStats = progression.getBaseStats(player.jid, out.classId);
        out.maxHp = baseStats?.hp || 100;
        out.hp = Math.max(0, economy.getPersistentHP(player.jid, out.maxHp) ?? out.maxHp);
        out.maxEnergy = baseStats?.maxEnergy || 50;
        out.energy = Math.max(0, economy.getPersistentEnergy(player.jid, out.maxEnergy) ?? out.maxEnergy);
        out.level = progression.getLevel(player.jid) || 1;
        const user = economy.getUser(player.jid);
        out.name = user?.nickname || user?.profile?.nickname || player.name || 'Explorer';
    } catch (e) { /* HUD degrades to defaults, never blocks the scene */ }
    // turn/state indicator — whose beat it is right now (§5)
    const cleared = room.state === 'CLEARED';
    if (cleared) out.state = 'CHAMBER SECURED';
    else if (room.type === 'puzzle') out.state = 'YOUR MOVE — ANSWER';
    else if (['combat', 'coop', 'core'].includes(room.type)) out.state = 'ENEMIES BAR THE WAY';
    else if (room.type === 'secret') out.state = 'SOMETHING STIRS';
    else out.state = 'EXPLORING';
    return out;
}

// ── room-type content plan (parent-side; payload is the source of truth) ──
// Places the seeded gameplay content INTO the scene: enemies from the room
// payload count, guardians for core/boss rooms, and per-type props. Layout
// rules: content lives in the enemy zone (right/centre floor band), never
// within 90px of a door chevron, the player, or the compass decal.
function planFor(eventDoc, player, room, exits) {
    const plan = { hud: hudFor(player, room), spriteFile: resolvePlayerSpriteFile(player), enemies: [], props: [] };
    const seedStr = `${eventDoc.seed}:${room.key}`;
    const rng = mapEngine.makeRng(`${seedStr}:plan`);
    const payloadGet = (p, k) => (p && typeof p.get === 'function') ? p.get(k) : (p || {})[k];
    const P = room.payload || {};
    const cleared = room.state === 'CLEARED';

    // enemy zone anchors (ground y, depth-ordered): far → near
    const ZONE = [
        { x: 830, y: 640 }, { x: 985, y: 690 }, { x: 735, y: 690 },
        { x: 900, y: 748 }, { x: 1040, y: 745 },
    ];

    if (!cleared) {
        if (['combat', 'coop'].includes(room.type)) {
            const raw = payloadGet(P, 'enemies');
            const n = Math.max(1, Math.min(4, Array.isArray(raw) ? raw.length : 1));
            const lvl = (Array.isArray(raw) && raw[0]?.level) || 10;
            for (let i = 0; i < n; i++) {
                const spot = ZONE[i];
                const file = ENEMY_POOL[rng.int(0, ENEMY_POOL.length - 1)];
                // farther rows slightly smaller (perspective) — but always a
                // credible physical threat next to the champion
                const h = Math.round(195 + (spot.y - 640) * 0.75 + (lvl >= 15 ? 22 : 0));
                plan.enemies.push({ file, x: spot.x + rng.int(-24, 24), y: spot.y, h, flip: spot.x > 870 });
            }
        } else if (room.type === 'core') {
            plan.enemies.push({ file: BOSS_POOL[rng.int(0, BOSS_POOL.length - 1)], x: 860, y: 730, h: 330, flip: false, boss: true });
        } else if (room.type === 'secret' && payloadGet(P, 'boss')) {
            plan.enemies.push({ file: BOSS_POOL[rng.int(0, BOSS_POOL.length - 1)], x: 860, y: 720, h: 290, flip: false, boss: true });
        }
    }

    // ambient props (subtle, wall-hugging) — 0-3 by seed, never blocking
    const PROPS = ['crate', 'urn', 'bones', 'rocks', 'rubble', 'moss'];
    const occupied = (x, y) =>
        plan.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 120) ||
        Math.hypot(PLAYER_X - x, PLAYER_GROUND - y) < 110 ||
        Math.hypot(880 - x, 762 - y) < 130; // compass decal
    const propSpots = [
        { x: 92, y: 652 }, { x: 1104, y: 648 }, { x: 244, y: 632 },
        { x: 952, y: 628 }, { x: 62, y: 742 }, { x: 1136, y: 730 },
    ];
    for (const spot of rng.shuffle(propSpots)) {
        if (plan.props.length >= rng.int(1, 3)) break;
        if (occupied(spot.x, spot.y)) continue;
        // keep door approaches clear
        if (Math.hypot(spot.x - DOORS.w.cx, spot.y - DOORS.w.cy) < 130) continue;
        if (Math.hypot(spot.x - DOORS.e.cx, spot.y - DOORS.e.cy) < 130) continue;
        plan.props.push({ kind: rng.pick(PROPS), x: spot.x + rng.int(-14, 14), y: spot.y, s: 0.8 + rng.next() * 0.6 });
    }
    return plan;
}

// ── per-type ambience (tint + floor glow, nothing banner-like) ──
const TYPE_TINT = {
    empty: null,
    combat: ['rgba(140,26,26,0.15)', 'rgba(255,90,40,0.10)'],
    coop: ['rgba(160,80,20,0.14)', 'rgba(255,140,40,0.10)'],
    core: ['rgba(74,42,138,0.20)', 'rgba(160,90,255,0.16)'],
    puzzle: ['rgba(30,70,120,0.16)', 'rgba(90,170,255,0.12)'],
    discovery: ['rgba(120,90,20,0.10)', 'rgba(255,200,80,0.12)'],
    reward: ['rgba(150,110,20,0.13)', 'rgba(255,215,90,0.16)'],
    hazard: ['rgba(60,110,30,0.15)', 'rgba(140,255,80,0.10)'],
    lore: ['rgba(40,90,100,0.13)', 'rgba(120,220,240,0.10)'],
    secret: ['rgba(120,30,110,0.15)', 'rgba(240,110,230,0.12)'],
    anomaly: ['rgba(30,40,130,0.18)', 'rgba(90,120,255,0.15)'],
    landmark: ['rgba(90,90,110,0.08)', 'rgba(200,210,255,0.08)'],
};

function drawTint(ctx, room) {
    const t = TYPE_TINT[room.type];
    if (!t) return;
    ctx.fillStyle = t[0];
    ctx.fillRect(0, 0, W, H);
    // pooled glow on the floor where the "point of interest" sits
    const g = ctx.createRadialGradient(820, 660, 10, 820, 660, 260);
    g.addColorStop(0, t[1]);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
}

function drawClearedWash(ctx) {
    ctx.fillStyle = 'rgba(90,140,80,0.12)';
    ctx.fillRect(0, 0, W, H);
}

// ── exit chevrons (§9): triple fading arrows INSIDE the world ──
function chevron(ctx, x, y, dx, dy, size, alpha, color) {
    const px = -dy, py = dx; // perpendicular
    ctx.beginPath();
    ctx.moveTo(x + dx * size, y + dy * size);                       // apex
    ctx.lineTo(x - dx * size * 0.4 + px * size, y - dy * size * 0.4 + py * size);
    ctx.lineTo(x - dx * size * 0.1 + px * size * 0.55, y - dy * size * 0.1 + py * size * 0.55);
    ctx.lineTo(x - dx * size * 0.1 - px * size * 0.55, y - dy * size * 0.1 - py * size * 0.55);
    ctx.lineTo(x - dx * size * 0.4 - px * size, y - dy * size * 0.4 - py * size);
    ctx.closePath();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
}

function drawExitArrows(ctx, exits) {
    const GOLD = '#FFD24A';
    const EDGE = 'rgba(40,24,4,0.85)';
    for (const ex of exits) {
        if (!ex.edge) continue;
        const d = DOORS[ex.dir];
        if (!d) continue;
        const [ax, ay] = ex.dir === 'n' ? [0, -1] : ex.dir === 's' ? [0, 1] : ex.dir === 'e' ? [1, 0] : [-1, 0];
        for (let i = 0; i < 3; i++) {
            // S chevrons stack UPWARD so they never drown under the bottom strip
            const off = ex.dir === 's' ? i * 24 : i * 26;
            const x = d.cx + ax * off;
            const y = d.cy + ay * off;
            chevron(ctx, x + 2, y + 2, ax, ay, 22 - i * 3, 0.5 * (1 - i * 0.26), EDGE);
            chevron(ctx, x, y, ax, ay, 22 - i * 3, 0.95 * (1 - i * 0.26), GOLD);
        }
    }
}

// ── floor compass (§10): adjacency-generated, PERSPECTIVE floor decal ──
// An ellipse etched into the stone with direction markers squashed onto it —
// reads as part of the floor instead of a floating UI disc.
function drawCompassHub(ctx, exits) {
    const cx = 880, cy = 762, rx = 96, ry = 38;
    const open = new Set(exits.filter((e) => e.edge).map((e) => e.dir));
    ctx.save();
    // etched disc (perspective ellipse)
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(16,14,10,0.34)'; ctx.fill();
    ctx.strokeStyle = 'rgba(220,200,150,0.30)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.ellipse(cx, cy, rx * 0.55, ry * 0.55, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(220,200,150,0.18)'; ctx.lineWidth = 1; ctx.stroke();

    const dirs = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
    for (const [d, [dx, dy]] of Object.entries(dirs)) {
        const lit = open.has(d);
        // perspective: vertical component squashes onto the ellipse
        const tipX = cx + dx * (rx + 16), tipY = cy + dy * (ry + 12);
        const baseX = cx + dx * rx * 0.5, baseY = cy + dy * ry * 0.5;
        ctx.beginPath();
        ctx.moveTo(baseX, baseY);
        ctx.lineTo(tipX - dx * 13, tipY - dy * 9);
        ctx.strokeStyle = lit ? 'rgba(255,210,74,0.95)' : 'rgba(120,110,90,0.35)';
        ctx.lineWidth = lit ? 5 : 3;
        ctx.stroke();
        const hx = -dy, hy = dx;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - dx * 15 + hx * 8, tipY - dy * 11 + hy * 8);
        ctx.lineTo(tipX - dx * 15 - hx * 8, tipY - dy * 11 - hy * 8);
        ctx.closePath();
        ctx.fillStyle = lit ? '#FFD24A' : 'rgba(120,110,90,0.35)';
        ctx.fill();
    }
    // YOU disc at hub centre
    ctx.beginPath(); ctx.ellipse(cx, cy, 15, 12, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(139,26,43,0.95)'; ctx.fill();
    ctx.strokeStyle = '#F3ECD9'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#F3ECD9'; ctx.font = 'bold 10px "Cinzel", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('YOU', cx, cy + 1);
    ctx.restore();
    ctx.textBaseline = 'alphabetic';
}

// ── ambient props (vector, palette-matched, subtle) ────────────────────────
// QA pass 2026-10-04: the first drafts rendered too pale and too tall — they
// read as shields nailed to the wall. Now: dark floor-hugging silhouettes
// (stone/terracotta tones sampled from the plates) with a soft contact
// shadow, drawn low so they always sit ON the floor plane.
const STONE = ['#453f33', '#3a3529', '#514a3b'];
const STONE_DARK = 'rgba(22,20,15,0.6)';
function drawProp(ctx, kind, x, groundY, s) {
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(x, groundY);
    ctx.scale(s, s);
    // contact shadow
    ctx.beginPath(); ctx.ellipse(0, 3, 24, 6, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.38)'; ctx.fill();
    if (kind === 'crate') {
        ctx.fillStyle = '#4f3f28';
        ctx.fillRect(-19, -32, 38, 32);
        ctx.strokeStyle = '#332818'; ctx.lineWidth = 3;
        ctx.strokeRect(-19, -32, 38, 32);
        ctx.beginPath(); ctx.moveTo(-19, -32); ctx.lineTo(19, 0); ctx.moveTo(19, -32); ctx.lineTo(-19, 0); ctx.stroke();
    } else if (kind === 'urn') {
        // dark terracotta amphora silhouette
        ctx.fillStyle = '#4e3b2c';
        ctx.beginPath();
        ctx.moveTo(-4, -34);                      // neck top L
        ctx.quadraticCurveTo(-15, -26, -12, -10); // swell L
        ctx.quadraticCurveTo(-10, -2, 0, -1);     // foot L
        ctx.quadraticCurveTo(10, -2, 12, -10);    // foot R
        ctx.quadraticCurveTo(15, -26, 4, -34);    // swell R
        ctx.closePath(); ctx.fill();
        ctx.strokeStyle = 'rgba(24,18,12,0.8)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(-6, -34); ctx.lineTo(6, -34); ctx.stroke();
    } else if (kind === 'bones') {
        ctx.strokeStyle = 'rgba(190,180,150,0.85)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        ctx.beginPath(); ctx.moveTo(-14, -3); ctx.lineTo(8, -6); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-9, -6); ctx.lineTo(11, -2); ctx.stroke();
        ctx.beginPath(); ctx.arc(15, -7, 5, 0, Math.PI * 2); ctx.fillStyle = 'rgba(190,180,150,0.85)'; ctx.fill();
    } else if (kind === 'rocks') {
        ctx.fillStyle = STONE[0];
        ctx.beginPath(); ctx.ellipse(-8, -5, 12, 7, 0.15, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = STONE[2];
        ctx.beginPath(); ctx.ellipse(8, -4, 8, 5, -0.2, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = STONE_DARK;
        ctx.beginPath(); ctx.ellipse(0, -1, 17, 3.5, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'rubble') {
        ctx.fillStyle = STONE[1];
        for (const [rx, ry, rr] of [[-13, -3, 5], [-2, -6, 7], [9, -2, 4], [15, -5, 3]]) {
            ctx.beginPath(); ctx.arc(rx, ry, rr, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = STONE_DARK;
        ctx.beginPath(); ctx.ellipse(0, -1, 18, 3, 0, 0, Math.PI * 2); ctx.fill();
    } else if (kind === 'moss') {
        ctx.fillStyle = 'rgba(80,100,48,0.5)';
        ctx.beginPath(); ctx.ellipse(0, -2, 20, 5, 0, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(-11, -4, 8, 3.5, 0.4, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(10, -5, 7, 3.5, -0.3, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
}

// ── room-type CONTENT (the gameplay payload made visible — §6) ─────────────
function glowSpot(ctx, x, y, r, color) {
    const g = ctx.createRadialGradient(x, y, 2, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.ellipse(x, y, r, r * 0.6, 0, 0, Math.PI * 2); ctx.fill();
}

async function drawRoomContent(ctx, room, plan) {
    const rng = mapEngine.makeRng(`content:${room.key}:${room.state}`);
    const t = room.type;
    // content anchor: the point-of-interest zone (right-centre floor)
    const ax = 820, ay = 700;
    if (room.state === 'CLEARED') {
        // cleared rooms keep a faint scar of what was here (never empty-identical)
        if (t === 'combat' || t === 'coop' || t === 'core' || (t === 'secret')) glowSpot(ctx, ax, ay - 20, 70, 'rgba(120,140,90,0.10)');
        return;
    }
    switch (t) {
        case 'discovery': {
            // buried cache: disturbed earth mound + broken rim + glint
            glowSpot(ctx, ax, ay - 10, 90, 'rgba(255,200,80,0.16)');
            ctx.fillStyle = '#57492f';
            ctx.beginPath(); ctx.ellipse(ax, ay, 84, 26, 0, Math.PI, 0); ctx.fill();
            ctx.fillStyle = 'rgba(30,24,14,0.5)';
            ctx.beginPath(); ctx.ellipse(ax, ay, 46, 14, 0, Math.PI, 0); ctx.fill();
            ctx.fillStyle = '#8a7248';
            ctx.beginPath(); ctx.ellipse(ax - 34, ay - 8, 16, 8, 0.3, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ffd24a';
            ctx.beginPath(); ctx.arc(ax + 22, ay - 16, 4, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'reward': {
            // old-world vault: stone plinth + sealed reliquary chest
            glowSpot(ctx, ax, ay - 30, 100, 'rgba(255,215,90,0.20)');
            ctx.fillStyle = STONE[1];
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ax - 60, ay - 26, 120, 30, 5) : ctx.rect(ax - 60, ay - 26, 120, 30); ctx.fill();
            ctx.fillStyle = '#5b452a';
            ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ax - 44, ay - 74, 88, 50, 6) : ctx.rect(ax - 44, ay - 74, 88, 50); ctx.fill();
            ctx.fillStyle = '#6f5636';
            ctx.beginPath(); ctx.ellipse(ax, ay - 74, 44, 16, 0, Math.PI, 0); ctx.fill();
            ctx.strokeStyle = '#c9a648'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(ax - 44, ay - 52); ctx.lineTo(ax + 44, ay - 52); ctx.stroke();
            ctx.fillStyle = '#c9a648';
            ctx.beginPath(); ctx.arc(ax, ay - 46, 6, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'hazard': {
            // trapped passage: spike row + acid-green sheen on the floor
            glowSpot(ctx, ax, ay - 10, 90, 'rgba(140,255,80,0.12)');
            ctx.fillStyle = '#7d7a6a';
            for (let i = 0; i < 5; i++) {
                const sx = ax - 80 + i * 40;
                ctx.beginPath();
                ctx.moveTo(sx - 12, ay); ctx.lineTo(sx, ay - 34 - (i % 2) * 8); ctx.lineTo(sx + 12, ay);
                ctx.closePath(); ctx.fill();
            }
            ctx.fillStyle = 'rgba(140,255,80,0.10)';
            ctx.beginPath(); ctx.ellipse(ax, ay - 6, 110, 22, 0, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'lore': {
            // inscribed hall: warm glow band along the back wall + motes
            glowSpot(ctx, ax, 360, 150, 'rgba(120,220,240,0.14)');
            ctx.fillStyle = 'rgba(255,220,140,0.55)';
            ctx.font = '13px "Cinzel", sans-serif';
            for (let i = 0; i < 7; i++) {
                const mx = ax - 90 + i * 30, my = 400 + ((i * 37) % 40);
                ctx.globalAlpha = 0.25 + (i % 3) * 0.15;
                ctx.beginPath(); ctx.arc(mx, my, 2.2, 0, Math.PI * 2); ctx.fill();
            }
            ctx.globalAlpha = 1;
            break;
        }
        case 'anomaly': {
            // world-thin hall: a shimmering rift standing on the floor
            glowSpot(ctx, ax, ay - 60, 120, 'rgba(90,120,255,0.20)');
            const g = ctx.createLinearGradient(ax, ay - 190, ax, ay);
            g.addColorStop(0, 'rgba(150,170,255,0.75)');
            g.addColorStop(0.5, 'rgba(90,110,230,0.45)');
            g.addColorStop(1, 'rgba(40,50,140,0.12)');
            ctx.fillStyle = g;
            ctx.beginPath(); ctx.ellipse(ax, ay - 95, 34, 95, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(190,200,255,0.5)'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.ellipse(ax, ay - 95, 34, 95, 0, 0, Math.PI * 2); ctx.stroke();
            break;
        }
        case 'landmark': {
            // the landmark itself: tall etched obelisk
            const name = (typeof room.payload?.get === 'function' ? room.payload.get('landmarkName') : room.payload?.landmarkName) || '';
            glowSpot(ctx, ax, ay - 90, 110, 'rgba(200,210,255,0.10)');
            ctx.fillStyle = '#3f3b33';
            ctx.beginPath();
            ctx.moveTo(ax - 38, ay); ctx.lineTo(ax - 22, ay - 210); ctx.lineTo(ax + 22, ay - 210); ctx.lineTo(ax + 38, ay);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = 'rgba(220,200,150,0.35)'; ctx.lineWidth = 2;
            for (let i = 1; i <= 4; i++) {
                const ly = ay - i * 44;
                ctx.beginPath(); ctx.moveTo(ax - 28 + i, ly); ctx.lineTo(ax + 28 - i, ly); ctx.stroke();
            }
            if (name) {
                ctx.fillStyle = 'rgba(243,236,217,0.85)';
                ctx.font = 'bold 15px "Cinzel", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(name).slice(0, 22), ax, ay - 226);
                ctx.textAlign = 'left';
            }
            break;
        }
        case 'secret': {
            if (!plan.enemies.length) {
                // hidden chamber: radiant pedestal with the prize
                glowSpot(ctx, ax, ay - 40, 110, 'rgba(240,110,230,0.18)');
                ctx.fillStyle = STONE[1];
                ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ax - 34, ay - 24, 68, 26, 4) : ctx.rect(ax - 34, ay - 24, 68, 26); ctx.fill();
                ctx.fillStyle = '#ffd24a';
                ctx.beginPath(); ctx.arc(ax, ay - 44, 9, 0, Math.PI * 2); ctx.fill();
                ctx.strokeStyle = 'rgba(255,210,74,0.65)'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(ax, ay - 44, 18, 0, Math.PI * 2); ctx.stroke();
            }
            break;
        }
        case 'puzzle': {
            // glyph stones flanking the mechanism (the board overlays centre)
            ctx.fillStyle = STONE[0];
            for (const gx of [ax - 190, ax + 190]) {
                ctx.beginPath(); ctx.roundRect ? ctx.roundRect(gx - 16, ay - 78, 32, 62, 8) : ctx.rect(gx - 16, ay - 78, 32, 62); ctx.fill();
                ctx.fillStyle = 'rgba(90,170,255,0.6)';
                ctx.font = '20px "Cinzel", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('ᚠ', gx, ay - 38);
                ctx.fillStyle = STONE[0];
                ctx.textAlign = 'left';
            }
            glowSpot(ctx, ax, ay - 40, 90, 'rgba(90,170,255,0.12)');
            break;
        }
        default: break; // combat/coop/core enemies arrive via plan.enemies
    }
}

// ── PLAYER HUD (§4/§5): the encounter system's bottom-left presentation ────
function drawHud(ctx, hud, room) {
    if (!hud) return;
    const px = 24, py = H - 158, pw = 400, ph = 100;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(14,13,10,0.82)';
    roundRect(ctx, px, py, pw, ph, 12); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,210,74,0.55)'; ctx.lineWidth = 1.5;
    roundRect(ctx, px, py, pw, ph, 12); ctx.stroke();

    // name + level/class line
    ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#F3ECD9';
    ctx.font = 'bold 19px "Cinzel", sans-serif';
    ctx.fillText(String(hud.name).slice(0, 18), px + 16, py + 26);
    ctx.font = '13px "Cinzel", sans-serif';
    ctx.fillStyle = 'rgba(220,200,150,0.8)';
    ctx.fillText(`Lv ${hud.level} · ${String(hud.classId).slice(0, 12)}`, px + 16 + ctx.measureText(String(hud.name).slice(0, 18)).width + 26, py + 25);

    // state chip (turn indicator, top-right of the panel)
    const stateText = hud.state || 'EXPLORING';
    ctx.font = 'bold 12px "Cinzel", sans-serif';
    const stw = ctx.measureText(stateText).width + 20;
    ctx.fillStyle = 'rgba(139,26,43,0.85)';
    roundRect(ctx, px + pw - stw - 12, py + 10, stw, 20, 9); ctx.fill();
    ctx.fillStyle = '#F3ECD9';
    ctx.textAlign = 'center';
    ctx.fillText(stateText, px + pw - stw / 2 - 12, py + 24);
    ctx.textAlign = 'left';

    // HP bar
    const barX = px + 16, barW = pw - 32;
    const hpPct = Math.max(0, Math.min(1, (hud.hp || 0) / (hud.maxHp || 1)));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, barX, py + 40, barW, 18, 6); ctx.fill();
    const hpColor = hpPct > 0.5 ? '#6fae4e' : hpPct > 0.25 ? '#d29a3a' : '#b23b2e';
    ctx.fillStyle = hpColor;
    if (hpPct > 0) { roundRect(ctx, barX, py + 40, Math.max(8, barW * hpPct), 18, 6); ctx.fill(); }
    ctx.strokeStyle = 'rgba(220,205,160,0.35)'; ctx.lineWidth = 1;
    roundRect(ctx, barX, py + 40, barW, 18, 6); ctx.stroke();
    ctx.fillStyle = '#F3ECD9'; ctx.font = 'bold 12px "Cinzel", sans-serif';
    ctx.fillText(`HP ${Math.round(hud.hp)}/${hud.maxHp}`, barX + 8, py + 53);

    // Energy bar
    const enPct = Math.max(0, Math.min(1, (hud.energy || 0) / (hud.maxEnergy || 1)));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, barX, py + 66, barW, 14, 5); ctx.fill();
    ctx.fillStyle = '#3f7fbf';
    if (enPct > 0) { roundRect(ctx, barX, py + 66, Math.max(7, barW * enPct), 14, 5); ctx.fill(); }
    ctx.strokeStyle = 'rgba(220,205,160,0.30)';
    roundRect(ctx, barX, py + 66, barW, 14, 5); ctx.stroke();
    ctx.fillStyle = 'rgba(243,236,217,0.92)'; ctx.font = 'bold 11px "Cinzel", sans-serif';
    ctx.fillText(`EN ${Math.round(hud.energy)}/${hud.maxEnergy}`, barX + 8, py + 77);
    ctx.restore();
}

// ── bottom UI strip: room label + canonical move grammar ──
const TYPE_LABEL = {
    empty: 'QUIET HALL', combat: 'ENEMY PATROL', puzzle: 'SEALED MECHANISM',
    discovery: 'BURIED CACHE', reward: 'OLD-WORLD VAULT', hazard: 'TRAPPED PASSAGE',
    lore: 'INSCRIBED HALL', coop: 'GUARDIAN PACK', secret: 'HIDDEN CHAMBER',
    anomaly: 'WORLD-THIN HALL', landmark: 'LANDMARK', core: 'THE WORLD CORE',
};
function drawBottomStrip(ctx, room, prefix, labelOverride) {
    const label = (labelOverride || TYPE_LABEL[room.type] || 'CHAMBER').toUpperCase();
    ctx.fillStyle = 'rgba(12,11,8,0.78)';
    ctx.fillRect(0, H - 46, W, 46);
    ctx.fillStyle = 'rgba(255,210,74,0.85)';
    ctx.fillRect(0, H - 46, W, 2);
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
    ctx.font = 'bold 19px "Cinzel", sans-serif';
    ctx.fillStyle = room.state === 'CLEARED' ? '#9FBE8E' : '#F3ECD9';
    ctx.fillText(label + (room.state === 'CLEARED' ? ' — CLEARED' : ''), 28, H - 22);
    ctx.textAlign = 'right';
    ctx.font = '16px "Cinzel", sans-serif';
    ctx.fillStyle = 'rgba(220,200,150,0.75)';
    const p = prefix || '.';
    ctx.fillText(`${p} move forward · left · back · right`, W - 28, H - 22);
    ctx.textBaseline = 'alphabetic';
}

// ── puzzle overlay: the board rides ON the scene (owner directive) ──
async function drawPuzzleOverlay(ctx, boardBuf) {
    if (!boardBuf) return;
    // tolerate every IPC shape a Buffer can arrive in
    let buf = boardBuf;
    if (!Buffer.isBuffer(buf) && buf && buf.type === 'Buffer' && Array.isArray(buf.data)) buf = Buffer.from(buf.data);
    if (!Buffer.isBuffer(buf)) return;
    let img = null;
    try { img = await loadImage(buf); } catch (e) { return; }
    // panel sits right-of-centre so the champion (left) stays in view — the
    // puzzle is IN the room with you, not a wall between you and the scene
    const pw = 560, ph = 360, px = 470, py = 452;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 18;
    ctx.fillStyle = 'rgba(16,14,10,0.88)';
    roundRect(ctx, px, py, pw, ph, 14); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,210,74,0.7)'; ctx.lineWidth = 2;
    roundRect(ctx, px, py, pw, ph, 14); ctx.stroke();
    const scale = Math.min((pw - 20) / img.width, (ph - 20) / img.height);
    const dw = img.width * scale, dh = img.height * scale;
    ctx.drawImage(img, px + (pw - dw) / 2, py + (ph - dh) / 2, dw, dh);
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

// ── exits from the live doc (adjacency is the ONLY source — no hardcode) ──
function exitsFor(eventDoc, player) {
    const topo = state.topologyOf(eventDoc);
    const DIRS = ['n', 'e', 's', 'w'];
    const discovered = new Set(player.discovered || []);
    return DIRS.map((dir) => {
        const dest = mapEngine.step(topo, player.roomId, dir);
        if (!dest) return { dir, edge: false };
        const nr = (eventDoc.rooms || []).find((r) => r.key === dest);
        return { dir, edge: true, known: discovered.has(dest), kind: nr ? nr.type : null, cleared: nr ? nr.state === 'CLEARED' : false, key: dest };
    });
}

// ── main render (in worker; plan is computed by the parent) ──
// opts: { exits?, prefix, puzzleBoard?(Buffer), labelOverride?, style?, plan? }
async function _renderInProcess(eventDoc, player, room, opts = {}) {
    const exits = opts.exits || exitsFor(eventDoc, player);
    const bg = await plateFor(exits, `${eventDoc.seed}:${room.key}`);
    const plan = opts.plan || planFor(eventDoc, player, room, exits);
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    // 1) the world
    ctx.drawImage(bg, 0, 0, W, H);
    drawTint(ctx, room);
    if (room.state === 'CLEARED') drawClearedWash(ctx);

    // 2) ambient props (under everything alive)
    for (const prop of plan.props || []) drawProp(ctx, prop.kind, prop.x, prop.y, prop.s);

    // 3) room-type content (payload presentation — enemies drawn below)
    await drawRoomContent(ctx, room, plan);

    // 4) the SEEDED enemy pack (combat/coop/core/boss) — depth-ordered so
    // nearer packs overlap farther ones naturally
    const CHAR_DIRS = [path.join(CHAR_DIR, 'clean'), CHAR_DIR];
    const enemies = [...(plan.enemies || [])].sort((a, b) => a.y - b.y);
    for (const e of enemies) {
        await drawGroundedSprite(ctx, ENEMY_DIR, e.file, e.x, e.y, e.h, { flip: !!e.flip, shadow: true });
    }

    // 5) the champion — ASSIGNED sprite, content-grounded, constant spot
    await drawGroundedSprite(ctx, CHAR_DIRS, plan.spriteFile, PLAYER_X, PLAYER_GROUND, PLAYER_H, { shadow: true });

    // 6) compass decal on the open floor
    drawCompassHub(ctx, exits);

    // 7) exit chevrons at the arches (yellow)
    drawExitArrows(ctx, exits);

    // 8) game chrome: HUD (bottom-left) + strip + puzzle overlay
    drawHud(ctx, plan.hud, room);
    const P = room.payload || {};
    const get = (k) => (typeof P.get === 'function' ? P.get(k) : P[k]);
    drawBottomStrip(ctx, room, opts.prefix, opts.labelOverride
        || (room.type === 'landmark' ? get('landmarkName') : null));
    if (opts.puzzleBoard) await drawPuzzleOverlay(ctx, opts.puzzleBoard);

    return c.toBuffer('image/png');
}

// ── parent entry: resolve the plan (economy/class reads stay OUT of the
// worker), then render via the shared child pool (canvas work must never
// stall the bot's event loop at war scale) ──
const { fork } = require('child_process');
const _pool = { children: [], queue: [], inflight: 0, max: 2 };
let _seq = 0;

function _spawnChild() {
    // ⚔️ QA FIX (§8): default fork() IPC serialization is JSON — Buffers (the
    // puzzle board) arrive as plain {type:'Buffer'} objects and loadImage
    // silently failed, so LIVE players never saw the puzzle overlay. 'advanced'
    // (structured clone) preserves Buffers across the IPC boundary.
    const child = fork(path.join(__dirname, 'renderWorker.js'), [], { stdio: 'ignore', serialization: 'advanced' });
    child.on('exit', () => {
        const i = _pool.children.indexOf(child);
        if (i !== -1) _pool.children.splice(i, 1);
    });
    _pool.children.push(child);
    return child;
}

function _renderViaChild(doc, player, room, opts) {
    return new Promise((resolve, reject) => {
        const task = () => {
            const child = _pool.children.length ? _pool.children[0] : _spawnChild();
            const id = ++_seq;
            const timeout = setTimeout(() => { cleanup(); reject(new Error('room render timeout (12s)')); }, 12000);
            const onMsg = (m) => {
                if (!m || m.id !== id || m.kind !== 'room') return;
                cleanup();
                if (m.error) reject(new Error(m.error));
                else resolve(Buffer.from(m.png, 'base64'));
            };
            const cleanup = () => {
                clearTimeout(timeout);
                child.off('message', onMsg);
                _pool.inflight--;
                const next = _pool.queue.shift();
                if (next) { _pool.inflight++; next(); }
            };
            child.on('message', onMsg);
            child.send({ type: 'room', id, doc, player, room, opts });
        };
        if (_pool.inflight >= _pool.max) _pool.queue.push(task);
        else { _pool.inflight++; task(); }
    });
}

async function renderRoomScene(eventDoc, player, room, opts = {}) {
    try {
        const plain = (x) => (x && typeof x.toObject === 'function') ? x.toObject({ depopulate: true }) : x;
        const roomPlain = plain(room) || room;
        const exits = exitsFor(eventDoc, player);
        // the plan (HUD data + sprite file + content placement) is computed
        // PARENT-side — the worker stays free of economy/progression requires
        const plan = opts.plan || planFor(eventDoc, player, roomPlain, exits);
        const childOpts = { ...opts, exits, plan };
        return await _renderViaChild(plain(eventDoc), plain(player), roomPlain, childOpts);
    } catch (e) {
        // fallback: block briefly rather than fail the player's room
        return _renderInProcess(eventDoc, player, room, opts);
    }
}

module.exports = {
    renderRoomScene, _renderInProcess, exitsFor, plateKeyFor,
    DOORS, PLAYER_X, PLAYER_GROUND, TYPE_LABEL,
    planFor, hudFor, resolvePlayerSpriteFile, ENEMY_POOL, BOSS_POOL,
};
