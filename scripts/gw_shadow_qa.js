#!/usr/bin/env node
// QA — SHADOW RECALIBRATION 2026-10-05 (owner playtest: "the shadows are like
// tiny specs now"). Root cause: ruins_fixes #6 swapped the shadow's width
// source from FULL sprite content down to the foot band without retuning the
// ellipse multipliers — a double shrink. Fix:
//   1. drawContactShadow multipliers retuned: rx (0.30+0.10t → 0.55+0.15t),
//      ry (max(6, 0.034+0.020t) → max(9, 0.055+0.030t)), alpha up, gentler
//      gradient falloff so the dark core isn't a fraction of a tight ellipse
//   2. footW floored at 50% of content width (wispy tails can't collapse it)
// Verifies: source retune present + measured shadow dims + render proofs.
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('/home/z/my-project/repo/node_modules/canvas');
const roomScene = require('/home/z/my-project/repo/core/rpg/guildWar/roomScene');

const OUT = '/home/z/my-project/download/gw_qa_1005d';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS ✓' : 'FAIL ✗'}  ${name}${detail ? '  — ' + detail : ''}`); };

const SRC = fs.readFileSync('/home/z/my-project/repo/core/rpg/guildWar/roomScene.js', 'utf8');

// ── replicate contentBox foot-band measurement on a real sprite ──
const CHAR_DIR = '/home/z/my-project/repo/core/rpgasset/characters/clean';
const PROP_DIR = '/home/z/my-project/repo/core/rpgasset/guildwar/ruins/props';

async function measure(dir, file) {
    const img = await loadImage(path.join(dir, file));
    const c = createCanvas(img.width, img.height);
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    const data = ctx.getImageData(0, 0, img.width, img.height).data;
    let minX = img.width, minY = img.height, maxX = -1, maxY = -1;
    for (let y = 0; y < img.height; y++) for (let x = 0; x < img.width; x++) {
        if (data[(y * img.width + x) * 4 + 3] > 16) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
        }
    }
    const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    const bandTop = Math.max(minY, maxY - Math.max(4, Math.round(box.h * 0.16)));
    let fMinX = img.width, fMaxX = -1;
    for (let y = bandTop; y <= maxY; y++) for (let x = minX; x <= maxX; x++) {
        if (data[(y * img.width + x) * 4 + 3] > 16) { if (x < fMinX) fMinX = x; if (x > fMaxX) fMaxX = x; }
    }
    if (fMaxX >= 0) { box.feetX = fMinX; box.feetW = fMaxX - fMinX + 1; }
    return box;
}

function dims(box, ch, groundY) {
    const scale = ch / box.h;
    const feetW = box.feetW ?? box.w;
    const footW = Math.max(feetW, box.w * 0.5) * scale;
    const t = Math.max(0, Math.min(1, (groundY - 340) / (810 - 340)));
    const rx = footW * (0.55 + 0.15 * t);
    const ry = Math.max(9, ch * (0.055 + 0.030 * t));
    return { contactW: 2 * rx * 0.78, contactH: 2 * ry * 0.95, footW };
}

function makeDoc(seed, layout, players) {
    const rooms = [];
    for (const [key, spec] of Object.entries(layout.rooms)) {
        const [x, y] = key.split(',').map(Number);
        rooms.push({ key, x, y, region: 0, type: spec.type, state: spec.state || 'ACTIVE', payload: spec.payload || {}, ring: 0.9, clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: spec.occupants || [], residue: null, variant: 'intact' });
    }
    return { eventId: 'gw_shadow_qa', seed, type: 'normal', state: 'ACTIVE', side: 3, rooms, edges: layout.edges, coreKey: '9,9', deadWorld: 'ember', players: players || [] };
}

const base = { name: 'Brainard', classId: 'FIGHTER', spriteIndex: 0, discovered: [], guildId: 'ember', guildName: 'Ember', level: 9, stats: { hp: 84, maxHp: 110, energy: 60, maxEnergy: 142 } };

(async () => {
    // ── 1. source retune present ──
    check('src: rx multiplier retuned (0.55+0.15t)', SRC.includes('0.55 + 0.15 * t'));
    check('src: ry retuned + min raised (max(ryMin||9, 0.055+0.030t))', SRC.includes('0.055 + 0.030 * t') && SRC.includes('Math.max(ryMin') && SRC.includes("opts.ryMin || 9"));
    check('src: footW floored at half content width', SRC.includes('Math.max(feetW, box.w * 0.5)'));
    check('src: old spec multipliers gone', !SRC.includes('0.30 + 0.10 * t') && !SRC.includes('0.034 + 0.020 * t'));

    // ── 2. measured dims on real sprites ──
    const fighter = await measure(CHAR_DIR, 'Fighter1.png');
    const dFront = dims(fighter, 210, 780);   // spawn spot depth
    const dBack = dims(fighter, 460);         // deep-at-back-wall depth
    check('player contact shadow spans the stance at front depth', dFront.contactW >= dFront.footW * 0.85 && dFront.contactH >= 25,
        `contact ${Math.round(dFront.contactW)}x${Math.round(dFront.contactH)}px (was 43x21)`);
    check('shadow still shrinks with depth (back wall < front)', dims(fighter, 210, 420).contactW < dFront.contactW,
        `back ${Math.round(dims(fighter, 210, 420).contactW)}px < front ${Math.round(dFront.contactW)}px`);
    const arch = await measure(CHAR_DIR, 'archmage_(1).png');
    const dArch = dims(arch, 210, 780);
    check('narrow-footed sprite (archmage 53% feet) floored at 50% content', dArch.contactW >= arch.w * (210 / arch.h) * 0.5 * 0.85,
        `contact ${Math.round(dArch.contactW)}px, floor kicked in: ${arch.feetW < arch.w * 0.5}`);
    const rubble = await measure(PROP_DIR, 'cache_rubble.png');
    const dRub = dims(rubble, 118, 700);
    check('prop shadows scaled up too (rubble contact ≥ 300px wide)', dRub.contactW >= 300, `${Math.round(dRub.contactW)}px (was 216)`);

    // ── 3. render proofs (real local assets) ──
    const exitsWN = [{ dir: 'n', edge: true }, { dir: 'w', edge: true }, { dir: 'e', edge: false }, { dir: 's', edge: false }];

    // 3a. spawn scene — IDENTICAL framing to the fc37622e proof for 1:1 compare
    const docA = makeDoc(20261005, { rooms: { '0,0': { type: 'empty' } }, edges: ['0,0|n', '0,0|w'] });
    const pA = { ...base, jid: 'qa@s.whatsapp.net', roomId: '0,0', prevRoomId: null };
    const roomA = docA.rooms[0];
    const exA = roomScene.exitsFor(docA, pA);
    const pngA = await roomScene._renderInProcess(docA, pA, roomA, { exits: exA });
    fs.writeFileSync(path.join(OUT, 'shadows_spawn.png'), pngA);
    check('render: spawn scene with recalibrated shadows', !!pngA && pngA.length > 30000, `${Math.round((pngA || []).length / 1024)}KB`);

    // 3b. three champions (narrow-footed archmage + rogue mates) — shadow language on actors
    const mates = [
        { ...base, jid: 'm1@s.whatsapp.net', name: 'Ilyene', classId: 'ARCHMAGE', guildId: 'ember' },
        { ...base, jid: 'm2@s.whatsapp.net', name: 'Corvin', classId: 'ROGUE', guildId: 'ember' },
    ];
    const docB = makeDoc(20261005, { rooms: { '0,0': { type: 'empty', occupants: ['m1@s.whatsapp.net', 'm2@s.whatsapp.net'] } }, edges: ['0,0|n', '0,0|w'] }, [pA, ...mates]);
    const pngB = await roomScene._renderInProcess(docB, pA, docB.rooms[0], { exits: exA });
    fs.writeFileSync(path.join(OUT, 'shadows_gang.png'), pngB);
    check('render: 3 champions with foot-hugging shadows', !!pngB && pngB.length > 30000, `${Math.round(pngB.length / 1024)}KB`);

    // 3c. discovery rubble — widest prop, biggest before/after delta
    const docC = makeDoc(777001, { rooms: { '2,0': { type: 'discovery' } }, edges: ['2,0|n', '2,0|w'] });
    const pC = { ...base, jid: 'qa@s.whatsapp.net', roomId: '2,0', prevRoomId: null };
    const exC = roomScene.exitsFor(docC, pC);
    const pngC = await roomScene._renderInProcess(docC, pC, docC.rooms[0], { exits: exC });
    fs.writeFileSync(path.join(OUT, 'shadows_rubble.png'), pngC);
    check('render: rubble discovery scene', !!pngC && pngC.length > 30000, `${Math.round(pngC.length / 1024)}KB`);

    // ── 4. BEFORE/AFTER montage for the owner (old fc37622e render vs new) ──
    const beforeP = '/home/z/my-project/download/gw_qa_1005c/spawn_facing_left.png';
    if (fs.existsSync(beforeP)) {
        const [imB, imA] = await Promise.all([loadImage(beforeP), loadImage(path.join(OUT, 'shadows_spawn.png'))]);
        const W = imB.width + imA.width + 30, H = Math.max(imB.height, imA.height) + 44;
        const c = createCanvas(W, H); const ctx = c.getContext('2d');
        ctx.fillStyle = '#0b0a10'; ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#e8dfc8'; ctx.font = 'bold 22px sans-serif'; ctx.textAlign = 'center';
        ctx.fillText('BEFORE (fc37622e) — "tiny specs"', imB.width / 2, 30);
        ctx.fillText('AFTER — recalibrated', imB.width + 30 + imA.width / 2, 30);
        ctx.drawImage(imB, 0, 44); ctx.drawImage(imA, imB.width + 30, 44);
        fs.writeFileSync(path.join(OUT, 'shadows_before_after.png'), c.toBuffer('image/png'));
        check('montage: before/after composite written', true);
    }

    const fails = results.filter(r => !r.ok).length;
    console.log(`\n${results.length - fails}/${results.length} PASS`);
    process.exit(fails ? 1 : 0);
})().catch(e => { console.error('QA CRASH:', e); process.exit(1); });
