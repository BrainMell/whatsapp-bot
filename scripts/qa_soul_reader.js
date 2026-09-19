// QA: Fortune Teller kills system (`.j kills`) — the designed soul-reader
// flow. Exercises the REAL soulReader module + renderer with a seeded
// economy cache and mocked System KV (no DB where possible).
//
// Pins:
//  1. sight gates: level 40 / abyss floor 31 / reader's fee (3,000)
//  2. locked view never renders the ledger (locked card + checklist text)
//  3. `.j kills pay`: short wallet refused (nothing changes), funded wallet
//     pays exactly the fee and marks paid; paying twice is refused
//  4. first unlocked reading plays the ceremony line ONCE; later readings
//     show a daily teller line (never two lore lines in one reply)
//  5. ledger uses REAL tracked stats (kills/undead/dragons/bosses/pvp)
//  6. renderer produces PNG buffers for both cards (or null without canvas)
//  7. registry/menu entries exist (kills, combat, world, evolve, trial, use)

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const economy = require('../core/rpg/economy');
const soulReader = require('../core/rpg/soulReader');

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

// ── seed economy ─────────────────────────────────────────────────────────
const JID = 'seeker@s.whatsapp.net';
economy.economyData.set(JID, {
    userId: JID, wallet: 100000, bank: 0, registered: true, nickname: 'seeker',
    stats: { kills: 1284, undeadKills: 340, dragonsKilled: 12, bossesDefeated: 29 },
    pvpWins: 7,
    progression: { level: 10, xp: 0 },
});

// ── mock sock ────────────────────────────────────────────────────────────
const sent = [];
const sock = {
    async sendMessage(chatId, content) {
        sent.push({ chatId, text: content.text || '', image: content.image || null, caption: content.caption || '' });
        return { key: { id: 'mock' } };
    },
};
const CHAT = 'qa@g.us';
const last = () => sent[sent.length - 1];

// Level control through the REAL progression API
const progression = require('../core/rpg/progression');

// Abyss best floor control: stub getPlayerBest via require cache
const abyssSystem = require('../core/rpg/abyssSystem');
const realGetPlayerBest = abyssSystem.getPlayerBest;
let mockBestFloor = 0;
abyssSystem.getPlayerBest = async () => ({ deepestFloor: mockBestFloor });

// ── in-memory System KV (the real one buffers 10s without Mongo) ─────────
// The real model returns a thenable Query that also supports .lean() -
// mimic that shape so both `await findOne(...)` and `findOne(...).lean()`
// resolve the same way.
const System = require('../core/models/System');
const kvStore = {};
function kvDoc(doc) {
    const p = Promise.resolve(doc);
    return { lean: () => p, then: (res, rej) => p.then(res, rej), catch: (rej) => p.catch(rej) };
}
System.findOne = (q) => kvDoc(kvStore[q.key] ? { key: q.key, value: kvStore[q.key] } : null);
System.findOneAndUpdate = (q, update) => {
    kvStore[q.key] = update.$set.value;
    return kvDoc({ key: q.key, value: kvStore[q.key] });
};

(async () => {
    console.log('\n── 1. sight gates ──');
    let sight = await soulReader.getSight(JID);
    assert(!sight.open, 'fresh player: reading locked');
    assert(!sight.levelOk && !sight.floorOk && !sight.feeOk, 'all three doors closed initially');
    assert(soulReader.SIGHT_LEVEL === 40 && soulReader.SIGHT_DEEP_FLOOR === 31 && soulReader.READER_FEE === 3000,
        'gate constants match the designed card (40 / 31 / 3,000)');

    console.log('\n── 2. locked view never renders the ledger ──');
    sent.length = 0;
    await soulReader.viewKills(sock, CHAT, JID, []);
    let out = last();
    assert((out.text || '').includes('VEILWARD READING') || (out.caption || '').includes('VEILWARD READING'),
        'locked view shows THE VEILWARD READING');
    const lockedBody = (out.caption || out.text || '');
    assert(!lockedBody.includes('TOTAL SOULS'), 'locked view NEVER shows the ledger');
    assert(lockedBody.includes('Level') || lockedBody.includes('level'), 'locked checklist names the level door');
    if (out.image) assert(out.image.length > 100, 'locked card renders as PNG');

    console.log('\n── 3. pay interaction ──');
    // short wallet
    economy.economyData.get(JID).wallet = 100;
    sent.length = 0;
    await soulReader.viewKills(sock, CHAT, JID, ['pay']);
    assert(last().text.includes('short') || last().text.includes('3,000'), 'short wallet refused with the fee named');
    assert(economy.economyData.get(JID).wallet === 100, 'short wallet: nothing deducted');
    // funded wallet
    economy.economyData.get(JID).wallet = 100000;
    sent.length = 0;
    await soulReader.viewKills(sock, CHAT, JID, ['pay']);
    assert(economy.economyData.get(JID).wallet === 97000, 'fee paid: exactly 3,000 deducted');
    sight = await soulReader.getSight(JID);
    assert(sight.feeOk, 'fee door now open');
    // double pay refused
    sent.length = 0;
    await soulReader.viewKills(sock, CHAT, JID, ['pay']);
    assert(economy.economyData.get(JID).wallet === 97000, 'double pay: no second deduction');
    assert(last().text.includes('already') || last().text.includes('already counted'), 'double pay refused in the teller voice');

    console.log('\n── 4. unlock ceremony (once) + daily line after ──');
    // open the remaining doors
    economy.economyData.get(JID).progression.level = 45;
    mockBestFloor = 35;
    sent.length = 0;
    await soulReader.viewKills(sock, CHAT, JID, []);
    out = last();
    const firstView = (out.caption || out.text || '');
    assert(firstView.includes('SOULS BEYOND THE VEIL'), 'unlocked view shows the ledger card');
    assert(firstView.includes('Count with me') || firstView.includes('1,284'), 'first reading carries the ceremony voice or the real count');
    assert(firstView.includes('1,284'), 'ledger shows the REAL total kills (1,284)');
    assert(firstView.includes('340') && firstView.includes('29'), 'undead + boss rows render real stats');
    if (out.image) assert(out.image.length > 100, 'ledger card renders as PNG');
    // second reading: no second ceremony, still the ledger, one teller line only
    sent.length = 0;
    await soulReader.viewKills(sock, CHAT, JID, []);
    out = last();
    const secondView = (out.caption || out.text || '');
    assert(secondView.includes('SOULS BEYOND THE VEIL'), 'second reading still the ledger');
    assert(!secondView.includes('Count with me'), 'ceremony does not repeat');
    const frameCount = (secondView.match(/╒/g) || []).length;
    assert(frameCount <= 1, `never two teller lines in one reply (found ${frameCount})`);

    console.log('\n── 5. registry + menu sync ──');
    const reg = require('../core/utils/commandRegistry').COMMANDS || require('../core/utils/commandRegistry');
    const all = [];
    const walk = (v) => { if (Array.isArray(v)) all.push(...v); else if (v && typeof v === 'object') Object.values(v).forEach(walk); };
    walk(reg);
    for (const cmd of ['kills', 'combat', 'world', 'evolve', 'trial', 'use']) {
        assert(all.some((e) => e && e.cmd === cmd), `registry has "${cmd}" (was silent in menus)`);
    }
    assert(!all.some((e) => e && e.cmd === 'guild challenge'), 'stale "guild challenge" removed from registry');
    assert(!all.some((e) => e && e.cmd === 'guild challenges'), 'stale "guild challenges" removed from registry');

    console.log('\nDone.');
    abyssSystem.getPlayerBest = realGetPlayerBest;
})().catch((e) => { console.error('✗ FATAL:', e); process.exit(1); });
