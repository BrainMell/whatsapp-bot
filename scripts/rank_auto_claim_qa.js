#!/usr/bin/env node
// 🎯 RANK AUTO-CLAIM QA — owner live-test report #12 (Test Run 2):
// thefirstloser "+234 913 207 2544" — "do not forget the rank issues",
// Mellow: "So you arent moving from D rank even tho you've meet the requirements?"
//
// ROOT CAUSE (prod census 2026-10-07): both D-rank players had missions=[]
// and the D→C gate trial (Trial of Combat: 20 quest wins / 5 bosses / 3
// duel wins) could only be completed via the hidden `rank mission claim`
// verb — nothing told anyone it existed. A player who had earned every
// objective stayed pinned at D forever.
//
// FIX UNDER TEST (economy.updateAdventurerRank):
//   R1 headline auto-claim — all objectives met (pvpWins at TOP LEVEL,
//      the shape pvpSystem writes) → trial completes AND promotion lands
//      in ONE call, persisted.
//   R2 honest block — objectives NOT all met → stays D, blocked_by_mission.
//   R3 stats-shape pvpWins (user.stats.pvpWins) also counts.
//   R9 max-merge — counts split across BOTH doc shapes take the higher one.
//   R4 free gate unaffected — F→E promotes with no trial.
//   R5 legacy manual path — missions pre-seeded [1] → still promotes.
//   R6 no downgrade / no re-promote on the next check.
//   R7 claimRankMission after auto-claim is a graceful no-op (rank moved on).
//   R8 blocked claim reply lists the missing objective progress.
//   R10 `.j rank` END-TO-END (prod incident 2026-10-07 13:28Z — Mellow
//      "Can't even check rank anymore", joker replied "❌ Failed to fetch
//      rank data." to EVERY player): the card-truth edit read gateCaption
//      outside its block, so every SUCCESSFUL Go render threw
//      ReferenceError. The checks below stub the Go renderer and run the
//      REAL handler — card path, overflow caption, trial line, and the
//      renderer-down text fallback — closing the QA gap that let it ship.
// Runs against a throwaway DB (gwqa_rank) — production data untouched.
const fs = require('fs');
const path = require('path');

let PASS = 0, FAIL = 0;
function check(name, cond, extra) {
    if (cond) { PASS++; console.log(`  ✅ ${name}`); }
    else { FAIL++; console.log(`  ❌ ${name}${extra !== undefined ? ' — ' + JSON.stringify(extra) : ''}`); }
}

(async () => {
    const envPath = path.join(__dirname, '..', '.env');
    if (fs.existsSync(envPath)) {
        for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
            const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
            if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2];
        }
    }
    process.env.MONGO_URI = (process.env.MONGO_URI || '').replace(/\/[^/?]+(\?|$)/, '/gwqa_rank$1');
    const mongoose = require('mongoose');
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 15000 });
    console.log(`[qa] db: ${mongoose.connection.name}`);
    const User = require('../core/models/User');
    const economy = require('../core/rpg/economy');

    const mk = (jid, over) => ({
        userId: jid, wallet: 100, registered: true, nickname: jid.slice(0, 8),
        adventurerRank: 'D', questsCompleted: 62, questsWon: 32,
        stats: { questsWon: 32, bossesDefeated: 37 },
        progression: { xp: 5000, level: 51, gp: 12, totalGP: 12, statPoints: 0, allocatedStats: {} },
        ...over,
    });
    const J = {
        hero: '15551110001@s.whatsapp.net',   // R1 headline
        short: '15551110002@s.whatsapp.net',  // R2 honest block (pvp 2)
        statShape: '15551110003@s.whatsapp.net', // R3 pvp in stats
        split: '15551110006@s.whatsapp.net',  // R9 split shapes (stats 1 + top 3)
        free: '15551110004@s.whatsapp.net',   // R4 F→E
        legacy: '15551110005@s.whatsapp.net', // R5 missions pre-done
        card: '15551110007@s.whatsapp.net',   // R10a/b card path (promotes)
        cardShort: '15551110008@s.whatsapp.net', // R10c/d unmet trial + fallback
    };
    for (const jid of Object.values(J)) await User.deleteMany({ userId: jid });
    await User.create([
        mk(J.hero, { pvpWins: 3 }),
        mk(J.short, { pvpWins: 2 }),
        mk(J.statShape, { stats: { questsWon: 32, bossesDefeated: 37, pvpWins: 3 } }),
        mk(J.split, { pvpWins: 3, stats: { questsWon: 32, bossesDefeated: 37, pvpWins: 1 } }),
        mk(J.free, { adventurerRank: 'F', questsCompleted: 12, questsWon: 12, level: undefined, progression: { xp: 900, level: 12, gp: 3, totalGP: 3, statPoints: 0, allocatedStats: {} }, stats: { questsWon: 12 } }),
        mk(J.legacy, { pvpWins: 3, completedRankMissions: [1] }),
    ]);
    await economy.loadEconomy();
    check('economy cache loaded', economy.getUser(J.hero) && economy.getUser(J.hero).adventurerRank === 'D');

    // ── R1: headline auto-claim + promotion in ONE call ──
    const r1 = await economy.updateAdventurerRank(J.hero);
    check('R1 ranked_up', !!(r1 && r1.ranked_up), r1);
    check('R1 new rank is C', r1 && r1.new_rank === 'C', r1 && r1.new_rank);
    const db1 = await User.findOne({ userId: J.hero }).lean();
    check('R1 persisted rank C', db1.adventurerRank === 'C', db1.adventurerRank);
    check('R1 trial 1 auto-completed to DB', (db1.completedRankMissions || []).includes(1), db1.completedRankMissions);

    // ── R2: incomplete trial blocks honestly ──
    const r2 = await economy.updateAdventurerRank(J.short);
    check('R2 stays at D', r2 && !r2.ranked_up && r2.rank === 'D', r2);
    check('R2 blocked_by_mission is Trial of Combat', r2 && r2.blocked_by_mission && r2.blocked_by_mission.id === 1, r2 && r2.blocked_by_mission && r2.blocked_by_mission.name);
    const db2 = await User.findOne({ userId: J.short }).lean();
    check('R2 DB rank unchanged D + no missions', db2.adventurerRank === 'D' && (db2.completedRankMissions || []).length === 0, { r: db2.adventurerRank, m: db2.completedRankMissions });

    // ── R3: pvpWins stored in user.stats also counts ──
    const r3 = await economy.updateAdventurerRank(J.statShape);
    check('R3 stats-shape pvpWins promotes', !!(r3 && r3.ranked_up && r3.new_rank === 'C'), r3 && { up: r3.ranked_up, to: r3.new_rank });

    // ── R9: counts split across both doc shapes take the MAX ──
    const r9 = await economy.updateAdventurerRank(J.split);
    check('R9 max-merge promotes (max(1,3)=3)', !!(r9 && r9.ranked_up && r9.new_rank === 'C'), r9 && { up: r9.ranked_up, to: r9.new_rank });

    // ── R4: free gate (F→E) unaffected by trial logic ──
    const r4 = await economy.updateAdventurerRank(J.free);
    check('R4 F→E promotes with no trial', !!(r4 && r4.ranked_up && r4.new_rank === 'E'), r4 && { up: r4.ranked_up, to: r4.new_rank });

    // ── R5: pre-completed mission (legacy manual claim path) still promotes ──
    const r5 = await economy.updateAdventurerRank(J.legacy);
    check('R5 legacy missions[1] promotes', !!(r5 && r5.ranked_up && r5.new_rank === 'C'), r5 && { up: r5.ranked_up, to: r5.new_rank });

    // ── R6: re-check after promotion = stable, no downgrade, no re-announce ──
    const r6 = await economy.updateAdventurerRank(J.hero);
    check('R6 re-check: no re-promote', r6 && !r6.ranked_up && r6.rank === 'C', r6);

    // ── R7: manual claim after auto-claim is a graceful no-op ──
    const r7 = await economy.claimRankMission(J.hero);
    check('R7 claim after auto-claim is graceful', r7 && r7.success === false && /already|No rank mission/i.test(r7.message || ''), r7 && r7.message);

    // ── R8: blocked claim reply lists missing objective progress ──
    const r8 = await economy.claimRankMission(J.short);
    check('R8 blocked claim lists PvP 2/3', r8 && r8.success === false && /2\/3/.test(r8.message || ''), r8 && r8.message);

    // ── R10: `.j rank` end-to-end with the REAL handler ──
    // The prod incident: successful card render → caption build hit the
    // out-of-scope gateCaption → ReferenceError → outer catch → error text.
    // Stub the Go renderer (mutate the cached module's method so the
    // handler's lazy require sees it) and assert on captured sends.
    const { handleRankCommand } = require('../core/commands/progressionCommands');
    const goService = require('../core/utils/goImageService');
    const origRender = goService.generatePortraitCard;
    const fakeJpeg = Buffer.alloc(2048, 0x7f);
    const mkSock = () => { const sends = []; return { sends, sendMessage: async (jid, content, opts) => { sends.push({ jid, content, opts }); } }; };
    const mQ = {};
    try {
        // R10a: successful render + auto-promotion in the SAME call
        await User.create(mk(J.card, { pvpWins: 3 }));
        goService.generatePortraitCard = async () => fakeJpeg;
        const s1 = mkSock();
        await handleRankCommand(s1, 'chat-rank', J.card, mQ);
        const img1 = s1.sends.find((x) => x.content && x.content.image);
        check('R10a .j rank sends the CARD (not Failed-to-fetch)', !!img1, s1.sends.map((x) => Object.keys(x.content || {})));
        check('R10a caption shows post-promotion C-Rank', !!(img1 && /C-Rank/.test(img1.content.caption || '')), img1 && img1.content.caption);
        // R10b: 5 progress bars (level/quests/3 objectives) → 2 overflow to caption
        check('R10b overflow objectives ride the caption', !!(img1 && /Also required:/.test(img1.content.caption || '')), img1 && (img1.content.caption || '').slice(-160));
    } catch (e) { check('R10a/b handler ran clean', false, e && e.message); }

    try {
        // R10c: unmet trial — the trial line spells out the gate in the caption
        await User.create(mk(J.cardShort, { pvpWins: 2 }));
        const s2 = mkSock();
        await handleRankCommand(s2, 'chat-rank', J.cardShort, mQ);
        const img2 = s2.sends.find((x) => x.content && x.content.image);
        check('R10c unmet-trial card still renders', !!img2, s2.sends.map((x) => Object.keys(x.content || {})));
        check('R10c caption names Trial of Combat with 2/3', !!(img2 && /Trial of Combat/.test(img2.content.caption || '') && /2\/3/.test(img2.content.caption || '')), img2 && img2.content.caption);
    } catch (e) { check('R10c handler ran clean', false, e && e.message); }

    try {
        // R10d: renderer down → legacy TEXT fallback, never the error toast
        const s3 = mkSock();
        goService.generatePortraitCard = async () => { throw new Error('renderer down'); };
        await handleRankCommand(s3, 'chat-rank', J.cardShort, mQ);
        const txt3 = s3.sends.find((x) => x.content && typeof x.content.text === 'string');
        check('R10d renderer-down falls back to TEXT rank card', !!(txt3 && /YOUR RANK/.test(txt3.content.text)), txt3 && (txt3.content.text || '').slice(0, 80));
        check('R10d no Failed-to-fetch toast anywhere', s3.sends.every((x) => !/Failed to fetch rank data/.test((x.content && x.content.text) || '')));
    } catch (e) { check('R10d handler ran clean', false, e && e.message); }
    finally { goService.generatePortraitCard = origRender; }

    console.log(`\n═══ RANK AUTO-CLAIM QA: ${PASS} passed, ${FAIL} failed ═══`);
    await mongoose.disconnect();
    process.exit(FAIL ? 1 : 0);
})().catch((e) => { console.error('[qa] FATAL', e); process.exit(1); });
