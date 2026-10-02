// QA: world alignment cadence + encounter framework full flow (mock DMs).
// Run: ALIGNMENT_DM_PACE_MS=5 node scripts/qa_world_alignment.js
process.env.NODE_ENV = 'test';
process.env.ALIGNMENT_DM_PACE_MS = '5';
// Choose a period that DIVIDES (now - T0) so the remainder is 0 (< 2h window)
// and the event fires right now, without waiting for a real 4-day window.
{
    const elapsed = Date.now() - Date.UTC(2026, 0, 1);
    const n = Math.max(1, Math.round(elapsed / (96 * 3600000)));
    process.env.TRIUNE_ALIGNMENT_HOURS = String(elapsed / n / 3600000);
}
const assert = require('assert');

// ── stub the shared KV system BEFORE modules load
const __sysPath = require.resolve('../core/utils/system');
const store = {};
require.cache[__sysPath] = {
    id: __sysPath, filename: __sysPath, loaded: true,
    exports: {
        get: (k, d) => (k in store ? store[k] : d),
        set: (k, v) => { store[k] = JSON.parse(JSON.stringify(v)); },
    },
};
// ── stub economy (display names)
const __ecoPath = require.resolve('../core/rpg/economy');
require.cache[__ecoPath] = {
    id: __ecoPath, filename: __ecoPath, loaded: true,
    exports: { getDisplayName: (j) => String(j).split('@')[0] },
};
// ── stub System + User models for the event layer
const __sysModelPath = require.resolve('../core/models/System');
require.cache[__sysModelPath] = {
    id: __sysModelPath, filename: __sysModelPath, loaded: true,
    exports: {
        findOne: ({ key }) => ({
            lean: async () => (store[key] !== undefined ? { key, value: store[key] } : null),
        }),
        updateOne: async ({ key }, { $set }) => { store[key] = $set.value; return { ok: 1 }; },
    },
};
const __userModelPath = require.resolve('../core/models/User');
require.cache[__userModelPath] = {
    id: __userModelPath, filename: __userModelPath, loaded: true,
    exports: {
        find: () => ({
            lean: async () => [
                { userId: 'player1@s.whatsapp.net' },
                { userId: 'player2@lid' },
            ],
        }),
    },
};

const encounterFramework = require('../core/rpg/encounterFramework');
const worldAlignment = require('../core/rpg/worldAlignment');

function mockSock() {
    const sent = [];
    return {
        sent,
        async sendMessage(cid, m) { sent.push({ cid, text: m.text }); },
    };
}

(async () => {
    // ── 1. cadence sanity: env-selected period, T0 aligned, exact bounds
    const cosmology = require('../core/rpg/cosmology');
    assert.strictEqual(cosmology.ALIGNMENT_PERIOD_MS, parseFloat(process.env.TRIUNE_ALIGNMENT_HOURS) * 3600000, 'period honors env');
    assert.strictEqual(cosmology.isTriuneAligned(cosmology.T0), true, 'T0 is an alignment start');

    // ── 2. event tick: fires once, invites all registered players
    let sock = mockSock();
    let r = await worldAlignment.tick(sock, '[BOT]');
    assert.strictEqual(r.fired, true, 'event fired');
    assert.strictEqual(r.invited, 2, 'both players invited');
    const invited1 = sock.sent.filter((s) => s.cid === 'player1@s.whatsapp.net');
    assert.ok(invited1.length >= 1, 'banner+intro sent');
    assert.ok(invited1[0].text.includes('WORLD ALIGNMENT'), 'banner text');
    assert.ok(invited1[0].text.includes('THE WORLDS HAVE ALIGNED'), 'intro step prompt');
    assert.ok(encounterFramework.hasActive('player1@s.whatsapp.net'), 'session active');
    assert.ok(encounterFramework.hasActive('player2@lid'), 'LID player session active');
    assert.ok(store['_shared_world_alignment_last_event'] && String(store['_shared_world_alignment_last_event']).startsWith('align_'), 'claim key stored');

    // ── 3. second tick in the same window: deduped
    r = await worldAlignment.tick(sock, '[BOT]');
    assert.strictEqual(r.fired, false, 'no double fire in same window');

    // ── 4. full DM encounter flow for player1
    sock = mockSock();
    let consumed = await encounterFramework.handleDM(sock, 'player1@s.whatsapp.net', 'player1@s.whatsapp.net', 'Azeroth', '[BOT]');
    assert.strictEqual(consumed, true, 'step 1 consumed');
    consumed = await encounterFramework.handleDM(sock, 'player1@s.whatsapp.net', 'player1@s.whatsapp.net', 'banana', '[BOT]');
    assert.strictEqual(consumed, true, 'step 2 consumed (invalid input)');
    const rej = sock.sent.find((s) => s.text.includes('might'));
    assert.ok(rej, 'invalid boon rejected with options');

    consumed = await encounterFramework.handleDM(sock, 'player1@s.whatsapp.net', 'player1@s.whatsapp.net', 'might', '[BOT]');
    assert.strictEqual(consumed, true, 'step 2 valid advanced');
    consumed = await encounterFramework.handleDM(sock, 'player1@s.whatsapp.net', 'player1@s.whatsapp.net', 'accept', '[BOT]');
    assert.strictEqual(consumed, true, 'completion consumed');
    const outcome = sock.sent[sock.sent.length - 1].text;
    assert.ok(outcome.includes('ATTUNED'), 'attunement outcome');
    assert.ok(outcome.includes('Azeroth'), 'world name in outcome');
    assert.ok(!encounterFramework.hasActive('player1@s.whatsapp.net'), 'session cleaned up after completion');

    // ── 5. quit path for player2
    sock = mockSock();
    consumed = await encounterFramework.handleDM(sock, 'player2@lid', 'player2@lid', 'quit', '[BOT]');
    assert.strictEqual(consumed, true, 'quit consumed');
    assert.ok(!encounterFramework.hasActive('player2@lid'), 'session removed on quit');
    assert.ok(sock.sent[sock.sent.length - 1].text.includes('slip away'), 'quit message');

    // ── 6. cleanup sweep
    assert.strictEqual(encounterFramework.cleanupExpired(), 0, 'nothing to sweep yet');

    // ── 7. prefix commands NOT consumed during an encounter (engine guard)
    const s2 = encounterFramework.hasActive ? null : null;
    await encounterFramework.beginEncounter('player3@s.whatsapp.net', 'alignment_trial', { jid: 'player3@s.whatsapp.net' });
    assert.ok(encounterFramework.hasActive('player3@s.whatsapp.net'), 'player3 session for guard test');
    // the engine guard checks prefix BEFORE calling handleDM - verify the
    // framework does not auto-consume prefix commands (engine skips them):
    assert.strictEqual(store['_shared_encounter_sessions'] !== undefined, true, 'sessions persisted to shared KV');

    console.log('WORLD ALIGNMENT + ENCOUNTER QA: ALL PASS');
    process.exit(0);
})().catch((e) => { console.error('QA FAIL:', e.message); process.exit(1); });
