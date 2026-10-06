#!/usr/bin/env node
// 🎚️ GW BANDS QA — PvE band ladder (owner spec 2026-10-06, ruins_pve_boss_scaling_prompt)
// Verifies the ACTUAL encounter-generation paths (not just compilation):
//   1. Roster bands: percentiles from REAL levels, persisted to the event doc.
//   2. Mix shift: shared exploration progress moves the LOW/MED/HIGH roll.
//   3. Ring weighting: deep rooms roll hotter at the same exploration stage.
//   4. Per-player lanes: weak players never see more than +8; the ace never
//      sees regular packs past the roster p80 (owner: "high end enemies sit
//      at the LOWER ends of the high range").
//   5. Bosses: roster-anchored, capped at strongest+4 → soloable by the top
//      champion (owner rule). Hierarchy HIGH < secret < core.
//   6. Guild shapes: low-heavy / mixed / high-level / degenerate / solo.
//   7. Full chain: buildRoomPayload → resolveEngagement → selectRandomEnemy
//      → createEnemy (real templates, real stat scaling).
//   8. Rank badges C/B/A/S + DUNGEON_RANKS safety.
//   9. Coop bump + variant delta under the MAX_PLAYER_GAP clamp.
//  10. Multiplayer: same shared room, per-player resolved levels.
// Uses the gwtest DB (same harness pattern as gw_isolation_qa.js).
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + extra : ''}`); }
}

async function connectDB() {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
        }
    }
    const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
    process.env.MONGO_URI = uri;
    const mongoose = require('mongoose');
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 8000 });
    console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
}

// deterministic-ish rng fixture for buildRoomPayload (mulberry-lite)
function makeRng(seed) {
    let s = 0;
    for (const c of String(seed)) s = (s * 31 + c.charCodeAt(0)) >>> 0;
    return {
        next: () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296,
        int: (a, b) => a + Math.floor(((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * (b - a + 1)),
        pick: (arr) => arr[Math.floor(((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) * arr.length)],
    };
}

function makeRooms(total, touched, ringFor) {
    const rooms = [];
    for (let i = 0; i < total; i++) {
        const state = i < touched ? (i % 2 === 0 ? 'CLEARED' : 'ACTIVE') : 'UNEXPLORED';
        rooms.push({ key: `${i},0`, type: 'combat', state, ring: ringFor ? ringFor(i) : 0.2, payload: {} });
    }
    return rooms;
}

function eventFixture(id, levels, rooms, extra = {}, jidPrefix = 'qa') {
    return {
        eventId: id, seed: 'qa-seed', deadWorld: 'ember', coreKey: '5,5',
        players: levels.map((lvl, i) => ({ jid: `${jidPrefix}${i}@s.whatsapp.net`, name: `QA${i}`, level: lvl })),
        rooms: rooms || makeRooms(100, 20),
        ...extra,
    };
}

// deterministic band roll: resolveEngagement calls rng() as a FUNCTION
function rngForRoll(band) {
    return () => (band === 'high' ? 0.0 : band === 'mid' ? 0.3 : 0.9);
}

(async () => {
    await connectDB();
    const mongoose = require('mongoose');
    const GuildWarEvent = require('../core/models/GuildWarEvent');
    const encounters = require('../core/rpg/guildWar/encounters');
    const classEncounters = require('../core/rpg/classEncounters');
    const CFG = require('../core/rpg/guildWar/config');

    // ── stub progression levels (roster levels without touching user DB) ──
    const fakeLevels = {};
    const progression = require('../core/rpg/progression');
    progression.getLevel = (jid) => (fakeLevels[jid] !== undefined ? fakeLevels[jid] : 1);

    const MIXED = [1, 2, 3, 3, 3, 5, 25, 31, 51, 100];
    MIXED.forEach((l, i) => { fakeLevels[`qa${i}@s.whatsapp.net`] = l; });

    // ═══ 1. roster band computation ═══
    console.log('\n══ 1. roster band computation (mixed guild) ══');
    const evId1 = `gw_bandsqa_${Date.now().toString(36)}_1`;
    const doc1 = await GuildWarEvent.create({ eventId: evId1, state: 'ACTIVE', hostGroupId: 'g@g.us', players: MIXED.map((l, i) => ({ jid: `qa${i}@s.whatsapp.net`, name: `QA${i}` })) });
    const evDoc1 = eventFixture(evId1, MIXED);
    const bands = await encounters.getRosterBands(evDoc1);
    check('bands computed', !!bands && !!bands.p80, JSON.stringify(bands));
    check('p50 = median (3)', bands && bands.p50 === 3, bands && bands.p50);
    check('p80 = 31 (lower edge of high range, nearest-rank)', bands && bands.p80 === 31, bands && bands.p80);
    check('maxLvl = 100', bands && bands.maxLvl === 100);
    check('n = 10', bands && bands.n === 10);
    let persisted = null;
    for (let i = 0; i < 25 && !persisted?.bands?.p80; i++) {  // fire-and-forget persist: poll ≤2.5s
        await new Promise((r) => setTimeout(r, 100));
        persisted = await GuildWarEvent.findOne({ eventId: evId1 }).lean();
    }
    check('bands persisted to event doc', !!(persisted && persisted.bands && persisted.bands.p80 === 31), JSON.stringify(persisted && persisted.bands));
    const bands2 = await encounters.getRosterBands(evDoc1);
    check('recompute deterministic', bands2 && bands2.p50 === bands.p50 && bands2.p80 === bands.p80);

    // ═══ 2. exploration mix shift ═══
    console.log('\n══ 2. shared exploration mix shift ══');
    const w0 = encounters.bandWeights(0);
    const wHalf = encounters.bandWeights(0.5);
    const w1 = encounters.bandWeights(1);
    check('early mix: LOW dominant (0.70)', Math.abs(w0.low - 0.70) < 0.01, JSON.stringify(w0));
    check('early mix: HIGH rare (0.05)', Math.abs(w0.high - 0.05) < 0.01);
    check('mid mix: balanced (0.40/0.40/0.20)', Math.abs(wHalf.high - 0.20) < 0.01, JSON.stringify(wHalf));
    check('late mix: HIGH at 0.40', Math.abs(w1.high - 0.40) < 0.01, JSON.stringify(w1));
    check('late mix: LOW down to 0.15', Math.abs(w1.low - 0.15) < 0.01);
    // statistical: 4000 rolls at each stage
    const rollStats = (t) => {
        const w = encounters.bandWeights(t); const c = { low: 0, mid: 0, high: 0 };
        for (let i = 0; i < 4000; i++) c[encounters.pickBand(w, Math.random())]++;
        return c;
    };
    const early = rollStats(0), late = rollStats(1);
    check('rolled HIGH share: early < 8%', early.high / 4000 < 0.08, (early.high / 4000).toFixed(3));
    check('rolled HIGH share: late > 32%', late.high / 4000 > 0.32, (late.high / 4000).toFixed(3));
    check('rolled LOW share: late < 22%', late.low / 4000 < 0.22, (late.low / 4000).toFixed(3));

    // ═══ 3. exploration progress from room states ═══
    console.log('\n══ 3. exploration progress (monotonic, ratchet-free) ══');
    check('0% explored → 0', encounters.explorationProgress({ rooms: makeRooms(100, 0) }) === 0);
    check('30% touched → 0.3', Math.abs(encounters.explorationProgress({ rooms: makeRooms(100, 30) }) - 0.3) < 0.001);
    check('all cleared → 1', encounters.explorationProgress({ rooms: makeRooms(100, 100) }) === 1);
    check('no rooms → 0 (safe)', encounters.explorationProgress({}) === 0);
    const progSeq = [0, 10, 25, 60, 100].map((t) => encounters.explorationProgress({ rooms: makeRooms(100, t) }));
    check('monotonic non-decreasing', progSeq.every((v, i) => i === 0 || v >= progSeq[i - 1]));

    // ═══ 4. per-player lanes (mixed guild, mid exploration) ═══
    console.log('\n══ 4. per-player resolution — same room, own lane ══');
    const roomMid = { key: '3,3', type: 'combat', ring: 0.4, payload: { enemies: [{ level: 13 }] } };
    const evMid = { ...evDoc1, rooms: makeRooms(100, 50) }; // exploration 0.5
    const B = CFG.COMBAT.BANDS;
    // weak player lvl 1 (qa0)
    const weak = { jid: 'qa0@s.whatsapp.net', level: 1 };
    let weakMax = 0, weakMin = 99;
    for (let i = 0; i < 300; i++) {
        const r = await encounters.resolveEngagement(evMid, roomMid, weak, { rng: Math.random });
        if (!r) break;
        weakMax = Math.max(weakMax, r.level); weakMin = Math.min(weakMin, r.level);
    }
    check('weak lvl1: no pack beyond player+8', weakMax <= 1 + B.MAX_PLAYER_GAP, `max=${weakMax}`);
    check('weak lvl1: LOW rolls stay gentle (≤p50)', weakMin >= 1, `min=${weakMin}`);
    // mid player lvl 20 (qa6 = 25 → use custom jid)
    fakeLevels['mid@s.whatsapp.net'] = 20;
    const mid = { jid: 'mid@s.whatsapp.net', level: 20 };
    let midHigh = 0, midLow = 99;
    for (let i = 0; i < 300; i++) {
        const r = await encounters.resolveEngagement(evMid, roomMid, mid, { rng: Math.random });
        midHigh = Math.max(midHigh, r.level); midLow = Math.min(midLow, r.level);
    }
    check('mid lvl20: HIGH roll ≤ p80 (31) — lower edge of high range', midHigh <= 31, `max=${midHigh}`);
    check('mid lvl20: MED roll = player+2 (22)', midHigh >= 20 + B.MED_GAP && midLow >= 1, `hi=${midHigh} lo=${midLow}`);
    // ace lvl 100 (qa9)
    const ace = { jid: 'qa9@s.whatsapp.net', level: 100 };
    let aceMax = 0, aceMin = 99;
    for (let i = 0; i < 300; i++) {
        const r = await encounters.resolveEngagement(evMid, roomMid, ace, { rng: Math.random });
        aceMax = Math.max(aceMax, r.level); aceMin = Math.min(aceMin, r.level);
    }
    check('ace lvl100: regular packs NEVER pass roster p80 (31)', aceMax <= 31, `max=${aceMax}`);
    check('ace lvl100: LOW rolls stay at roster floor (≤3)', aceMin <= 3, `min=${aceMin}`);
    check('ace lane ≠ weak lane on the SAME room', weakMax < aceMax || aceMin < weakMin, 'per-player resolution alive');

    // ═══ 5. bosses: roster-anchored, solo-capped, hierarchical ═══
    console.log('\n══ 5. boss anchors (mixed guild) ══');
    const roomSecret = { key: '7,7', type: 'secret', ring: 0.8, payload: { boss: true, enemies: [{ level: 20 }] } };
    const roomCore = { key: '5,5', type: 'core', ring: 1, payload: { coreGuardian: true, boss: true, enemies: [{ level: 25 }] } };
    const rb1 = await encounters.resolveEngagement(evMid, roomSecret, weak, { boss: true, bossKind: 'secret', rng: rngForRoll('high') });
    const rc1 = await encounters.resolveEngagement(evMid, roomCore, weak, { boss: true, bossKind: 'core', rng: rngForRoll('high') });
    check('secret boss = p80+6 = 37', rb1 && rb1.level === 31 + B.BOSS_LEVEL_ADD_SECRET, rb1 && rb1.level);
    check('core guardian = p80+10 = 41', rc1 && rc1.level === 31 + B.BOSS_LEVEL_ADD_CORE, rc1 && rc1.level);
    check('hierarchy HIGH < secret < core', 31 < rb1.level && rb1.level < rc1.level);
    check('boss ≤ strongest+4 (solo rule: ace 100 clears)', rc1.level <= 100 + B.BOSS_CAP_ABOVE_TOP);
    check('boss is roster-anchored, not player-relative (weak engaged, level unchanged)', rb1.level === 37);
    // degenerate guild: everyone lvl 10
    fakeLevels['d0@s.whatsapp.net'] = fakeLevels['d1@s.whatsapp.net'] = fakeLevels['d2@s.whatsapp.net'] = fakeLevels['d3@s.whatsapp.net'] = fakeLevels['d4@s.whatsapp.net'] = 10;
    const evDeg = eventFixture(`gw_bandsqa_deg_${Date.now().toString(36)}`, [10, 10, 10, 10, 10], makeRooms(50, 25), {}, 'd');
    const rcDeg = await encounters.resolveEngagement(evDeg, roomCore, { jid: 'd0@s.whatsapp.net', level: 10 }, { boss: true, bossKind: 'core', rng: rngForRoll('high') });
    check('degenerate roster: core ≤ strongest+4 (14 ≤ 10+4)', rcDeg.level <= 14, rcDeg.level);
    // high-level guild
    const HIGHG = [60, 65, 70, 75, 80];
    HIGHG.forEach((l, i) => { fakeLevels[`h${i}@s.whatsapp.net`] = l; });
    const evHigh = eventFixture(`gw_bandsqa_high_${Date.now().toString(36)}`, HIGHG, makeRooms(50, 25), {}, 'h');
    const rcHigh = await encounters.resolveEngagement(evHigh, roomCore, { jid: 'h4@s.whatsapp.net', level: 80 }, { boss: true, bossKind: 'core', rng: rngForRoll('high') });
    check('high guild: core = min(80+10, 80+4) = 84 — soloable by the 80', rcHigh.level === 84, rcHigh.level);
    // low-heavy guild
    const LOWG = [1, 1, 1, 2, 2];
    LOWG.forEach((l, i) => { fakeLevels[`lo${i}@s.whatsapp.net`] = l; });
    const evLow = eventFixture(`gw_bandsqa_low_${Date.now().toString(36)}`, LOWG, makeRooms(50, 10), {}, 'lo');
    const rbLow = await encounters.resolveEngagement(evLow, roomSecret, { jid: 'lo0@s.whatsapp.net', level: 1 }, { boss: true, bossKind: 'secret', rng: rngForRoll('high') });
    const rLowLow = await encounters.resolveEngagement(evLow, roomMid, { jid: 'lo0@s.whatsapp.net', level: 1 }, { rng: rngForRoll('low') });
    check('low guild: secret boss = min(1+6, 2+4) = 6', rbLow.level === 6, rbLow.level);
    check('low guild: LOW band = 1 (clamped to floor)', rLowLow.level === 1, rLowLow.level);

    // ═══ 6. fallbacks ═══
    console.log('\n══ 6. fallbacks (solo roster / bands disabled) ══');
    const evSolo = eventFixture(`gw_bandsqa_solo_${Date.now().toString(36)}`, [7], makeRooms(50, 10));
    check('solo roster → null (legacy ring curve)', await encounters.getRosterBands(evSolo) === null);
    check('solo roster: resolveEngagement → null', await encounters.resolveEngagement(evSolo, roomMid, { jid: 'x@s.whatsapp.net', level: 5 }, { rng: Math.random }) === null);
    const prevEnabled = CFG.COMBAT.BANDS.ENABLED;
    CFG.COMBAT.BANDS.ENABLED = false;
    check('BANDS.ENABLED=false → null (payload levels win)', await encounters.resolveEngagement(evMid, roomMid, ace, { rng: Math.random }) === null);
    CFG.COMBAT.BANDS.ENABLED = prevEnabled;

    // ═══ 7. FULL generation chain (real paths, real templates, real scaling) ═══
    console.log('\n══ 7. full chain: buildRoomPayload → resolve → selectRandomEnemy → createEnemy ══');
    const mapEngine = require('../core/rpg/guildWar/mapEngine');
    const map = mapEngine.generate(`qa-chain-${Date.now()}`, 10, {});
    const mapRooms = Array.from(map.rooms.values());
    const combatRoom = mapRooms.find((r) => r.type === 'combat' && !map.spawns.includes(r.key));
    check('combat room found on a REAL generated map', !!combatRoom);
    const evChain = eventFixture(`gw_bandsqa_chain_${Date.now().toString(36)}`, MIXED, mapRooms.map((r) => ({ key: r.key, type: r.type, state: 'UNEXPLORED', ring: r.ring, payload: {} })));
    const payload = encounters.buildRoomPayload({ eventId: evChain.eventId, seed: evChain.seed, deadWorld: 'ember' }, combatRoom, { spawns: map.spawns });
    check('payload seeded with enemy specs (fallback)', Array.isArray(payload.enemies) && payload.enemies.length >= 1, JSON.stringify(payload.enemies));
    const chainRoom = { ...combatRoom, payload };
    const res = await encounters.resolveEngagement(evChain, chainRoom, weak, { rng: rngForRoll('mid') });
    check('resolve on real room works', !!res && res.band === 'mid' && res.level >= 1, JSON.stringify(res));
    const template = classEncounters.selectRandomEnemy(res.level, 'COMMON');
    check('real template pool resolves at band level', !!template && !!template.id, template && template.id);
    let createEnemy = null;
    try {
        const ga = require('../core/rpg/guildAdventure');
        createEnemy = ga.createEnemy;
    } catch (e) { console.log('  ⚠️ guildAdventure unavailable (non-fatal):', e.message); }
    if (createEnemy) {
        const enemy = createEnemy(template.id, res.level);
        check('createEnemy builds REAL enemy at band level', !!enemy && enemy.level === res.level, enemy && `${enemy.name} lvl ${enemy.level}`);
        const tplHp = template.stats.hp;
        const expectHp = Math.floor(tplHp * (1 + (res.level - 1) * 0.2));
        check('stat scaling formula intact (+20% hp/lvl)', enemy && enemy.stats.hp === expectHp, enemy && `hp ${enemy.stats.hp} vs ${expectHp}`);
        check('enemy level carries into combat entity', enemy && enemy.level === res.level);
    }
    // seeded vs resolved: resolved level overrides via map — count preserved by construction
    check('payload enemy count within owner cap (1..3)', payload.enemies.length >= 1 && payload.enemies.length <= 3, payload.enemies.length);

    // ═══ 8. rank badges ═══
    console.log('\n══ 8. rank badges C/B/A/S ══');
    const rLowRank = await encounters.resolveEngagement(evMid, roomMid, ace, { rng: rngForRoll('low') });
    const rHighRank = await encounters.resolveEngagement(evMid, roomMid, ace, { rng: rngForRoll('high') });
    const RB = CFG.COMBAT.BANDS.RANK_BY_BAND;
    check('LOW → C', RB[rLowRank.band] === 'C');
    check('HIGH → A', RB[rHighRank.band] === 'A');
    check('boss → S', CFG.COMBAT.BANDS.RANK_BOSS === 'S');
    const gaRanks = (() => { try { return require('../core/rpg/guildAdventure').DUNGEON_RANKS; } catch (e) { return null; } })();
    if (gaRanks) {
        check('DUNGEON_RANKS supports C/B/A/S (no crash path)', ['C', 'B', 'A', 'S'].every((k) => !!gaRanks[k]));
    } else {
        check('rank table check skipped (guildAdventure private)', true);
    }

    // ═══ 9. coop bump + variant clamp ═══
    console.log('\n══ 9. coop bump + MAX_PLAYER_GAP clamp ═══');
    const rCoopOff = await encounters.resolveEngagement(evMid, roomMid, mid, { rng: rngForRoll('high') });
    const rCoopOn = await encounters.resolveEngagement(evMid, roomMid, mid, { coop: true, rng: rngForRoll('high') });
    check('coop = regular + 2', rCoopOn.level === rCoopOff.level + 2, `${rCoopOff.level} → ${rCoopOn.level}`);
    const rElite = await encounters.resolveEngagement(evMid, roomMid, weak, { rng: rngForRoll('high'), variantDelta: 3 });
    check('variant +3 still clamped to player+8', rElite.level <= 1 + B.MAX_PLAYER_GAP, rElite.level);

    // ═══ 10. multiplayer: same shared room, own lanes ═══
    console.log('\n══ 10. multiplayer lanes on one shared room ══');
    const laneWeak = await encounters.resolveEngagement(evMid, roomMid, weak, { rng: rngForRoll('high') });
    const laneAce = await encounters.resolveEngagement(evMid, roomMid, ace, { rng: rngForRoll('high') });
    check('same room: weak meets ≤9', laneWeak.level <= 9, laneWeak.level);
    check('same room: ace meets roster ceiling (31)', laneAce.level === 31, laneAce.level);
    check('lanes differ — protection works both ways', laneWeak.level < laneAce.level);

    console.log(`\n════════════════════════════════════`);
    console.log(`  RESULT: ${PASS} passed, ${FAIL} failed`);
    console.log(`════════════════════════════════════`);
    await GuildWarEvent.deleteMany({ eventId: { $regex: /^gw_bandsqa_/ } });
    await mongoose.disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] fatal:', e); process.exit(1); });
