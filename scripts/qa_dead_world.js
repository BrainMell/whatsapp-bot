// ═══════════════════════════════════════════════════════════════════════════
//  QA: DEAD WORLD ENCOUNTER + REALM GATE CARDS (2026-09-21 owner ticket)
// ═══════════════════════════════════════════════════════════════════════════
//  Pins:
//   1. 30 unique six-thought variations; no hyphens or dashes anywhere
//   2. 5% trigger chance + forced flag + once-per-run guard
//   3. FULL forced solo run (.j solo f -d equivalent): empty scene card, then
//      SIX SEPARATE thought message boxes, then the victory card, then the
//      run continues into the next encounter (no combat rewards, no kills)
//   4. normal .j solo f unaffected (no flag → enemies spawn as usual)
//   5. dead world renderers produce real PNGs; env art covers every dungeon
//   6. abyss misalignment + afterlife locked cards render; afterlife refusal
//      now sends the LOCKED CARD (never the map sheet); staff bypass intact
//   7. engine dispatch pins: "-d" flag + abyss gate card wiring
//  Run: node scripts/qa_dead_world.js
// ═══════════════════════════════════════════════════════════════════════════
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const assert = require('assert');
const fs = require('fs');

// 💡 STUB ENGINE: worldMap._isStaff lazily requires ../engine - pre-seed the
// require cache so QA never loads the real engine. Mutable staff flag.
let __staff = false;
const __enginePath = require.resolve('../core/engine.js');
require.cache[__enginePath] = {
    id: __enginePath, filename: __enginePath, loaded: true,
    exports: { isBotOwner: () => false, isGlobalMod: () => false, isRpgMod: () => __staff },
};

const botConfig = require('../botConfig');
const economy = require('../core/rpg/economy');
const ga = require('../core/rpg/guildAdventure');
const sequences = require('../core/rpg/deadWorldSequences');
const deadWorld = require('../core/rpg/deadWorld');
const dwRenderer = require('../core/rpg/deadWorldRenderer');
const worldMap = require('../core/rpg/worldMap');
const wmr = require('../core/rpg/worldMapRenderer');

let failures = 0;
function check(cond, label) {
    if (!cond) { console.error('  FAIL:', label); failures++; }
    else console.log('  ok -', label);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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

const CHAT = 'qa_deadworld_group@g.us';
const P1 = 'qa_dw_hero@s.whatsapp.net';
economy.economyData.set(P1, {
    userId: P1, wallet: 50000, bank: 0, registered: true,
    nickname: 'DwHero', stats: {}, progression: { level: 12 },
    adventurerRank: 'B', class: 'FIGHTER', spriteIndex: 0,
});

function mockSock(log) {
    return { sendMessage: async (c, m) => { if (log) log.push({ chatId: c, msg: m }); } };
}

const DASH_RE = /[\u2010\u2011\u2012\u2013\u2014\u2015\u2E3A\u2E3B-]/;

(async () => {
    // ═══ 1. sequence data: 30 x 6, all unique, dash-free ═══
    console.log('\n[1] six-thought sequence data');
    const seqs = sequences.DEAD_WORLD_SEQUENCES;
    check(Array.isArray(seqs) && seqs.length === 30, `exactly 30 variations (got ${seqs.length})`);
    const seen = new Map();
    let dup = null, dashHit = null, badLen = null;
    seqs.forEach((six, vi) => {
        if (!Array.isArray(six) || six.length !== 6) badLen = badLen || `variation ${vi + 1} has ${six.length} thoughts`;
        six.forEach((thought, ti) => {
            const key = String(thought).toLowerCase().trim();
            if (seen.has(key)) dup = dup || `"${thought}" repeats (v${seen.get(key)} and v${vi + 1})`;
            seen.set(key, `${vi + 1}`);
            if (DASH_RE.test(thought)) dashHit = dashHit || `v${vi + 1} thought ${ti + 1}: "${thought}"`;
            if (!thought || thought.length > 120) badLen = badLen || `v${vi + 1} thought ${ti + 1} length ${thought.length}`;
        });
    });
    check(!dup, 'all 180 thoughts unique across all 30 variations');
    check(!dashHit, `no hyphens or dashes in any thought${dashHit ? ' [' + dashHit + ']' : ''}`);
    check(!badLen, `every variation has exactly 6 thoughts, each 1..120 chars${badLen ? ' [' + badLen + ']' : ''}`);
    check(sequences.formatThought('test thought') === '_*「 test thought 」*_',
        'formatThought wraps in the _*「 」*_ message-box style');
    // per-chat rotation avoids immediate repeats
    const picks = new Set();
    for (let i = 0; i < 8; i++) picks.add(sequences.pickSequence('qa_rot_chat'));
    check(picks.size > 1, 'pickSequence rotates variations for a chat');

    // ═══ 2. trigger logic: 5% + forced + once per run ═══
    console.log('\n[2] trigger logic');
    check(deadWorld.CHANCE === 0.05, 'CHANCE is exactly 0.05');
    const st = { deadWorldForced: false };
    const realRandom = Math.random;
    Math.random = () => 0.049;
    check(deadWorld.shouldTrigger(st) === true, 'roll below 0.05 triggers');
    Math.random = () => 0.051;
    check(deadWorld.shouldTrigger(st) === false, 'roll above 0.05 does not trigger');
    st.deadWorldForced = true;
    check(deadWorld.shouldTrigger(st) === true, 'forced flag triggers regardless of the roll');
    st.deadWorldDone = true;
    check(deadWorld.shouldTrigger(st) === false, 'once per run: done state never retriggers');
    check(deadWorld.shouldTrigger(null) === false, 'null state never triggers');
    Math.random = realRandom;
    const mk = deadWorld.marker(2);
    check(mk.type === 'DEAD_WORLD' && mk.name && mk.encounterNumber === 2, 'marker shape is status-safe');

    // ═══ 3. FULL forced solo run: the complete sequence ═══
    console.log('\n[3] full forced run (the .j solo f -d flow)');
    deadWorld.setThoughtDelayMs(5);
    const sent3 = [];
    const sock3 = mockSock(sent3);
    const start3 = await asJoker(() => guildAdventureInit(sock3, { forceDeadWorld: true, skipShop: true }));
    check(start3 && start3.success, 'forced run accepted');
    // reg timer fires immediately; shop skipped; nextStage ~1.2s; sequence msgs; +1s continuation
    await sleep(6000);
    const imgs = sent3.filter((s) => s.msg.image);
    const sceneIdx = sent3.findIndex((s) => s.msg.image && !s.msg.caption);
    check(imgs.length >= 2, `scene + victory cards delivered as images (${imgs.length} images in the run)`);
    // locate the six consecutive thought boxes
    let thoughtRun = 0, runStart = -1, bestRun = 0, bestStart = -1;
    sent3.forEach((s, i) => {
        const t = s.msg.text;
        const isThought = typeof t === 'string' && /^_\*「 .+ 」\*_$/s.test(t);
        if (isThought) { if (thoughtRun === 0) runStart = i; thoughtRun++; if (thoughtRun > bestRun) { bestRun = thoughtRun; bestStart = runStart; } }
        else thoughtRun = 0;
    });
    check(bestRun === 6, `exactly SIX consecutive thought message boxes (best run: ${bestRun})`);
    if (bestRun === 6) {
        check(bestStart > sceneIdx, 'the thought boxes come after the empty scene card');
        const afterIdx = bestStart + 5;
        const afterMsgs = sent3.slice(afterIdx + 1);
        check(afterMsgs.some((s) => s.msg.image), 'the victory card comes after the six thought boxes');
        // six SEPARATE boxes: six distinct sendMessage entries
        const six = sent3.slice(bestStart, bestStart + 6).map((s) => s.msg.text);
        check(new Set(six).size === 6, 'each thought is its own message (no combined box)');
    }
    // run state: consumed the encounter, continued, no combat rewards
    const st3 = asJoker(() => ga.getGameState(CHAT, P1));
    check(!!st3, 'run state alive after the dead world');
    check(st3.encounter >= 2, `run continued to the next encounter (encounter ${st3.encounter})`);
    check(st3.deadWorldDone === true, 'dead world marked done for this run');
    check(st3.players[0].goldEarned === 0 && st3.players[0].xpEarned === 0, 'no gold or xp from an encounter that never fought');
    check(st3.stats.monstersKilled === 0, 'no kill credit (nothing spawned)');
    check(st3.inCombat === true || st3.encounter > st3.maxEncounters || st3.active === false,
        'the run flowed onward after the sequence (combat or completion)');
    // cleanup the run
    asJoker(() => ga.deleteGameState(CHAT, P1));

    // ═══ 4. normal .j solo f is untouched ═══
    console.log('\n[4] normal solo flow (no -d) unaffected');
    const sent4 = [];
    const sock4 = mockSock(sent4);
    const start4 = await asJoker(() => guildAdventureInit(sock4, { skipShop: true }));
    check(start4 && start4.success, 'normal solo start accepted');
    await sleep(3500);
    const st4 = asJoker(() => ga.getGameState(CHAT, P1));
    check(!!st4 && st4.inCombat && Array.isArray(st4.enemies) && st4.enemies.length > 0,
        'first encounter spawns enemies normally (no dead world without the flag)');
    check(!sent4.some((s) => typeof s.msg.text === 'string' && /^_\*「 /.test(s.msg.text)),
        'no thought boxes in a normal run');
    asJoker(() => ga.deleteGameState(CHAT, P1));

    // ═══ 5. renderers + env art coverage ═══
    console.log('\n[5] dead world + gate card renderers');
    for (const [label, buf] of [
        ['scene (FIGHTER, fire cave)', await dwRenderer.renderDeadWorldScene({ playerName: 'DwHero', playerClass: 'FIGHTER', spriteIndex: 0, dungeonName: "Dragon's Lair", rank: 'F', floor: 1, backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png' })],
        ['victory (FIGHTER)', await dwRenderer.renderDeadWorldVictory({ playerName: 'DwHero', playerClass: 'FIGHTER', spriteIndex: 0, dungeonName: "Dragon's Lair", rank: 'F', floor: 1, backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png' })],
        ['scene (NECROMANCER, castle)', await dwRenderer.renderDeadWorldScene({ playerName: 'DwHero', playerClass: 'NECROMANCER', spriteIndex: 0, dungeonName: 'Demon Castle', rank: 'C', floor: 4, backgroundPath: 'rpgasset/environment/spark_2.png', environmentKey: 'spark_2.png' })],
        ['scene fallback (unknown env)', await dwRenderer.renderDeadWorldScene({ playerName: 'DwHero', playerClass: 'SCOUT', spriteIndex: 0, dungeonName: 'Nowhere', rank: 'F', floor: 1, backgroundPath: 'rpgasset/environment/not_a_file.png', environmentKey: '' })],
        ['abyss misaligned (closed)', await wmr.renderAbyssMisalignedCard({ mode: 'closed', opensInLabel: 'locked 2h 03m' })],
        ['abyss misaligned (unreadable)', await wmr.renderAbyssMisalignedCard({ mode: 'unreadable' })],
        ['afterlife locked', await wmr.renderAfterlifeLockedCard()],
    ]) {
        check(buf && buf.length > 30000 && buf[0] === 0x89, `${label}: real PNG (${buf ? buf.length : 0} bytes)`);
    }
    check(dwRenderer._safeText('a-b \u2013 c \u2014 d \u2019e') === "a b c d 'e",
        '_safeText strips hyphens and dashes, normalizes the curly apostrophe');
    // env art coverage: every dungeon environment asset maps to local art
    const gaSrc = fs.readFileSync(require.resolve('../core/rpg/guildAdventure.js'), 'utf8');
    const assets = [...gaSrc.matchAll(/asset:\s*"([^"]+)"/g)].map((m) => m[1]);
    const missing = assets.filter((a) => !dwRenderer.ENV_CARD_ART[a]);
    check(assets.length >= 10 && missing.length === 0,
        `ENV_CARD_ART covers all ${assets.length} dungeon environment assets${missing.length ? ' [missing: ' + missing.join(',') + ']' : ''}`);

    // ═══ 6. afterlife refusal: locked card, never the map ═══
    console.log('\n[6] afterlife locked card flow');
    let sheetCalled = false;
    const realSheet = wmr.renderAfterlifeSheet;
    wmr.renderAfterlifeSheet = async () => { sheetCalled = true; return realSheet(); };
    const sent6 = [];
    const sock6 = mockSock(sent6);
    await worldMap.showWorld(sock6, CHAT, 'qa_dw_mortal@s.whatsapp.net', 'afterlife', { getLevel: () => 99, getRank: () => 'SSS' });
    check(sent6.length === 1, 'afterlife refusal is a single message');
    check(!!sent6[0].msg.image, 'locked afterlife sends the refusal CARD (owner 2026-09-21)');
    check((sent6[0].msg.caption || '').includes('dead souls'), 'caption still states the requirement');
    check(sheetCalled === false, 'the afterlife MAP SHEET is never rendered while locked');
    wmr.renderAfterlifeSheet = realSheet;
    // staff bypass still gets the real sheet
    __staff = true;
    const sent6b = [];
    const sock6b = mockSock(sent6b);
    await worldMap.showWorld(sock6b, CHAT, 'qa_dw_staff@s.whatsapp.net', 'afterlife', { getLevel: () => 1, getRank: () => 'F' });
    check(!!sent6b[0] && !!sent6b[0].msg.image && (sent6b[0].msg.caption || '').includes('own circuit'),
        'staff bypass still renders the real afterlife chart');
    __staff = false;

    // ═══ 7. engine wiring pins ═══
    console.log('\n[7] engine dispatch wiring');
    const engSrc = fs.readFileSync(require.resolve('../core/engine.js'), 'utf8');
    check(/const forceDeadWorld = isSolo && cmdArgs\.slice\(1\)\.includes\("-d"\)/.test(engSrc),
        'solo dispatch parses the -d flag (solo only)');
    check(/\{ skipShop, forceDeadWorld \}/.test(engSrc), 'forceDeadWorld reaches initAdventure');
    check((engSrc.match(/renderAbyssMisalignedCard\(/g) || []).length >= 2,
        'both abyss gate branches render the misalignment card');
    check(/renderAfterlifeLockedCard\(/.test(fs.readFileSync(require.resolve('../core/rpg/worldMap.js'), 'utf8')),
        'afterlife refusal wired to the locked card');
    // the runner's own text fallbacks are also dash-free
    const dwSrc = fs.readFileSync(require.resolve('../core/rpg/deadWorld.js'), 'utf8');
    const fallbacks = dwSrc.match(/_\*「 [^`]*」\*_/g) || [];
    check(fallbacks.length >= 2 && fallbacks.every((f) => !DASH_RE.test(f)),
        `runner text fallbacks exist and stay dash-free (${fallbacks.length} found)`);

    console.log(failures ? `\nQA DEAD WORLD: ${failures} FAILURES` : '\nQA DEAD WORLD: ALL PASS');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('QA ERROR:', e); process.exit(1); });

async function guildAdventureInit(sock, opts) {
    return ga.initAdventure(sock, CHAT, null, 'NORMAL', true, 'F', P1, null, null, opts);
}
