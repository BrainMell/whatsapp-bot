// QA: mod numeric-arg parsing fix (owner issue 5 - "commands only work when
// the number is clickable like a contact"). Exercises the REAL handleAdmin
// with a mock sock and a seeded economy cache. No DB, no .env needed.
//
// Pins:
//  1. bare phone target resolves to the PLAYER (was: silently self-paid)
//  2. plain numeric values are never swallowed (10+ digit amounts work)
//  3. unresolvable phone target fails LOUDLY and moves nothing
//  4. @mention targeting unchanged
//  5. reply-context targeting unchanged
//  6. non-safe-integer amounts are rejected
//  7. setlevel/setstat/setwallet/givepoints/setskillpoints/giveskillpoints
//     share the same contract

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const economy = require('../core/rpg/economy');
const adminConsole = require('../core/commands/adminConsole');

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

// ── seed economy cache ────────────────────────────────────────────────────
const MOD = 'mod@s.whatsapp.net';
const PLAYER = '251453323092189@s.whatsapp.net';   // bare-number target
const PLAYER_LID = '251453323092189@lid';          // same player, LID spelling
const OTHER = 'friend@s.whatsapp.net';
function seedUser(jid, extra = {}) {
    economy.economyData.set(jid, {
        userId: jid, wallet: 1000, bank: 0, registered: true,
        nickname: jid.split('@')[0],
        stats: { totalEarned: 1000, totalSpent: 0 },
        progression: { level: 10, xp: 0, statPoints: 0, allocatedStats: {} },
        skillPoints: 0,
        ...extra,
    });
}
seedUser(MOD);
seedUser(PLAYER);
economy.economyData.set(PLAYER_LID, economy.economyData.get(PLAYER)); // alias
seedUser(OTHER);

// ── mock sock ─────────────────────────────────────────────────────────────
const sent = [];
const sock = {
    async sendMessage(chatId, content) {
        sent.push({ chatId, text: content.text || '', mentions: content.mentions || null });
        return { key: { id: 'mock' } };
    },
};
const CHAT = 'group@g.us';

function lastText() { return sent.length ? sent[sent.length - 1].text : ''; }
const noMention = () => null;
const mentionPlayer = () => PLAYER;

async function runAdmin(args, m = null, getMentionOrReply = noMention) {
    sent.length = 0;
    await adminConsole.handleAdmin(sock, CHAT, MOD, args, m, '', '.j', getMentionOrReply);
    return lastText();
}

(async () => {
    console.log('\n── 1. bare phone number resolves to the PLAYER ──');
    let t = await runAdmin(['givezeni', '251453323092189', '200']);
    assert(t.includes('ZENI GRANTED'), 'givezeni <phone> 200 succeeds (was: silent self-pay)');
    assert(economy.economyData.get(PLAYER).wallet === 1200, 'player wallet +200');
    assert(economy.economyData.get(MOD).wallet === 1000, 'mod wallet untouched (old bug: mod self-paid)');
    t = await runAdmin(['givezeni', '251453323092189@lid', '50']);
    assert(t.includes('ZENI GRANTED') && economy.economyData.get(PLAYER).wallet === 1250,
        'JID-like first arg (digits@lid) also resolves as target');
    t = await runAdmin(['setlevel', '251453323092189', '42']);
    assert(t.includes('LEVEL SET'), 'setlevel <phone> targets the player');
    assert(economy.economyData.get(PLAYER).progression.level === 42, 'player level set to 42');

    console.log('\n── 2. plain numeric VALUES never swallowed ──');
    t = await runAdmin(['givezeni', '5000']);
    assert(t.includes('ZENI GRANTED'), 'givezeni 5000 (self) succeeds');
    assert(economy.economyData.get(MOD).wallet === 6000, 'self +5000');
    t = await runAdmin(['givezeni', '10000000000']);
    assert(t.includes('ZENI GRANTED'), '10+ digit amount NOT stripped (old: usage error)');
    assert(economy.economyData.get(MOD).wallet === 10000006000, 'self +10,000,000,000');
    t = await runAdmin(['setwallet', '10000000000']);
    assert(t.includes('WALLET SET'), 'setwallet 10000000000 (self) succeeds (old: usage error)');
    assert(economy.economyData.get(MOD).wallet === 10000000000, 'wallet set to 10,000,000,000');
    economy.economyData.get(MOD).wallet = 1000; // reset

    console.log('\n── 3. unresolvable phone target fails LOUDLY, moves NOTHING ──');
    const modWalletBefore = economy.economyData.get(MOD).wallet;
    t = await runAdmin(['givezeni', '259998887777', '200']);
    assert(t.includes('No registered player found'), 'clear error names the number');
    assert(economy.economyData.get(MOD).wallet === modWalletBefore, 'mod wallet untouched (old: silent self-pay +200)');
    t = await runAdmin(['setlevel', '259998887777', '50']);
    assert(t.includes('No registered player found'), 'setlevel unknown phone -> clear error');

    console.log('\n── 4. @mention targeting unchanged ──');
    t = await runAdmin(['givezeni', '@hunter', '300'], null, mentionPlayer);
    assert(t.includes('ZENI GRANTED'), 'mention flow works');
    assert(economy.economyData.get(PLAYER).wallet === 1550, 'mention target (PLAYER) got the 300');
    assert(economy.economyData.get(MOD).wallet === modWalletBefore, 'mod wallet untouched on mention flow');

    console.log('\n── 5. reply-context targeting unchanged ──');
    const replyMsg = { message: { extendedTextMessage: { contextInfo: { participant: OTHER } } } };
    t = await runAdmin(['givezeni', '150'], replyMsg);
    assert(t.includes('ZENI GRANTED'), 'reply + plain amount works');
    assert(economy.economyData.get(OTHER).wallet === 1150, 'replied-to player got the 150');
    // reply + 10-digit amount: ctx wins, value stays a value
    t = await runAdmin(['givezeni', '10000000000'], replyMsg);
    assert(t.includes('ZENI GRANTED'), 'reply + 10-digit amount: amount is a value, not a target');
    assert(economy.economyData.get(OTHER).wallet === 10000001150, 'replied-to player got the 10B');

    console.log('\n── 6. absurd / unsafe amounts rejected ──');
    t = await runAdmin(['givezeni', '999999999999999999']);
    assert(t.includes('Usage:'), 'non-safe-integer amount -> usage error');
    t = await runAdmin(['setwallet', '@friend', '999999999999999999'], null, mentionPlayer);
    assert(t.includes('Usage:'), 'non-safe-integer via mention -> usage error');

    console.log('\n── 7. sibling commands share the contract ──');
    t = await runAdmin(['givepoints', '251453323092189', '25']);
    assert(t.includes('STAT POINTS GRANTED'), 'givepoints <phone> resolves target');
    // setlevel 42 earlier granted (42-10)*2 = 64 points; +25 now = 89
    assert(economy.economyData.get(PLAYER).progression.statPoints === 89, 'player got 25 stat points (64 from setlevel + 25)');
    t = await runAdmin(['setskillpoints', '251453323092189', '7']);
    assert(t.includes('SKILL POINTS SET'), 'setskillpoints <phone> resolves target');
    assert(economy.economyData.get(PLAYER).skillPoints === 7, 'player skillPoints = 7');
    t = await runAdmin(['giveskillpoints', '251453323092189', '3']);
    assert(economy.economyData.get(PLAYER).skillPoints === 10, 'giveskillpoints adds');
    t = await runAdmin(['setstat', '251453323092189', 'atk', '9000']);
    assert(t.includes('STAT SET'), 'setstat <phone> <stat> <value> resolves target');
    assert(economy.economyData.get(PLAYER).progression.allocatedStats.atk === 9000, 'player atk allocated 9000');

    console.log('\n── 8. multi-word item commands keep positional values ──');
    t = await runAdmin(['giveitem', '251453323092189', 'health_potion', '5']);
    assert(t.includes('ITEM GIVEN') || t.includes('not found'), 'giveitem <phone> resolves target (item resolve is env-dependent)');
    const giveErr = sent.length ? sent[sent.length - 1].text : '';
    assert(!giveErr.includes('No registered player found') || giveErr.includes('ITEM GIVEN'),
        'giveitem did not misread qty as a target');

    console.log('\nDone.');
})().catch((e) => { console.error('✗ FATAL:', e); process.exit(1); });
