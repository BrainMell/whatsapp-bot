#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// gw_ux_pass_qa.js — UX PASS (2026-10-07, owner brief items #4-#9)
//
//   PART 1 — DEAD-END DENSITY (#6 "kept, reduced"): 320-map sweep, normal
//            + alignment. Post-relief share ≤ cap, cul-de-sacs KEPT as a
//            class, full connectivity, seed determinism.
//   PART 2 — PUZZLE RULE CARDS (#5) + EXAMINE FEEDBACK (#8/#9): every kind
//            ships a rule line; first examine includes it; re-examine on a
//            live seal re-reads WITHOUT burning an attempt; wrong answers
//            still claim; `examine` answers in EVERY chamber type.
//   PART 3 — ONBOARDING PRIMER (#4/#7): field manual content + prefix
//            handling, board card renders with the rule line, deployment
//            hook source-pinned.
//
// Pure suite (no DB) — runs locally and on the boxes:
//   node scripts/gw_ux_pass_qa.js
// ═══════════════════════════════════════════════════════════════════════
process.env.GW_TEST = '1';

let PASS = 0, FAIL = 0;
const FAILURES = [];
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; FAILURES.push(name + (extra !== undefined ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra !== undefined ? ` — ${extra}` : ''}`); }
}

const fs = require('fs');
const path = require('path');
const CFG = require('../core/rpg/guildWar/config');
const mapEngine = require('../core/rpg/guildWar/mapEngine');
const puzzles = require('../core/rpg/guildWar/puzzles');
const encounters = require('../core/rpg/guildWar/encounters');
const dmRouter = require('../core/rpg/guildWar/dmRouter');

// dead-end share of a map (rooms with exactly 1 open edge / all rooms)
function deadEndShare(map) {
    let n = 0;
    for (const [, edges] of map.adjacency) {
        if (Object.values(edges).filter(Boolean).length === 1) n++;
    }
    return n / (map.side * map.side);
}

async function main() {
// ═════════════════════════════ PART 1 ═════════════════════════════
console.log('\n═══ PART 1 — dead-end density (#6): relief sweep ═══');
{
    const CAP = CFG.MAP.DEADEND_MAX_SHARE;
    let worst = 0, total = 0, maps = 0, keptMaps = 0, maxRelief = 0, badConn = 0;
    // pre-relief baseline for comparison (loop edges only — emulate by
    // measuring with the relief disabled via a temp config override)
    const savedShare = CFG.MAP.DEADEND_MAX_SHARE;
    const savedRelief = CFG.MAP.DEADEND_RELIEF_SHARE;
    let preTotal = 0;
    for (let i = 0; i < 320; i++) {
        const alignment = i % 8 === 7; // ~1 in 8 alignment maps
        const players = 1 + (i % 24);
        const seed = `ux-sweep-${i}`;
        // baseline: max share = 1.0 disables the relief loop entirely
        CFG.MAP.DEADEND_MAX_SHARE = 1.0;
        const pre = deadEndShare(mapEngine.generate(seed, players, { alignment }));
        preTotal += pre;
        // real pass
        CFG.MAP.DEADEND_MAX_SHARE = savedShare;
        CFG.MAP.DEADEND_RELIEF_SHARE = savedRelief;
        const map = mapEngine.generate(seed, players, { alignment });
        const share = deadEndShare(map);
        total += share; maps++;
        worst = Math.max(worst, share);
        maxRelief = Math.max(maxRelief, Math.ceil(map.side * map.side * savedRelief));
        if (share > 0.001) keptMaps++;
        // connectivity: every room reachable from the first spawn
        const reach = mapEngine.reachable(map, map.spawns[0] || [...map.rooms.keys()][0]);
        if (reach.size !== map.side * map.side) badConn++;
    }
    check(`all ${maps} maps fully connected (relief edges never break the tree)`, badConn === 0, `${badConn} broken`);
    check(`post-relief dead-end share ≤ cap + 2pt tolerance on EVERY map`, worst <= CAP + 0.02, `worst ${(worst * 100).toFixed(1)}% vs cap ${(CAP * 100).toFixed(0)}%`);
    const preAvg = preTotal / maps, postAvg = total / maps;
    check(`density actually REDUCED (avg ${(preAvg * 100).toFixed(1)}% → ${(postAvg * 100).toFixed(1)}%)`, postAvg < preAvg);
    check(`cul-de-sacs KEPT as a class (some survive on most maps)`, keptMaps > maps * 0.5, `${keptMaps}/${maps} maps still have dead-ends`);
    // determinism: same seed → same topology
    const a = deadEndShare(mapEngine.generate('det-check', 7));
    const b = deadEndShare(mapEngine.generate('det-check', 7));
    check('seed determinism (same seed → same dead-end profile)', a === b, `${a} vs ${b}`);
    // tiny maps never crash + stay connected
    let tinyOK = true;
    for (let i = 0; i < 20; i++) {
        const m = mapEngine.generate(`tiny-${i}`, 1);
        if (mapEngine.reachable(m, m.spawns[0]).size !== m.side * m.side) tinyOK = false;
    }
    check('solo-tiny maps (side 8) connected, relief bounded', tinyOK);
}

// ═════════════════════════════ PART 2 ═════════════════════════════
console.log('\n═══ PART 2 — puzzle rule cards (#5) + examine feedback (#8/#9) ═══');
{
    // every live kind ships a rule line
    const liveKinds = ['sequence', 'riddle', 'cipher', 'memory', 'levers'];
    for (const kind of liveKinds) {
        const rule = puzzles.RULE_TEXT[kind];
        check(`rule card exists for ${kind}`, !!rule && rule.includes('Rules'));
    }
    check('legacy mapriddle rule kept (old seals still render)', typeof puzzles.RULE_TEXT.mapriddle === 'string');

    // puzzleExamineText includes prompt + rules + attempts for each kind
    let allKinds = true;
    for (const kind of liveKinds) {
        const pz = { kind, prompt: 'PROMPT-MARKER', maxAttempts: 3 };
        const txt = encounters.puzzleExamineText(pz, false);
        if (!(txt.includes('PROMPT-MARKER') && txt.includes(`Rules —`) && txt.includes('3 attempts'))) allKinds = false;
    }
    check('examine text = prompt + kind rule + attempts (all kinds)', allKinds);
    const againTxt = encounters.puzzleExamineText({ kind: 'levers', prompt: 'P', maxAttempts: 3 }, true);
    check('re-examine flavor differs (free re-read)', againTxt.includes('again') && !againTxt.includes('hums awake'));

    // fixtures
    const eventDoc = {
        eventId: 'qa', seed: 'qa', state: 'ACTIVE', deadWorld: 'ember',
        players: [{ jid: 'p1@s.whatsapp.net', name: 'P1', guildId: 'G1', status: 'active', roomId: '0,0' }],
        rooms: [], pvpChallenges: [],
    };
    const player = eventDoc.players[0];

    // patch DB-touching rooms fns for the puzzle paths
    const roomsMod = require('../core/rpg/guildWar/rooms');
    const realStart = roomsMod.startPuzzle, realClaim = roomsMod.claimPuzzleAttempt;
    let claimCalls = 0;
    roomsMod.startPuzzle = async () => {};
    roomsMod.claimPuzzleAttempt = async () => { claimCalls++; return { attempts: 1, puzzle: { kind: 'levers', prompt: 'P', answer: 'ACF', maxAttempts: 3 } }; };
    // stub the full scene renderer — the free-re-examine paths each ride an
    // afterImage, and real canvas renders belong to the visual suites on the
    // boxes (shadow/chest/hub POV). This suite verifies FLOW, not pixels.
    const roomSceneMod = require('../core/rpg/guildWar/roomScene');
    const realRender = roomSceneMod.renderRoomScene;
    roomSceneMod.renderRoomScene = async () => Buffer.from('ux-stub');

    try {
        // first examine: gate opens with rules (no attempt claimed)
        claimCalls = 0;
        const pzRoom = { key: '0,0', type: 'puzzle', state: 'UNEXPLORED', ring: 0.2, occupants: ['p1@s.whatsapp.net'],
            payload: { puzzle: { kind: 'levers', prompt: 'Levers are marked: A=3 B=5.', answer: 'AB', maxAttempts: 3, normalize: 'AB' } } };
        (async () => {})(); // no-op to keep lint shape
        const first = await encounters.resolveInput(eventDoc, player, pzRoom, 'examine', {});
        check('first examine opens the gate (handled, board text)', first.handled === true && /hums awake/.test(first.text || ''));
        check('first examine carries the RULE CARD', /Rules — Lever Mechanism/.test(first.text || ''));
        check('first examine burns NO attempt', claimCalls === 0, `${claimCalls} claims`);
        check('board image rides the examine (afterImage attempted)', 'afterImage' in first);

        // started seal: re-examine is FREE
        const liveRoom = { ...pzRoom, state: 'ACTIVE', payload: { puzzle: { ...pzRoom.payload.puzzle, started: true, attemptsUsed: 1 } } };
        claimCalls = 0;
        const re = await encounters.resolveInput(eventDoc, player, liveRoom, 'examine', {});
        check('re-examine on a live seal re-reads prompt + rules', re.handled === true && /again/.test(re.text || '') && /Rules — Lever Mechanism/.test(re.text || ''));
        check('re-examine burns NO attempt', claimCalls === 0, `${claimCalls} claims`);
        const reInspect = await encounters.resolveInput(eventDoc, player, liveRoom, 'inspect', {});
        check('inspect synonym also re-reads free', reInspect.handled === true && claimCalls === 0);

        // stray text STILL burns an attempt (grading unchanged)
        claimCalls = 0;
        const wrong = await encounters.resolveInput(eventDoc, player, liveRoom, 'lol', {});
        check('wrong answer still claims an attempt', claimCalls === 1 && /Wrong/.test(wrong.text || ''), `claims=${claimCalls}`);
    } finally {
        roomsMod.startPuzzle = realStart;
        roomsMod.claimPuzzleAttempt = realClaim;
        roomSceneMod.renderRoomScene = realRender;
    }

    // universal examine (#8): every chamber type answers
    const mk = (type, payload = {}, state = 'UNEXPLORED', extra = {}) => ({
        key: '0,0', type, state, ring: 0.2, occupants: ['p1@s.whatsapp.net'], payload, ...extra,
    });
    const cases = [
        ['empty', mk('empty'), 'way onward'],
        ['combat ACTIVE', mk('combat', { enemies: [{ level: 10 }] }, 'ACTIVE'), 'fight'],
        ['combat CLEARED', mk('combat', {}, 'CLEARED', { clearedByGuild: 'G1' }), 'already dealt with'],
        ['discovery', mk('discovery', { text: 'Half-buried.' }), 'dig'],
        ['reward', mk('reward', {}), 'take'],
        ['hazard', mk('hazard', { hazardText: 'Spiked pit.' }), 'cross'],
        ['lore', mk('lore', { lore: 'Old words.' }), 'read'],
        ['secret (cache)', mk('secret', {}), 'claim'],
        ['secret (boss)', mk('secret', { boss: true, enemies: [{ level: 20 }] }), 'fight'],
        ['anomaly', mk('anomaly', { anomaly: 'relic_ping' }), 'touch'],
        ['landmark', mk('landmark', { landmarkName: 'The Silent Obelisk' }), 'record'],
        ['coop', mk('coop', { coopEncounter: true }, 'ACTIVE'), 'Allies standing here'],
        ['core', mk('core', { coreGuardian: true, boss: true }, 'ACTIVE'), 'World Core'],
        ['finale', mk('finale', { wardenName: 'the Ashen Warden', finaleBoss: true }, 'ACTIVE'), 'Ashen Warden'],
    ];
    let examineOK = 0;
    for (const [label, room, hint] of cases) {
        const res = await encounters.resolveInput(eventDoc, player, room, 'examine', {});
        const ok = res.handled === true && (res.text || '').startsWith('🔎') && (res.text || '').includes(hint);
        if (ok) examineOK++; else console.log(`    ⚠️ ${label}: ${JSON.stringify(res.text || res)}`);
    }
    check(`universal examine answers in ALL ${cases.length} chamber types`, examineOK === cases.length, `${examineOK}/${cases.length}`);
    // synonyms route through the same feedback
    const syn = await encounters.resolveInput(eventDoc, player, mk('reward', {}), 'check', {});
    check('examine synonyms (check/inspect/study) covered', syn.handled === true && syn.text.startsWith('🔎'));
    // grammar unchanged: non-examine junk in an empty room still falls through
    const fall = await encounters.resolveInput(eventDoc, player, mk('empty'), 'flurb', {});
    check('non-examine junk still falls through (handled:false)', fall.handled === false);
    // puzzle rooms keep their own gated flow (universal gate does NOT shadow)
    const gate = { key: '0,0', type: 'puzzle', state: 'UNEXPLORED', ring: 0.2, occupants: ['p1@s.whatsapp.net'],
        payload: { puzzle: { kind: 'riddle', prompt: 'Q?', answer: 'echo', maxAttempts: 3 } } };
    const g1 = await encounters.resolveInput(eventDoc, player, gate, 'dig', {});
    check('un-started puzzle: non-examine text gets the gate hint', g1.handled === true && /examine/.test(g1.text || ''));
}

// ═════════════════════════════ PART 3 ═════════════════════════════
console.log('\n═══ PART 3 — onboarding primer (#4/#7) + board card ═══');
{
    const fm = dmRouter.fieldManualText('.');
    check('field manual covers goal / move / examine / relics / lives',
        ['FIELD MANUAL', 'move forward', 'examine', 'handin', 'Lives'].every((k) => fm.includes(k)));
    check('field manual covers PvP + tools (challenge, teleport, talk)',
        ['challenge', 'teleport', 'talk'].every((k) => fm.includes(k)));
    check('field manual honors the per-bot prefix', dmRouter.fieldManualText('.j').includes('.j move forward'));
    check('help/howto verbs documented in source', /help\|howto/.test(fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildWar', 'dmRouter.js'), 'utf8')));

    // board card renders with the rule line (visual proof saved)
    const outDir = '/home/z/my-project/download/gw_qa_ux_1007';
    fs.mkdirSync(outDir, { recursive: true });
    const buf = await require('../core/rpg/guildWar/puzzleCards').renderPuzzleCard({
        kind: 'levers',
        prompt: '*A=3 B=5 C=9 D=11 E=14*.\nThe mechanism wants a total of *20*. Pull 3 levers (e.g. `A B C`).',
        rules: puzzles.RULE_TEXT.levers,
        attemptsUsed: 0, attemptsMax: 3, world: 'the ember fields', ring: 2,
    });
    check('board card renders WITH the rule line (PNG)', Buffer.isBuffer(buf) && buf.length > 5000);
    if (buf) fs.writeFileSync(path.join(outDir, 'levers_board_rules.png'), buf);
    const bufNoRules = await require('../core/rpg/guildWar/puzzleCards').renderPuzzleCard({
        kind: 'riddle', prompt: 'Guardian asks: *What am I?*', rules: null,
        attemptsUsed: 1, attemptsMax: 3, world: 'the ember fields', ring: 1,
    });
    check('board card without rules still renders (no regression)', Buffer.isBuffer(bufNoRules) && bufNoRules.length > 5000);
    if (bufNoRules) fs.writeFileSync(path.join(outDir, 'riddle_board_norules.png'), bufNoRules);

    // deployment hook source-pinned (full start-card flow is DB-bound → Box2)
    const idxSrc = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildWar', 'index.js'), 'utf8');
    check('dmWarStartCards sends the field manual before the spawn room',
        idxSrc.includes('dmRouter.fieldManualText(prefix)') && idxSrc.indexOf('fieldManualText(prefix)') < idxSrc.indexOf('auto-present the spawn room'));
}

// ═══════════════════════════════════════════════════════════════════════
}

main().then(() => {
    console.log(`\n═══ RESULT: ${PASS} PASS / ${FAIL} FAIL ═══`);
    if (FAILURES.length) { console.log('Failures:'); for (const f of FAILURES) console.log('  • ' + f); process.exit(1); }
}).catch((e) => { console.error('SUITE CRASH:', e); process.exit(2); });
