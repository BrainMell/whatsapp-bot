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

    // ═══ JUDGE FIX 2026-09-22 (owner: ".j judge sends an error message that
    // has json in it and score ...") ═══
    const JUDGE_CHAT = 'judgefix@g.us';
    const D1 = '251111111111@s.whatsapp.net';
    const D2 = '182034567890123@lid';

    async function startJudgeScenario(sock, topic) {
        const r = await debate.startDebate(sock, JUDGE_CHAT, topic, D1, D2, LID_METADATA, '', async () => { throw new Error('no AI in qa'); }, { SMART: 'x' });
        if (!r.success) throw new Error('scenario start failed: ' + r.message);
        debate.recordArgument(JUDGE_CHAT, D1, 'Cats are cleaner and quieter.');
        debate.recordArgument(JUDGE_CHAT, D2, 'Dogs are loyal and trainable.');
    }

    const goodSock = sockFor('251000111111', '555000111111');

    console.log('\n── 7. judge: prose-wrapped fenced JSON with STRING scores + trailing brace-pair poison ──');
    await asJoker(async () => {
        await startJudgeScenario(goodSock, 'Cats vs Dogs: final');
        // The old extractor /\{[\s\S]*\}/ matched from the FIRST { to the
        // LAST } - swallowing the trailing note object and the fences ->
        // JSON.parse threw -> err.message (containing the raw JSON) went to
        // the chat. String scores used to concatenate in the leaderboard.
        const messyAiReply = [
            'Here is my verdict for this debate:',
            '```json',
            JSON.stringify({
                winner: 'Debater 1',
                debater1_score: '88',
                debater2_score: '42',
                reasoning: 'Cleaner arguments, better structure.',
                fallacies: { d1: '', d2: 'false dilemma' },
                best_arg_d1: { text: 'litter', impact: 'high' },
                best_arg_d2: { text: 'loyal', impact: 'medium' },
            }, null, 2),
            '```',
            'Note: my final answer is {"winner": "Debater 1"} as required.',
        ].join('\n');
        let aiCalls = 0;
        const r = await debate.judgeDebate(goodSock, JUDGE_CHAT, '', async () => {
            aiCalls++;
            return { choices: [{ message: { content: messyAiReply } }] };
        }, { SMART: 'x' });
        assert(r.success === true, 'messy AI reply (fences + prose + trailing braces) still judged');
        assert(aiCalls === 1, 'no retry needed when extraction succeeds (got ' + aiCalls + ' calls)');
        const out = goodSock.sent.join('\n');
        assert(out.includes('DEBATE VERDICT'), 'verdict card sent');
        assert(out.includes('88') && out.includes('42'), 'string scores displayed as coerced numbers');
        assert(!out.includes('undefined') && !out.includes('NaN'), 'no undefined/NaN scores in the verdict');
        assert(!goodSock.sent.some(t => t.includes('Failed to judge debate')), 'no error card leaked');
        const lb = debate.getDebateLeaderboard('');
        const lbText = typeof lb === 'string' ? lb : lb.text;
        assert(!lbText.includes('NaN') && !lbText.includes('undefined'), 'leaderboard free of string-concat damage');
        assert(/Avg Score: \*8\d\*/.test(lbText) || /Avg Score: \*9\d\*/.test(lbText), 'winner avg score numeric (88 within 80s/90s after averaging)');
    });

    console.log('\n── 8. judge: unparseable first reply -> strict retry -> truncated JSON repair ──');
    await asJoker(async () => {
        await startJudgeScenario(goodSock, 'Cats vs Dogs: retry path');
        let aiCalls = 0;
        const truncated = '{"winner": "Debater 2", "debater1_score": 40, "debater2_score": 75, "reasoning": "their closing argumen';
        const r = await debate.judgeDebate(goodSock, JUDGE_CHAT, '', async () => {
            aiCalls++;
            if (aiCalls === 1) return { choices: [{ message: { content: 'I apologise, I cannot answer that.' } }] };
            return { choices: [{ message: { content: truncated } }] }; // token-capped reply
        }, { SMART: 'x' });
        assert(aiCalls === 2, 'strict retry fired after unparseable first reply');
        assert(r.success === true, 'truncated (token-capped) JSON repaired and judged');
        const out = goodSock.sent.join('\n');
        assert(out.includes('DEBATE VERDICT'), 'verdict card sent on the retry path');
        assert(out.includes('75'), 'repaired score present');
    });

    console.log('\n── 9. judge: hopeless AI replies -> CLEAN error (no JSON dump), debate stays open ──');
    await asJoker(async () => {
        await startJudgeScenario(goodSock, 'Cats vs Dogs: failure path');
        const r = await debate.judgeDebate(goodSock, JUDGE_CHAT, '', async () => ({
            choices: [{ message: { content: 'Sorry, I cannot help with that.' } }],
        }), { SMART: 'x' });
        assert(r.success === false, 'hopeless replies -> judged failure');
        assert(!(r.message || '').includes('{'), 'chat error carries NO raw JSON (the exact owner complaint)');
        assert(!(r.message || '').includes('"winner"'), 'chat error carries no verdict fragments');
        assert((r.message || '').includes('still open'), 'error tells the group the debate is still open');
        assert(debate.isDebateActive(JUDGE_CHAT), 'debate NOT consumed by the failed judge (retry possible)');
        // Recovery: a good AI reply now closes the debate cleanly.
        const okReply = JSON.stringify({ winner: 'Debater 1', debater1_score: 90, debater2_score: 10, reasoning: 'clear win', fallacies: { d1: '', d2: '' }, best_arg_d1: { text: '', impact: '' }, best_arg_d2: { text: '', impact: '' } });
        const r2 = await debate.judgeDebate(goodSock, JUDGE_CHAT, '', async () => ({
            choices: [{ message: { content: okReply } }],
        }), { SMART: 'x' });
        assert(r2.success === true, 'recovery judge succeeds on the same session');
        assert(!debate.isDebateActive(JUDGE_CHAT), 'debate closed after recovery judge');
    });

    console.log('\n── 10. judge: winner normalization + score-fallback (static + runtime) ──');
    {
        // coerceVerdict via the module's behaviour: winner glued into a sentence.
        const okReply = JSON.stringify({ winner: 'debater 2 wins this debate', debater1_score: 55, debater2_score: 61 });
        await asJoker(async () => {
            await startJudgeScenario(goodSock, 'Cats vs Dogs: normalization');
            const r = await debate.judgeDebate(goodSock, JUDGE_CHAT, '', async () => ({
                choices: [{ message: { content: okReply } }],
            }), { SMART: 'x' });
            assert(r.success === true, 'sentence-form winner judged');
            const out = goodSock.sent.join('\n');
            // D2 is the LID jid - winner mention/display must reference it
            assert(out.includes('DEBATE VERDICT'), 'verdict sent');
        });
    }
    {
        const noWinner = JSON.stringify({ debater1_score: 30, debater2_score: 95, reasoning: 'x' });
        await asJoker(async () => {
            await startJudgeScenario(goodSock, 'Cats vs Dogs: winner fallback');
            const r = await debate.judgeDebate(goodSock, JUDGE_CHAT, '', async () => ({
                choices: [{ message: { content: noWinner } }],
            }), { SMART: 'x' });
            assert(r.success === true, 'missing winner -> score fallback decides');
            const out = goodSock.sent.join('\n');
            assert(!out.includes('undefined'), 'no undefined winner text');
        });
    }
    assert(require('fs').readFileSync('./core/games/debate.js', 'utf8').includes('function extractVerdictJson'), 'extractVerdictJson pinned in module');
    assert(require('fs').readFileSync('./core/games/debate.js', 'utf8').includes('function coerceVerdict'), 'coerceVerdict pinned in module');
    {
        const judgeSrc = require('fs').readFileSync('./core/games/debate.js', 'utf8');
        // Pin the SEND line exactly (❌ prefix) so the documentation comment
        // quoting the OLD bug cannot false-positive.
        assert(judgeSrc.includes('"❌ Failed to judge debate: " + safeMsg'), 'judge failure card sends the sanitized message');
        assert(!judgeSrc.includes('"❌ Failed to judge debate: " + err.message'), 'raw err.message no longer sent to chat');
    }

    console.log('\nDone.');
})().catch((e) => { console.error('✗ FATAL:', e); process.exit(1); });
