// ============================================
// ⚔️ GUILD WAR START QA — owner overhaul 2026-10-09
// Verifies (real modules vs an ephemeral QA db, mock socks):
//   S1  4-day auto-spawn DISABLED — tick in a live alignment window no-ops
//       (no event, no KV claim, DM wave dead), status() reports autospawn:false
//   S2  `.j war start` → FULL-SCALE (type alignment): call card in host GC,
//       announce wave to every RPG-friendly GC (paced), per-event stamp
//   S3  `.j war start -test` → small war (type normal), NO wide announce
//   S4  legacy args: `alignment`/`full` → full, `normal` → test,
//       `-test alignment` → explicit PICK ONE error
//   S5  non-mod start rejected
//   S6  map scale: full ≈ 4x the test map (side 28 vs 14 at 9 champions)
//   S7  off-window tick broadcast: a REGISTRATION alignment event announces
//       on every instance tick even with NO alignment window (event-keyed
//       stamp), and the stamp prevents doubles
//   S8  RPG-GC registry: `gw rpg on` writes the SAME per-bot key the tick
//       broadcast reads (process-level BOT_INSTANCE identity)
// Run (Box 2): node scripts/gw_war_start_qa.js
// ============================================
process.env.GW_TEST = '1';
process.env.GW_GC_PACE_MS = '25'; // fast paced sends in QA only
const path = require('path');
const fs = require('fs');
const ROOT = '/home/ubuntu/whatsapp-bot';

async function connectDB() {
    for (const line of fs.readFileSync(path.join(ROOT, '.env'), 'utf8').split('\n')) {
        const m = /^\s*([A-Z0-9_]+)\s*=\s*"?([^"\n]*)"?/.exec(line);
        if (m) process.env[m[1]] = process.env[m[1]] || m[2];
    }
    // ephemeral namespace: each run gets its OWN db on the same cluster
    const RUN_DB = `qa_gw_war_${Date.now().toString(36)}`;
    process.env.MONGO_URI = process.env.MONGO_URI.replace(/\/([a-z_0-9]+)\?/, `/${RUN_DB}?`);
    await require(path.join(ROOT, 'db'))();
    const mongoose = require(path.join(ROOT, 'node_modules', 'mongoose'));
    console.log(`[qa] db: ${mongoose.connection.name} @ ${mongoose.connection.host}`);
    return mongoose;
}

// ⚔️ INCIDENT GUARD: never write QA junk to a live namespace.
function assertQaDb(mongoose) {
    const n = mongoose.connection.name;
    if (!/^qa_gw_war_/.test(n)) {
        console.error(`🚨 FATAL: harness connection drifted to '${n}' — refusing to continue`);
        process.exit(3);
    }
}

const results = [];
function check(name, cond, detail = '') {
    results.push({ name, ok: !!cond });
    console.log(`${cond ? '✅' : '❌'} ${name}${cond ? '' : ' — ' + String(detail).slice(0, 200)}`);
}
function section(t) {
    console.log(`\n──── ${t} ────`);
}

function makeSock(tag = '') {
    return {
        tag, sent: [],
        async sendMessage(chatId, content) {
            this.sent.push({ chatId, t: Date.now(), hasImage: !!content.image, text: String(content.text || content.caption || '') });
            return { key: { id: `mock_${this.tag}_${this.sent.length}` } };
        },
        texts() { return this.sent.map((s) => s.text); },
        to(jid) { return this.sent.filter((s) => s.chatId === jid); },
    };
}

const PREFIX = '.j';
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const MOD = 'qa-mod@s.whatsapp.net';
const HOST_GC = '1203999warhost@g.us';
const QA_GC1 = '1203999rpgqa1@g.us';
const QA_GC2 = '1203999rpgqa2@g.us';

async function main() {
    const mongoose = await connectDB();
    assertQaDb(mongoose);

    // ── module setup (BOT_INSTANCE BEFORE any war module is used) ──
    process.env.BOT_INSTANCE = 'QA';
    const system = require(path.join(ROOT, 'core/utils/system.js'));
    const { resolveBotId } = require(path.join(ROOT, 'core/utils/botInstance.js'));
    const GuildWarEvent = require(path.join(ROOT, 'core/models/GuildWarEvent.js'));
    const SystemModel = require(path.join(ROOT, 'core/models/System.js'));
    const state = require(path.join(ROOT, 'core/rpg/guildWar/state.js'));
    const worldAlignment = require(path.join(ROOT, 'core/rpg/worldAlignment.js'));
    const mapEngine = require(path.join(ROOT, 'core/rpg/guildWar/mapEngine.js'));
    const cosmology = require(path.join(ROOT, 'core/rpg/cosmology.js'));
    const CFG = require(path.join(ROOT, 'core/rpg/guildWar/config.js'));

    const engineMod = require(path.join(ROOT, 'core/engine.js'));
    engineMod.isBotOwner = () => false;
    engineMod.isGlobalMod = () => false;
    engineMod.isRpgMod = () => true; // S5 flips this off temporarily
    const gwIndex = require(path.join(ROOT, 'core/rpg/guildWar/index.js'));

    const cleanup = async () => {
        // QA events are identified by the QA host GC (createEvent generates
        // its own gw_<ts>_<hex> ids — no prefix hook)
        await GuildWarEvent.deleteMany({ hostGroupId: HOST_GC });
        await SystemModel.deleteMany({ key: { $in: ['gw_rpg_gcs_QA', 'gw_align_announced_QA', '_shared_world_alignment_last_event'] } });
    };
    await cleanup();
    // mark TWO GCs RPG-friendly on this (QA) bot before any war starts
    system.set('gw_rpg_gcs_QA', [QA_GC1, QA_GC2]);

    let PASS = 0, FAIL = 0;
    const tally = () => { for (const r of results) r.ok ? PASS++ : FAIL++; };

    // ═══════════ S1: 4-DAY AUTO-SPAWN DISABLED ═══════════
    section('S1: 4-day auto-spawn disabled (owner directive)');
    check('S1 config flag off', CFG.ALIGNMENT_AUTOSPAWN === false);
    check('S1 resolveBotId uses process env', resolveBotId() === 'QA');
    const realWindow = cosmology.triuneWindow;
    cosmology.triuneWindow = () => ({ aligned: true, start: 1791763200000, end: 1791763200000 + 2 * 3600e3, minutesLeft: 120, nextStart: 0, periodMs: 96 * 3600e3 });
    const qaSock = makeSock('qa');
    const t1 = await worldAlignment.tick(qaSock, '\u200B');
    check('S1 tick inside window does NOT launch', t1.launch && t1.launch.reason === 'autospawn-disabled' && t1.fired === false, JSON.stringify(t1.launch || {}));
    const kvDoc = await SystemModel.findOne({ key: '_shared_world_alignment_last_event' }).lean();
    check('S1 alignment window NOT claimed in KV', !kvDoc, kvDoc ? JSON.stringify(kvDoc.value) : '');
    const alignCount = await GuildWarEvent.countDocuments({ type: 'alignment' });
    check('S1 no alignment event created', alignCount === 0, String(alignCount));
    check('S1 no DM wave sent', qaSock.sent.length === 0, String(qaSock.sent.length));
    check('S1 status() reports autospawn:false', worldAlignment.status().autospawn === false);
    cosmology.triuneWindow = realWindow;

    // ═══════════ S2: `.j war start` = FULL-SCALE + ANNOUNCE ═══════════
    section('S2: .j war start → full-scale event, announced to every RPG GC');
    const hostSock = makeSock('host');
    await gwIndex.handleGroupCommand(hostSock, HOST_GC, MOD, 'QA Mod', ['start'], { prefix: PREFIX });
    const evFull = await GuildWarEvent.findOne({ hostGroupId: HOST_GC, type: 'alignment' }).sort({ createdAt: -1 }).lean();
    check('S2 event created', !!evFull);
    check('S2 type = alignment (full-scale)', evFull && evFull.type === 'alignment', evFull && evFull.type);
    check('S2 state = REGISTRATION', evFull && evFull.state === 'REGISTRATION');
    check('S2 initiatedBy = mod jid', evFull && evFull.initiatedBy === MOD);
    const hostSends = hostSock.to(HOST_GC);
    check('S2 call card posted to host GC', hostSends.length === 1 && hostSends[0].hasImage, JSON.stringify(hostSends.map(s => s.text.slice(0, 40))));
    check('S2 caption says FULL SCALE', /FULL SCALE/.test(hostSends[0] && hostSends[0].text || ''), hostSends[0] && hostSends[0].text.slice(0, 80));
    check('S2 caption teaches wide announcement', /every RPG-friendly group chat/i.test(hostSends[0] && hostSends[0].text || ''));
    // announce wave (fire-and-forget → poll)
    let wave = [];
    for (let i = 0; i < 100 && wave.length < 2; i++) { await wait(60); wave = hostSock.sent.filter((s) => s.chatId === QA_GC1 || s.chatId === QA_GC2); }
    check('S2 announce wave reached both marked GCs', wave.length === 2, String(wave.length));
    check('S2 announce is the CALLED-BY-HAND card', wave.every((s) => /FULL-SCALE GUILD WAR — CALLED BY HAND/.test(s.text) || /FULL-SCALE GUILD WAR\* called by hand/.test(s.text)), wave[0] && wave[0].text.slice(0, 60));
    check('S2 announce carries image card', wave.length === 2 && wave.every((s) => s.hasImage));
    check('S2 announce happened AFTER the call card', hostSock.sent[0].chatId === HOST_GC);
    check('S2 per-event stamp written', system.get('gw_align_announced_QA') === (evFull && evFull.eventId), String(system.get('gw_align_announced_QA')));
    // host GC itself is NOT in the marked list → no duplicate call there
    check('S2 no duplicate call card in host GC', hostSock.to(HOST_GC).length === 1);

    // ═══════════ S3: `.j war start -test` = SMALL, NO WIDE ANNOUNCE ═══════════
    section('S3: .j war start -test → small mod-initiated war');
    const beforeS3 = hostSock.sent.length;
    await gwIndex.handleGroupCommand(hostSock, HOST_GC, MOD, 'QA Mod', ['start', '-test'], { prefix: PREFIX });
    const evTest = await GuildWarEvent.findOne({ hostGroupId: HOST_GC, type: 'normal' }).sort({ createdAt: -1 }).lean();
    check('S3 event created with type normal', !!evTest, evTest && evTest.type);
    const hostSendsS3 = hostSock.sent.slice(beforeS3).filter((s) => s.chatId === HOST_GC);
    check('S3 call card says TEST', /CALLED \(TEST\)/.test(hostSendsS3[0] && hostSendsS3[0].text || ''), hostSendsS3[0] && hostSendsS3[0].text.slice(0, 60));
    const waveS3 = hostSock.sent.slice(beforeS3).filter((s) => s.chatId === QA_GC1 || s.chatId === QA_GC2);
    check('S3 NO wide announce for test war', waveS3.length === 0, String(waveS3.length));
    check('S3 stamp still points at the full-scale war', system.get('gw_align_announced_QA') === (evFull && evFull.eventId));

    // ═══════════ S4: legacy args ═══════════
    section('S4: legacy argument forms keep working');
    await gwIndex.handleGroupCommand(makeSock('l1'), HOST_GC, MOD, 'QA Mod', ['start', 'alignment'], { prefix: PREFIX });
    const evLegacyFull = await GuildWarEvent.findOne({ hostGroupId: HOST_GC, type: 'alignment' }).sort({ createdAt: -1 }).lean();
    check('S4 explicit alignment → full-scale', !!evLegacyFull && evLegacyFull.eventId !== evFull.eventId);
    await gwIndex.handleGroupCommand(makeSock('l2'), HOST_GC, MOD, 'QA Mod', ['start', 'normal'], { prefix: PREFIX });
    const evLegacyNorm = await GuildWarEvent.findOne({ hostGroupId: HOST_GC, type: 'normal' }).sort({ createdAt: -1 }).lean();
    check('S4 explicit normal → small', !!evLegacyNorm && evLegacyNorm.eventId !== (evTest && evTest.eventId));
    const clashSock = makeSock('l3');
    await gwIndex.handleGroupCommand(clashSock, HOST_GC, MOD, 'QA Mod', ['start', '-test', 'alignment'], { prefix: PREFIX });
    check('S4 -test + alignment → PICK ONE error', clashSock.texts().some((t) => /Pick one scale/.test(t)), clashSock.texts().join('|').slice(0, 80));

    // ═══════════ S5: non-mod rejected ═══════════
    section('S5: non-mod cannot start wars');
    engineMod.isRpgMod = () => false;
    const plebSock = makeSock('pleb');
    const beforeS5 = await GuildWarEvent.countDocuments({ hostGroupId: HOST_GC });
    await gwIndex.handleGroupCommand(plebSock, HOST_GC, 'pleb@s.whatsapp.net', 'Pleb', ['start'], { prefix: PREFIX });
    check('S5 start refused', /Only RPG mods/.test(plebSock.texts().join(' ')));
    await gwIndex.handleGroupCommand(plebSock, HOST_GC, 'pleb@s.whatsapp.net', 'Pleb', ['start', '-test'], { prefix: PREFIX });
    check('S5 -test refused too', /Only RPG mods/.test(plebSock.texts().join(' ')));
    const afterS5 = await GuildWarEvent.countDocuments({ hostGroupId: HOST_GC });
    check('S5 no events created by pleb', afterS5 === beforeS5);
    engineMod.isRpgMod = () => true;

    // ═══════════ S6: map scale ≈ 4x ═══════════
    section('S6: full-scale map ≈ 4x the test map (9 champions)');
    const sideFull = mapEngine.generate('qa-war-full', 9, { alignment: true }).side;
    const sideTest = mapEngine.generate('qa-war-test', 9, { alignment: false }).side;
    const ratio = (sideFull * sideFull) / (sideTest * sideTest);
    check('S6 test map side 14 (196 rooms)', sideTest === 14, `side=${sideTest}`);
    check('S6 full-scale side 28 (784 rooms)', sideFull === 28, `side=${sideFull}`);
    check('S6 room ratio ≈ 4x', ratio > 3.5 && ratio < 4.5, ratio.toFixed(2));

    // ═══════════ S7: off-window tick broadcast + stamp ═══════════
    section('S7: off-window tick announces mod-called full-scale wars');
    cosmology.triuneWindow = () => null; // NO alignment window right now
    system.set('gw_align_announced_QA', 'reset-marker');
    const t7 = await worldAlignment.tick(makeSock('tick1'), '\u200B');
    check('S7 tick off-window fires broadcast', !t7.fired && t7.broadcast && t7.broadcast.sent === 2, JSON.stringify(t7.broadcast || {}));
    check('S7 stamp re-keyed to the announced event', t7.broadcast && system.get('gw_align_announced_QA') === t7.broadcast.eventId, String(system.get('gw_align_announced_QA')));
    const t7b = await worldAlignment.tick(makeSock('tick2'), '\u200B');
    check('S7 second tick does NOT re-announce', t7b.broadcast && t7b.broadcast.skipped === 'already', JSON.stringify(t7b.broadcast || {}));
    // a second full-scale war gets its own announce (event-keyed, not window-keyed)
    await gwIndex.handleGroupCommand(makeSock('w2'), HOST_GC, MOD, 'QA Mod', ['start'], { prefix: PREFIX });
    const evFull2 = await GuildWarEvent.findOne({ hostGroupId: HOST_GC, type: 'alignment' }).sort({ createdAt: -1 }).lean();
    check('S7 second full-scale war created', !!evFull2 && evFull2.eventId !== (evLegacyFull && evLegacyFull.eventId));
    await wait(400);
    // simulate a SIBLING bot that has not announced this war yet (fresh stamp)
    system.set('gw_align_announced_QA', 'sibling-fresh');
    const t7c = await worldAlignment.tick(makeSock('tick3'), '\u200B');
    check('S7 sibling tick announces the newest war once', t7c.broadcast && t7c.broadcast.eventId === (evFull2 && evFull2.eventId), JSON.stringify(t7c.broadcast || {}));
    cosmology.triuneWindow = realWindow;

    // ═══════════ S8: registry key consistency ═══════════
    section('S8: gw rpg on writes the key the tick broadcast reads');
    const QA_GC3 = '1203999rpgqa3@g.us'; // fresh GC — not pre-seeded
    const rpgSock = makeSock('rpg');
    await gwIndex.handleGroupCommand(rpgSock, QA_GC3, MOD, 'QA Mod', ['rpg', 'on'], { prefix: PREFIX });
    const list = system.get('gw_rpg_gcs_QA', []);
    check('S8 rpg on adds GC to gw_rpg_gcs_QA', list.includes(QA_GC3), JSON.stringify(list));
    check('S8 confirm copy shown', /now RPG-friendly/.test(rpgSock.texts().join(' ')), rpgSock.texts().join('|').slice(0, 100));
    await gwIndex.handleGroupCommand(rpgSock, QA_GC3, MOD, 'QA Mod', ['rpg', 'off'], { prefix: PREFIX });
    check('S8 rpg off removes it', !system.get('gw_rpg_gcs_QA', []).includes(QA_GC3));

    // ═══════════ S9: judge-fix regressions ═══════════
    section('S9: auto-abort notice, zero-target stamp, host-GC skip');
    // 9a. registration expiry with <2 players → host GC gets the withdrawal
    const evAb = await state.createEvent({ type: 'normal', hostGroupId: HOST_GC, initiatedBy: MOD });
    await GuildWarEvent.updateOne({ eventId: evAb.event.eventId }, { $set: { registrationEndsAt: Date.now() - 1000 } });
    const s9sock = makeSock('s9');
    await state.tick(s9sock, '\u200B');
    const evAbAfter = await GuildWarEvent.findOne({ eventId: evAb.event.eventId }).lean();
    check('S9a low-attendance war auto-aborted', evAbAfter.state === 'ABORTED', evAbAfter.state);
    check('S9a host GC told the call is withdrawn', s9sock.to(HOST_GC).some((s) => /call is withdrawn/.test(s.text)), s9sock.texts().join('|').slice(0, 80));
    // 9b. zero usable targets (only the host GC marked) → announce does NOT stamp
    system.set('gw_rpg_gcs_QA', [HOST_GC]);
    await gwIndex.handleGroupCommand(makeSock('nb'), HOST_GC, MOD, 'QA Mod', ['start'], { prefix: PREFIX });
    const evNb = await GuildWarEvent.findOne({ hostGroupId: HOST_GC, type: 'alignment' }).sort({ createdAt: -1 }).lean();
    await wait(350);
    check('S9b no-target announce leaves stamp free', system.get('gw_align_announced_QA') !== (evNb && evNb.eventId), String(system.get('gw_align_announced_QA')));
    // 9c. host GC is excluded from its own war's broadcast wave
    system.set('gw_rpg_gcs_QA', [HOST_GC, QA_GC1, QA_GC2]);
    system.set('gw_align_announced_QA', 's9-reset');
    const w9sock = makeSock('w9');
    await gwIndex.handleGroupCommand(w9sock, HOST_GC, MOD, 'QA Mod', ['start'], { prefix: PREFIX });
    let wave9 = [];
    for (let i = 0; i < 100 && wave9.length < 2; i++) { await wait(60); wave9 = w9sock.sent.filter((s) => s.chatId === QA_GC1 || s.chatId === QA_GC2); }
    check('S9c wave still reaches the marked GCs', wave9.length === 2, String(wave9.length));
    check('S9c host GC NOT double-posted (call card only)', w9sock.to(HOST_GC).length === 1, String(w9sock.to(HOST_GC).length));

    // ═══════════ done ═══════════
    tally();
    console.log(`\n════════════════════════════════`);
    console.log(`RESULT: ${PASS} passed, ${FAIL} failed (${PASS + FAIL} checks)`);
    await cleanup();
    try {
        await mongoose.connection.client.db(mongoose.connection.name).dropDatabase();
        console.log(`[qa] dropped ephemeral db ${mongoose.connection.name}`);
    } catch (e) { console.log(`[qa] db drop skipped: ${e.message}`); }
    await mongoose.disconnect();
    process.exit(FAIL ? 1 : 0);
}

main().catch((e) => { console.error('🚨 QA crashed:', e); process.exit(2); });
