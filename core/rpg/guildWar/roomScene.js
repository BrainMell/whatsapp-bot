// ============================================
// 🏛️ RUINS ROOM SCENE RENDERER — presentation overhaul 2026-10-04
// Owner spec (MD §2/§5-§13): the room image is the WORLD, not a profile
// card. Rendered fully in Node (node-canvas) from the owner's own Ruins
// plates — the Go microservice is NOT involved, so nothing here depends
// on the Box-2 deploy path or the Bot_genaration divergence.
//
//   • background = the door-variant plate that matches the room's REAL
//     exits (N/E/W arches; S faces the player — indicator only, §8)
//   • yellow chevrons at every open arch, none where there is no path (§9)
//   • a floor compass hub generated from adjacency — not hardcoded (§10)
//   • the player's ASSIGNED sprite (Go-parity resolution: clean/ first,
//     list[spriteIndex % len], APPRENTICE fallback) at a CONSISTENT
//     position in every room (§7/§12) — no generic stand-in (§5/§6 die)
//   • per-type ambience so "I entered a different kind of place" (§13)
//   • puzzle boards OVERLAY the scene as a translucent panel — never a
//     separate parchment card (owner: "puzzle cards overlay the encounter")
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

// ── doorway geometry on the normalized plates (1200×900) ──
const DOORS = {
    w: { cx: 168, cy: 505 },   // left arch (player's left = west wall)
    e: { cx: 1032, cy: 505 },  // right arch
    n: { cx: 600, cy: 292 },   // back-wall arch (faces away from viewer)
    s: { cx: 600, cy: 838 },   // behind the viewer — chevrons at frame bottom
};
// consistent actor placement (§12): same spot in EVERY room
const PLAYER_X = 442, PLAYER_GROUND = 818, PLAYER_H = 360;

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

// ── background variant selection from REAL exits (owner spec §8) ──
// exits: array of {dir} where dir ∈ n|e|s|w (adjacency-derived). S never
// draws an arch (it faces the player) — it only earns a bottom indicator.
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

// ── player sprite: Go-parity resolution (profileCardRenderer's map) ──
const spriteCache = new Map();
async function spriteFor(player) {
    const pr = require('../profileCardRenderer');
    const clsKey = String(player.classId || player.class?.id || '').toUpperCase();
    const idx = Math.max(0, Math.floor(Number(player.spriteIndex) || 0));
    const list = pr.CLASS_SPRITE_SETS[clsKey] || pr.CLASS_SPRITE_SETS.APPRENTICE;
    const file = list[idx % list.length];
    const cacheKey = file;
    if (spriteCache.has(cacheKey)) return spriteCache.get(cacheKey);
    const tryLoad = async (dir, name) => {
        try { return await loadImage(path.join(dir, name)); } catch (e) { return null; }
    };
    let img = await tryLoad(path.join(CHAR_DIR, 'clean'), file);
    if (!img) img = await tryLoad(CHAR_DIR, file);
    if (!img && file !== list[0]) {
        img = (await tryLoad(path.join(CHAR_DIR, 'clean'), list[0])) || (await tryLoad(CHAR_DIR, list[0]));
    }
    if (!img) img = (await tryLoad(path.join(CHAR_DIR, 'clean'), 'apprentice1.png'))
        || (await tryLoad(CHAR_DIR, 'apprentice1.png')) || null;
    spriteCache.set(cacheKey, img);
    return img;
}

// ── per-type ambience (§13): tint + floor glow, nothing banner-like ──
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
    const g = ctx.createRadialGradient(720, 660, 10, 720, 660, 240);
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
    // chevron pointing along (dx,dy), apex at (x,y)
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
            const off = i * 26;
            const x = d.cx + ax * off;
            const y = d.cy + ay * off;
            // dark under-stroke for readability on stone, then gold fill
            chevron(ctx, x + 2, y + 2, ax, ay, 22 - i * 3, 0.5 * (1 - i * 0.26), EDGE);
            chevron(ctx, x, y, ax, ay, 22 - i * 3, 0.95 * (1 - i * 0.26), GOLD);
        }
    }
}

// ── floor compass hub (§10): adjacency-generated, part of the room ──
function drawCompassHub(ctx, exits) {
    const cx = 720, cy = 678, r = 64;
    const open = new Set(exits.filter((e) => e.edge).map((e) => e.dir));
    // etched stone disc
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(20,18,12,0.38)'; ctx.fill();
    ctx.strokeStyle = 'rgba(220,200,150,0.25)'; ctx.lineWidth = 2; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, cy, r * 0.55, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(220,200,150,0.15)'; ctx.lineWidth = 1; ctx.stroke();

    const dirs = { n: [0, -1], e: [1, 0], s: [0, 1], w: [-1, 0] };
    for (const [d, [dx, dy]] of Object.entries(dirs)) {
        const lit = open.has(d);
        const tipX = cx + dx * (r + 20), tipY = cy + dy * (r + 20);
        // arrow shaft
        ctx.beginPath();
        ctx.moveTo(cx + dx * r * 0.5, cy + dy * r * 0.5);
        ctx.lineTo(tipX - dx * 14, tipY - dy * 14);
        ctx.strokeStyle = lit ? 'rgba(255,210,74,0.95)' : 'rgba(120,110,90,0.35)';
        ctx.lineWidth = lit ? 5 : 3;
        ctx.stroke();
        // arrow head
        const hx = -dy, hy = dx;
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(tipX - dx * 16 + hx * 9, tipY - dy * 16 + hy * 9);
        ctx.lineTo(tipX - dx * 16 - hx * 9, tipY - dy * 16 - hy * 9);
        ctx.closePath();
        ctx.fillStyle = lit ? '#FFD24A' : 'rgba(120,110,90,0.35)';
        ctx.fill();
    }
    // YOU disc at hub centre
    ctx.beginPath(); ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(139,26,43,0.95)'; ctx.fill();
    ctx.strokeStyle = '#F3ECD9'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.fillStyle = '#F3ECD9'; ctx.font = 'bold 11px "Cinzel", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('YOU', cx, cy + 1);
    ctx.textBaseline = 'alphabetic';
}

// ── bottom UI strip: room label + canonical move grammar (thin, game-like) ──
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
    let img = null;
    try { img = await loadImage(boardBuf); } catch (e) { return; }
    const pw = 560, ph = 360, px = (W - pw) / 2, py = 486;
    // panel + board
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

// ── exits from the live doc (adjacency is the ONLY source — §10 no hardcode) ──
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

// ── main render ──
// opts: { exits?, prefix, puzzleBoard?(Buffer), labelOverride?, style? }
async function _renderInProcess(eventDoc, player, room, opts = {}) {
    const exits = opts.exits || exitsFor(eventDoc, player);
    const bg = await plateFor(exits, `${eventDoc.seed}:${room.key}`);
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    // 1) the world
    ctx.drawImage(bg, 0, 0, W, H);
    drawTint(ctx, room);
    if (room.state === 'CLEARED') drawClearedWash(ctx);

    // 2) the player's ASSIGNED sprite — same spot every room (§7/§12)
    const sprite = await spriteFor(player);
    if (sprite) {
        const scale = PLAYER_H / sprite.height;
        const dw = sprite.width * scale;
        // contact shadow grounds the actor in the world
        ctx.save();
        ctx.beginPath();
        ctx.ellipse(PLAYER_X, PLAYER_GROUND + 6, dw * 0.34, 16, 0, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0,0,0,0.42)';
        ctx.fill();
        ctx.restore();
        ctx.drawImage(sprite, PLAYER_X - dw / 2, PLAYER_GROUND - PLAYER_H, dw, PLAYER_H);
    }

    // 3) the compass hub etched into the floor (from REAL adjacency)
    drawCompassHub(ctx, exits);

    // 4) exit chevrons at the arches (yellow — §9)
    drawExitArrows(ctx, exits);

    // 5) game chrome: bottom strip + puzzle overlay
    const P = room.payload || {};
    const get = (k) => (typeof P.get === 'function' ? P.get(k) : P[k]);
    drawBottomStrip(ctx, room, opts.prefix, opts.labelOverride
        || (room.type === 'landmark' ? get('landmarkName') : null));
    if (opts.puzzleBoard) await drawPuzzleOverlay(ctx, opts.puzzleBoard);

    return c.toBuffer('image/png');
}

// ── off-loop render via the shared render pool (same worker as the map —
// canvas work must never stall the bot's event loop at war scale) ──
const { fork } = require('child_process');
const _pool = { children: [], queue: [], inflight: 0, max: 2 };
let _seq = 0;

function _spawnChild() {
    const child = fork(path.join(__dirname, 'renderWorker.js'), [], { stdio: 'ignore' });
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
        return await _renderViaChild(plain(eventDoc), plain(player), roomPlain, opts);
    } catch (e) {
        // fallback: block briefly rather than fail the player's room
        return _renderInProcess(eventDoc, player, room, opts);
    }
}

module.exports = {
    renderRoomScene, _renderInProcess, exitsFor, plateKeyFor,
    DOORS, PLAYER_X, PLAYER_GROUND, TYPE_LABEL,
};
