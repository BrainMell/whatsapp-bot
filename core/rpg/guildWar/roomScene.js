// ============================================
// 🏛️ RUINS ROOM SCENE RENDERER — presentation overhaul 2026-10-04 (QA pass)
// Owner spec (Final Polish brief §2-§6): the room image is the WORLD.
// Rendered fully in Node (node-canvas) from the owner's own Ruins plates —
// the Go microservice is NOT involved, so nothing here depends on the
// Box-2 deploy path or the Bot_genaration divergence.
//
//   • background = the door-variant plate that matches the room's REAL
//     exits (N/E/W arches; S faces the player — indicator only)
//   • yellow chevrons at every open arch, none where there is no path
//   • the champion STANDS IN FRONT OF THE DOOR THEY ENTERED THROUGH —
//     just inside the arch, facing into the room (owner-annotated spots,
//     2026-10-05); war start (no entry) = classic left-door entrance
//   • the HUD is the DEFAULT ENCOUNTER's over-head presentation — name
//     pill + segmented HP bar, state/turn pill above — with the banner
//     and the bottom-left panel LEFT OUT (owner directive 2026-10-05);
//     the separate floor YOU-compass widget is gone, chevrons mark doors
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
//   • puzzle boards OVERLAY the scene as a panel — never a separate card
// ============================================

const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

// ── font registration (QA fix: fresh render workers fell back to sans-serif
// because ONLY noticeCard/mapRenderer registered fonts in the PARENT — the
// forked worker child needs its own registration before first draw) ──
let _fontsReady = false;
function ensureFonts() {
    if (_fontsReady) return true;
    try {
        const canvas = require('canvas');
        const registerFont = canvas.registerFont || (canvas.GlobalFonts && canvas.GlobalFonts.registerFromPath);
        if (!registerFont) return false;
        const F = path.join(__dirname, '..', '..', 'rpgasset', 'fonts');
        const regs = [
            ['CinzelDecorative-Black.ttf', { family: 'Cinzel Deco' }],
            ['Cinzel-Variable.ttf', { family: 'Cinzel' }],
            ['IMFellEnglish-Regular.ttf', { family: 'IM Fell' }],
            ['MedievalSharp.ttf', { family: 'MedievalSharp' }],
        ];
        for (const [file, opts] of regs) {
            const p = path.join(F, file);
            if (fs.existsSync(p)) { try { registerFont(p, opts); } catch (e) { /* skip */ } }
        }
        _fontsReady = true;
        return true;
    } catch (e) { return false; }
}

const CFG = require('./config');
const state = require('./state');
const mapEngine = require('./mapEngine');

const W = 1200, H = 900;
const ASSET_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'guildwar', 'ruins');
const CHAR_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'characters');
const ENEMY_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'enemies');
// ⚔️ ENCOUNTER-TYPE PROPS (owner directive 2026-10-05): every encounter kind
// shows a real, style-matched sprite — discovery rooms show the RUBBLE the
// caption talks about, and after `dig` the rubble is gone and the gold
// coins are left in its place. Generated pixel-art, keyed + grounded.
const GW_PROP_DIR = path.join(ASSET_DIR, 'props');

// 🔄 ITEMS-BEHIND-THE-HUD (owner ruins_fixes.txt #3, 2026-10-05): the
// default-encounter hub panel owns the bottom-left corner of the canvas
// (panel spans x ≈ -26..505, y ≈ 644..900 at HUB_SCALE). Items must ALWAYS
// render behind the HUD, no matter where they are positioned — so nothing
// (room content, ambient props, potion-style urns) parks inside this
// footprint, and everything still draws BEFORE the panel in the pipeline
// so the panel wins the z-order wherever depth stacks them anyway.
const HUB_ZONE = { x1: 530, y0: 610 };

// ── doorway geometry on the normalized plates (1200×900) ──
const DOORS = {
    w: { cx: 168, cy: 505 },   // left arch (player's left = west wall)
    e: { cx: 1032, cy: 505 },  // right arch
    n: { cx: 600, cy: 292 },   // back-wall arch (faces away from viewer)
    s: { cx: 600, cy: 818 },   // behind the viewer — chevrons at frame bottom
};

// ⚔️ OWNER-CIRCLED SPAWN SPOTS (annotated screenshot 2026-10-05):
// the champion stands IN FRONT OF the door they entered through — just
// inside the arch. Facing rule (owner follow-up 2026-10-05 23:39Z: "the
// player shouldn't be facing the door they just came out of — they should
// be facing away from the door, toward the rest of the scene"): the
// champion PNGs read slightly RIGHT natively (front-facing sprites with a
// rightward lean), so flip=false faces right. w-entry keeps native (faces
// EAST, into the room); e-entry mirrors (faces WEST).
//
// 🔄 SPAWN/FACING OVERHAUL (owner ruins_fixes.txt #1+#5, 2026-10-05):
//   #1 — when a player SPAWNS IN (war start / defeat respawn — no door they
//        walked through), they stand at the BACK position: the bottom-centre
//        spot circled green on the owner's screenshot (≈ 624, 780), NOT the
//        old classic left-door entrance.
//   #5 — at the BACK position and at the FORWARD doorway the sprite FACES
//        THE MORE OPEN SIDE of the room — away from the concentration of
//        doorways (see facingForSpot below). Walk-in entries through w/e
//        keep the face-away-from-the-entry-door rule.
const SPAWN_SPOTS = {
    w: { x: 258, y: 590 },   // just right of the left arch (owner circle 1)
    e: { x: 942, y: 612 },   // just left of the right arch (owner circle 2)
    n: { x: 596, y: 402 },   // in front of the back-wall arch (owner circle 3)
    s: { x: 624, y: 780 },   // the BACK position — owner's green circle (ruins_fixes #1)
};
const DEFAULT_ENTRY = 's';
const ENTRY_FLIP = { w: false, e: true, n: false, s: false };

// 🔄 facing rule for the BACK position + FORWARD doorway (owner #5):
// originally "face AWAY from the concentration of doorways" — REVERSED by
// the owner's live playtest the same day: "bottom and left means it should
// be facing left towards the door". The sprite now faces TOWARD an open
// side arch (a door is something to look AT, not away from). If doorways
// sit to the left (e.g. forward and left, none right) the player faces
// LEFT; more to the right → faces RIGHT; tie or none → the spot's native
// read. Walk-in entries through w/e keep the face-away-from-entry-door rule.
// Implementation: count OPEN side arches in SCREEN space — west arch = left,
// east arch = right (the centre arches n/s are neither side). Applies at
// the back position (spawn-in + south walk-ins) and forward doorway (north).
function facingForSpot(dir, exits) {
    if (dir !== 's' && dir !== 'n') return !!ENTRY_FLIP[dir];
    const open = (d) => Array.isArray(exits) && exits.some((x) => x && x.dir === d && x.edge);
    const left = open('w') ? 1 : 0;
    const right = open('e') ? 1 : 0;
    if (left > right) return true;    // face LEFT — toward the open west arch
    if (right > left) return false;   // face RIGHT — toward the open east arch
    return !!ENTRY_FLIP[dir];         // tie: either is fine → native read
}

// the guardian's spot follows the same opposite-side rule as the pack
// (owner 2026-10-05): it waits across the room from the champion's entry
const BOSS_ANCHOR = {
    w: { x: 860, y: 730 },   // entered left → guardian right
    e: { x: 340, y: 730 },   // entered right → guardian left
    n: { x: 780, y: 745 },   // entered back wall → guardian blocks the front
    s: { x: 655, y: 545 },   // front walk-in → guardian holds the back wall
};

// derive which door the player CAME THROUGH from their last move
// (prevRoom→room). Moving east means entering the new room through its
// WEST door, so the entry door is the INVERSE of the move delta:
// dx=+1 → 'w', dx=-1 → 'e', dy=+1 → 'n', dy=-1 → 's'.
function entryDirOf(player) {
    const prev = String((player && player.prevRoomId) || '');
    const cur = String((player && player.roomId) || '');
    if (!prev || !cur || prev === cur) return null;
    const [px, py] = prev.split(',').map(Number);
    const [cx, cy] = cur.split(',').map(Number);
    if ([px, py, cx, cy].some(Number.isNaN)) return null;
    const dx = cx - px, dy = cy - py;
    if (dx === 1) return 'w';
    if (dx === -1) return 'e';
    if (dy === 1) return 'n';
    if (dy === -1) return 's';
    return null;
}

// perspective: the same floor-plane rule the enemy packs follow — the
// farther back the feet, the smaller the actor. Owner calibration pass
// 2026-10-05: the first cut (205+145t → 205-350px) made actors tower over
// the door arches — everyone read as a giant in the hall. Now ~78% of
// that: characters stand clearly BELOW the arch mouths.
function perspH(groundY) {
    const t = Math.max(0, Math.min(1, (groundY - 340) / (810 - 340)));
    return Math.round(160 + 113 * t);
}

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
        // ⚔️ EXIT-CONSISTENCY FIX (owner spec §2/§6): plateKeyFor returns the
        // SEEDED keys 'L_a'/'L_b' for left-only rooms, but this map only had
        // the pair under 'L' — so P['L_b'] was undefined and EVERY left-only
        // room silently fell back to the no-door plate: chevrons pointing at
        // a solid wall while navigation said "go left".
        L_a: load('ruins_door_L_a.png'),
        L_b: load('ruins_door_L_b.png'),
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
        if (maxX >= 0) {
            box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
            // 🔄 FOOT BAND (owner ruins_fixes.txt #6 — shadows must match the
            // sprites): the shadow used to span the FULL content width, so
            // sprites with sweeping cloaks / wings / weapons got a shadow
            // far wider than the feet actually planted on the floor. Measure
            // the opaque extent of the BOTTOM ~16% of the content — the part
            // that really touches the ground — and let the contact shadow
            // hug THAT instead.
            const bandTop = Math.max(minY, maxY - Math.max(4, Math.round(box.h * 0.16)));
            let fMinX = img.width, fMaxX = -1;
            for (let y = bandTop; y <= maxY; y++) {
                for (let x = minX; x <= maxX; x++) {
                    if (data[(y * img.width + x) * 4 + 3] > 16) {
                        if (x < fMinX) fMinX = x;
                        if (x > fMaxX) fMaxX = x;
                    }
                }
            }
            if (fMaxX >= 0) {
                box.feetX = fMinX;
                box.feetW = fMaxX - fMinX + 1;
            }
        }
    } catch (e) { box = null; }
    bboxCache.set(cacheKey, box);
    return box;
}

// ── contact shadow, depth-aware (owner note 2026-10-05: the old flat dark
// ellipse read as a pasted blob — worst at the back wall, where it fought
// the plate's own wall-base shading instead of melting into it) ──
// Two layers: a tight dark CONTACT ellipse hugging the feet + a broad soft
// PENUMBRA. Depth (0 = back wall → 1 = front edge) drives size, softness and
// strength the way the plate's torch light implies: actors deep at the back
// get a small, light, forward-shifted shadow that dissolves into the
// wall-base shading; actors at the front get the full grounded shadow.
function shadowDepthT(groundY) {
    return Math.max(0, Math.min(1, (groundY - 340) / (810 - 340)));
}
function drawContactShadow(ctx, cx, groundY, w, h, alpha = 1) {
    const t = shadowDepthT(groundY);
    // 🔄 RECALIBRATED (owner playtest 2026-10-05: "the shadows are like tiny
    // specs now"): these multipliers were originally tuned back when w was
    // the FULL sprite content width — then ruins_fixes #6 swapped w down to
    // the much narrower foot band WITHOUT retuning, so shadows collapsed to
    // specks (~40×21px under a 210px-tall champion, with the gradient falloff
    // hiding even that). Re-sized so the CONTACT ellipse actually spans the
    // feet (≈0.9–1.1× foot width) and the penumbra breathes ≈1.5–1.9× beyond
    // it — still depth-aware, still melting into the wall-base shading.
    const rx = w * (0.55 + 0.15 * t);
    const ry = Math.max(9, h * (0.055 + 0.030 * t));
    // wall torches sit BEHIND the actors: the deeper the stance, the more
    // the shadow spills toward the viewer instead of spreading sideways
    const fwd = 2 + 6 * (1 - t);
    const a = (0.30 + 0.22 * t) * alpha;
    // penumbra — broad, faint
    ctx.save();
    ctx.translate(cx, groundY + fwd);
    ctx.scale(rx * 1.35, ry * 1.7);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g.addColorStop(0, `rgba(8,6,4,${(a * 0.55).toFixed(3)})`);
    g.addColorStop(0.72, `rgba(8,6,4,${(a * 0.26).toFixed(3)})`);
    g.addColorStop(1, 'rgba(8,6,4,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    // contact — tight, darkest (gentler falloff so the dark core isn't a
    // fraction of an already-tight ellipse)
    ctx.save();
    ctx.translate(cx, groundY + 2);
    ctx.scale(rx * 0.78, ry * 0.95);
    const g2 = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
    g2.addColorStop(0, `rgba(6,5,3,${a.toFixed(3)})`);
    g2.addColorStop(0.78, `rgba(6,5,3,${(a * 0.55).toFixed(3)})`);
    g2.addColorStop(1, 'rgba(6,5,3,0)');
    ctx.fillStyle = g2;
    ctx.beginPath(); ctx.arc(0, 0, 1, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
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
        // 🔄 the shadow hugs the FEET, not the full sprite width (owner
        // ruins_fixes.txt #6) — and its centre follows the foot band's
        // centre (mirrored when the sprite flips), so it always sits under
        // what actually touches the floor. FLOORED at half the content
        // width (owner playtest 2026-10-05: shadows read as "tiny specs"):
        // a wispy tail or a single claw tip at the bottom of a sprite must
        // never collapse the contact shadow to nothing.
        const feetW = box.feetW ?? box.w;
        const feetCx = (box.feetX ?? (box.x + (box.w - feetW) / 2)) + feetW / 2;
        const footW = Math.max(feetW, box.w * 0.5) * scale;
        const footOff = (feetCx - (box.x + box.w / 2)) * scale;
        drawContactShadow(ctx, flip ? cx - footOff : cx + footOff, groundY, footW, ch, alpha);
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
// Places the seeded gameplay content INTO the scene. The champion anchors
// at their ENTRY-DOOR spot; everything else anchors OPPOSITE/AROUND them:
// content lives on the far side of the room, meetings stand beside the
// champion, and nothing overlaps a doorway mouth or another actor.
function planFor(eventDoc, player, room, exits) {
    const plan = { hud: hudFor(player, room), spriteFile: resolvePlayerSpriteFile(player), enemies: [], props: [], mates: [], rivals: [] };
    const seedStr = `${eventDoc.seed}:${room.key}`;
    const rng = mapEngine.makeRng(`${seedStr}:plan`);
    const payloadGet = (p, k) => (p && typeof p.get === 'function') ? p.get(k) : (p || {})[k];
    const P = room.payload || {};
    const cleared = room.state === 'CLEARED';

    // ── the champion's entry-door spot (owner directive 2026-10-05) ──
    // Spawn-in (war start / defeat respawn — no door walked through) lands
    // at the BACK position (owner ruins_fixes.txt #1); facing at the back
    // position + the forward doorway follows the doorway-distribution rule
    // (owner #5) — see facingForSpot.
    const dir = entryDirOf(player) || DEFAULT_ENTRY;
    const spot = SPAWN_SPOTS[dir] || SPAWN_SPOTS[DEFAULT_ENTRY];
    plan.playerSpot = {
        dir, x: spot.x, y: spot.y,
        h: perspH(spot.y),
        flip: facingForSpot(dir, exits),
    };

    // 💡 §16 MEETINGS: other players IN this room are drawn in the world —
    // guildmates stand beside the champion (toward the room's centre),
    // rivals across from them, facing the champion.
    const others = (room.occupants || []).filter((j) => j && j !== player.jid)
        .map((j) => (eventDoc.players || []).find((p) => p.jid === j)).filter(Boolean);
    const mateRows = others.filter((o) => o.guildId === player.guildId).slice(0, 2);
    const rivalRows = others.filter((o) => o.guildId !== player.guildId).slice(0, 2);
    const towardCentre = spot.x < 600 ? 1 : -1;
    const clampX = (x) => Math.max(90, Math.min(1110, x));
    const clampY = (y) => Math.max(560, Math.min(838, y));
    for (let i = 0; i < mateRows.length; i++) {
        // spacing 130/110: humanoid sprites draw ~107px wide at mate depth,
        // so the old 95px pitch made "beside" players overlap into a blob
        const mx = clampX(spot.x + towardCentre * (130 + i * 110));
        // "beside" = the champion's own depth (spot.y is a valid floor
        // position by definition, so no clamp — the old clampY floor
        // teleported a back-arch champion's mates 158px nearer the camera,
        // which read as "some characters are larger than others")
        const my = spot.y + (i === 0 ? 6 : -6);
        // OWNER FIX 2026-10-05: every humanoid obeys ONE size law — the
        // perspective height at their own ground line (same as the
        // champion). The old ×0.92/×0.82 fudges stacked on top of the
        // perspective curve and made same-depth players look mis-sized.
        plan.mates.push({ file: resolvePlayerSpriteFile(mateRows[i]), x: mx, y: my, h: Math.round(perspH(my)), name: mateRows[i].name, flip: plan.playerSpot.flip });
    }
    for (let i = 0; i < rivalRows.length; i++) {
        let rx = clampX(1200 - spot.x + (i === 0 ? 0 : (towardCentre * 80)));
        // a champion entering from the back arch (n) or the front (s) sits
        // near x=600, so the mirrored "across" lane lands within 8-48px of
        // their own lane and everyone stacks vertically. Enforce a minimum
        // lane gap: shove the rival clear to the opposite side of the
        // champion from the mates → champion centre, mate right, rival left.
        if (Math.abs(rx - spot.x) < 140) rx = clampX(spot.x - towardCentre * 160);
        const ry = clampY(spot.y - 92 - i * 34);
        plan.rivals.push({
            file: resolvePlayerSpriteFile(rivalRows[i]), x: rx, y: ry,
            h: Math.round(perspH(ry)), name: rivalRows[i].name,
            // champion PNGs read slightly RIGHT natively → a rival standing
            // RIGHT of the champion mirrors to face LEFT toward them
            flip: rx > spot.x,
        });
    }

    // enemy zone anchors (ground y, depth-ordered): far → near. OWNER RULE
    // (2026-10-05): the pack always spawns on the OPPOSITE side of wherever
    // the champion moved into the room from — left entry → pack blocks the
    // right, right entry → pack blocks the left, back-wall entry (n) → pack
    // blocks the FRONT floor, front walk-in (s) → pack holds the BACK wall.
    // Anchors too close to the champion are dropped. (Spread: with the
    // bigger-enemy scale the old anchors merged pack members into a blob.)
    const ZONE_TABLE = {
        w: [{ x: 795, y: 640 }, { x: 1010, y: 705 }, { x: 610, y: 700 }, { x: 880, y: 755 }, { x: 1075, y: 760 }],
        e: [{ x: 405, y: 640 }, { x: 190, y: 705 }, { x: 590, y: 700 }, { x: 320, y: 755 }, { x: 125, y: 760 }],
        // front pack stays at y ≤ 760 so the bottom S-chevrons stay visible
        // below the pack's feet line
        n: [{ x: 430, y: 752 }, { x: 648, y: 758 }, { x: 855, y: 746 }, { x: 520, y: 700 }, { x: 760, y: 712 }],
        s: [{ x: 470, y: 545 }, { x: 640, y: 520 }, { x: 830, y: 560 }, { x: 545, y: 595 }, { x: 745, y: 605 }],
    };
    let ZONE = (ZONE_TABLE[dir] || ZONE_TABLE.w).slice();
    ZONE = ZONE.filter((s) => Math.hypot(s.x - spot.x, s.y - spot.y) > 150);

    if (!cleared) {
        if (['combat', 'coop'].includes(room.type)) {
            const raw = payloadGet(P, 'enemies');
            // OWNER RULE 2026-10-05: max THREE enemies in any given room —
            // also caps the DRAWN pack for already-seeded 4-enemy payloads.
            const n = Math.max(1, Math.min(3, Array.isArray(raw) ? raw.length : 1));
            const lvl = (Array.isArray(raw) && raw[0]?.level) || 10;
            for (let i = 0; i < n; i++) {
                const zone = ZONE[i % ZONE.length];
                if (!zone) break;
                const file = ENEMY_POOL[rng.int(0, ENEMY_POOL.length - 1)];
                // owner 2026-10-05 23:39Z: "make the enemies a little bigger
                // than the characters" — the shrink pass had caught the pack
                // too. Pack members now stand ~1.18× the plate's perspective
                // height at their OWN ground line (so nearer rows read
                // naturally bigger), always over the champion's height.
                const h = Math.round(perspH(zone.y) * 1.18 + (lvl >= 15 ? 18 : 0));
                // monsters face the champion: native sprites look LEFT, so
                // a monster standing LEFT of the champion flips to face right
                plan.enemies.push({ file, x: zone.x + rng.int(-24, 24), y: zone.y, h, flip: zone.x < spot.x });
            }
        } else if (room.type === 'core') {
            const ba = BOSS_ANCHOR[dir] || BOSS_ANCHOR.w;
            plan.enemies.push({ file: BOSS_POOL[rng.int(0, BOSS_POOL.length - 1)], x: ba.x, y: ba.y, h: Math.round(Math.max(perspH(ba.y) * 1.25, perspH(spot.y) * 1.18)), flip: ba.x < spot.x, boss: true });
        } else if (room.type === 'secret' && payloadGet(P, 'boss')) {
            const ba = BOSS_ANCHOR[dir] || BOSS_ANCHOR.w;
            plan.enemies.push({ file: BOSS_POOL[rng.int(0, BOSS_POOL.length - 1)], x: ba.x, y: ba.y - 10, h: Math.round(Math.max(perspH(ba.y) * 1.15, perspH(spot.y) * 1.10)), flip: ba.x < spot.x, boss: true });
        }
    }

    // ambient props (subtle, wall-hugging) — 0-3 by seed, never blocking
    const PROPS = ['crate', 'urn', 'bones', 'rocks', 'rubble', 'moss'];
    const occupied = (x, y) =>
        plan.enemies.some((e) => Math.hypot(e.x - x, e.y - y) < 120) ||
        plan.mates.some((e) => Math.hypot(e.x - x, e.y - y) < 120) ||
        plan.rivals.some((e) => Math.hypot(e.x - x, e.y - y) < 120) ||
        Math.hypot(spot.x - x, spot.y - y) < 120;
    const propSpots = [
        { x: 96, y: 596 }, { x: 1104, y: 648 }, { x: 248, y: 606 },
        { x: 952, y: 628 }, { x: 66, y: 584 }, { x: 1136, y: 730 },
    ];
    for (const s of rng.shuffle(propSpots)) {
        if (plan.props.length >= rng.int(1, 3)) break;
        if (occupied(s.x, s.y)) continue;
        // 🔄 never park a prop (crate/urn/potion-looking bits) inside the hub
        // panel's corner — items always render behind the HUD (owner #3)
        if (s.x < HUB_ZONE.x1 && s.y > HUB_ZONE.y0) continue;
        // keep door approaches clear
        if (Math.hypot(s.x - DOORS.w.cx, s.y - DOORS.w.cy) < 130) continue;
        if (Math.hypot(s.x - DOORS.e.cx, s.y - DOORS.e.cy) < 130) continue;
        plan.props.push({ kind: rng.pick(PROPS), x: s.x + rng.int(-14, 14), y: s.y, s: 0.8 + rng.next() * 0.6 });
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

// ── DEFAULT-ENCOUNTER OVER-HEAD HUD (owner directive 2026-10-05) ─────────
// The default encounter's character presentation — name pill + segmented
// HP bar floating over the actor's head — ported 1:1 from the Go renderer
// (dark pill, white bold text, red→orange gradient HP segments on a dark
// track). The state/turn pill rides on top; energy rides under the HP bar
// in the default panel's cyan. The banner and bottom-left panel are LEFT
// OUT per the owner's instruction.
function pill(ctx, cx, cy, text, font, padX, bg, border, textColor) {
    ctx.font = font;
    const sizeMatch = font.match(/(\d+(?:\.\d+)?)px/);
    const h = (sizeMatch ? parseFloat(sizeMatch[1]) : 12) + 10;
    const w = ctx.measureText(text).width + padX * 2;
    ctx.fillStyle = bg;
    roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2 - 1); ctx.fill();
    if (border) { ctx.strokeStyle = border; ctx.lineWidth = 1.5; roundRect(ctx, cx - w / 2, cy - h / 2, w, h, h / 2 - 1); ctx.stroke(); }
    ctx.fillStyle = textColor;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, cx, cy + 0.5);
    ctx.textBaseline = 'alphabetic';
    return h;
}

function segBar(ctx, cx, cy, w, h, pct, fillFrom, fillTo) {
    pct = Math.max(0, Math.min(1, pct));
    const x = cx - w / 2, y = cy - h / 2;
    ctx.fillStyle = 'rgba(18,15,12,0.92)';
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    if (pct > 0) {
        const g = ctx.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, fillFrom); g.addColorStop(1, fillTo);
        ctx.fillStyle = g;
        const fw = Math.max(h, w * pct);
        ctx.save(); roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
        ctx.fillRect(x, y, fw, h);
        ctx.restore();
    }
    // segment notches (3 segments, default-encounter style)
    ctx.fillStyle = 'rgba(10,8,6,0.85)';
    for (let i = 1; i <= 2; i++) ctx.fillRect(x + (w * i) / 3 - 1, y, 2, h);
    ctx.strokeStyle = 'rgba(245,240,225,0.85)'; ctx.lineWidth = 1.2;
    roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
}

function drawOverheadHud(ctx, plan) {
    const hud = plan.hud;
    if (!hud) return;
    const spot = plan.playerSpot;
    if (!spot) return;
    // stack ABOVE the head, mirroring the default encounter's over-head
    // order (nameplate nearest the actor, bars under it) with the GW
    // state/turn pill floating at the top:
    //   [state pill] / [name pill] / [HP bar] / [EN bar] / (head)
    const headTop = spot.y - spot.h;
    const enY = headTop - 13;                       // EN bar centre
    const hpY = enY - 5.5 - 3 - 4.5;                // HP bar centre (h11, gap)
    // name pill just above the HP bar
    pill(ctx, spot.x, hpY - 5.5 - 4 - 11, String(hud.name).slice(0, 16),
        'bold 13px sans-serif', 10,
        'rgba(26,21,13,0.95)', 'rgba(61,48,19,0.95)', '#FFFFFF');
    // state / turn pill at the very top
    const stateText = hud.state || 'EXPLORING';
    pill(ctx, spot.x, hpY - 5.5 - 4 - 22 - 10, stateText, 'bold 10px sans-serif', 8,
        'rgba(139,26,43,0.94)', 'rgba(245,240,225,0.85)', '#F5F0E1');
    // segmented HP bar (red→orange — the default over-head bar)
    const hpPct = (hud.hp || 0) / (hud.maxHp || 1);
    segBar(ctx, spot.x, hpY, 112, 11, hpPct, '#d63c14', '#f59d2a');
    // segmented EN bar (the default panel's cyan, thinner)
    const enPct = (hud.energy || 0) / (hud.maxEnergy || 1);
    segBar(ctx, spot.x, enY, 92, 8, enPct, '#12d7f5', '#0a86c8');
}

// ── battle-in-the-room overlay bits (owner directive 2026-10-05 23:39Z) ───
// The fight happens ON the room scene: enemies carry the default-encounter
// name+HP plates, and the DEFAULT HUD panel rides bottom-left on EVERY room
// scene, fed live combat pools during battle. The old gold ground ring is
// RETIRED — the turn indicator is now the main game's floating blue crystal
// (owner 2026-10-05: "instead of the golden circle turn indicator, scrap
// that. The main game already uses that floating blue crystal, so use that
// here too.")

// ── the DEFAULT turn indicator: the main game's floating blue crystal ────
// Same owner-supplied asset the Go combat renderer floats above the active
// unit's head (Bot_genaration assets/rpgasset/ui/crystal.png — mirrored into
// core/rpgasset/ui/), same geometry recipe as renderer.go's crystal pass:
// h = clamp(spriteH·0.30, 24, 90), twin glow halos, painted LAST so it
// hovers over name pills and HP bars.
let _crystalImg;                                   // undefined=untried null=missing
function crystalImg() {
    if (_crystalImg !== undefined) return Promise.resolve(_crystalImg);
    const p = path.join(UI_DIR, 'crystal.png');
    try {
        // PNG-signature fast-fail (LFS-pointer environments skip to null)
        const fd = fs.openSync(p, 'r');
        const head = Buffer.alloc(8);
        fs.readSync(fd, head, 0, 8, 0);
        fs.closeSync(fd);
        if (!head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
            _crystalImg = null;
            return Promise.resolve(null);
        }
    } catch (e) { _crystalImg = null; return Promise.resolve(null); }
    return loadImage(p).then((img) => { _crystalImg = img; return img; })
        .catch(() => { _crystalImg = null; return null; });
}
async function drawTurnCrystal(ctx, cx, headTopY, spriteH, clearance) {
    const src = await crystalImg();
    if (!src) return;
    const ch = Math.max(24, Math.min(90, spriteH * 0.30));
    const cw = Math.max(12, ch * (src.width / src.height));
    const bottom = headTopY - clearance - 6;
    const cy = bottom - ch / 2;
    ctx.save();
    // twin glow halos (straight alpha, renderer.go recipe)
    ctx.fillStyle = 'rgba(160,210,255,0.14)';
    ctx.beginPath(); ctx.arc(cx, cy, cw * 1.05, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = 'rgba(110,170,255,0.24)';
    ctx.beginPath(); ctx.arc(cx, cy, cw * 0.72, 0, Math.PI * 2); ctx.fill();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, cx - cw / 2, bottom - ch, cw, ch);
    ctx.restore();
}

function drawHeart(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 20, s / 20);
    ctx.beginPath();
    ctx.moveTo(0, 8);
    ctx.bezierCurveTo(-12, -2, -8.5, -12.5, 0, -6);
    ctx.bezierCurveTo(8.5, -12.5, 12, -2, 0, 8);
    ctx.closePath();
    ctx.fillStyle = '#C6392E'; ctx.fill();
    ctx.strokeStyle = '#38110D'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath(); ctx.ellipse(-3.6, -4.4, 2.2, 1.5, -0.5, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

function drawDrop(ctx, cx, cy, s) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(s / 20, s / 20);
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(7.5, -1, 7.2, 3.4);
    ctx.arc(0, 3.4, 7.2, 0, Math.PI, false);
    ctx.quadraticCurveTo(-7.5, -1, 0, -10);
    ctx.closePath();
    ctx.fillStyle = '#3F7FD9'; ctx.fill();
    ctx.strokeStyle = '#0E2246'; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.38)';
    ctx.beginPath(); ctx.ellipse(-2.6, 3.4, 2.0, 2.9, 0.35, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
}

// one segmented bar row of the default panel (chunky blocks + bevel)
function segRow(ctx, x, y, w, h, pct, from, to) {
    pct = Math.max(0, Math.min(1, pct));
    ctx.fillStyle = '#221910';
    roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.55)'; ctx.lineWidth = 2;
    roundRect(ctx, x, y, w, h, h / 2); ctx.stroke();
    if (pct > 0) {
        const inner = 5, segs = 8, gap = 3;
        const segW = (w - inner * 2 - gap * (segs - 1)) / segs;
        const g = ctx.createLinearGradient(0, y, 0, y + h);
        g.addColorStop(0, to); g.addColorStop(0.5, from); g.addColorStop(1, from);
        ctx.save(); roundRect(ctx, x, y, w, h, h / 2); ctx.clip();
        const fw = Math.max(h * 0.8, (w - inner * 2) * pct);
        ctx.fillStyle = g; ctx.fillRect(x + inner, y + 2, fw, h - 4);
        ctx.fillStyle = 'rgba(255,255,255,0.22)'; ctx.fillRect(x + inner, y + 2, fw, 4);
        ctx.fillStyle = 'rgba(20,14,8,0.85)';
        for (let i = 1; i < segs; i++) ctx.fillRect(x + inner + i * (segW + gap) - gap / 2, y + 2, gap, h - 4);
        ctx.restore();
    }
}

// ═══ THE DEFAULT ENCOUNTER HUB — the codebase's own, from its own assets ═══
// Owner directive 2026-10-05 01:48Z: "YOU STILL AREN'T USING THE DEFAULT
// ENCOUNTER HUB... THE ASSETS AND CODE IS RIGHT THERE, JUST TAKE IT. IT'S
// THE DEFAULT FOR ENCOUNTERS — FIND AND ISOLATE THAT PART." Isolated: this
// is the Go combat renderer's bottom-left player_state panel, rebuilt 1:1
// from the SAME REAL ASSETS it draws (core/rpgasset/ui/: player_state.png
// panel, heart.png, mana.png icons, hp1-5.png / mana1-5.png bar sprites —
// the exact files renderer.go loads via uiPath()). Geometry mirrors
// renderer.go on its 1024x687 canvas — panel normX(-716) normY(113)
// 453x244 (22px cropped off-canvas left, 26px bottom), heart (16,565)
// 38x47, mana icon (21,612) 29x44, HP segments x 54/144/235 (121x47) @
// y565, EN segments x 50/139/229 (119x42) @ y612, name centered at panel
// centre y=519 — scaled x1.171875 onto this 1200x900 room canvas and
// anchored bottom-left with the same crops. Segment fill follows
// renderer.go's drawBar exactly: each 1/3-of-max segment picks sprite
// clamp(round(pct*4)+1, 1, 5).
const UI_DIR = path.join(__dirname, '..', '..', 'rpgasset', 'ui');
const HUB_SCALE = W / 1024;                        // 1.171875 (Go canvas → room canvas)
const _hubAssets = { state: 0, imgs: null };       // 0=untried 1=ready -1=failed
function hubAssets() {
    if (_hubAssets.state !== 0) return _hubAssets.state === 1 ? _hubAssets.imgs : null;
    try {
        // ⚡ fast-fail: this repo stores most art as Git-LFS pointers (the
        // real pixels only exist where git-lfs smudged the checkout — i.e.
        // the game boxes). Probe the 8-byte PNG signature FIRST so pointer
        // environments fall back after a few header reads instead of 13
        // failed image decodes on the render hot path.
        const isRealPng = (p) => {
            try {
                const fd = fs.openSync(p, 'r');
                const head = Buffer.alloc(8);
                fs.readSync(fd, head, 0, 8, 0);
                fs.closeSync(fd);
                return head.equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
            } catch (e) { return false; }
        };
        const { loadImage } = require('canvas');
        const names = ['player_state.png', 'heart.png', 'mana.png',
            'hp1.png', 'hp2.png', 'hp3.png', 'hp4.png', 'hp5.png',
            'mana1.png', 'mana2.png', 'mana3.png', 'mana4.png', 'mana5.png'];
        if (!names.every((n) => isRealPng(path.join(UI_DIR, n)))) {
            _hubAssets.state = -1;
            return Promise.resolve(null);
        }
        const imgs = {};
        for (const n of names) imgs[n] = loadImage(path.join(UI_DIR, n));
        _hubAssets.imgs = Promise.all(Object.values(imgs).map((p) => p.catch(() => null)))
            .then((bufs) => {
                const out = {};
                const keys = Object.keys(imgs);
                let ok = 0;
                bufs.forEach((b, i) => { if (b) { out[keys[i]] = b; ok += 1; } });
                if (ok < names.length) throw new Error(`only ${ok}/${names.length} hub assets loaded`);
                _hubAssets.state = 1;
                return out;
            })
            .catch((e) => {
                _hubAssets.state = -1;
                console.error('[roomScene] default hub assets unavailable — vector fallback panel in use:', e.message);
                return null;
            });
        // first caller awaits the promise; later callers get the cached verdict
        _hubAssets.imgs = _hubAssets.imgs.then((r) => r);
        return _hubAssets.imgs;
    } catch (e) {
        _hubAssets.state = -1;
        return Promise.resolve(null);
    }
}
function _hubSegSprite(pct) {
    return Math.max(1, Math.min(5, Math.round(Math.max(0, Math.min(1, pct)) * 4) + 1));
}
function _hubGeom() {
    const s = HUB_SCALE;
    const pw = Math.round(453 * s), ph = Math.round(244 * s);
    const px = -Math.round(22 * s);                          // Go: 22px off-canvas left
    const py = H - ph + Math.round(26 * s);                  // Go: 26px off-canvas bottom
    return {
        px, py, pw, ph,
        heartX: px + 38 * s, heartY: py + 96 * s, heartW: 38 * s, heartH: 47 * s,
        manaIx: px + 43 * s, manaIy: py + 143 * s, manaIw: 29 * s, manaIh: 44 * s,
        hpY: py + 96 * s, hpW: 121 * s, hpH: 47 * s, hpXs: [76, 166, 257].map((v) => px + v * s),
        enY: py + 143 * s, enW: 119 * s, enH: 42 * s, enXs: [72, 161, 251].map((v) => px + v * s),
        nameX: px + 226.5 * s, nameY: py + 50 * s, nameMaxW: 393 * s, nameSize: Math.round(28 * s),
    };
}
async function drawHudPanel(ctx, hud) {
    if (!hud) return;
    const imgs = await hubAssets();
    if (imgs) {
        const G = _hubGeom();
        ctx.save();
        ctx.imageSmoothingEnabled = false;                  // Go resizes with NearestNeighbor
        ctx.drawImage(imgs['player_state.png'], G.px, G.py, G.pw, G.ph);
        ctx.drawImage(imgs['heart.png'], G.heartX, G.heartY, G.heartW, G.heartH);
        ctx.drawImage(imgs['mana.png'], G.manaIx, G.manaIy, G.manaIw, G.manaIh);
        const maxHp = Math.max(1, Math.floor(hud.maxHp || 1));
        const hp = Math.max(0, Math.floor(hud.hp || 0));
        const maxEn = Math.max(1, Math.floor(hud.maxEnergy || 1));
        const en = Math.max(0, Math.floor(hud.energy || 0));
        const hpSeg = maxHp / 3, enSeg = maxEn / 3;
        for (let i = 0; i < 3; i++) {
            const hCur = Math.max(0, Math.min(hpSeg, hp - i * hpSeg));
            const eCur = Math.max(0, Math.min(enSeg, en - i * enSeg));
            const hs = `hp${_hubSegSprite(hCur / hpSeg)}.png`;
            const es = `mana${_hubSegSprite(eCur / enSeg)}.png`;
            if (imgs[hs]) ctx.drawImage(imgs[hs], G.hpXs[i], G.hpY, G.hpW, G.hpH);
            if (imgs[es]) ctx.drawImage(imgs[es], G.enXs[i], G.enY, G.enW, G.enH);
        }
        // name — white bold with black shadow, shrink-to-fit (renderer.go
        // uses ui/Inter-Bold.ttf; the bot repo ships without it, so the
        // registered Cinzel kit stands in, same placement/colour treatment)
        const name = String(hud.name || 'Explorer').slice(0, 16);
        for (let size = G.nameSize; size >= 14; size -= 2) {
            ctx.font = `bold ${size}px "Cinzel", sans-serif`;
            if (ctx.measureText(name).width <= G.nameMaxW || size === 14) {
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillStyle = 'rgba(0,0,0,0.78)';
                ctx.fillText(name, G.nameX + 2, G.nameY + 2);
                ctx.fillStyle = '#FFFFFF';
                ctx.fillText(name, G.nameX, G.nameY);
                break;
            }
        }
        ctx.restore();
        return;
    }
    // ── vector fallback (assets missing in this environment): dark panel
    // approximation of player_state.png — never the rejected parchment.
    const G = _hubGeom();
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 14; ctx.shadowOffsetY = 4;
    const pg = ctx.createLinearGradient(0, G.py, 0, G.py + G.ph);
    pg.addColorStop(0, '#232a3a'); pg.addColorStop(1, '#161b28');
    ctx.fillStyle = pg;
    roundRect(ctx, G.px, G.py, G.pw, G.ph, 10); ctx.fill();
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = '#8a7a4e'; ctx.lineWidth = 3;
    roundRect(ctx, G.px + 5, G.py + 5, G.pw - 10, G.ph - 10, 8); ctx.stroke();
    const name = String(hud.name || 'Explorer').slice(0, 16);
    ctx.font = 'bold 30px "Cinzel", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(name, G.nameX, G.nameY);
    const rowHpY = G.py + 96 * HUB_SCALE + G.hpH / 2, rowEnY = G.py + 143 * HUB_SCALE + G.enH / 2;
    segRow(ctx, G.hpXs[0] - 10 * HUB_SCALE, rowHpY - G.hpH / 2, G.hpXs[2] + G.hpW - G.hpXs[0] + 20 * HUB_SCALE, G.hpH,
        (hud.hp || 0) / (hud.maxHp || 1), '#C93A2E', '#E8795B');
    segRow(ctx, G.enXs[0] - 10 * HUB_SCALE, rowEnY - G.enH / 2, G.enXs[2] + G.enW - G.enXs[0] + 20 * HUB_SCALE, G.enH,
        (hud.energy || 0) / (hud.maxEnergy || 1), '#3E7CD6', '#66A9E8');
    ctx.restore();
}

// ── ambient props (vector, palette-matched, subtle) ─────────────────────
// QA pass 2026-10-04: the first drafts rendered too pale and too tall — they
// read as shields nailed to the wall. Now: dark floor-hugging silhouettes
// (stone/terracotta tones sampled from the plates) with a soft contact
// shadow, drawn low so they always sit ON the floor plane.
const STONE = ['#453f33', '#3a3529', '#514a3b'];
const STONE_DARK = 'rgba(22,20,15,0.6)';
function drawProp(ctx, kind, x, groundY, s) {
    // 🔄 SHADOW UNIFICATION (owner ruins_fixes.txt #6): props drew their own
    // flat dark ellipse — a different shadow language than the actors'
    // two-layer depth-aware contact shadow. Same contact shadow now, scaled
    // to the prop, so crates/urns/bones ground exactly like everyone else.
    drawContactShadow(ctx, x, groundY, 46 * s, 32 * s);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.translate(x, groundY);
    ctx.scale(s, s);
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
    // content anchor: the point-of-interest zone sits OPPOSITE the champion
    // (mirrored to the left half when they entered from the right door)
    // 🔄 ITEMS-BEHIND-THE-HUD (owner ruins_fixes.txt #3): when the mirrored
    // anchor would park the item inside the hub panel's corner, lift it to
    // the floor strip just ABOVE the panel so it always reads as behind the
    // HUD (the panel also draws later and wins z-order regardless).
    const spot = plan.playerSpot || SPAWN_SPOTS[DEFAULT_ENTRY];
    let ax = spot.x > 700 ? 380 : 820, ay = 700;
    if (ax < HUB_ZONE.x1 && ay > HUB_ZONE.y0) ay = 588;
    if (room.state === 'CLEARED') {
        // cleared rooms keep a faint scar of what was here (never empty-identical).
        // discovery/reward fall through to the switch — their CLEARED branches
        // draw the aftermath (coins left behind / emptied vault).
        if (t === 'combat' || t === 'coop' || t === 'core' || (t === 'secret')) glowSpot(ctx, ax, ay - 20, 70, 'rgba(120,140,90,0.10)');
        if (!['discovery', 'reward'].includes(t)) return;
    }
    switch (t) {
        case 'discovery': {
            // buried cache: the RUBBLE the caption promises (real sprite),
            // with a faint gold glint breathing through the stones. After
            // `dig` the rubble is GONE and the gold coins lie in its place.
            const propFile = room.state === 'CLEARED' ? 'cache_coins.png' : 'cache_rubble.png';
            glowSpot(ctx, ax, ay - 10, 90, room.state === 'CLEARED' ? 'rgba(255,215,90,0.20)' : 'rgba(255,200,80,0.14)');
            await drawGroundedSprite(ctx, [GW_PROP_DIR], propFile, ax, ay, room.state === 'CLEARED' ? 76 : 118, { shadow: true });
            break;
        }
        case 'reward': {
            // old-world vault: the reliquary chest as a real sprite. After
            // `take` the chest stands OPEN (lid up, gold glow in the cavity)
            // with the CLAIMED marker (owner directive 2026-10-05: "the
            // chest is supposed to be open in the next sprite that says
            // Claimed")
            glowSpot(ctx, ax, ay - 30, 100, 'rgba(255,215,90,0.20)');
            const open = room.state === 'CLEARED';
            await drawGroundedSprite(ctx, [GW_PROP_DIR], open ? 'cache_chest_open.png' : 'cache_chest.png', ax, ay, 150, { shadow: true });
            if (open) {
                glowSpot(ctx, ax, ay - 64, 46, 'rgba(255,215,90,0.16)');
                pill(ctx, ax, ay - 188, 'CLAIMED', 'bold 12px "Cinzel", sans-serif', 10,
                    'rgba(26,21,13,0.94)', 'rgba(255,210,74,0.85)', '#FFD24A');
            }
            break;
        }
        case 'hazard': {
            // trapped passage: the SPIKE TRAP as a real sprite (rusty iron
            // row on a stone base) + acid-green sheen on the floor
            glowSpot(ctx, ax, ay - 10, 90, 'rgba(140,255,80,0.12)');
            await drawGroundedSprite(ctx, [GW_PROP_DIR], 'hazard_spikes.png', ax, ay, 110, { shadow: true });
            ctx.fillStyle = 'rgba(140,255,80,0.10)';
            ctx.beginPath(); ctx.ellipse(ax, ay - 6, 110, 22, 0, 0, Math.PI * 2); ctx.fill();
            break;
        }
        case 'lore': {
            // inscribed hall: the RUNE STELE as a real sprite (weathered
            // stone tablet, teal glyphs), warm glow band + motes kept
            glowSpot(ctx, ax, 360, 150, 'rgba(120,220,240,0.14)');
            await drawGroundedSprite(ctx, [GW_PROP_DIR], 'lore_stele.png', ax, ay, 175, { shadow: true });
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
            // world-thin hall: the shimmering RIFT as a real sprite standing
            // on the floor, cool glow pooling under it
            glowSpot(ctx, ax, ay - 60, 120, 'rgba(90,120,255,0.20)');
            await drawGroundedSprite(ctx, [GW_PROP_DIR], 'anomaly_rift.png', ax, ay, 230, { shadow: true });
            break;
        }
        case 'landmark': {
            // the landmark itself: the etched OBELISK as a real sprite
            const name = (typeof room.payload?.get === 'function' ? room.payload.get('landmarkName') : room.payload?.landmarkName) || '';
            glowSpot(ctx, ax, ay - 90, 110, 'rgba(200,210,255,0.10)');
            await drawGroundedSprite(ctx, [GW_PROP_DIR], 'landmark_obelisk.png', ax, ay, 260, { shadow: true });
            if (name) {
                ctx.fillStyle = 'rgba(243,236,217,0.85)';
                ctx.font = 'bold 15px "Cinzel", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(String(name).slice(0, 22), ax, ay - 276);
                ctx.textAlign = 'left';
            }
            break;
        }
        case 'secret': {
            if (!plan.enemies.length) {
                // hidden chamber: the RELIC PEDESTAL as a real sprite — the
                // prize stone with its glowing idol
                glowSpot(ctx, ax, ay - 40, 110, 'rgba(240,110,230,0.18)');
                await drawGroundedSprite(ctx, [GW_PROP_DIR], 'secret_relic.png', ax, ay, 150, { shadow: true });
            }
            break;
        }
        case 'puzzle': {
            // carved RUNE STONES flanking the mechanism (the board overlays
            // centre) — real sprites, mirrored for symmetry. Anchored just
            // OUTSIDE the encounter card's footprint (drawPuzzleOverlay now
            // centres a ~70% board: x 180-1020, y 135-765) so the stones read
            // as the mechanism's flanking pillars, never swallowed by it.
            for (const [gx, flip] of [[140, true], [1060, false]]) {
                await drawGroundedSprite(ctx, [GW_PROP_DIR], 'puzzle_rune.png', gx, 726, 118, { shadow: true, flip });
            }
            glowSpot(ctx, ax, ay - 40, 90, 'rgba(90,170,255,0.12)');
            break;
        }
        default: break; // combat/coop/core enemies arrive via plan.enemies
    }
}

// ── room-type label (caption-level; the on-image banner is GONE) ──
const TYPE_LABEL = {
    empty: 'QUIET HALL', combat: 'ENEMY PATROL', puzzle: 'SEALED MECHANISM',
    discovery: 'BURIED CACHE', reward: 'OLD-WORLD VAULT', hazard: 'TRAPPED PASSAGE',
    lore: 'INSCRIBED HALL', coop: 'GUARDIAN PACK', secret: 'HIDDEN CHAMBER',
    anomaly: 'WORLD-THIN HALL', landmark: 'LANDMARK', core: 'THE WORLD CORE',
    finale: 'THE WARDEN',
};

// ── ENCOUNTER CARD OVERLAY (owner ruins_fixes.txt #7, 2026-10-05) ──────
// The overlay used to ride UNDER the HUD panel (and behind the turn
// crystal) — the bottom-left panel visibly clipped the card. New rules:
//   • LAYERING: painted LAST — in front of the HUD, the pills, everything.
//   • SIZE: ~70% of the screen (840×630 on the 1200×900 canvas), centred.
//   • FOCUS: the whole scene dims behind the card (the room stays legible
//     underneath, but the card is unmistakably the focus).
async function drawPuzzleOverlay(ctx, boardBuf) {
    if (!boardBuf) return;
    // tolerate every IPC shape a Buffer can arrive in
    let buf = boardBuf;
    if (!Buffer.isBuffer(buf) && buf && buf.type === 'Buffer' && Array.isArray(buf.data)) buf = Buffer.from(buf.data);
    if (!Buffer.isBuffer(buf)) return;
    let img = null;
    try { img = await loadImage(buf); } catch (e) { return; }
    // dim backdrop — everything behind the card steps back
    ctx.save();
    ctx.fillStyle = 'rgba(6,5,10,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.restore();
    const pw = Math.round(W * 0.70), ph = Math.round(H * 0.70);
    const px = Math.round((W - pw) / 2), py = Math.round((H - ph) / 2);
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.65)'; ctx.shadowBlur = 22;
    ctx.fillStyle = 'rgba(16,14,10,0.94)';
    roundRect(ctx, px, py, pw, ph, 16); ctx.fill();
    ctx.restore();
    ctx.strokeStyle = 'rgba(255,210,74,0.75)'; ctx.lineWidth = 2;
    roundRect(ctx, px, py, pw, ph, 16); ctx.stroke();
    const scale = Math.min((pw - 24) / img.width, (ph - 24) / img.height);
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

// ── ROOM VISUAL VARIANTS (owner spec: five Ruins room variants) ────────────
// Modular overlay system (spec §7 prefers this over regenerating backgrounds):
// the door-plate stays the base; a seeded per-room ambience layer is painted
// on top. Variants NEVER touch the doorway mouths, chevrons, player/enemy
// zones, the compass or the HUD — they live on walls, wall-bases, ceiling and
// open floor seams. The variant is assigned per-room at event start (state.js)
// so a room always looks the SAME every time it is rendered.
const ROOM_VARIANTS = ['intact', 'mossy', 'cracked', 'skulls', 'overgrown', 'dim'];

// protected zones nothing decorative may enter (x, y, r)
function protectedZones(exits, playerSpot) {
    const base = playerSpot || {
        ...SPAWN_SPOTS[DEFAULT_ENTRY],
        h: perspH(SPAWN_SPOTS[DEFAULT_ENTRY].y),
    };
    const z = [
        { x: base.x, y: base.y - (base.h || 280) / 2, r: 190 },   // champion + over-head HUD
    ];
    for (const ex of exits) {
        if (!ex.edge) continue;
        const d = DOORS[ex.dir];
        if (d) z.push({ x: d.cx, y: d.cy, r: 150 });        // door mouths + chevrons
    }
    return z;
}

function zoneBlocked(zones, x, y, pad = 0) {
    for (const z of zones) if (Math.hypot(z.x - x, z.y - y) < z.r + pad) return true;
    return false;
}

// irregular blob (moss/lichen) — 3 overlapping ellipses + darker rim
function blob(ctx, x, y, s, color, rim) {
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.ellipse(x, y, s, s * 0.62, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x - s * 0.55, y + s * 0.16, s * 0.62, s * 0.4, 0.3, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.ellipse(x + s * 0.5, y - s * 0.12, s * 0.55, s * 0.36, -0.25, 0, Math.PI * 2); ctx.fill();
    if (rim) {
        ctx.fillStyle = rim;
        ctx.beginPath(); ctx.ellipse(x, y + s * 0.5, s * 0.8, s * 0.16, 0, 0, Math.PI * 2); ctx.fill();
    }
}

// branching crack — main vein with 1-2 forks, dark core + faint highlight
function crack(ctx, x, y, len, angle, gen, rng) {
    if (gen <= 0 || len < 8) return;
    const segs = 4 + rng.int(0, 2);
    let cx = x, cy = y, a = angle;
    ctx.strokeStyle = 'rgba(18,15,10,0.72)';
    ctx.lineWidth = Math.max(1.2, 2.6 - (3 - gen) * 0.7);
    ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(cx, cy);
    for (let i = 0; i < segs; i++) {
        a += (rng.next() - 0.5) * 0.7;
        cx += Math.cos(a) * (len / segs);
        cy += Math.sin(a) * (len / segs);
        ctx.lineTo(cx, cy);
    }
    ctx.stroke();
    if (gen > 1 && rng.next() < 0.8) crack(ctx, cx - Math.cos(a) * len * 0.3, cy - Math.sin(a) * len * 0.3, len * 0.5, a + 0.9 + rng.next(), gen - 1, rng);
    if (gen > 1 && rng.next() < 0.5) crack(ctx, cx, cy, len * 0.45, a - 1.1 - rng.next() * 0.4, gen - 1, rng);
}

// skull pile — 2-3 rounded craniums + scattered bones, sun-bleached
function skullPile(ctx, x, y, s) {
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    ctx.beginPath(); ctx.ellipse(0, 2, s * 1.25, s * 0.32, 0, 0, Math.PI * 2); ctx.fill();
    const BONE = 'rgba(206,196,164,0.92)';
    const BONE_D = 'rgba(140,128,100,0.85)';
    // bones first (behind)
    ctx.strokeStyle = BONE; ctx.lineWidth = Math.max(2, s * 0.13); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 1.1, -s * 0.1); ctx.lineTo(-s * 0.2, -s * 0.28); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(s * 0.3, -s * 0.05); ctx.lineTo(s * 1.15, -s * 0.2); ctx.stroke();
    // two craniums
    for (const [ox, oy, sc] of [[-s * 0.25, -s * 0.34, 1], [s * 0.55, -s * 0.22, 0.72]]) {
        ctx.fillStyle = BONE;
        ctx.beginPath(); ctx.arc(ox, oy, s * 0.42 * sc, Math.PI, 0); ctx.fill();
        ctx.fillRect(ox - s * 0.42 * sc, oy, s * 0.84 * sc, s * 0.30 * sc);
        ctx.fillStyle = BONE_D;
        ctx.beginPath(); ctx.arc(ox - s * 0.15 * sc, oy + s * 0.06 * sc, s * 0.09 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(ox + s * 0.15 * sc, oy + s * 0.06 * sc, s * 0.09 * sc, 0, Math.PI * 2); ctx.fill();
        ctx.fillRect(ox - s * 0.16 * sc, oy + s * 0.20 * sc, s * 0.32 * sc, s * 0.045 * sc);
    }
    ctx.restore();
}

// hanging vine — swaying chain of leaf pairs from the ceiling
function vine(ctx, x, topY, len, rng) {
    ctx.strokeStyle = 'rgba(64,92,44,0.9)';
    ctx.lineWidth = 2.2; ctx.lineCap = 'round';
    let vx = x, vy = topY;
    const segs = Math.max(3, Math.round(len / 26));
    const sway = rng.next() < 0.5 ? -1 : 1;
    ctx.beginPath(); ctx.moveTo(vx, vy);
    for (let i = 0; i < segs; i++) {
        vy += len / segs;
        vx += sway * (2 + rng.next() * 3.2);
        ctx.lineTo(vx, vy);
    }
    ctx.stroke();
    for (let i = 0; i < segs; i += 1) {
        const lx = vx - sway * (segs - i) * (len / segs) * 0.18;
        const ly = topY + (i + 0.6) * (len / segs);
        ctx.fillStyle = i % 2 ? 'rgba(74,108,48,0.88)' : 'rgba(58,88,40,0.9)';
        ctx.beginPath(); ctx.ellipse(lx - 5, ly, 5.4, 2.6, -0.5, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(lx + 5, ly, 5.4, 2.6, 0.5, 0, Math.PI * 2); ctx.fill();
    }
}

function variantOfRoom(room) {
    const v = room && (typeof room.variant?.get === 'function' ? undefined : room.variant);
    return ROOM_VARIANTS.includes(v) ? v : 'intact';
}

// the ambience layer itself — drawn AFTER tint, BEFORE props/enemies/player
function drawVariantOverlay(ctx, room, exits, seedStr, playerSpot) {
    const variant = variantOfRoom(room);
    if (variant === 'intact') return;
    const rng = mapEngine.makeRng(`${seedStr}:variant:${variant}`);
    const zones = protectedZones(exits, playerSpot);
    const trySpot = (band, pad = 26) => {
        for (let t = 0; t < 14; t++) {
            const x = band.x0 + rng.next() * (band.x1 - band.x0);
            const y = band.y0 + rng.next() * (band.y1 - band.y0);
            if (!zoneBlocked(zones, x, y, pad)) return { x, y };
        }
        return null;
    };
    // safe bands: upper back wall, side walls, wall-base strip, open floor-left seam
    const BANDS = {
        upperWall: { x0: 260, x1: 940, y0: 70, y1: 225 },
        wallBaseL: { x0: 60, x1: 250, y0: 585, y1: 640 },
        wallBaseR: { x0: 950, x1: 1140, y0: 585, y1: 640 },
        floorL: { x0: 430, x1: 690, y0: 590, y1: 680 },
        ceiling: { x0: 200, x1: 1000, y0: 0, y1: 26 },
        sideWallL: { x0: 30, x1: 120, y0: 300, y1: 480 },
        sideWallR: { x0: 1080, x1: 1170, y0: 300, y1: 480 },
    };

    if (variant === 'mossy') {
        const MOSS = ['rgba(86,116,58,0.5)', 'rgba(70,100,48,0.55)', 'rgba(96,124,64,0.42)'];
        const RIM = 'rgba(44,64,30,0.28)';
        for (const b of [BANDS.upperWall, BANDS.wallBaseL, BANDS.wallBaseR, BANDS.floorL]) {
            const n = b === BANDS.upperWall ? 4 : 2;
            for (let i = 0; i < n; i++) {
                const p = trySpot(b);
                if (!p) continue;
                blob(ctx, p.x, p.y, 14 + rng.next() * 26, MOSS[Math.floor(rng.next() * MOSS.length)], RIM);
            }
        }
    } else if (variant === 'cracked') {
        for (const b of [BANDS.upperWall, BANDS.sideWallL, BANDS.sideWallR, BANDS.floorL]) {
            const n = b === BANDS.upperWall ? 3 : 2;
            for (let i = 0; i < n; i++) {
                const p = trySpot(b, 34);
                if (!p) continue;
                crack(ctx, p.x, p.y, 34 + rng.next() * 46, rng.next() * Math.PI * 2, 3, rng);
            }
        }
        // fallen dust under a crack
        const p = trySpot(BANDS.floorL);
        if (p) { ctx.fillStyle = 'rgba(120,110,90,0.20)'; ctx.beginPath(); ctx.ellipse(p.x, p.y, 30, 7, 0, 0, Math.PI * 2); ctx.fill(); }
    } else if (variant === 'skulls') {
        for (const b of [BANDS.wallBaseL, BANDS.wallBaseR, BANDS.floorL]) {
            const p = trySpot(b, 30);
            if (p) skullPile(ctx, p.x, p.y, 13 + rng.next() * 9);
        }
    } else if (variant === 'overgrown') {
        for (let i = 0; i < 4; i++) {
            const x = BANDS.ceiling.x0 + rng.next() * (BANDS.ceiling.x1 - BANDS.ceiling.x0);
            if (x > 520 && x < 680) continue; // keep the N arch head clear
            vine(ctx, x, 0, 90 + rng.next() * 130, rng);
        }
        const p = trySpot(BANDS.wallBaseL);
        if (p) blob(ctx, p.x, p.y, 18 + rng.next() * 16, 'rgba(74,104,50,0.45)', 'rgba(44,64,30,0.22)');
        const p2 = trySpot(BANDS.wallBaseR);
        if (p2) blob(ctx, p2.x, p2.y, 16 + rng.next() * 14, 'rgba(70,98,46,0.42)', null);
    } else if (variant === 'dim') {
        // cool dark grade + one deeper torch pool; keeps all geometry readable
        ctx.fillStyle = 'rgba(10,10,26,0.22)';
        ctx.fillRect(0, 0, W, H);
        const g = ctx.createRadialGradient(600, 400, 60, 600, 400, 560);
        g.addColorStop(0, 'rgba(255,180,90,0.05)');
        g.addColorStop(1, 'rgba(4,4,14,0.30)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);
    }
}

// ── main render (in worker; plan is computed by the parent) ──
// opts: { exits?, prefix, puzzleBoard?(Buffer), labelOverride?, style?, plan? }
async function _renderInProcess(eventDoc, player, room, opts = {}) {
    ensureFonts();
    const exits = opts.exits || exitsFor(eventDoc, player);
    const bg = await plateFor(exits, `${eventDoc.seed}:${room.key}`);
    const plan = opts.plan || planFor(eventDoc, player, room, exits);
    const battle = opts.battle || null;

    // ⚔️ BATTLE-IN-THE-ROOM (owner directive 2026-10-05 23:39Z: "the battle
    // system should happen directly on top of that existing room scene"):
    // the fight re-uses THIS EXACT scene — only live state layers on. The
    // champion's pools feed the HUD, dead enemies simply leave the scene
    // (no pose swap, no corpse sprite), and the active actor is ringed.
    if (battle) {
        if (battle.player) {
            plan.hud.hp = Math.max(0, Math.floor(battle.player.hp ?? plan.hud.hp));
            plan.hud.maxHp = Math.max(1, Math.floor(battle.player.maxHp ?? plan.hud.maxHp));
            plan.hud.energy = Math.max(0, Math.floor(battle.player.energy ?? 0));
            plan.hud.maxEnergy = Math.max(1, Math.floor(battle.player.maxEnergy ?? 1));
            if (battle.player.state) plan.hud.state = String(battle.player.state).slice(0, 24);
        }
        if (Array.isArray(battle.enemyStates) && battle.enemyStates.length) {
            plan.enemies = (plan.enemies || [])
                .map((e, i) => ({ ...e, st: battle.enemyStates[i] || null }))
                .filter((e) => (e.st ? e.st.alive !== false : true));
            const ai = battle.active;
            if (typeof ai === 'number' && ai >= 0 && battle.enemyStates[ai]?.alive) {
                const target = plan.enemies.find((e) => e.st === battle.enemyStates[ai]);
                if (target) target.active = true;
            }
        }
    }
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');

    // 1) the world
    ctx.drawImage(bg, 0, 0, W, H);
    drawTint(ctx, room);
    if (room.state === 'CLEARED') drawClearedWash(ctx);
    // 1b) the room's persistent visual variant (moss/cracks/skulls/vines/dim)
    drawVariantOverlay(ctx, room, exits, `${eventDoc.seed}:${room.key}`, plan.playerSpot);

    // 2) ambient props (under everything alive)
    for (const prop of plan.props || []) drawProp(ctx, prop.kind, prop.x, prop.y, prop.s);

    // 3) room-type content (payload presentation — enemies drawn below)
    await drawRoomContent(ctx, room, plan);

    // 4) the SEEDED enemy pack (combat/coop/core/boss) + other players —
    // depth-ordered so nearer packs overlap farther ones naturally. The
    // active actor collects a crystal job instead of an inline marker — the
    // crystal pass paints LAST so it hovers over pills and bars.
    const SEARCH_DIRS = [ENEMY_DIR, path.join(CHAR_DIR, 'clean'), CHAR_DIR];
    const crystalJobs = [];
    const actors = [...(plan.enemies || []), ...(plan.mates || []), ...(plan.rivals || [])].sort((a, b) => a.y - b.y);
    for (const e of actors) {
        const drawn = await drawGroundedSprite(ctx, SEARCH_DIRS, e.file, e.x, e.y, e.h, { flip: !!e.flip, shadow: true });
        if (e.active && drawn) crystalJobs.push({ cx: e.x, headTop: e.y - e.h, spriteH: e.h, clearance: 40 });
    }

    // 5) the champion — ASSIGNED sprite, grounded at their ENTRY-DOOR spot,
    // facing AWAY from that door into the room (owner directive
    // 2026-10-05 23:39Z) + the crystal when it's their beat
    const spot = plan.playerSpot;
    const drawnMe = await drawGroundedSprite(ctx, [path.join(CHAR_DIR, 'clean'), CHAR_DIR], plan.spriteFile, spot.x, spot.y, spot.h, { shadow: true, flip: !!spot.flip });
    if (battle && battle.active === 'player' && drawnMe) crystalJobs.push({ cx: spot.x, headTop: spot.y - spot.h, spriteH: spot.h, clearance: 78 });

    // 6) exit chevrons at the arches (yellow — §9)
    drawExitArrows(ctx, exits);

    // 7) DEFAULT-ENCOUNTER over-head HUD (name pill + segmented bars +
    // state/turn pill) — the owner LIKES this ("keep that", 23:39Z); in
    // battle it carries the live combat pools and the turn counter.
    drawOverheadHud(ctx, plan);

    // 7b) enemy over-head plates — the default-encounter language: name
    // pill (battle only) + segmented HP bar over every LIVING enemy. On
    // the pre-fight intro they show full bars (the pack at full strength).
    for (const e of plan.enemies || []) {
        const st = e.st || null;
        const hpMax = Math.max(1, Math.floor(st?.maxHp || 100));
        const hp = st ? Math.max(0, Math.floor(st.hp)) : hpMax;
        const headTop = e.y - e.h;
        const showName = !!(battle && st?.name);
        if (showName) pill(ctx, e.x, headTop - 25, String(st.name).slice(0, 22), 'bold 11px sans-serif', 9,
            'rgba(26,21,13,0.95)', 'rgba(61,48,19,0.95)', '#FFFFFF');
        segBar(ctx, e.x, showName ? headTop - 11 : headTop - 14, e.boss ? 126 : 94, 9, hp / hpMax, '#d63c14', '#f59d2a');
    }

    // 8) THE DEFAULT ENCOUNTER HUB — the codebase's own player_state panel
    // (real ui assets, renderer.go geometry), topmost layer like the
    // default encounter's; battle renders feed it live pools.
    await drawHudPanel(ctx, plan.hud);

    // 9) THE FLOATING BLUE CRYSTAL — the DEFAULT turn indicator — painted
    // above the active actor's whole HUD stack
    for (const j of crystalJobs) await drawTurnCrystal(ctx, j.cx, j.headTop, j.spriteH, j.clearance);

    // 10) ENCOUNTER CARD OVERLAY — LAST (owner ruins_fixes.txt #7): in
    // front of the HUD and everything else, ~70% of the screen, centred,
    // scene dimmed behind it.
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
    DOORS, SPAWN_SPOTS, DEFAULT_ENTRY, ENTRY_FLIP, entryDirOf, perspH, TYPE_LABEL,
    planFor, hudFor, resolvePlayerSpriteFile, ENEMY_POOL, BOSS_POOL,
    ROOM_VARIANTS, variantOfRoom, ensureFonts, facingForSpot, HUB_ZONE,
};
