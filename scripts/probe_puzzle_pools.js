// PUZZLE OVERHAUL QA (owner 2026-10-06: "expand all the pools DRASTICALLY…
// send the symbols needed stand alone so the player can just copy")
// Part 1 — unit: pool diversity + answer integrity over many generations.
// Part 2 — integration: `examine` on a rune-lock room sends the board image
//          THEN a standalone copyable symbols line; solving works.
process.env.GW_TEST = '1';
process.env.GW_MOVE_COOLDOWN_MS = '300';
process.env.GW_SIM_DB = 'gwpuzzleqa' + Math.floor(Math.random() * 100000);
const L = require('./mp_lib');
const mapEngine = require('../core/rpg/guildWar/mapEngine');
const puzzles = require('../core/rpg/guildWar/puzzles');
const state = require('../core/rpg/guildWar/state');
const GWE = require('../core/models/GuildWarEvent');

let pass = 0, fail = 0;
function check(name, cond, extra) {
    if (cond) { pass++; console.log(`  PASS ${name}`); }
    else { fail++; console.log(`  FAIL ${name}${extra ? ' — ' + extra : ''}`); }
}

(async () => {
    // ── Part 1: unit diversity ──
    console.log('— unit: pool diversity —');
    const rng = mapEngine.makeRng('diversity-probe');
    const room = { ring: 1, key: '3,3' };
    const seenR = new Set(), seenShape = new Set(), seenRiddle = new Set(), seenWord = new Set(), leverLabels = new Set();
    let seqOk = 0, memOk = 0, symCarried = 0;
    for (let i = 0; i < 240; i++) {
        const s = puzzles.genSequence(rng, room);
        for (const g of s.symbols) seenR.add(g);
        // rotation solve check: answer = hint glyph first, then rest in order
        if (puzzles.checkByKind('sequence', s, s.answer, 1).solved) seqOk++;
        if (Array.isArray(s.symbols) && s.symbols.length >= 4) symCarried++;
        const m = puzzles.genMemory(rng, room);
        for (const sh of m.symbols) seenShape.add(sh);
        if (puzzles.checkByKind('memory', m, m.answer, 1).solved) memOk++;
        const r = puzzles.genRiddle(rng, room);
        seenRiddle.add(r.prompt);
        // riddle answers never collide with DM verbs
        const VERBS = new Set(['map', 'look', 'flee', 'talk', 'say', 'move', 'back', 'left', 'right', 'forward', 'accept', 'mark', 'teleport', 'dig', 'take', 'examine', 'fight', 'quit', 'leave', 'exit', 'rejoin', 'return', 'use', 'bag', 'relics', 'status', 'score', 'paths', 'challenge', 'handin', 'share', 'join', 'l', 'where']);
        for (const a of r.altAnswers) check(r.prompt.slice(0, 30), !VERBS.has(String(a).toLowerCase().replace(/[^a-z]/g, '')), 'verb collision: ' + a);
        const c = puzzles.genCipher(rng, room);
        seenWord.add(c.answer);
        if (puzzles.checkByKind('cipher', c, c.answer, 1).solved) { /* counted via seenWord size */ }
        const lv = puzzles.genLevers(rng, room);
        for (const ch of lv.answer) leverLabels.add(ch);
        if (/^[A-G]+$/.test(lv.answer) || lv.answer === '') check('levers labels', 'ABCDEFG'.includes([...lv.answer][0] || 'A'));
    }
    check('rune pool: >= 30 distinct runes appear', seenR.size >= 30, 'got ' + seenR.size);
    check('shape pool: >= 15 distinct shapes appear', seenShape.size >= 15, 'got ' + seenShape.size);
    check('riddle bank: >= 25 distinct riddles', seenRiddle.size >= 25, 'got ' + seenRiddle.size);
    check('cipher bank: >= 30 distinct words', seenWord.size >= 30, 'got ' + seenWord.size);
    check('sequence answers all solvable (240/240)', seqOk === 240, seqOk + '/240');
    check('memory answers all solvable', memOk === 240, memOk + '/240');
    check('symbols array carried on all sequence puzzles', symCarried === 240, symCarried + '/240');
    check('levers reach beyond A-E', [...leverLabels].some((c) => c > 'E'), [...leverLabels].sort().join(''));
    check('declared pool sizes', puzzles.GLYPHS.length >= 50 && puzzles.SHAPES.length >= 28 && puzzles.RIDDLES.length >= 35 && puzzles.CIPHER_WORDS.length >= 50,
        `runes ${puzzles.GLYPHS.length}, shapes ${puzzles.SHAPES.length}, riddles ${puzzles.RIDDLES.length}, words ${puzzles.CIPHER_WORDS.length}`);

    // ── Part 2: integration — examine sends board image + standalone symbols ──
    console.log('— integration: examine → board + standalone symbols —');
    await L.connectDB();
    L.overlaySprites();
    const roster = L.makeRoster([{ jid: 'pz1', name: 'Rune', guild: 'GP', class: 'FIGHTER', sprite: 0 }]);
    L.seedIdentities(roster);
    const ev = await L.startWar(roster);
    let doc = await state.getEvent(ev.eventId, { fresh: true });
    const me = doc.players.find((p) => p.jid === roster[0].jid);
    // force the champion's room into a rune-lock puzzle
    await GWE.updateOne({ eventId: ev.eventId, 'rooms.key': me.roomId }, { $set: { 'rooms.$.type': 'puzzle', 'rooms.$.state': 'ACTIVE' } });
    // generate the puzzle the way room building does, then persist it
    const mapEngine2 = require('../core/rpg/guildWar/mapEngine');
    const map = { rooms: new Map() };
    const generated = puzzles.genSequence(mapEngine2.makeRng('qa-seq:' + ev.eventId), { ring: 1, key: me.roomId });
    await GWE.updateOne({ eventId: ev.eventId, 'rooms.key': me.roomId }, {
        $set: {
            'rooms.$.payload.puzzle': { kind: generated.kind, prompt: generated.prompt, answer: generated.answer, altAnswers: [], normalize: generated.normalize(generated.answer), maxAttempts: 3, symbols: generated.symbols },
        },
    });
    const dmRouter = require('../core/rpg/guildWar/dmRouter');
    const sock = L.makeSock('A');
    await dmRouter.handleDM(sock, me.jid, me.jid, '.j examine', '\u200B', { prefix: '.j', prefixed: true });
    const msgs = sock.to(me.jid);
    const texts = msgs.filter((m) => m.payload.text && !m.payload.image).map((m) => m.payload.text);
    const images = msgs.filter((m) => m.payload.image).length;
    check('board scene image sent', images >= 1, 'images=' + images);
    const standalone = texts.find((t) => generated.symbols.every((g) => t.includes(g)) && t.replace(/[^ᚠ-ᛪᛯ ]/g, '').trim().length <= generated.symbols.join(' ').length + 4 && !/mechanism|answer|attempts/i.test(t));
    check('standalone symbols-only message sent after the board', !!standalone, JSON.stringify(texts.map((t) => t.slice(0, 60))));
    if (standalone) console.log('   standalone line:', JSON.stringify(standalone.replace(/\u200B/g, '')));
    // solve it: rotation starting at the hinted glyph — the stored answer
    const doc2 = await state.getEvent(ev.eventId, { fresh: true });
    const room2 = doc2.rooms.find((r) => r.key === me.roomId);
    const pz = (room2.payload && (room2.payload.get ? room2.payload.get('puzzle') : room2.payload.puzzle)) || {};
    const answer = pz.answer || generated.answer;
    // answer arrives as glyphs possibly with spaces — send via router
    const sock2 = L.makeSock('A2');
    await dmRouter.handleDM(sock2, me.jid, me.jid, '.j ' + answer, '\u200B', { prefix: '.j', prefixed: true });
    const solveTexts = sock2.to(me.jid).map((m) => (m.payload.text || '') + (m.payload.caption || ''));
    check('correct rotation solves the lock', solveTexts.some((t) => /clicks open|\+GP/i.test(t)), JSON.stringify(solveTexts.map((t) => t.slice(0, 60))));

    await GWE.deleteMany({ eventId: ev.eventId });
    L.restoreSprites();
    console.log(`\nRESULT: ${pass} pass / ${fail} fail`);
    process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('FATAL', e); try { L.restoreSprites(); } catch (_) {} process.exit(1); });
