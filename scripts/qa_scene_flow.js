// ============================================
// 🧪 QA: encounter scene flow — every ruins room type through the real
// dmRouter path at production head. Real Go renders (localhost:7860).
// Run on box: node scripts/qa_scene_flow.js
// ============================================
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');

async function connectDB() {
    const envPath = fs.existsSync(path.join(__dirname, '..', '.env')) ? path.join(__dirname, '..', '.env') : '/home/ubuntu/whatsapp-bot/.env';
    const env = {};
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) env[m[1]] = m[2];
    }
    let uri = env.MONGO_URI || env.MONGODB_URI || env.MONGO_URL || env.DATABASE_URL;
    if (!uri) throw new Error('No Mongo URI in env');
    uri = uri.replace(/\/([^/?]+)(\?|$)/, '/gwtest$2');
    process.env.MONGO_URI = uri;
    const connectDB = require('../db');
    await connectDB();
    const mongoose = require('mongoose');
    console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
}

const checks = [];
function check(name, cond, detail = '') {
    checks.push({ name, ok: !!cond });
    console.log(`${cond ? 'PASS' : 'FAIL'} ${name}${detail ? ` :: ${detail}` : ''}`);
}

async function main() {
    await connectDB();
    const guilds = require('../core/rpg/guilds');
    for (const [name, owner] of [['GwQaOne', 'p1@s.whatsapp.net'], ['GwQaTwo', 'p2@s.whatsapp.net']]) {
        try { await guilds.createGuild(name, owner, 'ADVENTURER'); } catch (e) {}
    }
    const gw = require('../core/rpg/guildWar');
    const { state } = gw;
    const engine = require('../core/engine');
    engine.isBotOwner = () => true;
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    await GuildWarEvent.updateMany({ state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE', 'REWARDS'] } }, { $set: { state: 'ARCHIVED' } });

    const sent = [];
    const sock = { sendMessage: async (chatId, msg) => { sent.push({ chatId, msg }); }, groupMetadata: async () => ({ participants: [] }) };

    // ── dynamic prefix check on a text path BEFORE the war starts ──
    sent.length = 0;
    try {
        await gw.handleGroupCommand(sock, 'qa@g.us', 'owner@s.whatsapp.net', 'Owner', ['rpg', 'status'], { prefix: '.s' });
    } catch (e) { console.log('[qa] rpg status threw:', e.message); }
    console.log('[qa] sends after rpg status:', sent.length);
    const rpgText = JSON.stringify(sent.map((s) => s.msg.text || s.msg.caption || ''));
    check('prefix: dynamic .s in rpg status', rpgText.includes('.s gw rpg on') && !rpgText.includes('.j gw'), rpgText.slice(0, 160));
    console.log('[qa] rpg status sends:', sent.length, 'first keys:', sent[0] ? Object.keys(sent[0].msg).join(',') : 'none');

    // ── boot a war: start → join → forcestart ──
    for (const [who, args] of [['owner@s.whatsapp.net', ['start']], ['p1@s.whatsapp.net', ['join']], ['p2@s.whatsapp.net', ['join']], ['owner@s.whatsapp.net', ['forcestart']]]) {
        sent.length = 0;
        try { await gw.handleGroupCommand(sock, 'qa@g.us', who, 'Player', args, { prefix: '.s' }); } catch (e) { console.log('[qa] gw ' + args[1] + ' threw:', e.message); }
        console.log('[qa] gw', args[1], '->', sent.length, 'sends:', JSON.stringify(sent.map((x) => x.msg.text || x.msg.caption || (x.msg.image ? 'IMG' : '?'))).slice(0, 220));
    }
    const ev = await GuildWarEvent.findOne({ state: 'ACTIVE' }).sort({ createdAt: -1 }).lean();
    check('war active', !!ev, ev && ev.eventId);
    if (!ev) return report();

    const P1 = ev.players.find((p) => p.jid === 'p1@s.whatsapp.net');
    check('player deployed', !!P1 && !!P1.roomId, P1 && P1.roomId);

    // find one room of each type (topology neighbors of P1 when possible)
    const byType = {};
    for (const r of ev.rooms) if (!byType[r.type]) byType[r.type] = r;
    const types = ['puzzle', 'discovery', 'reward', 'hazard', 'lore', 'secret', 'anomaly', 'landmark', 'combat'];
    for (const t of types) if (byType[t]) check(`map: has ${t} room`, true);
    const missing = types.filter((t) => !byType[t]);
    if (missing.length) console.log('[qa] map lacks (weight-based, ok):', missing.join(','));

    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');

    async function go(t, cmd, prep) {
        const r = byType[t];
        if (!r) return null;
        // teleport P1 into a copy of the room, reset state
        await GuildWarEvent.updateOne(
            { eventId: ev.eventId, 'players.jid': 'p1@s.whatsapp.net' },
            { $set: { 'players.$.roomId': r.key, 'players.$.status': 'active' } });
        await GuildWarEvent.updateOne({ eventId: ev.eventId }, { $set: {} });
        if (prep) await prep(r);
        sent.length = 0;
        const fresh = await state.getEvent(ev.eventId, { fresh: true });
        const me = fresh.players.find((p) => p.jid === 'p1@s.whatsapp.net');
        const room = fresh.rooms.find((x) => x.key === r.key);
        const out = await dmRouter.handleDM(sock, 'p1@s.whatsapp.net', 'p1@s.whatsapp.net', cmd, '\u200b', { prefix: '.s' });
        return { out, room: room };
    }

    // seed a real puzzle into the puzzle room payload
    async function seedPuzzle(r) {
        const puzzles = require('../core/rpg/guildWar/puzzles');
        const rng = mapEngine.makeRng(`${ev.seed}:qa-puzzle:${r.key}`);
        const pz = puzzles.genSequence(rng, { ring: r.ring || 0.2 });
        await GuildWarEvent.updateOne({ eventId: ev.eventId, 'rooms.key': r.key },
            { $set: { 'rooms.$.type': 'puzzle', 'rooms.$.payload': { puzzle: { kind: pz.kind, prompt: pz.prompt, answer: pz.answer, altAnswer: pz.altAnswer, normalize: undefined, attemptsUsed: 0 } } } });
    }

    // ensure secret has NO boss so claim path works
    async function stripBoss(r) {
        await GuildWarEvent.updateOne({ eventId: ev.eventId, 'rooms.key': r.key },
            { $set: { 'rooms.$.payload.boss': false, 'rooms.$.payload.enemies': [] } });
    }

    // ── puzzle: look → intro scene + game board; answer → cleared scene ──
    const pz = await go('puzzle', 'look', seedPuzzle);
    if (pz) {
        check('puzzle: intro scene image', Buffer.isBuffer(sent[0] && sent[0].msg.image), sent[0] && sent[0].msg.image ? `${sent[0].msg.image.length}B` : 'none');
        check('puzzle: caption text sent', !!(sent[0] && sent[0].msg.caption));
        const board = sent.find((s, i) => i > 0 && Buffer.isBuffer(s.msg.image));
        check('puzzle: game board card follows', !!board, board ? `${board.msg.image.length}B` : 'none');
        // answer correctly (use the stored answer)
        const fresh = await state.getEvent(ev.eventId, { fresh: true });
        const room = fresh.rooms.find((x) => x.key === byType.puzzle.key);
        const answer = room.payload && (room.payload.get ? room.payload.get('puzzle') : room.payload.puzzle);
        const res = await dmRouter.handleDM(sock, 'p1@s.whatsapp.net', 'p1@s.whatsapp.net', answer.answer, '\u200b', { prefix: '.s' });
        check('puzzle: solved shows changed room', Buffer.isBuffer(res && res.image), res && res.image ? `${res.image.length}B` : `text=${res && res.text ? res.text.slice(0, 60) : 'none'}`);
    }

    // ── discovery: look → scene; dig → cleared scene ──
    for (const [t, cmd, name] of [['discovery', 'dig', 'dig'], ['reward', 'take', 'take'], ['lore', 'read', 'read'], ['anomaly', 'touch', 'touch']]) {
        const r = await go(t, cmd);
        if (!r) continue;
        check(`${t}: interaction resolved`, r.out !== null && r.out !== undefined);
        const retImg = r.out && Buffer.isBuffer(r.out.image) ? r.out.image : null;
        const sentImg = sent.find((x) => Buffer.isBuffer(x.msg.image));
        check(`${t}: image in flow (intro or changed room)`, !!(retImg || sentImg), retImg ? `ret ${retImg.length}B` : (sentImg ? `sent ${sentImg.msg.image.length}B` : 'none'));
    }

    // secret (no boss): claim
    {
        const r = await go('secret', 'claim', stripBoss);
        if (r) {
            const img = (r.out && Buffer.isBuffer(r.out.image) && r.out.image) || (sent.find((x) => Buffer.isBuffer(x.msg.image)) || {}).msg && (sent.find((x) => Buffer.isBuffer(x.msg.image)) || { msg: {} }).msg.image;
            check('secret: claim + image', !!img, img ? `${img.length}B` : `ret=${r.out ? JSON.stringify(Object.keys(r.out)) : 'null'}`);
        }
    }

    // landmark: record
    {
        const r = await go('landmark', 'record');
        if (r) {
            const img = r.out && Buffer.isBuffer(r.out.image) ? r.out.image : (sent.find((x) => Buffer.isBuffer(x.msg.image)) || { msg: {} }).msg.image;
            check('landmark: record + image', !!img, img ? `${img.length}B` : `ret=${r.out ? JSON.stringify(Object.keys(r.out)) : 'null'}`);
        }
    }

    // hazard: cross (dodge is probabilistic — accept either outcome, image may be cleared scene or none)
    {
        const r = await go('hazard', 'cross');
        if (r) {
            check('hazard: cross handled', !!r.out);
        }
    }

    // ── combat: fight → real battle scene WITH square map (Go render) ──
    {
        const r = await go('combat', 'fight');
        if (r) {
            console.log('[qa] combat sends:', JSON.stringify(sent.map((x) => x.msg.text ? `TXT:${x.msg.text.slice(0, 60)}` : (x.msg.image ? `IMG:${x.msg.image.length}` : '?'))));
            console.log('[qa] combat ret:', JSON.stringify(r.out ? { text: (r.out.text || '').slice(0, 120), hasImg: !!r.out.image, keys: Object.keys(r.out) } : r.out));
            const f2 = await state.getEvent(ev.eventId, { fresh: true });
            const cr = f2.rooms.find((x) => x.key === byType.combat.key);
            const cp = cr.payload && (cr.payload.get ? Object.fromEntries(cr.payload.entries()) : cr.payload);
            console.log('[qa] combat room type/state/enemies:', cr.type, cr.state, JSON.stringify(cp && cp.enemies || null));
            const battle = sent.find((s) => Buffer.isBuffer(s.msg.image));
            check('combat: battle scene rendered', !!battle, battle ? `${battle.msg.image.length}B` : 'none');
        }
    }

    // end the war quietly
    try { await gw.handleGroupCommand(sock, 'qa@g.us', 'owner@s.whatsapp.net', 'Owner', ['end'], { prefix: '.s' }); } catch (e) {}

    report();
}

function report() {
    const pass = checks.filter((c) => c.ok).length;
    console.log(`\n══════ SUMMARY: ${pass}/${checks.length} checks passed ══════`);
    const failed = checks.filter((c) => !c.ok);
    if (failed.length) { console.log('FAILED:', failed.map((f) => f.name).join(', ')); process.exitCode = 1; }
    process.exit(process.exitCode || 0);
}

main().catch((e) => { console.error('QA FATAL:', e); process.exit(1); });
