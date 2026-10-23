#!/usr/bin/env node
// SPAWN GATE QA - run ON-BOX inside the bot dir:
// node scripts/spawn_gate_qa.js [Joker|Jake|Subaru]
// Owner ask: "Remove global mods ability to use .j spawn, it's for only the
// owner me and cardmods, and make mahxee a card mod and global mod"
// Safety model:
// - mock sock: ZERO WhatsApp traffic
// - allowed-path probes use a BOGUS card name ("ZZZNOCARDQA") → doSpawn
// early-returns before ANY DB write (verified: `if (!card) return null;`
// precedes all writes)
// - spawn/espawn/cardmod are token-cmd-excluded → no token counter ticks
// - real card_roles_<botId> roster load proves the Mahxee grant end-to-end
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
 // .env → process.env
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
    await economy.loadEconomy().catch(e => console.log(`[qa] economy warn: ${e.message}`));

    const OWNER = '2300000000owner@s.whatsapp.net';   // QA-only identity, isOwner flag simulates Mellow
    const GLOBALMOD = '62733080870965@lid';           // real global mod (NOT a cardmod) - the loser of spawn
    const CARDMOD = '264299486400613@lid';            // Mahxee - The Alchemist
    const RANDOM = '100000000000qa@lid';              // plain user

    const sent = [];
    const mockSock = { sendMessage: async (jid, content) => { sent.push({ jid, content }); return { key: { id: 'QA' } }; } };

    const store = new botConfig.BotConfig(path.join(BOT, 'instances', INSTANCE));
    await botConfig.storage.run(store, async () => {
        console.log(`[qa] instance store botId=${botConfig.getBotId()} prefix=${botConfig.getPrefix()}`);
        const P = botConfig.getPrefix(); // '.j' (Joker) vs '.jk' (Jake) - commands MUST use the instance prefix
        await cardSystem.init(mockSock, [], [], null);
        const inst = cardSystem.instances.get(botConfig.getBotId());
        check('init loaded card DB', (inst.ALL_CARDS || []).length > 100, `got ${(inst.ALL_CARDS || []).length}`);
        check('roster card_roles_<botId> loaded → Mahxee is a cardmod', inst.modJids.has(CARDMOD));

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

 // -- §1 .j spawn gate -----------------------------------------
        console.log('\n── §1 .j spawn gate ──');
        const DENY = 'Spawn is restricted to the owner and card moderators.';
        const NOTFOUND = 'Card not found matching "ZZZNOCARDQA"';
        check('global mod (isMod=true) DENIED', (await run(`${P} spawn ZZZNOCARDQA`, GLOBALMOD, { isMod: true })).includes(DENY));
        check('regular user DENIED', (await run(`${P} spawn ZZZNOCARDQA`, RANDOM)).includes(DENY));
        check('owner PASSES (bogus card → not-found reply, no spawn)', (await run(`${P} spawn ZZZNOCARDQA`, OWNER, { isOwner: true })).includes(NOTFOUND));
        check('cardmod Mahxee PASSES (roster path, isMod=false)', (await run(`${P} spawn ZZZNOCARDQA`, CARDMOD)).includes(NOTFOUND));

 // -- §2 .j espawn gate (same force-spawn family) --------------
        console.log('\n── §2 .j espawn gate ──');
        const EDENY = 'Event spawn is restricted to the owner and card moderators.';
        const ENOTFOUND = 'Event card not found matching "ZZZNOCARDQA"';
        check('global mod (isMod=true) DENIED', (await run(`${P} espawn ZZZNOCARDQA`, GLOBALMOD, { isMod: true })).includes(EDENY));
        check('regular user DENIED', (await run(`${P} espawn ZZZNOCARDQA`, RANDOM)).includes(EDENY));
        check('owner PASSES (bogus card → not-found reply)', (await run(`${P} espawn ZZZNOCARDQA`, OWNER, { isOwner: true })).includes(ENOTFOUND));
        check('cardmod Mahxee PASSES', (await run(`${P} espawn ZZZNOCARDQA`, CARDMOD)).includes(ENOTFOUND));

 // -- §3 regression - non-spawn mod powers unchanged -----------
        console.log('\n── §3 regression (non-spawn powers) ──');
        check('global mod still manages cardmods (.j cardmod list)',
            (await run(`${P} cardmod list`, GLOBALMOD, { isMod: true })).includes('CARD MODERATORS'));
        const infoReply = await run(`${P} info ZZZNOCARDQA`, CARDMOD);
        check('cardmod still reaches .j info (no permission error)', !infoReply.includes('Card info lookup is for'), infoReply.slice(0, 80));

        console.log(`\nRESULT: PASS=${PASS} FAIL=${FAIL}`);
        process.exit(FAIL ? 1 : 0);
    });
})().catch(e => { console.error('QA_ERR:', e); process.exit(1); });
