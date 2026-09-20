// QA: cross-bot battle-state scoping (owner issue 4 - ".s combat atk" drove
// a battle Joker started). Joker and Subaru run in ONE process, so every
// module-level Map was a shared singleton keyed by chat only.
//
// Pins (real modules, per-bot AsyncLocalStorage contexts, no DB):
//  1. guildAdventure.gameStates: a battle created on Joker is invisible to
//     Subaru (getGameState / composed-key compat / isUserInAdventure /
//     getScopedState), and each bot can hold its OWN battle for the same
//     chat+player simultaneously.
//  2. index.js regen: isUserInAnyCombat still sees fights on either bot
//     (no mid-battle passive healing).
//  3. pvpSystem: duel invites/active duels are bot-scoped - Subaru can run
//     its own duel in a chat where Joker has one, and cannot see Joker's.
//  4. abyssSystem: static pins - run creation stamps botId, gameplay
//     queries use activeRunFilter, admin purge stays global.

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const botConfig = require('../botConfig');
const economy = require('../core/rpg/economy');
const guildAdventure = require('../core/rpg/guildAdventure');
const pvpSystem = require('../core/rpg/pvpSystem');
const fs = require('fs');

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

// ── per-bot mock configs (same shape botConfig.instance provides) ────────
function cfgFor(botId) {
    return {
        getBotId: () => botId,
        getBotName: () => botId,
        getPrefix: () => (botId === 'Joker' ? '.j' : '.s'),
        getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
        getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
        getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
        isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
        getContentDescription: () => '', getFastResponses: () => [],
        pairingPhone: null,
    };
}
const asJoker = (fn) => botConfig.storage.run(cfgFor('Joker'), fn);
const asSubaru = (fn) => botConfig.storage.run(cfgFor('Subaru'), fn);

// ── seed economy ─────────────────────────────────────────────────────────
const A = 'duelist_a@s.whatsapp.net';
const B = 'duelist_b@s.whatsapp.net';
for (const jid of [A, B]) {
    economy.economyData.set(jid, {
        userId: jid, wallet: 100000, bank: 0, registered: true,
        nickname: jid.split('@')[0], stats: {}, progression: { level: 30 },
    });
}

const CHAT = '1203group@g.us';
const P1 = 'fighter@s.whatsapp.net';

// ═══ 1. guildAdventure battle scoping ═══
console.log('\n── 1. guildAdventure: Joker battle invisible to Subaru ──');

// Simulate a battle created under JOKER's context (same path initAdventure
// uses: scoped key + botId stamp).
function createBattleLikeInitAdventure() {
    const sessionKey = `Joker|${CHAT}_${P1}`; // Joker ctx creation shape
    guildAdventure.gameStates.set(sessionKey, {
        chatId: CHAT, solo: true, active: true, inCombat: true,
        botId: 'Joker',
        players: [{ jid: P1 }],
        pendingActions: {},
    });
    return sessionKey;
}
asJoker(createBattleLikeInitAdventure);

asJoker(() => {
    assert(guildAdventure.getGameState(CHAT, P1), 'Joker sees its own battle');
    assert(guildAdventure.getGameState(`${CHAT}_${P1}`), 'Joker composed-key compat works');
    assert(guildAdventure.isUserInAdventure(`${CHAT}_${P1}`), 'Joker isUserInAdventure true');
});
asSubaru(() => {
    assert(!guildAdventure.getGameState(CHAT, P1), 'Subaru does NOT see Joker battle (THE LEAK)');
    assert(!guildAdventure.getGameState(`${CHAT}_${P1}`), 'Subaru composed-key probe also empty');
    assert(!guildAdventure.isUserInAdventure(`${CHAT}_${P1}`), 'Subaru isUserInAdventure false');
    assert(!guildAdventure.getScopedState(`${CHAT}_${P1}`), 'Subaru getScopedState empty');
    assert(guildAdventure.isUserInAnyCombat(P1), 'regen any-bot check STILL sees the fight (no cross-bot healing)');
});

console.log('\n── 2. both bots can each hold their own battle for the same chat+player ──');
asSubaru(() => {
    guildAdventure.gameStates.set(`Subaru|${CHAT}_${P1}`, {
        chatId: CHAT, solo: true, active: true, inCombat: true,
        botId: 'Subaru',
        players: [{ jid: P1 }],
        pendingActions: {},
    });
    const st = guildAdventure.getGameState(CHAT, P1);
    assert(st && st.botId === 'Subaru', 'Subaru resolves ITS own battle');
});
asJoker(() => {
    const st = guildAdventure.getGameState(CHAT, P1);
    assert(st && st.botId === 'Joker', 'Joker still resolves ITS battle (no clobber)');
});
// cleanup Subaru's copy; Joker's must survive
asSubaru(() => guildAdventure.deleteGameState(CHAT, P1));
asSubaru(() => assert(!guildAdventure.getGameState(CHAT, P1), 'Subaru delete removes only Subaru state'));
asJoker(() => assert(guildAdventure.getGameState(CHAT, P1), 'Joker battle survives Subaru delete'));

console.log('\n── 3. fallback scans are bot-scoped (limits / admin stop) ──');
asSubaru(() => {
    // Subaru has no state in this chat now -> fallback scan must find none
    let found = null;
    // emulate getGameState fallback via a stateless probe
    found = guildAdventure.getGameState(CHAT, 'someone_else@s.whatsapp.net');
    assert(!found, 'Subaru fallback scan finds nothing (Joker state filtered)');
});
asJoker(() => {
    const st = guildAdventure.getGameState(CHAT, 'someone_else@s.whatsapp.net');
    assert(st && st.botId === 'Joker', 'Joker fallback scan still finds its own chat state');
});

console.log('\n── 4. pvpSystem duel scoping ──');
asJoker(() => {
    const r = pvpSystem.challengePlayer(CHAT, A, B, 0);
    assert(r.success, 'Joker challenge created');
});
asSubaru(() => {
    assert(!pvpSystem.getInvite(CHAT, B), 'Subaru cannot see Joker invite (THE LEAK)');
    assert(!pvpSystem.getDuel(CHAT), 'Subaru sees no duel');
    const r = pvpSystem.challengePlayer(CHAT, A, B, 0);
    assert(r.success, 'Subaru can run its OWN challenge in the same chat (was: "duel already active")');
});
asJoker(() => {
    assert(pvpSystem.getInvite(CHAT, B), 'Joker invite intact after Subaru challenge');
});
// cleanup: decline both
asJoker(() => pvpSystem.declineChallenge(CHAT, B));
asSubaru(() => pvpSystem.declineChallenge(CHAT, B));

console.log('\n── 5. abyssSystem static pins (shared-Mongo run scoping) ──');
const abyssSrc = fs.readFileSync('./core/rpg/abyssSystem.js', 'utf8');
assert(abyssSrc.includes('function activeRunFilter(userId)'), 'activeRunFilter helper exists');
assert(abyssSrc.includes('botId: botScope(), // 💡 CROSS-BOT LEAK FIX'), 'run creation stamps botId');
const scopedUses = (abyssSrc.match(/AbyssRun\.findOne\(activeRunFilter\(/g) || []).length;
assert(scopedUses >= 5, `gameplay run lookups scoped (found ${scopedUses}, need >=5: treasure/event/skip/retreat/status)`);
assert(/AbyssRun\.findOne\(\{ userId, status: 'active' \}\)/.test(abyssSrc),
    'startRun stale-check intentionally left unscoped (cross-bot auto-retreat + block)');
assert(!/adminPurgeAllRuns[\s\S]*?activeRunFilter/.test(abyssSrc), 'admin purge stays global (emergency tool by design)');
const schemaSrc = fs.readFileSync('./core/models/AbyssRun.js', 'utf8');
assert(/botId: \{ type: String/.test(schemaSrc), 'AbyssRun schema has optional botId field');

console.log('\nDone.');

// QA-only: the modules above open Mongoose handles that hold the event
// loop alive forever in sandbox runs - exit explicitly once pins are done.
process.exit(process.exitCode || 0);
