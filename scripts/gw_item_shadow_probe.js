#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// gw_item_shadow_probe.js — renders every ITEM scene (props that sit on the
// floor) with a synthetic plan → 3x nearest-neighbour zoom crops of the item
// + its shadow zone. BEFORE/AFTER evidence for the "items float on their own
// shadows" fix (owner 2026-10-06 "the item shadows are literally making it
// look like the things are floating").
//
// Usage: node scripts/gw_item_shadow_probe.js <outDir>
//   e.g. ... gw_item_shadow_before   (pre-fix)
//        ... gw_item_shadow_after    (post-fix)
// ─────────────────────────────────────────────────────────────────────────────
const fs = require('fs');
const path = require('path');

// test DB (never touches live data)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
    }
}
const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
process.env.MONGO_URI = uri;
process.env.GW_TEST = '1';

const GW = '/core/rpg/guildWar';
const state = require(`..${GW}/state`);
const rooms = require(`..${GW}/rooms`);
const roomScene = require(`..${GW}/roomScene`);

const OUT = process.argv[2] || 'gw_item_shadow_probe';
const OUT_DIR = OUT.startsWith('/') ? OUT : path.join('/home/z/my-project/download', OUT);

// item anchor with playerSpot.x=200 → ax=820, ay=700 (HUB_ZONE.x1=530 → no lift)
const CX = 820, AY = 700;
const CROP = { x: 610, y: 430, w: 420, h: 380 };
const ZOOM = 3;

const SCENES = [
    { tag: 'd_active', type: 'discovery', state: 'ACTIVE' },
    { tag: 'd_fresh',  type: 'discovery', state: 'CLEARED', lootFresh: true },
    { tag: 'd_looted', type: 'discovery', state: 'CLEARED', lootFresh: false },
    { tag: 'r_active', type: 'reward',    state: 'ACTIVE' },
    { tag: 'r_fresh',  type: 'reward',    state: 'CLEARED', lootFresh: true },
    { tag: 'r_looted', type: 'reward',    state: 'CLEARED', lootFresh: false },
    { tag: 's_fresh',  type: 'secret',    state: 'CLEARED', lootFresh: true },
    { tag: 's_looted', type: 'secret',    state: 'CLEARED', lootFresh: false },
    { tag: 'h_active', type: 'hazard',    state: 'ACTIVE' },
    { tag: 'l_active', type: 'lore',      state: 'ACTIVE' },
    { tag: 'p_active', type: 'puzzle',    state: 'ACTIVE', crop: { x: 880, y: 560, w: 320, h: 270 }, anchor: [1060, 726] },
];

async function main() {
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[probe] test db: ${mongoose.connection.name}`);
    const GuildWarEvent = require('../core/models/GuildWarEvent');

    await GuildWarEvent.updateMany({ state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } }, { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: `shadqa-${Date.now()}@g.us`, initiatedBy: 'owner' });
    const eventId = created.event.eventId;
    const JID = 'shadow0@s.whatsapp.net';
    await state.registerPlayer(eventId, { jid: JID, name: 'Shadow', guildId: 'ShQ', guildName: 'ShQ' });
    const started = await state.startEvent(eventId);
    if (!started.ok) throw new Error('startEvent failed: ' + started.reason);
    const ev = started.event;
    const target = ev.rooms.find((r) => !['core', 'finale'].includes(r.type) && r.key !== ev.rooms.find((q) => q.type === 'core')?.key);

    // seat the probe player in the target room (no router cooldowns)
    await state.updatePlayer(eventId, JID, {}, { roomId: target.key, prevRoomId: target.key, lastMoveAt: 0 });
    await rooms.enterRoom(eventId, JID, null, target.key);

    fs.mkdirSync(OUT_DIR, { recursive: true });

    for (const sc of SCENES) {
        const set = { 'rooms.$.type': sc.type, 'rooms.$.state': sc.state };
        if (sc.lootFresh === true) set['rooms.$.lootFresh'] = true;
        else if (sc.lootFresh === false) set['rooms.$.lootFresh'] = false;
        await GuildWarEvent.updateOne({ eventId, rooms: { $elemMatch: { key: target.key } } }, { $set: set });

        const doc = await state.getEvent(eventId, { fresh: true });
        const me = doc.players.find((p) => p.jid === JID);
        const room = doc.rooms.find((r) => r.key === target.key);
        const plan = {
            playerSpot: { x: 200, y: 700, h: 210, flip: false, spriteFile: 'Rogue_(1).png' },
            enemies: [], mates: [], rivals: [], props: [],
            hud: { name: 'Shadow', hp: 82, maxHp: 100, energy: 45, maxEnergy: 100, state: 'EXPLORING' },
        };
        const img = await roomScene._renderInProcess(doc, me, room, { plan });
        const { createCanvas, loadImage } = require('canvas');
        const src = await loadImage(img);
        const cr = sc.crop || CROP;
        // 3x nearest-neighbour zoom, with a 2px magenta tick marking the item
        // BASE line (anchor y) in the crop margin so the geometry is readable
        const c = createCanvas(cr.w * ZOOM, cr.h * ZOOM);
        const ctx = c.getContext('2d');
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(src, cr.x, cr.y, cr.w, cr.h, 0, 0, cr.w * ZOOM, cr.h * ZOOM);
        if (sc.anchor) {
            const [ax, ay] = sc.anchor;
            ctx.fillStyle = 'rgba(255,0,255,0.85)';
            ctx.fillRect((ax - cr.x) * ZOOM - 14, (ay - cr.y) * ZOOM - 1, 10, 2);
            ctx.fillRect((ax - cr.x) * ZOOM + 4, (ay - cr.y) * ZOOM - 1, 10, 2);
        } else {
            ctx.fillStyle = 'rgba(255,0,255,0.85)';
            ctx.fillRect((CX - cr.x) * ZOOM - 14, (AY - cr.y) * ZOOM - 1, 10, 2);
            ctx.fillRect((CX - cr.x) * ZOOM + 4, (AY - cr.y) * ZOOM - 1, 10, 2);
        }
        fs.writeFileSync(path.join(OUT_DIR, `${sc.tag}.png`), c.toBuffer('image/png'));
        console.log(`[probe] ${sc.tag} → ${path.join(OUT_DIR, sc.tag + '.png')}`);
    }

    await mongoose.disconnect();
    console.log('[probe] done');
}

main().catch((e) => { console.error(e); process.exit(1); });
