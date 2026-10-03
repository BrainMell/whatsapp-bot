// QA: gold delivery root-cause fixes + allocate contract + lore own-box +
// kill count view. Exercises the REAL economy/progression/loreDrops modules
// with a seeded in-memory cache (no DB, no .env needed).
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const economy = require('../core/rpg/economy');
const progression = require('../core/rpg/progression');

function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); process.exitCode = 1; }
    else console.log('✓', label);
}

// Seed the in-memory economy cache directly (sandbox has no Mongo).
const JID_A = 'hunter_a@s.whatsapp.net';
const JID_B = 'hunter_b@s.whatsapp.net';
const JID_MISSING = 'ghost@s.whatsapp.net';
function seedUser(jid, extra = {}) {
    economy.economyData.set(jid, {
        userId: jid,
        wallet: 1000,
        bank: 0,
        registered: true,
        nickname: jid.split('@')[0],
        stats: { totalEarned: 1000, totalSpent: 0 },
        ...extra,
    });
}
seedUser(JID_A);
seedUser(JID_B);
// progression cache is private; go through the real API with a fresh jid
const JID_P = 'allocuser@s.whatsapp.net';
seedUser(JID_P);

(async () => {
    // ═══ 1. GOLD DELIVERY — the "Gold delivery failed" purge ═══
    console.log('\n── gold delivery ──');

    // 1a. plain payout credits the wallet and is truthy
    const before = economy.getBalance(JID_A);
    const r1 = economy.addMoney(JID_A, 5000, 'qa payout');
    assert(r1 !== false && r1 > 0, 'addMoney success returns truthy balance');
    assert(economy.getBalance(JID_A) === before + 5000, 'addMoney actually credits the wallet');

    // 1b. the debt path can no longer return a FALSY ZERO. Empty wallet +
    // huge debt → entire payout eaten by debt → must be a truthy success.
    seedUser(JID_B, { debt: { amount: 999999 } });
    const debtUserBefore = economy.getBalance(JID_B);
    const r2 = economy.addMoney(JID_B, 1000, 'qa debt eat');
    assert(r2 !== false && (r2 === true || r2 > 0), 'debt-consumed payout returns TRUTHY (was falsy 0 - the raid/loan misreport bug)');
    assert(economy.getBalance(JID_B) === debtUserBefore, 'debt-consumed payout leaves wallet unchanged');
    assert(economy.getUser(JID_B).debt.amount === 998999, 'debt reduced by the eaten payout');

    // 1c. partial debt: another payout still delivers (to the still-huge
    // debt here), truthy return, wallet untouched
    const debtAfterEat = economy.getUser(JID_B).debt.amount;
    const r3 = economy.addMoney(JID_B, 5000, 'qa partial debt');
    assert(r3 !== false && r3 > 0, 'partial-debt payout returns truthy');
    assert(economy.getBalance(JID_B) === debtUserBefore, 'wallet untouched while debt swallows the payout');
    assert(economy.getUser(JID_B).debt.amount === debtAfterEat - 5000, 'debt reduced by exactly the new payout');

    // 1d. unknown user still fails cleanly (that failure is CORRECT and
    // surfaces the "tell a mod" line in the quest summary)
    const r4 = economy.addMoney(JID_MISSING, 1000, 'qa missing');
    assert(r4 === false, 'unknown account returns false (correct, visible failure)');

    // 1e. MARKET-CAP BREAKER: the root cause of the economy-wide freeze.
    // Arm the breaker with a cap BELOW the current economy total, then pay.
    // Old behavior: return false → EVERY payout failed forever ("the money
    // not increasing from quests"). New behavior: advisory warn, payout lands.
    economy._testSetMarketCap(100); // cap below any wallet → breaker trips
    const capBefore = economy.getBalance(JID_A);
    const r5 = economy.addMoney(JID_A, 777, 'qa breaker trip');
    assert(r5 !== false && r5 > 0, 'breaker-tripped payout STILL delivers (breaker is advisory now)');
    assert(economy.getBalance(JID_A) === capBefore + 777, 'breaker-tripped wallet actually grew');
    economy._testSetMarketCap(null); // restore default behavior

    // ═══ 2. ALLOCATE — the card is the contract ═══
    console.log('\n── allocate contract ──');

    // give the fresh user a pile of stat points (progression lives on the
    // economy user object, so seed it there)
    const pUser = economy.economyData.get(JID_P);
    pUser.progression = pUser.progression || {};
    pUser.progression.level = 10;
    pUser.progression.statPoints = 300;
    pUser.progression.allocatedStatPoints = {};
    pUser.progression.allocatedStats = {};

    const a1 = progression.allocateStatPoint(JID_P, 'atk', 5);
    assert(a1.success === true, 'allocate atk 5 succeeds');
    assert(a1.valueGained === 15, `atk 5 points = exactly +15 (got ${a1.valueGained}) - card says +15`);
    assert(a1.remainingPoints === pUser.progression.statPoints, 'stat points deducted consistently');

    const a2 = progression.allocateStatPoint(JID_P, 'atk', 1);
    assert(a2.valueGained === 3, `single-point alloc = exactly +3 (got ${a2.valueGained}) - NO 1.5→1 floor loss`);

    // push past the old soft cap (20 + level/5 = 22) - gains must NOT halve
    const a3 = progression.allocateStatPoint(JID_P, 'atk', 20);
    assert(a3.valueGained === 60, `20 more atk points past the old soft cap = exactly +60 (got ${a3.valueGained}) - NO halving`);
    const a4 = progression.allocateStatPoint(JID_P, 'atk', 1);
    assert(a4.valueGained === 3, `post-cap single alloc still exactly +3 (got ${a4.valueGained})`);

    const a5 = progression.allocateStatPoint(JID_P, 'hp', 2);
    assert(a5.valueGained === 30, `hp 2 points = exactly +30 (got ${a5.valueGained})`);
    const a6 = progression.allocateStatPoint(JID_P, 'crit', 4);
    assert(a6.valueGained === 4, `crit 4 points = exactly +4 (got ${a6.valueGained})`);

    // respect/refund integrity: allocatedStatPoints must match points spent
    const progDoc = progression.getUser(JID_P);
    assert(progDoc.allocatedStatPoints.atk === 27, `atk point ledger tracks 27 spent (got ${progDoc.allocatedStatPoints.atk})`);

    // invalid paths stay rejected
    const a7 = progression.allocateStatPoint(JID_P, 'atk', -3);
    assert(a7.success === false, 'negative amount still rejected (dup-exploit guard intact)');

    // ═══ 3. LORE DROPS — own message box ═══
    console.log('\n── lore drops own-box ──');
    const loreDrops = require('../core/rpg/loreDrops');
    const ownBoxSends = [];
    const loreSock = { sendMessage: async (cid, msg) => ownBoxSends.push({ cid, msg }) };

    const drop = loreDrops.maybeDrop('general_world', { userId: 'qa@x', chatId: 'qa@c', force: true });
    assert(!!drop && drop.startsWith('╒'), 'maybeDrop still produces the framed drop line');
    const ok = await loreDrops.sendOwn(loreSock, 'qa@c', drop);
    assert(ok === true && ownBoxSends.length === 1, 'sendOwn dispatches exactly ONE standalone message');
    assert(ownBoxSends[0].msg.text === drop, 'the drop text travels verbatim (not embedded in other content)');
    const okNull = await loreDrops.sendOwn(loreSock, 'qa@c', null);
    assert(okNull === false && ownBoxSends.length === 1, 'sendOwn(null) is a clean no-op');
    const okErr = await loreDrops.sendOwn({ sendMessage: async () => { throw new Error('boom'); } }, 'qa@c', drop);
    assert(okErr === false, 'sendOwn never throws on socket failure');

    // ═══ 4. KILL COUNT view ═══
    console.log('\n── kill count view ──');
    const rpgCommands = require('../core/commands/rpgCommands');
    assert(typeof rpgCommands.displayKills === 'function', 'displayKills is exported and wired');
    const killSends = [];
    const killSock = { sendMessage: async (cid, msg) => killSends.push(msg) };
    const hunter = economy.economyData.get(JID_A);
    hunter.stats.kills = 4321;
    hunter.stats.bossesDefeated = 22;
    hunter.stats.dragonsKilled = 3;
    hunter.stats.undeadKills = 410;
    hunter.pvpWins = 12;
    await rpgCommands.displayKills(killSock, 'qa@c', JID_A);
    const killsText = killSends[0].text || '';
    assert(killsText.includes('4,321'), 'kill view shows the lifetime total (4,321)');
    assert(killsText.includes('Bosses Slain: *22*'), 'kill view shows boss kills');
    assert(killsText.includes('412') === false, 'no phantom numbers in kill view');
    assert(killsText.includes('high enough'), 'kill view flips to the ascension-ready line past 500');

    // ═══ 5. WORLD ALL gate sanity (already covered in qa_captions_smoke) ═══
    console.log('\n── mod role immutability (static) ──');
    const fs = require('fs');
    const engineSrc = fs.readFileSync(__dirname + '/../core/engine.js', 'utf8');
    assert(!/await addGlobalMod\(target\)/.test(engineSrc), 'no chat path calls addGlobalMod anymore');
    assert(!/await delGlobalMod\(target\)/.test(engineSrc), 'no chat path calls delGlobalMod anymore');
    assert(!/await addRpgMod\(target\)/.test(engineSrc), 'no chat path calls addRpgMod anymore');
    assert(!/await delRpgMod\(target\)/.test(engineSrc), 'no chat path calls delRpgMod anymore');
    assert(!/await addCardsMod\(target\)/.test(engineSrc), 'no chat path calls addCardsMod anymore');
    assert(!/await delCardsMod\(target\)/.test(engineSrc), 'no chat path calls delCardsMod anymore');
    const cardSrc = fs.readFileSync(__dirname + '/../core/rpg/cardSystem.js', 'utf8');
    assert(!/inst\.modJids\.add\(target\)/.test(cardSrc), 'cardmod add can no longer mutate the roster');
    const immutableHits = (engineSrc.match(/Mod roles are immutable/g) || []).length;
    assert(immutableHits === 6, `all 6 mod-role commands respond with the immutable notice (found ${immutableHits})`);
    // boot-time loaders must remain (roles still load from DB)
    assert(/globalMods\.add\(userId\)/.test(engineSrc), 'DB loading of mod roles intact (boot + reloadmods path)');

    console.log(process.exitCode ? '\nGOLD/FIX QA: FAILURES ABOVE' : '\nGOLD/FIX QA: ALL PASS');
    // 💡 explicit exit: scheduleSave's debounced mongoose timers keep the
    // event loop alive in the sandbox (no DB) and the run would hang forever.
    process.exit(process.exitCode ? 1 : 0);
})().catch(e => { console.error('QA ERROR:', e); process.exit(1); });
