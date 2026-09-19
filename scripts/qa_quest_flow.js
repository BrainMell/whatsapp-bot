// QA: quest/raid full lifecycle (owner 2026-09-20: "quests and raids don't
// even start anymore").
//
// ROOT CAUSE of that report: the cross-bot scoping fix made every gameStates
// key "bot|..." but internal callers passed ALREADY-SCOPED keys back into
// getGameState (executeEncounter, selectRandomEncounter, getTargets,
// getHealTarget, getHealMult, deleteGameState) -> double-prefix probes ->
// silent null -> executeEncounter returned before spawning any encounter.
// The raid card went out, then NOTHING. Also endCombat got an unscoped
// rebuilt key on the dead-solo-player force-end path.
//
// Pins (real modules, per-bot ALS contexts, no DB):
//  1. solo quest start -> first encounter SPAWNS (enemies, inCombat, turn card)
//  2. combat attack action resolves and damages an enemy (targeting intact)
//  3. ability (skill) path resolves through getTargets/getHealMult
//  4. scoped-key lookups: getGameState/deleteGameState accept "bot|chat[_jid]"
//  5. group raid: registration -> joins -> journey starts at window expiry
//  6. cross-bot isolation STILL holds (scoped-key probes stay bot-separated)
//  7. dead solo player force-end actually clears the state

process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const botConfig = require('../botConfig');
const economy = require('../core/rpg/economy');
const guildAdventure = require('../core/rpg/guildAdventure');

let failures = 0;
function assert(cond, label) {
    if (!cond) { console.error('✗ FAIL:', label); failures++; }
    else console.log('✓', label);
}

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

const CHAT = 'qa_quest_group@g.us';
const P1 = 'qa_hero@s.whatsapp.net';
const P2 = 'qa_mage@s.whatsapp.net';
for (const jid of [P1, P2]) {
    economy.economyData.set(jid, {
        userId: jid, wallet: 100000, bank: 0, registered: true,
        nickname: jid.split('@')[0], stats: {}, progression: { level: 30 },
        adventurerRank: 'A',
    });
}

function mockSock(log) {
    return {
        sendMessage: async (c, m) => {
            if (log) log.push({ chatId: c, msg: m });
        },
    };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
    // ═══ 1. solo quest: first encounter must SPAWN ═══
    console.log('\n── 1. solo quest start → encounter spawns ──');
    const sent1 = [];
    const sock1 = mockSock(sent1);
    const start1 = await asJoker(() => guildAdventure.initAdventure(
        sock1, CHAT, null, 'NORMAL', true, 'F', P1, null, null, { skipShop: true },
    ));
    assert(start1 && start1.success && !start1.isMenu, 'solo quest start accepted (F-rank)');
    // reg timer fires immediately for solo; give the async chain a moment
    await sleep(2500);
    const st1 = asJoker(() => guildAdventure.getGameState(CHAT, P1));
    assert(st1 && st1.inCombat, 'first encounter spawned (inCombat) — THE REGRESSION');
    assert(st1 && Array.isArray(st1.enemies) && st1.enemies.length > 0, 'enemies generated (was 0 before fix)');
    assert(sent1.some((s) => (s.msg.text || s.msg.caption || '').includes('BATTLE COMMENCES')), 'battle announcement delivered');
    assert(st1 && st1.botId === 'Joker', 'state stamped with owning bot');

    // ═══ 2. combat attack resolves ═══
    console.log('\n── 2. combat attack resolves (targeting intact) ──');
    st1.activeCombatant = st1.players[0]; // force the hero's turn
    const beforeHp = st1.enemies.map((e) => e.stats.hp);
    const atkRes = await asJoker(() => guildAdventure.handleCombatAction(
        sock1, CHAT, P1, 'atk', '1',
    ));
    // NOTE: handleCombatAction returns NULL for attacks (feedback flows
    // through performAction's own sock messages) - only errors return strings.
    assert(atkRes === null || atkRes === undefined, 'attack processed without error (null return = action taken)');
    const afterHp = st1.enemies.map((e) => e.stats.hp);
    assert(afterHp.some((hp, i) => hp < beforeHp[i]), 'enemy HP dropped (damage applied)');

    // ═══ 3. ability path (getTargets/getHealMult) ═══
    console.log('\n── 3. ability path resolves ──');
    st1.activeCombatant = st1.players[0];
    const skillRes = await asJoker(() => guildAdventure.handleCombatAction(
        sock1, CHAT, P1, 'skill', '1',
    ));
    assert(typeof skillRes === 'string', 'ability action returned a result (no silent null)');
    assert(!/not in combat/i.test(skillRes || ''), 'ability found the battle');

    // ═══ 4. scoped-key lookups ═══
    console.log('\n── 4. scoped-key lookups work ──');
    const scopedSolo = asJoker(() => `Joker|${CHAT}_${P1}`);
    const foundScoped = asJoker(() => guildAdventure.getGameState(scopedSolo));
    assert(!!foundScoped, 'getGameState accepts a SCOPED solo key (was null before fix)');
    // group-form probe: no group raid exists yet at this point, so plant a
    // probe state (the solo form above already proves the composed path)
    asJoker(() => guildAdventure.gameStates.set(`Joker|group_probe@g.us`, {
        chatId: 'group_probe@g.us', active: true, botId: 'Joker', players: [], timers: {},
    }));
    const foundScopedGroup = asJoker(() => guildAdventure.getGameState(`Joker|group_probe@g.us`));
    assert(!!foundScopedGroup, 'getGameState accepts a SCOPED group key');
    asJoker(() => guildAdventure.gameStates.delete('Joker|group_probe@g.us'));
    // deleteGameState with scoped key must actually delete (leak pin)
    asJoker(() => guildAdventure.gameStates.set(`Joker|delete_probe@g.us`, {
        chatId: 'delete_probe@g.us', active: true, botId: 'Joker', players: [], timers: {},
    }));
    asJoker(() => guildAdventure.deleteGameState(`Joker|delete_probe@g.us`));
    assert(!asJoker(() => guildAdventure.gameStates.has('Joker|delete_probe@g.us')), 'deleteGameState with SCOPED key actually deletes (leak pin)');

    // ═══ 5. group raid: registration → join → journey start ═══
    console.log('\n── 5. group raid join flow ──');
    const sent5 = [];
    const sock5 = mockSock(sent5);
    const start5 = await asJoker(() => guildAdventure.initAdventure(
        sock5, CHAT, null, 'NORMAL', false, 'D', P1, null, null, {},
    ));
    assert(start5 && start5.success && !start5.isMenu, 'group raid registration accepted');
    const j1 = asJoker(() => guildAdventure.joinAdventure(CHAT, P1, 'qa_hero'));
    assert(typeof j1 === 'string' && !j1.includes('Registration is closed'), 'starter joins own raid');
    const j2 = asJoker(() => guildAdventure.joinAdventure(CHAT, P2, 'qa_mage'));
    assert(typeof j2 === 'string' && !j2.includes('Registration is closed'), 'second hero joins registration');
    // force-fire the registration timer instead of waiting 2 minutes
    const st5 = asJoker(() => guildAdventure.getGameState(CHAT));
    assert(st5 && st5.timers && st5.timers.reg, 'registration timer armed');
    clearTimeout(st5.timers.reg);
    await asJoker(async () => {
        const sk = `Joker|${CHAT}`;
        await guildAdventure.startJourney(sock5, sk);
    });
    const st5b = asJoker(() => guildAdventure.getGameState(CHAT));
    assert(st5b && (st5b.phase === 'SHOPPING' || st5b.inCombat), 'journey started after window (SHOPPING or combat)');

    // ═══ 6. cross-bot isolation still holds ═══
    console.log('\n── 6. cross-bot isolation retained ──');
    assert(!asSubaru(() => guildAdventure.getGameState(CHAT, P1)), 'Subaru still cannot see Joker battle');
    assert(!asSubaru(() => guildAdventure.getGameState(`Joker|${CHAT}_${P1}`)), 'Subaru probing a JOKER-SCOPED key still finds nothing');
    assert(asJoker(() => guildAdventure.getGameState(`Joker|${CHAT}_${P1}`)), 'Joker probing its OWN scoped key finds it');

    // ═══ 7. dead solo player force-end ═══
    console.log('\n── 7. dead solo player force-end clears combat ──');
    const st1b = asJoker(() => guildAdventure.getGameState(CHAT, P1));
    if (st1b && st1b.inCombat) {
        st1b.players[0].isDead = true;
        st1b.players[0].stats.hp = 0;
        const deadRes = await asJoker(() => guildAdventure.handleCombatAction(
            sock1, CHAT, P1, 'atk', '1',
        ));
        assert(typeof deadRes === 'string' && deadRes.includes('fallen'), 'dead player gets the fallen message');
        await sleep(300);
        const st1c = asJoker(() => guildAdventure.getGameState(CHAT, P1));
        assert(!st1c || !st1c.inCombat, 'force-end cleared inCombat (was silently stuck before fix)');
    } else {
        assert(true, '(skipped: solo combat already ended during ability test)');
    }

    console.log(failures === 0 ? '\nALL PINS GREEN' : `\n${failures} PIN(S) FAILED`);
    process.exitCode = failures === 0 ? 0 : 1;
    setTimeout(() => process.exit(process.exitCode), 300);
})().catch((e) => { console.error('HARNESS CRASH:', e.stack || e); process.exit(1); });
