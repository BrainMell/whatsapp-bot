// 🪙 proof montage: consumable encounter lifecycle — ACTIVE → FRESH (looter present) → LOOTED (any return)
// 3 types × 3 states, labeled, for the owner's review.
process.env.GW_TEST = '1';
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
    process.env.MONGO_URI = uri;
    await require('mongoose').connect(uri, { serverSelectionTimeoutMS: 8000 });
}

const GW = '/core/rpg/guildWar';
const state = require(`..${GW}/state`);
const roomScene = require(`..${GW}/roomScene`);
const rooms = require(`..${GW}/rooms`);

(async () => {
    await connectDB();
    if (typeof roomScene.ensureFonts === 'function') await roomScene.ensureFonts();
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateMany({ state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE'] } }, { $set: { state: 'COMPLETED' } });
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'lootproof@g.us', initiatedBy: 'owner' });
    await state.registerPlayer(created.event.eventId, { jid: 'proof@s.whatsapp.net', name: 'Proof', guildId: 'Proof', guildName: 'Proof' });
    const started = await state.startEvent(created.event.eventId);
    const ev = started.event;
    const eventId = ev.eventId;
    const JID = 'proof@s.whatsapp.net';

    const TYPES = [
        ['discovery', 'BURIED CACHE — dig'],
        ['reward', 'OLD-WORLD VAULT — take'],
        ['secret', 'HIDDEN CHAMBER — claim'],
    ];
    const picks = [];
    const pool = ev.rooms.filter((r) => !['core', 'finale'].includes(r.type));
    for (const [type] of TYPES) {
        const room = pool[picks.length * 2];
        await GuildWarEvent.updateOne(
            { eventId, rooms: { $elemMatch: { key: room.key } } },
            { $set: { 'rooms.$.type': type, 'rooms.$.state': 'ACTIVE' } });
        picks.push({ type, key: room.key });
    }

    const shots = [];
    for (const { type, key } of picks) {
        // ACTIVE
        await GuildWarEvent.updateOne({ eventId, rooms: { $elemMatch: { key } } }, { $set: { 'rooms.$.state': 'ACTIVE' }, $unset: { 'rooms.$.lootFresh': '', 'rooms.$.clearedBy': '' } });
        await state.updatePlayer(eventId, JID, {}, { roomId: key, prevRoomId: key });
        await rooms.enterRoom(eventId, JID, null, key);
        let doc = await state.getEvent(eventId, { fresh: true });
        let me = doc.players.find((p) => p.jid === JID);
        let room = doc.rooms.find((r) => r.key === key);
        shots.push([`${type}:active`, await roomScene._renderInProcess(doc, me, room, { prefix: '.' })]);

        // FRESH (just claimed, looter present)
        await GuildWarEvent.updateOne({ eventId, rooms: { $elemMatch: { key } } }, { $set: { 'rooms.$.state': 'CLEARED', 'rooms.$.lootFresh': true, 'rooms.$.clearedBy': JID } });
        doc = await state.getEvent(eventId, { fresh: true });
        me = doc.players.find((p) => p.jid === JID);
        room = doc.rooms.find((r) => r.key === key);
        shots.push([`${type}:fresh`, await roomScene._renderInProcess(doc, me, room, { prefix: '.' })]);

        // LOOTED (after the looter left — lootFresh flipped by the exit pipeline)
        await rooms.enterRoom(eventId, JID, key, picks.find((p) => p.key !== key).key);
        await rooms.enterRoom(eventId, JID, picks.find((p) => p.key !== key).key, key); // come back
        await GuildWarEvent.updateOne({ eventId, rooms: { $elemMatch: { key } } }, { $set: { 'rooms.$.state': 'CLEARED' }, $unset: { 'rooms.$.lootFresh': '', 'rooms.$.clearedBy': '' } });
        doc = await state.getEvent(eventId, { fresh: true });
        me = doc.players.find((p) => p.jid === JID);
        room = doc.rooms.find((r) => r.key === key);
        shots.push([`${type}:looted`, await roomScene._renderInProcess(doc, me, room, { prefix: '.' })]);
    }

    // assemble 3×3 montage with labels
    const CW = 600, CH = 450, LBL = 46;
    const W = CW * 3, H = (CH + LBL) * 3 + 70;
    const c = createCanvas(W, H);
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b0910'; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#f3ecdf'; ctx.font = 'bold 30px "Cinzel", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('CONSUMABLE LOOT — despawns on leave, LOOTED marker stays', W / 2, 44);
    const COLS = ['ACTIVE (untouched)', 'FRESH — looter in room', 'AFTER — anyone returns'];
    for (let i = 0; i < shots.length; i++) {
        const [tag, buf] = shots[i];
        const col = i % 3, row = (i / 3) | 0;
        const x = col * CW, y = 70 + row * (CH + LBL);
        const img = await loadImage(buf);
        ctx.save();
        ctx.beginPath(); ctx.rect(x, y, CW, CH + LBL); ctx.clip();
        ctx.fillStyle = '#141018'; ctx.fillRect(x, y, CW, CH + LBL);
        const s = Math.max(CW / img.width, CH / img.height);
        ctx.drawImage(img, x + (CW - img.width * s) / 2, y + LBL + (CH - img.height * s) / 2, img.width * s, img.height * s);
        ctx.fillStyle = row === 0 ? '#8fd0ff' : row === 1 ? '#ffd24a' : '#ff9d6b';
        ctx.font = 'bold 19px "Cinzel", sans-serif'; ctx.textAlign = 'left';
        ctx.fillText(COLS[col].toUpperCase(), x + 14, y + 30);
        ctx.fillStyle = 'rgba(255,255,255,0.55)'; ctx.font = '13px sans-serif';
        ctx.fillText(tag, x + CW - 10 - ctx.measureText(tag).width, y + 30);
        ctx.restore();
        ctx.strokeStyle = 'rgba(255,210,74,0.25)'; ctx.strokeRect(x + 1, y + 1, CW - 2, CH + LBL - 2);
    }
    const out = '/home/z/my-project/download/gw_loot_despawn_proof.png';
    fs.writeFileSync(out, c.toBuffer('image/png'));
    console.log('montage →', out);
    await require('mongoose').disconnect();
})().catch((e) => { console.error(e); process.exit(1); });
