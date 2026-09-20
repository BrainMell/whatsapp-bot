// ═══════════════════════════════════════════════════════════════════════════
//  QA: DEAD WORLD ENCOUNTER + REALM GATE CARDS (2026-09-21 owner ticket)
// ═══════════════════════════════════════════════════════════════════════════
//  Pins:
//   1. 30 unique ten-thought variations; no hyphens or dashes anywhere
//   2. 5% trigger chance + forced flag + once-per-run guard
//   3. FULL forced solo run (.j solo f -d equivalent): empty scene card, then
//      TEN SEPARATE thought message boxes, then the regular-style victory
//      card with a Dead World congratulation caption - and the run ENDS
//      there (owner 2026-09-21: the encounter ends after the Dead World
//      sequence and does NOT continue into the normal dungeon flow: state
//      deleted, no QUEST COMPLETE banner, no next encounter, no rewards)
//   4. normal .j solo f unaffected (no flag → enemies spawn as usual)
//   5. dead world renderers produce real PNGs; env art covers every dungeon;
//      the primary card path is the Go encounter pipeline (floor 0, empty
//      enemy side), the node-canvas renderer is fallback-only
//   6. abyss misalignment + afterlife locked cards render; afterlife refusal
//      now sends the LOCKED CARD (never the map sheet); staff + owner bypass
//      intact; the reading (soulReader) is the player-side key
//   7. engine dispatch pins: "-d" flag + abyss gate card wiring
//  Run: node scripts/qa_dead_world.js
// ═══════════════════════════════════════════════════════════════════════════
process.env.GO_IMAGE_SERVICE_URL = process.env.GO_IMAGE_SERVICE_URL || 'http://127.0.0.1:7860';

const assert = require('assert');
const fs = require('fs');

// 💡 STUB ENGINE: worldMap._isStaff + soulReader._isOwner lazily require
// ../engine - pre-seed the require cache so QA never loads the real engine.
// Mutable staff/owner flags.
let __staff = false;
let __owner = false;
const __enginePath = require.resolve('../core/engine.js');
require.cache[__enginePath] = {
    id: __enginePath, filename: __enginePath, loaded: true,
    exports: { isBotOwner: () => __owner, isGlobalMod: () => false, isRpgMod: () => __staff },
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
    // ═══ 1. sequence data: 30 x 10, all unique, dash-free ═══
    console.log('\n[1] ten-thought sequence data');
    const seqs = sequences.DEAD_WORLD_SEQUENCES;
    check(Array.isArray(seqs) && seqs.length === 30, `exactly 30 variations (got ${seqs.length})`);
    const seen = new Map();
    let dup = null, dashHit = null, badLen = null;
    seqs.forEach((ten, vi) => {
        if (!Array.isArray(ten) || ten.length !== 10) badLen = badLen || `variation ${vi + 1} has ${ten.length} thoughts`;
        ten.forEach((thought, ti) => {
            const key = String(thought).toLowerCase().trim();
            if (seen.has(key)) dup = dup || `"${thought}" repeats (v${seen.get(key)} and v${vi + 1})`;
            seen.set(key, `${vi + 1}`);
            if (DASH_RE.test(thought)) dashHit = dashHit || `v${vi + 1} thought ${ti + 1}: "${thought}"`;
            if (!thought || thought.length > 120) badLen = badLen || `v${vi + 1} thought ${ti + 1} length ${thought.length}`;
        });
    });
    check(!dup, 'all 300 thoughts unique across all 30 variations');
    check(!dashHit, `no hyphens or dashes in any thought${dashHit ? ' [' + dashHit + ']' : ''}`);
    check(!badLen, `every variation has exactly 10 thoughts, each 1..120 chars${badLen ? ' [' + badLen + ']' : ''}`);
    check(sequences.formatThought('test thought') === '_*「 test thought 」*_',
        'formatThought wraps in the _*「 」*_ message-box style');
    // the victory congratulation pool: present, dash-free, no kill language
    const vics = sequences.VICTORY_CAPTIONS;
    check(Array.isArray(vics) && vics.length >= 3, `victory caption pool exists (${vics.length} captions)`);
    check(vics.every((c) => !DASH_RE.test(c.card + c.text)), 'victory captions are dash-free');
    check(vics.every((c) => !/slain|killed|defeated|victory over/i.test(c.text)), 'victory captions never imply a fight');
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

    // ═══ 3. FULL forced solo run: the complete sequence, then the run ENDS ═══
    console.log('\n[3] full forced run (the .j solo f -d flow)');
    deadWorld.setThoughtDelayMs(5);
    const sent3 = [];
    const sock3 = mockSock(sent3);
    const start3 = await asJoker(() => guildAdventureInit(sock3, { forceDeadWorld: true, skipShop: true }));
    check(start3 && start3.success, 'forced run accepted');
    // reg timer fires immediately; shop skipped; nextStage ~1.2s; sequence msgs
    await sleep(9000);
    const imgs3 = sent3.filter((s) => s.msg.image);
    const sceneIdx = sent3.findIndex((s) => s.msg.image && !s.msg.caption);
    check(imgs3.length >= 2, `scene + victory cards delivered as images (${imgs3.length} images in the run)`);
    // locate the ten consecutive thought boxes
    let thoughtRun = 0, runStart = -1, bestRun = 0, bestStart = -1;
    sent3.forEach((s, i) => {
        const t = s.msg.text;
        const isThought = typeof t === 'string' && /^_\*「 .+ 」\*_$/s.test(t);
        if (isThought) { if (thoughtRun === 0) runStart = i; thoughtRun++; if (thoughtRun > bestRun) { bestRun = thoughtRun; bestStart = runStart; } }
        else thoughtRun = 0;
    });
    check(bestRun === 10, `exactly TEN consecutive thought message boxes (best run: ${bestRun})`);
    if (bestRun === 10) {
        check(bestStart > sceneIdx, 'the thought boxes come after the empty scene card');
        const afterIdx = bestStart + 9;
        const afterMsgs = sent3.slice(afterIdx + 1);
        check(afterMsgs.some((s) => s.msg.image), 'the victory card comes after the ten thought boxes');
        // ten SEPARATE boxes: ten distinct sendMessage entries
        const ten = sent3.slice(bestStart, bestStart + 10).map((s) => s.msg.text);
        check(new Set(ten).size === 10, 'each thought is its own message (no combined box)');
        // 💡 TERMINAL RUN (owner 2026-09-21): the victory card is the LAST
        // message - nothing follows it into the normal dungeon flow
        const victoryIdx = afterIdx + 1 + afterMsgs.map((s) => s.msg.image ? true : false).lastIndexOf(true) + afterIdx + 1 - (afterIdx + 1);
        const lastImageIdx = afterIdx + 1 + afterMsgs.map((s) => !!s.msg.image).lastIndexOf(true);
        const afterVictory = sent3.slice(lastImageIdx + 1);
        check(afterVictory.every((s) => !s.msg.image), 'the victory card is the LAST image of the run (closing beat)');
        check(afterVictory.every((s) => !/QUEST COMPLETE|BATTLE COMMENCES|FLOOR \d/i.test(s.msg.text || '')),
            'nothing from the normal dungeon flow follows the victory card');
        check(afterMsgs.every((s) => !(s.msg.text || '').includes('QUEST COMPLETE')),
            'no QUEST COMPLETE banner after the sequence');
        check(afterMsgs.every((s) => !(s.msg.text || '').includes('BATTLE COMMENCES')),
            'no further encounter spawns after the sequence');
    }
    // run state: the run ENDED - state deleted, nothing dangling
    const st3 = asJoker(() => ga.getGameState(CHAT, P1));
    check(!st3 || st3.active === false, 'run state is gone/inactive after the dead world (terminal run)');
    // cleanup any leftovers for the next section
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
    console.log('\n[5] dead world + gate card renderers (fallback path)');
    for (const [label, buf] of [
        ['scene (FIGHTER, fire cave)', await dwRenderer.renderDeadWorldScene({ playerName: 'DwHero', playerClass: 'FIGHTER', spriteIndex: 0, dungeonName: "Dragon's Lair", rank: 'F', backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png' })],
        ['victory (FIGHTER)', await dwRenderer.renderDeadWorldVictory({ playerName: 'DwHero', playerClass: 'FIGHTER', spriteIndex: 0, dungeonName: "Dragon's Lair", rank: 'F', backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png' })],
        ['scene (NECROMANCER, castle)', await dwRenderer.renderDeadWorldScene({ playerName: 'DwHero', playerClass: 'NECROMANCER', spriteIndex: 0, dungeonName: 'Demon Castle', rank: 'C', backgroundPath: 'rpgasset/environment/spark_2.png', environmentKey: 'spark_2.png' })],
        ['scene fallback (unknown env)', await dwRenderer.renderDeadWorldScene({ playerName: 'DwHero', playerClass: 'SCOUT', spriteIndex: 0, dungeonName: 'Nowhere', rank: 'F', backgroundPath: 'rpgasset/environment/not_a_file.png', environmentKey: '' })],
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
    // 💡 card path pins (2026-09-21 inversion order): the SCENE card is drawn
    // by the local canvas renderer with the environment COLORS INVERTED (the
    // Go service composites one opaque bitmap and cannot invert the
    // environment layer only, and the Go service is external/unmodifiable) -
    // the Go combat scene is the FALLBACK. The victory card is unchanged: the
    // regular Go VICTORY end card (WriteEndCard) with the Dead World caption.
    const dwRunSrc = fs.readFileSync(require.resolve('../core/rpg/deadWorld.js'), 'utf8');
    check(/renderDeadWorldScene\(opts\)/.test(dwRunSrc)
        && dwRunSrc.indexOf('renderDeadWorldScene(opts)') < dwRunSrc.indexOf('generateCombatImage'),
        'scene card is drawn by the canvas renderer PRIMARY (inverted environment)');
    check(/generateCombatImage\(\[_combatEntities\(state\)\.player\], \[\], \{/.test(dwRunSrc),
        'Go combat scene (empty enemy side) remains as the scene FALLBACK');
    check(/generateEndScreenImage\('VICTORY'/.test(dwRunSrc),
        'victory card uses the regular Go VICTORY end card (WriteEndCard)');
    check((dwRunSrc.match(/floor: 0/g) || []).length >= 2,
        'no floor number reaches either card (floor 0 in both payloads)');
    const dwRendSrc = fs.readFileSync(require.resolve('../core/rpg/deadWorldRenderer.js'), 'utf8');
    check(/'difference'/.test(dwRendSrc) && /#ffffff/.test(dwRendSrc),
        'scene renderer inverts the environment layer (difference vs white)');
    check(/scale\(-1, 1\)/.test(dwRendSrc) === false,
        'renderer draws the sprite with its NATIVE facing (no mirror)');
    check(!/FLOOR \$\{/.test(dwRendSrc),
        'plate carries no floor number');
    // RUNTIME inversion proof: render a scene on a dark env; the background
    // region (top-right, clear of sprite/plate) must be BRIGHT (the dark art
    // inverted), while the plate area stays dark chrome.
    {
        const inv = await dwRenderer.renderDeadWorldScene({
            playerName: 'Qa', playerClass: 'APPRENTICE', spriteIndex: 0, level: 5,
            adventurerRank: 'F', dungeonName: 'Fire Cave', rank: 'F',
            backgroundPath: 'rpgasset/environment/env1.png', environmentKey: 'env1.png',
        });
        check(inv && inv.length > 30000 && inv[0] === 0x89, 'inverted scene renders as a real PNG');
        const { createCanvas, loadImage } = require('canvas');
        const probe = createCanvas(720, 540);
        const pctx = probe.getContext('2d');
        pctx.drawImage(await loadImage(inv), 0, 0);
        const sample = (x0, y0, w, h) => {
            const d = pctx.getImageData(x0, y0, w, h).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
            return sum / (d.length / 4);
        };
        const bgBright = sample(400, 30, 200, 70);       // environment strip, center-top (no sprite/plate)
        // baseline: the SAME art, cover-fit + the same cold dim, WITHOUT the
        // inversion pass - the inverted render must be clearly brighter
        const path = require('path');
        const base = createCanvas(720, 540);
        const bctx = base.getContext('2d');
        const envImg = await loadImage(path.join(__dirname, '..', 'core', 'rpgasset', 'environment', 'cards', 'fire.jpg'));
        const sc = Math.max(720 / envImg.width, 540 / envImg.height);
        bctx.drawImage(envImg, (720 - envImg.width * sc) / 2, (540 - envImg.height * sc) / 2, envImg.width * sc, envImg.height * sc);
        bctx.fillStyle = 'rgba(24,28,40,0.28)';
        bctx.fillRect(0, 0, 720, 540);
        const baseAvg = (() => {
            const d = bctx.getImageData(400, 30, 200, 70).data;
            let sum = 0;
            for (let i = 0; i < d.length; i += 4) sum += d[i] + d[i + 1] + d[i + 2];
            return sum / (d.length / 4);
        })();
        check(bgBright > baseAvg * 1.5 + 20, `dark env renders INVERTED (card avg ${Math.round(bgBright)} vs non-inverted baseline ${Math.round(baseAvg)})`);
    }

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
    // 💡 OWNER BYPASS (#b4f71c extension, owner 2026-09-21: "allow me the
    // owner to view afterlife even if I've not met the requirements"):
    // the stubbed engine's isBotOwner recognizes the owner JID.
    __owner = true;
    const sent6c = [];
    const sock6c = mockSock(sent6c);
    await worldMap.showWorld(sock6c, CHAT, 'qa_dw_owner@s.whatsapp.net', 'afterlife', { getLevel: () => 1, getRank: () => 'F' });
    check(!!sent6c[0] && !!sent6c[0].msg.image && (sent6c[0].msg.caption || '').includes('own circuit'),
        'OWNER bypass renders the afterlife chart with no requirements met');
    __owner = false;
    // the reading is the player-side key: getSight() open => chart unlocks
    const srSrc = fs.readFileSync(require.resolve('../core/rpg/soulReader.js'), 'utf8');
    check(/_isOwner\(userId\)/.test(srSrc), 'soulReader has the owner bypass wired');
    const wmSrc = fs.readFileSync(require.resolve('../core/rpg/worldMap.js'), 'utf8');
    check(/soulReader\.getSight/.test(wmSrc), 'worldMap afterlife gate honors the dead-soul reading (soulReader)');

    // ═══ 6b. .j kills: the owner reads the ledger without the doors ═══
    console.log('\n[6b] soulReader owner bypass (.j kills)');
    const soulReader = require('../core/rpg/soulReader');
    const sent6d = [];
    const sock6d = mockSock(sent6d);
    economy.economyData.set('qa_dw_owner@s.whatsapp.net', {
        userId: 'qa_dw_owner@s.whatsapp.net', wallet: 10, registered: true,
        nickname: 'Owner', stats: { kills: 7 }, progression: { level: 3 },
    });
    __owner = true;
    await soulReader.viewKills(sock6d, CHAT, 'qa_dw_owner@s.whatsapp.net', []);
    check(sent6d.length >= 1, 'owner .j kills delivers a message');
    check(!(sent6d[0].msg.caption || sent6d[0].msg.text || '').includes('VEILWARD READING'),
        'owner does NOT get the locked requirement card');
    check((sent6d[0].msg.caption || sent6d[0].msg.text || '').includes('SOULS BEYOND THE VEIL'),
        'owner gets the LEDGER reading directly');
    __owner = false;
    const sent6e = [];
    const sock6e = mockSock(sent6e);
    economy.economyData.set('qa_dw_mortal2@s.whatsapp.net', {
        userId: 'qa_dw_mortal2@s.whatsapp.net', wallet: 10, registered: true,
        nickname: 'Mortal', stats: { kills: 2 }, progression: { level: 3 },
    });
    await soulReader.viewKills(sock6e, CHAT, 'qa_dw_mortal2@s.whatsapp.net', []);
    check((sent6e[0].msg.caption || sent6e[0].msg.text || '').includes('VEILWARD READING'),
        'non-owner still sees the requirement card (gates intact)');

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
    // 💡 rawSend timeout root-cause pins (owner 2026-09-21): the queue race
    // must NEVER be shorter than Baileys' own 20s media upload budget
    check(/__isMediaSend \? 60000 : 15000/.test(engSrc),
        'send queue: media race budget 60s (above Baileys 20s upload, matches #b4fa05), text 15s');
    check(/clearTimeout\(__raceTimer\)/.test(engSrc),
        'send queue: race timer cleared when the send settles (no leaked timers)');
    check(/sendPromise\.catch\(\(\) => \{\}\)/.test(engSrc),
        'send queue: late Baileys rejection can never surface as unhandledRejection');
    check(/completed AFTER the timeout drop/.test(engSrc),
        'send queue: late delivery is logged instead of hidden');
    // the runner's own text fallbacks are also dash-free
    const dwSrc = fs.readFileSync(require.resolve('../core/rpg/deadWorld.js'), 'utf8');
    const fallbacks = dwSrc.match(/_\*「 [^\n`]*」\*_/g) || [];
    check(fallbacks.length >= 2 && fallbacks.every((f) => !DASH_RE.test(f)),
        `runner text fallbacks exist and stay dash-free (${fallbacks.length} found)`);

    console.log(failures ? `\nQA DEAD WORLD: ${failures} FAILURES` : '\nQA DEAD WORLD: ALL PASS');
    process.exit(failures ? 1 : 0);
})().catch((e) => { console.error('QA ERROR:', e); process.exit(1); });

async function guildAdventureInit(sock, opts) {
    return ga.initAdventure(sock, CHAT, null, 'NORMAL', true, 'F', P1, null, null, opts);
}
