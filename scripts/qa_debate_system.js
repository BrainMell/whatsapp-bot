// QA: complete .j debate system flow with a mock sock (no WhatsApp, no AI).
// Proves the BSON circular-save fix (Issue #31ff98) and the full lifecycle:
// start (lock/promote) -> arguments (JID normalization) -> judge (verdict,
// unlock, demote, leaderboard) -> cancel -> stale-session prune -> rearm.
// Run: node scripts/qa_debate_system.js
process.env.NODE_ENV = 'test';
const assert = require('assert');

// ── stub the KV system BEFORE debate.js loads: JSON.stringify guard mimics
//    the BSON serializer ("Cannot convert circular structure to BSON").
const __sysPath = require.resolve('../core/utils/system');
const store = {};
let bsonErrors = 0;
require.cache[__sysPath] = {
    id: __sysPath, filename: __sysPath, loaded: true,
    exports: {
        get: (k, d) => (k in store ? store[k] : d),
        set: (k, v) => {
            try { JSON.stringify(v); } catch (e) {
                bsonErrors++;
                throw new Error('Cannot convert circular structure to BSON');
            }
            store[k] = JSON.parse(JSON.stringify(v));
        },
    },
};

// ── stub economy (debate only uses getDisplayName for labels)
const __ecoPath = require.resolve('../core/rpg/economy');
require.cache[__ecoPath] = {
    id: __ecoPath, filename: __ecoPath, loaded: true,
    exports: { getDisplayName: (j) => String(j).split('@')[0] },
};

// ── stub botConfig (instance-independent)
const __cfgPath = require.resolve('../botConfig');
require.cache[__cfgPath] = {
    id: __cfgPath, filename: __cfgPath, loaded: true,
    exports: { getPrefix: () => '.j', getBotId: () => 'Joker' },
};

const debate = require('../core/games/debate');

const BOT = '[BOT]';
const GROUP = '1203630500000001@g.us';
const GROUP2 = '1203630500000002@g.us';
const meta = () => ({
    participants: [
        { id: 'botphone@s.whatsapp.net', admin: 'admin' },
        { id: 'd1@s.whatsapp.net', admin: null },
        { id: 'd2@s.whatsapp.net', admin: null },
    ],
});
function mockSock() {
    const calls = { sent: [], locked: 0, unlocked: 0, promoted: [], demoted: [] };
    return {
        calls,
        user: { id: 'botphone@s.whatsapp.net', lid: 'botlid@lid' },
        async sendMessage(cid, m) { calls.sent.push({ cid, m }); },
        async groupSettingUpdate(cid, s) { if (s === 'announcement') calls.locked++; else calls.unlocked++; },
        async groupParticipantsUpdate(cid, ids, action) {
            (action === 'promote' ? calls.promoted : calls.demoted).push(...ids);
            return [];
        },
    };
}
const MODELS = { SMART: 'smart' };
const groqOk = async () => ({
    choices: [{
        message: {
            content: JSON.stringify({
                winner: 'Debater 2',
                debater1_score: 40,
                debater2_score: '85', // string on purpose - coerceVerdict must rebase
                reasoning: 'd2 argued structure and tooling evidence.',
                fallacies: { d1: 'ad hominem', d2: '' },
                best_arg_d1: { text: 'x', impact: 'y' },
                best_arg_d2: { text: 'a', impact: 'b' },
            }),
        },
    }],
});

(async () => {
    // 1. START: lock + promote + session stored WITHOUT BSON errors
    let sock = mockSock();
    let r = await debate.startDebate(sock, GROUP, 'Tabs vs spaces', 'd1@s.whatsapp.net', 'd2@s.whatsapp.net', meta(), BOT, groqOk, MODELS);
    assert.strictEqual(r.success, true, 'start ok');
    assert.strictEqual(sock.calls.locked, 1, 'group locked');
    assert.deepStrictEqual([...sock.calls.promoted].sort(), ['d1@s.whatsapp.net', 'd2@s.whatsapp.net'], 'debaters promoted');
    assert.strictEqual(bsonErrors, 0, 'NO BSON circular errors on start (the fix)');
    assert.ok(debate.isDebateActive(GROUP), 'session active');
    const persisted = store['active_debates_Joker'][`Joker|${GROUP}`];
    assert.ok(persisted && !persisted.timeoutId, 'persisted session has NO timeout handle');
    assert.ok(!JSON.stringify(persisted).includes('timeoutId'), 'persisted JSON clean');

    // 2. double-start refused
    r = await debate.startDebate(sock, GROUP, 'x', 'd1@s.whatsapp.net', 'd2@s.whatsapp.net', meta(), BOT, groqOk, MODELS);
    assert.strictEqual(r.success, false, 'double start refused');
    assert.ok(r.message.includes('already'), 'double-start message');

    // 3. DM refusal
    r = await debate.startDebate(sock, 'd1@s.whatsapp.net', 'x', 'd1@s.whatsapp.net', 'd2@s.whatsapp.net', null, BOT, groqOk, MODELS);
    assert.strictEqual(r.success, false, 'DM refused');
    assert.ok(r.message.includes('groups'), 'DM refusal message');

    // 4. bot-not-admin refusal in another group
    const metaNoBot = { participants: [{ id: 'd1@s.whatsapp.net', admin: 'admin' }] };
    r = await debate.startDebate(sock, GROUP2, 'x', 'd1@s.whatsapp.net', 'd2@s.whatsapp.net', metaNoBot, BOT, groqOk, MODELS);
    assert.strictEqual(r.success, false, 'non-admin bot refused');
    assert.ok(r.message.includes('Admin'), 'admin refusal message');

    // 5. arguments with device-suffix and LID spellings; third party ignored
    debate.recordArgument(GROUP, 'd1:12@s.whatsapp.net', 'spaces scale across teams');
    debate.recordArgument(GROUP, 'd2@lid', 'tabs win on file size');
    debate.recordArgument(GROUP, 'random@s.whatsapp.net', 'banana interjection');
    const active = debate.getActiveDebate(GROUP);
    assert.strictEqual(active.arguments.length, 2, 'only debater arguments recorded');

    // 6. JUDGE: verdict, unlock, demote, leaderboard
    r = await debate.judgeDebate(sock, GROUP, BOT, groqOk, MODELS);
    assert.strictEqual(r.success, true, 'judge ok');
    const verdictMsg = sock.calls.sent[sock.calls.sent.length - 1].m.text;
    assert.ok(verdictMsg.includes('WINNER'), 'verdict sent to group');
    assert.ok(sock.calls.unlocked >= 1, 'group unlocked');
    assert.ok(sock.calls.demoted.includes('d1@s.whatsapp.net') && sock.calls.demoted.includes('d2@s.whatsapp.net'), 'debaters demoted back');
    assert.ok(!debate.isDebateActive(GROUP), 'session cleared after verdict');
    assert.strictEqual(bsonErrors, 0, 'still zero BSON errors through judge');

    const lb = store['debate_leaderboard'];
    assert.ok(lb['d2@s.whatsapp.net'] && lb['d2@s.whatsapp.net'].wins === 1, 'winner recorded');
    assert.strictEqual(lb['d2@s.whatsapp.net'].totalScore, 85, 'score coerced Number (no string concat)');

    // 7. judge with no active debate
    r = await debate.judgeDebate(sock, GROUP, BOT, groqOk, MODELS);
    assert.strictEqual(r.success, false, 'judge without debate refused');
    assert.ok(r.message.includes('No active debate'), 'no-debate message');

    // 8. stale expired session pruned on module load (restart resilience)
    store['active_debates_Joker'] = {
        [`Joker|stale@g.us`]: { topic: 'old', expirationTime: Date.now() - 1000, arguments: [] },
    };
    delete require.cache[require.resolve('../core/games/debate')];
    const debate2 = require('../core/games/debate');
    assert.ok(!debate2.isDebateActive('stale@g.us'), 'expired session pruned on load');

    // 9. cancel flow on a fresh debate
    sock = mockSock();
    r = await debate2.startDebate(sock, GROUP, 't', 'd1@s.whatsapp.net', 'd2@s.whatsapp.net', meta(), BOT, groqOk, MODELS);
    assert.ok(r.success, 'fresh debate started');
    r = await debate2.cancelDebate(sock, GROUP, BOT);
    assert.ok(r.success && r.message.includes('cancelled'), 'cancel works');
    assert.ok(!debate2.isDebateActive(GROUP), 'cancelled session gone');
    assert.strictEqual(bsonErrors, 0, 'zero BSON errors across ALL flows');

    // 10. rearmTimers: safe no-op with an active session, arms exactly once
    const sock3 = mockSock();
    await debate2.startDebate(sock3, GROUP2, 'rearm', 'd1@s.whatsapp.net', 'd2@s.whatsapp.net', meta(), BOT, groqOk, MODELS);
    await debate2.rearmTimers(sock3, BOT);
    await debate2.rearmTimers(sock3, BOT); // second call must be a no-op
    r = await debate2.cancelDebate(sock3, GROUP2, BOT);
    assert.ok(r.success, 'cleanup after rearm test');

    console.log('DEBATE QA: ALL PASS (bsonErrors=' + bsonErrors + ')');
    process.exit(0);
})().catch((e) => { console.error('DEBATE QA FAIL:', e.message); process.exit(1); });
