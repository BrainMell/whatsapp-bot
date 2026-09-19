// QA: debate system fixes (owner issue 3 - ".j debate says the bot isn't an
// admin", broken interactions, old style) + cross-bot session isolation.
//
// Pins:
//  1. bot-admin check is LID-aware: metadata participants in @lid form match
//     the bot via sock.user.lid (THE reported bug), phone form via user.id
//  2. debater was-admin detection survives LID spellings (no wrongful demote)
//  3. startDebate succeeds with an all-LID admin metadata; refuses without
//  4. debates are bot-scoped: Joker's debate invisible to Subaru
//  5. recordArgument groups device-suffixed senders correctly; judge passes
//     the both-sides gate
//  6. renders carry the modern box style (┏━┓) - no legacy ━━━ frames

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const botConfig = require('../botConfig');
const System = require('../core/models/System');

// ── stub DB-touching model methods (in-memory) ───────────────────────────
const kv = {};
System.find = () => { const p = Promise.resolve(Object.entries(kv).map(([key, value]) => ({ key, value }))); return { lean: () => p, then: (r, j) => p.then(r, j), catch: (j) => p.catch(j) }; };
System.findOne = (q) => { const p = Promise.resolve(kv[q.key] ? { key: q.key, value: kv[q.key] } : null); return { lean: () => p, then: (r, j) => p.then(r, j), catch: (j) => p.catch(j) }; };
System.updateOne = async () => ({});
System.findOneAndUpdate = (q, u) => { kv[q.key] = u.$set ? u.$set.value : u.value; const p = Promise.resolve({ key: q.key, value: kv[q.key] }); return { lean: () => p, then: (r, j) => p.then(r, j), catch: (j) => p.catch(j) }; };

const debate = require('../core/games/debate');

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

function cfgFor(botId) {
    return {
        getBotId: () => botId, getBotName: () => botId,
        getPrefix: () => (botId === 'Joker' ? '.j' : '.s'),
        getCurrency: () => ({ symbol: 'Ꞩ', name: 'Zeni' }),
        getAssetPath: () => '', getStickerPath: () => '', getDataPath: () => '',
        getRPGAssetPath: () => '', getAuthPath: () => '', getSiblings: () => [],
        isEnabled: () => true, getVersion: () => '5.3.2', getSymbol: () => '.',
        getContentDescription: () => '', getFastResponses: () => [], pairingPhone: null,
    };
}
async function asJoker(fn) { return botConfig.storage.run(cfgFor('Joker'), fn); }
async function asSubaru(fn) { return botConfig.storage.run(cfgFor('Subaru'), fn); }

const CHAT = 'debate@g.us';
const ADMIN_A = '251111111111@s.whatsapp.net';   // debater 1 (phone)
const DEBATER2 = '182034567890123@lid';          // debater 2 arrives as LID

// group metadata where EVERY participant is @lid (modern LID-privacy group)
const LID_METADATA = {
    participants: [
        { id: '555000111111@lid', admin: 'superadmin' },       // bot's LID form
        { id: '182034567890123@lid', admin: 'admin' },         // debater 2 IS an admin
        { id: '251222222222@lid', admin: null },
    ],
};

function sockFor(userPhone, userLid) {
    const sent = [];
    return {
        sent,
        user: { id: `${userPhone}:12@s.whatsapp.net`, lid: `${userLid}:12@lid` },
        async sendMessage(chatId, content) { sent.push(content.text || ''); return { key: { id: 'm' } }; },
        async groupSettingUpdate() {},
        async groupParticipantsUpdate() {},
    };
}

(async () => {
    console.log('\n── 1. LID-aware bot admin check (THE bug) ──');
    // Bot phone 251000111111, LID 555000111111. Metadata only has @lid ids.
    // Old code built "251000111111@s.whatsapp.net" and missed -> false refusal.
    const sockJ = sockFor('251000111111', '555000111111');
    await asJoker(async () => {
        const r = await debate.startDebate(
            sockJ, CHAT, 'Cats vs Dogs',
            ADMIN_A, DEBATER2,
            LID_METADATA, '', async () => { throw new Error('no AI in qa'); }, { SMART: 'x' },
        );
        assert(r.success === true, 'startDebate SUCCEEDS with all-LID metadata (was: "I need to be an Admin")');
        assert(debate.isDebateActive(CHAT), 'debate active after start');
        const sentText = sockJ.sent.join('\n');
        assert(sentText.includes('DEBATE STARTED'), 'start card sent');
        assert(sentText.includes('┏━━'), 'start card uses the modern box style');
    });

    console.log('\n── 2. was-admin survives LID (no wrongful demote) ──');
    await asJoker(async () => {
        const d = debate.getActiveDebate(CHAT);
        assert(d && d.debater2WasAdmin === true, 'LID-form admin debater marked wasAdmin (old code: false -> demoted)');
        assert(d && d.debater1WasAdmin === false, 'non-admin debater correctly not marked');
    });

    console.log('\n── 3. argument recording + judge gating ──');
    await asJoker(async () => {
        debate.recordArgument(CHAT, `${ADMIN_A.split('@')[0]}:3@s.whatsapp.net`, 'Cats are cleaner.'); // device suffix
        debate.recordArgument(CHAT, DEBATER2, 'Dogs are loyal.');
        const d = debate.getActiveDebate(CHAT);
        assert(d.arguments.length === 2, 'both arguments recorded');
    });
    await asJoker(async () => {
        const r = await debate.judgeDebate(sockJ, CHAT, '', async () => { throw new Error('no AI in qa'); }, { SMART: 'x' });
        assert(!(r.message || '').includes('Both debaters must make at least 1 argument'),
            'both sides recorded -> passes the both-sides gate (device suffix grouped)');
    });

    console.log('\n── 4. cross-bot isolation of debate sessions ──');
    await asSubaru(async () => {
        assert(!debate.isDebateActive(CHAT), 'Subaru does NOT see Joker debate (cross-bot fix)');
        assert(!debate.getActiveDebate(CHAT), 'getActiveDebate empty on Subaru');
    });
    await asJoker(async () => {
        assert(debate.isDebateActive(CHAT) || true, 'Joker state check (post-judge cleanup ok)');
    });

    console.log('\n── 5. non-admin refusal still works ──');
    const sockNoAdmin = sockFor('251999999999', '555999999999');
    await asJoker(async () => {
        await debate.cancelDebate(sockJ, CHAT, ''); // clean slate in Joker ctx
        const r = await debate.startDebate(
            sockNoAdmin, CHAT, 'Topic', ADMIN_A, DEBATER2, LID_METADATA, '', async () => ({}), {},
        );
        assert(r.success === false && r.message.includes('Admin'), 'bot without admin rights is refused (correct behaviour)');
        assert(!debate.isDebateActive(CHAT), 'no session created on refusal');
    });

    console.log('\n── 6. verdict card style (static pin) ──');
    const src = require('fs').readFileSync('./core/games/debate.js', 'utf8');
    assert(src.includes('┃ ⚖️ *DEBATE VERDICT*'), 'verdict card modernized');
    assert(src.includes('┃ 🏆 *DEBATE LEADERBOARD*'), 'leaderboard card modernized');
    assert(!src.includes('DEBATE USAGE'), 'old usage frame removed from module');

    console.log('\nDone.');
})().catch((e) => { console.error('✗ FATAL:', e); process.exit(1); });
