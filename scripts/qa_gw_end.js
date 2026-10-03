// ============================================
// 🧪 QA: gw group surface — help card / status card / end from any state
// Drives handleGroupCommand with a mock sock against the TEST db (gwtest).
// Run on box: node scripts/qa_gw_end.js
// ============================================
process.env.GW_TEST = '1';
const path = require('path');
const fs = require('fs');
const ROOT = path.resolve(__dirname, '..');

async function connectDB() {
    const envPath = fs.existsSync(path.join(ROOT, '.env')) ? path.join(ROOT, '.env') : '/home/ubuntu/whatsapp-bot/.env';
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
    for (const name of ['GwTestA', 'GwTestB']) {
        try { await guilds.createGuild(name, `u-${name}`, 'ADVENTURER'); } catch (e) {}
    }
    const gw = require('../core/rpg/guildWar');
    const { state } = gw;
    // QA: bypass the mod/owner gate (mock jids are not the real owner).
    // handleGroupCommand reads engine.isBotOwner dynamically, so patching the
    // export works. Production code path is exercised unchanged.
    const engine = require('../core/engine');
    engine.isBotOwner = () => true;
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    // clear any stale gwtest events (MAX_CONCURRENT_EVENTS = 2 would block creation)
    await GuildWarEvent.updateMany({ state: { $in: ['INITIATED', 'REGISTRATION', 'ACTIVE', 'REWARDS'] } }, { $set: { state: 'ARCHIVED' } });

    // mock sock capturing everything
    const sent = [];
    const sock = { sendMessage: async (chatId, msg) => { sent.push({ chatId, msg }); }, groupMetadata: async () => ({ participants: [] }) };

    // ── 1. bare help (empty args) → field manual card ──
    sent.length = 0;
    await gw.handleGroupCommand(sock, 'qa@g.us', 'owner@s.whatsapp.net', 'Owner', [], {});
    const helpMsg = sent[0] && sent[0].msg;
    check('help: replies', sent.length >= 1);
    check('help: card image attached', Buffer.isBuffer(helpMsg && helpMsg.image), `${helpMsg && helpMsg.image ? `${helpMsg.image.length}B` : 'no image'}`);
    check('help: caption lists end', typeof helpMsg.caption === 'string' && helpMsg.caption.includes('gw end'));

    // ── 2. full war → status card → end card + rewards ──
    const created = await state.createEvent({ type: 'normal', hostGroupId: 'qa-host@g.us', initiatedBy: 'owner@s.whatsapp.net' });
    check('war A created', created.ok, created.reason || '');
    const eventIdA = created.event.eventId;
    for (let i = 0; i < 4; i++) {
        await state.registerPlayer(eventIdA, { jid: `qa${i}@s.whatsapp.net`, name: `QA${i}`, guildId: i % 2 ? 'GwTestB' : 'GwTestA', guildName: i % 2 ? 'GwTestB' : 'GwTestA' });
    }
    const startRes = await state.startEvent(eventIdA, {});
    check('war A started', startRes.ok, startRes.reason || '');
    // seed some points
    const points = require('../core/rpg/guildWar/points');
    await points.award(eventIdA, 'qa0@s.whatsapp.net', 25, 'qa');
    await points.award(eventIdA, 'qa2@s.whatsapp.net', 15, 'qa');

    sent.length = 0;
    await gw.handleGroupCommand(sock, 'qa-host@g.us', 'qa0@s.whatsapp.net', 'QA0', ['status'], {});
    const statusMsg = sent[0] && sent[0].msg;
    check('status: card image attached', Buffer.isBuffer(statusMsg && statusMsg.image), `${statusMsg && statusMsg.image ? `${statusMsg.image.length}B` : 'no image'}`);
    check('status: caption shows standings', typeof statusMsg.caption === 'string' && statusMsg.caption.includes('GUILD WAR: THE RUINS'));

    sent.length = 0;
    await gw.handleGroupCommand(sock, 'qa-host@g.us', 'owner@s.whatsapp.net', 'Owner', ['end'], {});
    check('end: one message', sent.length === 1, `${sent.length} messages`);
    const endMsg = sent[0] && sent[0].msg;
    check('end: final board card attached', Buffer.isBuffer(endMsg && endMsg.image), `${endMsg && endMsg.image ? `${endMsg.image.length}B` : 'no image'}`);
    check('end: caption announces end', typeof endMsg.caption === 'string' && endMsg.caption.includes('THE WAR HAS ENDED'));
    check('end: caption lists guilds', typeof endMsg.caption === 'string' && endMsg.caption.includes('GwTest'));
    const afterEnd = await GuildWarEvent.findOne({ eventId: eventIdA }).lean();
    check('end: state REWARDS', afterEnd && afterEnd.state === 'REWARDS', afterEnd && afterEnd.state);

    // ── 3. war still registering → end closes quietly, no rewards ──
    const createdB = await state.createEvent({ type: 'normal', hostGroupId: 'qa-host@g.us', initiatedBy: 'owner@s.whatsapp.net' });
    check('war B created', createdB.ok, createdB.reason || '');
    const eventIdB = createdB.event.eventId;
    await state.registerPlayer(eventIdB, { jid: 'qb0@s.whatsapp.net', name: 'QB0', guildId: 'GwTestA', guildName: 'GwTestA' });
    sent.length = 0;
    await gw.handleGroupCommand(sock, 'qa-host@g.us', 'owner@s.whatsapp.net', 'Owner', ['end'], {});
    const regEndMsg = sent[0] && sent[0].msg;
    check('end-registering: text reply', typeof (regEndMsg && regEndMsg.text) === 'string');
    check('end-registering: no image', !regEndMsg.image);
    check('end-registering: quiet close wording', typeof regEndMsg.text === 'string' && regEndMsg.text.includes('closed during registration'));
    const afterB = await GuildWarEvent.findOne({ eventId: eventIdB }).lean();
    check('end-registering: state ABORTED', afterB && afterB.state === 'ABORTED', afterB && afterB.state);

    // ── 4. no wars at all → end says so ──
    sent.length = 0;
    await gw.handleGroupCommand(sock, 'qa-host@g.us', 'owner@s.whatsapp.net', 'Owner', ['end'], {});
    const noneMsg = sent[0] && sent[0].msg;
    check('end-none: text only', typeof (noneMsg && noneMsg.text) === 'string' && !noneMsg.image);

    // ── 5. status with no wars → styled empty state ──
    sent.length = 0;
    await gw.handleGroupCommand(sock, 'qa-host@g.us', 'qa0@s.whatsapp.net', 'QA0', ['status'], {});
    check('status-none: styled text', typeof (sent[0] && sent[0].msg.text) === 'string' && sent[0].msg.text.includes('No war is running'));

    const passed = checks.filter((c) => c.ok).length;
    console.log(`\n[qa] ${passed}/${checks.length} checks passed`);
    process.exit(passed === checks.length ? 0 : 2);
}

main().catch((e) => { console.error('[qa] FAILED:', e); process.exit(1); });
