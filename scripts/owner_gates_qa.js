#!/usr/bin/env node
// OWNER GATES QA - run ON-BOX inside the bot dir:
// node scripts/owner_gates_qa.js [Joker|Jake|Subaru]
// Owner ask: "only owner can make someone any mod, and only owner can use
// .j nuke, imfact add a are you sure message with a confirmation sub command"
// Safety model:
// - cardSystem paths driven with mock sock (ZERO WhatsApp traffic)
// - nuke state machine driven via engine's exported helpers (pure, no kicks)
// - computeNukeTargets fed a MOCK groupInfo (no group metadata fetch)
// - no DB writes anywhere: global-mod protections exercised via owner-phone/
// bot-jid/admin rules; roster untouched
'use strict';
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra ? ' - ' + extra : ''}`); }
}
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const envPath = path.join(__dirname, '..', '.env');
    for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
    const mongoose = require('mongoose');
    const uri = process.env.MONGO_URI || process.env.MONGODB_URI;
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] mongo connected: ${mongoose.connection.name}`);

    const BOT = path.join(__dirname, '..');
    const INSTANCE = process.argv[2] || 'Joker';
    const botConfig = require(path.join(BOT, 'botConfig'));
    const cardSystem = require(path.join(BOT, 'core', 'rpg', 'cardSystem'));
    const economy = require(path.join(BOT, 'core', 'rpg', 'economy'));
    const engine = require(path.join(BOT, 'core', 'engine')); // module load only - no startBot
    await economy.loadEconomy().catch(e => console.log(`[qa] economy warn: ${e.message}`));

    const OWNER = '2300000000owner@s.whatsapp.net';
    const GLOBALMOD = '62733080870965@lid';   // real global mod - must now FAIL mod management
    const RANDOM = '100000000000qa@lid';

    const sent = [];
    const mockSock = { sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'QA' } }; } };

 // -- §1 cardmod management is owner-only (cardSystem dispatcher) ------
    const store = new botConfig.BotConfig(path.join(BOT, 'instances', INSTANCE));
    await botConfig.storage.run(store, async () => {
        const P = botConfig.getPrefix();
        console.log(`[qa] instance store botId=${botConfig.getBotId()} prefix=${P}`);
        await cardSystem.init(mockSock, [], [], null);
        const inst = cardSystem.instances.get(botConfig.getBotId());

        async function run(txt, senderJid, flags = {}) {
            sent.length = 0;
            await cardSystem.handleCommand({
                lowerTxt: txt.toLowerCase(), txt, senderJid,
                chatId: '120363428594762331@g.us', m: {}, economy,
                isOwner: !!flags.isOwner, senderIsAdmin: false, isMod: !!flags.isMod,
            });
            await sleep(30);
            return sent.map(s => (s.content && s.content.text) || '').join('\n');
        }

        console.log('\n── §1 cardmod management owner-only ──');
        const CDENY = 'Only the bot owner can manage card moderators.';
        check('global mod (isMod=true) DENIED cardmod list', (await run(`${P} cardmod list`, GLOBALMOD, { isMod: true })).includes(CDENY));
        check('global mod (isMod=true) DENIED cardmod add', (await run(`${P} cardmod add @someone`, GLOBALMOD, { isMod: true })).includes(CDENY));
        check('regular user DENIED cardmod add', (await run(`${P} cardmod add @someone`, RANDOM)).includes(CDENY));
        check('owner PASSES cardmod list (roster view)', (await run(`${P} cardmod list`, OWNER, { isOwner: true })).includes('CARD MODERATORS'));

        console.log('\n── §2 regression: Task-48 spawn gate intact ──');
        check('global mod still DENIED .j spawn', (await run(`${P} spawn ZZZNOCARDQA`, GLOBALMOD, { isMod: true })).includes('Spawn is restricted to the owner and card moderators.'));
        check('cardmod Mahxee still PASSES .j spawn', (await run(`${P} spawn ZZZNOCARDQA`, '264299486400613@lid')).includes('Card not found matching "ZZZNOCARDQA"'));
    });

 // -- §3 nuke two-step confirm state machine (engine exports, pure) ----
    console.log('\n── §3 nuke arm/confirm state machine ──');
    const { NUKE_CONFIRM_TTL_MS, pendingNukesByChat, armNuke, takeArmedNuke } = engine;
    const CHAT_A = '120363428594762331@g.us', CHAT_B = '120363409013549791@g.us';
    check('TTL is 60s', NUKE_CONFIRM_TTL_MS === 60000);
    check('confirm without arm → null', takeArmedNuke(CHAT_A) === null);
    armNuke(CHAT_A, ['u1@lid', 'u2@lid']);
    check('confirm after arm → targets', JSON.stringify(takeArmedNuke(CHAT_A)) === JSON.stringify(['u1@lid', 'u2@lid']));
    check('single-fire: second confirm → null', takeArmedNuke(CHAT_A) === null);
    armNuke(CHAT_A, ['x@lid']);
    check('chat isolation: arm A, take B → null', takeArmedNuke(CHAT_B) === null);
    takeArmedNuke(CHAT_A); // cleanup
    armNuke(CHAT_A, ['y@lid']);
    pendingNukesByChat.get(CHAT_A).at = Date.now() - (NUKE_CONFIRM_TTL_MS + 1000); // backdate → expired
    check('expired arm (>60s) → null', takeArmedNuke(CHAT_A) === null);

 // -- §4 computeNukeTargets protections (mock groupInfo) ---------------
    console.log('\n── §4 nuke target protection rules ──');
    const phones = engine.isBotOwner ? null : null;
    const botJid = 'bot0000000000@s.whatsapp.net';
    const ownerPhoneJid = '233201487480@s.whatsapp.net'; // primary owner phone (BOT_OWNER_PHONES[0])
    const groupInfo = {
        participants: [
            { id: 'admin1@lid', admin: 'admin' },
            { id: 'super1@lid', admin: 'superadmin' },
            { id: botJid },
            { id: ownerPhoneJid },
            { id: 'plain1@lid' },
            { id: 'plain2@s.whatsapp.net' },
        ],
    };
    const targets = engine.computeNukeTargets(groupInfo, { botJid, botLid: null }, CHAT_A);
    check('admins excluded', !targets.includes('admin1@lid') && !targets.includes('super1@lid'));
    check('bot itself excluded', !targets.includes(botJid));
    check('owner phone excluded', !targets.includes(ownerPhoneJid));
    check('plain members targeted', targets.includes('plain1@lid') && targets.includes('plain2@s.whatsapp.net'));
    check('target count = 2', targets.length === 2, JSON.stringify(targets));

 // -- §5 source assertions: engine gates + nuke wiring -----------------
    console.log('\n── §5 source assertions (engine.js) ──');
    const src = fs.readFileSync(path.join(BOT, 'core', 'engine.js'), 'utf8');
    const gateCount = (src.match(/!isOwner && !isGlobalMod\(senderJid\)/g) || []).length;
 // NOTE: other mod commands (mute/kick/warn/ban...) KEEP their owner||gmod
 // gates by design - only mod-MANAGEMENT + nuke were restricted. So instead
 // of counting gates globally, assert the OLD deny texts are gone:
    const oldDenies = [
        'Only the owner or a global mod can remove global moderators.',
        'Only the owner or a General Mod can add RPG moderators.',
        'Only the owner or a General Mod can remove RPG moderators.',
        'Only the owner or a General Mod can add Cards moderators.',
        'Only the owner or a General Mod can remove Cards moderators.',
        'Only the owner or a General Mod can add Quiz moderators.',
        'Only the owner or a General Mod can remove Quiz moderators.',
        'Only the bot owner or global mods can nuke a group.',
    ];
    for (const t of oldDenies) check(`old deny gone: "${t.slice(0, 46)}..."`, !src.includes(t));
    for (const t of [
        '"❌ Only the bot owner can remove global moderators."',
        '"❌ Only the bot owner can add RPG moderators."',
        '"❌ Only the bot owner can remove RPG moderators."',
        '"❌ Only the bot owner can add Cards moderators."',
        '"❌ Only the bot owner can remove Cards moderators."',
        '"❌ Only the bot owner can add Quiz moderators."',
        '"❌ Only the bot owner can remove Quiz moderators."',
        '"❌ Only the bot owner can use nuke."',
    ]) check(`deny text present: ${t.slice(4, 60)}...`, src.includes(t));
    check('nuke confirm branch exists', src.includes('nuke confirm`') && src.includes('takeArmedNuke(chatId)'));
    check('arm card (are-you-sure) exists', src.includes('NUKE ARMED') && src.includes('Are you sure?'));
 // Kicks must live ONLY in the confirm branch: within the nuke block,
 // groupParticipantsUpdate appears exactly once, BEFORE the arm call.
    const blockStart = src.indexOf('// 💡 NUKE - remove everyone');
    const blockEnd = src.indexOf('// .j mods - List global moderators');
    const nukeBlock = src.slice(blockStart, blockEnd);
    const gPUCount = (nukeBlock.match(/sock\.groupParticipantsUpdate/g) || []).length; // code calls only (a comment also mentions the API name)
    check('kicks appear exactly once in nuke block', gPUCount === 1, `got ${gPUCount}`);
    check('kick loop lives in confirm branch (before ARM)',
        nukeBlock.indexOf('groupParticipantsUpdate') < nukeBlock.indexOf('armNuke(chatId, targets)'));

 // cardSystem source: cardmod gate owner-only
    const csrc = fs.readFileSync(path.join(BOT, 'core', 'rpg', 'cardSystem.js'), 'utf8');
    check('cardmod gate is !isOwner', csrc.includes("if (!isOwner) return reply('❌ Only the bot owner can manage card moderators.')"));

    console.log(`\nRESULT: PASS=${PASS} FAIL=${FAIL}`);
    process.exit(FAIL ? 1 : 0);
})().catch(e => { console.error('QA_ERR:', e); process.exit(1); });
