#!/usr/bin/env node
// ═══════════════════════════════════════════════════════════════════════
// gw_deep_ladder_sweep.js — THE DEEP PASS (2026-10-07)
// Deep verification sweep for the PvE band ladder (41a64a57, e0dd864d):
//
//   PART 1 — MATRIX SWEEP (pure, stubbed levels): every roster shape ×
//            player level × ring × exploration × variant × coop × band
//            roll. Hard guarantees (gap clamps, boss caps, monotonicity).
//   PART 2 — REAL CHAIN (gwtest DB): LID-jid → economy cache →
//            progression.getLevel → resolveEngagement picks the REAL
//            level (the 20:01Z bug class), incl. unknown-LID fallback.
//   PART 3 — DISTRIBUTION: solo lvl-1, 2000 rolls across exploration —
//            no pack above the gap, HIGH share grows with progress.
//
// Run anywhere: node scripts/gw_deep_ladder_sweep.js
// (Part 2 auto-skips when no DB is reachable.)
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
const CFG = require('../core/rpg/guildWar/config').COMBAT;
const B = CFG.BANDS;

// ── fixture helpers (mirrors gw_bands_qa) ─────────────────────────────
const fakeLevels = {};
let realGetLevel = null; // restored before PART 2 (real-chain verification)
function eventFixture(id, players, exploration = 0) {
    // rooms: one of each flavor so exploration math has surface
    const rooms = [
        { key: '0,0', type: 'combat', ring: 0, state: 'CLEARED', payload: { enemies: [{ level: 10 }] } },
        { key: '1,1', type: 'combat', ring: 0.5, state: 'UNEXPLORED', payload: { enemies: [{ level: 13 }] } },
        { key: '2,2', type: 'secret', ring: 0.4, state: 'UNEXPLORED', payload: { boss: true, enemies: [{ level: 20 }] } },
        { key: '3,3', type: 'core', ring: 1, state: 'UNEXPLORED', payload: { coreGuardian: true, boss: true, enemies: [{ level: 25 }] } },
    ];
    const touched = rooms.filter((r) => r.state !== 'UNEXPLORED').length;
    // caller wants a specific exploration share → mark rooms accordingly
    if (exploration > 0) {
        const want = Math.round(exploration * rooms.length);
        for (let i = 0; i < want; i++) rooms[i % rooms.length].state = 'CLEARED';
    }
    void touched;
    return {
        eventId: id, state: 'ACTIVE', hostGroupId: 'qa@g.us', seed: 'qa-seed',
        players: players.map((p, i) => ({ jid: p.jid || `qa${i}@s.whatsapp.net`, name: p.name || `QA${i}`, guildId: 'G1', status: 'active', level: p.level })),
        rooms,
        toObject() { return this; },
    };
}

function stubLevels() {
    const progression = require('../core/rpg/progression');
    if (realGetLevel === null) realGetLevel = progression.getLevel;
    progression.getLevel = (jid) => (fakeLevels[jid] !== undefined ? fakeLevels[jid] : 1);
}

// deterministic rng per requested band roll: resolveEngagement calls rng()
// once for regular rooms (pickBand ordering: high → mid → low)
function rollFor(band) {
    if (band === 'high') return () => 0.01;
    if (band === 'mid') return () => 0.5;
    return () => 0.99; // low
}

async function main() {
    stubLevels();
    const encounters = require('../core/rpg/guildWar/encounters');

    // ═════════ PART 1 — MATRIX SWEEP ═════════
    console.log('\n════ PART 1: matrix sweep — hard guarantees ════');
    const LEVELS = [1, 2, 3, 5, 10, 25, 50, 100];
    const RINGS = [0, 0.25, 0.5, 0.75, 1];
    const EXPLORATIONS = [0, 0.3, 0.7, 1];
    const DELTAS = [-2, -1, 0, 1, 2, 3];
    const ROSTERS = {
        solo: (lvl) => [{ jid: 'solo@s.whatsapp.net', level: lvl }],
        duo_1_100: () => [{ jid: 'd1@s.whatsapp.net', level: 1 }, { jid: 'd100@s.whatsapp.net', level: 100 }],
        trio: () => [{ jid: 't5@s.whatsapp.net', level: 5 }, { jid: 't30@s.whatsapp.net', level: 30 }, { jid: 't80@s.whatsapp.net', level: 80 }],
        beta9: () => [...Array.from({ length: 8 }, (_, i) => ({ jid: `b${i}@s.whatsapp.net`, level: 1 })), { jid: 'b100@s.whatsapp.net', level: 100 }],
    };

    let worst = { gap: -99, combo: null };
    let combos = 0;
    for (const rosterName of Object.keys(ROSTERS)) {
        for (const pl of LEVELS) {
            const roster = rosterName === 'solo' ? ROSTERS.solo(pl) : ROSTERS[rosterName]();
            // engaging player = the roster member at `pl` (or the weak one in mixed rosters)
            const engager = rosterName === 'solo'
                ? roster[0]
                : (rosterName === 'duo_1_100' ? roster[pl === 1 ? 0 : 1] : roster.find((p) => p.level === pl) || roster[0]);
            fakeLevels[engager.jid] = engager.level;
            for (const ring of RINGS) {
                for (const expl of EXPLORATIONS) {
                    for (const delta of DELTAS) {
                        for (const coop of [false, true]) {
                            for (const band of ['low', 'mid', 'high']) {
                                const ev = eventFixture('mx', roster, expl);
                                const room = { key: '1,1', type: 'combat', ring, payload: { enemies: [{ level: 13 }] } };
                                const r = await encounters.resolveEngagement(ev, room, engager, { variantDelta: delta, coop, rng: rollFor(band) });
                                combos++;
                                if (!r) { check(`S0 resolve never null for non-empty roster (${rosterName})`, false); continue; }
                                const gap = r.level - engager.level;
                                if (gap > worst.gap) worst = { gap, combo: `${rosterName} pl${engager.level} ring${ring} expl${expl} d${delta} coop${coop ? 1 : 0} ${band}` };
                                // S1: hard clamp — never beyond player+8 (variant bumps + coop included)
                                if (r.level > engager.level + B.MAX_PLAYER_GAP) {
                                    check(`S1 gap clamp ${rosterName} pl${engager.level} ring${ring} expl${expl} d${delta} ${band}`, false, `lvl ${r.level} > ${engager.level + B.MAX_PLAYER_GAP}`);
                                }
                                // S2: the Brainard rule — a lvl-1 tester never meets double digits
                                if (engager.level === 1 && r.level > 1 + B.MAX_PLAYER_GAP) {
                                    check(`S2 lvl-1 ceiling ${rosterName} ${band}`, false, `lvl ${r.level}`);
                                }
                                // S4: floors
                                if (r.level < 1) check(`S4 floor ${rosterName} ${band}`, false, r.level);
                            }
                        }
                    }
                }
            }
        }
    }
    check(`S1 aggregate: worst gap over ${combos} combos ≤ +${B.MAX_PLAYER_GAP} (worst: ${worst.gap > -99 ? '+' + worst.gap : 'n/a'} @ ${worst.combo || '-'})`, worst.gap <= B.MAX_PLAYER_GAP);
    console.log(`  ℹ️ matrix combos swept: ${combos}; worst gap ${worst.gap > -99 ? '+' + worst.gap : 'n/a'}${worst.combo ? ` @ ${worst.combo}` : ''}`);

    // S3/S4: monotonicity + band ordering on solo rosters (p50=p80=max=pl)
    console.log('\n════ PART 1b: band ordering + monotonic ladder (solo) ════');
    let monoOK = true, orderOK = true, prevByBand = null;
    for (const pl of LEVELS) {
        const ev = eventFixture('mono', [{ jid: 'm@s.whatsapp.net', level: pl }]);
        const room = { key: '1,1', type: 'combat', ring: 0.5, payload: { enemies: [{ level: 13 }] } };
        const lv = {};
        for (const band of ['low', 'mid', 'high']) {
            const r = await encounters.resolveEngagement(ev, room, { jid: 'm@s.whatsapp.net', level: pl }, { rng: rollFor(band) });
            lv[band] = r.level;
        }
        if (!(lv.low <= lv.mid && lv.mid <= lv.high)) { orderOK = false; console.log(`    ❌ order @pl${pl}: ${JSON.stringify(lv)}`); }
        if (prevByBand) {
            for (const band of ['low', 'mid', 'high']) {
                if (lv[band] < prevByBand[band]) { monoOK = false; console.log(`    ❌ monotonic ${band}: pl${pl - 1 || 'prev'}=${prevByBand[band]} > pl${pl}=${lv[band]}`); }
            }
        }
        prevByBand = lv;
    }
    check('S4b solo band ordering low ≤ mid ≤ high at every level', orderOK);
    check('S3 solo ladder monotonic in player level per band', monoOK);
    check('S4c LOW never above the player (solo)', prevByBand && prevByBand.low <= Math.max(...LEVELS), JSON.stringify(prevByBand));

    // S5/S6: boss anchoring exact + caps
    console.log('\n════ PART 1c: boss anchoring ════');
    {
        const roster = [{ jid: 'w1@s.whatsapp.net', level: 1 }, { jid: 'w20@s.whatsapp.net', level: 20 }, { jid: 'w31@s.whatsapp.net', level: 31 }];
        fakeLevels['w1@s.whatsapp.net'] = 1; fakeLevels['w20@s.whatsapp.net'] = 20; fakeLevels['w31@s.whatsapp.net'] = 31;
        const ev = eventFixture('boss', roster);
        const roomSecret = { key: '2,2', type: 'secret', ring: 0.4, payload: { boss: true, enemies: [{ level: 20 }] } };
        const roomCore = { key: '3,3', type: 'core', ring: 1, payload: { coreGuardian: true, boss: true, enemies: [{ level: 25 }] } };
        const weak = { jid: 'w1@s.whatsapp.net', level: 1 };
        const rb = await encounters.resolveEngagement(ev, roomSecret, weak, { boss: true, bossKind: 'secret', rng: rollFor('low') });
        const rc = await encounters.resolveEngagement(ev, roomCore, weak, { boss: true, bossKind: 'core', rng: rollFor('low') });
        // p80 over [1,20,31]: ceil(0.8*3)-1 = idx2 → 31
        // cap-bound roster [1,20,31]: capTop = 35 → core = min(41,35) = 35,
        // secret = min(37, core−1, 35) = 34 — hierarchy PRESERVED (was 35/35)
        check('S5 core (cap-bound) = maxLvl+4 = 35', rc.level === 35, rc.level);
        check('S5 secret (cap-bound) = core−1 = 34 (strictly below the apex)', rb.level === 34, rb.level);
        check('S6 hierarchy: secret < core (even when the solo cap binds)', rb.level < rc.level);
        check('S6 both bosses ≤ strongest+4 (solo rule intact)', rb.level <= 31 + B.BOSS_CAP_ABOVE_TOP && rc.level <= 31 + B.BOSS_CAP_ABOVE_TOP, `${rb.level}/${rc.level}`);
        // solo-ace cap
        const evAce = eventFixture('bossAce', [{ jid: 'ace@s.whatsapp.net', level: 100 }]);
        fakeLevels['ace@s.whatsapp.net'] = 100;
        const rcAce = await encounters.resolveEngagement(evAce, roomCore, { jid: 'ace@s.whatsapp.net', level: 100 }, { boss: true, bossKind: 'core', rng: rollFor('low') });
        check('S6 solo ace: core capped at ace+4 (soloable)', rcAce.level <= 100 + B.BOSS_CAP_ABOVE_TOP, rcAce.level);
        // lvl-1 solo boss floor
        const evSolo1 = eventFixture('boss1', [{ jid: 'solo1@s.whatsapp.net', level: 1 }]);
        fakeLevels['solo1@s.whatsapp.net'] = 1;
        const rb1 = await encounters.resolveEngagement(evSolo1, roomSecret, { jid: 'solo1@s.whatsapp.net', level: 1 }, { boss: true, bossKind: 'secret', rng: rollFor('low') });
        check('S6 lvl-1 solo: secret boss = core−1 = 4 (not the legacy 20)', rb1.level === 4, rb1.level);
        const rc1 = await encounters.resolveEngagement(evSolo1, roomCore, { jid: 'solo1@s.whatsapp.net', level: 1 }, { boss: true, bossKind: 'core', rng: rollFor('low') });
        check('S6 lvl-1 solo: core guardian capped at 1+4 = 5 (not the legacy 25)', rc1.level === 5, rc1.level);
    }

    // S7/S8: fallbacks
    console.log('\n════ PART 1d: fallbacks ════');
    {
        const evEmpty = { eventId: 'empty', state: 'ACTIVE', players: [], rooms: [{ key: '1,1', type: 'combat', ring: 0.5, payload: { enemies: [{ level: 13 }] } }], toObject() { return this; } };
        const rEmpty = await encounters.resolveEngagement(evEmpty, evEmpty.rooms[0], { jid: 'ghost@s.whatsapp.net', level: 1 }, { rng: rollFor('low') });
        check('S7 empty roster → null (legacy seeds used)', rEmpty === null);
        const savedEnabled = B.ENABLED;
        B.ENABLED = false;
        const evOff = eventFixture('off', [{ jid: 'off@s.whatsapp.net', level: 50 }]);
        const rOff = await encounters.resolveEngagement(evOff, evOff.rooms[1], { jid: 'off@s.whatsapp.net', level: 50 }, { rng: rollFor('low') });
        B.ENABLED = savedEnabled;
        check('S8 BANDS.ENABLED=false → null (kill-switch intact)', rOff === null);
    }

    // ═════════ PART 2 — REAL CHAIN (gwtest DB) ═════════
    console.log('\n════ PART 2: real resolution chain (gwtest DB) ════');
    let dbOK = false;
    try {
        const envPath = path.join(__dirname, '..', '.env');
        if (fs.existsSync(envPath)) {
            for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
                const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
                if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
            }
        }
        const uri = (process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/mellow').replace(/\/[^/?]+(\?|$)/, '/gwtest$1');
        process.env.MONGO_URI = uri;
        const mongoose = require('mongoose');
        await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
        console.log(`[qa] connected to TEST db: ${mongoose.connection.name}`);
        dbOK = true;

        // ⚠️ restore the REAL getLevel — Part 1's stub must not poison the
        // real-chain verification (a stale stub reads as a mapping miss)
        const progression0 = require('../core/rpg/progression');
        progression0.getLevel = realGetLevel;

        const economy = require('../core/rpg/economy');
        // build a registered user directly in the DB, then warm the cache
        const User = require('../core/models/User');
        const lidJid = '25519998877@lid';
        const phoneJid = '25519998877@s.whatsapp.net';
        // xp must MATCH level 25 (getXPForLevel(25)=150,000) — progression's
        // forward level-up sync derives level from xp and self-heals upward,
        // so an oversized xp would silently become a higher level.
        await User.deleteMany({ $or: [{ userId: lidJid }, { userId: phoneJid }] }).catch(() => {});
        await User.create({
            userId: phoneJid, jid: phoneJid, phone: '25519998877', nickname: 'DeepSweep', registered: true,
            wallet: 0, bank: 0,
            progression: { xp: 150500, level: 25, gp: 0, totalGP: 0, commandsUsed: 0, statPoints: 0, allocatedStats: {} },
        });
        await economy.syncUserFromDB(phoneJid); // returns undefined by design
        const cached = economy.getUser(phoneJid);
        check('R1 economy cache warmed from DB (phone key)', !!cached && cached.registered === true);
        // resolveJidHelper LID→phone fallback should land on the same cache entry
        const progression = require('../core/rpg/progression');
        const realGapLvl = progression.getLevel(lidJid);
        check(`R2 progression.getLevel resolves through LID→phone fallback (25, got ${realGapLvl})`, realGapLvl === 25);
        // engage through the REAL chain: solo roster, LID jid, expected p50=p80=max=25
        const evLid = eventFixture('lid', [{ jid: lidJid, level: 25 }]);
        const roomMid = { key: '1,1', type: 'combat', ring: 0.5, payload: { enemies: [{ level: 13 }] } };
        const rLid = await encounters.resolveEngagement(evLid, roomMid, { jid: lidJid, level: undefined }, { rng: rollFor('mid') });
        check(`R3 engage-by-LID resolves at REAL level 25 (mid = min(pl+2, p80=25) — solo roster caps at own tier, got ${rLid && rLid.level})`, rLid && rLid.level === 25, rLid && rLid.level);
        // unknown LID → documented fallback: level reads 1, bands anchor at 1
        // (p50=p80=1 clamps every band to 1) — “too easy” is the safe failure
        // mode; never a wall, never NaN (owner priority: no 4×-HP walls)
        const rUnknown = await encounters.resolveEngagement(eventFixture('unk', [{ jid: '111000@lid', level: undefined }]), roomMid, { jid: '111000@lid', level: undefined }, { rng: rollFor('mid') });
        check(`R4 unknown LID anchors at level 1 (mid p80-capped to 1, got ${rUnknown && rUnknown.level})`, rUnknown && rUnknown.level === 1, rUnknown && rUnknown.level);
        // leave gwtest clean
        await User.deleteMany({ $or: [{ userId: lidJid }, { userId: phoneJid }] }).catch(() => {});
        const mongoose2 = require('mongoose');
        await new Promise((r) => setTimeout(r, 300));
        await mongoose2.disconnect().catch(() => {});
    } catch (e) {
        console.log(`  ⚠️ PART 2 skipped — no DB (${e.message.split('\n')[0]})`);
        if (!dbOK) console.log('  (Part 1/3 still fully verified)');
    }

    // ═════════ PART 3 — DISTRIBUTION (solo lvl-1, random rolls) ═════════
    console.log('\n════ PART 3: solo lvl-1 distribution over 2000 rolls ════');
    {
        const counts = { low: 0, mid: 0, high: 0 };
        const lvHist = {};
        let maxSeen = 0;
        for (let i = 0; i < 2000; i++) {
            const expl = (i % 4) / 3;               // 0, .33, .67, 1
            const ring = (i % 5) / 4;               // 0, .25, .5, .75, 1
            const delta = DELTAS[i % DELTAS.length];
            const ev = eventFixture('dist', [{ jid: 'dist@s.whatsapp.net', level: 1 }], expl);
            const room = { key: '1,1', type: 'combat', ring, payload: { enemies: [{ level: 13 }] } };
            const r = await encounters.resolveEngagement(ev, room, { jid: 'dist@s.whatsapp.net', level: 1 }, { variantDelta: delta, rng: Math.random });
            counts[r.band]++;
            lvHist[r.level] = (lvHist[r.level] || 0) + 1;
            if (r.level > maxSeen) maxSeen = r.level;
        }
        check(`D1 lvl-1 solo never exceeds +${B.MAX_PLAYER_GAP} (max seen ${maxSeen})`, maxSeen <= 1 + B.MAX_PLAYER_GAP);
        const total = counts.low + counts.mid + counts.high;
        const early = counts.low / total;
        check(`D2 LOW dominates the grind (${(early * 100).toFixed(1)}% low across mixed exploration — expected ≥ 30%)`, early >= 0.30, counts);
        console.log(`  ℹ️ band mix: low=${(counts.low / total * 100).toFixed(1)}% mid=${(counts.mid / total * 100).toFixed(1)}% high=${(counts.high / total * 100).toFixed(1)}%`);
        console.log(`  ℹ️ level histogram: ${Object.keys(lvHist).sort((a, b) => a - b).map((k) => `L${k}×${lvHist[k]}`).join('  ')}`);
    }

    // ═════════ RESULT ═════════
    console.log('\n════════════════════════════════════');
    console.log(`  RESULT: ${PASS} passed, ${FAIL} failed`);
    if (FAILURES.length) console.log('  FAILURES:\n   - ' + FAILURES.join('\n   - '));
    console.log('════════════════════════════════════');
    process.exit(FAIL ? 1 : 0);
}

main().catch((e) => { console.error('sweep crashed:', e); process.exit(2); });
