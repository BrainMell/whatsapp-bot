#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// gw_puzzle_retry_qa.js — RUINS PUZZLE FIXES (owner brief 2026-10-08)
//
//   FIX #1 RETRY CARD: a wrong answer while the question stage is LIVE
//            re-sends the QUESTION CARD (board) — never the map + nav +
//            "type examine" stack that read like a restart.
//   FIX #2 EJECT: exhausting the attempts ejects the player to the PREVIOUS
//            chamber (flee-style) instead of restarting the seal in place.
//   FIX #3 OBJECTIVES: lore halls advertise `read` (+GP), landmarks
//            advertise `record` (+GP); started seals never re-print
//            "Type examine to study it".
//   FIX #4 MAP KEY: room-type symbols deconflicted (warden ❖ ≠ hazard ☠,
//            landmark ▼ ≠ "▲ you") and the legend covers EVERY drawn glyph.
//
// Pure suite (no DB) — rooms/state/points/feed are monkey-patched on the
// require cache; roomScene renders are stubbed. Runs locally and on boxes:
//   node scripts/gw_puzzle_retry_qa.js
// ═══════════════════════════════════════════════════════════════════════
process.env.GW_TEST = '1';

let PASS = 0, FAIL = 0;
const FAILURES = [];
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; FAILURES.push(name + (extra !== undefined ? ` — ${extra}` : '')); console.log(`  ❌ ${name}${extra !== undefined ? ` — ${extra}` : ''}`); }
}

const GW = '/home/z/my-project/whatsapp-bot/core/rpg/guildWar';
const encounters = require(`${GW}/encounters`);
const rooms = require(`${GW}/rooms`);
const state = require(`${GW}/state`);
const points = require(`${GW}/points`);
const feed = require(`${GW}/feed`);
const roomScene = require(`${GW}/roomScene`);
const mapRenderer = require(`${GW}/mapRenderer`);
const dmRouterSrc = require('fs').readFileSync(`${GW}/dmRouter.js`, 'utf8');

// ── stub the DB-facing collaborators (same require-cache objects) ──
const calls = { leaveRoom: [], updatePlayer: [], resetAttempts: 0, award: [], feed: [] };
rooms.leaveRoom = async (eventId, jid, roomKey) => { calls.leaveRoom.push({ eventId, jid, roomKey }); };
state.updatePlayer = async (eventId, jid, cond, upd) => { calls.updatePlayer.push({ eventId, jid, upd }); return {}; };
rooms.resetPuzzleAttempts = async () => { calls.resetAttempts++; return {}; };
points.award = async (eventId, jid, gp, kind) => { calls.award.push({ gp, kind }); return { awarded: gp }; };
feed.queue = (eventId, tier, text) => { calls.feed.push({ tier, text }); };
const BOARD = Buffer.from('puzzle-board-scene');
roomScene.renderRoomScene = async () => BOARD;

// ── fixtures ──
function fixture(over = {}) {
    const puzzle = {
        kind: 'levers', prompt: '5 levers are marked: A=3 B=5 C=4 D=6 E=7.',
        answer: 'ACF'.slice(0, 3), maxAttempts: 3, started: true, attemptsUsed: 0,
        ...over.puzzle,
    };
    delete over.puzzle;
    const room = {
        key: '5,4', type: 'puzzle', state: 'ACTIVE', ring: 0.2,
        payload: { puzzle }, ...over.room,
    };
    delete over.room;
    const player = {
        jid: 'tester@s.whatsapp.net', name: 'Tester', roomId: '5,4', prevRoomId: '4,4',
        guildId: 'G1', guildName: 'G1', stats: { maxHp: 100 }, discovered: ['5,4', '4,4'], ...over.player,
    };
    delete over.player;
    const eventDoc = { eventId: 'qa-ev', seed: 'qa-seed', deadWorld: 0, type: 'normal', rooms: [room], players: [player], ...over };
    return { eventDoc, player, room, puzzle };
}

async function main() {
console.log('\n═══ FIX #1 — wrong answer re-sends the QUESTION card ═══');
{
    // claim returns attempts=1 (one wrong answer already counted)
    let { eventDoc, player, room, puzzle } = fixture();
    rooms.claimPuzzleAttempt = async () => ({ attempts: 1, puzzle });
    const res = await encounters.resolveInput(eventDoc, player, room, 'ACX', {});
    check('handled', res.handled === true);
    check('no `represent` (map+nav stack gone)', res.represent !== true, `represent=${res.represent}`);
    check('no `eject` on a plain wrong answer', res.eject !== true);
    check('board re-sent as afterImage', Buffer.isBuffer(res.afterImage) && res.afterImage.equals(BOARD), typeof res.afterImage);
    check('verdict text with attempts left', /❌ Wrong\. 2 attempts left\./.test(res.text || ''), res.text);
    check('levers ship no symbols line', res.afterText === undefined, res.afterText);

    // symbol puzzle: the copy-paste line rides the retry
    ({ eventDoc, player, room, puzzle } = fixture({ puzzle: { kind: 'sequence', answer: 'ᚠᚢᚦ', symbols: ['ᚠ', 'ᚢ', 'ᚦ'] } }));
    rooms.claimPuzzleAttempt = async () => ({ attempts: 2, puzzle });
    const resSeq = await encounters.resolveInput(eventDoc, player, room, 'ᚠᚢ', {});
    check('sequence retry carries the copy-paste symbols line', resSeq.afterText === 'ᚠ ᚢ ᚦ', resSeq.afterText);
    check('sequence retry also drops the map stack', resSeq.represent !== true);
}

console.log('\n═══ FIX #2 — exhaustion EJECTS to the previous chamber ═══');
{
    let { eventDoc, player, room, puzzle } = fixture();
    calls.leaveRoom.length = 0; calls.updatePlayer.length = 0; calls.resetAttempts = 0;
    rooms.claimPuzzleAttempt = async () => ({ attempts: 3, puzzle }); // maxAttempts=3 → exhausted
    const res = await encounters.resolveInput(eventDoc, player, room, 'XXX', {});
    check('eject flag set', res.eject === true, `eject=${res.eject}`);
    check('no represent when ejected', res.represent === false, `represent=${res.represent}`);
    check('seal reset (fresh attempts on return)', calls.resetAttempts === 1);
    check('player row moved to previous chamber', calls.updatePlayer.some(u => u.upd && u.upd.roomId === '4,4'),
        JSON.stringify(calls.updatePlayer));
    check('player left the puzzle room occupancy', calls.leaveRoom.some(l => l.roomKey === '5,4'));
    check('verdict names the ejection + shock', /flings you back to the previous chamber/.test(res.text || '') && /-\d+ HP/.test(res.text || ''), res.text);
    check('verdict promises fresh attempts', /3 fresh attempts/.test(res.text || ''));

    // spawn chamber (no previous room): in-place reset fallback
    ({ eventDoc, player, room, puzzle } = fixture({ player: { prevRoomId: null } }));
    calls.updatePlayer.length = 0;
    const res2 = await encounters.resolveInput(eventDoc, player, room, 'XXX', {});
    check('no prev chamber → in-place reset fallback', res2.eject === false && res2.represent === true);
    check('fallback verdict stays in place', /first inscription glows anew/.test(res2.text || ''), res2.text);
    check('player row NOT moved', !calls.updatePlayer.some(u => u.upd && u.upd.roomId), JSON.stringify(calls.updatePlayer));
}

console.log('\n═══ FIX #2b — correct answer: solved, never restarts ═══');
{
    const { eventDoc, player, room, puzzle } = fixture();
    rooms.claimPuzzleAttempt = async () => ({ attempts: 1, puzzle });
    rooms.clearRoom = async () => ({ won: true });
    const res = await encounters.resolveInput(eventDoc, player, room, 'ACF', {});
    check('correct answer solves', /clicks open/.test(res.text || ''), res.text);
    check('solved scene rides the result', Buffer.isBuffer(res.afterImage));
    check('no map-stack represent on solve', res.represent !== true && res.eject !== true);

    // duplicate answer after the solve: single inert line, zero images
    rooms.claimPuzzleAttempt = async () => null;
    const res2 = await encounters.resolveInput(eventDoc, player, room, 'ACF', {});
    check('post-solve duplicate gets a bare inert line', /inert/.test(res2.text || '') && !res2.afterImage && res2.represent !== true, JSON.stringify({ t: res2.text, ai: !!res2.afterImage }));
}

console.log('\n═══ FIX #3 — room objectives are stated on entry ═══');
{
    const mk = (type, payload) => fixture({ room: { key: '2,2', type, state: 'ACTIVE', payload } });
    // lore hall (screenshot #2: the stele room)
    const lore = mk('lore', { lore: 'The air tastes of tide-drowned stone. Something great fell here.' });
    const loreText = await encounters.onRoomEnter(lore.eventDoc, lore.player, lore.room);
    check('lore advertises `read`', /Type `read`/.test(loreText), loreText);
    check('lore promises +GP', /\(\+GP\)/.test(loreText));
    check('lore mentions examine for a closer look', /`examine`/.test(loreText));
    // landmark
    const lm = mk('landmark', { landmarkName: 'The Sunken Arch', lore: 'a marker of the old world.' });
    const lmText = await encounters.onRoomEnter(lm.eventDoc, lm.player, lm.room);
    check('landmark advertises `record`', /Type `record`/.test(lmText), lmText);
    check('landmark promises +GP', /\(\+GP\)/.test(lmText));
    // puzzle: mid-question entry text must NOT re-print the gate verb line
    const pzStarted = mk('puzzle', { puzzle: { kind: 'riddle', started: true, attemptsUsed: 1, prompt: 'q', answer: 'echo', maxAttempts: 3 } });
    const pzText = await encounters.onRoomEnter(pzStarted.eventDoc, pzStarted.player, pzStarted.room);
    check('started seal says mid-puzzle', /mid-puzzle/.test(pzText), pzText);
    check('started seal never re-prints "Type examine to study it"', !/Type `examine` to study it/.test(pzText), pzText);
    check('started seal still offers the free re-read', /`examine` to re-read/.test(pzText));
    // fresh seal keeps the original gate line
    const pzFresh = mk('puzzle', { puzzle: { kind: 'riddle', started: false, attemptsUsed: 0, prompt: 'q', answer: 'echo', maxAttempts: 3 } });
    const fzText = await encounters.onRoomEnter(pzFresh.eventDoc, pzFresh.player, pzFresh.room);
    check('fresh seal keeps "Type examine to study it"', /Type `examine` to study it/.test(fzText), fzText);
}

console.log('\n═══ FIX #4 — map symbols deconflicted + legend complete ═══');
{
    const G = mapRenderer.TYPE_GLYPH;
    check('warden ❖ (no longer ☠)', G.finale === '❖', G.finale);
    check('warden glyph differs from hazard', G.finale !== G.hazard);
    check('landmark ▼ (no longer the "▲ you" triangle)', G.landmark === '▼', G.landmark);
    check('landmark glyph differs from the you-marker', G.landmark !== '▲');
    // legend completeness: EVERY drawn glyph is explained
    const L = mapRenderer.LEGEND || '';
    const missing = Object.entries(G).filter(([, g]) => g && !L.includes(g)).map(([t, g]) => `${t}:${g}`);
    check('legend explains every room glyph', missing.length === 0, missing.join(', '));
    check('legend names the warden', /❖ warden/.test(L));
    check('legend names landmarks', /▼ landmark/.test(L));
    check('legend names inscribed halls', /✺ inscribed/.test(L));
    check('legend keeps the you-marker', /▲ you/.test(L));
    // every glyph stays inside the DejaVu-verified whitelist (CARD-SYSTEM §6)
    const WL = new Set(['✦', '✺', '❄', '♨', '⚔', '☠', '✥', '✚', '▲', '▼', '◈', '✷', '⚡', '❖', '⨀', '⚑']);
    const off = Object.values(G).filter((g) => g && !WL.has(g));
    check('all glyphs DejaVu-whitelisted', off.length === 0, off.join(' '));
    // dmRouter eject wiring source-pinned
    check('dmRouter handles res.eject', /res\.eject/.test(dmRouterSrc));
    check('dmRouter re-presents the fallback room post-eject', /post-eject presentation/.test(dmRouterSrc));
}

console.log(`\n════════════════════════════════════════`);
console.log(`RESULT: ${PASS} passed, ${FAIL} failed`);
if (FAIL) { console.log('FAILURES:\n - ' + FAILURES.join('\n - ')); process.exit(1); }
process.exit(0);
}

main().catch((e) => { console.error('HARNESS CRASH:', e.stack || e); process.exit(1); });
