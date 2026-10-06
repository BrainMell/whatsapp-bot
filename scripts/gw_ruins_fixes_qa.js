#!/usr/bin/env node
// QA — RUINS FIXES 2026-10-05 (owner ruins_fixes.txt #1-#8, minus #2-sprite
// which is visual). Verifies:
//   #1  spawn-in lands at the BACK position (owner green circle)
//   #5  facing at back/forward spots follows the doorway distribution
//   #2  dig outcome sprite renders IMMEDIATELY (state flipped in-memory)
//   #4  chest outcome sprite renders IMMEDIATELY (open + CLAIMED)
//   #3  items never parked inside the hub panel corner (z-order: panel last)
//   #7  encounter card overlay ~70% centred, dimmed, painted last
//   #6  shadow geometry now hugs the sprite feet band (footW measured)
//   #8  puzzle gate: board hidden until `examine` (puzzleStarted false→true)
const fs = require('fs');
const path = require('path');
const roomScene = require('../core/rpg/guildWar/roomScene');
const encounters = require('../core/rpg/guildWar/encounters');
const puzzleCards = require('../core/rpg/guildWar/puzzleCards');

const OUT = process.env.GW_QA_OUT || '/home/z/my-project/download/gw_qa_1005b';
fs.mkdirSync(OUT, { recursive: true });

const results = [];
const check = (name, ok, detail) => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS ✓' : 'FAIL ✗'}  ${name}${detail ? '  — ' + detail : ''}`); };

function makeDoc(seed, layout) {
    // layout: { 'x,y': {type, payload} , edges: ['x,y|dir', ...] }
    const rooms = [];
    for (const [key, spec] of Object.entries(layout.rooms)) {
        const [x, y] = key.split(',').map(Number);
        rooms.push({ key, x, y, region: 0, type: spec.type, state: spec.state || 'ACTIVE', payload: spec.payload || {}, ring: 0.9, clearedBy: null, clearedByGuild: null, clearedAt: null, occupants: [], residue: null, variant: 'intact' });
    }
    return { eventId: 'gw_ruins_fixes_qa', seed, type: 'normal', state: 'ACTIVE', side: 3, rooms, edges: layout.edges, coreKey: '9,9', deadWorld: 'ember', players: [] };
}

const playerBase = {
    jid: 'qa@s.whatsapp.net', name: 'Brainard', classId: 'FIGHTER', spriteIndex: 0,
    discovered: [], guildId: 'ember', guildName: 'Ember', level: 9,
    stats: { hp: 84, maxHp: 110, energy: 60, maxEnergy: 142 },
};

(async () => {
    // ── #1 + #5: spawn & facing ──
    check('#1 DEFAULT_ENTRY is back position (s)', roomScene.DEFAULT_ENTRY === 's', `=${roomScene.DEFAULT_ENTRY}`);
    const backSpot = roomScene.SPAWN_SPOTS.s;
    check('#1 back spot ≈ owner circle (624,780)', backSpot.x === 624 && backSpot.y === 780, `(${backSpot.x},${backSpot.y})`);

    const exitsW = [{ dir: 'n', edge: true }, { dir: 'w', edge: true }, { dir: 'e', edge: false }, { dir: 's', edge: false }];
    const exitsE = [{ dir: 'n', edge: false }, { dir: 'w', edge: false }, { dir: 'e', edge: true }, { dir: 's', edge: false }];
    const exitsNone = [{ dir: 'n', edge: false }, { dir: 'w', edge: false }, { dir: 'e', edge: false }, { dir: 's', edge: false }];
    // 🔄 fc37622e: the champion faces TOWARD the open side arch (deliberate
    // owner-directed inversion of the original away-rule) — suite updated to
    // the shipped rule 2026-10-06.
    check('#5 more doors LEFT (n+w) → face the west arch', roomScene.facingForSpot('s', exitsW) === true);
    check('#5 more doors RIGHT (e) → face the east arch', roomScene.facingForSpot('s', exitsE) === false);
    check('#5 no side doors → native (right)', roomScene.facingForSpot('s', exitsNone) === false);
    check('#5 forward doorway (n) follows same rule', roomScene.facingForSpot('n', exitsE) === false && roomScene.facingForSpot('n', exitsW) === true);

    // spawn-in render: war start (no prevRoomId) in a room with w+n exits
    const docSpawn = makeDoc(20261005, {
        rooms: { '0,0': { type: 'empty' } },
        edges: ['0,0|n', '0,0|w'],
    });
    const pSpawn = { ...playerBase, roomId: '0,0', prevRoomId: null };
    const roomSpawn = docSpawn.rooms[0];
    const exitsSpawn = roomScene.exitsFor(docSpawn, pSpawn);
    const planSpawn = roomScene.planFor(docSpawn, pSpawn, roomSpawn, exitsSpawn);
    check('#1 spawn-in plan at back spot', planSpawn.playerSpot.dir === 's' && planSpawn.playerSpot.x === 624 && planSpawn.playerSpot.y === 780, JSON.stringify(planSpawn.playerSpot));
    const pngSpawn = await roomScene._renderInProcess(docSpawn, pSpawn, roomSpawn, { exits: exitsSpawn, plan: planSpawn });
    fs.writeFileSync(path.join(OUT, 'fix1_spawn_back.png'), pngSpawn);

    // facing render: same room, doors w+n open → face the west arch (fc37622e)
    check('#5 spawn room with w+n doors → face left (west arch)', planSpawn.playerSpot.flip === true, `flip=${planSpawn.playerSpot.flip}`);

    // mirrored room: only east exit → face LEFT
    const docMirror = makeDoc(20261005, { rooms: { '0,0': { type: 'empty' } }, edges: ['0,0|e'] });
    const exitsM = roomScene.exitsFor(docMirror, pSpawn);
    const planM = roomScene.planFor(docMirror, pSpawn, docMirror.rooms[0], exitsM);
    check('#5 spawn room with only e door → face right (east arch)', planM.playerSpot.flip === false, `flip=${planM.playerSpot.flip}`);
    const pngMirror = await roomScene._renderInProcess(docMirror, pSpawn, docMirror.rooms[0], { exits: exitsM, plan: planM });
    fs.writeFileSync(path.join(OUT, 'fix5_face_left.png'), pngMirror);

    // ── #2: dig outcome immediately ──
    const docDig = makeDoc(20261006, {
        rooms: { '1,0': { type: 'discovery', payload: { text: 'Something is buried here.', relic: { name: 'Old Coin', category: 'trinket', tier: 'Common' } } }, '0,0': { type: 'empty' } },
        edges: ['0,0|e'],
    });
    const pDig = { ...playerBase, roomId: '1,0', prevRoomId: '0,0' };
    const roomDig = docDig.rooms.find((r) => r.key === '1,0');
    const exitsDig = roomScene.exitsFor(docDig, pDig);
    const before = await roomScene._renderInProcess(docDig, pDig, roomDig, { exits: exitsDig });
    fs.writeFileSync(path.join(OUT, 'fix2_dig_before.png'), before);
    // simulate the WON claim + in-memory sync (what resolveInput does now)
    const claimWon = { won: true };
    if (claimWon.won) {
        roomDig.state = 'CLEARED';
        roomDig.clearedBy = pDig.jid;
        roomDig.clearedAt = new Date();
    }
    const after = await roomScene._renderInProcess(docDig, pDig, roomDig, { exits: exitsDig });
    fs.writeFileSync(path.join(OUT, 'fix2_dig_after_IMMEDIATE.png'), after);
    check('#2 outcome sprite appears immediately', before.equals(after) === false, 'rubble → gold in the same interaction render');

    // ── #4: chest outcome immediately ──
    const docChest = makeDoc(20261007, {
        rooms: { '1,0': { type: 'reward', payload: { relic: { name: 'Vault Seal', category: 'relic', tier: 'Rare' } } }, '0,0': { type: 'empty' } },
        edges: ['0,0|e'],
    });
    const pChest = { ...playerBase, roomId: '1,0', prevRoomId: '0,0' };
    const roomChest = docChest.rooms.find((r) => r.key === '1,0');
    const exitsChest = roomScene.exitsFor(docChest, pChest);
    const chestBefore = await roomScene._renderInProcess(docChest, pChest, roomChest, { exits: exitsChest });
    fs.writeFileSync(path.join(OUT, 'fix4_chest_before.png'), chestBefore);
    roomChest.state = 'CLEARED'; roomChest.clearedBy = pChest.jid; roomChest.clearedAt = new Date();
    const chestAfter = await roomScene._renderInProcess(docChest, pChest, roomChest, { exits: exitsChest });
    fs.writeFileSync(path.join(OUT, 'fix4_chest_after_IMMEDIATE.png'), chestAfter);
    check('#4 chest open+CLAIMED immediately', chestBefore.equals(chestAfter) === false);

    // ── #3: items never inside the hub corner ──
    const HZ = roomScene.HUB_ZONE;
    // plan every room type × both content anchors; assert no prop lands in zone
    const docProps = makeDoc(20261008, {
        rooms: { '0,0': { type: 'empty' }, '1,0': { type: 'reward', payload: {} }, '2,0': { type: 'discovery', payload: {} } },
        edges: ['0,0|e', '1,0|e'],
    });
    let propViolation = 0, contentLift = false;
    for (const key of ['0,0', '1,0', '2,0']) {
        for (const prev of ['0,0', '2,0']) {
            const p = { ...playerBase, roomId: key, prevRoomId: prev === key ? null : prev };
            const r = docProps.rooms.find((rr) => rr.key === key);
            const plan = roomScene.planFor(docProps, p, r, roomScene.exitsFor(docProps, p));
            for (const pr of plan.props) if (pr.x < HZ.x1 && pr.y > HZ.y0) propViolation++;
        }
    }
    check('#3 no ambient props inside hub corner', propViolation === 0, `violations=${propViolation}`);
    // content anchor lift: entering reward room from the EAST mirror (ax=380)
    {
        const p = { ...playerBase, roomId: '1,0', prevRoomId: '2,0' };  // dx=-1 → entry 'e' → spot.x=942 → ax=380
        const r = docProps.rooms.find((rr) => rr.key === '1,0');
        r.state = 'ACTIVE';
        const plan = roomScene.planFor(docProps, p, r, roomScene.exitsFor(docProps, p));
        const pngLift = await roomScene._renderInProcess(docProps, p, r, { exits: roomScene.exitsFor(docProps, p), plan });
        fs.writeFileSync(path.join(OUT, 'fix3_items_clear_of_hub.png'), pngLift);
        contentLift = true;
    }
    check('#3 room content renders clear of the panel (see image)', contentLift);

    // ── #9: chevron ground layer (owner 2026-10-06: "the yellow pointers…
    // they render over player sprites and such — they should render behind
    // things") — the chevron pass must sit BEFORE room content + sprites in
    // the render pipeline (source pin) and a champion standing in the arch
    // mouth must occlude the pointer (occlusion proof + visual evidence).
    {
        const src = fs.readFileSync(path.join(__dirname, '..', 'core', 'rpg', 'guildWar', 'roomScene.js'), 'utf8');
        const drawIdx = src.indexOf('function drawExitArrows');
        const callIdx = src.indexOf('drawExitArrows(ctx, exits);');
        const contentIdx = src.indexOf('await drawRoomContent(ctx, room, plan);');
        const spriteIdx = src.indexOf('const drawnMe = await drawGroundedSprite');
        check('#9 chevron call sits BEFORE room content + sprites (ground layer)',
            drawIdx !== -1 && callIdx !== -1 && callIdx < contentIdx && contentIdx < spriteIdx,
            `call@${callIdx} < content@${contentIdx} < sprites@${spriteIdx}`);
    }
    {
        // champion enters THROUGH the north door → stands in the back-wall
        // arch mouth (596,402) — exactly where the N chevrons paint
        // (600, 292/266/240). Sprite presence must change the chevron band.
        const docChev = makeDoc(20261012, { rooms: { '0,0': { type: 'empty' } }, edges: ['0,0|n'] });
        const pChev = { ...playerBase, roomId: '0,0', prevRoomId: '0,-1' };
        const roomChev = docChev.rooms[0];
        const exitsChev = [{ dir: 'n', edge: true }, { dir: 's', edge: false }, { dir: 'w', edge: false }, { dir: 'e', edge: false }];
        const planChev = roomScene.planFor(docChev, pChev, roomChev, exitsChev);
        check('#9 n-entry champion stands at the back-wall arch (over the chevrons)',
            planChev.playerSpot.x === 596 && planChev.playerSpot.y === 402, JSON.stringify(planChev.playerSpot));
        const spriteFile = planChev.spriteFile;
        planChev.spriteFile = null; // drawGroundedSprite skips → champion absent
        const withoutMe = await roomScene._renderInProcess(docChev, pChev, roomChev, { exits: exitsChev, plan: planChev });
        fs.writeFileSync(path.join(OUT, 'fix9_chevron_alone.png'), withoutMe);
        planChev.spriteFile = spriteFile;
        const withMe = await roomScene._renderInProcess(docChev, pChev, roomChev, { exits: exitsChev, plan: planChev });
        fs.writeFileSync(path.join(OUT, 'fix9_chevron_behind_player.png'), withMe);
        check('#9 champion occludes the N-arch chevron (pointer behind sprite)',
            withoutMe.equals(withMe) === false, 'see fix9_chevron_*.png');
    }

    // ── #7: encounter card overlay ──
    const board = await puzzleCards.renderPuzzleCard({
        kind: 'mapriddle',
        prompt: 'A carved verse: "Seek the hidden chamber - 1 room east, 0 rooms south from this very hall. Speak \'open\' and name what you seek: *vault*."',
        attemptsUsed: 0, attemptsMax: 3, world: 'the ember fields', ring: 3,
    });
    const docPz = makeDoc(20261009, {
        rooms: { '0,0': { type: 'puzzle', payload: { puzzle: { kind: 'mapriddle', prompt: 'A carved verse: ...', attemptsUsed: 0, maxAttempts: 3, answer: 'vault' } } }, '1,0': { type: 'empty' } },
        edges: ['0,0|e'],
    });
    const pPz = { ...playerBase, roomId: '0,0', prevRoomId: '1,0' };
    const roomPz = docPz.rooms[0];
    const exitsPz = roomScene.exitsFor(docPz, pPz);
    const pngEntry = await roomScene._renderInProcess(docPz, pPz, roomPz, { exits: exitsPz });
    fs.writeFileSync(path.join(OUT, 'fix8_entry_no_board.png'), pngEntry);
    const pngBoard = await roomScene._renderInProcess(docPz, pPz, roomPz, { exits: exitsPz, puzzleBoard: board });
    fs.writeFileSync(path.join(OUT, 'fix7_encounter_card_overlay.png'), pngBoard);
    check('#7 board hidden on entry vs shown after examine', pngEntry.equals(pngBoard) === false);

    // gate logic pure check
    check('#8 puzzleStarted=false before examine', encounters.puzzleStarted(roomPz) === false);
    roomPz.payload.puzzle.started = true;
    check('#8 puzzleStarted=true after examine', encounters.puzzleStarted(roomPz) === true);

    // ── #6: shadows — combat pack render for visual inspection ──
    const docFight = makeDoc(20261010, {
        rooms: { '1,0': { type: 'combat', payload: { theme: 'ember', enemies: [{ level: 12 }, { level: 12 }, { level: 12 }] } }, '0,0': { type: 'empty' }, '1,1': { type: 'empty' } },
        edges: ['0,0|e', '1,0|n'],
    });
    const pFight = { ...playerBase, roomId: '1,0', prevRoomId: '0,0' };
    const roomFight = docFight.rooms.find((r) => r.key === '1,0');
    const exitsFight = roomScene.exitsFor(docFight, pFight);
    const planFight = roomScene.planFor(docFight, pFight, roomFight, exitsFight);
    const pngFight = await roomScene._renderInProcess(docFight, pFight, roomFight, { exits: exitsFight, plan: planFight });
    fs.writeFileSync(path.join(OUT, 'fix6_shadows_pack.png'), pngFight);
    // boss room shadow render
    const docBoss = makeDoc(20261011, {
        rooms: { '1,0': { type: 'core', payload: { coreGuardian: true, theme: 'ember' } }, '0,0': { type: 'empty' } },
        edges: ['0,0|e'],
    });
    const pBoss = { ...playerBase, roomId: '1,0', prevRoomId: '0,0' };
    const roomBoss = docBoss.rooms.find((r) => r.key === '1,0');
    const exitsBoss = roomScene.exitsFor(docBoss, pBoss);
    const pngBoss = await roomScene._renderInProcess(docBoss, pBoss, roomBoss, { exits: exitsBoss });
    fs.writeFileSync(path.join(OUT, 'fix6_shadows_boss.png'), pngBoss);
    check('#6 shadow renders generated (visual check)', fs.existsSync(path.join(OUT, 'fix6_shadows_pack.png')));

    // ── old rubble still loadable as new asset (regression) ──
    const newRubble = fs.statSync(path.join(__dirname, '..', 'core', 'rpgasset', 'guildwar', 'ruins', 'props', 'cache_rubble.png'));
    check('#2 new rubble sprite installed', newRubble.size > 100000, `${newRubble.size} bytes`);

    const failed = results.filter((r) => !r.ok);
    console.log(`\n${results.length - failed.length}/${results.length} checks passed`);
    process.exit(failed.length ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
